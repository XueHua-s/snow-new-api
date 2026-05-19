package service

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestParseClaudeOAuthKeyNestedCredentials(t *testing.T) {
	t.Parallel()

	key, err := ParseClaudeOAuthKey(`{
		"claudeAiOauth": {
			"accessToken": "access",
			"refreshToken": "refresh",
			"expiresAt": 1779207219118,
			"scopes": ["user:profile", "user:inference"],
			"subscriptionType": "max",
			"rateLimitTier": "default_claude_max_20x"
		}
	}`)

	require.NoError(t, err)
	require.Equal(t, ClaudeOAuthType, key.Type)
	require.Equal(t, "access", key.AccessToken)
	require.Equal(t, "refresh", key.RefreshToken)
	require.Equal(t, []string{"user:profile", "user:inference"}, key.Scopes)
	require.Equal(t, "max", key.SubscriptionType)
	require.Equal(t, "default_claude_max_20x", key.RateLimitTier)
	require.Equal(t, int64(1779207219118), key.ExpiresAt.UnixMilli())
}

func TestParseClaudeOAuthKeyFlatCredentials(t *testing.T) {
	t.Parallel()

	key, err := ParseClaudeOAuthKey(`{
		"type": "claude_oauth",
		"access_token": "access",
		"refresh_token": "refresh",
		"expires_at": "2026-05-19T16:00:00+08:00",
		"scope": "user:profile user:inference user:profile"
	}`)

	require.NoError(t, err)
	require.Equal(t, "access", key.AccessToken)
	require.Equal(t, "refresh", key.RefreshToken)
	require.Equal(t, []string{"user:profile", "user:inference"}, key.Scopes)
	require.Equal(t, time.Date(2026, 5, 19, 16, 0, 0, 0, time.FixedZone("", 8*60*60)).Unix(), key.ExpiresAt.Unix())
}

func TestClaudeOAuthKeyNeedsRefresh(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 5, 19, 16, 0, 0, 0, time.UTC)
	key := &ClaudeOAuthKey{
		AccessToken:  "access",
		RefreshToken: "refresh",
		ExpiresAt:    now.Add(4 * time.Minute),
	}

	require.True(t, key.needsRefresh(now))
	key.ExpiresAt = now.Add(10 * time.Minute)
	require.False(t, key.needsRefresh(now))
}
