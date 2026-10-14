package relayconvert

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/convmeta"
	"github.com/QuantumNous/new-api/relaykit/types"
)

type ResponseConverterFunc func(c context.Context, info convmeta.Meta, response any) (any, *dto.Usage, error)

type ResponseStreamConverterFunc func(c context.Context, info convmeta.Meta, response any) (any, *dto.Usage, error)

type ResponseStreamStateFactory func(options ResponseStreamOptions) any

type ResponseStreamChunkConverterFunc func(c context.Context, info convmeta.Meta, response any, state any) ([]any, *dto.Usage, error)

type ResponseStreamFinalizerFunc func(c context.Context, info convmeta.Meta, state any) ([]any, *dto.Usage, error)

type ResponseConverterQuality string

const (
	ResponseConverterQualityGood        ResponseConverterQuality = "good"
	ResponseConverterQualityFair        ResponseConverterQuality = "fair"
	ResponseConverterQualityDiscouraged ResponseConverterQuality = "discouraged"
)

type ResponseStep struct {
	Converter string
	From      types.RelayFormat
	To        types.RelayFormat
}

type ResponseResult struct {
	Value     any
	Usage     *dto.Usage
	From      types.RelayFormat
	To        types.RelayFormat
	Converter string
	Quality   ResponseConverterQuality
	Steps     []ResponseStep
	Stream    bool
}

type ResponseConverterSpec struct {
	ID                 string
	From               types.RelayFormat
	To                 types.RelayFormat
	Quality            ResponseConverterQuality
	Convert            ResponseConverterFunc
	ConvertStream      ResponseStreamConverterFunc
	NewStreamState     ResponseStreamStateFactory
	ConvertStreamChunk ResponseStreamChunkConverterFunc
	FinalizeStream     ResponseStreamFinalizerFunc
	StepConverters     []string
}

type responseConverterRoute struct {
	from types.RelayFormat
	to   types.RelayFormat
}

type ResponseStreamOptions struct {
	ID           string
	Model        string
	Created      int64
	IncludeUsage bool
}

type ResponseStreamState struct {
	From      types.RelayFormat
	To        types.RelayFormat
	Converter string
	Quality   ResponseConverterQuality
	Steps     []ResponseStep

	specs      []ResponseConverterSpec
	stepStates []any
	usage      *dto.Usage
}

const (
	ResponseConverterOAIChatToOAIResponses   = "oai_chat_to_oai_responses_resp"
	ResponseConverterOAIResponsesToOAIChat   = "oai_responses_to_oai_chat_resp"
	ResponseConverterOAIChatToClaudeMessages = "oai_chat_to_claude_messages_resp"
	ResponseConverterOAIChatToGeminiChat     = "oai_chat_to_gemini_chat_resp"
	ResponseConverterClaudeMessagesToOAIChat = "claude_messages_to_oai_chat_resp"
	ResponseConverterGeminiChatToOAIChat     = "gemini_chat_to_oai_chat_resp"

	responseConverterClaudeToGemini    = "claude_messages_to_gemini_chat_resp"
	responseConverterClaudeToResponses = "claude_messages_to_oai_responses_resp"
	responseConverterGeminiToClaude    = "gemini_chat_to_claude_messages_resp"
	responseConverterGeminiToResponses = "gemini_chat_to_oai_responses_resp"
	responseConverterResponsesToClaude = "oai_responses_to_claude_messages_resp"
	responseConverterResponsesToGemini = "oai_responses_to_gemini_chat_resp"
)

var (
	responseConverterMu      sync.RWMutex
	responseConverters       = make(map[string]ResponseConverterSpec)
	responseConverterAliases = make(map[string]string)
	responseConverterRoutes  = make(map[responseConverterRoute]string)
)

func registerBuiltinResponseConverter(spec ResponseConverterSpec) {
	spec.ID = strings.TrimSpace(spec.ID)
	if spec.ID == "" {
		panic("response converter ID is required")
	}
	if spec.From == "" || spec.To == "" {
		panic(fmt.Sprintf("response converter %q must declare from and to formats", spec.ID))
	}
	if spec.Quality == "" {
		panic(fmt.Sprintf("response converter %q must declare quality", spec.ID))
	}
	if spec.Convert == nil &&
		spec.ConvertStream == nil &&
		spec.ConvertStreamChunk == nil &&
		len(spec.StepConverters) == 0 {
		panic(fmt.Sprintf("response converter %q must declare convert, stream convert, or step converters", spec.ID))
	}
	if len(spec.StepConverters) > 0 &&
		(spec.Convert != nil || spec.ConvertStream != nil || spec.NewStreamState != nil || spec.ConvertStreamChunk != nil || spec.FinalizeStream != nil) {
		panic(fmt.Sprintf("response converter %q cannot declare direct implementations and step converters together", spec.ID))
	}
	if _, exists := responseConverters[spec.ID]; exists {
		panic(fmt.Sprintf("response converter %q is already registered", spec.ID))
	}
	route := responseConverterRoute{from: spec.From, to: spec.To}
	if existingID, exists := responseConverterRoutes[route]; exists {
		panic(fmt.Sprintf("response converter route from %s to %s is already registered by %q", spec.From, spec.To, existingID))
	}

	if len(spec.StepConverters) > 0 {
		stepConverters := make([]string, 0, len(spec.StepConverters))
		current := spec.From
		for _, converterID := range spec.StepConverters {
			step, ok := responseConverters[converterID]
			if !ok {
				panic(fmt.Sprintf("response converter %q references unknown step converter %q", spec.ID, converterID))
			}
			if len(step.StepConverters) > 0 {
				panic(fmt.Sprintf("response converter %q step %q must be a direct converter", spec.ID, converterID))
			}
			if step.From != current {
				panic(fmt.Sprintf("response converter %q step %q expects %s after %s", spec.ID, converterID, step.From, current))
			}
			stepConverters = append(stepConverters, converterID)
			current = step.To
		}
		if current != spec.To {
			panic(fmt.Sprintf("response converter %q ends at %s, expected %s", spec.ID, current, spec.To))
		}
		spec.StepConverters = stepConverters
	}

	responseConverters[spec.ID] = spec
	responseConverterRoutes[route] = spec.ID
}

func registerResponseConverterAlias(alias string, converter string) {
	alias = strings.TrimSpace(alias)
	converter = strings.TrimSpace(converter)
	if alias == "" {
		panic("response converter alias is required")
	}
	if converter == "" {
		panic(fmt.Sprintf("response converter alias %q target is required", alias))
	}
	if alias == converter {
		return
	}
	if _, exists := responseConverters[alias]; exists {
		panic(fmt.Sprintf("response converter alias %q conflicts with registered converter", alias))
	}
	if _, exists := responseConverters[converter]; !exists {
		panic(fmt.Sprintf("response converter alias %q references unknown converter %q", alias, converter))
	}
	if existing, exists := responseConverterAliases[alias]; exists && existing != converter {
		panic(fmt.Sprintf("response converter alias %q is already registered for %q", alias, existing))
	}
	responseConverterAliases[alias] = converter
}

func LookupResponseConverter(converter string) (ResponseConverterSpec, bool) {
	responseConverterMu.RLock()
	defer responseConverterMu.RUnlock()

	converterID := resolveResponseConverterID(converter)
	spec, ok := responseConverters[converterID]
	if !ok {
		return ResponseConverterSpec{}, false
	}
	return cloneResponseConverterSpec(spec), true
}

func ConvertResponse(c context.Context, info convmeta.Meta, target types.RelayFormat, response any) (*ResponseResult, error) {
	from, err := inferResponseRelayFormat(response)
	if err != nil {
		return nil, err
	}
	if target == "" {
		return nil, errors.New("target relay format is required")
	}
	if from == target {
		return &ResponseResult{
			Value:  response,
			Usage:  canonicalUsageFromResponse(response),
			From:   from,
			To:     target,
			Stream: false,
		}, nil
	}

	spec, ok := lookupResponseRoute(from, target)
	if !ok {
		return nil, fmt.Errorf("response converter from %s to %s is not registered", from, target)
	}
	return executeResponseSpec(c, info, from, target, response, spec)
}

func ConvertResponseByID(c context.Context, info convmeta.Meta, converter string, response any) (*ResponseResult, error) {
	from, err := inferResponseRelayFormat(response)
	if err != nil {
		return nil, err
	}

	spec, ok := LookupResponseConverter(converter)
	if !ok {
		return nil, fmt.Errorf("response converter %q is not registered", strings.TrimSpace(converter))
	}
	if spec.From != "" && spec.From != from {
		return nil, fmt.Errorf("response converter %q expects %s response, got %s", spec.ID, spec.From, from)
	}
	return executeResponseSpec(c, info, from, spec.To, response, spec)
}

func executeResponseSpec(c context.Context, info convmeta.Meta, from types.RelayFormat, target types.RelayFormat, response any, spec ResponseConverterSpec) (*ResponseResult, error) {
	steps, err := expandResponseConverterSteps(spec)
	if err != nil {
		return nil, err
	}
	return executeResponseSteps(c, info, from, target, response, spec.ID, spec.Quality, steps)
}

func executeResponseSteps(c context.Context, info convmeta.Meta, from types.RelayFormat, target types.RelayFormat, response any, converter string, quality ResponseConverterQuality, specs []ResponseConverterSpec) (*ResponseResult, error) {
	current := response
	var usage *dto.Usage
	steps := make([]ResponseStep, 0, len(specs))
	for _, spec := range specs {
		var step ResponseStep
		var err error
		current, usage, step, err = executeResponseStep(c, info, spec, current)
		if err != nil {
			return nil, err
		}
		steps = append(steps, step)
	}

	converters := make([]string, 0, len(steps))
	for _, step := range steps {
		converters = append(converters, step.Converter)
	}
	if converter == "" {
		converter = strings.Join(converters, ",")
	}
	return &ResponseResult{
		Value:     current,
		Usage:     usage,
		From:      from,
		To:        target,
		Converter: converter,
		Quality:   quality,
		Steps:     steps,
		Stream:    false,
	}, nil
}

func executeResponseStep(c context.Context, info convmeta.Meta, spec ResponseConverterSpec, response any) (any, *dto.Usage, ResponseStep, error) {
	if spec.Convert == nil {
		return nil, nil, ResponseStep{}, fmt.Errorf("response converter %q has no non-stream implementation", spec.ID)
	}

	value, usage, err := spec.Convert(c, info, response)
	if err != nil {
		return nil, nil, ResponseStep{}, err
	}
	return value, usage, ResponseStep{
		Converter: spec.ID,
		From:      spec.From,
		To:        spec.To,
	}, nil
}

func expandResponseConverterSteps(spec ResponseConverterSpec) ([]ResponseConverterSpec, error) {
	if len(spec.StepConverters) == 0 {
		if spec.Convert == nil && spec.ConvertStream == nil && spec.ConvertStreamChunk == nil {
			return nil, fmt.Errorf("response converter %q has no registered implementation", spec.ID)
		}
		return []ResponseConverterSpec{spec}, nil
	}

	steps := make([]ResponseConverterSpec, 0, len(spec.StepConverters))
	current := spec.From
	for _, converterID := range spec.StepConverters {
		step, ok := LookupResponseConverter(converterID)
		if !ok {
			return nil, fmt.Errorf("response converter %q references missing step converter %q", spec.ID, converterID)
		}
		if len(step.StepConverters) > 0 {
			return nil, fmt.Errorf("response converter %q step %q is not a direct converter", spec.ID, converterID)
		}
		if step.From != current {
			return nil, fmt.Errorf("response converter %q step %q expects %s response, got %s", spec.ID, converterID, step.From, current)
		}
		steps = append(steps, step)
		current = step.To
	}
	if current != spec.To {
		return nil, fmt.Errorf("response converter %q ends at %s, expected %s", spec.ID, current, spec.To)
	}
	return steps, nil
}

func lookupResponseRoute(from types.RelayFormat, to types.RelayFormat) (ResponseConverterSpec, bool) {
	responseConverterMu.RLock()
	defer responseConverterMu.RUnlock()

	converterID, ok := responseConverterRoutes[responseConverterRoute{from: from, to: to}]
	if !ok {
		return ResponseConverterSpec{}, false
	}
	spec, ok := responseConverters[converterID]
	return cloneResponseConverterSpec(spec), ok
}

func resolveResponseConverterID(converter string) string {
	converter = strings.TrimSpace(converter)
	if canonical, ok := responseConverterAliases[converter]; ok {
		return canonical
	}
	return converter
}

func cloneResponseConverterSpec(spec ResponseConverterSpec) ResponseConverterSpec {
	if len(spec.StepConverters) > 0 {
		spec.StepConverters = append([]string{}, spec.StepConverters...)
	}
	return spec
}

func inferResponseRelayFormat(response any) (types.RelayFormat, error) {
	if isNilResponse(response) {
		return "", errors.New("response is nil")
	}
	switch response.(type) {
	case *dto.OpenAITextResponse, dto.OpenAITextResponse, *dto.ChatCompletionsStreamResponse, dto.ChatCompletionsStreamResponse:
		return types.RelayFormatOpenAI, nil
	case *dto.OpenAIResponsesResponse, dto.OpenAIResponsesResponse, *dto.ResponsesStreamResponse, dto.ResponsesStreamResponse:
		return types.RelayFormatOpenAIResponses, nil
	case *dto.ClaudeResponse, dto.ClaudeResponse:
		return types.RelayFormatClaude, nil
	case *dto.GeminiChatResponse, dto.GeminiChatResponse:
		return types.RelayFormatGemini, nil
	default:
		return "", fmt.Errorf("unsupported response type %T", response)
	}
}

func isNilResponse(response any) bool {
	if response == nil {
		return true
	}
	value := reflect.ValueOf(response)
	switch value.Kind() {
	case reflect.Chan, reflect.Func, reflect.Interface, reflect.Map, reflect.Pointer, reflect.Slice:
		return value.IsNil()
	default:
		return false
	}
}

func canonicalUsageFromResponse(response any) *dto.Usage {
	switch resp := response.(type) {
	case *dto.OpenAITextResponse:
		return UsageFromChatUsage(&resp.Usage)
	case dto.OpenAITextResponse:
		return UsageFromChatUsage(&resp.Usage)
	case *dto.ChatCompletionsStreamResponse:
		if resp.Usage == nil {
			return nil
		}
		return UsageFromChatUsage(resp.Usage)
	case dto.ChatCompletionsStreamResponse:
		if resp.Usage == nil {
			return nil
		}
		return UsageFromChatUsage(resp.Usage)
	case *dto.OpenAIResponsesResponse:
		return UsageFromResponsesUsage(resp.Usage)
	case dto.OpenAIResponsesResponse:
		return UsageFromResponsesUsage(resp.Usage)
	case *dto.ResponsesStreamResponse:
		if resp.Response == nil {
			return nil
		}
		return UsageFromResponsesUsage(resp.Response.Usage)
	case dto.ResponsesStreamResponse:
		if resp.Response == nil {
			return nil
		}
		return UsageFromResponsesUsage(resp.Response.Usage)
	case *dto.ClaudeResponse:
		return usageFromClaudeResponse(resp)
	case dto.ClaudeResponse:
		return usageFromClaudeResponse(&resp)
	case *dto.GeminiChatResponse:
		return UsageFromGeminiMetadata(resp.GetUsageMetadata(), 0)
	case dto.GeminiChatResponse:
		return UsageFromGeminiMetadata(resp.GetUsageMetadata(), 0)
	default:
		return nil
	}
}

func usageFromClaudeResponse(resp *dto.ClaudeResponse) *dto.Usage {
	if resp == nil {
		return nil
	}
	if resp.Usage != nil {
		return UsageFromClaudeAPIUsage(resp.Usage)
	}
	if resp.Message != nil && resp.Message.Usage != nil {
		return UsageFromClaudeAPIUsage(resp.Message.Usage)
	}
	return nil
}
