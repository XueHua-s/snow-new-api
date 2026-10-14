package dto

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	kitutil "github.com/QuantumNous/new-api/relaykit/relayconvert/kitutil"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/samber/lo"
)

type ResponseFormat struct {
	Type       string          `json:"type,omitempty"`
	JsonSchema json.RawMessage `json:"json_schema,omitempty"`
}

type FormatJsonSchema struct {
	Description string          `json:"description,omitempty"`
	Name        string          `json:"name"`
	Schema      any             `json:"schema,omitempty"`
	Strict      json.RawMessage `json:"strict,omitempty"`
}

// GeneralOpenAIRequest represents a general request structure for OpenAI-compatible APIs.
// 参数增加规范：无引用的参数必须使用json.RawMessage类型，并添加omitempty标签
type GeneralOpenAIRequest struct {
	Model               string            `json:"model,omitempty"`
	Messages            []Message         `json:"messages,omitempty"`
	Prompt              any               `json:"prompt,omitempty"`
	Prefix              any               `json:"prefix,omitempty"`
	Suffix              any               `json:"suffix,omitempty"`
	Stream              *bool             `json:"stream,omitempty"`
	StreamOptions       *StreamOptions    `json:"stream_options,omitempty"`
	MaxTokens           *uint             `json:"max_tokens,omitempty"`
	MaxCompletionTokens *uint             `json:"max_completion_tokens,omitempty"`
	ReasoningEffort     string            `json:"reasoning_effort,omitempty"`
	Verbosity           json.RawMessage   `json:"verbosity,omitempty"` // gpt-5
	Temperature         *float64          `json:"temperature,omitempty"`
	TopP                *float64          `json:"top_p,omitempty"`
	TopK                *int              `json:"top_k,omitempty"`
	Stop                any               `json:"stop,omitempty"`
	N                   *int              `json:"n,omitempty"`
	Input               any               `json:"input,omitempty"`
	Instruction         string            `json:"instruction,omitempty"`
	Size                string            `json:"size,omitempty"`
	Functions           json.RawMessage   `json:"functions,omitempty"`
	FrequencyPenalty    *float64          `json:"frequency_penalty,omitempty"`
	PresencePenalty     *float64          `json:"presence_penalty,omitempty"`
	ResponseFormat      *ResponseFormat   `json:"response_format,omitempty"`
	EncodingFormat      json.RawMessage   `json:"encoding_format,omitempty"`
	Seed                *float64          `json:"seed,omitempty"`
	ParallelTooCalls    *bool             `json:"parallel_tool_calls,omitempty"`
	Tools               []ToolCallRequest `json:"tools,omitempty"`
	ToolChoice          any               `json:"tool_choice,omitempty"`
	FunctionCall        json.RawMessage   `json:"function_call,omitempty"`
	User                json.RawMessage   `json:"user,omitempty"`
	// ServiceTier specifies upstream service level and may affect billing.
	// This field is filtered by default and can be enabled via channel setting allow_service_tier.
	ServiceTier json.RawMessage `json:"service_tier,omitempty"`
	LogProbs    *bool           `json:"logprobs,omitempty"`
	TopLogProbs *int            `json:"top_logprobs,omitempty"`
	Dimensions  *int            `json:"dimensions,omitempty"`
	Modalities  json.RawMessage `json:"modalities,omitempty"`
	Audio       json.RawMessage `json:"audio,omitempty"`
	// 安全标识符，用于帮助 OpenAI 检测可能违反使用政策的应用程序用户
	// 注意：此字段会向 OpenAI 发送用户标识信息，默认过滤，可通过 allow_safety_identifier 开启
	SafetyIdentifier json.RawMessage `json:"safety_identifier,omitempty"`
	// Whether or not to store the output of this chat completion request for use in our model distillation or evals products.
	// 是否存储此次请求数据供 OpenAI 用于评估和优化产品
	// 注意：默认允许透传，可通过 disable_store 禁用；禁用后可能导致 Codex 无法正常使用
	Store json.RawMessage `json:"store,omitempty"`
	// Used by OpenAI to cache responses for similar requests to optimize your cache hit rates. Replaces the user field
	PromptCacheKey       string          `json:"prompt_cache_key,omitempty"`
	PromptCacheRetention json.RawMessage `json:"prompt_cache_retention,omitempty"`
	LogitBias            json.RawMessage `json:"logit_bias,omitempty"`
	Metadata             json.RawMessage `json:"metadata,omitempty"`
	Prediction           json.RawMessage `json:"prediction,omitempty"`
	// gemini
	ExtraBody json.RawMessage `json:"extra_body,omitempty"`
	//xai
	SearchParameters json.RawMessage `json:"search_parameters,omitempty"`
	// claude
	WebSearchOptions *WebSearchOptions `json:"web_search_options,omitempty"`
	// OpenRouter Params
	Usage     json.RawMessage `json:"usage,omitempty"`
	Reasoning json.RawMessage `json:"reasoning,omitempty"`
	// Ali Qwen Params
	VlHighResolutionImages json.RawMessage `json:"vl_high_resolution_images,omitempty"`
	EnableThinking         json.RawMessage `json:"enable_thinking,omitempty"`
	ThinkingBudget         json.RawMessage `json:"thinking_budget,omitempty"`
	ChatTemplateKwargs     json.RawMessage `json:"chat_template_kwargs,omitempty"`
	EnableSearch           json.RawMessage `json:"enable_search,omitempty"`
	// ollama Params
	Think json.RawMessage `json:"think,omitempty"`
	// baidu v2
	WebSearch json.RawMessage `json:"web_search,omitempty"`
	// doubao,zhipu_v4
	THINKING json.RawMessage `json:"thinking,omitempty"`
	// pplx Params
	SearchDomainFilter     json.RawMessage `json:"search_domain_filter,omitempty"`
	SearchRecencyFilter    json.RawMessage `json:"search_recency_filter,omitempty"`
	ReturnImages           *bool           `json:"return_images,omitempty"`
	ReturnRelatedQuestions *bool           `json:"return_related_questions,omitempty"`
	SearchMode             json.RawMessage `json:"search_mode,omitempty"`
	// Minimax
	ReasoningSplit json.RawMessage `json:"reasoning_split,omitempty"`
}

func (r GeneralOpenAIRequest) MarshalJSON() ([]byte, error) {
	type Alias GeneralOpenAIRequest
	if !IsQwenThinkingBudgetModel(r.Model) {
		r.ThinkingBudget = nil
	}
	return kitutil.Marshal((*Alias)(&r))
}

func (r *GeneralOpenAIRequest) GetTokenCountMeta() *types.TokenCountMeta {
	var tokenCountMeta types.TokenCountMeta
	var texts = make([]string, 0)
	var fileMeta = make([]*types.FileMeta, 0)

	if r.Prompt != nil {
		switch v := r.Prompt.(type) {
		case string:
			texts = append(texts, v)
		case []any:
			for _, item := range v {
				if str, ok := item.(string); ok {
					texts = append(texts, str)
				}
			}
		default:
			texts = append(texts, fmt.Sprintf("%v", r.Prompt))
		}
	}

	if r.Input != nil {
		inputs := r.ParseInput()
		texts = append(texts, inputs...)
	}

	maxTokens := lo.FromPtrOr(r.MaxTokens, uint(0))
	maxCompletionTokens := lo.FromPtrOr(r.MaxCompletionTokens, uint(0))
	if maxCompletionTokens > maxTokens {
		tokenCountMeta.MaxTokens = int(maxCompletionTokens)
	} else {
		tokenCountMeta.MaxTokens = int(maxTokens)
	}

	for _, message := range r.Messages {
		tokenCountMeta.MessagesCount++
		texts = append(texts, message.Role)
		if message.Content != nil {
			if message.Name != nil {
				tokenCountMeta.NameCount++
				texts = append(texts, *message.Name)
			}
			arrayContent := message.ParseContent()
			for _, m := range arrayContent {
				source := m.ToFileSource()
				if source != nil {
					meta := &types.FileMeta{Source: source}
					switch m.Type {
					case ContentTypeImageURL:
						meta.FileType = types.FileTypeImage
						if img := m.GetImageMedia(); img != nil {
							meta.Detail = img.Detail
						}
					case ContentTypeInputAudio:
						meta.FileType = types.FileTypeAudio
					case ContentTypeFile:
						meta.FileType = types.FileTypeFile
					case ContentTypeVideoUrl:
						meta.FileType = types.FileTypeVideo
					}
					fileMeta = append(fileMeta, meta)
				} else if m.Type == ContentTypeText {
					texts = append(texts, m.Text)
				}
			}
		}
	}

	if r.Tools != nil {
		openaiTools := r.Tools
		for _, tool := range openaiTools {
			tokenCountMeta.ToolsCount++
			texts = append(texts, tool.Function.Name)
			if tool.Function.Description != "" {
				texts = append(texts, tool.Function.Description)
			}
			if tool.Function.Parameters != nil {
				texts = append(texts, fmt.Sprintf("%v", tool.Function.Parameters))
			}
		}
		//toolTokens := CountTokenInput(countStr, request.Model)
		//tkm += 8
		//tkm += toolTokens
	}
	tokenCountMeta.CombineText = strings.Join(texts, "\n")
	tokenCountMeta.Files = fileMeta
	return &tokenCountMeta
}

func (r *GeneralOpenAIRequest) IsStream(c *http.Request) bool {
	return lo.FromPtrOr(r.Stream, false)
}

func (r *GeneralOpenAIRequest) SetModelName(modelName string) {
	if modelName != "" {
		r.Model = modelName
	}
}

func (r *GeneralOpenAIRequest) ToMap() map[string]any {
	result := make(map[string]any)
	data, _ := kitutil.Marshal(r)
	_ = kitutil.Unmarshal(data, &result)
	return result
}

func IsOpenAIReasoningOModel(modelName string) bool {
	return strings.HasPrefix(modelName, "o1") ||
		strings.HasPrefix(modelName, "o3") ||
		strings.HasPrefix(modelName, "o4")
}

func IsOpenAIGPT5Model(modelName string) bool {
	return strings.HasPrefix(modelName, "gpt-5")
}

func IsQwenThinkingBudgetModel(modelName string) bool {
	normalized := strings.ToLower(strings.TrimSpace(modelName))
	return strings.HasPrefix(normalized, "qwen") ||
		strings.Contains(normalized, "/qwen") ||
		strings.HasPrefix(normalized, "qwq") ||
		strings.Contains(normalized, "/qwq")
}

func (r *GeneralOpenAIRequest) GetSystemRoleName() string {
	if IsOpenAIReasoningOModel(r.Model) {
		if !strings.HasPrefix(r.Model, "o1-mini") && !strings.HasPrefix(r.Model, "o1-preview") {
			return "developer"
		}
	} else if IsOpenAIGPT5Model(r.Model) {
		return "developer"
	}
	return "system"
}

const CustomType = "custom"

type ToolCallRequest struct {
	ID       string          `json:"id,omitempty"`
	Type     string          `json:"type"`
	Function FunctionRequest `json:"function,omitempty"`
	Custom   json.RawMessage `json:"custom,omitempty"`
}

type FunctionRequest struct {
	Description string `json:"description,omitempty"`
	Name        string `json:"name"`
	Parameters  any    `json:"parameters,omitempty"`
	Arguments   string `json:"arguments,omitempty"`
}

type StreamOptions struct {
	IncludeUsage bool `json:"include_usage,omitempty"`
	// IncludeObfuscation is only for /v1/responses stream payload.
	// This field is filtered by default and can be enabled via channel setting allow_include_obfuscation.
	IncludeObfuscation       bool   `json:"include_obfuscation,omitempty"`
	ReasoningSummaryDelivery string `json:"reasoning_summary_delivery,omitempty"`
}

func (r *GeneralOpenAIRequest) GetMaxTokens() uint {
	maxCompletionTokens := lo.FromPtrOr(r.MaxCompletionTokens, uint(0))
	if maxCompletionTokens != 0 {
		return maxCompletionTokens
	}
	return lo.FromPtrOr(r.MaxTokens, uint(0))
}

func (r *GeneralOpenAIRequest) ParseInput() []string {
	if r.Input == nil {
		return nil
	}
	var input []string
	switch r.Input.(type) {
	case string:
		input = []string{r.Input.(string)}
	case []any:
		input = make([]string, 0, len(r.Input.([]any)))
		for _, item := range r.Input.([]any) {
			if str, ok := item.(string); ok {
				input = append(input, str)
			}
		}
	}
	return input
}
