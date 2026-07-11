package codex

import (
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/samber/lo"
)

var baseModelList = []string{
	"gpt-5.3-codex",
	"gpt-5.3-codex-spark",
	"gpt-5.4",
	"gpt-5.4-fast",
	"gpt-5.4-mini",
	"gpt-5.5",
	"gpt-5.5-fast",
	"gpt-5.6-sol",
	"gpt-5.6-terra",
	"gpt-5.6-luna",
}

var ModelList = withCompactModelSuffix(baseModelList)

const ChannelName = "codex"

func withCompactModelSuffix(models []string) []string {
	out := make([]string, 0, len(models)*2)
	out = append(out, models...)
	out = append(out, lo.Map(models, func(model string, _ int) string {
		return ratio_setting.WithCompactModelSuffix(model)
	})...)
	return lo.Uniq(out)
}
