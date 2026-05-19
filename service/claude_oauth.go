package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const (
	ClaudeOAuthType      = "claude_oauth"
	ClaudeOAuthUserAgent = "claude-cli/2.1.144 (external, cli)"

	claudeOAuthClientID     = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
	claudeOAuthAuthorizeURL = "https://claude.ai/oauth/authorize"
	claudeOAuthTokenURL     = "https://console.anthropic.com/v1/oauth/token"
	claudeOAuthRedirectURI  = "https://console.anthropic.com/oauth/code/callback"
	claudeOAuthScope        = "org:create_api_key user:profile user:inference"
)

var ClaudeOAuthBetaHeaders = []string{
	"oauth-2025-04-20",
	"interleaved-thinking-2025-05-14",
	"claude-code-20250219",
}

var claudeAIDefaultScopes = []string{
	"org:create_api_key",
	"user:profile",
	"user:inference",
}

type ClaudeOAuthKey struct {
	Type             string
	AccessToken      string
	RefreshToken     string
	ExpiresAt        time.Time
	Scopes           []string
	SubscriptionType string
	RateLimitTier    string
	LastRefresh      string
}

type ClaudeOAuthTokenResult struct {
	AccessToken  string
	RefreshToken string
	ExpiresAt    time.Time
	Scopes       []string
}

type ClaudeOAuthAuthorizationFlow struct {
	State        string
	Verifier     string
	Challenge    string
	AuthorizeURL string
}

func CreateClaudeOAuthAuthorizationFlow() (*ClaudeOAuthAuthorizationFlow, error) {
	state, err := createStateHex(16)
	if err != nil {
		return nil, err
	}
	verifier, challenge, err := generatePKCEPair()
	if err != nil {
		return nil, err
	}
	u, err := buildClaudeOAuthAuthorizeURL(state, challenge)
	if err != nil {
		return nil, err
	}
	return &ClaudeOAuthAuthorizationFlow{
		State:        state,
		Verifier:     verifier,
		Challenge:    challenge,
		AuthorizeURL: u,
	}, nil
}

func ParseClaudeOAuthKey(raw string) (*ClaudeOAuthKey, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, errors.New("claude oauth channel: empty key")
	}
	if !strings.HasPrefix(trimmed, "{") {
		return nil, errors.New("claude oauth channel: key must be a JSON object")
	}

	var root map[string]any
	if err := common.Unmarshal([]byte(trimmed), &root); err != nil {
		return nil, errors.New("claude oauth channel: invalid key json")
	}

	data := root
	dataIsRoot := true
	if nested, ok := asMap(root["claudeAiOauth"]); ok {
		data = nested
		dataIsRoot = false
	}

	key := &ClaudeOAuthKey{
		Type:             firstString(root, data, dataIsRoot, "type"),
		AccessToken:      firstString(root, data, dataIsRoot, "access_token", "accessToken"),
		RefreshToken:     firstString(root, data, dataIsRoot, "refresh_token", "refreshToken"),
		Scopes:           firstStringSlice(root, data, dataIsRoot, "scopes", "scope"),
		SubscriptionType: firstString(root, data, dataIsRoot, "subscription_type", "subscriptionType"),
		RateLimitTier:    firstString(root, data, dataIsRoot, "rate_limit_tier", "rateLimitTier"),
		LastRefresh:      firstString(root, data, dataIsRoot, "last_refresh", "lastRefresh"),
	}
	if expiresAt, ok := firstTime(root, data, dataIsRoot, "expires_at", "expiresAt", "expired"); ok {
		key.ExpiresAt = expiresAt
	}
	if key.Type == "" {
		key.Type = ClaudeOAuthType
	}
	return key, nil
}

func EnsureClaudeOAuthCredential(ctx context.Context, channelID int, rawKey string, proxyURL string) (*ClaudeOAuthKey, error) {
	key, err := ParseClaudeOAuthKey(rawKey)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(key.AccessToken) == "" {
		return nil, errors.New("claude oauth channel: access_token is required")
	}
	if !key.needsRefresh(time.Now()) {
		return key, nil
	}
	if strings.TrimSpace(key.RefreshToken) == "" {
		return key, nil
	}

	refreshCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	res, err := RefreshClaudeOAuthTokenWithProxy(refreshCtx, key.RefreshToken, proxyURL, key.Scopes)
	if err != nil {
		return nil, err
	}

	key.AccessToken = res.AccessToken
	key.RefreshToken = res.RefreshToken
	key.ExpiresAt = res.ExpiresAt
	key.Scopes = res.Scopes
	key.LastRefresh = time.Now().Format(time.RFC3339)
	if key.Type == "" {
		key.Type = ClaudeOAuthType
	}

	if channelID > 0 {
		encoded, err := key.MarshalJSONForStorage()
		if err != nil {
			return nil, err
		}
		if err := model.DB.Model(&model.Channel{}).Where("id = ?", channelID).Update("key", string(encoded)).Error; err != nil {
			return nil, err
		}
		model.InitChannelCache()
		ResetProxyClientCache()
	}

	return key, nil
}

func RefreshClaudeOAuthTokenWithProxy(ctx context.Context, refreshToken string, proxyURL string, scopes []string) (*ClaudeOAuthTokenResult, error) {
	client, err := getCodexOAuthHTTPClient(proxyURL)
	if err != nil {
		return nil, err
	}
	return refreshClaudeOAuthToken(ctx, client, claudeOAuthTokenURL, refreshToken, scopes)
}

func ExchangeClaudeOAuthAuthorizationCodeWithProxy(ctx context.Context, code string, verifier string, proxyURL string) (*ClaudeOAuthTokenResult, error) {
	client, err := getCodexOAuthHTTPClient(proxyURL)
	if err != nil {
		return nil, err
	}
	return exchangeClaudeOAuthAuthorizationCode(ctx, client, claudeOAuthTokenURL, code, verifier, claudeOAuthRedirectURI)
}

func refreshClaudeOAuthToken(ctx context.Context, client *http.Client, tokenURL string, refreshToken string, scopes []string) (*ClaudeOAuthTokenResult, error) {
	rt := strings.TrimSpace(refreshToken)
	if rt == "" {
		return nil, errors.New("empty refresh_token")
	}

	requestedScopes := normalizeScopes(scopes)
	if len(requestedScopes) == 0 {
		requestedScopes = claudeAIDefaultScopes
	}

	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", rt)
	form.Set("client_id", claudeOAuthClientID)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var payload struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		Scope        string `json:"scope"`
	}
	if err := common.DecodeJson(resp.Body, &payload); err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("claude oauth refresh failed: status=%d", resp.StatusCode)
	}

	accessToken := strings.TrimSpace(payload.AccessToken)
	if accessToken == "" || payload.ExpiresIn <= 0 {
		return nil, errors.New("claude oauth refresh response missing fields")
	}
	newRefreshToken := strings.TrimSpace(payload.RefreshToken)
	if newRefreshToken == "" {
		newRefreshToken = rt
	}

	responseScopes := normalizeScopes(strings.Fields(payload.Scope))
	if len(responseScopes) == 0 {
		responseScopes = requestedScopes
	}

	return &ClaudeOAuthTokenResult{
		AccessToken:  accessToken,
		RefreshToken: newRefreshToken,
		ExpiresAt:    time.Now().Add(time.Duration(payload.ExpiresIn) * time.Second),
		Scopes:       responseScopes,
	}, nil
}

func exchangeClaudeOAuthAuthorizationCode(
	ctx context.Context,
	client *http.Client,
	tokenURL string,
	code string,
	verifier string,
	redirectURI string,
) (*ClaudeOAuthTokenResult, error) {
	c := strings.TrimSpace(code)
	v := strings.TrimSpace(verifier)
	if c == "" {
		return nil, errors.New("empty authorization code")
	}
	if v == "" {
		return nil, errors.New("empty code_verifier")
	}

	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("client_id", claudeOAuthClientID)
	form.Set("code", c)
	form.Set("code_verifier", v)
	form.Set("redirect_uri", redirectURI)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var payload struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		Scope        string `json:"scope"`
	}
	if err := common.DecodeJson(resp.Body, &payload); err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("claude oauth code exchange failed: status=%d", resp.StatusCode)
	}
	if strings.TrimSpace(payload.AccessToken) == "" || strings.TrimSpace(payload.RefreshToken) == "" || payload.ExpiresIn <= 0 {
		return nil, errors.New("claude oauth token response missing fields")
	}

	scopes := normalizeScopes(strings.Fields(payload.Scope))
	if len(scopes) == 0 {
		scopes = claudeAIDefaultScopes
	}

	return &ClaudeOAuthTokenResult{
		AccessToken:  strings.TrimSpace(payload.AccessToken),
		RefreshToken: strings.TrimSpace(payload.RefreshToken),
		ExpiresAt:    time.Now().Add(time.Duration(payload.ExpiresIn) * time.Second),
		Scopes:       scopes,
	}, nil
}

func buildClaudeOAuthAuthorizeURL(state string, challenge string) (string, error) {
	u, err := url.Parse(claudeOAuthAuthorizeURL)
	if err != nil {
		return "", err
	}
	q := u.Query()
	q.Set("code", "true")
	q.Set("response_type", "code")
	q.Set("client_id", claudeOAuthClientID)
	q.Set("redirect_uri", claudeOAuthRedirectURI)
	q.Set("scope", claudeOAuthScope)
	q.Set("code_challenge", challenge)
	q.Set("code_challenge_method", "S256")
	q.Set("state", state)
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func (key *ClaudeOAuthKey) MarshalJSONForStorage() ([]byte, error) {
	obj := map[string]any{
		"type":          ClaudeOAuthType,
		"access_token":  strings.TrimSpace(key.AccessToken),
		"refresh_token": strings.TrimSpace(key.RefreshToken),
	}
	if !key.ExpiresAt.IsZero() {
		obj["expires_at"] = key.ExpiresAt.UnixMilli()
	}
	if len(key.Scopes) > 0 {
		obj["scopes"] = normalizeScopes(key.Scopes)
	}
	if strings.TrimSpace(key.SubscriptionType) != "" {
		obj["subscription_type"] = strings.TrimSpace(key.SubscriptionType)
	}
	if strings.TrimSpace(key.RateLimitTier) != "" {
		obj["rate_limit_tier"] = strings.TrimSpace(key.RateLimitTier)
	}
	if strings.TrimSpace(key.LastRefresh) != "" {
		obj["last_refresh"] = strings.TrimSpace(key.LastRefresh)
	}
	return common.Marshal(obj)
}

func (key *ClaudeOAuthKey) needsRefresh(now time.Time) bool {
	if key == nil || key.ExpiresAt.IsZero() || strings.TrimSpace(key.RefreshToken) == "" {
		return false
	}
	return now.Add(5 * time.Minute).After(key.ExpiresAt)
}

func asMap(v any) (map[string]any, bool) {
	m, ok := v.(map[string]any)
	return m, ok
}

func firstString(root map[string]any, data map[string]any, dataIsRoot bool, names ...string) string {
	for _, name := range names {
		if v, ok := data[name]; ok {
			if s := valueToString(v); s != "" {
				return s
			}
		}
		if !dataIsRoot {
			if v, ok := root[name]; ok {
				if s := valueToString(v); s != "" {
					return s
				}
			}
		}
	}
	return ""
}

func firstStringSlice(root map[string]any, data map[string]any, dataIsRoot bool, names ...string) []string {
	for _, name := range names {
		if v, ok := data[name]; ok {
			if scopes := valueToStringSlice(v); len(scopes) > 0 {
				return scopes
			}
		}
		if !dataIsRoot {
			if v, ok := root[name]; ok {
				if scopes := valueToStringSlice(v); len(scopes) > 0 {
					return scopes
				}
			}
		}
	}
	return nil
}

func firstTime(root map[string]any, data map[string]any, dataIsRoot bool, names ...string) (time.Time, bool) {
	for _, name := range names {
		if v, ok := data[name]; ok {
			if t, ok := valueToTime(v); ok {
				return t, true
			}
		}
		if !dataIsRoot {
			if v, ok := root[name]; ok {
				if t, ok := valueToTime(v); ok {
					return t, true
				}
			}
		}
	}
	return time.Time{}, false
}

func valueToString(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(t)
	case fmt.Stringer:
		return strings.TrimSpace(t.String())
	default:
		return strings.TrimSpace(fmt.Sprintf("%v", v))
	}
}

func valueToStringSlice(v any) []string {
	switch t := v.(type) {
	case []string:
		return normalizeScopes(t)
	case []any:
		scopes := make([]string, 0, len(t))
		for _, item := range t {
			if s := valueToString(item); s != "" {
				scopes = append(scopes, s)
			}
		}
		return normalizeScopes(scopes)
	case string:
		return normalizeScopes(strings.Fields(t))
	default:
		return nil
	}
}

func valueToTime(v any) (time.Time, bool) {
	switch t := v.(type) {
	case float64:
		return unixNumberToTime(t)
	case float32:
		return unixNumberToTime(float64(t))
	case int:
		return unixNumberToTime(float64(t))
	case int64:
		return unixNumberToTime(float64(t))
	case jsonNumber:
		f, err := strconv.ParseFloat(string(t), 64)
		if err != nil {
			return time.Time{}, false
		}
		return unixNumberToTime(f)
	case string:
		s := strings.TrimSpace(t)
		if s == "" {
			return time.Time{}, false
		}
		if parsed, err := time.Parse(time.RFC3339, s); err == nil {
			return parsed, true
		}
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			return unixNumberToTime(f)
		}
		return time.Time{}, false
	default:
		return time.Time{}, false
	}
}

type jsonNumber string

func unixNumberToTime(v float64) (time.Time, bool) {
	if math.IsNaN(v) || math.IsInf(v, 0) || v <= 0 {
		return time.Time{}, false
	}
	if v > 1e12 {
		return time.UnixMilli(int64(v)), true
	}
	return time.Unix(int64(v), 0), true
}

func normalizeScopes(scopes []string) []string {
	seen := make(map[string]struct{}, len(scopes))
	out := make([]string, 0, len(scopes))
	for _, scope := range scopes {
		scope = strings.TrimSpace(scope)
		if scope == "" {
			continue
		}
		if _, ok := seen[scope]; ok {
			continue
		}
		seen[scope] = struct{}{}
		out = append(out, scope)
	}
	return out
}
