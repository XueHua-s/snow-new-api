package relayconvert

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/convmeta"
	geminichat "github.com/QuantumNous/new-api/relaykit/relayconvert/internal/gemini_chat"
	oaichat "github.com/QuantumNous/new-api/relaykit/relayconvert/internal/oai_chat"
	kitutil "github.com/QuantumNous/new-api/relaykit/relayconvert/kitutil"
)

func convertOAIChatResponseToOAIResponses(_ context.Context, _ convmeta.Meta, response any) (any, *dto.Usage, error) {
	chatResponse, err := asOAIChatResponse(response)
	if err != nil {
		return nil, nil, err
	}
	id := strings.TrimSpace(chatResponse.Id)
	if id == "" {
		id = fmt.Sprintf("resp_%s", kitutil.GetUUID())
	}
	return ChatCompletionsResponseToResponsesResponse(chatResponse, id)
}

func convertOAIResponsesResponseToOAIChat(_ context.Context, _ convmeta.Meta, response any) (any, *dto.Usage, error) {
	responsesResponse, err := asOAIResponsesResponse(response)
	if err != nil {
		return nil, nil, err
	}
	id := strings.TrimSpace(responsesResponse.ID)
	if id == "" {
		id = fmt.Sprintf("chatcmpl-%s", kitutil.GetUUID())
	}
	return ResponsesResponseToChatCompletionsResponse(responsesResponse, id)
}

func newOAIChatToOAIResponsesStreamState(options ResponseStreamOptions) any {
	id := strings.TrimSpace(options.ID)
	if id == "" {
		id = fmt.Sprintf("resp_%s", kitutil.GetUUID())
	}
	state := NewChatToResponsesStreamState(id, strings.TrimSpace(options.Model))
	if options.Created != 0 {
		state.Created = options.Created
	}
	return state
}

func convertOAIChatStreamResponseToOAIResponses(_ context.Context, _ convmeta.Meta, response any, state any) ([]any, *dto.Usage, error) {
	chatResponse, err := asOAIChatStreamResponse(response)
	if err != nil {
		return nil, nil, err
	}
	streamState, ok := state.(*ChatToResponsesStreamState)
	if !ok || streamState == nil {
		return nil, nil, errors.New("OAI chat to OAI responses stream state is required")
	}
	events, err := ChatCompletionsStreamChunkToResponsesEvents(chatResponse, streamState)
	if err != nil {
		return nil, nil, err
	}
	return streamValuesFromAny(events), streamState.Usage, nil
}

func finalizeOAIChatStreamResponseToOAIResponses(_ context.Context, _ convmeta.Meta, state any) ([]any, *dto.Usage, error) {
	streamState, ok := state.(*ChatToResponsesStreamState)
	if !ok || streamState == nil {
		return nil, nil, errors.New("OAI chat to OAI responses stream state is required")
	}
	events := FinalizeChatCompletionsStreamToResponses(streamState)
	return streamValuesFromAny(events), streamState.Usage, nil
}

func newOAIResponsesToOAIChatStreamState(options ResponseStreamOptions) any {
	state := NewResponsesToChatStreamState(strings.TrimSpace(options.Model), options.IncludeUsage)
	state.ID = strings.TrimSpace(options.ID)
	if options.Created != 0 {
		state.Created = options.Created
	}
	return state
}

func convertOAIResponsesStreamResponseToOAIChat(_ context.Context, _ convmeta.Meta, response any, state any) ([]any, *dto.Usage, error) {
	responsesResponse, err := asOAIResponsesStreamResponse(response)
	if err != nil {
		return nil, nil, err
	}
	streamState, ok := state.(*ResponsesToChatStreamState)
	if !ok || streamState == nil {
		return nil, nil, errors.New("OAI responses to OAI chat stream state is required")
	}
	chunks, err := ResponsesStreamEventToChatChunks(responsesResponse, streamState)
	if err != nil {
		return nil, nil, err
	}
	return streamValuesFromAny(chunks), streamState.Usage, nil
}

func finalizeOAIResponsesStreamResponseToOAIChat(_ context.Context, _ convmeta.Meta, state any) ([]any, *dto.Usage, error) {
	streamState, ok := state.(*ResponsesToChatStreamState)
	if !ok || streamState == nil {
		return nil, nil, errors.New("OAI responses to OAI chat stream state is required")
	}
	chunks := FinalizeResponsesToChatStream(streamState)
	return streamValuesFromAny(chunks), streamState.Usage, nil
}

func convertOAIChatResponseToClaudeMessages(_ context.Context, info convmeta.Meta, response any) (any, *dto.Usage, error) {
	chatResponse, err := asOAIChatResponse(response)
	if err != nil {
		return nil, nil, err
	}
	return ResponseOpenAI2Claude(chatResponse, info), UsageFromChatUsage(&chatResponse.Usage), nil
}

func convertOAIChatStreamResponseToClaudeMessages(_ context.Context, info convmeta.Meta, response any) (any, *dto.Usage, error) {
	chatResponse, err := asOAIChatStreamResponse(response)
	if err != nil {
		return nil, nil, err
	}
	return StreamResponseOpenAI2Claude(chatResponse, info), canonicalUsageFromResponse(chatResponse), nil
}

func finalizeOAIChatStreamResponseToClaudeMessages(_ context.Context, info convmeta.Meta, _ any) ([]any, *dto.Usage, error) {
	if info == nil {
		info = &convmeta.Values{}
	}
	usage := info.EnsureClaudeConvertInfo().Usage
	responses := oaichat.FinalizeStreamResponseOpenAI2Claude(info)
	return streamValuesFromAny(responses), usage, nil
}

func convertOAIChatResponseToGeminiChat(_ context.Context, info convmeta.Meta, response any) (any, *dto.Usage, error) {
	chatResponse, err := asOAIChatResponse(response)
	if err != nil {
		return nil, nil, err
	}
	return ResponseOpenAI2Gemini(chatResponse, info), UsageFromChatUsage(&chatResponse.Usage), nil
}

func convertOAIChatStreamResponseToGeminiChat(_ context.Context, info convmeta.Meta, response any) (any, *dto.Usage, error) {
	chatResponse, err := asOAIChatStreamResponse(response)
	if err != nil {
		return nil, nil, err
	}
	return StreamResponseOpenAI2Gemini(chatResponse, info), canonicalUsageFromResponse(chatResponse), nil
}

func convertClaudeMessagesResponseToOAIChat(_ context.Context, _ convmeta.Meta, response any) (any, *dto.Usage, error) {
	claudeResponse, err := asClaudeResponse(response)
	if err != nil {
		return nil, nil, err
	}
	usage := usageFromClaudeResponse(claudeResponse)
	openAIResponse := ResponseClaude2OpenAI(claudeResponse)
	if usage != nil {
		openAIResponse.Usage = *usage
	}
	return openAIResponse, usage, nil
}

func convertClaudeMessagesStreamResponseToOAIChat(_ context.Context, _ convmeta.Meta, response any) (any, *dto.Usage, error) {
	claudeResponse, err := asClaudeResponse(response)
	if err != nil {
		return nil, nil, err
	}
	openAIResponse := StreamResponseClaude2OpenAI(claudeResponse)
	usage := usageFromClaudeResponse(claudeResponse)
	if openAIResponse != nil && usage != nil {
		openAIResponse.Usage = usage
	}
	return openAIResponse, usage, nil
}

func convertGeminiChatResponseToOAIChat(_ context.Context, info convmeta.Meta, response any) (any, *dto.Usage, error) {
	geminiResponse, err := asGeminiChatResponse(response)
	if err != nil {
		return nil, nil, err
	}
	usage := UsageFromGeminiMetadata(geminiResponse.GetUsageMetadata(), fallbackPromptTokens(info))
	openAIResponse := ResponseGeminiChat2OpenAI(fmt.Sprintf("chatcmpl-%s", kitutil.GetUUID()), kitutil.GetTimestamp(), geminiResponse)
	if info != nil && info.HasChannelMeta() {
		openAIResponse.Model = info.GetUpstreamModelName()
	}
	if usage != nil {
		openAIResponse.Usage = *usage
	}
	return openAIResponse, usage, nil
}

func newGeminiChatToOAIChatStreamState(options ResponseStreamOptions) any {
	return geminichat.NewGeminiToChatStreamState(options.ID, options.Created)
}

func convertGeminiChatStreamResponseChunkToOAIChat(_ context.Context, info convmeta.Meta, response any, state any) ([]any, *dto.Usage, error) {
	geminiResponse, err := asGeminiChatResponse(response)
	if err != nil {
		return nil, nil, err
	}
	streamState, ok := state.(*geminichat.GeminiToChatStreamState)
	if !ok || streamState == nil {
		return nil, nil, errors.New("Gemini chat to OAI chat stream state is required")
	}
	usage := UsageFromGeminiMetadata(geminiResponse.GetUsageMetadata(), fallbackPromptTokens(info))
	model := ""
	if info != nil && info.HasChannelMeta() {
		model = info.GetUpstreamModelName()
	}
	responses := streamState.ConvertChunk(geminiResponse, model, usage)
	return streamValuesFromAny(responses), usage, nil
}

func finalizeGeminiChatStreamResponseToOAIChat(_ context.Context, info convmeta.Meta, state any) ([]any, *dto.Usage, error) {
	streamState, ok := state.(*geminichat.GeminiToChatStreamState)
	if !ok || streamState == nil {
		return nil, nil, errors.New("Gemini chat to OAI chat stream state is required")
	}
	model := ""
	if info != nil && info.HasChannelMeta() {
		model = info.GetUpstreamModelName()
	}
	responses := streamState.Finalize(model)
	return streamValuesFromAny(responses), streamState.Usage(), nil
}

func convertGeminiChatStreamResponseToOAIChat(_ context.Context, info convmeta.Meta, response any) (any, *dto.Usage, error) {
	geminiResponse, err := asGeminiChatResponse(response)
	if err != nil {
		return nil, nil, err
	}
	openAIResponse, _ := StreamResponseGeminiChat2OpenAI(geminiResponse)
	usage := UsageFromGeminiMetadata(geminiResponse.GetUsageMetadata(), fallbackPromptTokens(info))
	if openAIResponse != nil {
		openAIResponse.Id = fmt.Sprintf("chatcmpl-%s", kitutil.GetUUID())
		openAIResponse.Created = kitutil.GetTimestamp()
		if info != nil && info.HasChannelMeta() {
			openAIResponse.Model = info.GetUpstreamModelName()
		}
		openAIResponse.Usage = usage
	}
	return openAIResponse, usage, nil
}

func fallbackPromptTokens(info convmeta.Meta) int {
	if info == nil {
		return 0
	}
	return info.GetEstimatePromptTokens()
}

func asOAIChatResponse(response any) (*dto.OpenAITextResponse, error) {
	switch resp := response.(type) {
	case *dto.OpenAITextResponse:
		return resp, nil
	case dto.OpenAITextResponse:
		return &resp, nil
	default:
		return nil, fmt.Errorf("expected OAI chat response, got %T", response)
	}
}

func asOAIChatStreamResponse(response any) (*dto.ChatCompletionsStreamResponse, error) {
	switch resp := response.(type) {
	case *dto.ChatCompletionsStreamResponse:
		return resp, nil
	case dto.ChatCompletionsStreamResponse:
		return &resp, nil
	default:
		return nil, fmt.Errorf("expected OAI chat stream response, got %T", response)
	}
}

func asOAIResponsesResponse(response any) (*dto.OpenAIResponsesResponse, error) {
	switch resp := response.(type) {
	case *dto.OpenAIResponsesResponse:
		return resp, nil
	case dto.OpenAIResponsesResponse:
		return &resp, nil
	default:
		return nil, fmt.Errorf("expected OAI responses response, got %T", response)
	}
}

func asOAIResponsesStreamResponse(response any) (*dto.ResponsesStreamResponse, error) {
	switch resp := response.(type) {
	case *dto.ResponsesStreamResponse:
		return resp, nil
	case dto.ResponsesStreamResponse:
		return &resp, nil
	default:
		return nil, fmt.Errorf("expected OAI responses stream response, got %T", response)
	}
}

func asClaudeResponse(response any) (*dto.ClaudeResponse, error) {
	switch resp := response.(type) {
	case *dto.ClaudeResponse:
		return resp, nil
	case dto.ClaudeResponse:
		return &resp, nil
	default:
		return nil, fmt.Errorf("expected Claude messages response, got %T", response)
	}
}

func asGeminiChatResponse(response any) (*dto.GeminiChatResponse, error) {
	switch resp := response.(type) {
	case *dto.GeminiChatResponse:
		return resp, nil
	case dto.GeminiChatResponse:
		return &resp, nil
	default:
		return nil, fmt.Errorf("expected Gemini chat response, got %T", response)
	}
}
