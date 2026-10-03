package ratio_setting

import (
	"github.com/stretchr/testify/require"
	"testing"
)

// GPT-6 uses the site's existing 5.6 pricing policy, with fast at twice base.
func TestGPT6SitePricing(t *testing.T) {
	resetRatioMapsForTest()
	t.Cleanup(resetRatioMapsForTest)
	for _, tt := range []struct {
		model string
		input float64
	}{
		{"gpt-6-sol", 2.5}, {"gpt-6-luna", 1.25}, {"gpt-6-astra", 2.5},
		{"gpt-6-fast", 5}, {"gpt-6-sol-fast", 5}, {"gpt-6-luna-fast", 2.5}, {"gpt-6-astra-fast", 5},
	} {
		t.Run(tt.model, func(t *testing.T) {
			ratio, ok, _ := GetModelRatio(tt.model)
			require.True(t, ok)
			require.InDelta(t, tt.input, ratio*2, 1e-9)
			require.InDelta(t, tt.input*6, ratio*2*GetCompletionRatio(tt.model), 1e-9)
			cache, ok := GetCacheRatio(tt.model)
			require.True(t, ok)
			require.Equal(t, float64(1), cache)
		})
	}
}
