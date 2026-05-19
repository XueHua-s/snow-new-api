package service

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/require"
)

func TestResetStatusCode(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name             string
		statusCode       int
		statusCodeConfig string
		expectedCode     int
	}{
		{
			name:             "map string value",
			statusCode:       429,
			statusCodeConfig: `{"429":"503"}`,
			expectedCode:     503,
		},
		{
			name:             "map int value",
			statusCode:       429,
			statusCodeConfig: `{"429":503}`,
			expectedCode:     503,
		},
		{
			name:             "skip invalid string value",
			statusCode:       429,
			statusCodeConfig: `{"429":"bad-code"}`,
			expectedCode:     429,
		},
		{
			name:             "skip status code 200",
			statusCode:       200,
			statusCodeConfig: `{"200":503}`,
			expectedCode:     200,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			newAPIError := &types.NewAPIError{
				StatusCode: tc.statusCode,
			}
			ResetStatusCode(newAPIError, tc.statusCodeConfig)
			require.Equal(t, tc.expectedCode, newAPIError.StatusCode)
		})
	}
}

func TestRelayErrorHandlerIncludesRateLimitHeadersFor429(t *testing.T) {
	t.Parallel()

	resp := &http.Response{
		StatusCode: http.StatusTooManyRequests,
		Header: http.Header{
			"Retry-After":                      []string{"12"},
			"Anthropic-Ratelimit-Tokens-Reset": []string{"2026-05-19T15:10:00Z"},
		},
		Body: io.NopCloser(strings.NewReader(`{"error":{"type":"rate_limit_error","message":"Error","code":"rate_limit_error"}}`)),
	}

	newAPIError := RelayErrorHandler(context.Background(), resp, false)

	require.Equal(t, http.StatusTooManyRequests, newAPIError.StatusCode)
	require.Equal(t, types.ErrorCode("rate_limit_error"), newAPIError.GetErrorCode())
	require.Contains(t, newAPIError.Error(), "Error")
	require.Contains(t, newAPIError.Error(), "type=rate_limit_error")
	require.Contains(t, newAPIError.Error(), "retry-after=12")
	require.Contains(t, newAPIError.Error(), "anthropic-ratelimit-tokens-reset=2026-05-19T15:10:00Z")
}
