package types

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestWithOpenAIErrorUsesTypeAsCodeWhenCodeMissing(t *testing.T) {
	t.Parallel()

	err := WithOpenAIError(OpenAIError{
		Message: "Error",
		Type:    "rate_limit_error",
	}, http.StatusTooManyRequests)

	require.Equal(t, ErrorCode("rate_limit_error"), err.GetErrorCode())
	require.Equal(t, "rate_limit_error", err.ToOpenAIError().Code)
	require.Equal(t, "rate_limit_error", err.ToClaudeError().Type)
	require.NotContains(t, err.ToClaudeError().Type, "<nil>")
}
