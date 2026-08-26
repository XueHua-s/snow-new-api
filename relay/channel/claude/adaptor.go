package claude

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relay/channel"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/relayconvert"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
)

type Adaptor struct {
}

const claudeOAuthRateLimitMaxRetries = 2

var claudeOAuthRateLimitRetryBaseDelay = 750 * time.Millisecond

func (a *Adaptor) ConvertGeminiRequest(*gin.Context, *relaycommon.RelayInfo, *dto.GeminiChatRequest) (any, error) {
	//TODO implement me
	return nil, errors.New("not implemented")
}

func (a *Adaptor) ConvertClaudeRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.ClaudeRequest) (any, error) {
	return request, nil
}

func (a *Adaptor) ConvertAudioRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.AudioRequest) (io.Reader, error) {
	//TODO implement me
	return nil, errors.New("not implemented")
}

func (a *Adaptor) ConvertImageRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.ImageRequest) (any, error) {
	//TODO implement me
	return nil, errors.New("not implemented")
}

func (a *Adaptor) Init(info *relaycommon.RelayInfo) {
}

func (a *Adaptor) GetRequestURL(info *relaycommon.RelayInfo) (string, error) {
	requestURL := fmt.Sprintf("%s/v1/messages", info.ChannelBaseUrl)
	if !shouldAppendClaudeBetaQuery(info) {
		return requestURL, nil
	}

	parsedURL, err := url.Parse(requestURL)
	if err != nil {
		return "", err
	}
	query := parsedURL.Query()
	query.Set("beta", "true")
	parsedURL.RawQuery = query.Encode()
	return parsedURL.String(), nil
}

func shouldAppendClaudeBetaQuery(info *relaycommon.RelayInfo) bool {
	if info == nil {
		return false
	}
	if info.IsClaudeBetaQuery {
		return true
	}
	if info.ChannelOtherSettings.ClaudeBetaQuery {
		return true
	}
	return false
}

func CommonClaudeHeadersOperation(c *gin.Context, req *http.Header, info *relaycommon.RelayInfo) {
	// common headers operation
	anthropicBeta := c.Request.Header.Get("anthropic-beta")
	if anthropicBeta != "" {
		req.Set("anthropic-beta", anthropicBeta)
	}
	model_setting.GetClaudeSettings().WriteHeaders(info.OriginModelName, req)
}

func (a *Adaptor) SetupRequestHeader(c *gin.Context, req *http.Header, info *relaycommon.RelayInfo) error {
	channel.SetupApiRequestHeader(info, c, req)
	anthropicVersion := c.Request.Header.Get("anthropic-version")
	if anthropicVersion == "" {
		anthropicVersion = "2023-06-01"
	}
	req.Set("anthropic-version", anthropicVersion)
	CommonClaudeHeadersOperation(c, req, info)
	if isClaudeOAuthRequest(info) {
		oauthKey, err := service.EnsureClaudeOAuthCredential(
			c.Request.Context(),
			info.ChannelId,
			info.ApiKey,
			info.ChannelSetting.Proxy,
		)
		if err != nil {
			return err
		}
		req.Del("x-api-key")
		req.Set("Authorization", "Bearer "+strings.TrimSpace(oauthKey.AccessToken))
		passClaudeOAuthClientHeaders(c, req)
		ensureClaudeOAuthHeaders(req)
		return nil
	}
	req.Set("x-api-key", info.ApiKey)
	return nil
}

func passClaudeOAuthClientHeaders(c *gin.Context, req *http.Header) {
	if c == nil || c.Request == nil || req == nil {
		return
	}
	for _, name := range operation_setting.ClaudeCliPassThroughHeaders() {
		if value := strings.TrimSpace(c.Request.Header.Get(name)); value != "" {
			req.Set(name, value)
		}
	}
}

func ensureClaudeOAuthHeaders(req *http.Header) {
	if strings.TrimSpace(req.Get("user-agent")) == "" {
		req.Set("user-agent", service.ClaudeOAuthUserAgent)
	}
	seen := map[string]struct{}{}
	parts := make([]string, 0, len(service.ClaudeOAuthBetaHeaders)+1)
	for _, part := range strings.Split(req.Get("anthropic-beta"), ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		seen[part] = struct{}{}
		parts = append(parts, part)
	}
	for _, beta := range service.ClaudeOAuthBetaHeaders {
		if _, ok := seen[beta]; ok {
			continue
		}
		parts = append(parts, beta)
	}
	req.Set("anthropic-beta", strings.Join(parts, ","))
}

func (a *Adaptor) ConvertOpenAIRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.GeneralOpenAIRequest) (any, error) {
	if request == nil {
		return nil, errors.New("request is nil")
	}
	result, err := relayconvert.ConvertRequest(c, info, types.RelayFormatClaude, request)
	if err != nil {
		return nil, err
	}
	return result.Value, nil
}

func (a *Adaptor) ConvertRerankRequest(c *gin.Context, relayMode int, request dto.RerankRequest) (any, error) {
	return nil, nil
}

func (a *Adaptor) ConvertEmbeddingRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.EmbeddingRequest) (any, error) {
	//TODO implement me
	return nil, errors.New("not implemented")
}

func (a *Adaptor) ConvertOpenAIResponsesRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.OpenAIResponsesRequest) (any, error) {
	// TODO implement me
	return nil, errors.New("not implemented")
}

func (a *Adaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (any, error) {
	if !isClaudeOAuthRequest(info) {
		return channel.DoApiRequest(a, c, info, requestBody)
	}

	var bodyBytes []byte
	if requestBody != nil {
		var err error
		bodyBytes, err = io.ReadAll(requestBody)
		if err != nil {
			return nil, fmt.Errorf("read request body for claude oauth retry failed: %w", err)
		}
	}

	var lastResp *http.Response
	for attempt := 0; attempt <= claudeOAuthRateLimitMaxRetries; attempt++ {
		if attempt > 0 {
			timer := time.NewTimer(claudeOAuthRateLimitRetryDelay(lastResp, attempt))
			select {
			case <-timer.C:
			case <-c.Request.Context().Done():
				timer.Stop()
				return nil, c.Request.Context().Err()
			}
		}

		resp, err := channel.DoApiRequest(a, c, info, bytes.NewReader(bodyBytes))
		if err != nil {
			return nil, err
		}
		if resp == nil || resp.StatusCode != http.StatusTooManyRequests || attempt == claudeOAuthRateLimitMaxRetries {
			return resp, nil
		}
		lastResp = resp
		service.CloseResponseBodyGracefully(resp)
	}
	return lastResp, nil
}

func isClaudeOAuthRequest(info *relaycommon.RelayInfo) bool {
	return info != nil && info.ChannelType == constant.ChannelTypeClaudeOAuth
}

func claudeOAuthRateLimitRetryDelay(resp *http.Response, attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	if resp != nil {
		if retryAfter := strings.TrimSpace(resp.Header.Get("Retry-After")); retryAfter != "" {
			if seconds, err := strconv.Atoi(retryAfter); err == nil && seconds >= 0 {
				return clampClaudeOAuthRetryDelay(time.Duration(seconds) * time.Second)
			}
			if retryAt, err := http.ParseTime(retryAfter); err == nil {
				return clampClaudeOAuthRetryDelay(time.Until(retryAt))
			}
		}
	}
	return time.Duration(attempt) * claudeOAuthRateLimitRetryBaseDelay
}

func clampClaudeOAuthRetryDelay(delay time.Duration) time.Duration {
	if delay < claudeOAuthRateLimitRetryBaseDelay {
		return claudeOAuthRateLimitRetryBaseDelay
	}
	const maxDelay = 5 * time.Second
	if delay > maxDelay {
		return maxDelay
	}
	return delay
}

func (a *Adaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (usage any, err *types.NewAPIError) {
	info.FinalRequestRelayFormat = types.RelayFormatClaude
	if info.IsStream {
		return ClaudeStreamHandler(c, resp, info)
	} else {
		return ClaudeHandler(c, resp, info)
	}
}

func (a *Adaptor) GetModelList() []string {
	return ModelList
}

func (a *Adaptor) GetChannelName() string {
	return ChannelName
}
