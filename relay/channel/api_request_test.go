package channel

import (
	"encoding/base64"
	"errors"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Initialize Gin before any parallel test starts.
func init() {
	gin.SetMode(gin.TestMode)
}

func TestProcessHeaderOverride_ChannelTestSkipsPassthroughRules(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	ctx.Request.Header.Set("X-Trace-Id", "trace-123")

	info := &relaycommon.RelayInfo{
		IsChannelTest: true,
		ChannelMeta: &relaycommon.ChannelMeta{
			HeadersOverride: map[string]any{
				"*": "",
			},
		},
	}

	headers, err := processHeaderOverride(info, ctx)
	require.NoError(t, err)
	require.Empty(t, headers)
}

func TestProcessHeaderOverride_ChannelTestSkipsClientHeaderPlaceholder(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	ctx.Request.Header.Set("X-Trace-Id", "trace-123")

	info := &relaycommon.RelayInfo{
		IsChannelTest: true,
		ChannelMeta: &relaycommon.ChannelMeta{
			HeadersOverride: map[string]any{
				"X-Upstream-Trace": "{client_header:X-Trace-Id}",
			},
		},
	}

	headers, err := processHeaderOverride(info, ctx)
	require.NoError(t, err)
	_, ok := headers["x-upstream-trace"]
	require.False(t, ok)
}

func TestProcessHeaderOverride_NonTestKeepsClientHeaderPlaceholder(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	ctx.Request.Header.Set("X-Trace-Id", "trace-123")

	info := &relaycommon.RelayInfo{
		IsChannelTest: false,
		ChannelMeta: &relaycommon.ChannelMeta{
			HeadersOverride: map[string]any{
				"X-Upstream-Trace": "{client_header:X-Trace-Id}",
			},
		},
	}

	headers, err := processHeaderOverride(info, ctx)
	require.NoError(t, err)
	require.Equal(t, "trace-123", headers["x-upstream-trace"])
}

func TestProcessHeaderOverride_RuntimeOverrideIsFinalHeaderMap(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)

	info := &relaycommon.RelayInfo{
		IsChannelTest:             false,
		UseRuntimeHeadersOverride: true,
		RuntimeHeadersOverride: map[string]any{
			"x-static":  "runtime-value",
			"x-runtime": "runtime-only",
		},
		ChannelMeta: &relaycommon.ChannelMeta{
			HeadersOverride: map[string]any{
				"X-Static": "legacy-value",
				"X-Legacy": "legacy-only",
			},
		},
	}

	headers, err := processHeaderOverride(info, ctx)
	require.NoError(t, err)
	require.Equal(t, "runtime-value", headers["x-static"])
	require.Equal(t, "runtime-only", headers["x-runtime"])
	_, exists := headers["x-legacy"]
	require.False(t, exists)
}

func TestProcessHeaderOverride_PassthroughSkipsAcceptEncoding(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	ctx.Request.Header.Set("X-Trace-Id", "trace-123")
	ctx.Request.Header.Set("Accept-Encoding", "gzip")

	info := &relaycommon.RelayInfo{
		IsChannelTest: false,
		ChannelMeta: &relaycommon.ChannelMeta{
			HeadersOverride: map[string]any{
				"*": "",
			},
		},
	}

	headers, err := processHeaderOverride(info, ctx)
	require.NoError(t, err)
	require.Equal(t, "trace-123", headers["x-trace-id"])

	_, hasAcceptEncoding := headers["accept-encoding"]
	require.False(t, hasAcceptEncoding)
}

func TestProcessHeaderOverride_PassHeadersTemplateSetsRuntimeHeaders(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	ctx.Request.Header.Set("Originator", "Codex CLI")
	ctx.Request.Header.Set("Session_id", "sess-123")

	info := &relaycommon.RelayInfo{
		IsChannelTest: false,
		RequestHeaders: map[string]string{
			"Originator": "Codex CLI",
			"Session_id": "sess-123",
		},
		ChannelMeta: &relaycommon.ChannelMeta{
			ParamOverride: map[string]any{
				"operations": []any{
					map[string]any{
						"mode":  "pass_headers",
						"value": []any{"Originator", "Session_id", "X-Codex-Beta-Features"},
					},
				},
			},
			HeadersOverride: map[string]any{
				"X-Static": "legacy-value",
			},
		},
	}

	_, err := relaycommon.ApplyParamOverrideWithRelayInfo([]byte(`{"model":"gpt-4.1"}`), info)
	require.NoError(t, err)
	require.True(t, info.UseRuntimeHeadersOverride)
	require.Equal(t, "Codex CLI", info.RuntimeHeadersOverride["originator"])
	require.Equal(t, "sess-123", info.RuntimeHeadersOverride["session_id"])
	_, exists := info.RuntimeHeadersOverride["x-codex-beta-features"]
	require.False(t, exists)
	require.Equal(t, "legacy-value", info.RuntimeHeadersOverride["x-static"])

	headers, err := processHeaderOverride(info, ctx)
	require.NoError(t, err)
	require.Equal(t, "Codex CLI", headers["originator"])
	require.Equal(t, "sess-123", headers["session_id"])
	_, exists = headers["x-codex-beta-features"]
	require.False(t, exists)

	upstreamReq := httptest.NewRequest(http.MethodPost, "https://example.com/v1/responses", nil)
	applyHeaderOverrideToRequest(upstreamReq, headers)
	require.Equal(t, "Codex CLI", upstreamReq.Header.Get("Originator"))
	require.Equal(t, "sess-123", upstreamReq.Header.Get("Session_id"))
	require.Empty(t, upstreamReq.Header.Get("X-Codex-Beta-Features"))
}

func TestToWebSocketURL(t *testing.T) {
	for input, want := range map[string]string{
		"https://api.openai.com/v1/responses":             "wss://api.openai.com/v1/responses",
		"http://127.0.0.1:3000/v1/responses":              "ws://127.0.0.1:3000/v1/responses",
		"wss://chatgpt.com/backend-api/codex/responses":   "wss://chatgpt.com/backend-api/codex/responses",
		"ws://127.0.0.1:3000/backend-api/codex/responses": "ws://127.0.0.1:3000/backend-api/codex/responses",
	} {
		assert.Equal(t, want, toWebSocketURL(input), input)
	}
}

func TestCodexTransportRelayClassification(t *testing.T) {
	for _, sent := range []bool{false, true} {
		source := &service.CodexTransportError{Code: "upstream_io", Phase: "maybe_sent", MayHaveSent: sent}
		wrapped := &url.Error{Op: "Post", URL: "https://target.invalid/?SYNTHETIC_SECRET", Err: source}
		relayError := codexTransportRelayError(wrapped)
		require.NotNil(t, relayError)
		assert.True(t, types.IsSkipRetryError(relayError))
		assert.NotContains(t, relayError.Error(), "SYNTHETIC_SECRET")
		var retained *service.CodexTransportError
		require.ErrorAs(t, relayError, &retained)
		assert.Same(t, source, retained)
	}
	assert.Nil(t, codexTransportRelayError(errors.New("ordinary provider error")))
}

// Startup state is immutable: exercise enabled relay selection in a child test
// process instead of changing the production singleton underneath other tests.
type codexWSTestAdaptor struct{ Adaptor }

func (codexWSTestAdaptor) GetRequestURL(*relaycommon.RelayInfo) (string, error) {
	return "https://target.invalid/responses", nil
}
func (codexWSTestAdaptor) SetupRequestHeader(_ *gin.Context, header *http.Header, _ *relaycommon.RelayInfo) error {
	header.Set("Authorization", "Bearer synthetic")
	return nil
}

func TestCodexTransportRelaySelection(t *testing.T) {
	if os.Getenv("CODEX_TRANSPORT_TEST_CHILD") != "1" {
		for _, wsMode := range []string{"0", "1"} {
			child := exec.Command(os.Args[0], "-test.run=^TestCodexTransportRelaySelection$", "-test.timeout=30s")
			child.Env = append(os.Environ(), "CODEX_TRANSPORT_TEST_CHILD=1", "CODEX_TRANSPORT_TEST_WS="+wsMode)
			output, err := child.CombinedOutput()
			require.NoError(t, err, "%s", output)
		}
		return
	}
	root, err := filepath.EvalSymlinks(os.TempDir())
	require.NoError(t, err)
	dir, err := os.MkdirTemp(root, "codex-relay-")
	require.NoError(t, err)
	defer os.RemoveAll(dir)
	require.NoError(t, os.Chmod(dir, 0700))
	socket := filepath.Join(dir, "s")
	listener, err := net.Listen("unix", socket)
	require.NoError(t, err)
	require.NoError(t, os.Chmod(socket, 0600))
	data, err := os.ReadFile("../../tools/codex-transport/fixtures/contracts.json")
	require.NoError(t, err)
	var fixture map[string]common.RawMessage
	require.NoError(t, common.Unmarshal(data, &fixture))
	var localRequests atomic.Int32
	var mode atomic.Int32
	observed := make(chan map[string]common.RawMessage, 4)
	routes := []string{"http"}
	if os.Getenv("CODEX_TRANSPORT_TEST_WS") == "1" {
		routes = append(routes, "ws")
	}
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/health" {
			data, err := common.Marshal(map[string]any{"version": 1, "profile": "0.162.1", "platform": "linux-arm64", "target": "aarch64-unknown-linux-gnu", "production": true, "purposes": []string{"api", "auth"}, "routes": routes, "proxy_schemes": []string{"http", "https", "socks5", "socks5h"}, "http_protocols": []string{"auto", "http1"}, "tls_insecure": false, "limits": fixture["health_limits"]})
			if err != nil {
				w.WriteHeader(500)
				return
			}
			_, _ = w.Write(data)
			return
		}
		localRequests.Add(1)
		data, err := base64.StdEncoding.DecodeString(r.Header.Get("X-Codex-Transport-Meta"))
		if err != nil {
			w.WriteHeader(500)
			return
		}
		var meta map[string]common.RawMessage
		if common.Unmarshal(data, &meta) != nil {
			w.WriteHeader(500)
			return
		}
		observed <- meta
		_, _ = io.Copy(io.Discard, r.Body)
		if mode.Load() == 2 {
			body := []byte(`{"error":{"message":"synthetic handshake rejected","type":"invalid_request_error","code":"synthetic_rejection"}}`)
			data, _ = common.Marshal(map[string]any{"version": 1, "status": 401, "headers": [][2]string{}, "content_length": int64(len(body)), "protocol": "HTTP/1.1", "rejection_body_b64": base64.StdEncoding.EncodeToString(body), "rejection_truncated": false, "rejection_read_error": false})
			w.Header().Set("X-Codex-Transport-Response", base64.StdEncoding.EncodeToString(data))
			w.Header().Set("Content-Length", "0")
			w.WriteHeader(200)
			return
		}
		if mode.Load() == 1 {
			data, _ = common.Marshal(map[string]any{"version": 1, "code": "upstream_io", "phase": "maybe_sent", "may_have_sent": true, "upstream_status": nil})
			w.Header().Set("X-Codex-Transport-Error", base64.StdEncoding.EncodeToString(data))
			w.WriteHeader(502)
			return
		}
		data, _ = common.Marshal(map[string]any{"version": 1, "status": 503, "headers": [][2]string{{"x-upstream", "b2s="}}, "content_length": int64(4), "protocol": "HTTP/2.0"})
		w.Header().Set("X-Codex-Transport-Response", base64.StdEncoding.EncodeToString(data))
		w.Header().Set("Trailer", "X-Codex-Transport-Complete")
		_, _ = io.WriteString(w, "busy")
		w.Header().Set("X-Codex-Transport-Complete", "1")
	})}
	go func() { _ = server.Serve(listener) }()
	defer server.Close()
	common.CodexTransportEnabled = true
	common.CodexTransportSocket = socket
	common.CodexTransportProfile = "0.162.1"
	common.CodexTransportCAFile = ""
	common.RelayIdleConnTimeout = 90
	common.RelayMaxIdleConns = 500
	common.RelayMaxIdleConnsPerHost = 100
	common.RelayTimeout = 0
	common.TLSInsecureSkipVerify = false
	constant.MaxRequestBodyMB = 128
	service.InitHttpClient()
	require.NoError(t, service.InitCodexTransport())
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest("POST", "/v1/responses", strings.NewReader("body"))
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelType: constant.ChannelTypeCodex}}
	if os.Getenv("CODEX_TRANSPORT_TEST_WS") == "1" {
		mode.Store(2)
		_, err := DoWssRequest(codexWSTestAdaptor{}, ctx, info, nil)
		var apiErr *types.NewAPIError
		require.ErrorAs(t, err, &apiErr)
		assert.Equal(t, 401, apiErr.StatusCode)
		assert.ErrorContains(t, apiErr, "synthetic handshake rejected")
		assert.True(t, types.IsSkipRetryError(apiErr))
		assert.Equal(t, int32(1), localRequests.Load())
		<-observed
		mode.Store(1)
		_, err = DoWssRequest(codexWSTestAdaptor{}, ctx, info, nil)
		require.ErrorAs(t, err, &apiErr)
		var transportErr *service.CodexTransportError
		require.ErrorAs(t, err, &transportErr)
		assert.True(t, types.IsSkipRetryError(apiErr))
		assert.Equal(t, int32(2), localRequests.Load())
		return
	}
	req, err := http.NewRequest("POST", "https://target.invalid/responses?SYNTHETIC_SECRET", strings.NewReader("body"))
	require.NoError(t, err)
	applyHeaderOverrideToRequest(req, map[string]string{"Authorization": "Bearer synthetic-override", "X-Codex-Transport-Meta": "forged"})
	response, err := doRequest(ctx, req, info)
	require.NoError(t, err)
	assert.Equal(t, 503, response.StatusCode)
	body, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	response.Body.Close()
	assert.Equal(t, "busy", string(body))
	assert.Equal(t, int32(1), localRequests.Load())
	meta := <-observed
	var headers [][2]string
	require.NoError(t, common.Unmarshal(meta["headers"], &headers))
	assert.Contains(t, headers, [2]string{"authorization", base64.StdEncoding.EncodeToString([]byte("Bearer synthetic-override"))})
	for _, header := range headers {
		assert.NotEqual(t, "x-codex-transport-meta", header[0])
	}
	mode.Store(1)
	req, err = http.NewRequest("POST", "https://target.invalid/responses?SYNTHETIC_SECRET", strings.NewReader("body"))
	require.NoError(t, err)
	_, err = doRequest(ctx, req, info)
	var relayErr *types.NewAPIError
	require.ErrorAs(t, err, &relayErr)
	assert.True(t, types.IsSkipRetryError(relayErr))
	assert.NotContains(t, err.Error(), "SYNTHETIC_SECRET")
	assert.Equal(t, int32(2), localRequests.Load())
	<-observed
	// Enabled Codex WS cannot silently take the existing direct dialer.
	_, err = DoWssRequest(codexWSTestAdaptor{}, ctx, info, nil)
	require.ErrorAs(t, err, &relayErr)
	assert.True(t, types.IsSkipRetryError(relayErr))
	assert.Equal(t, int32(2), localRequests.Load())
	directCount := atomic.Int32{}
	direct := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { directCount.Add(1); _, _ = io.WriteString(w, "ordinary") }))
	defer direct.Close()
	for _, channelType := range []int{constant.ChannelTypeOpenAI, constant.ChannelTypeClaudeOAuth} {
		info.ChannelType = channelType
		req, err = http.NewRequest("POST", direct.URL, strings.NewReader("body"))
		require.NoError(t, err)
		response, err = doRequest(ctx, req, info)
		require.NoError(t, err)
		body, err = io.ReadAll(response.Body)
		require.NoError(t, err)
		response.Body.Close()
		assert.Equal(t, "ordinary", string(body))
	}
	assert.Equal(t, int32(2), directCount.Load())
	assert.Equal(t, int32(2), localRequests.Load())
}
