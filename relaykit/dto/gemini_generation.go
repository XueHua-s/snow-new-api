package dto

import (
	"encoding/json"

	kitutil "github.com/QuantumNous/new-api/relaykit/relayconvert/kitutil"
)

type GeminiThinkingConfig struct {
	IncludeThoughts bool `json:"includeThoughts,omitempty"`
	ThinkingBudget  *int `json:"thinkingBudget,omitempty"`
	// TODO Conflict with thinkingbudget.
	ThinkingLevel string `json:"thinkingLevel,omitempty"`
}

// UnmarshalJSON allows GeminiThinkingConfig to accept both snake_case and camelCase fields.
func (c *GeminiThinkingConfig) UnmarshalJSON(data []byte) error {
	type Alias GeminiThinkingConfig
	var aux struct {
		Alias
		IncludeThoughtsSnake *bool  `json:"include_thoughts,omitempty"`
		ThinkingBudgetSnake  *int   `json:"thinking_budget,omitempty"`
		ThinkingLevelSnake   string `json:"thinking_level,omitempty"`
	}

	if err := kitutil.Unmarshal(data, &aux); err != nil {
		return err
	}

	*c = GeminiThinkingConfig(aux.Alias)

	if aux.IncludeThoughtsSnake != nil {
		c.IncludeThoughts = *aux.IncludeThoughtsSnake
	}

	if aux.ThinkingBudgetSnake != nil {
		c.ThinkingBudget = aux.ThinkingBudgetSnake
	}

	if aux.ThinkingLevelSnake != "" {
		c.ThinkingLevel = aux.ThinkingLevelSnake
	}

	return nil
}

func (c *GeminiThinkingConfig) SetThinkingBudget(budget int) {
	c.ThinkingBudget = &budget
}

type GeminiChatGenerationConfig struct {
	Temperature                *float64              `json:"temperature,omitempty"`
	TopP                       *float64              `json:"topP,omitempty"`
	TopK                       *float64              `json:"topK,omitempty"`
	MaxOutputTokens            *uint                 `json:"maxOutputTokens,omitempty"`
	CandidateCount             *int                  `json:"candidateCount,omitempty"`
	StopSequences              []string              `json:"stopSequences,omitempty"`
	ResponseMimeType           string                `json:"responseMimeType,omitempty"`
	ResponseSchema             any                   `json:"responseSchema,omitempty"`
	ResponseJsonSchema         json.RawMessage       `json:"responseJsonSchema,omitempty"`
	PresencePenalty            *float32              `json:"presencePenalty,omitempty"`
	FrequencyPenalty           *float32              `json:"frequencyPenalty,omitempty"`
	ResponseLogprobs           *bool                 `json:"responseLogprobs,omitempty"`
	Logprobs                   *int32                `json:"logprobs,omitempty"`
	EnableEnhancedCivicAnswers *bool                 `json:"enableEnhancedCivicAnswers,omitempty"`
	MediaResolution            MediaResolution       `json:"mediaResolution,omitempty"`
	Seed                       *int64                `json:"seed,omitempty"`
	ResponseModalities         []string              `json:"responseModalities,omitempty"`
	ThinkingConfig             *GeminiThinkingConfig `json:"thinkingConfig,omitempty"`
	SpeechConfig               json.RawMessage       `json:"speechConfig,omitempty"` // RawMessage to allow flexible speech config
	ImageConfig                json.RawMessage       `json:"imageConfig,omitempty"`  // RawMessage to allow flexible image config
}

// UnmarshalJSON allows GeminiChatGenerationConfig to accept both snake_case and camelCase fields.
func (c *GeminiChatGenerationConfig) UnmarshalJSON(data []byte) error {
	type Alias GeminiChatGenerationConfig
	var aux struct {
		Alias
		TopPSnake                       *float64              `json:"top_p,omitempty"`
		TopKSnake                       *float64              `json:"top_k,omitempty"`
		MaxOutputTokensSnake            *uint                 `json:"max_output_tokens,omitempty"`
		CandidateCountSnake             *int                  `json:"candidate_count,omitempty"`
		StopSequencesSnake              []string              `json:"stop_sequences,omitempty"`
		ResponseMimeTypeSnake           string                `json:"response_mime_type,omitempty"`
		ResponseSchemaSnake             any                   `json:"response_schema,omitempty"`
		ResponseJsonSchemaSnake         json.RawMessage       `json:"response_json_schema,omitempty"`
		PresencePenaltySnake            *float32              `json:"presence_penalty,omitempty"`
		FrequencyPenaltySnake           *float32              `json:"frequency_penalty,omitempty"`
		ResponseLogprobsSnake           *bool                 `json:"response_logprobs,omitempty"`
		EnableEnhancedCivicAnswersSnake *bool                 `json:"enable_enhanced_civic_answers,omitempty"`
		MediaResolutionSnake            MediaResolution       `json:"media_resolution,omitempty"`
		ResponseModalitiesSnake         []string              `json:"response_modalities,omitempty"`
		ThinkingConfigSnake             *GeminiThinkingConfig `json:"thinking_config,omitempty"`
		SpeechConfigSnake               json.RawMessage       `json:"speech_config,omitempty"`
		ImageConfigSnake                json.RawMessage       `json:"image_config,omitempty"`
	}

	if err := kitutil.Unmarshal(data, &aux); err != nil {
		return err
	}

	*c = GeminiChatGenerationConfig(aux.Alias)

	// Prioritize snake_case if present
	if aux.TopPSnake != nil {
		c.TopP = aux.TopPSnake
	}
	if aux.TopKSnake != nil {
		c.TopK = aux.TopKSnake
	}
	if aux.MaxOutputTokensSnake != nil {
		c.MaxOutputTokens = aux.MaxOutputTokensSnake
	}
	if aux.CandidateCountSnake != nil {
		c.CandidateCount = aux.CandidateCountSnake
	}
	if len(aux.StopSequencesSnake) > 0 {
		c.StopSequences = aux.StopSequencesSnake
	}
	if aux.ResponseMimeTypeSnake != "" {
		c.ResponseMimeType = aux.ResponseMimeTypeSnake
	}
	if aux.ResponseSchemaSnake != nil {
		c.ResponseSchema = aux.ResponseSchemaSnake
	}
	if len(aux.ResponseJsonSchemaSnake) > 0 {
		c.ResponseJsonSchema = aux.ResponseJsonSchemaSnake
	}
	if aux.PresencePenaltySnake != nil {
		c.PresencePenalty = aux.PresencePenaltySnake
	}
	if aux.FrequencyPenaltySnake != nil {
		c.FrequencyPenalty = aux.FrequencyPenaltySnake
	}
	if aux.ResponseLogprobsSnake != nil {
		c.ResponseLogprobs = aux.ResponseLogprobsSnake
	}
	if aux.EnableEnhancedCivicAnswersSnake != nil {
		c.EnableEnhancedCivicAnswers = aux.EnableEnhancedCivicAnswersSnake
	}
	if aux.MediaResolutionSnake != "" {
		c.MediaResolution = aux.MediaResolutionSnake
	}
	if len(aux.ResponseModalitiesSnake) > 0 {
		c.ResponseModalities = aux.ResponseModalitiesSnake
	}
	if aux.ThinkingConfigSnake != nil {
		c.ThinkingConfig = aux.ThinkingConfigSnake
	}
	if len(aux.SpeechConfigSnake) > 0 {
		c.SpeechConfig = aux.SpeechConfigSnake
	}
	if len(aux.ImageConfigSnake) > 0 {
		c.ImageConfig = aux.ImageConfigSnake
	}

	return nil
}

type MediaResolution string
