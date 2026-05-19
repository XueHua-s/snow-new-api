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
	if ch.Type != constant.ChannelTypeAnthropic {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "channel type is not Claude"})
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
