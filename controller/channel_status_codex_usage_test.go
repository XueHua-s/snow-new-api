package controller

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
)

func TestBuildChannelStatusCodexUsageSanitizesAndNormalizes(t *testing.T) {
	body := []byte(`{
		"plan_type":"pro",
		"email":"private@example.com",
		"account_id":"acct-secret",
		"rate_limit":{
			"allowed":true,
			"limit_reached":false,
			"primary_window":{"used_percent":0,"reset_at":10,"reset_after_seconds":18000,"limit_window_seconds":18000},
			"secondary_window":{"used_percent":13,"reset_at":20,"reset_after_seconds":500000,"limit_window_seconds":604800}
		},
		"additional_rate_limits":[{
			"limit_name":"GPT-5.3-Codex-Spark",
			"metered_feature":"codex_bengalfox",
			"rate_limit":{
				"allowed":true,
				"primary_window":{"used_percent":1,"limit_window_seconds":18000},
				"secondary_window":{"used_percent":2,"limit_window_seconds":604800}
			}
		}]
	}`)

	item := buildChannelStatusCodexUsage("Codex Pro", 200, body, nil)
	if item.PlanType != "pro" || item.Available == nil || !*item.Available {
		t.Fatalf("unexpected account summary: %+v", item)
	}
	if item.BaseLimit.FiveHourWindow == nil || item.BaseLimit.FiveHourWindow.LimitWindow != 18000 {
		t.Fatalf("unexpected five-hour window: %+v", item.BaseLimit.FiveHourWindow)
	}
	if item.BaseLimit.WeeklyWindow == nil || item.BaseLimit.WeeklyWindow.UsedPercent != 13 {
		t.Fatalf("unexpected weekly window: %+v", item.BaseLimit.WeeklyWindow)
	}
	if len(item.AdditionalLimits) != 1 || item.AdditionalLimits[0].MeteredFeature != "codex_bengalfox" {
		t.Fatalf("unexpected additional limits: %+v", item.AdditionalLimits)
	}

	encoded, err := common.Marshal(item)
	if err != nil {
		t.Fatalf("marshal sanitized item: %v", err)
	}
	serialized := string(encoded)
	for _, sensitive := range []string{"private@example.com", "acct-secret", "email", "account_id"} {
		if strings.Contains(serialized, sensitive) {
			t.Fatalf("sanitized payload leaked %q: %s", sensitive, serialized)
		}
	}
}

func TestResolveCodexUsageWindowsFreePlanUsesWeeklyOnly(t *testing.T) {
	fiveHour, weekly := resolveCodexUsageWindows("free", codexUsageUpstreamRateLimit{
		PrimaryWindow: &codexUsageUpstreamWindow{
			UsedPercent: 42,
			LimitWindow: 7 * 24 * 60 * 60,
		},
	})
	if fiveHour != nil {
		t.Fatalf("free plan five-hour window = %+v, want nil", fiveHour)
	}
	if weekly == nil || weekly.UsedPercent != 42 {
		t.Fatalf("free plan weekly window = %+v", weekly)
	}
}

func TestIsChannelStatusCodexOAuthChannel(t *testing.T) {
	valid := &model.Channel{
		Type: constant.ChannelTypeCodex,
		Key:  `{"access_token":"access","account_id":"account","type":"codex"}`,
	}
	if !isChannelStatusCodexOAuthChannel(valid) {
		t.Fatal("valid single-key Codex OAuth channel should be included")
	}

	quotaChannel := &model.Channel{Type: constant.ChannelTypeOpenAI, Key: "sk-quota"}
	if isChannelStatusCodexOAuthChannel(quotaChannel) {
		t.Fatal("quota API-key channel should be excluded")
	}

	multiKey := *valid
	multiKey.ChannelInfo.IsMultiKey = true
	if isChannelStatusCodexOAuthChannel(&multiKey) {
		t.Fatal("multi-key Codex channel should be excluded")
	}
}
