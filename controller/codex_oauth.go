package controller

import (
	"context"
	"errors"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relay/channel/codex"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

var codexOAuthFlow = oauthFlowConfig{
	sessionPrefix: "codex",
	channelType:   constant.ChannelTypeCodex,
	channelLabel:  "Codex",
	logName:       "codex",
	createFlow: func() (oauthStartFlow, error) {
		flow, err := service.CreateCodexOAuthAuthorizationFlow()
		if err != nil {
			return oauthStartFlow{}, err
		}
		return oauthStartFlow{
			State:        flow.State,
			Verifier:     flow.Verifier,
			AuthorizeURL: flow.AuthorizeURL,
		}, nil
	},
	buildKey: buildCodexOAuthKey,
}

func StartCodexOAuth(c *gin.Context) {
	startOAuthFlow(c, 0, codexOAuthFlow)
}

func StartCodexOAuthForChannel(c *gin.Context) {
	channelID, ok := parseOAuthChannelID(c)
	if !ok {
		return
	}
	startOAuthFlow(c, channelID, codexOAuthFlow)
}

func CompleteCodexOAuth(c *gin.Context) {
	completeOAuthFlow(c, 0, codexOAuthFlow)
}

func CompleteCodexOAuthForChannel(c *gin.Context) {
	channelID, ok := parseOAuthChannelID(c)
	if !ok {
		return
	}
	completeOAuthFlow(c, channelID, codexOAuthFlow)
}

func buildCodexOAuthKey(ctx context.Context, code string, state string, verifier string, proxy string) (*oauthCredentialPayload, error) {
	_ = state
	tokenRes, err := service.ExchangeCodexAuthorizationCodeWithProxy(ctx, code, verifier, proxy)
	if err != nil {
		return nil, err
	}

	accountID, ok := service.ExtractCodexAccountIDFromJWT(tokenRes.AccessToken)
	if !ok {
		return nil, errors.New("failed to extract account_id from access_token")
	}
	email, _ := service.ExtractEmailFromJWT(tokenRes.AccessToken)

	key := codex.OAuthKey{
		AccessToken:  tokenRes.AccessToken,
		RefreshToken: tokenRes.RefreshToken,
		AccountID:    accountID,
		LastRefresh:  time.Now().Format(time.RFC3339),
		Expired:      tokenRes.ExpiresAt.Format(time.RFC3339),
		Email:        email,
		Type:         "codex",
	}
	encoded, err := common.Marshal(key)
	if err != nil {
		return nil, err
	}

	return &oauthCredentialPayload{
		EncodedKey: string(encoded),
		Data: gin.H{
			"account_id":   accountID,
			"email":        email,
			"expires_at":   key.Expired,
			"last_refresh": key.LastRefresh,
		},
	}, nil
}
