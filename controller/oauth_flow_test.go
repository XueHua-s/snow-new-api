package controller

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"errors"
	"fmt"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
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

// This suite runs unchanged against each real database in C09. The synthetic
// exchange is the external boundary; routing, authentication and consumption
// are production code.
func TestCodexOAuthSecurityDatabaseMatrix(t *testing.T) {
	previousDB, previousLog := model.DB, model.LOG_DB
	previousType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
	previousMaster, previousRedis, previousCache, previousSQLite := common.IsMasterNode, common.RedisEnabled, common.MemoryCacheEnabled, common.SQLitePath
	previousSecret := common.SessionSecret
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLog
		common.SetDatabaseTypes(previousType, previousLogType)
		common.IsMasterNode, common.RedisEnabled, common.MemoryCacheEnabled, common.SQLitePath = previousMaster, previousRedis, previousCache, previousSQLite
		common.SessionSecret = previousSecret
	})
	t.Setenv("SQL_DSN", os.Getenv("TEST_CODEX_AUTH_SQL_DSN"))
	t.Setenv("LOG_SQL_DSN", "")
	common.IsMasterNode, common.RedisEnabled, common.MemoryCacheEnabled = false, false, false
	common.SQLitePath = filepath.Join(t.TempDir(), "auth.db")
	common.SessionSecret = "synthetic-codex-auth-secret"
	require.NoError(t, model.InitDB())
	db := model.DB
	model.LOG_DB = db
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })
	if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		sqlDB.SetMaxOpenConns(1)
	}
	require.NoError(t, db.AutoMigrate(&model.AuthFlow{}, &model.User{}, &model.UserSession{}, &model.Channel{}, &model.Ability{}, &model.Log{}))
	versionSQL := "SELECT VERSION()"
	if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		versionSQL = "SELECT sqlite_version()"
	}
	var version string
	require.NoError(t, db.Raw(versionSQL).Scan(&version).Error)
	t.Logf("database=%s version=%s", common.MainDatabaseType(), version)
	pat := "synthetic-codex-pat"
	user := model.User{Username: "codex-security-root", Role: common.RoleRootUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AccessToken: &pat, AffCode: "codex-root"}
	require.NoError(t, db.Create(&user).Error)
	other := model.User{Username: "codex-security-other", Role: common.RoleRootUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "codex-other"}
	require.NoError(t, db.Create(&other).Error)
	session, err := service.CreateLoginSession(user.Id, "password", "127.0.0.1", "test")
	require.NoError(t, err)
	second, err := service.CreateLoginSession(user.Id, "password", "127.0.0.1", "test")
	require.NoError(t, err)
	otherSession, err := service.CreateLoginSession(other.Id, "password", "127.0.0.1", "test")
	require.NoError(t, err)
	identity, err := service.ParseAccessToken(session.AccessToken)
	require.NoError(t, err)
	proof, _, err := service.IssueSecurityProof(identity, "2fa", []string{securityProofScopeCodexCredentialWrite})
	require.NoError(t, err)
	wrongProof, _, err := service.IssueSecurityProof(identity, "2fa", []string{"channel.key.read"})
	require.NoError(t, err)
	claims := jwt.MapClaims{}
	_, _, err = jwt.NewParser().ParseUnverified(proof, claims)
	require.NoError(t, err)
	claims["exp"] = time.Now().Add(-time.Minute).Unix()
	key := hmac.New(sha256.New, []byte(common.SessionSecret))
	_, err = key.Write([]byte("new-api/auth/security_proof/v1"))
	require.NoError(t, err)
	expiredProof, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(key.Sum(nil))
	require.NoError(t, err)

	deniedProofs := map[string]string{}
	for _, kind := range []string{"method", "user", "session", "auth version", "session version"} {
		changed := identity
		method := "2fa"
		switch kind {
		case "method":
			method = "password"
		case "user":
			changed.UserID = other.Id
		case "session":
			changed.SessionID = second.Session.SID
		case "auth version":
			changed.UserAuthVersion++
		case "session version":
			changed.SessionVersion++
		}
		deniedProofs[kind], _, err = service.IssueSecurityProof(changed, method, []string{securityProofScopeCodexCredentialWrite})
		require.NoError(t, err)
	}
	revoked, err := service.CreateLoginSession(user.Id, "password", "127.0.0.1", "revoked")
	require.NoError(t, err)
	revokedIdentity, err := service.ParseAccessToken(revoked.AccessToken)
	require.NoError(t, err)
	revokedProof, _, err := service.IssueSecurityProof(revokedIdentity, "2fa", []string{securityProofScopeCodexCredentialWrite})
	require.NoError(t, err)
	didRevoke, err := model.RevokeUserSession(user.Id, revoked.Session.SID, "test")
	require.NoError(t, err)
	require.True(t, didRevoke)
	admin := model.User{Username: "codex-limited-admin", Role: common.RoleAdminUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "codex-admin"}
	require.NoError(t, db.Create(&admin).Error)
	adminSession, err := service.CreateLoginSession(admin.Id, "password", "127.0.0.1", "admin")
	require.NoError(t, err)
	adminIdentity, err := service.ParseAccessToken(adminSession.AccessToken)
	require.NoError(t, err)
	adminProof, _, err := service.IssueSecurityProof(adminIdentity, "2fa", []string{securityProofScopeCodexCredentialWrite})
	require.NoError(t, err)

	channel := model.Channel{Type: constant.ChannelTypeCodex, Name: "synthetic", Key: "old-key", Status: common.ChannelStatusEnabled}
	require.NoError(t, db.Create(&channel).Error)
	var exchanges atomic.Int32
	cfg := codexOAuthFlow
	cfg.createFlow = func() (oauthStartFlow, error) {
		return oauthStartFlow{State: "synthetic-state", Verifier: "synthetic-verifier", AuthorizeURL: "https://example.invalid/authorize"}, nil
	}
	cfg.buildKey = func(_ context.Context, code, state, verifier, proxy string) (*oauthCredentialPayload, error) {
		exchanges.Add(1)
		if code == "fail" {
			return nil, errors.New("synthetic exchange failed")
		}
		if code == "replace" {
			if err := db.Model(&model.Channel{}).Where("id = ?", channel.Id).Update("key", "concurrently-replaced").Error; err != nil {
				return nil, err
			}
		}
		switch code {
		case "replace-case":
			if err := db.Model(&model.Channel{}).Where("id = ?", channel.Id).Update("key", "OLD-KEY").Error; err != nil {
				return nil, err
			}
		case "replace-target":
			if err := db.Model(&model.Channel{}).Where("id = ?", channel.Id).Update("base_url", "https://changed.invalid").Error; err != nil {
				return nil, err
			}
		case "replace-proxy":
			if err := db.Model(&model.Channel{}).Where("id = ?", channel.Id).Update("setting", `{"proxy":"http://changed.invalid:8080"}`).Error; err != nil {
				return nil, err
			}
		}
		if verifier != "synthetic-verifier" {
			return nil, errors.New("wrong verifier")
		}
		return &oauthCredentialPayload{EncodedKey: "new-key"}, nil
	}
	gin.SetMode(gin.TestMode)
	var pendingAudits sync.WaitGroup
	require.NoError(t, db.Callback().Create().After("gorm:commit_or_rollback_transaction").Register("codex_auth_audit_barrier", func(tx *gorm.DB) {
		if log, ok := tx.Statement.Dest.(*model.Log); ok && log.Type == model.LogTypeManage {
			pendingAudits.Done()
		}
	}))
	t.Cleanup(func() { pendingAudits.Wait() })
	router := gin.New()
	router.Use(middleware.AdminAuth(), func(c *gin.Context) { pendingAudits.Add(1); c.Next() }, middleware.RequirePermission(authz.ChannelSensitiveWrite))
	router.POST("/update", UpdateChannel)
	router.POST("/multi", ManageMultiKeys)
	router.POST("/:id/refresh", RefreshCodexChannelCredential)
	router.POST("/:id/start", func(c *gin.Context) { id, _ := strconv.Atoi(c.Param("id")); startOAuthFlow(c, id, cfg) })
	router.POST("/:id/complete", func(c *gin.Context) { id, _ := strconv.Atoi(c.Param("id")); completeOAuthFlow(c, id, cfg) })
	request := func(path, access, securityProof, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if access != "" {
			req.Header.Set("Authorization", "Bearer "+access)
		}
		req.Header.Set("X-Security-Proof", securityProof)
		req.AddCookie(&http.Cookie{Name: service.RefreshCookieName, Value: session.RefreshToken})
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		return response
	}
	start := func(t *testing.T, id int) string {
		t.Helper()
		response := request(fmt.Sprintf("/%d/start", id), session.AccessToken, proof, "{}")
		require.Equal(t, http.StatusOK, response.Code)
		var payload struct {
			Success bool
			Data    struct {
				FlowToken string `json:"flow_token"`
			}
		}
		require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
		require.True(t, payload.Success)
		require.NotEmpty(t, payload.Data.FlowToken)
		return payload.Data.FlowToken
	}
	body := func(token, code, state string) string {
		encoded, err := common.Marshal(oauthCompleteRequest{Input: code + "#" + state, FlowToken: token})
		require.NoError(t, err)
		return string(encoded)
	}
	for _, tc := range []struct{ name, access, proof string }{
		{"cookie only", "", ""}, {"PAT", pat, proof}, {"missing proof", session.AccessToken, ""}, {"wrong scope", session.AccessToken, wrongProof}, {"expired proof", session.AccessToken, expiredProof},
		{"wrong proof method", session.AccessToken, deniedProofs["method"]},
		{"wrong proof user", session.AccessToken, deniedProofs["user"]},
		{"wrong proof session", session.AccessToken, deniedProofs["session"]},
		{"wrong proof auth version", session.AccessToken, deniedProofs["auth version"]},
		{"wrong proof session version", session.AccessToken, deniedProofs["session version"]},
		{"revoked session", revoked.AccessToken, revokedProof},
		{"insufficient admin permission", adminSession.AccessToken, adminProof},
	} {
		t.Run(tc.name, func(t *testing.T) {
			before := exchanges.Load()
			response := request(fmt.Sprintf("/%d/start", channel.Id), tc.access, tc.proof, "{}")
			assert.NotEqual(t, http.StatusOK, response.Code)
			token := start(t, channel.Id)
			response = request(fmt.Sprintf("/%d/complete", channel.Id), tc.access, tc.proof, body(token, "ok", "synthetic-state"))
			assert.NotEqual(t, http.StatusOK, response.Code)
			assert.Equal(t, before, exchanges.Load())
		})
	}
	t.Run("credential mutation bypasses require stepup", func(t *testing.T) {
		for _, payload := range []map[string]any{
			{"id": channel.Id, "key": `{"access_token":"replace","account_id":"synthetic"}`},
			{"id": channel.Id, "type": constant.ChannelTypeOpenAI},
			{"id": channel.Id, "key_mode": "append", "key": `{"access_token":"replace","account_id":"synthetic"}`},
		} {
			encoded, err := common.Marshal(payload)
			require.NoError(t, err)
			response := request("/update", session.AccessToken, "", string(encoded))
			assert.Equal(t, http.StatusForbidden, response.Code)
			assert.Contains(t, response.Body.String(), "SECURITY_PROOF_REQUIRED")
		}
		response := request(fmt.Sprintf("/%d/refresh", channel.Id), session.AccessToken, "", "{}")
		assert.Equal(t, http.StatusForbidden, response.Code)
		channel.ChannelInfo.IsMultiKey = true
		require.NoError(t, db.Model(&channel).Update("channel_info", channel.ChannelInfo).Error)
		for _, action := range []string{"delete_key", "delete_disabled_keys"} {
			encoded, err := common.Marshal(map[string]any{"channel_id": channel.Id, "action": action, "key_index": 0})
			require.NoError(t, err)
			response := request("/multi", session.AccessToken, "", string(encoded))
			assert.Equal(t, http.StatusForbidden, response.Code)
		}
		channel.ChannelInfo.IsMultiKey = false
		require.NoError(t, db.Model(&channel).Update("channel_info", channel.ChannelInfo).Error)
	})

	for _, name := range []string{"wrong state", "wrong provider", "wrong channel", "expired", "future", "wrong user", "wrong session"} {
		t.Run(name, func(t *testing.T) {
			token := start(t, 0)
			access, state := session.AccessToken, "synthetic-state"
			flow, err := model.GetAuthFlow(token, model.AuthFlowMatch{Purpose: model.AuthFlowPurposeOAuth})
			require.NoError(t, err)
			switch name {
			case "wrong state":
				state = "wrong"
			case "wrong provider":
				require.NoError(t, db.Model(flow).Update("provider", "claude").Error)
			case "wrong channel":
				var data oauthFlowTokenPayload
				require.NoError(t, common.UnmarshalJsonStr(flow.Payload, &data))
				data.ChannelID = 999
				encoded, err := common.Marshal(data)
				require.NoError(t, err)
				require.NoError(t, db.Model(flow).Update("payload", string(encoded)).Error)
			case "expired":
				require.NoError(t, db.Model(flow).Update("expires_at", time.Now().Add(-time.Minute)).Error)
			case "future":
				require.NoError(t, db.Model(flow).Update("created_at", time.Now().Add(time.Hour)).Error)
			case "wrong user":
				access = otherSession.AccessToken
			case "wrong session":
				access = second.AccessToken
			}
			before := exchanges.Load()
			response := request("/0/complete", access, "", body(token, "ok", state))
			assert.Contains(t, response.Body.String(), `"success":false`)
			assert.Equal(t, before, exchanges.Load())
		})
	}
	t.Run("failed exchange consumes authorization", func(t *testing.T) {
		token := start(t, 0)
		before := exchanges.Load()
		assert.Contains(t, request("/0/complete", session.AccessToken, "", body(token, "fail", "synthetic-state")).Body.String(), `"success":false`)
		assert.Contains(t, request("/0/complete", session.AccessToken, "", body(token, "ok", "synthetic-state")).Body.String(), `"success":false`)
		assert.Equal(t, before+1, exchanges.Load())
	})
	t.Run("concurrent complete has one exchange", func(t *testing.T) {
		token := start(t, 0)
		before := exchanges.Load()
		input := body(token, "ok", "synthetic-state")
		barrier := make(chan struct{})
		responses := make(chan string, 2)
		var wg sync.WaitGroup
		for range 2 {
			wg.Go(func() { <-barrier; responses <- request("/0/complete", session.AccessToken, "", input).Body.String() })
		}
		close(barrier)
		wg.Wait()
		close(responses)
		successes := 0
		for response := range responses {
			if strings.Contains(response, `"success":true`) {
				successes++
			}
		}
		assert.Equal(t, 1, successes)
		assert.Equal(t, before+1, exchanges.Load())
	})
	t.Run("replacement during exchange is preserved", func(t *testing.T) {
		token := start(t, channel.Id)
		response := request(fmt.Sprintf("/%d/complete", channel.Id), session.AccessToken, proof, body(token, "replace", "synthetic-state"))
		assert.Contains(t, response.Body.String(), `"success":false`)
		var saved model.Channel
		require.NoError(t, db.First(&saved, channel.Id).Error)
		assert.Equal(t, "concurrently-replaced", saved.Key)
	})
	for _, code := range []string{"replace-case", "replace-target", "replace-proxy"} {
		t.Run(code+" is preserved during credential save", func(t *testing.T) {
			require.NoError(t, db.Model(&model.Channel{}).Where("id = ?", channel.Id).Updates(map[string]any{"key": "old-key", "base_url": "", "setting": ""}).Error)
			token := start(t, channel.Id)
			response := request(fmt.Sprintf("/%d/complete", channel.Id), session.AccessToken, proof, body(token, code, "synthetic-state"))
			assert.Contains(t, response.Body.String(), `"success":false`)
			var saved model.Channel
			require.NoError(t, db.First(&saved, channel.Id).Error)
			assert.NotEqual(t, "new-key", saved.Key)
		})
	}
	t.Run("valid stepup replaces unchanged credential", func(t *testing.T) {
		token := start(t, channel.Id)
		response := request(fmt.Sprintf("/%d/complete", channel.Id), session.AccessToken, proof, body(token, "ok", "synthetic-state"))
		assert.Contains(t, response.Body.String(), `"success":true`)
		var saved model.Channel
		require.NoError(t, db.First(&saved, channel.Id).Error)
		assert.Equal(t, "new-key", saved.Key)
	})

	pendingAudits.Wait()
	var auditLogs []model.Log
	require.NoError(t, db.Where("type = ?", model.LogTypeManage).Find(&auditLogs).Error)
	require.NotEmpty(t, auditLogs)
	auditJSON, err := common.Marshal(auditLogs)
	require.NoError(t, err)
	for _, secret := range []string{"synthetic-code", "synthetic-verifier", proof, session.AccessToken, session.RefreshToken, pat} {
		assert.NotContains(t, string(auditJSON), secret)
	}

}
