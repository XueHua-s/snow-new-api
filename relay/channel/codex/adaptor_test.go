package codex

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
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
