package codex

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestConvertOpenAIRequestConvertsChatCompletionsToResponses(t *testing.T) {
	t.Parallel()

	info := &relaycommon.RelayInfo{
		RelayMode:      relayconstant.RelayModeChatCompletions,
		RequestURLPath: "/v1/chat/completions",
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelSetting: dto.ChannelSettings{
				SystemPrompt: "Be concise.",
			},
		},
	}

	converted, err := (&Adaptor{}).ConvertOpenAIRequest(nil, info, &dto.GeneralOpenAIRequest{
		Model: "gpt-5.5",
		Messages: []dto.Message{
			{Role: "user", Content: "Translate this sentence."},
		},
		MaxTokens:   common.GetPointer[uint](32),
		Temperature: common.GetPointer(0.7),
	})

	require.NoError(t, err)
	require.Equal(t, relayconstant.RelayModeResponses, info.RelayMode)
	require.Equal(t, "/v1/responses", info.RequestURLPath)

	responsesReq, ok := converted.(dto.OpenAIResponsesRequest)
	require.True(t, ok)
	require.Equal(t, "gpt-5.5", responsesReq.Model)
	require.Nil(t, responsesReq.MaxOutputTokens)
	require.Nil(t, responsesReq.Temperature)
	require.JSONEq(t, `false`, string(responsesReq.Store))

	var instructions string
	require.NoError(t, common.Unmarshal(responsesReq.Instructions, &instructions))
	require.Equal(t, "Be concise.", instructions)
}

func TestConvertOpenAIResponsesRequestEnablesNativeFastMode(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		originModel   string
		requestModel  string
		upstreamModel string
		wantModel     string
	}{
		{
			name:          "gpt-6-fast mapped=True",
			originModel:   "gpt-6-fast",
			requestModel:  "gpt-6-sol",
			upstreamModel: "gpt-6-sol",
			wantModel:     "gpt-6-sol",
		},
		{
			name:          "gpt-6-fast mapped=False",
			originModel:   "gpt-6-fast",
			requestModel:  "gpt-6-fast",
			upstreamModel: "gpt-6-fast",
			wantModel:     "gpt-6-sol",
		},
		{
			name:          "gpt-6-sol-fast mapped=True",
			originModel:   "gpt-6-sol-fast",
			requestModel:  "gpt-6-sol",
			upstreamModel: "gpt-6-sol",
			wantModel:     "gpt-6-sol",
		},
		{
			name:          "gpt-6-sol-fast mapped=False",
			originModel:   "gpt-6-sol-fast",
			requestModel:  "gpt-6-sol-fast",
			upstreamModel: "gpt-6-sol-fast",
			wantModel:     "gpt-6-sol",
		},
		{
			name:          "gpt-6-luna-fast mapped=True",
			originModel:   "gpt-6-luna-fast",
			requestModel:  "gpt-6-luna",
			upstreamModel: "gpt-6-luna",
			wantModel:     "gpt-6-luna",
		},
		{
			name:          "gpt-6-luna-fast mapped=False",
			originModel:   "gpt-6-luna-fast",
			requestModel:  "gpt-6-luna-fast",
			upstreamModel: "gpt-6-luna-fast",
			wantModel:     "gpt-6-luna",
		},
		{
			name:          "gpt-6-astra-fast mapped=True",
			originModel:   "gpt-6-astra-fast",
			requestModel:  "gpt-6-astra",
			upstreamModel: "gpt-6-astra",
			wantModel:     "gpt-6-astra",
		},
		{
			name:          "gpt-6-astra-fast mapped=False",
			originModel:   "gpt-6-astra-fast",
			requestModel:  "gpt-6-astra-fast",
			upstreamModel: "gpt-6-astra-fast",
			wantModel:     "gpt-6-astra",
		},
		{
			name:          "mapped fast alias",
			originModel:   "gpt-5.6-fast",
			requestModel:  "gpt-5.6-sol",
			upstreamModel: "gpt-5.6-sol",
			wantModel:     "gpt-5.6-sol",
		},
		{
			name:          "native fast alias without channel mapping",
			originModel:   "gpt-5.6-terra-fast",
			requestModel:  "gpt-5.6-terra-fast",
			upstreamModel: "gpt-5.6-terra-fast",
			wantModel:     "gpt-5.6-terra",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			info := &relaycommon.RelayInfo{
				OriginModelName: tt.originModel,
				ChannelMeta: &relaycommon.ChannelMeta{
					UpstreamModelName: tt.upstreamModel,
				},
			}
			converted, err := (&Adaptor{}).ConvertOpenAIResponsesRequest(nil, info, dto.OpenAIResponsesRequest{
				Model: tt.requestModel,
			})

			require.NoError(t, err)
			request := converted.(dto.OpenAIResponsesRequest)
			require.Equal(t, tt.wantModel, request.Model)
			require.Equal(t, codexFastServiceTier, request.ServiceTier)
			require.Equal(t, tt.wantModel, info.UpstreamModelName)
			require.True(t, info.ChannelOtherSettings.AllowServiceTier)

			body, err := common.Marshal(request)
			require.NoError(t, err)
			body, err = relaycommon.RemoveDisabledFields(body, info.ChannelOtherSettings, false)
			require.NoError(t, err)
			require.Equal(t, codexFastServiceTier, gjson.GetBytes(body, "service_tier").String())
		})
	}
}

func TestSetupRequestHeaderAddsNativeFastRoutingHint(t *testing.T) {
	t.Parallel()

	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	info := &relaycommon.RelayInfo{
		OriginModelName: "gpt-5.6-luna-fast",
		ChannelMeta: &relaycommon.ChannelMeta{
			ApiKey:            `{"access_token":"token","account_id":"account"}`,
			UpstreamModelName: "gpt-5.6-luna",
		},
	}
	header := make(http.Header)

	require.NoError(t, (&Adaptor{}).SetupRequestHeader(ctx, &header, info))
	require.Equal(t, "model=gpt-5.6-luna;tier=priority", header.Get("x-codex-routing-hint"))
}

func TestConvertOpenAIRequestReturnsErrorForInvalidChatRequest(t *testing.T) {
	t.Parallel()

	info := &relaycommon.RelayInfo{
		RelayMode:      relayconstant.RelayModeChatCompletions,
		RequestURLPath: "/v1/chat/completions",
	}

	converted, err := (&Adaptor{}).ConvertOpenAIRequest(nil, info, &dto.GeneralOpenAIRequest{
		Messages: []dto.Message{
			{Role: "user", Content: "hello"},
		},
	})

	require.Error(t, err)
	require.Nil(t, converted)
	require.Equal(t, relayconstant.RelayModeChatCompletions, info.RelayMode)
	require.Equal(t, "/v1/chat/completions", info.RequestURLPath)
}

func TestConvertClaudeRequestConvertsMessagesToResponses(t *testing.T) {
	t.Parallel()

	stream := true
	info := &relaycommon.RelayInfo{
		RelayFormat:     types.RelayFormatClaude,
		OriginModelName: "gpt-5.5",
		IsStream:        true,
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "gpt-5.5",
		},
	}

	converted, err := (&Adaptor{}).ConvertClaudeRequest(nil, info, &dto.ClaudeRequest{
		Model:     "gpt-5.5",
		System:    "Be useful.",
		MaxTokens: common.GetPointer[uint](128),
		Stream:    &stream,
		Messages: []dto.ClaudeMessage{
			{Role: "user", Content: "hello from anthropic protocol"},
		},
	})

	require.NoError(t, err)
	require.Equal(t, relayconstant.RelayModeResponses, info.RelayMode)
	require.Equal(t, "/v1/responses", info.RequestURLPath)

	responsesReq, ok := converted.(dto.OpenAIResponsesRequest)
	require.True(t, ok)
	require.Equal(t, "gpt-5.5", responsesReq.Model)
	require.NotNil(t, responsesReq.Stream)
	require.True(t, *responsesReq.Stream)
	require.Nil(t, responsesReq.MaxOutputTokens)
	require.JSONEq(t, `false`, string(responsesReq.Store))

	var instructions string
	require.NoError(t, common.Unmarshal(responsesReq.Instructions, &instructions))
	require.Equal(t, "Be useful.", instructions)

	var input []map[string]any
	require.NoError(t, common.Unmarshal(responsesReq.Input, &input))
	require.Len(t, input, 1)
	require.Equal(t, "user", input[0]["role"])
	require.Equal(t, "hello from anthropic protocol", input[0]["content"])
}

func TestConvertClaudeRequestMapsClaudeCodeThinkingToResponsesEffort(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		thinking     *dto.Thinking
		outputConfig string
		wantEffort   string
	}{
		{
			name:         "disabled overrides configured effort",
			thinking:     &dto.Thinking{Type: "disabled"},
			outputConfig: `{"effort":"high"}`,
			wantEffort:   "none",
		},
		{
			name:         "adaptive uses configured effort",
			thinking:     &dto.Thinking{Type: "adaptive"},
			outputConfig: `{"effort":"xhigh"}`,
			wantEffort:   "xhigh",
		},
		{
			name:         "adaptive auto preserves model default",
			thinking:     &dto.Thinking{Type: "adaptive"},
			outputConfig: `{"effort":"auto"}`,
		},
		{
			name:       "smart composer default budget maps to medium",
			thinking:   &dto.Thinking{Type: "enabled", BudgetTokens: common.GetPointer(8192)},
			wantEffort: "medium",
		},
		{
			name:         "configured effort takes precedence over budget",
			thinking:     &dto.Thinking{Type: "enabled", BudgetTokens: common.GetPointer(8192)},
			outputConfig: `{"effort":"max"}`,
			wantEffort:   "max",
		},
		{
			name:         "codex ultra is normalized to wire max",
			thinking:     &dto.Thinking{Type: "adaptive"},
			outputConfig: `{"effort":"ultra"}`,
			wantEffort:   "max",
		},
		{
			name:         "claude ultracode is normalized to wire max",
			thinking:     &dto.Thinking{Type: "adaptive"},
			outputConfig: `{"effort":"ultracode"}`,
			wantEffort:   "max",
		},
		{
			name:         "effort works without thinking object",
			outputConfig: `{"effort":"low"}`,
			wantEffort:   "low",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			info := &relaycommon.RelayInfo{
				RelayFormat:     types.RelayFormatClaude,
				OriginModelName: "gpt-5.6-sol",
				ChannelMeta: &relaycommon.ChannelMeta{
					UpstreamModelName: "gpt-5.6-sol",
				},
			}
			request := &dto.ClaudeRequest{
				Model:        "gpt-5.6-sol",
				Messages:     []dto.ClaudeMessage{{Role: "user", Content: "hello"}},
				Thinking:     tt.thinking,
				OutputConfig: json.RawMessage(tt.outputConfig),
			}

			converted, err := (&Adaptor{}).ConvertClaudeRequest(nil, info, request)

			require.NoError(t, err)
			responsesReq, ok := converted.(dto.OpenAIResponsesRequest)
			require.True(t, ok)
			if tt.wantEffort == "" {
				require.Nil(t, responsesReq.Reasoning)
				require.Empty(t, info.ReasoningEffort)
				return
			}
			require.NotNil(t, responsesReq.Reasoning)
			require.Equal(t, tt.wantEffort, responsesReq.Reasoning.Effort)
			require.Equal(t, tt.wantEffort, info.ReasoningEffort)
		})
	}
}

func TestConvertClaudeRequestForcesUpstreamStreamForNonStreamingClaude(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	stream := false
	info := &relaycommon.RelayInfo{
		RelayFormat:     types.RelayFormatClaude,
		OriginModelName: "gpt-5.6-sol",
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "gpt-5.6-sol",
		},
	}

	converted, err := (&Adaptor{}).ConvertClaudeRequest(ctx, info, &dto.ClaudeRequest{
		Model:  "gpt-5.6-sol",
		Stream: &stream,
		Messages: []dto.ClaudeMessage{
			{Role: "user", Content: "hello"},
		},
	})

	require.NoError(t, err)
	responsesReq, ok := converted.(dto.OpenAIResponsesRequest)
	require.True(t, ok)
	require.NotNil(t, responsesReq.Stream)
	require.True(t, *responsesReq.Stream)
	require.False(t, info.IsStream)
	require.True(t, isCodexUpstreamStreamForced(ctx))
}

func TestClaudeThinkingBudgetToCodexEffort(t *testing.T) {
	t.Parallel()

	tests := []struct {
		budget int
		want   string
	}{
		{budget: 0, want: "none"},
		{budget: 1, want: "minimal"},
		{budget: 1024, want: "minimal"},
		{budget: 1025, want: "low"},
		{budget: 4096, want: "low"},
		{budget: 4097, want: "medium"},
		{budget: 8192, want: "medium"},
		{budget: 10240, want: "medium"},
		{budget: 10241, want: "high"},
		{budget: 20480, want: "high"},
		{budget: 20481, want: "xhigh"},
		{budget: 24576, want: "xhigh"},
		{budget: 24577, want: "max"},
		{budget: 31999, want: "max"},
	}

	for _, tt := range tests {
		require.Equal(t, tt.want, claudeThinkingBudgetToCodexEffort(tt.budget))
	}
}

func TestDoResponseConvertsResponsesBackToChatCompletions(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)

	info := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeResponses,
		RelayFormat:     types.RelayFormatOpenAI,
		OriginModelName: "gpt-5.5",
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "gpt-5.5",
		},
	}

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(`{"id":"resp_1","object":"response","created_at":1779200000,"model":"gpt-5.5","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"hello"}]}],"usage":{"input_tokens":3,"output_tokens":2,"total_tokens":5}}`)),
	}

	usage, err := (&Adaptor{}).DoResponse(ctx, resp, info)

	require.Nil(t, err)
	require.Equal(t, 3, usage.(*dto.Usage).PromptTokens)
	require.Equal(t, 2, usage.(*dto.Usage).CompletionTokens)

	var chatResp dto.OpenAITextResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &chatResp))
	require.Equal(t, "chat.completion", chatResp.Object)
	require.Equal(t, "gpt-5.5", chatResp.Model)
	require.Len(t, chatResp.Choices, 1)
	require.Equal(t, "assistant", chatResp.Choices[0].Message.Role)
	require.Equal(t, "hello", chatResp.Choices[0].Message.StringContent())
}

func TestDoResponseAggregatesForcedResponsesStreamBackToClaudeJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set(contextKeyCodexForcedUpstreamStream, true)

	info := &relaycommon.RelayInfo{
		IsStream:        true,
		RelayMode:       relayconstant.RelayModeResponses,
		RelayFormat:     types.RelayFormatClaude,
		OriginModelName: "claude-opus-5",
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "gpt-5.6-sol",
		},
	}

	streamBody := strings.Join([]string{
		`event: response.created`,
		`data: {"type":"response.created","response":{"id":"resp_forced","object":"response","created_at":1779200000,"model":"gpt-5.6-sol"}}`,
		``,
		`event: response.output_item.done`,
		`data: {"type":"response.output_item.done","output_index":0,"item":{"id":"reasoning_forced","type":"reasoning","status":"completed"}}`,
		``,
		`event: response.output_item.done`,
		`data: {"type":"response.output_item.done","output_index":1,"item":{"id":"msg_forced","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"OK"}]}}`,
		``,
		`event: response.completed`,
		`data: {"type":"response.completed","response":{"id":"resp_forced","object":"response","created_at":1779200000,"model":"gpt-5.6-sol","output":[],"usage":{"input_tokens":26,"output_tokens":2,"total_tokens":28}}}`,
		``,
		`data: [DONE]`,
		``,
	}, "\n")
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header: http.Header{
			"Content-Type": []string{"text/event-stream"},
		},
		Body: io.NopCloser(strings.NewReader(streamBody)),
	}

	usage, handlerErr := (&Adaptor{}).DoResponse(ctx, resp, info)

	require.Nil(t, handlerErr)
	require.False(t, info.IsStream)
	require.Equal(t, 26, usage.(*dto.Usage).PromptTokens)
	require.Equal(t, 2, usage.(*dto.Usage).CompletionTokens)
	require.Equal(t, "application/json", recorder.Header().Get("Content-Type"))

	var claudeResp dto.ClaudeResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &claudeResp))
	require.Equal(t, "message", claudeResp.Type)
	require.Equal(t, "assistant", claudeResp.Role)
	require.Equal(t, "gpt-5.6-sol", claudeResp.Model)
	require.Len(t, claudeResp.Content, 1)
	require.Equal(t, "OK", claudeResp.Content[0].GetText())
}

func TestGetRequestURLAllowsOpenCodeProtocols(t *testing.T) {
	t.Parallel()

	adaptor := &Adaptor{}
	tests := []struct {
		name    string
		info    *relaycommon.RelayInfo
		want    string
		wantErr bool
	}{
		{
			name: "responses",
			info: &relaycommon.RelayInfo{
				RelayMode: relayconstant.RelayModeResponses,
				ChannelMeta: &relaycommon.ChannelMeta{
					ChannelBaseUrl: "https://chatgpt.com",
				},
			},
			want: "https://chatgpt.com/backend-api/codex/responses",
		},
		{
			name: "responses compact",
			info: &relaycommon.RelayInfo{
				RelayMode: relayconstant.RelayModeResponsesCompact,
				ChannelMeta: &relaycommon.ChannelMeta{
					ChannelBaseUrl: "https://chatgpt.com",
				},
			},
			want: "https://chatgpt.com/backend-api/codex/responses/compact",
		},
		{
			name: "chat completions",
			info: &relaycommon.RelayInfo{
				RelayMode: relayconstant.RelayModeChatCompletions,
				ChannelMeta: &relaycommon.ChannelMeta{
					ChannelBaseUrl: "https://chatgpt.com",
				},
			},
			want: "https://chatgpt.com/backend-api/codex/responses",
		},
		{
			name: "anthropic messages",
			info: &relaycommon.RelayInfo{
				RelayFormat: types.RelayFormatClaude,
				ChannelMeta: &relaycommon.ChannelMeta{
					ChannelBaseUrl: "https://chatgpt.com",
				},
			},
			want: "https://chatgpt.com/backend-api/codex/responses",
		},
		{
			name: "unsupported",
			info: &relaycommon.RelayInfo{
				RelayMode: relayconstant.RelayModeEmbeddings,
				ChannelMeta: &relaycommon.ChannelMeta{
					ChannelBaseUrl: "https://chatgpt.com",
				},
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := adaptor.GetRequestURL(tt.info)
			if tt.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.want, got)
		})
	}
}

func TestGetRequestURLAlphaSearch(t *testing.T) {
	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:    constant.ChannelTypeCodex,
			ChannelBaseUrl: "https://chatgpt.com",
		},
		RelayMode: relayconstant.RelayModeAlphaSearch,
	}

	url, err := adaptor.GetRequestURL(info)
	require.NoError(t, err)
	assert.Equal(t, "https://chatgpt.com/backend-api/codex/alpha/search", url)
}

func TestConvertOpenAIResponsesRequestDropsPenalties(t *testing.T) {
	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{ChannelType: constant.ChannelTypeCodex},
		RelayMode:   relayconstant.RelayModeResponses,
	}

	converted, err := adaptor.ConvertOpenAIResponsesRequest(nil, info, dto.OpenAIResponsesRequest{
		Model:            "gpt-5-codex",
		Input:            json.RawMessage(`"hello"`),
		MaxOutputTokens:  lo.ToPtr(uint(128)),
		Temperature:      lo.ToPtr(1.0),
		FrequencyPenalty: json.RawMessage(`1.5`),
		PresencePenalty:  json.RawMessage(`1.5`),
	})
	require.NoError(t, err)

	request, ok := converted.(dto.OpenAIResponsesRequest)
	require.True(t, ok)
	assert.Nil(t, request.MaxOutputTokens)
	assert.Nil(t, request.Temperature)
	assert.Nil(t, request.FrequencyPenalty)
	assert.Nil(t, request.PresencePenalty)
}
