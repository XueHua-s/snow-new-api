package controller

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

type oauthCompleteRequest struct {
	Input     string `json:"input"`
	FlowToken string `json:"flow_token"`
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

type oauthFlowTokenPayload struct {
	SessionPrefix string `json:"session_prefix"`
	ChannelID     int    `json:"channel_id"`
	State         string `json:"state"`
	Verifier      string `json:"verifier"`
	CreatedAt     int64  `json:"created_at"`
}

var oauthFlowTokenTTL = time.Hour

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
	if cfg.channelType == constant.ChannelTypeCodex {
		c.Header("Cache-Control", "no-store")
		if _, ok := middleware.GetSessionAuthIdentity(c); !ok {
			c.AbortWithStatus(http.StatusUnauthorized)
			return
		}
		if channelID > 0 && !requireCodexCredentialProof(c) {
			return
		}
	}
	if _, ok := getOAuthChannel(c, channelID, cfg); !ok {
		return
	}

	flow, err := cfg.createFlow()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	createdAt := time.Now().Unix()
	var flowToken string
	if cfg.channelType == constant.ChannelTypeCodex {
		identity, _ := middleware.GetSessionAuthIdentity(c)
		encoded, encodeErr := common.Marshal(oauthFlowTokenPayload{SessionPrefix: cfg.sessionPrefix, ChannelID: channelID, State: flow.State, Verifier: flow.Verifier, CreatedAt: createdAt})
		if encodeErr != nil {
			common.ApiError(c, encodeErr)
			return
		}
		flowToken, _, err = model.CreateAuthFlow(model.AuthFlowCreate{Purpose: model.AuthFlowPurposeOAuth, Provider: cfg.sessionPrefix, Intent: "channel", UserId: identity.UserID, SessionId: identity.SessionID, Payload: string(encoded), ExpiresAt: time.Now().Add(10 * time.Minute)})
	} else {
		flowToken, err = createOAuthFlowToken(cfg, channelID, flow.State, flow.Verifier, createdAt)
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"authorize_url": flow.AuthorizeURL,
			"flow_token":    flowToken,
		},
	})
}

func completeOAuthFlow(c *gin.Context, channelID int, cfg oauthFlowConfig) {
	if cfg.channelType == constant.ChannelTypeCodex {
		c.Header("Cache-Control", "no-store")
		if _, ok := middleware.GetSessionAuthIdentity(c); !ok {
			c.AbortWithStatus(http.StatusUnauthorized)
			return
		}
		if channelID > 0 && !requireCodexCredentialProof(c) {
			return
		}
	}
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

	var flowToken *oauthFlowTokenPayload
	var tokenErr error
	var match model.AuthFlowMatch
	if cfg.channelType == constant.ChannelTypeCodex {
		identity, _ := middleware.GetSessionAuthIdentity(c)
		match = model.AuthFlowMatch{Purpose: model.AuthFlowPurposeOAuth, Provider: cfg.sessionPrefix, Intent: "channel", UserId: identity.UserID, SessionId: identity.SessionID}
		stored, err := model.GetAuthFlow(req.FlowToken, match)
		tokenErr = err
		if err == nil {
			flowToken = &oauthFlowTokenPayload{}
			tokenErr = common.UnmarshalJsonStr(stored.Payload, flowToken)
			if tokenErr == nil && (stored.CreatedAt.After(time.Now()) || flowToken.CreatedAt > time.Now().Unix() || flowToken.CreatedAt <= 0 || flowToken.SessionPrefix != cfg.sessionPrefix || flowToken.ChannelID != channelID || flowToken.Verifier == "" || flowToken.State == "") {
				tokenErr = model.ErrAuthFlowInvalid
			}
		}
	} else {
		flowToken, tokenErr = parseOAuthFlowToken(req.FlowToken, cfg, channelID)
	}
	if tokenErr != nil {
		common.SysError("failed to parse " + cfg.logName + " oauth flow token: " + tokenErr.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "oauth flow expired or invalid"})
		return
	}
	if state != flowToken.State {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "state mismatch"})
		return
	}
	if cfg.channelType == constant.ChannelTypeCodex {
		// Commit consumption before the external exchange. An ambiguous failure must
		// require a new ceremony, never rollback into a replayable authorization code.
		if _, err := model.ConsumeAuthFlow(req.FlowToken, match); err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "oauth flow expired or invalid"})
			return
		}
	}
	verifier := flowToken.Verifier

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	payload, err := cfg.buildKey(ctx, code, state, verifier, channelProxy)
	if err != nil {
		common.SysError("failed to exchange " + cfg.logName + " authorization code: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "授权码交换失败，请重试"})
		return
	}

	data := payload.Data
	if data == nil {
		data = gin.H{}
	}

	if channelID > 0 {
		var saveErr error
		if cfg.channelType == constant.ChannelTypeCodex {
			saveErr = model.ReplaceChannelCredentialIfUnchanged(ch, payload.EncodedKey)
		} else {
			saveErr = model.DB.Model(&model.Channel{}).Where("id = ?", channelID).Update("key", payload.EncodedKey).Error
		}
		if saveErr != nil {
			common.ApiError(c, saveErr)
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

	ch, err := model.GetChannelById(channelID, cfg.channelType == constant.ChannelTypeCodex)
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

func createOAuthFlowToken(cfg oauthFlowConfig, channelID int, state string, verifier string, createdAt int64) (string, error) {
	payload := oauthFlowTokenPayload{
		SessionPrefix: cfg.sessionPrefix,
		ChannelID:     channelID,
		State:         strings.TrimSpace(state),
		Verifier:      strings.TrimSpace(verifier),
		CreatedAt:     createdAt,
	}
	if payload.State == "" || payload.Verifier == "" {
		return "", errors.New("oauth flow token missing state or verifier")
	}
	payloadBytes, err := common.Marshal(payload)
	if err != nil {
		return "", err
	}
	encodedPayload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	return encodedPayload + "." + signOAuthFlowToken(encodedPayload), nil
}

func parseOAuthFlowToken(raw string, cfg oauthFlowConfig, channelID int) (*oauthFlowTokenPayload, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("empty flow token")
	}
	encodedPayload, encodedSig, ok := strings.Cut(raw, ".")
	if !ok || encodedPayload == "" || encodedSig == "" {
		return nil, errors.New("invalid flow token format")
	}
	expectedSig := signOAuthFlowToken(encodedPayload)
	if !hmac.Equal([]byte(encodedSig), []byte(expectedSig)) {
		return nil, errors.New("invalid flow token signature")
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(encodedPayload)
	if err != nil {
		return nil, err
	}
	var payload oauthFlowTokenPayload
	if err := common.Unmarshal(payloadBytes, &payload); err != nil {
		return nil, err
	}
	if payload.SessionPrefix != cfg.sessionPrefix || payload.ChannelID != channelID {
		return nil, errors.New("flow token does not match oauth provider or channel")
	}
	if strings.TrimSpace(payload.State) == "" || strings.TrimSpace(payload.Verifier) == "" {
		return nil, errors.New("flow token missing state or verifier")
	}
	if payload.CreatedAt <= 0 || time.Since(time.Unix(payload.CreatedAt, 0)) > oauthFlowTokenTTL {
		return nil, errors.New("flow token expired")
	}
	return &payload, nil
}

func signOAuthFlowToken(encodedPayload string) string {
	mac := hmac.New(sha256.New, []byte(common.SessionSecret))
	_, _ = mac.Write([]byte(encodedPayload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
