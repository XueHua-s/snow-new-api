package service

import (
	"strings"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/relayconvert"
)

// ResponsesUsageAccumulator owns the accounting facts for one Responses stream.
// HTTP SSE and WebSocket transports feed the same events into it, then settle
// Finish's usage through the normal text billing path, including interrupted
// streams. Observe and Finish must be called by the same stream owner.
type ResponsesUsageAccumulator struct {
	info           *relaycommon.RelayInfo
	usage          *dto.Usage
	outputText     strings.Builder
	imageCounter   relaycommon.ImageGenerationCallCounter
	imageCommitted bool
	finished       bool
}

func NewResponsesUsageAccumulator(info *relaycommon.RelayInfo) *ResponsesUsageAccumulator {
	return &ResponsesUsageAccumulator{info: info, usage: &dto.Usage{}}
}

func (a *ResponsesUsageAccumulator) Observe(event *dto.ResponsesStreamResponse) {
	if a == nil || event == nil || a.finished {
		return
	}
	switch event.Type {
	case "response.completed", "response.done", "response.failed", "response.incomplete", "response.cancelled", "response.canceled":
		if event.Response != nil {
			ApplyResponsesUsage(a.usage, event.Response.Usage)
		}
		if a.imageCommitted {
			return
		}
		failed := event.Type != "response.completed" && event.Type != "response.done"
		if failed || (event.Response != nil && relaycommon.IsNonBillableResponsesStatus(event.Response.Status)) {
			a.imageCounter.Reset()
		} else if event.Response != nil {
			for i := range event.Response.Output {
				a.imageCounter.Observe(&event.Response.Output[i], &i)
			}
		}
		a.imageCounter.Commit(a.info)
		a.imageCommitted = true
	case "response.output_text.delta":
		a.outputText.WriteString(event.Delta)
	case dto.ResponsesOutputTypeItemDone:
		if event.Item == nil {
			return
		}
		switch event.Item.Type {
		case dto.BuildInCallWebSearchCall, dto.BuildInCallFileSearchCall, dto.BuildInCallFunctionCall:
			a.info.CountBillableToolCall(event.Item.Type, event.Item.Name)
		case dto.ResponsesOutputTypeImageGenerationCall:
			if !a.imageCommitted {
				a.imageCounter.Observe(event.Item, event.OutputIndex)
			}
		}
	}
}

func (a *ResponsesUsageAccumulator) Finish() *dto.Usage {
	if a.finished {
		return a.usage
	}
	a.finished = true
	// A final image item can already have reached the client before the stream
	// disconnects. Explicit failed/incomplete terminals reset and commit zero in
	// Observe; otherwise retain completed tool usage even without a terminal.
	if !a.imageCommitted {
		a.imageCounter.Commit(a.info)
		a.imageCommitted = true
	}
	if a.usage.CompletionTokens == 0 {
		if output := a.outputText.String(); output != "" {
			a.usage.CompletionTokens = CountTextToken(output, a.info.GetUpstreamModelName())
		}
	}
	if a.usage.PromptTokens == 0 && a.usage.CompletionTokens != 0 {
		a.usage.PromptTokens = a.info.GetEstimatePromptTokens()
	}
	a.usage.TotalTokens = a.usage.PromptTokens + a.usage.CompletionTokens
	if a.usage.BillingUsage != nil {
		snapshot := dto.CloneBillingUsage(a.usage.BillingUsage)
		if native := snapshot.OpenAIUsage; native != nil && native.CompletionTokens == 0 && native.OutputTokens == 0 && a.usage.CompletionTokens > 0 {
			native.CompletionTokens = a.usage.CompletionTokens
			native.OutputTokens = a.usage.CompletionTokens
			native.TotalTokens = max(native.PromptTokens, native.InputTokens) + a.usage.CompletionTokens
			snapshot.Estimated = true
		}
		a.usage.BillingUsage = snapshot
	}
	return a.usage
}

func ApplyResponsesUsage(dst *dto.Usage, src *dto.Usage) {
	if dst == nil || src == nil {
		return
	}
	hadUsage := dst.PromptTokens != 0 || dst.CompletionTokens != 0
	incoming := relayconvert.UsageFromResponsesUsage(src)
	incoming.BillingUsage = dto.CloneBillingUsage(src.BillingUsage)
	if src.InputTokensDetails != nil {
		inputDetails := *src.InputTokensDetails
		incoming.InputTokensDetails = &inputDetails
	}
	if src.OutputTokensDetails != nil {
		incoming.CompletionTokenDetails = *src.OutputTokensDetails
	}
	incoming.PromptCacheHitTokens = src.PromptCacheHitTokens
	// Terminal snapshots omit fields on some compatible providers. Keep prior
	// nonzero accounting facts when a later snapshot omits them.
	if incoming.PromptTokens != 0 {
		dst.PromptTokens = incoming.PromptTokens
	}
	if incoming.CompletionTokens != 0 {
		dst.CompletionTokens = incoming.CompletionTokens
	}
	if incoming.TotalTokens != 0 {
		dst.TotalTokens = incoming.TotalTokens
	}
	if incoming.InputTokens != 0 {
		dst.InputTokens = incoming.InputTokens
	}
	if incoming.OutputTokens != 0 {
		dst.OutputTokens = incoming.OutputTokens
	}
	for _, pair := range [][2]*int{
		{&dst.PromptTokensDetails.CachedTokens, &incoming.PromptTokensDetails.CachedTokens},
		{&dst.PromptTokensDetails.CachedCreationTokens, &incoming.PromptTokensDetails.CachedCreationTokens},
		{&dst.PromptTokensDetails.CacheWriteTokens, &incoming.PromptTokensDetails.CacheWriteTokens},
		{&dst.PromptTokensDetails.TextTokens, &incoming.PromptTokensDetails.TextTokens},
		{&dst.PromptTokensDetails.AudioTokens, &incoming.PromptTokensDetails.AudioTokens},
		{&dst.PromptTokensDetails.ImageTokens, &incoming.PromptTokensDetails.ImageTokens},
		{&dst.CompletionTokenDetails.TextTokens, &incoming.CompletionTokenDetails.TextTokens},
		{&dst.CompletionTokenDetails.AudioTokens, &incoming.CompletionTokenDetails.AudioTokens},
		{&dst.CompletionTokenDetails.ImageTokens, &incoming.CompletionTokenDetails.ImageTokens},
		{&dst.CompletionTokenDetails.ReasoningTokens, &incoming.CompletionTokenDetails.ReasoningTokens},
	} {
		if *pair[1] != 0 {
			*pair[0] = *pair[1]
		}
	}
	if incoming.InputTokensDetails != nil {
		details := dst.PromptTokensDetails
		dst.InputTokensDetails = &details
	}
	dst.TotalTokens = max(dst.TotalTokens, dst.PromptTokens+dst.CompletionTokens)

	if incoming.PromptCacheHitTokens != 0 {
		dst.PromptCacheHitTokens = incoming.PromptCacheHitTokens
	}
	if incoming.BillingUsage != nil {
		dst.BillingUsage = incoming.BillingUsage
	}
	// Only Responses-native snapshots describe these exact input/output facts.
	// Converted Claude/Gemini/chat billing dialects retain their own payload.
	if hadUsage && dst.BillingUsage != nil && dst.BillingUsage.Source == dto.BillingUsageSourceOAIResponses && dst.BillingUsage.OpenAIUsage != nil {
		snapshot := dto.CloneBillingUsage(dst.BillingUsage)
		native := snapshot.OpenAIUsage
		native.InputTokens, native.PromptTokens = dst.PromptTokens, dst.PromptTokens
		native.OutputTokens, native.CompletionTokens = dst.CompletionTokens, dst.CompletionTokens
		details := dst.PromptTokensDetails
		native.InputTokensDetails, native.PromptTokensDetails = &details, details
		native.TotalTokens = dst.TotalTokens
		native.CompletionTokenDetails = dst.CompletionTokenDetails
		dst.BillingUsage = snapshot
	}

	if incoming.UsageSemantic != "" {
		dst.UsageSemantic = incoming.UsageSemantic
	}
	if incoming.UsageSource != "" {
		dst.UsageSource = incoming.UsageSource
	}
	if incoming.Cost != nil {
		dst.Cost = incoming.Cost
	}
	outputDetails := dst.CompletionTokenDetails
	if outputDetails != (dto.OutputTokenDetails{}) {
		dst.OutputTokensDetails = &outputDetails
	}
}
