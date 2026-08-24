package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
)

func newWebSocketAuthTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(sessions.Sessions("session", cookie.NewStore([]byte("websocket-auth-test"))))

	setSession := func(role int) gin.HandlerFunc {
		return func(c *gin.Context) {
			session := sessions.Default(c)
			session.Set("username", "tester")
			session.Set("role", role)
			session.Set("id", 1)
			session.Set("status", common.UserStatusEnabled)
			if err := session.Save(); err != nil {
				c.Status(http.StatusInternalServerError)
				return
			}
			c.Status(http.StatusNoContent)
		}
	}

	router.GET("/login-admin", setSession(common.RoleAdminUser))
	router.GET("/login-user", setSession(common.RoleCommonUser))
	router.GET("/protected", WebSocketAdminAuth(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"success": true})
	})
	router.GET("/protected-user", WebSocketUserAuth(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"success": true})
	})
	return router
}

func sessionCookie(t *testing.T, router http.Handler, path string) *http.Cookie {
	t.Helper()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("session setup status = %d", recorder.Code)
	}
	cookies := recorder.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("session setup returned %d cookies, want 1", len(cookies))
	}
	return cookies[0]
}

func TestWebSocketAdminAuth(t *testing.T) {
	router := newWebSocketAuthTestRouter()

	t.Run("accepts admin session without custom header", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/protected", nil)
		request.AddCookie(sessionCookie(t, router, "/login-admin"))
		router.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
		}
	})

	t.Run("rejects non-admin session", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/protected", nil)
		request.AddCookie(sessionCookie(t, router, "/login-user"))
		router.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want %d", recorder.Code, http.StatusForbidden)
		}
	})

	t.Run("rejects missing session", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/protected", nil)
		router.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
		}
	})
}

func TestWebSocketUserAuthAcceptsCommonUser(t *testing.T) {
	router := newWebSocketAuthTestRouter()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/protected-user", nil)
	request.AddCookie(sessionCookie(t, router, "/login-user"))
	router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
}
