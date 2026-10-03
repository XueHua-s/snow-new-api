package dto

import (
	"github.com/stretchr/testify/require"
	"testing"
)

func TestChannelHeaderTimeoutValidation(t *testing.T) {
	for _, seconds := range []int{0, 1, 120, 3600} {
		require.NoError(t, (&ChannelSettings{ResponseHeaderTimeoutSeconds: seconds}).ValidateHTTPTransport())
	}
	for _, seconds := range []int{-1, 3601} {
		require.Error(t, (&ChannelSettings{ResponseHeaderTimeoutSeconds: seconds}).ValidateHTTPTransport())
	}
}
