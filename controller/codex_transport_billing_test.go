package controller

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/wsmanager"
	"github.com/QuantumNous/new-api/service"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Set only in the isolated integration child; ordinary regressions retain their
// existing native transport. All billing events still enter the public gateway.
var codexBillingTLS *tls.Config

func TestCodexTransportBillingDatabaseMatrix(t *testing.T) {
	binary := os.Getenv("CODEX_TRANSPORT_TEST_BINARY")
	if binary == "" {
		t.Skip("requires Linux Rust binary and disposable database runner")
	}
	if os.Getenv("CODEX_BILLING_CHILD") != "1" {
		child := exec.Command(os.Args[0], "-test.run=^TestCodexTransportBillingDatabaseMatrix$", "-test.v", "-test.timeout=180s")
		child.Env = append(os.Environ(), "CODEX_BILLING_CHILD=1")
		output, err := child.CombinedOutput()
		t.Log(string(output))
		require.NoError(t, err)
		return
	}
	directory, err := os.MkdirTemp("", "cb-")
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, os.RemoveAll(directory)) })
	caKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	ca := &x509.Certificate{SerialNumber: big.NewInt(1), NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign}
	caDER, err := x509.CreateCertificate(rand.Reader, ca, ca, &caKey.PublicKey, caKey)
	require.NoError(t, err)
	leafKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	leaf := &x509.Certificate{SerialNumber: big.NewInt(2), NotBefore: ca.NotBefore, NotAfter: ca.NotAfter, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}, IPAddresses: []net.IP{net.ParseIP("127.0.0.1")}}
	leafDER, err := x509.CreateCertificate(rand.Reader, leaf, ca, &leafKey.PublicKey, caKey)
	require.NoError(t, err)
	codexBillingTLS = &tls.Config{Certificates: []tls.Certificate{{Certificate: [][]byte{leafDER, caDER}, PrivateKey: leafKey}}}
	caPath := filepath.Join(directory, "ca.pem")
	require.NoError(t, os.WriteFile(caPath, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caDER}), 0600))
	socket := filepath.Join(directory, "transport.sock")
	process := exec.Command(binary)
	process.Env = []string{"CODEX_TRANSPORT_SOCKET=" + socket, "HOME=" + directory, "PATH=" + os.Getenv("PATH")}
	var diagnostic bytes.Buffer
	process.Stderr = &diagnostic
	require.NoError(t, process.Start())
	exited := make(chan error, 1)
	go func() { exited <- process.Wait() }()
	t.Cleanup(func() {
		_ = process.Process.Signal(syscall.SIGTERM)
		select {
		case <-exited:
		case <-time.After(5 * time.Second):
			_ = process.Process.Kill()
			<-exited
		}
	})
	require.Eventually(t, func() bool {
		info, err := os.Lstat(socket)
		return err == nil && info.Mode()&os.ModeSocket != 0 && info.Mode().Perm() == 0600
	}, 10*time.Second, 10*time.Millisecond)
	common.CodexTransportEnabled, common.CodexTransportSocket, common.CodexTransportProfile, common.CodexTransportCAFile = true, socket, "0.162.1", caPath
	common.TLSInsecureSkipVerify = false
	common.RetryTimes = 3
	common.RelayTimeout, common.RelayIdleConnTimeout, common.RelayMaxIdleConns, common.RelayMaxIdleConnsPerHost = 0, 90, 100, 10
	constant.MaxRequestBodyMB = 16
	service.InitHttpClient()
	require.NoError(t, service.InitCodexTransport())
	t.Run("database-isolation", func(t *testing.T) {
		setupResponsesWSRequestTest(t)
		require.NotSame(t, model.DB, model.LOG_DB)
		query := "SELECT version()"
		if common.MainDatabaseType() == common.DatabaseTypeSQLite {
			query = "SELECT sqlite_version()"
		}
		var mainVersion, logVersion string
		require.NoError(t, model.DB.Raw(query).Scan(&mainVersion).Error)
		require.NoError(t, model.LOG_DB.Raw(query).Scan(&logVersion).Error)
		t.Logf("main=%s log=%s independent handles", mainVersion, logVersion)
	})
	t.Run("http-boundaries-and-saturation", testCodexBillingHTTPBoundaries)
	t.Run("outcomes", TestResponsesStreamOutcomesPreserveAccounting)
	t.Run("interrupted", TestResponsesInterruptedStreamAccounting)
	t.Run("reservation-refund", TestResponsesWebSocketInitialUpstreamRejectionRefundsReservation)
	t.Run("multiple-create-and-duplicate-terminal", TestResponsesWebSocketReusesConnectionAndSettlesEachRequest)
	t.Run("arbitrary-older-generation-isolation", TestResponsesWebSocketRejectsArbitraryOlderGenerations)
	t.Run("unidentified-terminal-closes-after-settlement", TestResponsesWebSocketUnidentifiedTerminalSettlesThenCloses)
	t.Run("disconnect", TestResponsesWebSocketDisconnectSettlesDeliveredOutputOnce)
	t.Run("batch-final-flush", TestCodexBatchFinalFlush)
	t.Run("preconsume-saturation-refusal", testCodexBillingPreconsumeRefusal)
	t.Run("active-invalidation-and-shutdown", testCodexBillingShutdown)
}

func testCodexBillingHTTPBoundaries(t *testing.T) {
	for _, tc := range []struct {
		name       string
		stream     bool
		expression string
		quota      int
		body       string
		truncated  bool
		reject     bool
		saturated  bool
	}{
		{name: "json-success", expression: `tier("input", p*2)`, quota: 1000, body: `{"id":"json-ok","status":"completed","model":"gpt-4o","output":[],"usage":{"input_tokens":1000,"output_tokens":10,"total_tokens":1010}}`},
		{name: "json-zero-usage-charge", expression: `tier("request",2000)`, quota: 1000, body: `{"id":"json-zero","status":"completed","output":[],"usage":{"input_tokens":0,"output_tokens":0,"total_tokens":0}}`},
		{name: "sse-truncated-estimated", stream: true, expression: `tier("request",2000)`, quota: 1000, truncated: true, body: "data: {\"type\":\"response.created\",\"response\":{\"id\":\"partial\",\"status\":\"in_progress\"}}\n\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"hello\"}\n\n"},
		{name: "http-rejection-refund", stream: true, expression: `tier("request",2000)`, reject: true, body: `{"error":{"type":"invalid_request_error","message":"synthetic rejection"}}`},
		{name: "saturation-admin-audit", expression: `tier("input",p*2)`, quota: common.MaxQuota, saturated: true, body: `{"id":"large","status":"completed","output":[],"usage":{"input_tokens":4294967294,"output_tokens":0,"total_tokens":4294967294}}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			fixture := newResponsesWSBillingTest(t, tc.expression, func(ws *websocket.Conn, _ *http.Request) { _, _, _ = ws.ReadMessage() })
			if tc.saturated {
				fixture.initialUserQuota, fixture.initialTokenQuota = common.MaxQuota+100000, common.MaxQuota+3000
				require.NoError(t, model.DB.Model(fixture.user).Update("quota", fixture.initialUserQuota).Error)
				require.NoError(t, model.DB.Model(fixture.token).Update("remain_quota", fixture.initialTokenQuota).Error)
			}
			var attempts atomic.Int32
			reserved := make(chan int, 1)
			fixture.httpUpstream = func(w http.ResponseWriter, r *http.Request) {
				attempts.Add(1)
				var token model.Token
				if !assert.NoError(t, model.DB.First(&token, fixture.token.Id).Error) {
					return
				}
				reserved <- token.RemainQuota
				if tc.truncated {
					conn, rw, err := w.(http.Hijacker).Hijack()
					if !assert.NoError(t, err) {
						return
					}
					defer conn.Close()
					_, err = fmt.Fprintf(rw, "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: %d\r\n\r\n%s", len(tc.body)+100, tc.body)
					if assert.NoError(t, err) {
						assert.NoError(t, rw.Flush())
					}
					return
				}
				w.Header().Set("Content-Type", "application/json")
				if tc.reject {
					w.WriteHeader(http.StatusBadRequest)
				}
				_, _ = io.WriteString(w, tc.body)
			}
			req, err := http.NewRequest(http.MethodPost, fixture.gatewayURL+"/v1/responses", strings.NewReader(fmt.Sprintf(`{"model":"ws-billing","input":"hello","stream":%t,"max_output_tokens":10}`, tc.stream)))
			require.NoError(t, err)
			req.Header.Set("Authorization", "Bearer sk-"+fixture.token.Key)
			req.Header.Set("Content-Type", "application/json")
			response, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
			require.NoError(t, err)
			body, readErr := io.ReadAll(response.Body)
			require.NoError(t, response.Body.Close())
			if !tc.truncated {
				require.NoError(t, readErr)
			}
			if tc.reject {
				assert.Equal(t, http.StatusBadRequest, response.StatusCode)
			} else {
				assert.Equal(t, http.StatusOK, response.StatusCode)
			}
			if tc.truncated {
				assert.Contains(t, string(body), "hello")
				assert.NotContains(t, string(body), "response.completed")
				assert.NotContains(t, string(body), "[DONE]")
			}
			select {
			case <-fixture.httpDone:
			case <-time.After(5 * time.Second):
				t.Fatal("HTTP handler did not finish")
			}
			fixture.closeAndWait(t)
			assert.Equal(t, int32(1), attempts.Load(), "transport failures never replay")
			if tc.reject {
				assert.Equal(t, 2000, <-reserved, "fixed-price request reserves before upstream rejection")
				require.Eventually(t, func() bool {
					var token model.Token
					return model.DB.First(&token, fixture.token.Id).Error == nil && token.RemainQuota == 3000
				}, 3*time.Second, 10*time.Millisecond)
				assertResponsesWSAccounting(t, fixture, nil)
			} else {
				if tc.expression == `tier("request",2000)` {
					assert.Equal(t, 2000, <-reserved)
				} else {
					<-reserved
				}
				assertResponsesWSAccounting(t, fixture, []int{tc.quota})
			}
			if tc.saturated {
				var entry model.Log
				require.NoError(t, model.LOG_DB.Where("type = ? AND token_id = ?", model.LogTypeConsume, fixture.token.Id).First(&entry).Error)
				var other map[string]any
				require.NoError(t, common.UnmarshalJsonStr(entry.Other, &other))
				admin, ok := other["admin_info"].(map[string]any)
				require.True(t, ok)
				saturation, ok := admin["quota_saturation"].(map[string]any)
				require.True(t, ok)
				assert.Equal(t, "overflow", saturation["kind"])
				assert.Equal(t, float64(common.MaxQuota), saturation["clamped"])
				publicLogs, err := model.GetLogByTokenId(fixture.token.Id)
				require.NoError(t, err)
				require.Len(t, publicLogs, 1)
				assert.NotContains(t, publicLogs[0].Other, "admin_info")
				assert.NotContains(t, publicLogs[0].Other, "quota_saturation")
			}
		})
	}
}

func testCodexBillingPreconsumeRefusal(t *testing.T) {
	for _, tc := range []struct {
		transport, name, expression string
		status                      int
	}{
		{"http", "saturation", `tier("request",1e20)`, http.StatusBadRequest},
		{"websocket", "saturation", `tier("request",1e20)`, http.StatusBadRequest},
		{"http", "insufficient-budget", `tier("request",2000000)`, http.StatusForbidden},
		{"websocket", "insufficient-budget", `tier("request",2000000)`, http.StatusForbidden},
	} {
		t.Run(tc.transport+"/"+tc.name, func(t *testing.T) {
			fixture := newResponsesWSBillingTest(t, tc.expression, func(ws *websocket.Conn, _ *http.Request) {
				t.Error("insufficient quota must not contact upstream")
				_, _, _ = ws.ReadMessage()
			})
			var attempts atomic.Int32
			fixture.httpUpstream = func(w http.ResponseWriter, r *http.Request) { attempts.Add(1); w.WriteHeader(500) }
			if tc.transport == "websocket" {
				require.NoError(t, fixture.client.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.create","model":"ws-billing","input":"hi"}`)))
				event := readResponsesWSTestEvent(t, fixture.client)
				assert.Equal(t, "error", event["type"])
				assert.Equal(t, float64(tc.status), event["status"])
			} else {
				req, err := http.NewRequest(http.MethodPost, fixture.gatewayURL+"/v1/responses", strings.NewReader(`{"model":"ws-billing","input":"hi"}`))
				require.NoError(t, err)
				req.Header.Set("Authorization", "Bearer sk-"+fixture.token.Key)
				req.Header.Set("Content-Type", "application/json")
				resp, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
				require.NoError(t, err)
				_, err = io.Copy(io.Discard, resp.Body)
				require.NoError(t, err)
				require.NoError(t, resp.Body.Close())
				assert.Equal(t, tc.status, resp.StatusCode)
				<-fixture.httpDone
			}
			fixture.closeAndWait(t)
			assert.Zero(t, attempts.Load())
			assert.Zero(t, fixture.connections.Load())
			assertResponsesWSAccounting(t, fixture, nil)
		})
	}
}

// Shutdown runs last because production admission remains closed for this process.
func testCodexBillingShutdown(t *testing.T) {
	for _, action := range []string{"invalidate-channel", "shutdown"} {
		t.Run(action, func(t *testing.T) {
			fixture := newResponsesWSBillingTest(t, `tier("request",2000)`, func(ws *websocket.Conn, _ *http.Request) {
				if _, _, err := ws.ReadMessage(); !assert.NoError(t, err) {
					return
				}
				for _, event := range []string{`{"type":"response.created","response":{"id":"active","status":"in_progress"}}`, `{"type":"response.output_text.delta","delta":"hello"}`} {
					if !assert.NoError(t, ws.WriteMessage(websocket.TextMessage, []byte(event))) {
						return
					}
				}
				_, _, _ = ws.ReadMessage()
			})
			require.NoError(t, fixture.client.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.create","model":"ws-billing","input":"hi"}`)))
			assert.Equal(t, "response.created", readResponsesWSTestEvent(t, fixture.client)["type"])
			assert.Equal(t, "response.output_text.delta", readResponsesWSTestEvent(t, fixture.client)["type"])
			var reserved model.Token
			require.NoError(t, model.DB.First(&reserved, fixture.token.Id).Error)
			assert.Equal(t, 2000, reserved.RemainQuota)
			if action == "invalidate-channel" {
				changed := &model.Channel{Id: fixture.channel.Id, Status: common.ChannelStatusManuallyDisabled}
				require.NoError(t, changed.Update())
			} else {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				require.NoError(t, wsmanager.Shutdown(ctx), "must wait for actual billing worker")
			}
			_, _, err := fixture.client.ReadMessage()
			require.Error(t, err)
			fixture.closeAndWait(t)
			assertResponsesWSAccounting(t, fixture, []int{1000})
			assert.Equal(t, 0, wsmanager.CloseChannel(fixture.channel.Id, "duplicate close"))
			assertResponsesWSAccounting(t, fixture, []int{1000})
		})
	}
}

func TestCodexBatchFinalFlush(t *testing.T) {
	fixture := newResponsesWSBillingTest(t, `tier("input",p*2)`, func(ws *websocket.Conn, _ *http.Request) {
		if _, _, err := ws.ReadMessage(); err != nil {
			return
		}
		_ = ws.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.completed","response":{"id":"batch-one","status":"completed","usage":{"input_tokens":1000,"output_tokens":0,"total_tokens":1000}}}`))
		_, _, _ = ws.ReadMessage()
	})
	common.BatchUpdateEnabled = true
	require.NoError(t, fixture.client.WriteMessage(websocket.TextMessage, []byte(`{"type":"response.create","model":"ws-billing","input":"batch"}`)))
	require.Equal(t, "response.completed", readResponsesWSTestEvent(t, fixture.client)["type"])
	fixture.closeAndWait(t)
	var before model.User
	require.NoError(t, model.DB.First(&before, fixture.user.Id).Error)
	assert.Zero(t, before.UsedQuota, "handler settlement queues aggregates until final flush")
	require.NoError(t, model.ShutdownBatchUpdater(context.Background()))
	assertResponsesWSAccounting(t, fixture, []int{1000})
	require.NoError(t, model.ShutdownBatchUpdater(context.Background()))
	assertResponsesWSAccounting(t, fixture, []int{1000})
}
