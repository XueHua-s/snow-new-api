package common

import (
	"strings"

	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/tidwall/gjson"
)

const (
	paramOverrideContextRequestHeaders = "request_headers"
	paramOverrideContextHeaderOverride = "header_override"
	paramOverrideContextAuditRecorder  = "__param_override_audit_recorder"
)

type ConditionOperation struct {
	Path           string      `json:"path"`             // JSON路径
	Mode           string      `json:"mode"`             // full, prefix, suffix, contains, gt, gte, lt, lte
	Value          interface{} `json:"value"`            // 匹配的值
	Invert         bool        `json:"invert"`           // 反选功能，true表示取反结果
	PassMissingKey bool        `json:"pass_missing_key"` // 未获取到json key时的行为
}

type ParamOperation struct {
	Path       string               `json:"path"`
	Mode       string               `json:"mode"` // delete, set, move, copy, prepend, append, trim_prefix, trim_suffix, ensure_prefix, ensure_suffix, trim_space, to_lower, to_upper, replace, regex_replace, return_error, prune_objects, set_header, delete_header, copy_header, move_header, pass_headers, sync_fields
	Value      interface{}          `json:"value"`
	KeepOrigin bool                 `json:"keep_origin"`
	From       string               `json:"from,omitempty"`
	To         string               `json:"to,omitempty"`
	Conditions []ConditionOperation `json:"conditions,omitempty"` // 条件列表
	Logic      string               `json:"logic,omitempty"`      // AND, OR (默认OR)
}

func ApplyParamOverride(jsonData []byte, paramOverride map[string]interface{}, conditionContext map[string]interface{}) ([]byte, error) {
	if len(paramOverride) == 0 {
		return jsonData, nil
	}
	auditRecorder := getParamOverrideAuditRecorder(conditionContext)

	// 尝试断言为操作格式
	if operations, ok := tryParseOperations(paramOverride); ok {
		legacyOverride := buildLegacyParamOverride(paramOverride)
		workingJSON := jsonData
		var err error
		if len(legacyOverride) > 0 {
			workingJSON, err = applyOperationsLegacy(workingJSON, legacyOverride, auditRecorder)
			if err != nil {
				return nil, err
			}
		}

		// 使用新方法（基于 []byte，避免整包 string 拷贝）
		return applyOperations(workingJSON, operations, conditionContext)
	}

	// 直接使用旧方法
	return applyOperationsLegacy(jsonData, paramOverride, auditRecorder)
}

func buildLegacyParamOverride(paramOverride map[string]interface{}) map[string]interface{} {
	if len(paramOverride) == 0 {
		return nil
	}
	legacy := make(map[string]interface{}, len(paramOverride))
	for key, value := range paramOverride {
		if strings.EqualFold(strings.TrimSpace(key), "operations") {
			continue
		}
		legacy[key] = value
	}
	return legacy
}

func ApplyParamOverrideWithRelayInfo(jsonData []byte, info *RelayInfo) ([]byte, error) {
	paramOverride := getParamOverrideMap(info)
	if len(paramOverride) == 0 {
		return jsonData, nil
	}

	overrideCtx := BuildParamOverrideContext(info)
	var recorder *paramOverrideAuditRecorder
	if shouldEnableParamOverrideAudit(paramOverride) {
		recorder = &paramOverrideAuditRecorder{}
		overrideCtx[paramOverrideContextAuditRecorder] = recorder
	}
	result, err := ApplyParamOverride(jsonData, paramOverride, overrideCtx)
	if err != nil {
		return nil, err
	}
	syncReasoningEffortAfterParamOverride(info, jsonData, result)
	syncRuntimeHeaderOverrideFromContext(info, overrideCtx)
	if info != nil {
		if recorder != nil {
			info.ParamOverrideAudit = recorder.lines
		} else {
			info.ParamOverrideAudit = nil
		}
	}
	return result, nil
}

func syncReasoningEffortAfterParamOverride(info *RelayInfo, before, after []byte) {
	if info == nil {
		return
	}
	_, existedBefore := extractReasoningEffortFromJSON(info.GetFinalRequestRelayFormat(), before)
	effort, existsAfter := extractReasoningEffortFromJSON(info.GetFinalRequestRelayFormat(), after)
	if existsAfter {
		info.SetReasoningEffort(effort)
		return
	}
	if existedBefore {
		info.SetReasoningEffort("")
	}
}

func extractReasoningEffortFromJSON(format types.RelayFormat, data []byte) (string, bool) {
	var paths []string
	switch format {
	case types.RelayFormatOpenAI:
		paths = []string{"reasoning_effort", "reasoning.effort"}
	case types.RelayFormatOpenAIResponses:
		paths = []string{"reasoning.effort"}
	case types.RelayFormatClaude:
		paths = []string{"output_config.effort"}
	case types.RelayFormatGemini:
		paths = []string{
			"generationConfig.thinkingConfig.thinkingLevel",
			"generation_config.thinking_config.thinking_level",
		}
	default:
		return "", false
	}
	for _, path := range paths {
		value := gjson.GetBytes(data, path)
		if !value.Exists() {
			continue
		}
		if value.Type != gjson.String {
			return "", true
		}
		return strings.TrimSpace(value.String()), true
	}
	return "", false
}

func getParamOverrideMap(info *RelayInfo) map[string]interface{} {
	if info == nil || info.ChannelMeta == nil {
		return nil
	}
	return info.ChannelMeta.ParamOverride
}

// BuildParamOverrideContext 提供 ApplyParamOverride 可用的上下文信息。
// 目前内置以下字段：
//   - upstream_model/model：始终为通道映射后的上游模型名。
//   - original_model：请求最初指定的模型名。
//   - user_id：已认证用户 ID。
//   - user_group：用户所属分组。
//   - token_group：令牌指定的分组；未指定时回退为用户分组。
//   - using_group：当前实际使用的分组，自动跨分组重试时可能变化。
//   - request_path：请求路径
//   - is_channel_test：是否为渠道测试请求（同 is_test）。
func BuildParamOverrideContext(info *RelayInfo) map[string]interface{} {
	if info == nil {
		return nil
	}

	ctx := make(map[string]interface{})
	ctx["user_id"] = info.UserId
	ctx["user_group"] = info.UserGroup
	ctx["token_group"] = info.TokenGroup
	ctx["using_group"] = info.UsingGroup
	if info.ChannelMeta != nil && info.ChannelMeta.UpstreamModelName != "" {
		ctx["model"] = info.ChannelMeta.UpstreamModelName
		ctx["upstream_model"] = info.ChannelMeta.UpstreamModelName
	}
	if info.OriginModelName != "" {
		ctx["original_model"] = info.OriginModelName
		if _, exists := ctx["model"]; !exists {
			ctx["model"] = info.OriginModelName
		}
	}

	if info.RequestURLPath != "" {
		requestPath := info.RequestURLPath
		if requestPath != "" {
			ctx["request_path"] = requestPath
		}
	}

	ctx[paramOverrideContextRequestHeaders] = buildRequestHeadersContext(info.RequestHeaders)

	headerOverrideSource := GetEffectiveHeaderOverride(info)
	ctx[paramOverrideContextHeaderOverride] = sanitizeHeaderOverrideMap(headerOverrideSource)

	ctx["retry_index"] = info.RetryIndex
	ctx["is_retry"] = info.RetryIndex > 0
	ctx["retry"] = map[string]interface{}{
		"index":    info.RetryIndex,
		"is_retry": info.RetryIndex > 0,
	}

	if info.LastError != nil {
		code := string(info.LastError.GetErrorCode())
		errorType := string(info.LastError.GetErrorType())
		lastError := map[string]interface{}{
			"status_code": info.LastError.StatusCode,
			"message":     info.LastError.Error(),
			"code":        code,
			"error_code":  code,
			"type":        errorType,
			"error_type":  errorType,
			"skip_retry":  types.IsSkipRetryError(info.LastError),
		}
		ctx["last_error"] = lastError
		ctx["last_error_status_code"] = info.LastError.StatusCode
		ctx["last_error_message"] = info.LastError.Error()
		ctx["last_error_code"] = code
		ctx["last_error_type"] = errorType
	}

	ctx["is_channel_test"] = info.IsChannelTest
	return ctx
}
