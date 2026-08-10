package codex

import (
	"strings"

	"github.com/QuantumNous/new-api/dto"
)

// Claude Code can express reasoning either as a named effort in
// output_config.effort or, for older models and clients, as a fixed
// thinking.budget_tokens value. Codex accepts the OpenAI reasoning effort
// ladder, so normalize both Claude dialects before converting the request to
// the Responses API.
func claudeReasoningEffortForCodex(request *dto.ClaudeRequest) string {
	if request == nil {
		return ""
	}

	configuredEffort := normalizeClaudeReasoningEffort(request.GetEfforts())
	if request.Thinking == nil {
		return configuredEffort
	}

	switch strings.ToLower(strings.TrimSpace(request.Thinking.Type)) {
	case "disabled":
		return "none"
	case "adaptive", "auto":
		// An adaptive request without an explicit effort should retain the
		// selected OpenAI model's default rather than inventing a level.
		return configuredEffort
	case "enabled":
		if configuredEffort != "" {
			return configuredEffort
		}
		if request.Thinking.BudgetTokens == nil {
			return ""
		}
		return claudeThinkingBudgetToCodexEffort(*request.Thinking.BudgetTokens)
	default:
		return configuredEffort
	}
}

func normalizeClaudeReasoningEffort(effort string) string {
	switch strings.ToLower(strings.TrimSpace(effort)) {
	case "none", "disabled", "off":
		return "none"
	case "minimal":
		return "minimal"
	case "low":
		return "low"
	case "medium":
		return "medium"
	case "high":
		return "high"
	case "xhigh":
		return "xhigh"
	case "max":
		return "max"
	case "ultra", "ultracode":
		// The current Codex CLI exposes Ultra but normalizes it to Max on the
		// wire before sending a Responses API request to the ChatGPT backend.
		return "max"
	default:
		// auto/adaptive/default and unknown future values should preserve the
		// OpenAI model default instead of causing an upstream validation error.
		return ""
	}
}

func claudeThinkingBudgetToCodexEffort(budgetTokens int) string {
	switch {
	case budgetTokens <= 0:
		return "none"
	case budgetTokens <= 1024:
		return "minimal"
	case budgetTokens <= 4096:
		return "low"
	case budgetTokens <= 10240:
		return "medium"
	case budgetTokens <= 20480:
		return "high"
	case budgetTokens <= 24576:
		return "xhigh"
	default:
		return "max"
	}
}
