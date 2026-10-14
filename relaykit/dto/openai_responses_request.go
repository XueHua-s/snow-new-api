package dto

import (
	"encoding/json"
	"net/http"
	"strings"

	kitutil "github.com/QuantumNous/new-api/relaykit/relayconvert/kitutil"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/samber/lo"
)

// https://platform.openai.com/docs/api-reference/responses/create
type OpenAIResponsesRequest struct {
	Model   string          `json:"model"`
	Input   json.RawMessage `json:"input,omitempty"`
	Include json.RawMessage `json:"include,omitempty"`
	// 在后台运行推理，暂时还不支持依赖的接口
	// Background         json.RawMessage `json:"background,omitempty"`
	Conversation      json.RawMessage `json:"conversation,omitempty"`
	ContextManagement json.RawMessage `json:"context_management,omitempty"`
	Instructions      json.RawMessage `json:"instructions,omitempty"`
	MaxOutputTokens   *uint           `json:"max_output_tokens,omitempty"`
	TopLogProbs       *int            `json:"top_logprobs,omitempty"`
	Metadata          json.RawMessage `json:"metadata,omitempty"`
	Moderation        json.RawMessage `json:"moderation,omitempty"`
	ParallelToolCalls json.RawMessage `json:"parallel_tool_calls,omitempty"`
	// FrequencyPenalty/PresencePenalty are not part of the official OpenAI
	// Responses API; they are forwarded verbatim for OpenAI-compatible upstreams
	// (e.g. vLLM) that accept them.
	FrequencyPenalty   json.RawMessage `json:"frequency_penalty,omitempty"`
	PresencePenalty    json.RawMessage `json:"presence_penalty,omitempty"`
	PreviousResponseID string          `json:"previous_response_id,omitempty"`
	Reasoning          *Reasoning      `json:"reasoning,omitempty"`
	// ServiceTier specifies upstream service level and may affect billing.
	// This field is filtered by default and can be enabled via channel setting allow_service_tier.
	ServiceTier string `json:"service_tier,omitempty"`
	// Store controls whether upstream may store request/response data.
	// This field is allowed by default and can be disabled via channel setting disable_store.
	Store                json.RawMessage `json:"store,omitempty"`
	PromptCacheKey       json.RawMessage `json:"prompt_cache_key,omitempty"`
	PromptCacheOptions   json.RawMessage `json:"prompt_cache_options,omitempty"`
	PromptCacheRetention json.RawMessage `json:"prompt_cache_retention,omitempty"`
	// SafetyIdentifier carries client identity for policy abuse detection.
	// This field is filtered by default and can be enabled via channel setting allow_safety_identifier.
	SafetyIdentifier json.RawMessage `json:"safety_identifier,omitempty"`
	Stream           *bool           `json:"stream,omitempty"`
	StreamOptions    *StreamOptions  `json:"stream_options,omitempty"`
	Temperature      *float64        `json:"temperature,omitempty"`
	Text             json.RawMessage `json:"text,omitempty"`
	ToolChoice       json.RawMessage `json:"tool_choice,omitempty"`
	Tools            json.RawMessage `json:"tools,omitempty"` // 需要处理的参数很少，MCP 参数太多不确定，所以用 map
	TopP             *float64        `json:"top_p,omitempty"`
	Truncation       json.RawMessage `json:"truncation,omitempty"`
	User             json.RawMessage `json:"user,omitempty"`
	MaxToolCalls     *uint           `json:"max_tool_calls,omitempty"`
	Prompt           json.RawMessage `json:"prompt,omitempty"`
	// Codex Responses metadata/client_metadata:
	// https://github.com/openai/codex/commit/14df0e8833aad0d6d78287954b61ffac67af936c
	ClientMetadata json.RawMessage `json:"client_metadata,omitempty"`
	// qwen
	EnableThinking json.RawMessage `json:"enable_thinking,omitempty"`
	ThinkingBudget json.RawMessage `json:"thinking_budget,omitempty"`
	// perplexity
	Preset json.RawMessage `json:"preset,omitempty"`
}

func (r OpenAIResponsesRequest) MarshalJSON() ([]byte, error) {
	type Alias OpenAIResponsesRequest
	if !IsQwenThinkingBudgetModel(r.Model) {
		r.ThinkingBudget = nil
	}
	return kitutil.Marshal((*Alias)(&r))
}

func (r *OpenAIResponsesRequest) GetTokenCountMeta() *types.TokenCountMeta {
	var fileMeta = make([]*types.FileMeta, 0)
	var texts = make([]string, 0)

	if r.Input != nil {
		inputs := r.ParseInput()
		for _, input := range inputs {
			if input.Type == "input_image" {
				if input.ImageUrl != "" {
					fileMeta = append(fileMeta, &types.FileMeta{
						FileType: types.FileTypeImage,
						Source:   types.NewFileSourceFromData(input.ImageUrl, ""),
						Detail:   input.Detail,
					})
				}
			} else if input.Type == "input_file" {
				if input.FileUrl != "" {
					fileMeta = append(fileMeta, &types.FileMeta{
						FileType: types.FileTypeFile,
						Source:   types.NewFileSourceFromData(input.FileUrl, ""),
					})
				}
			} else {
				texts = append(texts, input.Text)
			}
		}
	}

	if len(r.Instructions) > 0 {
		texts = append(texts, string(r.Instructions))
	}

	if len(r.Metadata) > 0 {
		texts = append(texts, string(r.Metadata))
	}

	if len(r.Text) > 0 {
		texts = append(texts, string(r.Text))
	}

	if len(r.ToolChoice) > 0 {
		texts = append(texts, string(r.ToolChoice))
	}

	if len(r.Prompt) > 0 {
		texts = append(texts, string(r.Prompt))
	}

	if len(r.Tools) > 0 {
		texts = append(texts, string(r.Tools))
	}

	return &types.TokenCountMeta{
		CombineText: strings.Join(texts, "\n"),
		Files:       fileMeta,
		MaxTokens:   int(lo.FromPtrOr(r.MaxOutputTokens, uint(0))),
	}
}

func (r *OpenAIResponsesRequest) IsStream(c *http.Request) bool {
	return lo.FromPtrOr(r.Stream, false)
}

func (r *OpenAIResponsesRequest) SetModelName(modelName string) {
	if modelName != "" {
		r.Model = modelName
	}
}

func (r *OpenAIResponsesRequest) GetToolsMap() []map[string]any {
	var toolsMap []map[string]any
	if len(r.Tools) > 0 {
		_ = kitutil.Unmarshal(r.Tools, &toolsMap)
	}
	return toolsMap
}

type Reasoning struct {
	Effort  string          `json:"effort,omitempty"`
	Summary string          `json:"summary,omitempty"`
	Mode    json.RawMessage `json:"mode,omitempty"`
	Context json.RawMessage `json:"context,omitempty"`
}

type Input struct {
	Type    string          `json:"type,omitempty"`
	Role    string          `json:"role,omitempty"`
	Content json.RawMessage `json:"content,omitempty"`
}

type MediaInput struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	FileUrl  string `json:"file_url,omitempty"`
	ImageUrl string `json:"image_url,omitempty"`
	Detail   string `json:"detail,omitempty"` // 仅 input_image 有效
}

// ParseInput parses the Responses API `input` field into a normalized slice of MediaInput.
// Reference implementation mirrors Message.ParseContent:
//   - input can be a string, treated as an input_text item
//   - input can be an array of objects with a `type` field
//     supported types: input_text, input_image, input_file
func (r *OpenAIResponsesRequest) ParseInput() []MediaInput {
	if r.Input == nil {
		return nil
	}

	var mediaInputs []MediaInput

	// Try string first
	// if str, ok := kitutil.GetJsonType(r.Input); ok {
	// 	inputs = append(inputs, MediaInput{Type: "input_text", Text: str})
	// 	return inputs
	// }
	if kitutil.GetJsonType(r.Input) == "string" {
		var str string
		_ = kitutil.Unmarshal(r.Input, &str)
		mediaInputs = append(mediaInputs, MediaInput{Type: "input_text", Text: str})
		return mediaInputs
	}

	// Try array of parts
	if kitutil.GetJsonType(r.Input) == "array" {
		var inputs []Input
		_ = kitutil.Unmarshal(r.Input, &inputs)
		for _, input := range inputs {
			if kitutil.GetJsonType(input.Content) == "string" {
				var str string
				_ = kitutil.Unmarshal(input.Content, &str)
				mediaInputs = append(mediaInputs, MediaInput{Type: "input_text", Text: str})
			}

			if kitutil.GetJsonType(input.Content) == "array" {
				var array []any
				_ = kitutil.Unmarshal(input.Content, &array)
				for _, itemAny := range array {
					// Already parsed MediaContent
					if media, ok := itemAny.(MediaInput); ok {
						mediaInputs = append(mediaInputs, media)
						continue
					}

					// Generic map
					item, ok := itemAny.(map[string]any)
					if !ok {
						continue
					}

					typeVal, ok := item["type"].(string)
					if !ok {
						continue
					}
					switch typeVal {
					case "input_text":
						text, _ := item["text"].(string)
						mediaInputs = append(mediaInputs, MediaInput{Type: "input_text", Text: text})
					case "input_image":
						// image_url may be string or object with url field
						var imageUrl string
						switch v := item["image_url"].(type) {
						case string:
							imageUrl = v
						case map[string]any:
							if url, ok := v["url"].(string); ok {
								imageUrl = url
							}
						}
						mediaInputs = append(mediaInputs, MediaInput{Type: "input_image", ImageUrl: imageUrl})
					case "input_file":
						// file_url may be string or object with url field
						var fileUrl string
						switch v := item["file_url"].(type) {
						case string:
							fileUrl = v
						case map[string]any:
							if url, ok := v["url"].(string); ok {
								fileUrl = url
							}
						}
						mediaInputs = append(mediaInputs, MediaInput{Type: "input_file", FileUrl: fileUrl})
					}
				}
			}
		}
	}

	return mediaInputs
}
