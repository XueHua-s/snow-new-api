package service

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"

	"github.com/stretchr/testify/require"
)

func TestStreamResponseOpenAI2ClaudeClosesStreamWithPreseededUsage(t *testing.T) {
	finishReason := "stop"
	usage := &dto.Usage{
		PromptTokens:     26,
		CompletionTokens: 17,
		TotalTokens:      43,
	}
	info := &relaycommon.RelayInfo{
		SendResponseCount: 2,
		ClaudeConvertInfo: &relaycommon.ClaudeConvertInfo{
			LastMessagesType: relaycommon.LastMessageTypeText,
			Index:            0,
			Usage:            usage,
		},
	}
	chunk := &dto.ChatCompletionsStreamResponse{
		Choices: []dto.ChatCompletionsStreamResponseChoice{
			{FinishReason: &finishReason},
		},
	}

	responses := StreamResponseOpenAI2Claude(chunk, info)

	require.Len(t, responses, 3)
	require.Equal(t, "content_block_stop", responses[0].Type)
	require.NotNil(t, responses[0].Index)
	require.Equal(t, 0, *responses[0].Index)
	require.Equal(t, "message_delta", responses[1].Type)
	require.NotNil(t, responses[1].Delta)
	require.NotNil(t, responses[1].Delta.StopReason)
	require.Equal(t, "end_turn", *responses[1].Delta.StopReason)
	require.NotNil(t, responses[1].Usage)
	require.Equal(t, 26, responses[1].Usage.InputTokens)
	require.Equal(t, 17, responses[1].Usage.OutputTokens)
	require.Equal(t, "message_stop", responses[2].Type)
	require.True(t, info.ClaudeConvertInfo.Done)
}
