package service

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"io"
	"log"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/net/http/httpproxy"
)

func codexTestEnvelope(t *testing.T, value any) string {
	t.Helper()
	data, err := common.Marshal(value)
	require.NoError(t, err)
	return base64.StdEncoding.EncodeToString(data)
}
func codexTestResponse(status int, length *int64) codexResponseMetadata {
	return codexResponseMetadata{Version: 1, Status: status, Headers: make([][2]string, 0), ContentLength: length, Protocol: "HTTP/2.0"}
}
func codexTestHealth() codexTransportHealth {
	return codexTransportHealth{Version: 1, Profile: codexTransportProfile, Platform: "linux-arm64", Target: "aarch64-unknown-linux-gnu", Production: true, Purposes: []string{"api", "auth"}, Routes: []string{"http", "ws"}, ProxySchemes: []string{"http", "https", "socks5", "socks5h"}, HTTPProtocols: []string{"auto", "http1"}, Limits: codexProtocolLimits}
}

func codexTestSocket(t *testing.T, handler http.HandlerFunc, health *codexTransportHealth) string {
	t.Helper()
	root, err := filepath.EvalSymlinks(os.TempDir())
	require.NoError(t, err)
	dir, err := os.MkdirTemp(root, "codex-")
	require.NoError(t, err)
	require.NoError(t, os.Chmod(dir, 0700))
	path := filepath.Join(dir, "s")
	listener, err := net.Listen("unix", path)
	require.NoError(t, err)
	require.NoError(t, os.Chmod(path, 0600))
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/health" {
			data, e := common.Marshal(health)
			if e != nil {
				w.WriteHeader(500)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write(data)
			return
		}
		handler(w, r)
	})}
	go func() { _ = server.Serve(listener) }()
	t.Cleanup(func() { _ = server.Close(); _ = os.RemoveAll(dir) })
	return path
}
func codexTestState(t *testing.T, handler http.HandlerFunc, health *codexTransportHealth) *codexTransportSnapshot {
	t.Helper()
	if health == nil {
		h := codexTestHealth()
		health = &h
	}
	path := codexTestSocket(t, handler, health)
	codexTestConfigure(t, path)
	state, err := newCodexTransportSnapshot(context.Background())
	require.NoError(t, err)
	state.proxy = (&httpproxy.Config{}).ProxyFunc()
	codexTransportState.Store(state)
	return state
}

func codexTestConfigure(t *testing.T, path string) {
	t.Helper()
	enabled, socket, profile, ca := common.CodexTransportEnabled, common.CodexTransportSocket, common.CodexTransportProfile, common.CodexTransportCAFile
	timeout, idle, count, perHost, insecure, bodyMB := common.RelayTimeout, common.RelayIdleConnTimeout, common.RelayMaxIdleConns, common.RelayMaxIdleConnsPerHost, common.TLSInsecureSkipVerify, constant.MaxRequestBodyMB
	oldState := codexTransportState.Load()
	t.Cleanup(func() {
		common.CodexTransportEnabled = enabled
		common.CodexTransportSocket = socket
		common.CodexTransportProfile = profile
		common.CodexTransportCAFile = ca
		common.RelayTimeout = timeout
		common.RelayIdleConnTimeout = idle
		common.RelayMaxIdleConns = count
		common.RelayMaxIdleConnsPerHost = perHost
		common.TLSInsecureSkipVerify = insecure
		constant.MaxRequestBodyMB = bodyMB
		codexTransportState.Store(oldState)
	})
	common.CodexTransportEnabled = true
	common.CodexTransportSocket = path
	common.CodexTransportProfile = codexTransportProfile
	common.CodexTransportCAFile = ""
	common.RelayTimeout = 0
	common.RelayIdleConnTimeout = 90
	common.RelayMaxIdleConns = 500
	common.RelayMaxIdleConnsPerHost = 100
	common.TLSInsecureSkipVerify = false
	constant.MaxRequestBodyMB = 128
}

type codexTrackedBody struct {
	io.Reader
	closed atomic.Bool
}

func (b *codexTrackedBody) Close() error { b.closed.Store(true); return nil }

func TestCodexTransportHTTPPreservesResponse(t *testing.T) {
	for _, status := range []int{200, 302, 401, 503} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			payload := []byte{0x1f, 0x8b, 0, 0xff, 1, 2, 3}
			var calls atomic.Int32
			observed := make(chan codexRequestMetadata, 1)
			codexTestState(t, func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				var meta codexRequestMetadata
				data, e := base64.StdEncoding.DecodeString(r.Header.Get(codexMetaHeader))
				if e != nil || common.StrictUnmarshal(data, &meta) != nil {
					w.WriteHeader(500)
					return
				}
				observed <- meta
				upload, e := io.ReadAll(r.Body)
				if e != nil || string(upload) != "request" {
					w.WriteHeader(500)
					return
				}
				n := int64(len(payload))
				m := codexTestResponse(status, &n)
				m.Headers = [][2]string{{"content-encoding", base64.StdEncoding.EncodeToString([]byte("gzip"))}, {"x-repeat", "YQ=="}, {"x-repeat", "Yg=="}, {"connection", "WC1SZW1vdmU="}, {"x-remove", "c2VjcmV0"}, {"location", "aHR0cHM6Ly9vdGhlci5pbnZhbGlk"}, {"x-codex-transport-injected", "eA=="}}
				w.Header().Set(codexResponseHeader, codexTestEnvelope(t, m))
				w.Header().Set("Trailer", codexCompleteTrailer)
				_, _ = w.Write(payload)
				w.Header().Set(codexCompleteTrailer, "1")
			}, nil)
			client, err := GetCodexHTTPClient(CodexTransportOptions{Purpose: CodexTransportAPI})
			require.NoError(t, err)
			body := &codexTrackedBody{Reader: strings.NewReader("request")}
			req, err := http.NewRequest("POST", "https://target.invalid/a%2Fb?q=sentinel", body)
			require.NoError(t, err)
			req.ContentLength = 7
			req.Header.Add("X-Repeat", "first")
			req.Header.Add("X-Repeat", "second")
			req.Header.Set("Connection", "X-Remove")
			req.Header.Set("X-Remove", "secret")
			req.Header.Set(codexMetaHeader, "forged")
			req.Header.Set("Idempotency-Key", "upstream-only")
			response, err := client.Do(req)
			require.NoError(t, err)
			defer response.Body.Close()
			result, err := io.ReadAll(response.Body)
			require.NoError(t, err)
			assert.Equal(t, payload, result)
			assert.Equal(t, status, response.StatusCode)
			assert.Equal(t, int64(len(payload)), response.ContentLength)
			assert.Equal(t, "HTTP/2.0", response.Proto)
			assert.Same(t, req, response.Request)
			assert.Equal(t, []string{"a", "b"}, response.Header.Values("X-Repeat"))
			assert.Equal(t, "gzip", response.Header.Get("Content-Encoding"))
			assert.Empty(t, response.Header.Get("X-Remove"))
			assert.Empty(t, response.Header.Get("X-Codex-Transport-Injected"))
			assert.True(t, body.closed.Load())
			assert.Equal(t, int32(1), calls.Load())
			meta := <-observed
			assert.Equal(t, req.URL.String(), meta.URL)
			assert.Equal(t, "POST", meta.Method)
			assert.Equal(t, CodexTransportAPI, meta.Purpose)
			assert.Equal(t, [][2]string{{"idempotency-key", "dXBzdHJlYW0tb25seQ=="}, {"x-repeat", "Zmlyc3Q="}, {"x-repeat", "c2Vjb25k"}}, meta.Headers)
		})
	}
}

func TestCodexTransportCompletionAndBodyless(t *testing.T) {
	for _, tc := range []struct {
		name, method string
		status       int
		length       int64
		body, marker string
		valid        bool
	}{
		{"head", "HEAD", 200, 123, "", "1", true}, {"not_modified", "GET", 304, 123, "", "1", true}, {"no_content", "GET", 204, 0, "", "1", true},
		{"missing_completion", "GET", 200, 3, "abc", "", false}, {"wrong_completion", "GET", 200, 3, "abc", "0", false}, {"short_body", "GET", 200, 4, "abc", "1", false}, {"long_body", "GET", 200, 2, "abc", "1", false}, {"head_payload", "HEAD", 200, 123, "abc", "1", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			codexTestState(t, func(w http.ResponseWriter, r *http.Request) {
				_, _ = io.Copy(io.Discard, r.Body)
				m := codexTestResponse(tc.status, &tc.length)
				w.Header().Set(codexResponseHeader, codexTestEnvelope(t, m))
				w.Header().Set("Trailer", codexCompleteTrailer)
				w.WriteHeader(200)
				_, _ = w.Write([]byte(tc.body))
				w.Header().Set(codexCompleteTrailer, tc.marker)
			}, nil)
			client, err := GetCodexHTTPClient(CodexTransportOptions{Purpose: CodexTransportAPI})
			require.NoError(t, err)
			req, err := http.NewRequest(tc.method, "https://target.invalid/", nil)
			require.NoError(t, err)
			response, err := client.Do(req)
			require.NoError(t, err)
			defer response.Body.Close()
			_, err = io.ReadAll(response.Body)
			if tc.valid {
				require.NoError(t, err)
				assert.Equal(t, tc.length, response.ContentLength)
			} else {
				var transportErr *CodexTransportError
				require.ErrorAs(t, err, &transportErr)
				assert.Equal(t, "body_truncated", transportErr.Phase)
				require.NotNil(t, transportErr.UpstreamStatus)
				assert.Equal(t, tc.status, *transportErr.UpstreamStatus)
			}
		})
	}
}

func TestCodexTransportStrictWire(t *testing.T) {
	good := `{"version":1,"status":200,"headers":[],"content_length":null,"protocol":"HTTP/1.1"}`
	for index, bad := range []string{
		strings.Replace(good, `"status":200`, `"status":200,"status":201`, 1),
		strings.Replace(good, `"status":200`, `"STATUS":200`, 1),
		strings.Replace(good, `"status":200`, `"status":200.0`, 1),
		strings.Replace(good, `"status":200,`, "", 1),
		strings.Replace(good, `"headers":[]`, `"headers":null`, 1),
		strings.Replace(good, `"headers":[]`, `"headers":[["x","YQ==","extra"]]`, 1),
		strings.Replace(good, `"version":1`, `"version":1,"unknown":true`, 1),
		good + ` {}`, `null`, strings.Repeat("[", 66) + strings.Repeat("]", 66),
	} {
		t.Run(fmt.Sprintf("case_%d", index), func(t *testing.T) {
			h := http.Header{}
			h.Set(codexResponseHeader, base64.StdEncoding.EncodeToString([]byte(bad)))
			_, err := decodeCodexResponse(h, &http.Request{}, false)
			require.Error(t, err)
		})
	}
	h := http.Header{}
	h.Set(codexResponseHeader, base64.StdEncoding.EncodeToString([]byte(good)))
	_, err := decodeCodexResponse(h, &http.Request{}, false)
	require.NoError(t, err)
	h.Add(codexResponseHeader, h.Get(codexResponseHeader))
	_, err = decodeCodexResponse(h, &http.Request{}, false)
	require.Error(t, err)
	h.Set(codexResponseHeader, strings.Repeat("A", 131073))
	_, err = decodeCodexResponse(h, &http.Request{}, false)
	require.Error(t, err)
}

func TestCodexTransportTypedErrorsAndNoReplay(t *testing.T) {
	var requests atomic.Int32
	codexTestState(t, func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		_, _ = io.Copy(io.Discard, r.Body)
		w.Header().Set(codexErrorHeader, codexTestEnvelope(t, map[string]any{"version": 1, "code": "tls", "phase": "upstream_connect", "may_have_sent": false, "upstream_status": nil}))
		w.WriteHeader(502)
	}, nil)
	client, err := GetCodexHTTPClient(CodexTransportOptions{Purpose: CodexTransportAPI, ProxyURL: "http://user:SYNTHETIC_SECRET_DO_NOT_LOG@proxy.invalid:8080"})
	require.NoError(t, err)
	req, err := http.NewRequest("GET", "https://target.invalid/?SYNTHETIC_SECRET_DO_NOT_LOG", nil)
	require.NoError(t, err)
	_, err = client.Do(req)
	var te *CodexTransportError
	require.ErrorAs(t, err, &te)
	assert.Equal(t, "tls", te.Code)
	assert.False(t, te.MayHaveSent)
	assert.NotContains(t, te.Error(), "SYNTHETIC_SECRET_DO_NOT_LOG")
	assert.Equal(t, int32(1), requests.Load())
}

func TestCodexTransportValidationClosesUpload(t *testing.T) {
	state := codexTestState(t, func(w http.ResponseWriter, r *http.Request) { t.Error("validation must not dial local route") }, nil)
	for _, tc := range []struct {
		target  string
		purpose CodexTransportPurpose
	}{
		{"http://target.invalid/", CodexTransportAPI}, {"https://user:secret@target.invalid/", CodexTransportAPI}, {"https://target.invalid/#secret", CodexTransportAPI}, {"https://wrong.invalid/token", CodexTransportAuth},
	} {
		t.Run(tc.target, func(t *testing.T) {
			b := &codexTrackedBody{Reader: strings.NewReader("x")}
			req, err := http.NewRequest("POST", tc.target, b)
			require.NoError(t, err)
			_, err = (&codexRoundTripper{state: state, options: CodexTransportOptions{Purpose: tc.purpose}}).RoundTrip(req)
			require.Error(t, err)
			assert.True(t, b.closed.Load())
		})
	}
}

func TestCodexTransportPolicySnapshot(t *testing.T) {
	state := codexTestState(t, func(http.ResponseWriter, *http.Request) {}, nil)
	state.proxy = (&httpproxy.Config{HTTPSProxy: "http://proxy.invalid:8080", NoProxy: "direct.invalid"}).ProxyFunc()
	req, err := http.NewRequest("GET", "wss://target.invalid/", nil)
	require.NoError(t, err)
	options := CodexTransportOptions{Purpose: CodexTransportAPI}
	options.Settings.HTTPProtocol = "http1"
	options.Settings.HTTP2ConnectionShards = 8
	options.Settings.ResponseHeaderTimeoutSeconds = 10
	m, err := state.metadata(req, options, true)
	require.NoError(t, err)
	require.NotNil(t, m.ProxyURL)
	assert.Equal(t, "http://proxy.invalid:8080", *m.ProxyURL)
	assert.Equal(t, int64(45000), m.HeaderTimeoutMS)
	assert.Zero(t, m.TotalTimeoutMS)
	assert.Equal(t, 1, m.Shards)
	req.URL.Host = "direct.invalid"
	req.Host = "direct.invalid"
	m, err = state.metadata(req, options, true)
	require.NoError(t, err)
	assert.Nil(t, m.ProxyURL)
	options.ProxyURL = "socks5h://user:secret@proxy.invalid:1080"
	m, err = state.metadata(req, options, true)
	require.NoError(t, err)
	require.NotNil(t, m.ProxyURL)
	assert.Equal(t, options.ProxyURL, *m.ProxyURL)
	common.RelayTimeout = 9
	common.RelayIdleConnTimeout = 1
	common.CodexTransportProfile = "changed"
	req.URL.Scheme = "https"
	m, err = state.metadata(req, options, false)
	require.NoError(t, err)
	assert.Zero(t, m.TotalTimeoutMS)
	assert.Equal(t, int64(90000), m.IdleTimeoutMS)
	assert.Equal(t, codexTransportProfile, m.Profile)
	assert.Equal(t, int64(10000), m.HeaderTimeoutMS)
	req.URL, _ = url.Parse(codexOAuthTokenURL)
	req.Host = req.URL.Host
	options.Purpose = CodexTransportAuth
	m, err = state.metadata(req, options, false)
	require.NoError(t, err)
	assert.Equal(t, int64(20000), m.TotalTimeoutMS)
}

func TestCodexTransportCloseCancelsStreaming(t *testing.T) {
	ended := make(chan struct{})
	codexTestState(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		w.Header().Set(codexResponseHeader, codexTestEnvelope(t, codexTestResponse(200, nil)))
		w.Header().Set("Trailer", codexCompleteTrailer)
		_, _ = w.Write([]byte("first"))
		w.(http.Flusher).Flush()
		<-r.Context().Done()
		close(ended)
	}, nil)
	client, err := GetCodexHTTPClient(CodexTransportOptions{Purpose: CodexTransportAPI})
	require.NoError(t, err)
	response, err := client.Get("https://target.invalid/")
	require.NoError(t, err)
	first := make([]byte, 5)
	_, err = io.ReadFull(response.Body, first)
	require.NoError(t, err)
	assert.Equal(t, "first", string(first))
	require.NoError(t, response.Body.Close())
	select {
	case <-ended:
	case <-time.After(3 * time.Second):
		t.Fatal("response Close did not cancel local stream")
	}
}

func TestCodexTransportWebSocketCapabilityAndRejection(t *testing.T) {
	var requests atomic.Int32
	state := codexTestState(t, func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		m := codexTestResponse(401, nil)
		body := "cHJlZml4"
		truncated, readError := true, true
		m.RejectionBodyB64 = &body
		m.RejectionTruncated = &truncated
		m.RejectionReadError = &readError
		w.Header().Set(codexResponseHeader, codexTestEnvelope(t, m))
		w.Header().Set("Content-Length", "0")
		w.WriteHeader(200)
	}, nil)
	state.health.Routes = []string{"http"}
	_, _, err := DialCodexWebSocket(context.Background(), "wss://target.invalid/", nil, CodexTransportOptions{Purpose: CodexTransportAPI})
	var te *CodexTransportError
	require.ErrorAs(t, err, &te)
	assert.False(t, te.MayHaveSent)
	assert.Zero(t, requests.Load())
	state.health.Routes = []string{"http", "ws"}
	conn, response, err := DialCodexWebSocket(context.Background(), "wss://target.invalid/", nil, CodexTransportOptions{Purpose: CodexTransportAPI})
	require.Nil(t, conn)
	require.NotNil(t, response)
	require.ErrorIs(t, err, websocket.ErrBadHandshake)
	var handshake *CodexWSHandshakeError
	require.ErrorAs(t, err, &handshake)
	assert.True(t, handshake.Truncated)
	assert.True(t, handshake.ReadError)
	assert.Equal(t, 401, response.StatusCode)
	data, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	require.NoError(t, response.Body.Close())
	assert.Equal(t, "prefix", string(data))
	assert.Equal(t, int32(1), requests.Load())
}

func TestCodexTransportWebSocketCloseAndCancel(t *testing.T) {
	for _, cancelFirst := range []bool{false, true} {
		t.Run(map[bool]string{false: "close", true: "cancel"}[cancelFirst], func(t *testing.T) {
			ended := make(chan struct{})
			var once sync.Once
			codexTestState(t, func(w http.ResponseWriter, r *http.Request) {
				upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
				h := http.Header{}
				h.Set(codexResponseHeader, codexTestEnvelope(t, codexTestResponse(101, nil)))
				conn, err := upgrader.Upgrade(w, r, h)
				if err != nil {
					return
				}
				defer conn.Close()
				defer once.Do(func() { close(ended) })
				for {
					kind, body, err := conn.ReadMessage()
					if err != nil {
						return
					}
					if conn.WriteMessage(kind, body) != nil {
						return
					}
				}
			}, nil)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			conn, response, err := DialCodexWebSocket(ctx, "wss://target.invalid/", nil, CodexTransportOptions{Purpose: CodexTransportAPI})
			require.NoError(t, err)
			require.NotNil(t, response)
			require.Equal(t, 101, response.StatusCode)
			require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte("one")))
			_, body, err := conn.ReadMessage()
			require.NoError(t, err)
			assert.Equal(t, "one", string(body))
			if cancelFirst {
				cancel()
			} else {
				require.NoError(t, conn.Close())
			}
			select {
			case <-ended:
			case <-time.After(3 * time.Second):
				t.Fatal("WS lifetime not released")
			}
		})
	}
}

func TestCodexTransportStartupAndDefaults(t *testing.T) {
	state := codexTestState(t, func(http.ResponseWriter, *http.Request) {}, nil)
	assert.True(t, CodexTransportEnabled())
	assert.Equal(t, uint64(1), CodexTransportGeneration())
	common.TLSInsecureSkipVerify = true
	_, err := newCodexTransportSnapshot(context.Background())
	require.Error(t, err)
	common.TLSInsecureSkipVerify = false
	common.RelayIdleConnTimeout = 0
	_, err = newCodexTransportSnapshot(context.Background())
	require.Error(t, err)
	common.RelayIdleConnTimeout = 90
	common.RelayTimeout = -1
	_, err = newCodexTransportSnapshot(context.Background())
	require.Error(t, err)
	common.RelayTimeout = 0
	common.CodexTransportProfile = "wrong"
	_, err = newCodexTransportSnapshot(context.Background())
	require.Error(t, err)
	common.CodexTransportProfile = codexTransportProfile
	require.NoError(t, os.Chmod(state.socket, 0666))
	_, err = newCodexTransportSnapshot(context.Background())
	require.Error(t, err)
	require.NoError(t, os.Chmod(state.socket, 0600))
	link := state.socket + "link"
	require.NoError(t, os.Symlink(state.socket, link))
	require.Error(t, validateCodexSocket(link))
	common.CodexTransportEnabled = false
	disabled, err := newCodexTransportSnapshot(context.Background())
	require.NoError(t, err)
	codexTransportState.Store(disabled)
	expected, err := GetHttpClientWithProxySettings("", CodexTransportOptions{}.Settings)
	require.NoError(t, err)
	actual, err := GetCodexHTTPClient(CodexTransportOptions{Purpose: CodexTransportAPI})
	require.NoError(t, err)
	assert.Same(t, expected, actual)
	auth, err := GetCodexHTTPClient(CodexTransportOptions{Purpose: CodexTransportAuth})
	require.NoError(t, err)
	assert.Equal(t, 20*time.Second, auth.Timeout)
}

func TestCodexTransportProtocolLimitsMatchFixture(t *testing.T) {
	data, err := os.ReadFile("../tools/codex-transport/fixtures/contracts.json")
	require.NoError(t, err)
	var fixture struct {
		Limits map[string]codexTransportLimit `json:"health_limits"`
	}
	require.NoError(t, common.Unmarshal(data, &fixture))
	assert.Equal(t, fixture.Limits, codexProtocolLimits)
}

func TestCodexTransportUploadLimit(t *testing.T) {
	source := &codexTrackedBody{Reader: bytes.NewBufferString("12345")}
	body := &codexUploadBody{source: source, max: 4}
	_, err := io.ReadAll(body)
	var te *CodexTransportError
	require.ErrorAs(t, err, &te)
	assert.True(t, te.MayHaveSent)
	require.NoError(t, body.Close())
	assert.True(t, source.closed.Load())
}

func TestCodexTransportRequestHeaderBounds(t *testing.T) {
	for _, tc := range []struct {
		name   string
		header http.Header
		valid  bool
	}{
		{"obs_text", http.Header{"X-Raw": []string{string([]byte{0x80, 0xff})}}, true},
		{"value_at_limit", http.Header{"X": []string{strings.Repeat("a", 8192)}}, true},
		{"value_above_limit", http.Header{"X": []string{strings.Repeat("a", 8193)}}, false},
		{"crlf", http.Header{"X": []string{"a\r\nb"}}, false},
		{"nul", http.Header{"X": []string{"a\x00b"}}, false},
		{"name_above_limit", http.Header{strings.Repeat("x", 257): []string{"a"}}, false},
		{"aggregate_above_limit", http.Header{"X": []string{strings.Repeat("a", 8192), strings.Repeat("a", 8192)}}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			pairs, err := encodeCodexHeaders(tc.header, false)
			if tc.valid {
				require.NoError(t, err)
				require.Len(t, pairs, 1)
				decoded, err := base64.StdEncoding.DecodeString(pairs[0][1])
				require.NoError(t, err)
				for _, values := range tc.header {
					assert.Equal(t, values[0], string(decoded))
				}
			} else {
				require.Error(t, err)
			}
		})
	}
	h := http.Header{"X": make([]string, 100)}
	_, err := encodeCodexHeaders(h, false)
	require.NoError(t, err)
	h["X"] = append(h["X"], "")
	_, err = encodeCodexHeaders(h, false)
	require.Error(t, err)
}

func TestCodexTransportStrictErrorAndHealth(t *testing.T) {
	for _, data := range []string{
		`{"version":1,"code":"tls","phase":"upstream_connect","may_have_sent":false}`,
		`{"version":1,"code":"SECRET","phase":"upstream_connect","may_have_sent":false,"upstream_status":null}`,
		`{"version":1,"code":"tls","phase":"upstream_connect","may_have_sent":false,"may_have_sent":true,"upstream_status":null}`,
		`{"version":1,"code":"tls","phase":"upstream_connect","may_have_sent":null,"upstream_status":null}`,
	} {
		h := http.Header{}
		h.Set(codexErrorHeader, base64.StdEncoding.EncodeToString([]byte(data)))
		err := decodeCodexError(h)
		var te *CodexTransportError
		require.ErrorAs(t, err, &te)
		assert.True(t, te.MayHaveSent)
		assert.Equal(t, "upstream_io", te.Code)
		assert.NotContains(t, te.Error(), "SECRET")
	}
	valid, err := common.Marshal(codexTestHealth())
	require.NoError(t, err)
	for _, data := range []string{strings.Replace(string(valid), `"production":true`, `"production":null`, 1), strings.Replace(string(valid), `"version":1`, `"Version":1`, 1), strings.Replace(string(valid), `"min":1`, `"MIN":1`, 1)} {
		var health codexTransportHealth
		require.Error(t, decodeCodexJSON([]byte(data), &health, "health"))
	}
}

func TestCodexTransportUnavailableNeverFallsBack(t *testing.T) {
	state := codexTestState(t, func(http.ResponseWriter, *http.Request) { t.Error("must not request") }, nil)
	require.NoError(t, os.Remove(state.socket))
	client, err := GetCodexHTTPClient(CodexTransportOptions{Purpose: CodexTransportAPI})
	require.NoError(t, err)
	_, err = client.Get("https://127.0.0.1:1/?SYNTHETIC_SECRET")
	var te *CodexTransportError
	require.ErrorAs(t, err, &te)
	assert.False(t, te.MayHaveSent)
	assert.Equal(t, "local_connect", te.Phase)
	assert.NotContains(t, te.Error(), "SYNTHETIC_SECRET")
}

func TestCodexTransportCallerCancellation(t *testing.T) {
	started, ended := make(chan struct{}), make(chan struct{})
	codexTestState(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		w.Header().Set(codexResponseHeader, codexTestEnvelope(t, codexTestResponse(200, nil)))
		w.Header().Set("Trailer", codexCompleteTrailer)
		w.WriteHeader(200)
		w.(http.Flusher).Flush()
		close(started)
		<-r.Context().Done()
		close(ended)
	}, nil)
	client, err := GetCodexHTTPClient(CodexTransportOptions{Purpose: CodexTransportAPI})
	require.NoError(t, err)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "POST", "https://target.invalid/", strings.NewReader("input"))
	require.NoError(t, err)
	response, err := client.Do(req)
	require.NoError(t, err)
	<-started
	cancel()
	_, err = io.ReadAll(response.Body)
	var te *CodexTransportError
	require.ErrorAs(t, err, &te)
	assert.Equal(t, "cancelled", te.Code)
	assert.True(t, te.MayHaveSent)
	require.NoError(t, response.Body.Close())
	select {
	case <-ended:
	case <-time.After(3 * time.Second):
		t.Fatal("caller cancellation did not release local server")
	}
}

func TestCodexTransportEarlyResponseClosesUpload(t *testing.T) {
	reached := make(chan struct{})
	reader, writer := io.Pipe()
	codexTestState(t, func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, http.NewResponseController(w).EnableFullDuplex())
		one := make([]byte, 1)
		_, err := io.ReadFull(r.Body, one)
		if err != nil {
			return
		}
		close(reached)
		m := codexTestResponse(413, nil)
		w.Header().Set(codexResponseHeader, codexTestEnvelope(t, m))
		w.Header().Set("Trailer", codexCompleteTrailer)
		w.WriteHeader(200)
		_, _ = w.Write([]byte("rejected"))
		w.(http.Flusher).Flush()
		w.Header().Set(codexCompleteTrailer, "1")
	}, nil)
	client, err := GetCodexHTTPClient(CodexTransportOptions{Purpose: CodexTransportAPI})
	require.NoError(t, err)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "POST", "https://target.invalid/", reader)
	require.NoError(t, err)
	req.ContentLength = 100000
	writeDone := make(chan error, 1)
	go func() { _, err := writer.Write([]byte("x")); writeDone <- err }()
	response, err := client.Do(req)
	require.NoError(t, err)
	defer response.Body.Close()
	assert.Equal(t, 413, response.StatusCode)
	<-reached
	require.NoError(t, <-writeDone)
	_, err = writer.Write([]byte("must stop"))
	require.Error(t, err)
	writer.Close()
	data, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	assert.Equal(t, "rejected", string(data))
}

func TestCodexTransportRejectsIncompatibleHealth(t *testing.T) {
	state := codexTestState(t, func(http.ResponseWriter, *http.Request) {}, nil)
	for _, tc := range []struct {
		name   string
		mutate func(*codexTransportHealth)
	}{
		{"non_production", func(h *codexTransportHealth) { h.Production = false }},
		{"wrong_profile", func(h *codexTransportHealth) { h.Profile = "different" }},
		{"missing_http", func(h *codexTransportHealth) { h.Routes = []string{"ws"} }},
		{"missing_auth", func(h *codexTransportHealth) { h.Purposes = []string{"api"} }},
		{"missing_proxy", func(h *codexTransportHealth) { h.ProxySchemes = []string{"http"} }},
		{"insecure", func(h *codexTransportHealth) { h.TLSInsecure = true }},
		{"missing_limits", func(h *codexTransportHealth) { h.Limits = nil }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			health := codexTestHealth()
			tc.mutate(&health)
			common.CodexTransportSocket = codexTestSocket(t, func(http.ResponseWriter, *http.Request) { t.Error("health rejection must not call upstream route") }, &health)
			_, err := newCodexTransportSnapshot(context.Background())
			var typed *CodexTransportError
			require.ErrorAs(t, err, &typed)
			assert.False(t, typed.MayHaveSent)
			assert.Equal(t, "unsupported_policy", typed.Code)
		})
	}
	common.CodexTransportSocket = state.socket
}

// Set CODEX_TRANSPORT_TEST_BINARY to a built production Rust executable. Both
// processes and the synthetic TLS upstream must share the same Linux kernel.
// Missing configuration is a reported skip, never transport acceptance.
func TestCodexTransportRustProcess(t *testing.T) {
	binary := os.Getenv("CODEX_TRANSPORT_TEST_BINARY")
	if binary == "" {
		t.Skip("real Rust integration not configured: set CODEX_TRANSPORT_TEST_BINARY")
	}
	require.Equal(t, "linux", runtime.GOOS, "production health must not be bypassed on host platforms")
	require.Equal(t, "arm64", runtime.GOARCH)
	require.True(t, filepath.IsAbs(binary))
	_, err := os.Stat(binary)
	require.NoError(t, err)
	root, err := filepath.EvalSymlinks(os.TempDir())
	require.NoError(t, err)
	directory, err := os.MkdirTemp(root, "codex-rust-")
	require.NoError(t, err)
	require.NoError(t, os.Chmod(directory, 0700))
	defer os.RemoveAll(directory)
	socket := filepath.Join(directory, "s")
	streamRelease := make(chan struct{})
	var streamOnce sync.Once
	cancelObserved := make(chan struct{})
	var cancelOnce sync.Once
	uploadObserved := make(chan struct{}, 1)
	identitiesArrived := make(chan struct{}, 2)
	identitiesRelease := make(chan struct{})
	var identitiesOnce sync.Once
	defer identitiesOnce.Do(func() { close(identitiesRelease) })
	var mu sync.Mutex
	counts := make(map[string]int)
	observed := make(chan *http.Request, 8)
	upstream := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		counts[r.URL.Path]++
		mu.Unlock()
		switch r.URL.Path {
		case "/ws", "/ws-cancel", "/ws-identity":
			upgrader := websocket.Upgrader{EnableCompression: true, Subprotocols: []string{"codex-test"}}
			conn, err := upgrader.Upgrade(w, r, nil)
			if err != nil {
				return
			}
			defer conn.Close()
			if r.URL.Path == "/ws-identity" {
				if conn.WriteMessage(websocket.TextMessage, []byte(r.Header.Get("Authorization")+"/"+r.Header.Get("Chatgpt-Account-Id"))) != nil {
					return
				}
			}

			for {
				kind, data, err := conn.ReadMessage()
				if err != nil {
					return
				}
				if err = conn.WriteMessage(kind, data); err != nil {
					return
				}
			}
		case "/ws-reject":
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = io.WriteString(w, `{"error":{"message":"synthetic denied","type":"invalid_request_error","code":"synthetic_denied"}}`)
		case "/h2":
			w.Header().Set("X-Upstream-Protocol", r.Proto)
			_, _ = io.WriteString(w, "h2")
		case "/identity":
			identitiesArrived <- struct{}{}
			select {
			case <-identitiesRelease:
			case <-r.Context().Done():
				return
			}
			w.Header().Set("X-Identity", r.Header.Get("Authorization"))
			w.Header().Set("Set-Cookie", "upstream-only=never-store")
			_, _ = io.WriteString(w, r.Header.Get("Cookie"))
		case "/stream":
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = io.WriteString(w, "data: first\n\n")
			w.(http.Flusher).Flush()
			select {
			case <-streamRelease:
				_, _ = io.WriteString(w, "data: completed\n\n")
			case <-r.Context().Done():
			}
		case "/cancel":
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = io.WriteString(w, "data: first\n\n")
			w.(http.Flusher).Flush()
			<-r.Context().Done()
			cancelOnce.Do(func() { close(cancelObserved) })
		case "/early":
			if http.NewResponseController(w).EnableFullDuplex() != nil {
				w.WriteHeader(500)
				return
			}
			var prefix [1]byte
			if _, err := io.ReadFull(r.Body, prefix[:]); err != nil {
				return
			}
			uploadObserved <- struct{}{}
			w.Header().Set("Content-Length", "8")
			w.WriteHeader(413)
			_, _ = io.WriteString(w, "rejected")
		case "/truncated":
			conn, buffer, err := w.(http.Hijacker).Hijack()
			if err != nil {
				return
			}
			defer conn.Close()
			_, _ = buffer.WriteString("HTTP/1.1 200 OK\r\nContent-Length: 9\r\nConnection: close\r\n\r\nabc")
			_ = buffer.Flush()
		case "/redirect":
			w.Header().Set("Location", "/redirect-target")
			w.WriteHeader(302)
			_, _ = io.WriteString(w, "redirect")
		case "/status":
			payload, err := io.ReadAll(r.Body)
			if err != nil {
				w.WriteHeader(400)
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(payload))
			observed <- r
			w.Header().Add("X-Repeated", "first")
			w.Header().Add("X-Repeated", "second")
			w.Header().Set("X-Codex-Transport-Injected", "forged")
			w.WriteHeader(503)
			_, _ = w.Write(payload)
		case "/upload":
			prefix := make([]byte, 5)
			if _, err := io.ReadFull(r.Body, prefix); err != nil {
				w.WriteHeader(400)
				return
			}
			uploadObserved <- struct{}{}
			suffix, err := io.ReadAll(r.Body)
			if err != nil {
				w.WriteHeader(400)
				return
			}
			_, _ = w.Write(append(prefix, suffix...))
		default:
			_, _ = io.Copy(io.Discard, r.Body)
			_, _ = io.WriteString(w, "ok")
		}
	}))
	upstream.Config.ErrorLog = log.New(io.Discard, "", 0)
	// httptest's default self-signed certificate is a CA used as its own leaf;
	// webpki correctly rejects that. Generate a proper isolated CA/leaf chain.
	caKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	caTemplate := &x509.Certificate{SerialNumber: big.NewInt(1), NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(24 * time.Hour), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign | x509.KeyUsageCRLSign}
	caDER, err := x509.CreateCertificate(rand.Reader, caTemplate, caTemplate, &caKey.PublicKey, caKey)
	require.NoError(t, err)
	leafKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	leafTemplate := &x509.Certificate{SerialNumber: big.NewInt(2), NotBefore: caTemplate.NotBefore, NotAfter: caTemplate.NotAfter, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}, IPAddresses: []net.IP{net.ParseIP("127.0.0.1"), net.ParseIP("::1")}}
	leafDER, err := x509.CreateCertificate(rand.Reader, leafTemplate, caTemplate, &leafKey.PublicKey, caKey)
	require.NoError(t, err)
	upstream.TLS = &tls.Config{Certificates: []tls.Certificate{{Certificate: [][]byte{leafDER, caDER}, PrivateKey: leafKey}}}
	upstream.EnableHTTP2 = true
	upstream.StartTLS()
	defer upstream.Close()
	defer streamOnce.Do(func() { close(streamRelease) })
	caPath := filepath.Join(directory, "ca.pem")
	require.NoError(t, os.WriteFile(caPath, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caDER}), 0600))
	process := exec.Command(binary)
	process.Env = []string{"CODEX_TRANSPORT_SOCKET=" + socket, "HOME=" + directory, "PATH=" + os.Getenv("PATH")}
	var diagnostic bytes.Buffer
	process.Stdout = &diagnostic
	process.Stderr = &diagnostic
	require.NoError(t, process.Start())
	exited := make(chan error, 1)
	processExited := false
	go func() { exited <- process.Wait() }()
	defer func() {
		if processExited {
			return
		}
		_ = process.Process.Signal(syscall.SIGTERM)
		select {
		case <-exited:
		case <-time.After(5 * time.Second):
			_ = process.Process.Kill()
			<-exited
		}
		assert.NotContains(t, diagnostic.String(), "SYNTHETIC_SECRET_DO_NOT_LOG")
	}()
	readyDeadline := time.NewTimer(10 * time.Second)
	defer readyDeadline.Stop()
	poll := time.NewTicker(10 * time.Millisecond)
	defer poll.Stop()
	ready := false
	for !ready {
		select {
		case err := <-exited:
			processExited = true
			t.Fatalf("Rust process exited before startup: %v", err)
		case <-readyDeadline.C:
			t.Fatal("Rust socket startup deadline exceeded")
		case <-poll.C:
			info, err := os.Lstat(socket)
			ready = err == nil && info.Mode()&os.ModeSocket != 0
		}
	}
	codexTestConfigure(t, socket)
	common.CodexTransportCAFile = caPath
	// The frozen startup API is exercised exactly once in this process. Other
	// local tests use private fixtures without consuming the startup singleton.
	require.NoError(t, InitCodexTransport())
	state := codexTransportState.Load()
	require.NotNil(t, state)
	require.True(t, state.health.Production)
	require.Equal(t, "linux-arm64", state.health.Platform)
	options := CodexTransportOptions{Purpose: CodexTransportAPI}
	options.Settings.HTTPProtocol = "http1"
	client, err := GetCodexHTTPClient(options)
	require.NoError(t, err)
	count := func(path string) int { mu.Lock(); defer mu.Unlock(); return counts[path] }
	t.Run("status_headers_body_no_retry", func(t *testing.T) {
		req, err := http.NewRequest("POST", upstream.URL+"/status?escaped=%2F", strings.NewReader("synthetic-body"))
		require.NoError(t, err)
		req.Header.Set("Authorization", "Bearer SYNTHETIC_SECRET_DO_NOT_LOG")
		req.Header.Add("X-Repeated", "one")
		req.Header.Add("X-Repeated", "two")
		req.Header.Set("Connection", "X-Strip")
		req.Header.Set("X-Strip", "hidden")
		req.Header.Set(codexMetaHeader, "forged")
		response, err := client.Do(req)
		require.NoError(t, err)
		defer response.Body.Close()
		body, err := io.ReadAll(response.Body)
		require.NoError(t, err)
		assert.Equal(t, 503, response.StatusCode)
		assert.Equal(t, "synthetic-body", string(body))
		assert.Equal(t, []string{"first", "second"}, response.Header.Values("X-Repeated"))
		assert.Empty(t, response.Header.Get("X-Codex-Transport-Injected"))
		assert.Equal(t, 1, count("/status"))
		received := <-observed
		assert.Equal(t, "escaped=%2F", received.URL.RawQuery)
		assert.Equal(t, "Bearer SYNTHETIC_SECRET_DO_NOT_LOG", received.Header.Get("Authorization"))
		assert.Equal(t, []string{"one", "two"}, received.Header.Values("X-Repeated"))
		assert.Empty(t, received.Header.Get("X-Strip"))
		assert.Empty(t, received.Header.Get(codexMetaHeader))
		assert.Equal(t, int64(len("synthetic-body")), received.ContentLength)
	})
	t.Run("body_above_old_poc_limit", func(t *testing.T) {
		payload := bytes.Repeat([]byte("synthetic"), 233017)
		req, err := http.NewRequest("POST", upstream.URL+"/status", bytes.NewReader(payload))
		require.NoError(t, err)
		response, err := client.Do(req)
		require.NoError(t, err)
		defer response.Body.Close()
		data, err := io.ReadAll(response.Body)
		require.NoError(t, err)
		assert.Equal(t, payload, data)
		assert.Equal(t, 503, response.StatusCode)
		assert.Equal(t, 2, count("/status"))
		<-observed
	})

	t.Run("incremental_response", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, "GET", upstream.URL+"/stream", nil)
		require.NoError(t, err)
		response, err := client.Do(req)
		require.NoError(t, err)
		defer response.Body.Close()
		first := make([]byte, len("data: first\n\n"))
		_, err = io.ReadFull(response.Body, first)
		require.NoError(t, err)
		assert.Equal(t, "data: first\n\n", string(first))
		streamOnce.Do(func() { close(streamRelease) })
		rest, err := io.ReadAll(response.Body)
		require.NoError(t, err)
		assert.Equal(t, "data: completed\n\n", string(rest))
		assert.Equal(t, 1, count("/stream"))
	})
	t.Run("incremental_upload", func(t *testing.T) {
		reader, writer := io.Pipe()
		defer reader.Close()
		defer writer.Close()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, "POST", upstream.URL+"/upload", reader)
		require.NoError(t, err)
		type outcome struct {
			response *http.Response
			err      error
		}
		done := make(chan outcome, 1)
		go func() { response, err := client.Do(req); done <- outcome{response, err} }()
		_, err = writer.Write([]byte("first"))
		require.NoError(t, err)
		select {
		case <-uploadObserved:
		case <-ctx.Done():
			t.Fatal("upload prefix was buffered instead of reaching upstream")
		}
		_, err = writer.Write([]byte("last"))
		require.NoError(t, err)
		require.NoError(t, writer.Close())
		result := <-done
		require.NoError(t, result.err)
		defer result.response.Body.Close()
		data, err := io.ReadAll(result.response.Body)
		require.NoError(t, err)
		assert.Equal(t, "firstlast", string(data))
		assert.Equal(t, 1, count("/upload"))
	})
	t.Run("redirect_is_one_attempt", func(t *testing.T) {
		response, err := client.Get(upstream.URL + "/redirect")
		require.NoError(t, err)
		defer response.Body.Close()
		_, err = io.ReadAll(response.Body)
		require.NoError(t, err)
		assert.Equal(t, 302, response.StatusCode)
		assert.Equal(t, 1, count("/redirect"))
		assert.Zero(t, count("/redirect-target"))
	})
	t.Run("truncation_is_not_eof", func(t *testing.T) {
		response, err := client.Get(upstream.URL + "/truncated")
		require.NoError(t, err)
		defer response.Body.Close()
		_, err = io.ReadAll(response.Body)
		var typed *CodexTransportError
		require.ErrorAs(t, err, &typed)
		assert.True(t, typed.MayHaveSent)
		assert.Equal(t, "body_truncated", typed.Phase)
		assert.Equal(t, 1, count("/truncated"))
	})
	t.Run("early_413_closes_blocked_upload", func(t *testing.T) {
		reader, writer := io.Pipe()
		defer reader.Close()
		defer writer.Close()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, "POST", upstream.URL+"/early", reader)
		require.NoError(t, err)
		req.ContentLength = 100000
		wrote := make(chan error, 1)
		go func() { _, err := writer.Write([]byte("x")); wrote <- err }()
		response, err := client.Do(req)
		require.NoError(t, err)
		defer response.Body.Close()
		require.NoError(t, <-wrote)
		data, err := io.ReadAll(response.Body)
		require.NoError(t, err)
		assert.Equal(t, 413, response.StatusCode)
		assert.Equal(t, "rejected", string(data))
		_, err = writer.Write([]byte("stop"))
		require.Error(t, err)
		assert.Equal(t, 1, count("/early"))
		<-uploadObserved
	})
	t.Run("cancel_reaches_upstream", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, "GET", upstream.URL+"/cancel", nil)
		require.NoError(t, err)
		response, err := client.Do(req)
		require.NoError(t, err)
		defer response.Body.Close()
		prefix := make([]byte, len("data: first\n\n"))
		_, err = io.ReadFull(response.Body, prefix)
		require.NoError(t, err)
		cancel()
		_, err = io.ReadAll(response.Body)
		require.Error(t, err)
		select {
		case <-cancelObserved:
		case <-time.After(5 * time.Second):
			t.Fatal("Go cancellation did not reach Rust upstream")
		}
		assert.Equal(t, 1, count("/cancel"))
	})
	t.Run("auto_negotiates_http2", func(t *testing.T) {
		auto, err := GetCodexHTTPClient(CodexTransportOptions{Purpose: CodexTransportAPI})
		require.NoError(t, err)
		response, err := auto.Get(upstream.URL + "/h2")
		require.NoError(t, err)
		defer response.Body.Close()
		data, err := io.ReadAll(response.Body)
		require.NoError(t, err)
		assert.Equal(t, "h2", string(data))
		assert.Equal(t, "HTTP/2.0", response.Proto)
		assert.Equal(t, "HTTP/2.0", response.Header.Get("X-Upstream-Protocol"))
		assert.Equal(t, 1, count("/h2"))
	})
	t.Run("concurrent_identity_isolation", func(t *testing.T) {
		auto, err := GetCodexHTTPClient(CodexTransportOptions{Purpose: CodexTransportAPI})
		require.NoError(t, err)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		type identityResult struct {
			want, header, body string
			err                error
		}
		results := make(chan identityResult, 2)
		for _, identity := range []string{"synthetic-one", "synthetic-two"} {
			go func() {
				req, err := http.NewRequestWithContext(ctx, "GET", upstream.URL+"/identity", nil)
				if err != nil {
					results <- identityResult{err: err}
					return
				}
				req.Header.Set("Authorization", identity)
				req.Header.Set("Cookie", identity)
				response, err := auto.Do(req)
				if err != nil {
					results <- identityResult{err: err}
					return
				}
				defer response.Body.Close()
				data, err := io.ReadAll(response.Body)
				results <- identityResult{want: identity, header: response.Header.Get("X-Identity"), body: string(data), err: err}
			}()
		}
		for range 2 {
			select {
			case <-identitiesArrived:
			case <-ctx.Done():
				t.Fatal("concurrent identity requests did not reach upstream")
			}
		}
		identitiesOnce.Do(func() { close(identitiesRelease) })
		for range 2 {
			result := <-results
			require.NoError(t, result.err)
			assert.Equal(t, result.want, result.header)
			assert.Equal(t, result.want, result.body)
		}
		assert.Equal(t, 2, count("/identity"))
	})

	t.Run("websocket_two_creates_binary_control_and_cancel", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		target := strings.Replace(upstream.URL, "https://", "wss://", 1) + "/ws"
		conn, response, err := DialCodexWebSocket(ctx, target, http.Header{"Sec-Websocket-Protocol": {"codex-test"}}, options)
		require.NoError(t, err)
		defer conn.Close()
		require.Equal(t, http.StatusSwitchingProtocols, response.StatusCode)
		assert.Equal(t, "codex-test", conn.Subprotocol())
		for _, payload := range []string{`{"type":"response.create","event_id":"one","stream_id":"s1","model":"synthetic"}`, `{"type":"response.create","event_id":"two","stream_id":"s2","model":"synthetic"}`} {
			require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(payload)))
			require.NoError(t, conn.SetReadDeadline(time.Now().Add(5*time.Second)))
			kind, data, err := conn.ReadMessage()
			require.NoError(t, err)
			assert.Equal(t, websocket.TextMessage, kind)
			assert.Equal(t, payload, string(data))
		}
		pong := make(chan string, 1)
		conn.SetPongHandler(func(value string) error { pong <- value; return nil })
		require.NoError(t, conn.WriteControl(websocket.PingMessage, []byte("local-ping"), time.Now().Add(time.Second)))
		require.NoError(t, conn.WriteMessage(websocket.BinaryMessage, []byte{0, 1, 255}))
		kind, data, err := conn.ReadMessage()
		require.NoError(t, err)
		assert.Equal(t, websocket.BinaryMessage, kind)
		assert.Equal(t, []byte{0, 1, 255}, data)
		select {
		case value := <-pong:
			assert.Equal(t, "local-ping", value)
		case <-time.After(time.Second):
			t.Fatal("missing hop-local pong")
		}
		cancel()
		_, _, err = conn.ReadMessage()
		require.Error(t, err)
		assert.Equal(t, 1, count("/ws"), "two creates must share exactly one physical connection")
	})
	t.Run("websocket_account_and_cancellation_isolation", func(t *testing.T) {
		target := strings.Replace(upstream.URL, "https://", "wss://", 1) + "/ws-identity"
		firstCtx, firstCancel := context.WithCancel(context.Background())
		defer firstCancel()
		first, _, err := DialCodexWebSocket(firstCtx, target, http.Header{"Authorization": {"Bearer first"}, "Chatgpt-Account-Id": {"account-first"}}, options)
		require.NoError(t, err)
		defer first.Close()
		second, _, err := DialCodexWebSocket(context.Background(), target, http.Header{"Authorization": {"Bearer second"}, "Chatgpt-Account-Id": {"account-second"}}, options)
		require.NoError(t, err)
		defer second.Close()
		for _, item := range []struct {
			conn *websocket.Conn
			want string
		}{{first, "Bearer first/account-first"}, {second, "Bearer second/account-second"}} {
			require.NoError(t, item.conn.SetReadDeadline(time.Now().Add(5*time.Second)))
			_, data, err := item.conn.ReadMessage()
			require.NoError(t, err)
			assert.Equal(t, item.want, string(data))
		}
		firstCancel()
		_, _, err = first.ReadMessage()
		require.Error(t, err)
		require.NoError(t, second.WriteMessage(websocket.TextMessage, []byte("still-alive")))
		_, data, err := second.ReadMessage()
		require.NoError(t, err)
		assert.Equal(t, "still-alive", string(data))
		assert.Equal(t, 2, count("/ws-identity"))
	})
	t.Run("websocket_rejection_body_and_single_attempt", func(t *testing.T) {
		target := strings.Replace(upstream.URL, "https://", "wss://", 1) + "/ws-reject"
		conn, response, err := DialCodexWebSocket(context.Background(), target, nil, options)
		require.Nil(t, conn)
		require.ErrorIs(t, err, websocket.ErrBadHandshake)
		require.NotNil(t, response)
		defer response.Body.Close()
		assert.Equal(t, http.StatusUnauthorized, response.StatusCode)
		data, err := io.ReadAll(response.Body)
		require.NoError(t, err)
		assert.JSONEq(t, `{"error":{"message":"synthetic denied","type":"invalid_request_error","code":"synthetic_denied"}}`, string(data))
		assert.Equal(t, 1, count("/ws-reject"))
	})
	t.Run("configured_limit_before_dial", func(t *testing.T) {
		req, err := http.NewRequest("POST", upstream.URL+"/oversized", strings.NewReader("x"))
		require.NoError(t, err)
		req.ContentLength = state.requestBytes + 1
		_, err = client.Do(req)
		var typed *CodexTransportError
		require.ErrorAs(t, err, &typed)
		assert.False(t, typed.MayHaveSent)
		assert.Zero(t, count("/oversized"))
	})
	t.Run("certificate_name_verified", func(t *testing.T) {
		target, err := url.Parse(upstream.URL)
		require.NoError(t, err)
		target.Host = net.JoinHostPort("localhost", target.Port())
		target.Path = "/wrong-name"
		_, err = client.Get(target.String())
		var typed *CodexTransportError
		require.ErrorAs(t, err, &typed)
		assert.Equal(t, "tls", typed.Code)
		assert.False(t, typed.MayHaveSent)
		assert.Zero(t, count("/wrong-name"))
	})
	t.Run("capability_failure_no_upstream", func(t *testing.T) {
		saved := common.CodexTransportProfile
		common.CodexTransportProfile = "unsupported"
		defer func() { common.CodexTransportProfile = saved }()
		_, err := newCodexTransportSnapshot(context.Background())
		var typed *CodexTransportError
		require.ErrorAs(t, err, &typed)
		assert.False(t, typed.MayHaveSent)
		if !slices.Contains(state.health.Routes, "ws") {
			_, _, err = DialCodexWebSocket(context.Background(), strings.Replace(upstream.URL, "https://", "wss://", 1)+"/unavailable-ws", nil, options)
			require.ErrorAs(t, err, &typed)
			assert.False(t, typed.MayHaveSent)
			assert.Zero(t, count("/unavailable-ws"))
		}
	})
}

func TestCodexTransportContentLengthDuplicates(t *testing.T) {
	state := codexTestState(t, func(http.ResponseWriter, *http.Request) { t.Error("metadata validation does not issue requests") }, nil)
	for _, tc := range []struct {
		name    string
		headers http.Header
		valid   bool
	}{
		{"single", http.Header{"Content-Length": []string{"3"}}, true},
		{"same_duplicates", http.Header{"Content-Length": []string{"3", "3"}}, true},
		{"same_case_variants", http.Header{"Content-Length": []string{"3"}, "content-length": []string{"3"}}, true},
		{"conflicting_second", http.Header{"Content-Length": []string{"3", "4"}}, false},
		{"conflicting_case_variant", http.Header{"Content-Length": []string{"3"}, "content-length": []string{"4"}}, false},
		{"invalid_second", http.Header{"Content-Length": []string{"3", "invalid"}}, false},
		{"empty_second", http.Header{"Content-Length": []string{"3", ""}}, false},
		{"signed_value", http.Header{"Content-Length": []string{"+3"}}, false},
		{"comma_joined", http.Header{"Content-Length": []string{"3, 3"}}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequest("POST", "https://target.invalid/", strings.NewReader("abc"))
			require.NoError(t, err)
			req.Header = tc.headers
			metadata, err := state.metadata(req, CodexTransportOptions{Purpose: CodexTransportAPI}, false)
			if tc.valid {
				require.NoError(t, err)
				require.NotNil(t, metadata.ContentLength)
				assert.Equal(t, int64(3), *metadata.ContentLength)
				assert.Empty(t, metadata.Headers)
			} else {
				var typed *CodexTransportError
				require.ErrorAs(t, err, &typed)
				assert.False(t, typed.MayHaveSent)
				assert.Equal(t, "invalid_metadata", typed.Code)
			}
		})
	}
}

func TestCodexTransportManagementClients(t *testing.T) {
	type observedRequest struct {
		Meta codexRequestMetadata
		Body string
	}
	observed := make(chan observedRequest, 8)
	codexTestState(t, func(w http.ResponseWriter, r *http.Request) {
		var meta codexRequestMetadata
		encoded, err := base64.StdEncoding.DecodeString(r.Header.Get(codexMetaHeader))
		if err != nil || common.StrictUnmarshal(encoded, &meta) != nil {
			w.WriteHeader(500)
			return
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			w.WriteHeader(500)
			return
		}
		observed <- observedRequest{meta, string(body)}
		response := `{"ok":true}`
		if meta.Purpose == CodexTransportAuth {
			response = `{"access_token":"synthetic-access","refresh_token":"synthetic-refresh","expires_in":3600}`
		}
		if strings.Contains(meta.URL, "/models?") {
			response = `{"models":[{"slug":"synthetic-model"}]}`
		}
		length := int64(len(response))
		w.Header().Set(codexResponseHeader, codexTestEnvelope(t, codexTestResponse(200, &length)))
		w.Header().Set("Trailer", codexCompleteTrailer)
		_, _ = io.WriteString(w, response)
		w.Header().Set(codexCompleteTrailer, "1")
	}, nil)
	ctx := context.Background()
	_, err := ExchangeCodexAuthorizationCodeWithProxy(ctx, "synthetic-code", "synthetic-verifier", "")
	require.NoError(t, err)
	exchange := <-observed
	assert.Equal(t, CodexTransportAuth, exchange.Meta.Purpose)
	assert.Equal(t, codexOAuthTokenURL, exchange.Meta.URL)
	form, err := url.ParseQuery(exchange.Body)
	require.NoError(t, err)
	assert.Equal(t, "synthetic-code", form.Get("code"))
	assert.Equal(t, "synthetic-verifier", form.Get("code_verifier"))
	_, err = RefreshCodexOAuthTokenWithProxy(ctx, "synthetic-refresh", "")
	require.NoError(t, err)
	refresh := <-observed
	assert.Equal(t, CodexTransportAuth, refresh.Meta.Purpose)
	assert.Equal(t, codexOAuthTokenURL, refresh.Meta.URL)
	assert.Contains(t, refresh.Body, "grant_type=refresh_token")
	base := "https://synthetic.invalid"
	channel := &model.Channel{Type: constant.ChannelTypeCodex, BaseURL: &base, Key: `{"access_token":"synthetic-access","account_id":"synthetic-account"}`}
	models, err := FetchCodexChannelModels(channel)
	require.NoError(t, err)
	assert.Equal(t, []string{"synthetic-model"}, models)
	modelRequest := <-observed
	assert.Equal(t, CodexTransportAPI, modelRequest.Meta.Purpose)
	assert.Equal(t, base+"/backend-api/codex/models?client_version=0.162.1", modelRequest.Meta.URL)
	client, err := GetCodexHTTPClient(CodexTransportOptions{Purpose: CodexTransportAPI})
	require.NoError(t, err)
	status, _, err := FetchCodexWhamUsage(ctx, client, base, "synthetic-access", "synthetic-account")
	require.NoError(t, err)
	assert.Equal(t, 200, status)
	assert.Equal(t, base+"/backend-api/wham/usage", (<-observed).Meta.URL)
	_, _, err = FetchCodexWhamRateLimitResetCredits(ctx, client, base, "synthetic-access", "synthetic-account")
	require.NoError(t, err)
	assert.Equal(t, base+"/backend-api/wham/rate-limit-reset-credits", (<-observed).Meta.URL)
	for range 2 {
		_, _, err = ConsumeCodexWhamRateLimitResetCreditWithID(ctx, client, base, "synthetic-access", "synthetic-account", "stable-operation")
		require.NoError(t, err)
		consume := <-observed
		assert.Equal(t, http.MethodPost, consume.Meta.Method)
		assert.JSONEq(t, `{"redeem_request_id":"stable-operation"}`, consume.Body)
	}
}

func TestCodexTransportManagementErrorsAreSafe(t *testing.T) {
	oldState, oldEnabled := codexTransportState.Load(), common.CodexTransportEnabled
	codexTransportState.Store(nil)
	common.CodexTransportEnabled = false
	t.Cleanup(func() { codexTransportState.Store(oldState); common.CodexTransportEnabled = oldEnabled })
	for _, status := range []int{301, 302, 303, 307, 308, 503} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				w.Header().Set("Location", "/second?token=synthetic-secret")
				w.WriteHeader(status)
				_, _ = io.WriteString(w, `{}`)
			}))
			defer server.Close()
			client, err := GetCodexHTTPClient(CodexTransportOptions{Purpose: CodexTransportAuth})
			require.NoError(t, err)
			_, err = exchangeCodexAuthorizationCode(context.Background(), client, server.URL, "test", "code", "verifier", "https://callback.invalid")
			require.Error(t, err)
			assert.NotContains(t, err.Error(), "synthetic-secret")
			assert.Equal(t, int32(1), calls.Load())
		})
	}
	typed := &CodexTransportError{Code: "upstream_io", Phase: "maybe_sent", MayHaveSent: true}
	wrapped := &url.Error{Op: "Post", URL: "https://example.invalid/?secret=sentinel", Err: typed}
	assert.Same(t, typed, SafeCodexHTTPError(wrapped))
	assert.NotContains(t, SafeCodexHTTPError(wrapped).Error(), "sentinel")
}

func TestCodexTransportOAuthRejectsIncompleteResponse(t *testing.T) {
	var calls atomic.Int32
	codexTestState(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_, _ = io.Copy(io.Discard, r.Body)
		body := `{"access_token":"synthetic-access","refresh_token":"synthetic-refresh","expires_in":3600}`
		length := int64(len(body))
		w.Header().Set(codexResponseHeader, codexTestEnvelope(t, codexTestResponse(200, &length)))
		w.Header().Set("Trailer", codexCompleteTrailer)
		_, _ = io.WriteString(w, body)
		// Valid JSON without a successful transport completion is not a credential.
	}, nil)
	_, err := ExchangeCodexAuthorizationCodeWithProxy(context.Background(), "synthetic-code", "synthetic-verifier", "")
	require.Error(t, err)
	var transportErr *CodexTransportError
	require.ErrorAs(t, err, &transportErr)
	_, err = RefreshCodexOAuthTokenWithProxy(context.Background(), "synthetic-refresh", "")
	require.ErrorAs(t, err, &transportErr)
	assert.Equal(t, int32(2), calls.Load())
}

func TestCodexTransportDisabledAuthRejectsInsecure(t *testing.T) {
	oldState, oldEnabled, oldInsecure, oldClient := codexTransportState.Load(), common.CodexTransportEnabled, common.TLSInsecureSkipVerify, httpClient
	t.Cleanup(func() {
		codexTransportState.Store(oldState)
		common.CodexTransportEnabled = oldEnabled
		common.TLSInsecureSkipVerify = oldInsecure
		httpClient = oldClient
	})
	codexTransportState.Store(nil)
	common.CodexTransportEnabled = false
	var dials atomic.Int32
	for _, tc := range []struct {
		name              string
		global, effective bool
	}{{"global", true, false}, {"effective transport", false, true}} {
		t.Run(tc.name, func(t *testing.T) {
			common.TLSInsecureSkipVerify = tc.global
			httpClient = &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: tc.effective}, DialContext: func(context.Context, string, string) (net.Conn, error) {
				dials.Add(1)
				return nil, fmt.Errorf("unexpected dial")
			}}}
			_, err := RefreshCodexOAuthTokenWithProxy(context.Background(), "synthetic-refresh", "")
			var transportErr *CodexTransportError
			require.ErrorAs(t, err, &transportErr)
			assert.False(t, transportErr.MayHaveSent)
			_, err = ExchangeCodexAuthorizationCodeWithProxy(context.Background(), "synthetic-code", "synthetic-verifier", "")
			require.ErrorAs(t, err, &transportErr)
			assert.Zero(t, dials.Load())
			legacy, err := getCodexOAuthHTTPClient("")
			require.NoError(t, err)
			assert.Same(t, httpClient.Transport, legacy.Transport)
		})
	}
}
