// Package codexmodel owns the shared Codex model catalog and pricing metadata.
// Consumers derive routing and billing views from this single registry.
package codexmodel

// Pricing describes the default billing ratios for a Codex model.
type Pricing struct {
	ModelRatio      float64
	CompletionRatio float64
	CacheRatio      float64
}

var PricingByModel = map[string]Pricing{
	"gpt-6-sol":        {ModelRatio: 1.25, CompletionRatio: 6, CacheRatio: 1},
	"gpt-6-luna":       {ModelRatio: 0.625, CompletionRatio: 6, CacheRatio: 1},
	"gpt-6-astra":      {ModelRatio: 1.25, CompletionRatio: 6, CacheRatio: 1},
	"gpt-6-fast":       {ModelRatio: 2.5, CompletionRatio: 6, CacheRatio: 1},
	"gpt-6-sol-fast":   {ModelRatio: 2.5, CompletionRatio: 6, CacheRatio: 1},
	"gpt-6-luna-fast":  {ModelRatio: 1.25, CompletionRatio: 6, CacheRatio: 1},
	"gpt-6-astra-fast": {ModelRatio: 2.5, CompletionRatio: 6, CacheRatio: 1},
}
