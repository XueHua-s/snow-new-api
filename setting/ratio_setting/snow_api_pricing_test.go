package ratio_setting

import (
	"math"
	"testing"
)

func resetRatioMapsForTest() {
	modelPriceMap.Clear()
	modelRatioMap.Clear()
	completionRatioMap.Clear()
	cacheRatioMap.Clear()
	createCacheRatioMap.Clear()
	imageRatioMap.Clear()
	audioRatioMap.Clear()
	audioCompletionRatioMap.Clear()
	InitRatioSettings()
}

func requireClose(t *testing.T, name string, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 0.0000001 {
		t.Fatalf("%s = %.12f, want %.12f", name, got, want)
	}
}

func TestSnowAPIOpenModelPricing(t *testing.T) {
	resetRatioMapsForTest()

	tests := []struct {
		model      string
		input      float64
		output     float64
		cacheRead  float64
		cacheWrite *float64
	}{
		{model: "gpt-5.3-codex", input: 0.425, output: 3.4, cacheRead: 0.043},
		{model: "gpt-5.4", input: 0.625, output: 3.75, cacheRead: 0.063},
		{model: "gpt-5.4-fast", input: 1.25, output: 7.5, cacheRead: 0.125},
		{model: "gpt-5.4-mini", input: 0.188, output: 1.125, cacheRead: 0.019},
		{model: "gpt-5.5", input: 1.25, output: 7.5, cacheRead: 0.125},
		{model: "gpt-5.5-fast", input: 2.5, output: 15.0, cacheRead: 0.25},
		{model: "claude-haiku-4-5", input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: ptrFloat64(0)},
		{model: "claude-haiku-4-5-20251001", input: 0.07, output: 0.35, cacheRead: 0.007, cacheWrite: ptrFloat64(0.088)},
		{model: "claude-sonnet-4-5", input: 1.5, output: 7.5, cacheRead: 0.15, cacheWrite: ptrFloat64(0)},
		{model: "claude-sonnet-4-5-20250929", input: 0.215, output: 1.075, cacheRead: 0.022, cacheWrite: ptrFloat64(0.269)},
		{model: "claude-sonnet-4-6", input: 1.5, output: 7.5, cacheRead: 0.15, cacheWrite: ptrFloat64(0)},
		{model: "claude-opus-4-5", input: 2.5, output: 12.5, cacheRead: 0.25, cacheWrite: ptrFloat64(0)},
		{model: "claude-opus-4-5-20251101", input: 0.355, output: 1.775, cacheRead: 0.035, cacheWrite: ptrFloat64(0.444)},
		{model: "claude-opus-4-6", input: 2.5, output: 12.5, cacheRead: 0.25, cacheWrite: ptrFloat64(3.125)},
		{model: "claude-opus-4-7", input: 2.5, output: 12.5, cacheRead: 0.25, cacheWrite: ptrFloat64(0)},
	}

	for _, tt := range tests {
		t.Run(tt.model, func(t *testing.T) {
			modelRatio, ok, _ := GetModelRatio(tt.model)
			if !ok {
				t.Fatalf("model ratio not configured")
			}
			requireClose(t, "input price", modelRatio*2, tt.input)
			requireClose(t, "output price", modelRatio*2*GetCompletionRatio(tt.model), tt.output)

			cacheRatio, ok := GetCacheRatio(tt.model)
			if !ok {
				t.Fatalf("cache ratio not configured")
			}
			requireClose(t, "cache read price", modelRatio*2*cacheRatio, tt.cacheRead)

			if tt.cacheWrite != nil {
				createCacheRatio, ok := GetCreateCacheRatio(tt.model)
				if !ok {
					t.Fatalf("cache write ratio not configured")
				}
				requireClose(t, "cache write price", modelRatio*2*createCacheRatio, *tt.cacheWrite)
			}
		})
	}
}

func ptrFloat64(v float64) *float64 {
	return &v
}
