package claude

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestClaudeOAuthDoRequestRetriesRateLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	service.InitHttpClient()

	originalDelay := claudeOAuthRateLimitRetryBaseDelay
	claudeOAuthRateLimitRetryBaseDelay = time.Nanosecond
	t.Cleanup(func() {
		claudeOAuthRateLimitRetryBaseDelay = originalDelay
	})

	var attempts int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer test-access-token", r.Header.Get("Authorization"))
		current := atomic.AddInt32(&attempts, 1)
		if current == 1 {
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":{"type":"rate_limit_error","message":"Error"}}`))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"type":"message","content":[{"type":"text","text":"ok"}],"usage":{"input_tokens":1,"output_tokens":1}}`))
	}))
	t.Cleanup(server.Close)

	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/messages", io.NopCloser(strings.NewReader("{}")))
	ctx.Request.Header.Set("Content-Type", "application/json")

	info := &relaycommon.RelayInfo{
		RequestURLPath: "/v1/messages",
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelBaseUrl: server.URL,
			ApiKey:         `{"type":"claude_oauth","access_token":"test-access-token"}`,
		},
	}

	respAny, err := (&Adaptor{}).DoRequest(ctx, info, strings.NewReader(`{"model":"claude-opus-4-7"}`))

	require.NoError(t, err)
	resp := respAny.(*http.Response)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, int32(2), atomic.LoadInt32(&attempts))
}

func TestClaudeOAuthSetupRequestHeaderPassesClientHeaders(t *testing.T) {
	gin.SetMode(gin.TestMode)

	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/messages", nil)
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Request.Header.Set("Accept", "application/json")
	ctx.Request.Header.Set("User-Agent", "immersive-translate-test/1.0")
	ctx.Request.Header.Set("X-App", "claude-code")
	ctx.Request.Header.Set("X-Stainless-Arch", "arm64")
	ctx.Request.Header.Set("X-Stainless-Runtime", "browser")
	ctx.Request.Header.Set("Anthropic-Dangerous-Direct-Browser-Access", "true")
	ctx.Request.Header.Set("Anthropic-Version", "2024-01-01")
	ctx.Request.Header.Set("Anthropic-Beta", "custom-beta-2026-01-01")

	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ApiKey: `{"type":"claude_oauth","access_token":"test-access-token"}`,
		},
	}
	header := http.Header{}

	err := (&Adaptor{}).SetupRequestHeader(ctx, &header, info)

	require.NoError(t, err)
	require.Equal(t, "Bearer test-access-token", header.Get("Authorization"))
	require.Empty(t, header.Get("x-api-key"))
	require.Equal(t, "immersive-translate-test/1.0", header.Get("User-Agent"))
	require.Equal(t, "claude-code", header.Get("X-App"))
	require.Equal(t, "arm64", header.Get("X-Stainless-Arch"))
	require.Equal(t, "browser", header.Get("X-Stainless-Runtime"))
	require.Equal(t, "true", header.Get("Anthropic-Dangerous-Direct-Browser-Access"))
	require.Equal(t, "2024-01-01", header.Get("Anthropic-Version"))
	require.Contains(t, header.Get("Anthropic-Beta"), "custom-beta-2026-01-01")
	require.Contains(t, header.Get("Anthropic-Beta"), "oauth-2025-04-20")
}

func TestClaudeOAuthSetupRequestHeaderUsesDefaultUserAgentWhenClientOmitsIt(t *testing.T) {
	gin.SetMode(gin.TestMode)

	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/messages", nil)
	ctx.Request.Header.Set("Content-Type", "application/json")

	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ApiKey: `{"type":"claude_oauth","access_token":"test-access-token"}`,
		},
	}
	header := http.Header{}

	err := (&Adaptor{}).SetupRequestHeader(ctx, &header, info)

	require.NoError(t, err)
	require.Equal(t, service.ClaudeOAuthUserAgent, header.Get("User-Agent"))
}
