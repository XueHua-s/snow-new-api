package oairesponses

import (
	"fmt"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/relaykit/dto"
)

type responsesStreamTool struct {
	Key        string
	CallID     string
	ItemID     string
	Name       string
	Arguments  string
	Index      int
	Sent       bool
	NameSent   bool
	ArgsSentAt int
}

func (s *ResponsesToChatStreamState) toolItem(event *dto.ResponsesStreamResponse) []dto.ChatCompletionsStreamResponse {
	tool := s.ensureToolForEvent(event)
	if tool == nil {
		return nil
	}
	args := event.Item.ArgumentsString()
	if args != "" {
		tool.Arguments = args
	}
	return s.toolDelta(tool, "")
}

func (s *ResponsesToChatStreamState) toolArgumentsDelta(event *dto.ResponsesStreamResponse) []dto.ChatCompletionsStreamResponse {
	if event.Delta == "" {
		return nil
	}
	tool := s.findToolForEvent(event)
	if tool == nil {
		if event.OutputIndex != nil {
			s.pendingArgsByOutputIndex[*event.OutputIndex] += event.Delta
		} else if itemID := strings.TrimSpace(event.ItemID); itemID != "" {
			s.pendingArgsByItemID[itemID] += event.Delta
		}
		return nil
	}
	tool.Arguments += event.Delta
	return s.toolDelta(tool, event.Delta)
}

func (s *ResponsesToChatStreamState) flushPendingTool(event *dto.ResponsesStreamResponse) []dto.ChatCompletionsStreamResponse {
	tool := s.findToolForEvent(event)
	if tool == nil {
		tool = s.ensureFallbackToolForEvent(event)
	}
	if tool == nil {
		return nil
	}
	return s.toolDelta(tool, "")
}

func (s *ResponsesToChatStreamState) ensureToolForEvent(event *dto.ResponsesStreamResponse) *responsesStreamTool {
	if event == nil || event.Item == nil {
		return nil
	}
	key := s.keyForEvent(event)
	if key == "" {
		key = fallbackToolKey(event.Item.ID, event.Item.CallId, event.OutputIndex)
	}
	if key == "" {
		return nil
	}

	tool := s.toolByKey[key]
	if tool == nil {
		if itemID := responseStreamEventItemID(event); itemID != "" {
			if existingKey := s.itemIDToKey[itemID]; existingKey != "" {
				tool = s.toolByKey[existingKey]
			}
		}
		if tool == nil {
			if callID := strings.TrimSpace(event.Item.CallId); callID != "" {
				if existingKey := s.callIDToKey[callID]; existingKey != "" {
					tool = s.toolByKey[existingKey]
				}
			}
		}
		if tool != nil {
			s.toolByKey[key] = tool
		}
	}
	if tool == nil {
		tool = &responsesStreamTool{Key: key, Index: s.nextToolIndex}
		s.nextToolIndex++
		s.toolByKey[key] = tool
	}

	if event.OutputIndex != nil {
		s.outputIndexToKey[*event.OutputIndex] = key
		if pending := s.pendingArgsByOutputIndex[*event.OutputIndex]; pending != "" {
			tool.Arguments += pending
			delete(s.pendingArgsByOutputIndex, *event.OutputIndex)
		}
	}
	if itemID := responseStreamEventItemID(event); itemID != "" {
		tool.ItemID = itemID
		s.itemIDToKey[itemID] = key
		if pending := s.pendingArgsByItemID[itemID]; pending != "" {
			tool.Arguments += pending
			delete(s.pendingArgsByItemID, itemID)
		}
	}
	if callID := strings.TrimSpace(event.Item.CallId); callID != "" {
		tool.CallID = callID
		s.callIDToKey[callID] = key
	} else if tool.CallID == "" {
		tool.CallID = strings.TrimSpace(event.Item.ID)
	}
	if name := strings.TrimSpace(event.Item.Name); name != "" {
		tool.Name = name
	}
	return tool
}

func (s *ResponsesToChatStreamState) findToolForEvent(event *dto.ResponsesStreamResponse) *responsesStreamTool {
	if event == nil {
		return nil
	}
	if event.OutputIndex != nil {
		if key := s.outputIndexToKey[*event.OutputIndex]; key != "" {
			return s.toolByKey[key]
		}
	}
	if itemID := strings.TrimSpace(event.ItemID); itemID != "" {
		if key := s.itemIDToKey[itemID]; key != "" {
			return s.toolByKey[key]
		}
	}
	if event.Item != nil {
		if key := s.keyForEvent(event); key != "" {
			return s.toolByKey[key]
		}
	}
	return nil
}

func (s *ResponsesToChatStreamState) ensureFallbackToolForEvent(event *dto.ResponsesStreamResponse) *responsesStreamTool {
	if event == nil {
		return nil
	}
	key := ""
	if event.OutputIndex != nil {
		key = fmt.Sprintf("output:%d", *event.OutputIndex)
	}
	if key == "" && strings.TrimSpace(event.ItemID) != "" {
		key = "item:" + strings.TrimSpace(event.ItemID)
	}
	if key == "" {
		return nil
	}
	tool := s.toolByKey[key]
	if tool == nil {
		tool = &responsesStreamTool{
			Key:    key,
			Index:  s.nextToolIndex,
			CallID: fallbackCallID(event),
		}
		s.nextToolIndex++
		s.toolByKey[key] = tool
	}
	if event.OutputIndex != nil {
		s.outputIndexToKey[*event.OutputIndex] = key
		if pending := s.pendingArgsByOutputIndex[*event.OutputIndex]; pending != "" {
			tool.Arguments += pending
			delete(s.pendingArgsByOutputIndex, *event.OutputIndex)
		}
	}
	if itemID := responseStreamEventItemID(event); itemID != "" {
		tool.ItemID = itemID
		s.itemIDToKey[itemID] = key
		if pending := s.pendingArgsByItemID[itemID]; pending != "" {
			tool.Arguments += pending
			delete(s.pendingArgsByItemID, itemID)
		}
	}
	return tool
}

func (s *ResponsesToChatStreamState) toolDelta(tool *responsesStreamTool, explicitDelta string) []dto.ChatCompletionsStreamResponse {
	if tool == nil {
		return nil
	}

	argsDelta := explicitDelta
	if argsDelta == "" && len(tool.Arguments) > tool.ArgsSentAt {
		argsDelta = tool.Arguments[tool.ArgsSentAt:]
	}
	if tool.Sent && argsDelta == "" && (tool.Name == "" || tool.NameSent) {
		return nil
	}

	chunks := s.ensureStart()
	callID := strings.TrimSpace(tool.CallID)
	if callID == "" {
		callID = tool.Key
	}
	responseTool := dto.ToolCallResponse{
		ID:   callID,
		Type: "function",
		Function: dto.FunctionResponse{
			Arguments: argsDelta,
		},
	}
	responseTool.SetIndex(tool.Index)
	if !tool.NameSent && tool.Name != "" {
		responseTool.Function.Name = tool.Name
		tool.NameSent = true
	}
	if !tool.Sent {
		tool.Sent = true
	}
	if argsDelta != "" {
		tool.ArgsSentAt += len(argsDelta)
		s.usageText.WriteString(argsDelta)
	}
	if responseTool.Function.Name != "" {
		s.usageText.WriteString(responseTool.Function.Name)
	}

	chunks = append(chunks, s.makeChunk(dto.ChatCompletionsStreamResponseChoiceDelta{
		ToolCalls: []dto.ToolCallResponse{responseTool},
	}, nil))
	s.sawToolCall = true
	return chunks
}

func (s *ResponsesToChatStreamState) flushAllPendingTools() []dto.ChatCompletionsStreamResponse {
	keys := make([]string, 0, len(s.toolByKey)+len(s.pendingArgsByOutputIndex)+len(s.pendingArgsByItemID))
	seen := make(map[string]bool)
	for key := range s.toolByKey {
		keys = append(keys, key)
		seen[key] = true
	}
	for outputIndex := range s.pendingArgsByOutputIndex {
		key := fmt.Sprintf("output:%d", outputIndex)
		if !seen[key] {
			keys = append(keys, key)
			seen[key] = true
		}
	}
	for itemID := range s.pendingArgsByItemID {
		key := "item:" + itemID
		if !seen[key] {
			keys = append(keys, key)
			seen[key] = true
		}
	}
	sort.Strings(keys)

	var chunks []dto.ChatCompletionsStreamResponse
	for _, key := range keys {
		tool := s.toolByKey[key]
		if tool == nil {
			callID := strings.TrimPrefix(key, "item:")
			if strings.HasPrefix(key, "output:") {
				callID = "call_output_" + strings.TrimPrefix(key, "output:")
			}
			tool = &responsesStreamTool{
				Key:    key,
				Index:  s.nextToolIndex,
				CallID: callID,
			}
			s.nextToolIndex++
			s.toolByKey[key] = tool
		}
		if strings.HasPrefix(key, "output:") {
			var outputIndex int
			if _, err := fmt.Sscanf(key, "output:%d", &outputIndex); err == nil {
				tool.Arguments += s.pendingArgsByOutputIndex[outputIndex]
				delete(s.pendingArgsByOutputIndex, outputIndex)
			}
		}
		if strings.HasPrefix(key, "item:") {
			itemID := strings.TrimPrefix(key, "item:")
			tool.Arguments += s.pendingArgsByItemID[itemID]
			delete(s.pendingArgsByItemID, itemID)
		}
		chunks = append(chunks, s.toolDelta(tool, "")...)
	}
	return chunks
}

func (s *ResponsesToChatStreamState) keyForEvent(event *dto.ResponsesStreamResponse) string {
	if event == nil {
		return ""
	}
	if event.OutputIndex != nil {
		return fmt.Sprintf("output:%d", *event.OutputIndex)
	}
	if event.Item != nil {
		if itemID := strings.TrimSpace(event.Item.ID); itemID != "" {
			return "item:" + itemID
		}
		if callID := strings.TrimSpace(event.Item.CallId); callID != "" {
			return "call:" + callID
		}
	}
	if itemID := strings.TrimSpace(event.ItemID); itemID != "" {
		return "item:" + itemID
	}
	return ""
}
