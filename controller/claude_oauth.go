package controller

import (
	"context"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

var claudeOAuthFlow = oauthFlowConfig{
	sessionPrefix: "claude",
	channelType:   constant.ChannelTypeClaudeOAuth,
	channelLabel:  "Claude(OAuth)",
	logName:       "claude",
	createFlow: func() (oauthStartFlow, error) {
		flow, err := service.CreateClaudeOAuthAuthorizationFlow()
		if err != nil {
			return oauthStartFlow{}, err
		}
		return oauthStartFlow{
			State:        flow.State,
			Verifier:     flow.Verifier,
			AuthorizeURL: flow.AuthorizeURL,
		}, nil
	},
	buildKey: buildClaudeOAuthKey,
}

func StartClaudeOAuth(c *gin.Context) {
	startOAuthFlow(c, 0, claudeOAuthFlow)
}

func StartClaudeOAuthForChannel(c *gin.Context) {
	channelID, ok := parseOAuthChannelID(c)
	if !ok {
		return
	}
	startOAuthFlow(c, channelID, claudeOAuthFlow)
}

func CompleteClaudeOAuth(c *gin.Context) {
	completeOAuthFlow(c, 0, claudeOAuthFlow)
}

func CompleteClaudeOAuthForChannel(c *gin.Context) {
	channelID, ok := parseOAuthChannelID(c)
	if !ok {
		return
	}
	completeOAuthFlow(c, channelID, claudeOAuthFlow)
}

func buildClaudeOAuthKey(ctx context.Context, code string, verifier string, proxy string) (*oauthCredentialPayload, error) {
	tokenRes, err := service.ExchangeClaudeOAuthAuthorizationCodeWithProxy(ctx, code, verifier, proxy)
	if err != nil {
		return nil, err
	}

	key := service.ClaudeOAuthKey{
		Type:         service.ClaudeOAuthType,
		AccessToken:  tokenRes.AccessToken,
		RefreshToken: tokenRes.RefreshToken,
		ExpiresAt:    tokenRes.ExpiresAt,
		Scopes:       tokenRes.Scopes,
		LastRefresh:  time.Now().Format(time.RFC3339),
	}
	encoded, err := key.MarshalJSONForStorage()
	if err != nil {
		return nil, err
	}
	email, _ := service.ExtractEmailFromJWT(tokenRes.AccessToken)

	return &oauthCredentialPayload{
		EncodedKey: string(encoded),
		Data: gin.H{
			"email":        email,
			"expires_at":   key.ExpiresAt.Format(time.RFC3339),
			"last_refresh": key.LastRefresh,
		},
	}, nil
}
