package oauth

import (
	stdjson "encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"github.com/samber/lo"
	"github.com/tidwall/gjson"
)

type accessPolicy struct {
	Logic      string            `json:"logic"`
	Conditions []accessCondition `json:"conditions"`
	Groups     []accessPolicy    `json:"groups"`
}

type accessCondition struct {
	Field string `json:"field"`
	Op    string `json:"op"`
	Value any    `json:"value"`
}

type accessPolicyFailure struct {
	Field    string
	Op       string
	Expected any
	Current  any
}

var supportedAccessPolicyOps = []string{
	"eq",
	"ne",
	"gt",
	"gte",
	"lt",
	"lte",
	"in",
	"not_in",
	"contains",
	"not_contains",
	"exists",
	"not_exists",
}

func parseAccessPolicy(raw string) (*accessPolicy, error) {
	var policy accessPolicy
	if err := common.UnmarshalJsonStr(raw, &policy); err != nil {
		return nil, err
	}
	if err := validateAccessPolicy(&policy); err != nil {
		return nil, err
	}
	return &policy, nil
}

func validateAccessPolicy(policy *accessPolicy) error {
	if policy == nil {
		return errors.New("policy is nil")
	}

	logic := strings.ToLower(strings.TrimSpace(policy.Logic))
	if logic == "" {
		logic = "and"
	}
	if !lo.Contains([]string{"and", "or"}, logic) {
		return fmt.Errorf("unsupported policy logic: %s", logic)
	}
	policy.Logic = logic

	if len(policy.Conditions) == 0 && len(policy.Groups) == 0 {
		return errors.New("policy requires at least one condition or group")
	}

	for index := range policy.Conditions {
		if err := validateAccessCondition(&policy.Conditions[index], index); err != nil {
			return err
		}
	}

	for index := range policy.Groups {
		if err := validateAccessPolicy(&policy.Groups[index]); err != nil {
			return fmt.Errorf("invalid policy group[%d]: %w", index, err)
		}
	}

	return nil
}

func validateAccessCondition(condition *accessCondition, index int) error {
	if condition == nil {
		return fmt.Errorf("condition[%d] is nil", index)
	}

	condition.Field = strings.TrimSpace(condition.Field)
	if condition.Field == "" {
		return fmt.Errorf("condition[%d].field is required", index)
	}

	condition.Op = normalizePolicyOp(condition.Op)
	if !lo.Contains(supportedAccessPolicyOps, condition.Op) {
		return fmt.Errorf("condition[%d].op is unsupported: %s", index, condition.Op)
	}

	if lo.Contains([]string{"in", "not_in"}, condition.Op) {
		if _, ok := condition.Value.([]any); !ok {
			return fmt.Errorf("condition[%d].value must be an array for op %s", index, condition.Op)
		}
	}

	return nil
}

func evaluateAccessPolicy(body string, policy *accessPolicy) (bool, *accessPolicyFailure) {
	if policy == nil {
		return true, nil
	}

	logic := strings.ToLower(strings.TrimSpace(policy.Logic))
	if logic == "" {
		logic = "and"
	}

	hasAny := len(policy.Conditions) > 0 || len(policy.Groups) > 0
	if !hasAny {
		return true, nil
	}

	if logic == "or" {
		var firstFailure *accessPolicyFailure
		for _, cond := range policy.Conditions {
			ok, failure := evaluateAccessCondition(body, cond)
			if ok {
				return true, nil
			}
			if firstFailure == nil {
				firstFailure = failure
			}
		}
		for _, group := range policy.Groups {
			ok, failure := evaluateAccessPolicy(body, &group)
			if ok {
				return true, nil
			}
			if firstFailure == nil {
				firstFailure = failure
			}
		}
		return false, firstFailure
	}

	for _, cond := range policy.Conditions {
		ok, failure := evaluateAccessCondition(body, cond)
		if !ok {
			return false, failure
		}
	}
	for _, group := range policy.Groups {
		ok, failure := evaluateAccessPolicy(body, &group)
		if !ok {
			return false, failure
		}
	}
	return true, nil
}

func evaluateAccessCondition(body string, cond accessCondition) (bool, *accessPolicyFailure) {
	path := cond.Field
	op := cond.Op
	result := gjson.Get(body, path)
	current := gjsonResultToValue(result)
	failure := &accessPolicyFailure{
		Field:    path,
		Op:       op,
		Expected: cond.Value,
		Current:  current,
	}

	switch op {
	case "exists":
		return result.Exists(), failure
	case "not_exists":
		return !result.Exists(), failure
	case "eq":
		return compareAny(current, cond.Value) == 0, failure
	case "ne":
		return compareAny(current, cond.Value) != 0, failure
	case "gt":
		return compareAny(current, cond.Value) > 0, failure
	case "gte":
		return compareAny(current, cond.Value) >= 0, failure
	case "lt":
		return compareAny(current, cond.Value) < 0, failure
	case "lte":
		return compareAny(current, cond.Value) <= 0, failure
	case "in":
		return valueInSlice(current, cond.Value), failure
	case "not_in":
		return !valueInSlice(current, cond.Value), failure
	case "contains":
		return containsValue(current, cond.Value), failure
	case "not_contains":
		return !containsValue(current, cond.Value), failure
	default:
		return false, failure
	}
}

func normalizePolicyOp(op string) string {
	return strings.ToLower(strings.TrimSpace(op))
}

func gjsonResultToValue(result gjson.Result) any {
	if !result.Exists() {
		return nil
	}
	if result.IsArray() {
		arr := result.Array()
		values := make([]any, 0, len(arr))
		for _, item := range arr {
			values = append(values, gjsonResultToValue(item))
		}
		return values
	}
	switch result.Type {
	case gjson.Null:
		return nil
	case gjson.True:
		return true
	case gjson.False:
		return false
	case gjson.Number:
		return result.Num
	case gjson.String:
		return result.String()
	case gjson.JSON:
		var data any
		if err := common.UnmarshalJsonStr(result.Raw, &data); err == nil {
			return data
		}
		return result.Raw
	default:
		return result.Value()
	}
}

func compareAny(left any, right any) int {
	if lf, ok := toFloat(left); ok {
		if rf, ok2 := toFloat(right); ok2 {
			switch {
			case lf < rf:
				return -1
			case lf > rf:
				return 1
			default:
				return 0
			}
		}
	}

	ls := strings.TrimSpace(fmt.Sprint(left))
	rs := strings.TrimSpace(fmt.Sprint(right))
	switch {
	case ls < rs:
		return -1
	case ls > rs:
		return 1
	default:
		return 0
	}
}

func toFloat(v any) (float64, bool) {
	switch value := v.(type) {
	case float64:
		return value, true
	case float32:
		return float64(value), true
	case int:
		return float64(value), true
	case int8:
		return float64(value), true
	case int16:
		return float64(value), true
	case int32:
		return float64(value), true
	case int64:
		return float64(value), true
	case uint:
		return float64(value), true
	case uint8:
		return float64(value), true
	case uint16:
		return float64(value), true
	case uint32:
		return float64(value), true
	case uint64:
		return float64(value), true
	case stdjson.Number:
		n, err := value.Float64()
		if err == nil {
			return n, true
		}
	case string:
		n, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
		if err == nil {
			return n, true
		}
	}
	return 0, false
}

func valueInSlice(current any, expected any) bool {
	list, ok := expected.([]any)
	if !ok {
		return false
	}
	return lo.ContainsBy(list, func(item any) bool {
		return compareAny(current, item) == 0
	})
}

func containsValue(current any, expected any) bool {
	switch value := current.(type) {
	case string:
		target := strings.TrimSpace(fmt.Sprint(expected))
		return strings.Contains(value, target)
	case []any:
		return lo.ContainsBy(value, func(item any) bool {
			return compareAny(item, expected) == 0
		})
	}
	return false
}

func renderAccessDeniedMessage(template string, providerName string, body string, failure *accessPolicyFailure) string {
	defaultMessage := "Access denied: your account does not meet this provider's access requirements."
	message := strings.TrimSpace(template)
	if message == "" {
		return defaultMessage
	}

	if failure == nil {
		failure = &accessPolicyFailure{}
	}

	replacements := map[string]string{
		"{{provider}}": providerName,
		"{{field}}":    failure.Field,
		"{{op}}":       failure.Op,
		"{{required}}": fmt.Sprint(failure.Expected),
		"{{current}}":  fmt.Sprint(failure.Current),
	}

	for key, value := range replacements {
		message = strings.ReplaceAll(message, key, value)
	}

	currentPattern := regexp.MustCompile(`\{\{current\.([^}]+)\}\}`)
	message = currentPattern.ReplaceAllStringFunc(message, func(token string) string {
		match := currentPattern.FindStringSubmatch(token)
		if len(match) != 2 {
			return ""
		}
		path := strings.TrimSpace(match[1])
		if path == "" {
			return ""
		}
		return strings.TrimSpace(gjson.Get(body, path).String())
	})

	requiredPattern := regexp.MustCompile(`\{\{required\.([^}]+)\}\}`)
	message = requiredPattern.ReplaceAllStringFunc(message, func(token string) string {
		match := requiredPattern.FindStringSubmatch(token)
		if len(match) != 2 {
			return ""
		}
		path := strings.TrimSpace(match[1])
		if failure.Field == path {
			return fmt.Sprint(failure.Expected)
		}
		return ""
	})

	return strings.TrimSpace(message)
}
