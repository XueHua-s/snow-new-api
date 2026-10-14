package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
)

func RefreshClaudeOAuthTokenWithProxy(ctx context.Context, refreshToken string, proxyURL string, scopes []string) (*ClaudeOAuthTokenResult, error) {
	client, err := getCodexOAuthHTTPClient(proxyURL)
	if err != nil {
		return nil, err
	}
	res, err := refreshClaudeOAuthToken(ctx, client, claudeOAuthPlatformURL, refreshToken, scopes, true)
	if err == nil {
		return res, nil
	}
	return refreshClaudeOAuthToken(ctx, client, claudeOAuthTokenURL, refreshToken, scopes, false)
}

func ExchangeClaudeOAuthAuthorizationCodeWithProxy(ctx context.Context, code string, state string, verifier string, proxyURL string) (*ClaudeOAuthTokenResult, error) {
	client, err := getCodexOAuthHTTPClient(proxyURL)
	if err != nil {
		return nil, err
	}
	res, err := exchangeClaudeOAuthAuthorizationCode(ctx, client, claudeOAuthPlatformURL, code, state, verifier, claudeOAuthRedirectURI, true)
	if err == nil {
		return res, nil
	}
	return exchangeClaudeOAuthAuthorizationCode(ctx, client, claudeOAuthTokenURL, code, state, verifier, claudeOAuthRedirectURI, false)
}

func refreshClaudeOAuthToken(ctx context.Context, client *http.Client, tokenURL string, refreshToken string, scopes []string, jsonBody bool) (*ClaudeOAuthTokenResult, error) {
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

	requestBody := strings.NewReader(form.Encode())
	contentType := "application/x-www-form-urlencoded"
	if jsonBody {
		payload, err := common.Marshal(map[string]any{
			"grant_type":    "refresh_token",
			"refresh_token": rt,
			"client_id":     claudeOAuthClientID,
		})
		if err != nil {
			return nil, err
		}
		requestBody = strings.NewReader(string(payload))
		contentType = "application/json"
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, requestBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", ClaudeOAuthUserAgent)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("claude oauth refresh failed: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var payload struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		Scope        string `json:"scope"`
	}
	if err := common.Unmarshal(body, &payload); err != nil {
		return nil, err
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
	state string,
	verifier string,
	redirectURI string,
	jsonBody bool,
) (*ClaudeOAuthTokenResult, error) {
	c := strings.TrimSpace(code)
	s := strings.TrimSpace(state)
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
	if s != "" {
		form.Set("state", s)
	}

	requestBody := strings.NewReader(form.Encode())
	contentType := "application/x-www-form-urlencoded"
	if jsonBody {
		payload := map[string]any{
			"grant_type":    "authorization_code",
			"client_id":     claudeOAuthClientID,
			"code":          c,
			"code_verifier": v,
			"redirect_uri":  redirectURI,
		}
		if s != "" {
			payload["state"] = s
		}
		encoded, err := common.Marshal(payload)
		if err != nil {
			return nil, err
		}
		requestBody = strings.NewReader(string(encoded))
		contentType = "application/json"
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, requestBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", ClaudeOAuthUserAgent)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("claude oauth code exchange failed: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var payload struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
		Scope        string `json:"scope"`
	}
	if err := common.Unmarshal(body, &payload); err != nil {
		return nil, err
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
