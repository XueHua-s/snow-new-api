package controller

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/require"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestRelayDoesNotRetryAfterClientCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses", nil).WithContext(ctx)
	err := types.NewError(errors.New("upstream disconnected"), types.ErrorCodeDoRequestFailed)
	assert.False(t, shouldRetry(c, err, 3))
}

// Exercise the real controller retry loop, not a copy of its predicate. The
// child process owns immutable startup configuration and isolated database state.
func TestCodexTransportControllerRetryBudget(t *testing.T) {
	if os.Getenv("CODEX_CONTROLLER_RETRY_CHILD") != "1" {
		child := exec.Command(os.Args[0], "-test.run=^TestCodexTransportControllerRetryBudget$", "-test.timeout=60s")
		child.Env = append(os.Environ(), "CODEX_CONTROLLER_RETRY_CHILD=1")
		output, err := child.CombinedOutput()
		require.NoError(t, err, "%s", output)
		return
	}
	gin.SetMode(gin.TestMode)
	user, token := setupResponsesWSRequestTest(t)
	require.NoError(t, model.DB.Model(user).Update("setting", `{"billing_preference":"wallet_only"}`).Error)
	require.NoError(t, model.DB.AutoMigrate(&model.Channel{}, &model.Ability{}))
	constant.StreamingTimeout = 30
	constant.CountToken = false
	constant.ErrorLogEnabled = false
	common.LogConsumeEnabled = false
	common.BatchUpdateEnabled = false
	common.RetryTimes = 3
	ratio_setting.InitRatioSettings()
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"codex-transport-retry":0}`))
	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{"perf_metrics_setting.enabled": "false"}))
	baseURL := "https://synthetic.invalid"
	channel := &model.Channel{Name: "codex-transport-retry", Type: constant.ChannelTypeCodex, Status: common.ChannelStatusEnabled, Group: "default", Models: "codex-transport-retry", BaseURL: &baseURL, AutoBan: common.GetPointer(0), Key: `{"access_token":"synthetic-unused","account_id":"synthetic-account","expired":"2099-01-01T00:00:00Z"}`}
	require.NoError(t, model.DB.Create(channel).Error)
	require.NoError(t, model.DB.Create(&model.Ability{ChannelId: channel.Id, Model: "codex-transport-retry", Group: "default", Enabled: true}).Error)
	root, err := filepath.EvalSymlinks(os.TempDir())
	require.NoError(t, err)
	directory, err := os.MkdirTemp(root, "codex-retry-")
	require.NoError(t, err)
	defer os.RemoveAll(directory)
	require.NoError(t, os.Chmod(directory, 0700))
	socket := filepath.Join(directory, "s")
	listener, err := net.Listen("unix", socket)
	require.NoError(t, err)
	require.NoError(t, os.Chmod(socket, 0600))
	fixtureData, err := os.ReadFile("../tools/codex-transport/fixtures/contracts.json")
	require.NoError(t, err)
	var fixture map[string]common.RawMessage
	require.NoError(t, common.Unmarshal(fixtureData, &fixture))
	var attempts atomic.Int32
	var scenario atomic.Int32
	sidecar := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/health" {
			data, _ := common.Marshal(map[string]any{"version": 1, "profile": "0.162.1", "platform": "linux-arm64", "target": "aarch64-unknown-linux-gnu", "production": true, "purposes": []string{"api", "auth"}, "routes": []string{"http"}, "proxy_schemes": []string{"http", "https", "socks5", "socks5h"}, "http_protocols": []string{"auto", "http1"}, "tls_insecure": false, "limits": fixture["health_limits"]})
			_, _ = w.Write(data)
			return
		}
		attempts.Add(1)
		_, _ = io.Copy(io.Discard, r.Body)
		selected := scenario.Load()
		if selected == 3 {
			connection, _, err := w.(http.Hijacker).Hijack()
			if err == nil {
				connection.Close()
			}
			return
		}
		if selected == 1 || selected == 2 {
			sent := selected == 2
			phase := "upstream_connect"
			if sent {
				phase = "maybe_sent"
			}
			data, _ := common.Marshal(map[string]any{"version": 1, "code": "upstream_io", "phase": phase, "may_have_sent": sent, "upstream_status": nil})
			w.Header().Set("X-Codex-Transport-Error", base64.StdEncoding.EncodeToString(data))
			w.WriteHeader(502)
			return
		}
		status := 503
		body := `{"error":{"message":"synthetic unavailable","type":"server_error"}}`
		if selected == 4 {
			status = 200
			body = `{"id":"partial"`
		}
		contentType := "application/json"
		if selected >= 5 {
			status = 200
			body = "data: {\"type\":\"response.created\",\"response\":{\"id\":\"partial\",\"status\":\"in_progress\"}}\n\n"
			contentType = "text/event-stream"
		}
		data, _ := common.Marshal(map[string]any{"version": 1, "status": status, "headers": [][2]string{{"content-type", base64.StdEncoding.EncodeToString([]byte(contentType))}}, "content_length": int64(len(body)), "protocol": "HTTP/1.1"})
		w.Header().Set("X-Codex-Transport-Response", base64.StdEncoding.EncodeToString(data))
		w.Header().Set("Trailer", "X-Codex-Transport-Complete")
		_, _ = io.WriteString(w, body)
		if selected < 4 {
			w.Header().Set("X-Codex-Transport-Complete", "1")
		}
	})}
	go func() { _ = sidecar.Serve(listener) }()
	defer sidecar.Close()
	common.CodexTransportEnabled = true
	common.CodexTransportSocket = socket
	common.CodexTransportProfile = "0.162.1"
	common.CodexTransportCAFile = ""
	common.RelayTimeout = 0
	common.RelayIdleConnTimeout = 90
	common.RelayMaxIdleConns = 500
	common.RelayMaxIdleConnsPerHost = 100
	common.TLSInsecureSkipVerify = false
	constant.MaxRequestBodyMB = 128
	service.InitHttpClient()
	require.NoError(t, service.InitCodexTransport())
	engine := gin.New()
	engine.POST("/v1/responses/compact", middleware.TokenAuth(), middleware.Distribute(), func(c *gin.Context) { Relay(c, types.RelayFormatOpenAIResponsesCompaction) })
	engine.POST("/v1/responses", middleware.TokenAuth(), middleware.Distribute(), func(c *gin.Context) { Relay(c, types.RelayFormatOpenAIResponses) })
	for _, tc := range []struct {
		name     string
		scenario int32
		attempts int32
	}{
		{"ordinary_503_uses_retry_budget", 0, 4}, {"pre_send_failure_no_retry", 1, 1}, {"uncertain_send_no_retry", 2, 1}, {"ipc_disconnect_no_retry", 3, 1}, {"body_truncation_no_retry", 4, 1}, {"native_stream_truncation_no_retry", 5, 1}, {"collected_stream_truncation_no_retry", 6, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			scenario.Store(tc.scenario)
			attempts.Store(0)
			path := "/v1/responses/compact"
			body := `{"model":"codex-transport-retry","input":"synthetic input"}`
			if tc.scenario >= 5 {
				path = "/v1/responses"
				body = fmt.Sprintf(`{"model":"codex-transport-retry","input":"synthetic input","stream":%t}`, tc.scenario == 5)
			}
			request := httptest.NewRequest("POST", path, strings.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Authorization", "Bearer sk-"+token.Key)
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, request)
			if tc.scenario == 5 {
				assert.Equal(t, 200, response.Code)
				assert.Contains(t, response.Body.String(), "response.created")
			} else {
				assert.GreaterOrEqual(t, response.Code, 400, response.Body.String())
			}
			assert.NotContains(t, response.Body.String(), "response.completed")
			assert.NotContains(t, response.Body.String(), "[DONE]")
			assert.Equal(t, tc.attempts, attempts.Load(), response.Body.String())
		})
	}
}
