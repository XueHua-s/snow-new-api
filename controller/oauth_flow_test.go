package controller

import "testing"

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
