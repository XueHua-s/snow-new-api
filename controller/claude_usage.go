package controller

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

func GetClaudeChannelUsage(c *gin.Context) {
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
	if ch.Type != constant.ChannelTypeClaudeOAuth {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "channel type is not Claude(OAuth)"})
		return
	}

	if strings.HasPrefix(strings.TrimSpace(ch.Key), "{") {
		key, err := service.EnsureClaudeOAuthCredential(c.Request.Context(), ch.Id, ch.Key, ch.GetSetting().Proxy)
		if err != nil {
			common.SysError("failed to parse claude oauth credential: " + err.Error())
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "解析 Claude OAuth 凭证失败，请重新授权"})
			return
		}
		email, _ := service.ExtractEmailFromJWT(key.AccessToken)
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "",
			"data": gin.H{
				"loggedIn":          strings.TrimSpace(key.AccessToken) != "",
				"authMethod":        "OAuth subscription",
				"apiProvider":       "Claude(OAuth)",
				"email":             email,
				"subscriptionType":  fallbackString(key.SubscriptionType, "subscription"),
				"rateLimitTier":     key.RateLimitTier,
				"expiresAt":         formatOptionalTime(key.ExpiresAt),
				"lastRefresh":       key.LastRefresh,
				"scopes":            key.Scopes,
				"usageAvailable":    false,
				"usageMessage":      "Claude OAuth 协议可以显示授权状态，但 Anthropic 未在该协议中公开订阅额度用量窗口。",
				"directOAuth":       true,
				"bridgeProcessUsed": false,
			},
		})
		return
	}

	baseURL := strings.TrimRight(strings.TrimSpace(ch.GetBaseURL()), "/")
	if baseURL == "" {
		baseURL = strings.TrimRight(strings.TrimSpace(constant.ChannelBaseURLs[ch.Type]), "/")
	}
	if baseURL == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "Claude channel base URL is required"})
		return
	}

	client, err := service.NewProxyHttpClient(ch.GetSetting().Proxy)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/v1/account", nil)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	resp, err := client.Do(req)
	if err != nil {
		common.SysError("failed to fetch claude account info: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取 Claude 账号信息失败，请检查 OAuth 桥接服务"})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	var payload any
	if common.Unmarshal(body, &payload) != nil {
		payload = string(body)
	}

	ok := resp.StatusCode >= 200 && resp.StatusCode < 300
	result := gin.H{
		"success":         ok,
		"message":         "",
		"upstream_status": resp.StatusCode,
		"data":            payload,
	}
	if !ok {
		result["message"] = fmt.Sprintf("upstream status: %d", resp.StatusCode)
	}
	c.JSON(http.StatusOK, result)
}

func fallbackString(v string, fallback string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return fallback
	}
	return v
}

func formatOptionalTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}
