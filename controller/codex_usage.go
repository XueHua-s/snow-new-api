package controller

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel/codex"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func GetCodexChannelUsage(c *gin.Context) {
	fetchCodexChannelWhamData(
		c,
		service.FetchCodexWhamUsage,
		"failed to fetch codex usage",
		"获取用量信息失败，请稍后重试",
	)
}

func GetCodexChannelRateLimitResetCredits(c *gin.Context) {
	fetchCodexChannelWhamData(
		c,
		service.FetchCodexWhamRateLimitResetCredits,
		"failed to fetch codex reset credits",
		"获取重置次数详情失败，请稍后重试",
	)
}

func ResetCodexChannelUsage(c *gin.Context) {
	redeemRequestID := uuid.NewString()
	fetchCodexChannelWhamData(
		c,
		func(ctx context.Context, client *http.Client, baseURL, accessToken, accountID string) (int, []byte, error) {
			return service.ConsumeCodexWhamRateLimitResetCreditWithID(ctx, client, baseURL, accessToken, accountID, redeemRequestID)
		},
		"failed to reset codex usage",
		"重置用量失败，请稍后重试",
	)
}

type codexWhamFetchFunc func(
	ctx context.Context,
	client *http.Client,
	baseURL string,
	accessToken string,
	accountID string,
) (statusCode int, body []byte, err error)

func fetchCodexChannelWhamData(
	c *gin.Context,
	fetch codexWhamFetchFunc,
	logPrefix string,
	userMessage string,
) {
	channelId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, fmt.Errorf("invalid channel id: %w", err))
		return
	}

	ch, err := model.GetChannelById(channelId, true)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if ch == nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "channel not found"})
		return
	}
	if ch.Type != constant.ChannelTypeCodex {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "channel type is not Codex"})
		return
	}
	if ch.ChannelInfo.IsMultiKey {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "multi-key channel is not supported"})
		return
	}

	oauthKey, err := codex.ParseOAuthKey(strings.TrimSpace(ch.Key))
	if err != nil {
		common.SysError("failed to parse oauth key: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "解析凭证失败，请检查渠道配置"})
		return
	}
	accessToken := strings.TrimSpace(oauthKey.AccessToken)
	accountID := strings.TrimSpace(oauthKey.AccountID)
	if accessToken == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "codex channel: access_token is required"})
		return
	}
	if accountID == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "codex channel: account_id is required"})
		return
	}

	client, err := service.GetCodexHTTPClient(service.CodexTransportOptions{ProxyURL: ch.GetSetting().Proxy, Settings: ch.GetSetting(), Purpose: service.CodexTransportAPI})
	if err != nil {
		common.ApiError(c, err)
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	statusCode, body, err := fetch(ctx, client, ch.GetBaseURL(), accessToken, accountID)
	if err != nil {
		common.SysError(logPrefix + ": " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": userMessage})
		return
	}

	if (statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden) && strings.TrimSpace(oauthKey.RefreshToken) != "" {
		refreshCtx, refreshCancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer refreshCancel()

		refreshed, _, refreshErr := service.RefreshCodexChannelCredential(refreshCtx, ch.Id, service.CodexCredentialRefreshOptions{ResetCaches: true, ExpectedChannel: ch})
		if refreshErr == nil {
			oauthKey.AccessToken = refreshed.AccessToken

			ctx2, cancel2 := context.WithTimeout(c.Request.Context(), 15*time.Second)
			defer cancel2()
			statusCode, body, err = fetch(ctx2, client, ch.GetBaseURL(), oauthKey.AccessToken, accountID)
			if err != nil {
				common.SysError(logPrefix + " after refresh: " + err.Error())
				c.JSON(http.StatusOK, gin.H{"success": false, "message": userMessage})
				return
			}
		}
	}

	var payload any
	if common.Unmarshal(body, &payload) != nil {
		payload = string(body)
	}

	ok := statusCode >= 200 && statusCode < 300
	resp := gin.H{
		"success":         ok,
		"message":         "",
		"upstream_status": statusCode,
		"data":            payload,
	}
	if !ok {
		resp["message"] = fmt.Sprintf("upstream status: %d", statusCode)
	}
	c.JSON(http.StatusOK, resp)
}

// fetchCodexChannelUsage exposes the usage fetch-and-refresh contract to the
// aggregated channel-status endpoint without serializing channel credentials.
func fetchCodexChannelUsage(ctx context.Context, ch *model.Channel) (int, []byte, error) {
	oauthKey, err := codex.ParseOAuthKey(strings.TrimSpace(ch.Key))
	if err != nil {
		return 0, nil, fmt.Errorf("parse oauth key: %w", err)
	}
	accessToken := strings.TrimSpace(oauthKey.AccessToken)
	accountID := strings.TrimSpace(oauthKey.AccountID)
	if accessToken == "" {
		return 0, nil, fmt.Errorf("codex channel: access_token is required")
	}
	if accountID == "" {
		return 0, nil, fmt.Errorf("codex channel: account_id is required")
	}

	client, err := service.GetCodexHTTPClient(service.CodexTransportOptions{ProxyURL: ch.GetSetting().Proxy, Settings: ch.GetSetting(), Purpose: service.CodexTransportAPI})
	if err != nil {
		return 0, nil, err
	}

	fetchCtx, fetchCancel := context.WithTimeout(ctx, 15*time.Second)
	statusCode, body, err := service.FetchCodexWhamUsage(
		fetchCtx,
		client,
		ch.GetBaseURL(),
		accessToken,
		accountID,
	)
	fetchCancel()
	if err != nil {
		return 0, nil, err
	}

	if (statusCode != http.StatusUnauthorized && statusCode != http.StatusForbidden) ||
		strings.TrimSpace(oauthKey.RefreshToken) == "" {
		return statusCode, body, nil
	}

	refreshCtx, refreshCancel := context.WithTimeout(ctx, 10*time.Second)
	refreshed, _, refreshErr := service.RefreshCodexChannelCredential(refreshCtx, ch.Id, service.CodexCredentialRefreshOptions{ResetCaches: true, ExpectedChannel: ch})
	refreshCancel()
	if refreshErr != nil {
		return statusCode, body, nil
	}
	oauthKey.AccessToken = refreshed.AccessToken

	retryCtx, retryCancel := context.WithTimeout(ctx, 15*time.Second)
	defer retryCancel()
	return service.FetchCodexWhamUsage(
		retryCtx,
		client,
		ch.GetBaseURL(),
		oauthKey.AccessToken,
		accountID,
	)
}
