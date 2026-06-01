package controller

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
)

func TestParseOAuthAuthorizationInput(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantCode  string
		wantState string
		wantErr   bool
	}{
		{
			name:      "callback URL with query state",
			input:     "http://localhost:1455/callback?code=abc123&state=state456",
			wantCode:  "abc123",
			wantState: "state456",
		},
		{
			name:      "query string without callback URL",
			input:     "code=abc123&state=state456",
			wantCode:  "abc123",
			wantState: "state456",
		},
		{
			name:      "callback URL with fragment state",
			input:     "http://localhost:1455/callback?code=abc123#state=state456",
			wantCode:  "abc123",
			wantState: "state456",
		},
		{
			name:      "code and state split by hash",
			input:     "abc123#state456",
			wantCode:  "abc123",
			wantState: "state456",
		},
		{
			name:    "empty input",
			input:   "   ",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code, state, err := parseOAuthAuthorizationInput(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if code != tt.wantCode || state != tt.wantState {
				t.Fatalf("parseOAuthAuthorizationInput() = (%q, %q), want (%q, %q)", code, state, tt.wantCode, tt.wantState)
			}
		})
	}
}

func TestOAuthFlowTokenRoundTrip(t *testing.T) {
	oldSecret := common.SessionSecret
	common.SessionSecret = "oauth-flow-token-test-secret"
	defer func() {
		common.SessionSecret = oldSecret
	}()

	cfg := oauthFlowConfig{sessionPrefix: "claude"}
	token, err := createOAuthFlowToken(cfg, 5, "state-123", "verifier-456", time.Now().Unix())
	if err != nil {
		t.Fatalf("createOAuthFlowToken returned error: %v", err)
	}

	payload, err := parseOAuthFlowToken(token, cfg, 5)
	if err != nil {
		t.Fatalf("parseOAuthFlowToken returned error: %v", err)
	}
	if payload.State != "state-123" || payload.Verifier != "verifier-456" || payload.ChannelID != 5 {
		t.Fatalf("payload = %#v", payload)
	}
}

func TestOAuthFlowTokenRejectsWrongChannel(t *testing.T) {
	oldSecret := common.SessionSecret
	common.SessionSecret = "oauth-flow-token-test-secret"
	defer func() {
		common.SessionSecret = oldSecret
	}()

	cfg := oauthFlowConfig{sessionPrefix: "claude"}
	token, err := createOAuthFlowToken(cfg, 5, "state-123", "verifier-456", time.Now().Unix())
	if err != nil {
		t.Fatalf("createOAuthFlowToken returned error: %v", err)
	}

	if _, err := parseOAuthFlowToken(token, cfg, 6); err == nil {
		t.Fatal("expected wrong channel to be rejected")
	}
}
