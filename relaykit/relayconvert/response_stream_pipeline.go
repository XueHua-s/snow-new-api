package relayconvert

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/convmeta"
	"github.com/QuantumNous/new-api/relaykit/types"
)

func ConvertStreamResponse(c context.Context, info convmeta.Meta, target types.RelayFormat, response any) (*ResponseResult, error) {
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
			Stream: true,
		}, nil
	}

	spec, ok := lookupResponseRoute(from, target)
	if !ok {
		return nil, fmt.Errorf("response converter from %s to %s is not registered", from, target)
	}
	return executeStatelessStreamResponseSpec(c, info, from, target, response, spec)
}

func NewResponseStreamState(from types.RelayFormat, target types.RelayFormat, options ResponseStreamOptions) (*ResponseStreamState, error) {
	if from == "" {
		return nil, errors.New("source relay format is required")
	}
	if target == "" {
		return nil, errors.New("target relay format is required")
	}
	if from == target {
		return &ResponseStreamState{
			From: from,
			To:   target,
		}, nil
	}

	spec, ok := lookupResponseRoute(from, target)
	if !ok {
		return nil, fmt.Errorf("response converter from %s to %s is not registered", from, target)
	}
	return newResponseStreamStateFromSpec(from, target, options, spec)
}

func NewResponseStreamStateByID(converter string, options ResponseStreamOptions) (*ResponseStreamState, error) {
	spec, ok := LookupResponseConverter(converter)
	if !ok {
		return nil, fmt.Errorf("response converter %q is not registered", strings.TrimSpace(converter))
	}
	return newResponseStreamStateFromSpec(spec.From, spec.To, options, spec)
}

func ConvertStreamResponseChunk(c context.Context, info convmeta.Meta, state *ResponseStreamState, response any) ([]ResponseResult, error) {
	if state == nil {
		return nil, errors.New("response stream state is required")
	}
	from, err := inferResponseRelayFormat(response)
	if err != nil {
		return nil, err
	}
	if from != state.From {
		return nil, fmt.Errorf("response stream converter %q expects %s response, got %s", state.Converter, state.From, from)
	}
	if state.From == state.To {
		usage := canonicalUsageFromResponse(response)
		state.rememberUsage(usage)
		return responseStreamResults(state, streamValuesFromAny(response), usage), nil
	}

	values, usage, err := executeResponseStreamSteps(c, info, state, []any{response}, 0)
	if err != nil {
		return nil, err
	}
	state.rememberUsage(usage)
	return responseStreamResults(state, values, usage), nil
}

func FinalizeStreamResponse(c context.Context, info convmeta.Meta, state *ResponseStreamState) ([]ResponseResult, error) {
	if state == nil {
		return nil, errors.New("response stream state is required")
	}
	if state.From == state.To {
		return nil, nil
	}

	if state.To == types.RelayFormatClaude && info != nil {
		claudeInfo := info.EnsureClaudeConvertInfo()
		if claudeInfo.Usage == nil {
			claudeInfo.Usage = state.Usage()
		}
	}

	values := make([]any, 0)
	var usage *dto.Usage
	for i, spec := range state.specs {
		finalValues, stepUsage, err := finalizeResponseStreamStep(c, info, spec, state.stepStates[i])
		if err != nil {
			return nil, err
		}
		if stepUsage != nil {
			usage = stepUsage
			state.rememberUsage(stepUsage)
		}
		if len(finalValues) == 0 {
			continue
		}
		current, currentUsage, err := executeResponseStreamSteps(c, info, state, finalValues, i+1)
		if err != nil {
			return nil, err
		}
		if currentUsage != nil {
			usage = currentUsage
			state.rememberUsage(currentUsage)
		}
		values = append(values, current...)
	}
	return responseStreamResults(state, values, usage), nil
}

func (s *ResponseStreamState) Usage() *dto.Usage {
	if s == nil {
		return nil
	}
	if s.usage != nil {
		return s.usage
	}
	for _, state := range s.stepStates {
		switch typed := state.(type) {
		case *ChatToResponsesStreamState:
			if typed.Usage != nil {
				return typed.Usage
			}
		case *ResponsesToChatStreamState:
			if typed.Usage != nil {
				return typed.Usage
			}
		}
	}
	return nil
}

func (s *ResponseStreamState) SetUsage(usage *dto.Usage) {
	if s == nil || usage == nil {
		return
	}
	s.usage = usage
	for _, state := range s.stepStates {
		switch typed := state.(type) {
		case *ChatToResponsesStreamState:
			typed.Usage = UsageFromChatUsage(usage)
		case *ResponsesToChatStreamState:
			typed.Usage = usage
		}
	}
}

func (s *ResponseStreamState) UsageText() string {
	if s == nil {
		return ""
	}
	for _, state := range s.stepStates {
		switch typed := state.(type) {
		case interface{ UsageText() string }:
			if text := typed.UsageText(); text != "" {
				return text
			}
		}
	}
	return ""
}

func executeStatelessStreamResponseSpec(c context.Context, info convmeta.Meta, from types.RelayFormat, target types.RelayFormat, response any, spec ResponseConverterSpec) (*ResponseResult, error) {
	steps, err := expandResponseConverterSteps(spec)
	if err != nil {
		return nil, err
	}
	current := response
	var usage *dto.Usage
	resultSteps := make([]ResponseStep, 0, len(steps))
	for _, step := range steps {
		if step.ConvertStream == nil {
			return nil, fmt.Errorf("response converter %q has no stream implementation", step.ID)
		}
		var err error
		current, usage, err = step.ConvertStream(c, info, current)
		if err != nil {
			return nil, err
		}
		resultSteps = append(resultSteps, ResponseStep{
			Converter: step.ID,
			From:      step.From,
			To:        step.To,
		})
	}
	return &ResponseResult{
		Value:     current,
		Usage:     usage,
		From:      from,
		To:        target,
		Converter: spec.ID,
		Quality:   spec.Quality,
		Steps:     resultSteps,
		Stream:    true,
	}, nil
}

func newResponseStreamStateFromSpec(from types.RelayFormat, target types.RelayFormat, options ResponseStreamOptions, spec ResponseConverterSpec) (*ResponseStreamState, error) {
	steps, err := expandResponseConverterSteps(spec)
	if err != nil {
		return nil, err
	}
	stepStates := make([]any, len(steps))
	resultSteps := make([]ResponseStep, 0, len(steps))
	for i, step := range steps {
		if step.NewStreamState != nil {
			stepStates[i] = step.NewStreamState(options)
		}
		resultSteps = append(resultSteps, ResponseStep{
			Converter: step.ID,
			From:      step.From,
			To:        step.To,
		})
	}
	return &ResponseStreamState{
		From:       from,
		To:         target,
		Converter:  spec.ID,
		Quality:    spec.Quality,
		Steps:      resultSteps,
		specs:      steps,
		stepStates: stepStates,
	}, nil
}

func executeResponseStreamSteps(c context.Context, info convmeta.Meta, state *ResponseStreamState, values []any, start int) ([]any, *dto.Usage, error) {
	current := values
	var usage *dto.Usage
	for i := start; i < len(state.specs); i++ {
		spec := state.specs[i]
		next := make([]any, 0)
		for _, value := range current {
			prepareResponseStreamInfo(info, spec)
			stepValues, stepUsage, err := executeResponseStreamStep(c, info, spec, state.stepStates[i], value)
			if err != nil {
				return nil, nil, err
			}
			if stepUsage != nil {
				usage = stepUsage
				state.rememberUsage(stepUsage)
			}
			next = append(next, stepValues...)
		}
		current = next
		if len(current) == 0 {
			return nil, usage, nil
		}
	}
	return current, usage, nil
}

func prepareResponseStreamInfo(info convmeta.Meta, spec ResponseConverterSpec) {
	if info == nil {
		return
	}
	if spec.From != types.RelayFormatOpenAI {
		return
	}
	if spec.To != types.RelayFormatClaude && spec.To != types.RelayFormatGemini {
		return
	}
	info.IncrSendResponseCount()
}

func executeResponseStreamStep(c context.Context, info convmeta.Meta, spec ResponseConverterSpec, state any, response any) ([]any, *dto.Usage, error) {
	if spec.ConvertStreamChunk != nil {
		return spec.ConvertStreamChunk(c, info, response, state)
	}
	if spec.ConvertStream == nil {
		return nil, nil, fmt.Errorf("response converter %q has no stream implementation", spec.ID)
	}
	value, usage, err := spec.ConvertStream(c, info, response)
	if err != nil {
		return nil, nil, err
	}
	return streamValuesFromAny(value), usage, nil
}

func finalizeResponseStreamStep(c context.Context, info convmeta.Meta, spec ResponseConverterSpec, state any) ([]any, *dto.Usage, error) {
	if spec.FinalizeStream == nil {
		return nil, nil, nil
	}
	return spec.FinalizeStream(c, info, state)
}

func (s *ResponseStreamState) rememberUsage(usage *dto.Usage) {
	if s != nil && usage != nil {
		s.usage = usage
	}
}

func responseStreamResults(state *ResponseStreamState, values []any, usage *dto.Usage) []ResponseResult {
	if state == nil || len(values) == 0 {
		return nil
	}
	results := make([]ResponseResult, 0, len(values))
	for _, value := range values {
		results = append(results, ResponseResult{
			Value:     value,
			Usage:     usage,
			From:      state.From,
			To:        state.To,
			Converter: state.Converter,
			Quality:   state.Quality,
			Steps:     append([]ResponseStep{}, state.Steps...),
			Stream:    true,
		})
	}
	return results
}

func streamValuesFromAny(value any) []any {
	if value == nil {
		return nil
	}
	rv := reflect.ValueOf(value)
	if rv.Kind() == reflect.Pointer && rv.IsNil() {
		return nil
	}
	if rv.Kind() != reflect.Slice && rv.Kind() != reflect.Array {
		return []any{value}
	}
	if rv.Type().Elem().Kind() == reflect.Uint8 {
		return []any{value}
	}
	values := make([]any, 0, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		item := rv.Index(i)
		if item.Kind() == reflect.Pointer && item.IsNil() {
			continue
		}
		values = append(values, item.Interface())
	}
	return values
}
