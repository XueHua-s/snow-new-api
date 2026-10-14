package common

import (
	"errors"
	"fmt"
	"strings"

	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

// applyOperationsLegacy 原参数覆盖方法。
//
// 旧实现把整个 jsonData unmarshal 成 map[string]interface{} 再 marshal 回来，
// 对包含大 base64 字段（如 Gemini inlineData.data）的请求会放大数倍内存
// （interface 装箱、map bucket、再次 marshal）。
// 这里改成在 []byte 上直接调用 sjson.SetBytes，按顶层 key 逐个写入，
// 不再把 payload 解码到 map[string]interface{}。
//
// 语义保持：每个 paramOverride 顶层 key 视为字面 key（不解析点号路径），
// 与旧的 reqMap[key] = value 一致。包含 `.` `*` `?` `\` 的 key 会被转义，
// 防止被 sjson 当作嵌套路径或通配符。
func applyOperationsLegacy(jsonData []byte, paramOverride map[string]interface{}, auditRecorder *paramOverrideAuditRecorder) ([]byte, error) {
	if len(paramOverride) == 0 {
		return jsonData, nil
	}

	result := jsonData
	for key, value := range paramOverride {
		escaped := escapeSjsonLiteralKey(key)
		next, err := sjson.SetBytes(result, escaped, value)
		if err != nil {
			return nil, err
		}
		result = next
		auditRecorder.recordOperation("set", key, "", "", value)
	}

	return result, nil
}

// escapeSjsonLiteralKey 把可能被 sjson 误判为路径或通配符的字符转义，
// 用于把字面 key 安全地传给 sjson.SetBytes / sjson.DeleteBytes。
func escapeSjsonLiteralKey(key string) string {
	if !strings.ContainsAny(key, ".*?\\") {
		return key
	}
	var sb strings.Builder
	sb.Grow(len(key) + 4)
	for i := 0; i < len(key); i++ {
		c := key[i]
		switch c {
		case '.', '*', '?', '\\':
			sb.WriteByte('\\')
		}
		sb.WriteByte(c)
	}
	return sb.String()
}

// applyOperations 在 []byte 上原地应用所有 param override 操作。
//
// 旧实现走 string-based gjson/sjson，在 ApplyParamOverride 入口会做
// string(jsonData) 与最终 []byte(result) 各一次整包拷贝，对大 base64
// payload 来说每次重试都额外多花 2 倍 body 体积的临时内存。
// 这里改成全程在 []byte 上工作，sjson.SetBytes / gjson.GetBytes 都是
// 直接读写 []byte，每个操作只会产生一份新 buffer。
func applyOperations(jsonData []byte, operations []ParamOperation, conditionContext map[string]interface{}) ([]byte, error) {
	context := ensureContextMap(conditionContext)
	auditRecorder := getParamOverrideAuditRecorder(context)
	contextJSON, err := marshalContextJSON(context)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal condition context: %v", err)
	}

	result := jsonData
	for _, op := range operations {
		// 检查条件是否满足
		ok, err := checkConditions(result, contextJSON, op.Conditions, op.Logic)
		if err != nil {
			return nil, err
		}
		if !ok {
			continue // 条件不满足，跳过当前操作
		}
		// 处理路径中的负数索引
		opPath := processNegativeIndex(result, op.Path)
		var opPaths []string
		if isPathBasedOperation(op.Mode) {
			opPaths, err = resolveOperationPaths(result, opPath)
			if err != nil {
				return nil, err
			}
			if len(opPaths) == 0 {
				continue
			}
		}

		switch op.Mode {
		case "delete":
			for _, path := range opPaths {
				result, err = deleteValue(result, path)
				if err != nil {
					break
				}
				auditRecorder.recordOperation("delete", path, "", "", nil)
			}
		case "set":
			for _, path := range opPaths {
				if op.KeepOrigin && gjson.GetBytes(result, path).Exists() {
					continue
				}
				result, err = sjson.SetBytes(result, path, op.Value)
				if err != nil {
					break
				}
				auditRecorder.recordOperation("set", path, "", "", op.Value)
			}
		case "move":
			opFrom := processNegativeIndex(result, op.From)
			opTo := processNegativeIndex(result, op.To)
			result, err = moveValue(result, opFrom, opTo)
			if err == nil {
				auditRecorder.recordOperation("move", "", opFrom, opTo, nil)
			}
		case "copy":
			if op.From == "" || op.To == "" {
				return nil, fmt.Errorf("copy from/to is required")
			}
			opFrom := processNegativeIndex(result, op.From)
			opTo := processNegativeIndex(result, op.To)
			result, err = copyValue(result, opFrom, opTo)
			if err == nil {
				auditRecorder.recordOperation("copy", "", opFrom, opTo, nil)
			}
		case "prepend":
			for _, path := range opPaths {
				result, err = modifyValue(result, path, op.Value, op.KeepOrigin, true)
				if err != nil {
					break
				}
				auditRecorder.recordOperation("prepend", path, "", "", op.Value)
			}
		case "append":
			for _, path := range opPaths {
				result, err = modifyValue(result, path, op.Value, op.KeepOrigin, false)
				if err != nil {
					break
				}
				auditRecorder.recordOperation("append", path, "", "", op.Value)
			}
		case "trim_prefix":
			for _, path := range opPaths {
				result, err = trimStringValue(result, path, op.Value, true)
				if err != nil {
					break
				}
				auditRecorder.recordOperation("trim_prefix", path, "", "", op.Value)
			}
		case "trim_suffix":
			for _, path := range opPaths {
				result, err = trimStringValue(result, path, op.Value, false)
				if err != nil {
					break
				}
				auditRecorder.recordOperation("trim_suffix", path, "", "", op.Value)
			}
		case "ensure_prefix":
			for _, path := range opPaths {
				result, err = ensureStringAffix(result, path, op.Value, true)
				if err != nil {
					break
				}
				auditRecorder.recordOperation("ensure_prefix", path, "", "", op.Value)
			}
		case "ensure_suffix":
			for _, path := range opPaths {
				result, err = ensureStringAffix(result, path, op.Value, false)
				if err != nil {
					break
				}
				auditRecorder.recordOperation("ensure_suffix", path, "", "", op.Value)
			}
		case "trim_space":
			for _, path := range opPaths {
				result, err = transformStringValue(result, path, strings.TrimSpace)
				if err != nil {
					break
				}
				auditRecorder.recordOperation("trim_space", path, "", "", nil)
			}
		case "to_lower":
			for _, path := range opPaths {
				result, err = transformStringValue(result, path, strings.ToLower)
				if err != nil {
					break
				}
				auditRecorder.recordOperation("to_lower", path, "", "", nil)
			}
		case "to_upper":
			for _, path := range opPaths {
				result, err = transformStringValue(result, path, strings.ToUpper)
				if err != nil {
					break
				}
				auditRecorder.recordOperation("to_upper", path, "", "", nil)
			}
		case "replace":
			for _, path := range opPaths {
				result, err = replaceStringValue(result, path, op.From, op.To)
				if err != nil {
					break
				}
				auditRecorder.recordOperation("replace", path, op.From, op.To, nil)
			}
		case "regex_replace":
			for _, path := range opPaths {
				result, err = regexReplaceStringValue(result, path, op.From, op.To)
				if err != nil {
					break
				}
				auditRecorder.recordOperation("regex_replace", path, op.From, op.To, nil)
			}
		case "return_error":
			auditRecorder.recordOperation("return_error", op.Path, "", "", op.Value)
			returnErr, parseErr := parseParamOverrideReturnError(op.Value)
			if parseErr != nil {
				return nil, parseErr
			}
			return nil, returnErr
		case "prune_objects":
			for _, path := range opPaths {
				result, err = pruneObjects(result, path, contextJSON, op.Value)
				if err != nil {
					break
				}
			}
		case "set_header":
			err = setHeaderOverrideInContext(context, op.Path, op.Value, op.KeepOrigin)
			if err == nil {
				auditRecorder.recordOperation("set_header", op.Path, "", "", op.Value)
				contextJSON, err = marshalContextJSON(context)
			}
		case "delete_header":
			err = deleteHeaderOverrideInContext(context, op.Path)
			if err == nil {
				auditRecorder.recordOperation("delete_header", op.Path, "", "", nil)
				contextJSON, err = marshalContextJSON(context)
			}
		case "copy_header":
			sourceHeader := strings.TrimSpace(op.From)
			targetHeader := strings.TrimSpace(op.To)
			if sourceHeader == "" {
				sourceHeader = strings.TrimSpace(op.Path)
			}
			if targetHeader == "" {
				targetHeader = strings.TrimSpace(op.Path)
			}
			err = copyHeaderInContext(context, sourceHeader, targetHeader, op.KeepOrigin)
			if errors.Is(err, errSourceHeaderNotFound) {
				err = nil
			}
			if err == nil {
				auditRecorder.recordOperation("copy_header", "", sourceHeader, targetHeader, nil)
				contextJSON, err = marshalContextJSON(context)
			}
		case "move_header":
			sourceHeader := strings.TrimSpace(op.From)
			targetHeader := strings.TrimSpace(op.To)
			if sourceHeader == "" {
				sourceHeader = strings.TrimSpace(op.Path)
			}
			if targetHeader == "" {
				targetHeader = strings.TrimSpace(op.Path)
			}
			err = moveHeaderInContext(context, sourceHeader, targetHeader, op.KeepOrigin)
			if errors.Is(err, errSourceHeaderNotFound) {
				err = nil
			}
			if err == nil {
				auditRecorder.recordOperation("move_header", "", sourceHeader, targetHeader, nil)
				contextJSON, err = marshalContextJSON(context)
			}
		case "pass_headers":
			headerNames, parseErr := parseHeaderPassThroughNames(op.Value)
			if parseErr != nil {
				return nil, parseErr
			}
			for _, headerName := range headerNames {
				if err = copyHeaderInContext(context, headerName, headerName, op.KeepOrigin); err != nil {
					if errors.Is(err, errSourceHeaderNotFound) {
						err = nil
						continue
					}
					break
				}
			}
			if err == nil {
				auditRecorder.recordOperation("pass_headers", "", "", "", headerNames)
				contextJSON, err = marshalContextJSON(context)
			}
		case "sync_fields":
			result, err = syncFieldsBetweenTargets(result, context, op.From, op.To)
			if err == nil {
				auditRecorder.recordOperation("sync_fields", "", op.From, op.To, nil)
				contextJSON, err = marshalContextJSON(context)
			}
		default:
			return nil, fmt.Errorf("unknown operation: %s", op.Mode)
		}
		if err != nil {
			return nil, fmt.Errorf("operation %s failed: %w", op.Mode, err)
		}
	}
	return result, nil
}

func tryParseOperations(paramOverride map[string]interface{}) ([]ParamOperation, bool) {
	// 检查是否包含 "operations" 字段
	opsValue, exists := paramOverride["operations"]
	if !exists {
		return nil, false
	}

	var opMaps []map[string]interface{}
	switch ops := opsValue.(type) {
	case []interface{}:
		opMaps = make([]map[string]interface{}, 0, len(ops))
		for _, op := range ops {
			opMap, ok := op.(map[string]interface{})
			if !ok {
				return nil, false
			}
			opMaps = append(opMaps, opMap)
		}
	case []map[string]interface{}:
		opMaps = ops
	default:
		return nil, false
	}

	operations := make([]ParamOperation, 0, len(opMaps))
	for _, opMap := range opMaps {
		operation := ParamOperation{}

		// 断言必要字段
		if path, ok := opMap["path"].(string); ok {
			operation.Path = path
		}
		if mode, ok := opMap["mode"].(string); ok {
			operation.Mode = mode
		} else {
			return nil, false // mode 是必需的
		}

		// 可选字段
		if value, exists := opMap["value"]; exists {
			operation.Value = value
		}
		if keepOrigin, ok := opMap["keep_origin"].(bool); ok {
			operation.KeepOrigin = keepOrigin
		}
		if from, ok := opMap["from"].(string); ok {
			operation.From = from
		}
		if to, ok := opMap["to"].(string); ok {
			operation.To = to
		}
		if logic, ok := opMap["logic"].(string); ok {
			operation.Logic = logic
		} else {
			operation.Logic = "OR" // 默认为OR
		}

		// 解析条件
		if conditions, exists := opMap["conditions"]; exists {
			parsedConditions, err := parseConditionOperations(conditions)
			if err != nil {
				return nil, false
			}
			operation.Conditions = append(operation.Conditions, parsedConditions...)
		}

		operations = append(operations, operation)
	}
	return operations, true
}
