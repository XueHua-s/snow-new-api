package service

import (
	"context"
	"crypto/x509"
	"encoding/base64"
	"io"
	"math"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"

	"golang.org/x/net/http/httpproxy"
)

type CodexTransportPurpose string

const (
	CodexTransportAPI     CodexTransportPurpose = "api"
	CodexTransportAuth    CodexTransportPurpose = "auth"
	codexTransportProfile                       = "0.162.1"
	codexMetaHeader                             = "X-Codex-Transport-Meta"
	codexResponseHeader                         = "X-Codex-Transport-Response"
	codexErrorHeader                            = "X-Codex-Transport-Error"
	codexCompleteTrailer                        = "X-Codex-Transport-Complete"
)

type CodexTransportOptions struct {
	ProxyURL string
	Settings dto.ChannelSettings
	Purpose  CodexTransportPurpose
}

// CodexTransportError deliberately retains no URL, credentials or underlying error text.
// Callers must use errors.As through http.Client's url.Error before reporting it.
// Every transport error forbids automatic business replay, including pre-send errors.
type CodexTransportError struct {
	Code           string `json:"code"`
	Phase          string `json:"phase"`
	MayHaveSent    bool   `json:"may_have_sent"`
	UpstreamStatus *int   `json:"upstream_status"`
}

func (e *CodexTransportError) Error() string {
	return "codex transport: " + e.Code + " (" + e.Phase + ")"
}

func (e *CodexTransportError) Timeout() bool { return e.Code == "timeout" }

func (e *CodexTransportError) Temporary() bool { return false }

func codexTransportFailure(code, phase string, sent bool) *CodexTransportError {
	return &CodexTransportError{Code: code, Phase: phase, MayHaveSent: sent}
}

type codexTransportHealth struct {
	Version       int                            `json:"version"`
	Profile       string                         `json:"profile"`
	Platform      string                         `json:"platform"`
	Target        string                         `json:"target"`
	Production    bool                           `json:"production"`
	Purposes      []string                       `json:"purposes"`
	Routes        []string                       `json:"routes"`
	ProxySchemes  []string                       `json:"proxy_schemes"`
	HTTPProtocols []string                       `json:"http_protocols"`
	TLSInsecure   bool                           `json:"tls_insecure"`
	Limits        map[string]codexTransportLimit `json:"limits"`
}

type codexTransportLimit struct {
	Min int64 `json:"min"`
	Max int64 `json:"max"`
}

type codexTransportSnapshot struct {
	enabled      bool
	generation   uint64
	socket       string
	profile      string
	ca           *string
	insecure     bool
	totalMS      int64
	headerMS     int64
	idleMS       int64
	maxIdle      int
	maxIdleHost  int
	requestBytes int64
	wsBytes      int64
	proxy        func(*url.URL) (*url.URL, error)
	local        *http.Transport
	health       codexTransportHealth
}

var codexTransportState atomic.Pointer[codexTransportSnapshot]

var codexTransportInitOnce sync.Once

var codexTransportInitError error

// InitCodexTransport runs once after common.InitEnv and before serving requests.
// Failed activation is fatal to the caller; it never installs a direct fallback.
func InitCodexTransport() error {
	codexTransportInitOnce.Do(func() {
		state, err := newCodexTransportSnapshot(context.Background())
		codexTransportInitError = err
		if err == nil {
			codexTransportState.Store(state)
		}
	})
	return codexTransportInitError
}

func CodexTransportGeneration() uint64 {
	if s := codexTransportState.Load(); s != nil {
		return s.generation
	}
	return 0
}

func CodexTransportEnabled() bool {
	if s := codexTransportState.Load(); s != nil {
		return s.enabled
	}
	return common.CodexTransportEnabled
}

func newCodexTransportSnapshot(ctx context.Context) (*codexTransportSnapshot, error) {
	s := &codexTransportSnapshot{enabled: common.CodexTransportEnabled, generation: 1}
	if !s.enabled {
		return s, nil
	}
	fail := codexTransportFailure("unsupported_policy", "local_connect", false)
	if common.CodexTransportProfile != codexTransportProfile {
		return nil, fail
	}
	s.profile = common.CodexTransportProfile
	s.socket = common.CodexTransportSocket
	if err := validateCodexSocket(s.socket); err != nil {
		return nil, err
	}
	base := newRelayHTTPTransport()
	s.insecure = common.TLSInsecureSkipVerify || (base.TLSClientConfig != nil && base.TLSClientConfig.InsecureSkipVerify)
	if s.insecure || common.RelayTimeout < 0 || int64(common.RelayTimeout) > math.MaxInt64/int64(time.Second) || common.RelayIdleConnTimeout <= 0 || int64(common.RelayIdleConnTimeout) > math.MaxInt64/int64(time.Second) {
		return nil, fail
	}
	s.totalMS = int64(common.RelayTimeout) * 1000
	s.headerMS = base.ResponseHeaderTimeout.Milliseconds()
	s.idleMS = int64(common.RelayIdleConnTimeout) * 1000
	s.maxIdle = common.RelayMaxIdleConns
	s.maxIdleHost = common.RelayMaxIdleConnsPerHost
	if s.maxIdleHost <= 0 {
		s.maxIdleHost = http.DefaultMaxIdleConnsPerHost
	}
	if s.headerMS < 0 || s.maxIdle < 1 || s.maxIdle > 8192 || s.maxIdleHost > 8192 || constant.MaxRequestBodyMB <= 0 || int64(constant.MaxRequestBodyMB) > 2147483647/1048576 {
		return nil, fail
	}
	s.requestBytes = int64(constant.MaxRequestBodyMB) * 1048576
	s.wsBytes = s.requestBytes
	// A configured request limit above the WS protocol cap is unsupported, not clamped.
	if s.wsBytes > 134217728 {
		return nil, fail
	}
	if common.CodexTransportCAFile != "" {
		f, err := os.Open(common.CodexTransportCAFile)
		if err != nil {
			return nil, fail
		}
		data, err := io.ReadAll(io.LimitReader(f, 32769))
		_ = f.Close()
		if err != nil || len(data) == 0 || len(data) > 32768 || !x509.NewCertPool().AppendCertsFromPEM(data) {
			return nil, fail
		}
		encoded := base64.StdEncoding.EncodeToString(data)
		s.ca = &encoded
	}
	s.proxy = httpproxy.FromEnvironment().ProxyFunc()
	s.local = &http.Transport{
		Proxy: nil, DisableCompression: true, DisableKeepAlives: true,
		MaxResponseHeaderBytes: 262144,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			if err := validateCodexSocket(s.socket); err != nil {
				return nil, err
			}
			conn, err := (&net.Dialer{Timeout: 30 * time.Second}).DialContext(ctx, "unix", s.socket)
			if err != nil {
				return nil, codexTransportFailure("connect", "local_connect", false)
			}
			return conn, nil
		},
	}
	healthCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(healthCtx, http.MethodGet, "http://codex-transport/v1/health", nil)
	resp, err := s.local.RoundTrip(req)
	if err != nil {
		return nil, codexTransportFailure("connect", "local_connect", false)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 65537))
	if err != nil || resp.StatusCode != http.StatusOK || len(data) > 65536 || decodeCodexJSON(data, &s.health, "health") != nil {
		return nil, fail
	}
	h := s.health
	if len(h.Limits) != len(codexProtocolLimits) {
		return nil, fail
	}
	for key, expected := range codexProtocolLimits {
		if actual, ok := h.Limits[key]; !ok || actual != expected {
			return nil, fail
		}
	}
	if h.Version != 1 || h.Profile != s.profile || h.Platform != "linux-arm64" || h.Target != "aarch64-unknown-linux-gnu" || !h.Production || h.TLSInsecure || !slices.Contains(h.Routes, "http") || !slices.Contains(h.Purposes, "api") || !slices.Contains(h.Purposes, "auth") {
		return nil, fail
	}
	for _, v := range []string{"http", "https", "socks5", "socks5h"} {
		if !slices.Contains(h.ProxySchemes, v) {
			return nil, fail
		}
	}
	for _, v := range []string{"auto", "http1"} {
		if !slices.Contains(h.HTTPProtocols, v) {
			return nil, fail
		}
	}
	// Validate configured policy against advertised bounds before activation.
	values := map[string]int64{"shards": 8, "connect_timeout_ms": 30000, "header_timeout_ms": max(s.headerMS, 45000), "total_timeout_ms": max(s.totalMS, 20000), "idle_timeout_ms": s.idleMS, "max_idle_connections": int64(s.maxIdle), "max_idle_per_host": int64(s.maxIdleHost), "max_request_bytes": s.requestBytes, "max_ws_message_bytes": s.wsBytes, "request_metadata_encoded_bytes": 131072, "response_metadata_encoded_bytes": 131072, "local_http_header_bytes": 262144}
	for key, value := range values {
		limit, ok := h.Limits[key]
		if !ok || value < limit.Min || value > limit.Max {
			return nil, fail
		}
	}
	return s, nil
}

// The service consumes an existing socket; only the Rust listener owns creation/removal.
func validateCodexSocket(path string) error {
	fail := codexTransportFailure("unsupported_policy", "local_connect", false)
	if !filepath.IsAbs(path) || filepath.Clean(path) != path {
		return fail
	}
	parent, err := os.Lstat(filepath.Dir(path))
	if err != nil || !parent.IsDir() || parent.Mode()&os.ModeSymlink != 0 {
		return fail
	}
	socket, err := os.Lstat(path)
	if err != nil || socket.Mode()&os.ModeSocket == 0 || socket.Mode()&os.ModeSymlink != 0 {
		return fail
	}
	// Reject intermediate symlinks too; relative /tmp paths on macOS must use /private/tmp.
	resolved, err := filepath.EvalSymlinks(filepath.Dir(path))
	if err != nil || resolved != filepath.Dir(path) {
		return fail
	}
	groups, _ := os.Getgroups()
	for _, fi := range []os.FileInfo{parent, socket} {
		stat, ok := fi.Sys().(*syscall.Stat_t)
		if !ok {
			return fail
		}
		mode := fi.Mode().Perm()
		sameUID := int(stat.Uid) == os.Geteuid()
		sharedGID := int(stat.Gid) == os.Getegid() || slices.Contains(groups, int(stat.Gid))
		if !sameUID {
			return fail
		}
		allowed := os.FileMode(0600)
		if fi.IsDir() {
			allowed = 0700
		}
		shared := os.FileMode(0660)
		if fi.IsDir() {
			shared = 0750
		}
		if mode != allowed && mode != shared {
			return fail
		}
		if mode == allowed && !sameUID {
			return fail
		}
		if mode == shared && !sharedGID {
			return fail
		}
	}
	return nil
}
