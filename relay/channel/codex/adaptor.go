package codex

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relay/channel"
	"github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

type Adaptor struct {
}

const contextKeyCodexForcedUpstreamStream = "codex_forced_upstream_stream"

func isCodexUpstreamStreamForced(c *gin.Context) bool {
	if c == nil {
		return false
	}
	forced, exists := c.Get(contextKeyCodexForcedUpstreamStream)
	if !exists {
		return false
	}
	value, _ := forced.(bool)
	return value
}

func (a *Adaptor) ConvertGeminiRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.GeminiChatRequest) (any, error) {
	return nil, errors.New("codex channel: endpoint not supported")
}

func (a *Adaptor) ConvertClaudeRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.ClaudeRequest) (any, error) {
	if request == nil {
		return nil, errors.New("codex channel: request is nil")
	}
	if info == nil {
		return nil, errors.New("codex channel: relay info is nil")
	}

	aiRequest, err := service.ClaudeToOpenAIRequest(*request, info)
	if err != nil {
		return nil, err
	}
	if effort := claudeReasoningEffortForCodex(request); effort != "" {
		aiRequest.ReasoningEffort = effort
		info.ReasoningEffort = effort
	}
	if !info.IsStream {
		aiRequest.Stream = common.GetPointer(true)
		if c != nil {
			c.Set(contextKeyCodexForcedUpstreamStream, true)
		}
	}
	if info.SupportStreamOptions && info.IsStream {
		aiRequest.StreamOptions = &dto.StreamOptions{IncludeUsage: true}
	}
	return a.ConvertOpenAIRequest(c, info, aiRequest)
}

func (a *Adaptor) ConvertAudioRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.AudioRequest) (io.Reader, error) {
	return nil, errors.New("codex channel: endpoint not supported")
}

func (a *Adaptor) ConvertImageRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.ImageRequest) (any, error) {
	if info == nil {
		return nil, errors.New("codex channel: relay info is nil")
	}
	if info.RelayMode != relayconstant.RelayModeImagesGenerations {
		return nil, errors.New("codex channel: image edits are not supported yet")
	}
	if request.Stream != nil && *request.Stream {
		return nil, errors.New("codex channel: streaming image API compatibility is not supported yet; use /v1/responses for native streaming")
	}
	if request.N != nil && *request.N > 1 {
		return nil, errors.New("codex channel: native imagegen supports one image per request; send separate requests for n > 1")
	}

	model := strings.TrimSpace(request.Model)
	if model == "" || isCodexImageModelAlias(model) {
		model = codexImageToolHostModel
	}
	input, err := common.Marshal([]any{
		map[string]any{
			"role": "user",
			"content": []any{
				map[string]any{"type": "input_text", "text": request.Prompt},
			},
		},
	})
	if err != nil {
		return nil, err
	}
	tools, err := common.Marshal([]any{buildCodexImageGenerationTool(request)})
	if err != nil {
		return nil, err
	}
	toolChoice, err := common.Marshal(map[string]any{"type": "image_generation"})
	if err != nil {
		return nil, err
	}

	stream := true
	if c != nil {
		c.Set(contextKeyCodexForcedUpstreamStream, true)
	}
	return dto.OpenAIResponsesRequest{
		Model:        model,
		Input:        input,
		Instructions: json.RawMessage(`""`),
		Tools:        tools,
		ToolChoice:   toolChoice,
		Stream:       &stream,
		Store:        json.RawMessage("false"),
	}, nil
}

func (a *Adaptor) Init(info *relaycommon.RelayInfo) {
}

func (a *Adaptor) ConvertOpenAIRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.GeneralOpenAIRequest) (any, error) {
	if request == nil {
		return nil, errors.New("codex channel: request is nil")
	}
	responsesReq, err := service.ChatCompletionsRequestToResponsesRequest(request)
	if err != nil {
		return nil, err
	}
	if info != nil {
		info.RelayMode = relayconstant.RelayModeResponses
		info.RequestURLPath = "/v1/responses"
	}
	return a.ConvertOpenAIResponsesRequest(c, info, *responsesReq)
}

func (a *Adaptor) ConvertRerankRequest(c *gin.Context, relayMode int, request dto.RerankRequest) (any, error) {
	return nil, errors.New("codex channel: /v1/rerank endpoint not supported")
}

func (a *Adaptor) ConvertEmbeddingRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.EmbeddingRequest) (any, error) {
	return nil, errors.New("codex channel: /v1/embeddings endpoint not supported")
}

func (a *Adaptor) ConvertOpenAIResponsesRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.OpenAIResponsesRequest) (any, error) {
	isCompact := info != nil && info.RelayMode == relayconstant.RelayModeResponsesCompact

	requestedModel := strings.TrimSpace(request.Model)
	if info != nil && strings.TrimSpace(info.OriginModelName) != "" {
		requestedModel = strings.TrimSpace(info.OriginModelName)
	}
	if baseModel, fast := codexFastBaseModel(requestedModel); fast {
		upstreamModel := strings.TrimSpace(request.Model)
		if upstreamModel == "" || upstreamModel == requestedModel {
			upstreamModel = baseModel
		}
		request.Model = upstreamModel
		request.ServiceTier = codexFastServiceTier
		if info != nil && info.ChannelMeta != nil {
			info.UpstreamModelName = upstreamModel
			info.ChannelOtherSettings.AllowServiceTier = true
		}
	}

	if info != nil && info.ChannelSetting.SystemPrompt != "" {
		systemPrompt := info.ChannelSetting.SystemPrompt

		if len(request.Instructions) == 0 {
			if b, err := common.Marshal(systemPrompt); err == nil {
				request.Instructions = b
			} else {
				return nil, err
			}
		} else if info.ChannelSetting.SystemPromptOverride {
			var existing string
			if err := common.Unmarshal(request.Instructions, &existing); err == nil {
				existing = strings.TrimSpace(existing)
				if existing == "" {
					if b, err := common.Marshal(systemPrompt); err == nil {
						request.Instructions = b
					} else {
						return nil, err
					}
				} else {
					if b, err := common.Marshal(systemPrompt + "\n" + existing); err == nil {
						request.Instructions = b
					} else {
						return nil, err
					}
				}
			} else {
				if b, err := common.Marshal(systemPrompt); err == nil {
					request.Instructions = b
				} else {
					return nil, err
				}
			}
		}
	}
	// Codex backend requires the `instructions` field to be present.
	// Keep it consistent with Codex CLI behavior by defaulting to an empty string.
	if len(request.Instructions) == 0 {
		request.Instructions = json.RawMessage(`""`)
	}

	if isCompact {
		return request, nil
	}
	// codex: store must be false
	request.Store = json.RawMessage("false")
	// rm max_output_tokens
	request.MaxOutputTokens = nil
	request.Temperature = nil
	request.FrequencyPenalty = nil
	request.PresencePenalty = nil
	return request, nil
}

func (a *Adaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (any, error) {
	return channel.DoApiRequest(a, c, info, requestBody)
}

func (a *Adaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (usage any, err *types.NewAPIError) {
	switch info.RelayMode {
	case relayconstant.RelayModeAlphaSearch:
		// Alpha search responses are handled by relay.AlphaSearchHelper.
		return nil, types.NewError(errors.New("codex channel: alpha search response should be handled by AlphaSearchHelper"), types.ErrorCodeInvalidRequest)
	case relayconstant.RelayModeResponsesCompact:
		return openai.OaiResponsesCompactionHandler(c, resp)
	case relayconstant.RelayModeResponses:
		if isCodexUpstreamStreamForced(c) {
			info.IsStream = false
			return openai.OaiResponsesStreamToChatHandler(c, info, resp)
		}
		if info.RelayFormat == types.RelayFormatOpenAI ||
			info.RelayFormat == types.RelayFormatClaude ||
			info.RelayMode == relayconstant.RelayModeChatCompletions {
			if info.IsStream {
				return openai.OaiResponsesToChatStreamHandler(c, info, resp)
			}
			return openai.OaiResponsesToChatHandler(c, info, resp)
		}
		if info.IsStream {
			return openai.OaiResponsesStreamHandler(c, info, resp)
		}
		return openai.OaiResponsesHandler(c, info, resp)
	case relayconstant.RelayModeImagesGenerations:
		return codexImageGenerationHandler(c, resp)
	default:
		return nil, types.NewError(errors.New("codex channel: endpoint not supported"), types.ErrorCodeInvalidRequest)
	}
}

func (a *Adaptor) GetModelList() []string {
	return ModelList
}

func (a *Adaptor) GetChannelName() string {
	return ChannelName
}

func (a *Adaptor) GetRequestURL(info *relaycommon.RelayInfo) (string, error) {
	var path string
	switch info.RelayMode {
	case relayconstant.RelayModeResponses, relayconstant.RelayModeChatCompletions:
		path = "/backend-api/codex/responses"
	case relayconstant.RelayModeResponsesCompact:
		path = "/backend-api/codex/responses/compact"
	case relayconstant.RelayModeAlphaSearch:
		path = "/backend-api/codex/alpha/search"
	case relayconstant.RelayModeImagesGenerations:
		path = "/backend-api/codex/responses"
	default:
		if info.RelayFormat == types.RelayFormatClaude {
			path = "/backend-api/codex/responses"
		} else {
			return "", errors.New("codex channel: only /v1/responses, /v1/responses/compact, /v1/chat/completions, /v1/messages and /v1/alpha/search are supported")
		}
	}
	return relaycommon.GetFullRequestURL(info.ChannelBaseUrl, path, info.ChannelType), nil
}

func (a *Adaptor) SetupRequestHeader(c *gin.Context, req *http.Header, info *relaycommon.RelayInfo) error {
	channel.SetupApiRequestHeader(info, c, req)

	key := strings.TrimSpace(info.ApiKey)
	if !strings.HasPrefix(key, "{") {
		return errors.New("codex channel: key must be a JSON object")
	}

	oauthKey, err := ParseOAuthKey(key)
	if err != nil {
		return err
	}

	accessToken := strings.TrimSpace(oauthKey.AccessToken)
	accountID := strings.TrimSpace(oauthKey.AccountID)

	if accessToken == "" {
		return errors.New("codex channel: access_token is required")
	}
	if accountID == "" {
		return errors.New("codex channel: account_id is required")
	}

	req.Set("Authorization", "Bearer "+accessToken)
	req.Set("chatgpt-account-id", accountID)

	if req.Get("OpenAI-Beta") == "" {
		req.Set("OpenAI-Beta", "responses=experimental")
	}
	if req.Get("originator") == "" {
		req.Set("originator", "codex_cli_rs")
	}

	// chatgpt.com/backend-api/codex/responses is strict about Content-Type.
	// Clients may omit it or include parameters like `application/json; charset=utf-8`,
	// which can be rejected by the upstream. Force the exact media type.
	req.Set("Content-Type", "application/json")
	if baseModel, fast := codexFastBaseModel(strings.TrimSpace(info.OriginModelName)); fast {
		upstreamModel := strings.TrimSpace(info.UpstreamModelName)
		if upstreamModel == "" || upstreamModel == strings.TrimSpace(info.OriginModelName) {
			upstreamModel = baseModel
		}
		req.Set("x-codex-routing-hint", "model="+upstreamModel+";tier="+codexFastServiceTier)
	}
	if info.IsStream || isCodexUpstreamStreamForced(c) {
		req.Set("Accept", "text/event-stream")
	} else if req.Get("Accept") == "" {
		req.Set("Accept", "application/json")
	}

	return nil
}
