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
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

type oauthCompleteRequest struct {
	Input string `json:"input"`
}

type oauthStartFlow struct {
	State        string
	Verifier     string
	AuthorizeURL string
}

type oauthCredentialPayload struct {
	EncodedKey string
	Data       gin.H
}

// oauthFlowConfig keeps provider knowledge at the edge of the generic OAuth
// flow. The shared controller owns state validation, session cleanup, channel
// type checks, and persistence so every OAuth provider gets the same safety
// behavior without duplicating protocol plumbing.
type oauthFlowConfig struct {
	sessionPrefix string
	channelType   int
	channelLabel  string
	logName       string
	createFlow    func() (oauthStartFlow, error)
	buildKey      func(ctx context.Context, code string, state string, verifier string, proxy string) (*oauthCredentialPayload, error)
}

func startOAuthFlow(c *gin.Context, channelID int, cfg oauthFlowConfig) {
	if _, ok := getOAuthChannel(c, channelID, cfg); !ok {
		return
	}

	flow, err := cfg.createFlow()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	session := sessions.Default(c)
	session.Set(oauthSessionKey(cfg, channelID, "state"), flow.State)
	session.Set(oauthSessionKey(cfg, channelID, "verifier"), flow.Verifier)
	session.Set(oauthSessionKey(cfg, channelID, "created_at"), time.Now().Unix())
	_ = session.Save()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"authorize_url": flow.AuthorizeURL,
		},
	})
}

func completeOAuthFlow(c *gin.Context, channelID int, cfg oauthFlowConfig) {
	req := oauthCompleteRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	code, state, err := parseOAuthAuthorizationInput(req.Input)
	if err != nil {
		common.SysError("failed to parse " + cfg.logName + " authorization input: " + err.Error())
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

	ch, ok := getOAuthChannel(c, channelID, cfg)
	if !ok {
		return
	}
	channelProxy := ""
	if ch != nil {
		channelProxy = ch.GetSetting().Proxy
	}

	session := sessions.Default(c)
	expectedState, _ := session.Get(oauthSessionKey(cfg, channelID, "state")).(string)
	verifier, _ := session.Get(oauthSessionKey(cfg, channelID, "verifier")).(string)
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

	payload, err := cfg.buildKey(ctx, code, state, verifier, channelProxy)
	if err != nil {
		common.SysError("failed to exchange " + cfg.logName + " authorization code: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "授权码交换失败，请重试"})
		return
	}

	session.Delete(oauthSessionKey(cfg, channelID, "state"))
	session.Delete(oauthSessionKey(cfg, channelID, "verifier"))
	session.Delete(oauthSessionKey(cfg, channelID, "created_at"))
	_ = session.Save()

	data := payload.Data
	if data == nil {
		data = gin.H{}
	}

	if channelID > 0 {
		if err := model.DB.Model(&model.Channel{}).Where("id = ?", channelID).Update("key", payload.EncodedKey).Error; err != nil {
			common.ApiError(c, err)
			return
		}
		model.InitChannelCache()
		service.ResetProxyClientCache()
		data["channel_id"] = channelID
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "saved",
			"data":    data,
		})
		return
	}

	data["key"] = payload.EncodedKey
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "generated",
		"data":    data,
	})
}

func getOAuthChannel(c *gin.Context, channelID int, cfg oauthFlowConfig) (*model.Channel, bool) {
	if channelID <= 0 {
		return nil, true
	}

	ch, err := model.GetChannelById(channelID, false)
	if err != nil {
		common.ApiError(c, err)
		return nil, false
	}
	if ch == nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "channel not found"})
		return nil, false
	}
	if ch.Type != cfg.channelType {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "channel type is not " + cfg.channelLabel})
		return nil, false
	}
	return ch, true
}

func parseOAuthChannelID(c *gin.Context) (int, bool) {
	channelID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, fmt.Errorf("invalid channel id: %w", err))
		return 0, false
	}
	return channelID, true
}

func parseOAuthAuthorizationInput(input string) (code string, state string, err error) {
	v := strings.TrimSpace(input)
	if v == "" {
		return "", "", errors.New("empty input")
	}

	if strings.Contains(v, "code=") {
		if q, parseErr := url.ParseQuery(v); parseErr == nil {
			code = strings.TrimSpace(q.Get("code"))
			state = strings.TrimSpace(q.Get("state"))
			if code != "" {
				return code, state, nil
			}
		}
		if u, parseErr := url.Parse(v); parseErr == nil {
			code = strings.TrimSpace(u.Query().Get("code"))
			state = strings.TrimSpace(u.Query().Get("state"))
			if state == "" && u.Fragment != "" {
				state = parseOAuthStateFragment(u.Fragment)
			}
			if strings.Contains(code, "#") {
				parts := strings.SplitN(code, "#", 2)
				code = strings.TrimSpace(parts[0])
				if state == "" {
					state = parseOAuthStateFragment(parts[1])
				}
			}
			return code, state, nil
		}
	}

	if strings.Contains(v, "#") {
		parts := strings.SplitN(v, "#", 2)
		return strings.TrimSpace(parts[0]), parseOAuthStateFragment(parts[1]), nil
	}

	return v, "", nil
}

func parseOAuthStateFragment(fragment string) string {
	fragment = strings.TrimSpace(fragment)
	if fragment == "" {
		return ""
	}
	if strings.Contains(fragment, "state=") {
		if q, err := url.ParseQuery(fragment); err == nil {
			return strings.TrimSpace(q.Get("state"))
		}
	}
	return fragment
}

func oauthSessionKey(cfg oauthFlowConfig, channelID int, field string) string {
	return fmt.Sprintf("%s_oauth_%s_%d", cfg.sessionPrefix, field, channelID)
}
