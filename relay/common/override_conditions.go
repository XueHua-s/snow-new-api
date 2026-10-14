package common

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"github.com/samber/lo"
	"github.com/tidwall/gjson"
)

func checkConditions(data []byte, contextJSON string, conditions []ConditionOperation, logic string) (bool, error) {
	if len(conditions) == 0 {
		return true, nil // 没有条件，直接通过
	}
	results := make([]bool, len(conditions))
	for i, condition := range conditions {
		result, err := checkSingleCondition(data, contextJSON, condition)
		if err != nil {
			return false, err
		}
		results[i] = result
	}

	if strings.ToUpper(logic) == "AND" {
		return lo.EveryBy(results, func(item bool) bool { return item }), nil
	}
	return lo.SomeBy(results, func(item bool) bool { return item }), nil
}

func checkSingleCondition(data []byte, contextJSON string, condition ConditionOperation) (bool, error) {
	// 处理负数索引
	path := processNegativeIndex(data, condition.Path)
	value := gjson.GetBytes(data, path)
	if !value.Exists() && contextJSON != "" {
		value = gjson.Get(contextJSON, condition.Path)
	}
	if !value.Exists() {
		if condition.PassMissingKey {
			return true, nil
		}
		return false, nil
	}

	// 利用gjson的类型解析
	targetBytes, err := common.Marshal(condition.Value)
	if err != nil {
		return false, fmt.Errorf("failed to marshal condition value: %v", err)
	}
	targetValue := gjson.ParseBytes(targetBytes)

	result, err := compareGjsonValues(value, targetValue, strings.ToLower(condition.Mode))
	if err != nil {
		return false, fmt.Errorf("comparison failed for path %s: %v", condition.Path, err)
	}

	if condition.Invert {
		result = !result
	}
	return result, nil
}

// compareGjsonValues 直接比较两个gjson.Result，支持所有比较模式
func compareGjsonValues(jsonValue, targetValue gjson.Result, mode string) (bool, error) {
	switch mode {
	case "full":
		return compareEqual(jsonValue, targetValue)
	case "prefix":
		return strings.HasPrefix(jsonValue.String(), targetValue.String()), nil
	case "suffix":
		return strings.HasSuffix(jsonValue.String(), targetValue.String()), nil
	case "contains":
		return strings.Contains(jsonValue.String(), targetValue.String()), nil
	case "gt":
		return compareNumeric(jsonValue, targetValue, "gt")
	case "gte":
		return compareNumeric(jsonValue, targetValue, "gte")
	case "lt":
		return compareNumeric(jsonValue, targetValue, "lt")
	case "lte":
		return compareNumeric(jsonValue, targetValue, "lte")
	default:
		return false, fmt.Errorf("unsupported comparison mode: %s", mode)
	}
}

func compareEqual(jsonValue, targetValue gjson.Result) (bool, error) {
	// 对null值特殊处理：两个都是null返回true，一个是null另一个不是返回false
	if jsonValue.Type == gjson.Null || targetValue.Type == gjson.Null {
		return jsonValue.Type == gjson.Null && targetValue.Type == gjson.Null, nil
	}

	// 对布尔值特殊处理
	if (jsonValue.Type == gjson.True || jsonValue.Type == gjson.False) &&
		(targetValue.Type == gjson.True || targetValue.Type == gjson.False) {
		return jsonValue.Bool() == targetValue.Bool(), nil
	}

	// 如果类型不同，报错
	if jsonValue.Type != targetValue.Type {
		return false, fmt.Errorf("compare for different types, got %v and %v", jsonValue.Type, targetValue.Type)
	}

	switch jsonValue.Type {
	case gjson.True, gjson.False:
		return jsonValue.Bool() == targetValue.Bool(), nil
	case gjson.Number:
		return jsonValue.Num == targetValue.Num, nil
	case gjson.String:
		return jsonValue.String() == targetValue.String(), nil
	default:
		return jsonValue.String() == targetValue.String(), nil
	}
}

func compareNumeric(jsonValue, targetValue gjson.Result, operator string) (bool, error) {
	// 只有数字类型才支持数值比较
	if jsonValue.Type != gjson.Number || targetValue.Type != gjson.Number {
		return false, fmt.Errorf("numeric comparison requires both values to be numbers, got %v and %v", jsonValue.Type, targetValue.Type)
	}

	jsonNum := jsonValue.Num
	targetNum := targetValue.Num

	switch operator {
	case "gt":
		return jsonNum > targetNum, nil
	case "gte":
		return jsonNum >= targetNum, nil
	case "lt":
		return jsonNum < targetNum, nil
	case "lte":
		return jsonNum <= targetNum, nil
	default:
		return false, fmt.Errorf("unsupported numeric operator: %s", operator)
	}
}

func parseConditionOperations(raw interface{}) ([]ConditionOperation, error) {
	switch typed := raw.(type) {
	case map[string]interface{}:
		entries := lo.Entries(typed)
		conditions := lo.FilterMap(entries, func(item lo.Entry[string, interface{}], _ int) (ConditionOperation, bool) {
			path := strings.TrimSpace(item.Key)
			if path == "" {
				return ConditionOperation{}, false
			}
			return ConditionOperation{
				Path:  path,
				Mode:  "full",
				Value: item.Value,
			}, true
		})
		if len(conditions) == 0 {
			return nil, fmt.Errorf("conditions object must contain at least one key")
		}
		return conditions, nil
	case []interface{}:
		items := typed
		result := make([]ConditionOperation, 0, len(items))
		for _, item := range items {
			itemMap, ok := item.(map[string]interface{})
			if !ok {
				return nil, fmt.Errorf("condition must be object")
			}
			path, _ := itemMap["path"].(string)
			mode, _ := itemMap["mode"].(string)
			if strings.TrimSpace(path) == "" || strings.TrimSpace(mode) == "" {
				return nil, fmt.Errorf("condition path/mode is required")
			}
			condition := ConditionOperation{
				Path: path,
				Mode: mode,
			}
			if value, exists := itemMap["value"]; exists {
				condition.Value = value
			}
			if invert, ok := itemMap["invert"].(bool); ok {
				condition.Invert = invert
			}
			if passMissingKey, ok := itemMap["pass_missing_key"].(bool); ok {
				condition.PassMissingKey = passMissingKey
			}
			result = append(result, condition)
		}
		return result, nil
	default:
		return nil, fmt.Errorf("conditions must be an array or object")
	}
}
