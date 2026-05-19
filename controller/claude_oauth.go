package controller

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

type claudeOAuthCompleteRequest struct {
	Input string `json:"input"`
}

func claudeOAuthSessionKey(channelID int, field string) string {
	return fmt.Sprintf("claude_oauth_%s_%d", field, channelID)
}

func parseClaudeAuthorizationInput(input string) (code string, state string, err error) {
	v := strings.TrimSpace(input)
	if v == "" {
		return "", "", errors.New("empty input")
	}

	if strings.Contains(v, "code=") {
		if u, parseErr := url.Parse(v); parseErr == nil {
			q := u.Query()
			code = strings.TrimSpace(q.Get("code"))
			state = strings.TrimSpace(q.Get("state"))
			if state == "" {
				state = strings.TrimSpace(u.Fragment)
				if strings.Contains(state, "state=") {
					if fragmentValues, fragmentErr := url.ParseQuery(state); fragmentErr == nil {
						state = strings.TrimSpace(fragmentValues.Get("state"))
					}
				}
			}
			if strings.Contains(code, "#") {
				parts := strings.SplitN(code, "#", 2)
				code = strings.TrimSpace(parts[0])
				if state == "" {
					state = strings.TrimSpace(parts[1])
				}
			}
			return code, state, nil
		}
		if q, parseErr := url.ParseQuery(v); parseErr == nil {
			code = strings.TrimSpace(q.Get("code"))
			state = strings.TrimSpace(q.Get("state"))
			return code, state, nil
		}
	}

	if strings.Contains(v, "#") {
		parts := strings.SplitN(v, "#", 2)
		code = strings.TrimSpace(parts[0])
		state = strings.TrimSpace(parts[1])
		return code, state, nil
	}

	return v, "", nil
}

func StartClaudeOAuth(c *gin.Context) {
	startClaudeOAuthWithChannelID(c, 0)
}

func StartClaudeOAuthForChannel(c *gin.Context) {
	channelID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, fmt.Errorf("invalid channel id: %w", err))
		return
	}
	startClaudeOAuthWithChannelID(c, channelID)
}

func startClaudeOAuthWithChannelID(c *gin.Context, channelID int) {
	if channelID > 0 {
		ch, err := model.GetChannelById(channelID, false)
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
	}

	flow, err := service.CreateClaudeOAuthAuthorizationFlow()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	session := sessions.Default(c)
	session.Set(claudeOAuthSessionKey(channelID, "state"), flow.State)
	session.Set(claudeOAuthSessionKey(channelID, "verifier"), flow.Verifier)
	session.Set(claudeOAuthSessionKey(channelID, "created_at"), time.Now().Unix())
	_ = session.Save()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"authorize_url": flow.AuthorizeURL,
		},
	})
}

func CompleteClaudeOAuth(c *gin.Context) {
	completeClaudeOAuthWithChannelID(c, 0)
}

func CompleteClaudeOAuthForChannel(c *gin.Context) {
	channelID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, fmt.Errorf("invalid channel id: %w", err))
		return
	}
	completeClaudeOAuthWithChannelID(c, channelID)
}

func completeClaudeOAuthWithChannelID(c *gin.Context, channelID int) {
	req := claudeOAuthCompleteRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	code, state, err := parseClaudeAuthorizationInput(req.Input)
	if err != nil {
		common.SysError("failed to parse claude authorization input: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "解析授权信息失败，请检查输入格式"})
		return
	}
	if strings.TrimSpace(code) == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "missing authorization code"})
		return
	}
	if strings.TrimSpace(state) == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "missing state in input"})
		return
	}

	channelProxy := ""
	if channelID > 0 {
		ch, err := model.GetChannelById(channelID, false)
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
		channelProxy = ch.GetSetting().Proxy
	}

	session := sessions.Default(c)
	expectedState, _ := session.Get(claudeOAuthSessionKey(channelID, "state")).(string)
	verifier, _ := session.Get(claudeOAuthSessionKey(channelID, "verifier")).(string)
	if strings.TrimSpace(expectedState) == "" || strings.TrimSpace(verifier) == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "oauth flow not started or session expired"})
		return
	}
	if state != expectedState {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "state mismatch"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	tokenRes, err := service.ExchangeClaudeOAuthAuthorizationCodeWithProxy(ctx, code, verifier, channelProxy)
	if err != nil {
		common.SysError("failed to exchange claude authorization code: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "授权码交换失败，请重试"})
		return
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
		common.ApiError(c, err)
		return
	}
	email, _ := service.ExtractEmailFromJWT(tokenRes.AccessToken)

	session.Delete(claudeOAuthSessionKey(channelID, "state"))
	session.Delete(claudeOAuthSessionKey(channelID, "verifier"))
	session.Delete(claudeOAuthSessionKey(channelID, "created_at"))
	_ = session.Save()

	if channelID > 0 {
		if err := model.DB.Model(&model.Channel{}).Where("id = ?", channelID).Update("key", string(encoded)).Error; err != nil {
			common.ApiError(c, err)
			return
		}
		model.InitChannelCache()
		service.ResetProxyClientCache()
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "saved",
			"data": gin.H{
				"channel_id":   channelID,
				"email":        email,
				"expires_at":   key.ExpiresAt.Format(time.RFC3339),
				"last_refresh": key.LastRefresh,
			},
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "generated",
		"data": gin.H{
			"key":          string(encoded),
			"email":        email,
			"expires_at":   key.ExpiresAt.Format(time.RFC3339),
			"last_refresh": key.LastRefresh,
		},
	})
}
