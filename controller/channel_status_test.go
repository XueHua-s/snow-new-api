package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

func TestParseChannelStatusWindow(t *testing.T) {
	tests := []struct {
		name      string
		raw       string
		want      int
		wantError bool
	}{
		{name: "default", raw: "", want: 60},
		{name: "five minutes", raw: "300", want: 300},
		{name: "seven days", raw: "604800", want: 604800},
		{name: "unsupported", raw: "120", wantError: true},
		{name: "not a number", raw: "abc", wantError: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := parseChannelStatusWindow(test.raw)
			if test.wantError {
				if err == nil {
					t.Fatal("expected an error")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != test.want {
				t.Fatalf("window = %d, want %d", got, test.want)
			}
		})
	}
}

func TestFetchChannelStatus(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("window"); got != "300" {
			t.Fatalf("window query = %q, want 300", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"generated_ms":123,"window_seconds":300,"overall_ttft_ms":1500,"models":[{"model":"gpt-test","section":"default","family":"GPT","success_rate":99.5,"request_state":"active"}]}`))
	}))
	defer upstream.Close()

	pulse, err := fetchChannelStatus(context.Background(), upstream.Client(), upstream.URL, 300)
	if err != nil {
		t.Fatalf("fetchChannelStatus() error = %v", err)
	}
	if pulse.WindowSeconds != 300 || len(pulse.Models) != 1 {
		t.Fatalf("unexpected pulse: %+v", pulse)
	}
	if pulse.Models[0].Model != "gpt-test" {
		t.Fatalf("model = %q, want gpt-test", pulse.Models[0].Model)
	}
}

func TestBuildChannelStatusModelsUsesPricingCatalog(t *testing.T) {
	models := []ChannelStatusModel{
		{Model: "gpt-5.6-sol", Section: "PROMAX", AverageTTFT: 9000},
		{Model: "gpt-5.6-sol", Section: "普通分组", AverageTTFT: 2000},
		{Model: "claude-opus-5", Section: "普通分组"},
		{Model: "grok-4.6"},
		{Model: "claude-opus-4-8"},
	}
	pricing := []model.Pricing{
		{ModelName: "gpt-5.6-sol", VendorID: 1, EnableGroup: []string{"svip", "default"}},
		{ModelName: "claude-opus-5", VendorID: 2, EnableGroup: []string{"default", "svip"}},
		{ModelName: "deepseek-v4-flash", VendorID: 3, EnableGroup: []string{"default"}},
	}
	vendors := []model.PricingVendor{
		{ID: 1, Name: "OpenAI"},
		{ID: 2, Name: "Anthropic"},
		{ID: 3, Name: "Venice AI"},
	}

	filtered := buildChannelStatusModels(models, pricing, vendors)
	if len(filtered) != 3 {
		t.Fatalf("filtered model count = %d, want 3", len(filtered))
	}
	if filtered[0].Model != "claude-opus-5" || filtered[1].Model != "gpt-5.6-sol" || filtered[2].Model != "deepseek-v4-flash" {
		t.Fatalf("unexpected filtered models: %+v", filtered)
	}
	if filtered[1].AverageTTFT != 2000 {
		t.Fatalf("preferred TTFT = %d, want ordinary-group value 2000", filtered[1].AverageTTFT)
	}
	if filtered[1].Section != "available" || filtered[1].Family != "OpenAI" {
		t.Fatalf("unexpected normalized GPT model: %+v", filtered[1])
	}
	if filtered[0].Family != "Anthropic" || filtered[2].Family != "Venice AI" {
		t.Fatalf("models should use pricing vendors: %+v", filtered)
	}
	if strings.Join(filtered[1].Groups, ",") != "default,svip" {
		t.Fatalf("ordered groups = %v, want [default svip]", filtered[1].Groups)
	}
	if filtered[2].RequestState != "no_requests" || filtered[2].Health != "idle" {
		t.Fatalf("missing telemetry should synthesize idle model: %+v", filtered[2])
	}
}

func TestChannelStatusWebSocketSnapshotAndHeartbeat(t *testing.T) {
	gin.SetMode(gin.TestMode)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"generated_ms":123,"window_seconds":60,"models":[]}`))
	}))
	defer upstream.Close()

	router := gin.New()
	router.GET("/api/channel-status/ws", func(c *gin.Context) {
		serveChannelStatusWebSocket(
			c,
			upstream.URL,
			upstream.Client(),
			func() []model.Pricing {
				return []model.Pricing{{ModelName: "gpt-test"}}
			},
			func() []model.PricingVendor { return nil },
		)
	})
	server := httptest.NewServer(router)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/channel-status/ws?window=60"
	headers := http.Header{}
	headers.Set("Origin", server.URL)
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()
	if err = conn.SetReadDeadline(time.Now().Add(3 * time.Second)); err != nil {
		t.Fatalf("set read deadline: %v", err)
	}

	seenSnapshot := false
	seenHeartbeat := false
	for !seenSnapshot || !seenHeartbeat {
		_, payload, readErr := conn.ReadMessage()
		if readErr != nil {
			t.Fatalf("read websocket message: %v", readErr)
		}
		var message channelStatusWebSocketMessage
		if err = common.Unmarshal(payload, &message); err != nil {
			t.Fatalf("decode websocket message: %v", err)
		}
		switch message.Type {
		case "snapshot":
			seenSnapshot = message.Data != nil
		case "heartbeat":
			seenHeartbeat = message.Timestamp > 0
		}
	}
}

func TestChannelStatusOriginCheck(t *testing.T) {
	tests := []struct {
		name    string
		host    string
		origin  string
		allowed bool
	}{
		{
			name:    "same host",
			host:    "new-api.example",
			origin:  "https://new-api.example",
			allowed: true,
		},
		{
			name:    "proxy removed request port",
			host:    "new-api.example",
			origin:  "https://new-api.example:3000",
			allowed: true,
		},
		{
			name:    "request includes port",
			host:    "new-api.example:3000",
			origin:  "https://new-api.example",
			allowed: true,
		},
		{
			name:    "cross host",
			host:    "new-api.example",
			origin:  "https://attacker.example:3000",
			allowed: false,
		},
		{
			name:    "invalid origin",
			host:    "new-api.example",
			origin:  "://invalid",
			allowed: false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			req := httptest.NewRequest(
				http.MethodGet,
				"http://new-api.example/api/channel-status/ws",
				nil,
			)
			req.Host = test.host
			req.Header.Set("Origin", test.origin)
			if got := isChannelStatusOriginAllowed(req); got != test.allowed {
				t.Fatalf("allowed = %t, want %t", got, test.allowed)
			}
		})
	}
}
