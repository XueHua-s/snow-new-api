package operation_setting

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestClaudeCliPassThroughHeadersReturnsCopy(t *testing.T) {
	t.Parallel()

	headers := ClaudeCliPassThroughHeaders()
	require.Contains(t, headers, "User-Agent")

	headers[0] = "mutated"

	require.NotEqual(t, "mutated", ClaudeCliPassThroughHeaders()[0])
}
