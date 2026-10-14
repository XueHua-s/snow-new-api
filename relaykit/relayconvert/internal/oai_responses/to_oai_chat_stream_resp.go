package oairesponses

import (
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/relaykit/dto"
	kitutil "github.com/QuantumNous/new-api/relaykit/relayconvert/kitutil"
)

type ResponsesToChatStreamState struct {
	ID           string
	Model        string
	Created      int64
	IncludeUsage bool

	Usage *dto.Usage

	sentStart                  bool
	finalized                  bool
	hasSentText                bool
	sawToolCall                bool
	hasSentReasoning           bool
	needsReasoningSummaryBreak bool
	nextToolIndex              int
	toolByKey                  map[string]*responsesStreamTool
	outputIndexToKey           map[int]string
	itemIDToKey                map[string]string
	callIDToKey                map[string]string
	pendingArgsByOutputIndex   map[int]string
	pendingArgsByItemID        map[string]string
	usageText                  strings.Builder
}

func NewResponsesToChatStreamState(model string, includeUsage bool) *ResponsesToChatStreamState {
	return &ResponsesToChatStreamState{
		Model:                    model,
		Created:                  time.Now().Unix(),
		IncludeUsage:             includeUsage,
		Usage:                    &dto.Usage{},
		toolByKey:                make(map[string]*responsesStreamTool),
		outputIndexToKey:         make(map[int]string),
		itemIDToKey:              make(map[string]string),
		callIDToKey:              make(map[string]string),
		pendingArgsByOutputIndex: make(map[int]string),
		pendingArgsByItemID:      make(map[string]string),
	}
}

func (s *ResponsesToChatStreamState) UsageText() string {
	if s == nil {
		return ""
	}
	return s.usageText.String()
}

func ResponsesStreamEventToChatChunks(event *dto.ResponsesStreamResponse, state *ResponsesToChatStreamState) ([]dto.ChatCompletionsStreamResponse, error) {
	if event == nil || state == nil {
		return nil, nil
	}

	switch event.Type {
	case responsesEventCreated:
		state.applyResponseMetadata(event.Response)
		return state.ensureStart(), nil
	case responsesEventReasoningSummaryDelta, responsesEventReasoningTextDelta:
		return state.reasoningDelta(event.Delta), nil
	case responsesEventReasoningSummaryDone, responsesEventReasoningTextDone:
		if state.hasSentReasoning {
			state.needsReasoningSummaryBreak = true
		}
		return nil, nil
	case responsesEventOutputTextDelta:
		return state.textDelta(event.Delta), nil
	case responsesEventOutputItemAdded, responsesEventOutputItemDone:
		if event.Item == nil || !isResponsesToolOutputType(event.Item.Type) {
			return nil, nil
		}
		return state.toolItem(event), nil
	case responsesEventFunctionArgsDelta, responsesEventCustomToolInputDelta:
		return state.toolArgumentsDelta(event), nil
	case responsesEventFunctionArgsDone, responsesEventCustomToolInputDone:
		return state.flushPendingTool(event), nil
	case responsesEventCompleted, responsesEventDone, responsesEventIncomplete:
		response := event.Response
		if event.Type == responsesEventIncomplete {
			response = ensureIncompleteResponse(response)
		}
		state.applyResponseMetadata(response)
		chunks := state.terminalOutputChunks(response)
		chunks = append(chunks, state.finalize(response)...)
		return chunks, nil
	case responsesEventFailed, responsesEventError:
		return nil, fmt.Errorf("responses stream error: %s", event.Type)
	default:
		return nil, nil
	}
}

func FinalizeResponsesToChatStream(state *ResponsesToChatStreamState) []dto.ChatCompletionsStreamResponse {
	if state == nil {
		return nil
	}
	return state.finalize(nil)
}

func (s *ResponsesToChatStreamState) applyResponseMetadata(response *dto.OpenAIResponsesResponse) {
	if response == nil {
		return
	}
	if response.ID != "" && s.ID == "" {
		s.ID = response.ID
	}
	if response.Model != "" {
		s.Model = response.Model
	}
	if response.CreatedAt != 0 {
		s.Created = int64(response.CreatedAt)
	}
	if response.Usage != nil {
		s.Usage = UsageFromResponsesUsage(response.Usage)
	}
}

func (s *ResponsesToChatStreamState) ensureStart() []dto.ChatCompletionsStreamResponse {
	if s.sentStart {
		return nil
	}
	s.sentStart = true
	return []dto.ChatCompletionsStreamResponse{s.makeChunk(dto.ChatCompletionsStreamResponseChoiceDelta{
		Role:    "assistant",
		Content: kitutil.GetPointer(""),
	}, nil)}
}

func (s *ResponsesToChatStreamState) textDelta(delta string) []dto.ChatCompletionsStreamResponse {
	if delta == "" {
		return nil
	}
	s.usageText.WriteString(delta)
	s.hasSentText = true
	chunks := s.ensureStart()
	chunks = append(chunks, s.makeChunk(dto.ChatCompletionsStreamResponseChoiceDelta{
		Content: &delta,
	}, nil))
	return chunks
}

func (s *ResponsesToChatStreamState) terminalOutputChunks(response *dto.OpenAIResponsesResponse) []dto.ChatCompletionsStreamResponse {
	if s == nil || response == nil || len(response.Output) == 0 {
		return nil
	}

	var chunks []dto.ChatCompletionsStreamResponse
	for i := range response.Output {
		out := &response.Output[i]
		switch {
		case out.Type == responsesOutputTypeMessage && !s.hasSentText:
			var text strings.Builder
			for _, c := range out.Content {
				if c.Type == "output_text" && c.Text != "" {
					text.WriteString(c.Text)
				}
			}
			chunks = append(chunks, s.textDelta(text.String())...)
		case out.Type == responsesOutputTypeReasoning && !s.hasSentReasoning:
			var reasoning strings.Builder
			for _, c := range out.Content {
				if c.Text != "" {
					reasoning.WriteString(c.Text)
				}
			}
			chunks = append(chunks, s.reasoningDelta(reasoning.String())...)
		case isResponsesToolOutputType(out.Type):
			chunks = append(chunks, s.toolItem(&dto.ResponsesStreamResponse{Item: out})...)
		}
	}
	return chunks
}

func (s *ResponsesToChatStreamState) reasoningDelta(delta string) []dto.ChatCompletionsStreamResponse {
	if delta == "" {
		return nil
	}
	if s.needsReasoningSummaryBreak {
		if strings.HasPrefix(delta, "\n\n") {
			s.needsReasoningSummaryBreak = false
		} else if strings.HasPrefix(delta, "\n") {
			delta = "\n" + delta
			s.needsReasoningSummaryBreak = false
		} else {
			delta = "\n\n" + delta
			s.needsReasoningSummaryBreak = false
		}
	}
	s.usageText.WriteString(delta)
	chunks := s.ensureStart()
	chunks = append(chunks, s.makeChunk(dto.ChatCompletionsStreamResponseChoiceDelta{
		ReasoningContent: &delta,
	}, nil))
	s.hasSentReasoning = true
	return chunks
}

func (s *ResponsesToChatStreamState) finalize(response *dto.OpenAIResponsesResponse) []dto.ChatCompletionsStreamResponse {
	if s.finalized {
		return nil
	}
	s.finalized = true

	chunks := s.flushAllPendingTools()
	chunks = append(chunks, s.ensureStart()...)

	finishReason := "stop"
	if mappedReason, ok := ResponsesFinishReasonFromStatus(response); ok {
		finishReason = mappedReason
	} else if s.sawToolCall {
		finishReason = "tool_calls"
	}
	chunks = append(chunks, s.makeChunk(dto.ChatCompletionsStreamResponseChoiceDelta{}, &finishReason))
	if s.IncludeUsage && s.Usage != nil {
		chunks = append(chunks, dto.ChatCompletionsStreamResponse{
			Id:      s.ID,
			Object:  "chat.completion.chunk",
			Created: s.Created,
			Model:   s.Model,
			Choices: make([]dto.ChatCompletionsStreamResponseChoice, 0),
			Usage:   s.Usage,
		})
	}
	return chunks
}

func (s *ResponsesToChatStreamState) makeChunk(delta dto.ChatCompletionsStreamResponseChoiceDelta, finishReason *string) dto.ChatCompletionsStreamResponse {
	return dto.ChatCompletionsStreamResponse{
		Id:      s.ID,
		Object:  "chat.completion.chunk",
		Created: s.Created,
		Model:   s.Model,
		Choices: []dto.ChatCompletionsStreamResponseChoice{
			{
				Index:        0,
				Delta:        delta,
				FinishReason: finishReason,
			},
		},
	}
}
