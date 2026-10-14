package common

import (
	"strings"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/convmeta"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/model_setting"
)

// ---------------------------------------------------------------------------
// convmeta.Meta implementation — the view format converters see. Keep these
// thin: they only expose protocol state, never billing/user fields.
// ---------------------------------------------------------------------------

var _ convmeta.Meta = (*RelayInfo)(nil)

func (info *RelayInfo) GetOriginModelName() string {
	if info == nil {
		return ""
	}
	return info.OriginModelName
}

func (info *RelayInfo) GetUpstreamModelName() string {
	if info == nil || info.ChannelMeta == nil {
		return ""
	}
	return info.UpstreamModelName
}

func (info *RelayInfo) HasChannelMeta() bool { return info != nil && info.ChannelMeta != nil }

func (info *RelayInfo) GetChannelID() int {
	if info == nil || info.ChannelMeta == nil {
		return 0
	}
	return info.ChannelId
}

func (info *RelayInfo) GetChannelType() int {
	if info == nil || info.ChannelMeta == nil {
		return 0
	}
	return info.ChannelType
}

func (info *RelayInfo) GetIsStream() bool {
	return info != nil && info.IsStream
}

func (info *RelayInfo) GetReasoningEffort() string {
	if info == nil {
		return ""
	}
	return info.ReasoningEffort
}

func (info *RelayInfo) SetReasoningEffort(effort string) {
	if info == nil {
		return
	}
	info.ReasoningEffort = strings.TrimSpace(effort)
}

func (info *RelayInfo) EnsureClaudeConvertInfo() *convmeta.ClaudeConvertInfo {
	if info == nil {
		return &convmeta.ClaudeConvertInfo{
			LastMessagesType: convmeta.LastMessageTypeNone,
		}
	}
	if info.ClaudeConvertInfo == nil {
		info.ClaudeConvertInfo = &convmeta.ClaudeConvertInfo{
			LastMessagesType: convmeta.LastMessageTypeNone,
		}
	}
	return info.ClaudeConvertInfo
}

func (info *RelayInfo) GetSendResponseCount() int {
	if info == nil {
		return 0
	}
	return info.SendResponseCount
}

func (info *RelayInfo) IncrSendResponseCount() {
	if info == nil {
		return
	}
	info.SendResponseCount++
}

// ConvOptions snapshots host settings for the converters. Rebuilt on each
// call site's first use; cached so one relay session sees one snapshot.
func (info *RelayInfo) ConvOptions() *convmeta.Options {
	if info != nil && info.convOptions != nil {
		return info.convOptions
	}

	claudeSettings := model_setting.GetClaudeSettings()
	geminiSettings := model_setting.GetGeminiSettings()
	options := &convmeta.Options{
		Claude: convmeta.ClaudeOptions{
			ThinkingAdapterEnabled:                claudeSettings.ThinkingAdapterEnabled,
			ThinkingAdapterBudgetTokensPercentage: claudeSettings.ThinkingAdapterBudgetTokensPercentage,
			DefaultMaxTokens:                      claudeSettings.GetDefaultMaxTokens,
		},
		Gemini: convmeta.GeminiOptions{
			ThinkingAdapterEnabled:                geminiSettings.ThinkingAdapterEnabled,
			ThinkingAdapterBudgetTokensPercentage: geminiSettings.ThinkingAdapterBudgetTokensPercentage,
			FunctionCallThoughtSignatureEnabled:   geminiSettings.FunctionCallThoughtSignatureEnabled,
			SupportsImagine:                       model_setting.IsGeminiModelSupportImagine,
			SafetySetting:                         model_setting.GetGeminiSafetySetting,
		},
		OpenRouterDialect:      info != nil && info.GetChannelType() == constant.ChannelTypeOpenRouter,
		PreserveThinkingSuffix: model_setting.ShouldPreserveThinkingSuffix,
	}
	if info != nil {
		info.convOptions = options
	}
	return options
}

func (info *RelayInfo) InitRequestConversionChain() {
	if info == nil {
		return
	}
	if len(info.RequestConversionChain) > 0 {
		return
	}
	if info.RelayFormat == "" {
		return
	}
	info.RequestConversionChain = []types.RelayFormat{info.RelayFormat}
}

func (info *RelayInfo) AppendRequestConversion(format types.RelayFormat) {
	if info == nil {
		return
	}
	if format == "" {
		return
	}
	if len(info.RequestConversionChain) == 0 {
		info.RequestConversionChain = []types.RelayFormat{format}
		return
	}
	last := info.RequestConversionChain[len(info.RequestConversionChain)-1]
	if last == format {
		return
	}
	info.RequestConversionChain = append(info.RequestConversionChain, format)
}

func (info *RelayInfo) GetFinalRequestRelayFormat() types.RelayFormat {
	if info == nil {
		return ""
	}
	if info.FinalRequestRelayFormat != "" {
		return info.FinalRequestRelayFormat
	}
	if n := len(info.RequestConversionChain); n > 0 {
		return info.RequestConversionChain[n-1]
	}
	return info.RelayFormat
}
