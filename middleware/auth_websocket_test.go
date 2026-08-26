package middleware

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func newWebSocketAuthTestRouter(t *testing.T) (*gin.Engine, string, string) {
	t.Helper()
	setupDashboardAuthMiddlewareTest(t)
	gin.SetMode(gin.TestMode)

	createToken := func(role int, suffix string) string {
		accessToken := "pat-" + suffix
		user := &model.User{
			Username:    "websocket-" + suffix,
			Password:    "password-placeholder",
			Role:        role,
			Status:      common.UserStatusEnabled,
			Group:       "default",
			AccessToken: &accessToken,
			AuthVersion: 1,
			AffCode:     "websocket-aff-" + suffix,
		}
		require.NoError(t, model.DB.Create(user).Error)
		bundle, err := service.CreateLoginSession(
			user.Id,
			"password",
			"127.0.0.1",
			"websocket-test",
		)
		require.NoError(t, err)
		return bundle.AccessToken
	}

	router := gin.New()
	router.GET("/protected", WebSocketAdminAuth(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"success": true})
	})
	router.GET("/protected-user", WebSocketUserAuth(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"success": true})
	})
	return router,
		createToken(common.RoleAdminUser, "admin"),
		createToken(common.RoleCommonUser, "user")
}

func addWebSocketToken(request *http.Request, token string) {
	request.Header.Set(
		"Sec-WebSocket-Protocol",
		fmt.Sprintf("new-api-bearer, %s", token),
	)
}

func TestWebSocketAdminAuth(t *testing.T) {
	router, adminToken, userToken := newWebSocketAuthTestRouter(t)

	t.Run("accepts admin access token", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/protected", nil)
		addWebSocketToken(request, adminToken)
		router.ServeHTTP(recorder, request)
		require.Equal(t, http.StatusOK, recorder.Code)
	})

	t.Run("rejects non-admin access token", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/protected", nil)
		addWebSocketToken(request, userToken)
		router.ServeHTTP(recorder, request)
		require.Equal(t, http.StatusForbidden, recorder.Code)
	})

	t.Run("rejects missing token", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/protected", nil)
		router.ServeHTTP(recorder, request)
		require.Equal(t, http.StatusUnauthorized, recorder.Code)
	})
}

func TestWebSocketUserAuthAcceptsCommonUser(t *testing.T) {
	router, _, userToken := newWebSocketAuthTestRouter(t)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/protected-user", nil)
	addWebSocketToken(request, userToken)
	router.ServeHTTP(recorder, request)
	require.Equal(t, http.StatusOK, recorder.Code)
}
