package controller

import (
	"context"
	"encoding/base64"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
)

func TestBuildChannelStatusCodexUsageSanitizesAndNormalizes(t *testing.T) {
	body := []byte(`{
		"plan_type":"pro",
		"email":"private@example.com",
		"account_id":"acct-secret",
		"rate_limit":{
			"allowed":true,
			"limit_reached":false,
			"primary_window":{"used_percent":0,"reset_at":10,"reset_after_seconds":18000,"limit_window_seconds":18000},
			"secondary_window":{"used_percent":13,"reset_at":20,"reset_after_seconds":500000,"limit_window_seconds":604800}
		},
		"additional_rate_limits":[{
			"limit_name":"GPT-5.3-Codex-Spark",
			"metered_feature":"codex_bengalfox",
			"rate_limit":{
				"allowed":true,
				"primary_window":{"used_percent":1,"limit_window_seconds":18000},
				"secondary_window":{"used_percent":2,"limit_window_seconds":604800}
			}
		}]
	}`)

	item := buildChannelStatusCodexUsage("Codex Pro", 200, body, nil)
	if item.PlanType != "pro" || item.Available == nil || !*item.Available {
		t.Fatalf("unexpected account summary: %+v", item)
	}
	if item.BaseLimit.FiveHourWindow == nil || item.BaseLimit.FiveHourWindow.LimitWindow != 18000 {
		t.Fatalf("unexpected five-hour window: %+v", item.BaseLimit.FiveHourWindow)
	}
	if item.BaseLimit.WeeklyWindow == nil || item.BaseLimit.WeeklyWindow.UsedPercent != 13 {
		t.Fatalf("unexpected weekly window: %+v", item.BaseLimit.WeeklyWindow)
	}
	if len(item.AdditionalLimits) != 1 || item.AdditionalLimits[0].MeteredFeature != "codex_bengalfox" {
		t.Fatalf("unexpected additional limits: %+v", item.AdditionalLimits)
	}

	encoded, err := common.Marshal(item)
	if err != nil {
		t.Fatalf("marshal sanitized item: %v", err)
	}
	serialized := string(encoded)
	for _, sensitive := range []string{"private@example.com", "acct-secret", "email", "account_id"} {
		if strings.Contains(serialized, sensitive) {
			t.Fatalf("sanitized payload leaked %q: %s", sensitive, serialized)
		}
	}
}

func TestResolveCodexUsageWindowsFreePlanUsesWeeklyOnly(t *testing.T) {
	fiveHour, weekly := resolveCodexUsageWindows("free", codexUsageUpstreamRateLimit{
		PrimaryWindow: &codexUsageUpstreamWindow{
			UsedPercent: 42,
			LimitWindow: 7 * 24 * 60 * 60,
		},
	})
	if fiveHour != nil {
		t.Fatalf("free plan five-hour window = %+v, want nil", fiveHour)
	}
	if weekly == nil || weekly.UsedPercent != 42 {
		t.Fatalf("free plan weekly window = %+v", weekly)
	}
}

func TestIsChannelStatusCodexOAuthChannel(t *testing.T) {
	valid := &model.Channel{
		Type: constant.ChannelTypeCodex,
		Key:  `{"access_token":"access","account_id":"account","type":"codex"}`,
	}
	if !isChannelStatusCodexOAuthChannel(valid) {
		t.Fatal("valid single-key Codex OAuth channel should be included")
	}

	quotaChannel := &model.Channel{Type: constant.ChannelTypeOpenAI, Key: "sk-quota"}
	if isChannelStatusCodexOAuthChannel(quotaChannel) {
		t.Fatal("quota API-key channel should be excluded")
	}

	multiKey := *valid
	multiKey.ChannelInfo.IsMultiKey = true
	if isChannelStatusCodexOAuthChannel(&multiKey) {
		t.Fatal("multi-key Codex channel should be excluded")
	}
}

func TestCodexTransportManagementController(t *testing.T) {
	if os.Getenv("CODEX_MANAGEMENT_CHILD") != "1" {
		command := exec.Command(os.Args[0], "-test.run=^TestCodexTransportManagementController$", "-test.timeout=60s")
		command.Env = append(os.Environ(), "CODEX_MANAGEMENT_CHILD=1")
		output, err := command.CombinedOutput()
		require.NoError(t, err, "%s", output)
		return
	}
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Ability{}))
	base := "https://synthetic.invalid"
	channel := &model.Channel{Name: "management", Type: constant.ChannelTypeCodex, BaseURL: &base, Key: `{"access_token":"old-access","refresh_token":"synthetic-refresh","account_id":"synthetic-account"}`}
	require.NoError(t, db.Create(channel).Error)
	root, err := filepath.EvalSymlinks(os.TempDir())
	require.NoError(t, err)
	directory, err := os.MkdirTemp(root, "codex-manage-")
	require.NoError(t, err)
	defer os.RemoveAll(directory)
	socket := filepath.Join(directory, "s")
	listener, err := net.Listen("unix", socket)
	require.NoError(t, err)
	require.NoError(t, os.Chmod(socket, 0600))
	fixtureBytes, err := os.ReadFile("../tools/codex-transport/fixtures/contracts.json")
	require.NoError(t, err)
	var fixture map[string]common.RawMessage
	require.NoError(t, common.Unmarshal(fixtureBytes, &fixture))
	var mode atomic.Int32
	var calls atomic.Int32
	var authCalls atomic.Int32
	firstRequest := make(chan struct{}, 1)
	respondUnauthorized := make(chan struct{})
	var redeemIDs []string
	var requestsMu sync.Mutex
	sidecar := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/health" {
			data, _ := common.Marshal(map[string]any{"version": 1, "profile": "0.162.1", "platform": "linux-arm64", "target": "aarch64-unknown-linux-gnu", "production": true, "purposes": []string{"api", "auth"}, "routes": []string{"http"}, "proxy_schemes": []string{"http", "https", "socks5", "socks5h"}, "http_protocols": []string{"auto", "http1"}, "tls_insecure": false, "limits": fixture["health_limits"]})
			_, _ = w.Write(data)
			return
		}
		calls.Add(1)
		var meta struct {
			Purpose string      `json:"purpose"`
			URL     string      `json:"url"`
			Headers [][2]string `json:"headers"`
		}
		data, err := base64.StdEncoding.DecodeString(r.Header.Get("X-Codex-Transport-Meta"))
		if err != nil || common.Unmarshal(data, &meta) != nil {
			w.WriteHeader(500)
			return
		}
		body, _ := io.ReadAll(r.Body)
		response, status := `{"ok":true}`, 200
		if meta.Purpose == "auth" {
			authCalls.Add(1)
			response = `{"access_token":"new-access","refresh_token":"new-refresh","expires_in":3600}`
			if mode.Load() == 3 {
				_ = db.Model(channel).Update("key", `{"access_token":"manual-replacement"}`).Error
			}
		} else {
			if mode.Load() == 4 {
				firstRequest <- struct{}{}
				<-respondUnauthorized
				status = 401
			}
			if strings.HasSuffix(meta.URL, "/consume") {
				var request map[string]string
				_ = common.Unmarshal(body, &request)
				requestsMu.Lock()
				redeemIDs = append(redeemIDs, request["redeem_request_id"])
				requestsMu.Unlock()
			}
			if mode.Load() == 1 {
				for _, header := range meta.Headers {
					if strings.EqualFold(header[0], "authorization") {
						value, _ := base64.StdEncoding.DecodeString(header[1])
						if strings.Contains(string(value), "old-access") {
							status = 401
						}
					}
				}
			}
			if mode.Load() == 2 {
				data, _ := common.Marshal(map[string]any{"version": 1, "code": "upstream_io", "phase": "maybe_sent", "may_have_sent": true, "upstream_status": nil})
				w.Header().Set("X-Codex-Transport-Error", base64.StdEncoding.EncodeToString(data))
				w.WriteHeader(502)
				return
			}
		}
		data, _ = common.Marshal(map[string]any{"version": 1, "status": status, "headers": [][2]string{}, "content_length": len(response), "protocol": "HTTP/1.1"})
		w.Header().Set("X-Codex-Transport-Response", base64.StdEncoding.EncodeToString(data))
		w.Header().Set("Trailer", "X-Codex-Transport-Complete")
		_, _ = io.WriteString(w, response)
		w.Header().Set("X-Codex-Transport-Complete", "1")
	})}
	go func() { _ = sidecar.Serve(listener) }()
	defer sidecar.Close()
	common.CodexTransportEnabled = true
	common.CodexTransportSocket = socket
	common.CodexTransportProfile = "0.162.1"
	common.CodexTransportCAFile = ""
	common.TLSInsecureSkipVerify = false
	common.RelayTimeout = 0
	common.RelayIdleConnTimeout = 90
	common.RelayMaxIdleConns = 500
	common.RelayMaxIdleConnsPerHost = 100
	constant.MaxRequestBodyMB = 128
	service.InitHttpClient()
	require.NoError(t, service.InitCodexTransport())
	for _, handler := range []gin.HandlerFunc{GetCodexChannelUsage, GetCodexChannelRateLimitResetCredits} {
		recorder := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(recorder)
		c.Params = gin.Params{{Key: "id", Value: strconv.Itoa(channel.Id)}}
		c.Request = httptest.NewRequest(http.MethodGet, "/usage", nil)
		before := calls.Load()
		handler(c)
		assert.Contains(t, recorder.Body.String(), `"success":true`)
		assert.Equal(t, before+1, calls.Load())
	}
	before := calls.Load()
	status, _, err := fetchCodexChannelUsage(context.Background(), channel)
	require.NoError(t, err)
	assert.Equal(t, 200, status)
	assert.Equal(t, before+1, calls.Load())
	mode.Store(1)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Params = gin.Params{{Key: "id", Value: strconv.Itoa(channel.Id)}}
	c.Request = httptest.NewRequest(http.MethodPost, "/reset", nil)
	ResetCodexChannelUsage(c)
	assert.Contains(t, recorder.Body.String(), `"success":true`)
	assert.Equal(t, int32(1), authCalls.Load())
	requestsMu.Lock()
	require.Len(t, redeemIDs, 2)
	assert.NotEmpty(t, redeemIDs[0])
	assert.Equal(t, redeemIDs[0], redeemIDs[1])
	requestsMu.Unlock()
	mode.Store(2)
	before = calls.Load()
	_, _, err = fetchCodexChannelUsage(context.Background(), channel)
	require.Error(t, err)
	assert.Equal(t, before+1, calls.Load())
	assert.Equal(t, int32(1), authCalls.Load())
	mode.Store(3)
	_, _, err = service.RefreshCodexChannelCredential(context.Background(), channel.Id, service.CodexCredentialRefreshOptions{})
	require.ErrorContains(t, err, "changed during refresh")
	var saved model.Channel
	require.NoError(t, db.First(&saved, channel.Id).Error)
	assert.JSONEq(t, `{"access_token":"manual-replacement"}`, saved.Key)
	for _, entry := range []string{"wham", "consume", "aggregate", "models"} {
		for _, change := range []string{"key", "base_url", "setting"} {
			t.Run(entry+" rejects changed "+change+" before refresh", func(t *testing.T) {
				originalKey := `{"access_token":"old-access","refresh_token":"synthetic-refresh","account_id":"synthetic-account"}`
				require.NoError(t, db.Model(&model.Channel{}).Where("id = ?", channel.Id).Updates(map[string]any{"key": originalKey, "base_url": base, "setting": ""}).Error)
				snapshot, err := model.GetChannelById(channel.Id, true)
				require.NoError(t, err)
				mode.Store(4)
				beforeCalls, beforeAuth := calls.Load(), authCalls.Load()
				completed := make(chan struct{})
				go func() {
					defer close(completed)
					switch entry {
					case "aggregate":
						_, _, _ = fetchCodexChannelUsage(context.Background(), snapshot)
					case "models":
						_, _ = service.FetchCodexChannelModels(snapshot)
					default:
						recorder := httptest.NewRecorder()
						c, _ := gin.CreateTestContext(recorder)
						c.Params = gin.Params{{Key: "id", Value: strconv.Itoa(channel.Id)}}
						c.Request = httptest.NewRequest(http.MethodPost, "/management", nil)
						if entry == "consume" {
							ResetCodexChannelUsage(c)
						} else {
							GetCodexChannelUsage(c)
						}
					}
				}()
				<-firstRequest
				replacement := `{"access_token":"other-account-access","refresh_token":"other-account-refresh","account_id":"other-account"}`
				if change == "base_url" {
					replacement = "https://new-destination.invalid"
				}
				if change == "setting" {
					replacement = `{"proxy":"http://new-proxy.invalid:8080"}`
				}
				require.NoError(t, db.Model(&model.Channel{}).Where("id = ?", channel.Id).Update(change, replacement).Error)
				respondUnauthorized <- struct{}{}
				<-completed
				assert.Equal(t, beforeCalls+1, calls.Load(), "stale operation must not send another request")
				assert.Equal(t, beforeAuth, authCalls.Load(), "stale operation must not refresh replacement credentials")
			})
		}
	}

}
