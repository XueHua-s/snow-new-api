package codex

const (
	codexImageToolHostModel = "gpt-5.5"
	codexFastServiceTier    = "priority"
)

var codexFastModelAliases = map[string]string{
	"gpt-5.6-fast":       "gpt-5.6-sol",
	"gpt-5.6-sol-fast":   "gpt-5.6-sol",
	"gpt-5.6-terra-fast": "gpt-5.6-terra",
	"gpt-5.6-luna-fast":  "gpt-5.6-luna",
	"gpt-5.5-fast":       "gpt-5.5",
	"gpt-5.4-fast":       "gpt-5.4",
}

var ModelList = []string{
	"gpt-5.6-sol",
	"gpt-5.6-terra",
	"gpt-5.6-luna",
	"gpt-5.5",
	"gpt-5.4",
	"gpt-5.4-mini",
	"gpt-5.3-codex-spark",
	"codex-auto-review",
	"gpt-5.6-fast",
	"gpt-5.6-sol-fast",
	"gpt-5.6-terra-fast",
	"gpt-5.6-luna-fast",
	"gpt-5.5-fast",
	"gpt-5.4-fast",
	"gpt-image-2-codex",
	"chatgpt-image-latest",
	"imagegen",
}

func codexFastBaseModel(model string) (string, bool) {
	baseModel, ok := codexFastModelAliases[model]
	return baseModel, ok
}

const ChannelName = "codex"
