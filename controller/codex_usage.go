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
)

func GetCodexChannelUsage(c *gin.Context) {
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

	statusCode, body, err := fetchCodexChannelUsage(c.Request.Context(), ch)
	if err != nil {
		common.SysError("failed to fetch codex usage: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取用量信息失败，请稍后重试"})
		return
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

// fetchCodexChannelUsage owns the OAuth refresh-and-retry contract shared by
// the channel detail dialog and the sanitized channel-status summary.
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

	client, err := service.NewProxyHttpClient(ch.GetSetting().Proxy)
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

	shouldRefresh := statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden
	if !shouldRefresh || strings.TrimSpace(oauthKey.RefreshToken) == "" {
		return statusCode, body, nil
	}

	refreshCtx, refreshCancel := context.WithTimeout(ctx, 10*time.Second)
	res, refreshErr := service.RefreshCodexOAuthTokenWithProxy(
		refreshCtx,
		oauthKey.RefreshToken,
		ch.GetSetting().Proxy,
	)
	refreshCancel()
	if refreshErr != nil {
		return statusCode, body, nil
	}

	oauthKey.AccessToken = res.AccessToken
	oauthKey.RefreshToken = res.RefreshToken
	oauthKey.LastRefresh = time.Now().Format(time.RFC3339)
	oauthKey.Expired = res.ExpiresAt.Format(time.RFC3339)
	if strings.TrimSpace(oauthKey.Type) == "" {
		oauthKey.Type = "codex"
	}

	encoded, encodeErr := common.Marshal(oauthKey)
	if encodeErr == nil {
		_ = model.DB.Model(&model.Channel{}).Where("id = ?", ch.Id).Update("key", string(encoded)).Error
		model.InitChannelCache()
		service.ResetProxyClientCache()
	}

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
