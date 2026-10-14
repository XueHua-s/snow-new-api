package controller

import (
	"fmt"
	"io"
	"math"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

func roundRatioValue(value float64) float64 {
	return math.Round(value*1e6) / 1e6
}

func isModelsDevAPIEndpoint(rawURL string) bool {
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	if strings.ToLower(parsedURL.Hostname()) != modelsDevHost {
		return false
	}
	path := strings.TrimSuffix(parsedURL.Path, "/")
	if path == "" {
		path = "/"
	}
	return path == modelsDevPath
}

// convertOpenRouterToRatioData parses OpenRouter's /v1/models response and converts
// per-token USD pricing into the local ratio format.
// model_ratio = prompt_price_per_token * 1_000_000 * (USD / 1000)
//
//	since 1 ratio unit = $0.002/1K tokens and USD=500, the factor is 500_000
//
// completion_ratio = completion_price / prompt_price (output/input multiplier)
func convertOpenRouterToRatioData(reader io.Reader) (map[string]any, error) {
	var orResp struct {
		Data []struct {
			ID      string `json:"id"`
			Pricing struct {
				Prompt         string `json:"prompt"`
				Completion     string `json:"completion"`
				InputCacheRead string `json:"input_cache_read"`
			} `json:"pricing"`
		} `json:"data"`
	}

	if err := common.DecodeJson(reader, &orResp); err != nil {
		return nil, fmt.Errorf("failed to decode OpenRouter response: %w", err)
	}

	modelRatioMap := make(map[string]any)
	completionRatioMap := make(map[string]any)
	cacheRatioMap := make(map[string]any)

	for _, m := range orResp.Data {
		promptPrice, promptErr := strconv.ParseFloat(m.Pricing.Prompt, 64)
		completionPrice, compErr := strconv.ParseFloat(m.Pricing.Completion, 64)

		if promptErr != nil && compErr != nil {
			// Both unparseable — skip this model
			continue
		}

		// Treat parse errors as 0
		if promptErr != nil {
			promptPrice = 0
		}
		if compErr != nil {
			completionPrice = 0
		}

		// Negative values are sentinel values (e.g., -1 for dynamic/variable pricing) — skip
		if promptPrice < 0 || completionPrice < 0 {
			continue
		}

		if promptPrice == 0 && completionPrice == 0 {
			// Free model
			modelRatioMap[m.ID] = 0.0
			continue
		}
		if promptPrice <= 0 {
			// No meaningful prompt baseline, cannot derive ratios safely.
			continue
		}

		// Normal case: promptPrice > 0
		ratio := promptPrice * 1000 * ratio_setting.USD
		ratio = roundRatioValue(ratio)
		modelRatioMap[m.ID] = ratio

		compRatio := completionPrice / promptPrice
		compRatio = roundRatioValue(compRatio)
		completionRatioMap[m.ID] = compRatio

		// Convert input_cache_read to cache_ratio (= cache_read_price / prompt_price)
		if m.Pricing.InputCacheRead != "" {
			if cachePrice, err := strconv.ParseFloat(m.Pricing.InputCacheRead, 64); err == nil && cachePrice >= 0 {
				cacheRatio := cachePrice / promptPrice
				cacheRatio = roundRatioValue(cacheRatio)
				cacheRatioMap[m.ID] = cacheRatio
			}
		}
	}

	converted := make(map[string]any)
	if len(modelRatioMap) > 0 {
		converted["model_ratio"] = modelRatioMap
	}
	if len(completionRatioMap) > 0 {
		converted["completion_ratio"] = completionRatioMap
	}
	if len(cacheRatioMap) > 0 {
		converted["cache_ratio"] = cacheRatioMap
	}

	return converted, nil
}

type modelsDevProvider struct {
	Models map[string]modelsDevModel `json:"models"`
}

type modelsDevModel struct {
	Cost modelsDevCost `json:"cost"`
}

type modelsDevCost struct {
	Input     *float64 `json:"input"`
	Output    *float64 `json:"output"`
	CacheRead *float64 `json:"cache_read"`
}

type modelsDevCandidate struct {
	Provider  string
	Input     float64
	Output    *float64
	CacheRead *float64
}

func cloneFloatPtr(v *float64) *float64 {
	if v == nil {
		return nil
	}
	out := *v
	return &out
}

func isValidNonNegativeCost(v float64) bool {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return false
	}
	return v >= 0
}

func buildModelsDevCandidate(provider string, cost modelsDevCost) (modelsDevCandidate, bool) {
	if cost.Input == nil {
		return modelsDevCandidate{}, false
	}

	input := *cost.Input
	if !isValidNonNegativeCost(input) {
		return modelsDevCandidate{}, false
	}

	var output *float64
	if cost.Output != nil {
		if !isValidNonNegativeCost(*cost.Output) {
			return modelsDevCandidate{}, false
		}
		output = cloneFloatPtr(cost.Output)
	}

	// input=0/output>0 cannot be transformed into local ratio.
	if input == 0 && output != nil && *output > 0 {
		return modelsDevCandidate{}, false
	}

	var cacheRead *float64
	if cost.CacheRead != nil && isValidNonNegativeCost(*cost.CacheRead) {
		cacheRead = cloneFloatPtr(cost.CacheRead)
	}

	return modelsDevCandidate{
		Provider:  provider,
		Input:     input,
		Output:    output,
		CacheRead: cacheRead,
	}, true
}

func shouldReplaceModelsDevCandidate(current, next modelsDevCandidate) bool {
	currentNonZero := current.Input > 0
	nextNonZero := next.Input > 0
	if currentNonZero != nextNonZero {
		// Prefer non-zero pricing data; this matches "cheapest non-zero" conflict policy.
		return nextNonZero
	}
	if nextNonZero && !nearlyEqual(next.Input, current.Input) {
		return next.Input < current.Input
	}
	// Stable tie-breaker for deterministic result.
	return next.Provider < current.Provider
}

// convertModelsDevToRatioData parses models.dev /api.json and converts
// provider pricing metadata into local ratio format.
// models.dev costs are USD per 1M tokens:
//
//	model_ratio = input_cost_per_1M / 2
//	completion_ratio = output_cost / input_cost
//	cache_ratio = cache_read_cost / input_cost
//
// Duplicate model keys across providers are resolved by selecting the
// cheapest non-zero input cost. If only zero-priced candidates exist,
// a zero ratio is kept.
func convertModelsDevToRatioData(reader io.Reader) (map[string]any, error) {
	var upstreamData map[string]modelsDevProvider
	if err := common.DecodeJson(reader, &upstreamData); err != nil {
		return nil, fmt.Errorf("failed to decode models.dev response: %w", err)
	}
	if len(upstreamData) == 0 {
		return nil, fmt.Errorf("empty models.dev response")
	}

	providers := make([]string, 0, len(upstreamData))
	for provider := range upstreamData {
		providers = append(providers, provider)
	}
	sort.Strings(providers)

	selectedCandidates := make(map[string]modelsDevCandidate)
	for _, provider := range providers {
		providerData := upstreamData[provider]
		if len(providerData.Models) == 0 {
			continue
		}

		modelNames := make([]string, 0, len(providerData.Models))
		for modelName := range providerData.Models {
			modelNames = append(modelNames, modelName)
		}
		sort.Strings(modelNames)

		for _, modelName := range modelNames {
			candidate, ok := buildModelsDevCandidate(provider, providerData.Models[modelName].Cost)
			if !ok {
				continue
			}
			current, exists := selectedCandidates[modelName]
			if !exists || shouldReplaceModelsDevCandidate(current, candidate) {
				selectedCandidates[modelName] = candidate
			}
		}
	}

	if len(selectedCandidates) == 0 {
		return nil, fmt.Errorf("no valid models.dev pricing entries found")
	}

	modelRatioMap := make(map[string]any)
	completionRatioMap := make(map[string]any)
	cacheRatioMap := make(map[string]any)

	for modelName, candidate := range selectedCandidates {
		if candidate.Input == 0 {
			modelRatioMap[modelName] = 0.0
			continue
		}

		modelRatio := candidate.Input * float64(ratio_setting.USD) / modelsDevInputCostRatioBase
		modelRatioMap[modelName] = roundRatioValue(modelRatio)

		if candidate.Output != nil {
			completionRatio := *candidate.Output / candidate.Input
			completionRatioMap[modelName] = roundRatioValue(completionRatio)
		}

		if candidate.CacheRead != nil {
			cacheRatio := *candidate.CacheRead / candidate.Input
			cacheRatioMap[modelName] = roundRatioValue(cacheRatio)
		}
	}

	converted := make(map[string]any)
	if len(modelRatioMap) > 0 {
		converted["model_ratio"] = modelRatioMap
	}
	if len(completionRatioMap) > 0 {
		converted["completion_ratio"] = completionRatioMap
	}
	if len(cacheRatioMap) > 0 {
		converted["cache_ratio"] = cacheRatioMap
	}
	return converted, nil
}
