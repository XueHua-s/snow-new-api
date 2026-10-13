package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gorilla/websocket"
	"golang.org/x/net/http/httpguts"
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
func (e *CodexTransportError) Timeout() bool   { return e.Code == "timeout" }
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

func GetCodexHTTPClient(options CodexTransportOptions) (*http.Client, error) {
	if options.Purpose != CodexTransportAPI && options.Purpose != CodexTransportAuth {
		return nil, codexTransportFailure("invalid_metadata", "local_connect", false)
	}
	s := codexTransportState.Load()
	if s == nil {
		if common.CodexTransportEnabled {
			return nil, codexTransportFailure("unsupported_policy", "local_connect", false)
		}
	} else if s.enabled {
		return &http.Client{Transport: &codexRoundTripper{state: s, options: options}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, nil
	}
	if options.Purpose == CodexTransportAuth {
		if common.TLSInsecureSkipVerify {
			return nil, codexTransportFailure("unsupported_policy", "local_connect", false)
		}
		client, err := getCodexOAuthHTTPClient(options.ProxyURL)
		if err != nil {
			return nil, err
		}
		transport := client.Transport
		if transport == nil {
			transport = http.DefaultTransport
		}
		effective, ok := transport.(*http.Transport)
		if !ok || (effective.TLSClientConfig != nil && effective.TLSClientConfig.InsecureSkipVerify) {
			return nil, codexTransportFailure("unsupported_policy", "local_connect", false)
		}
		client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
		return client, nil
	}
	return GetHttpClientWithProxySettings(options.ProxyURL, options.Settings)
}

type codexRequestMetadata struct {
	Version            int                   `json:"version"`
	RequestID          string                `json:"request_id"`
	Profile            string                `json:"profile"`
	Purpose            CodexTransportPurpose `json:"purpose"`
	Method             string                `json:"method"`
	URL                string                `json:"url"`
	Headers            [][2]string           `json:"headers"`
	ContentLength      *int64                `json:"content_length"`
	ProxyURL           *string               `json:"proxy_url"`
	HTTPProtocol       string                `json:"http_protocol"`
	Shards             int                   `json:"shards"`
	IdleTimeoutMS      int64                 `json:"idle_timeout_ms"`
	MaxIdleConnections int                   `json:"max_idle_connections"`
	MaxIdlePerHost     int                   `json:"max_idle_per_host"`
	CAPEMB64           *string               `json:"ca_pem_b64"`
	ConnectTimeoutMS   int64                 `json:"connect_timeout_ms"`
	HeaderTimeoutMS    int64                 `json:"header_timeout_ms"`
	TotalTimeoutMS     int64                 `json:"total_timeout_ms"`
	MaxRequestBytes    int64                 `json:"max_request_bytes"`
	MaxWSMessageBytes  int64                 `json:"max_ws_message_bytes"`
}

var codexRequestSequence atomic.Uint64

func (s *codexTransportSnapshot) metadata(req *http.Request, options CodexTransportOptions, ws bool) (codexRequestMetadata, error) {
	m := codexRequestMetadata{}
	fail := codexTransportFailure("target", "local_connect", false)
	if req.URL == nil || req.URL.Hostname() == "" || req.URL.User != nil || req.URL.Fragment != "" || req.URL.Opaque != "" || len(req.URL.String()) > 8192 || !utf8.ValidString(req.URL.String()) {
		return m, fail
	}
	scheme := "https"
	if ws {
		scheme = "wss"
	}
	if req.URL.Scheme != scheme || (req.Host != "" && !strings.EqualFold(req.Host, req.URL.Host)) {
		return m, fail
	}
	if options.Purpose != CodexTransportAPI && options.Purpose != CodexTransportAuth {
		return m, codexTransportFailure("invalid_metadata", "local_connect", false)
	}
	if options.Purpose == CodexTransportAuth && (ws || req.URL.String() != codexOAuthTokenURL) {
		return m, fail
	}
	if !httpguts.ValidHeaderFieldName(req.Method) {
		return m, codexTransportFailure("invalid_metadata", "local_connect", false)
	}
	if ws && (!slices.Contains(s.health.Routes, "ws") || req.Method != http.MethodGet) {
		return m, codexTransportFailure("unsupported_policy", "local_connect", false)
	}
	policy := NormalizeHTTPTransportPolicy(options.Settings)
	headerMS := s.headerMS
	if policy.ResponseHeaderTimeoutSeconds > 0 {
		headerMS = int64(policy.ResponseHeaderTimeoutSeconds) * 1000
	}
	totalMS := s.totalMS
	if options.Purpose == CodexTransportAuth {
		totalMS = 20000
	}
	if ws {
		headerMS = 45000
		totalMS = 0
	}
	var proxyURL *url.URL
	var err error
	if strings.TrimSpace(options.ProxyURL) != "" {
		proxyURL, _, err = common.ParseProxyURLRuntime(options.ProxyURL)
	} else {
		target := *req.URL
		if ws {
			target.Scheme = "https"
		}
		proxyURL, err = s.proxy(&target)
	}
	if err != nil {
		return m, codexTransportFailure("proxy", "local_connect", false)
	}
	var proxyText *string
	if proxyURL != nil {
		if !slices.Contains(s.health.ProxySchemes, proxyURL.Scheme) || len(proxyURL.String()) > 8192 || !utf8.ValidString(proxyURL.String()) {
			return m, codexTransportFailure("unsupported_policy", "local_connect", false)
		}
		value := proxyURL.String()
		proxyText = &value
	}
	for _, host := range req.Header.Values("Host") {
		if !strings.EqualFold(host, req.URL.Host) {
			return m, fail
		}
	}
	headers, err := encodeCodexHeaders(req.Header, ws)
	if err != nil {
		return m, err
	}
	if req.ContentLength < -1 {
		return m, codexTransportFailure("invalid_metadata", "local_connect", false)
	}
	var length *int64
	if (req.Body == nil || req.Body == http.NoBody) && req.ContentLength > 0 {
		return m, codexTransportFailure("invalid_metadata", "local_connect", false)
	}
	if ws || req.Body == nil || req.Body == http.NoBody {
		v := int64(0)
		length = &v
	} else if req.ContentLength > 0 {
		v := req.ContentLength
		length = &v
	}
	if length != nil && *length > s.requestBytes {
		return m, codexTransportFailure("invalid_metadata", "local_connect", false)
	}
	for name, values := range req.Header {
		if !strings.EqualFold(name, "Content-Length") {
			continue
		}
		for _, raw := range values {
			if raw == "" {
				return m, codexTransportFailure("invalid_metadata", "local_connect", false)
			}
			for _, digit := range raw {
				if digit < '0' || digit > '9' {
					return m, codexTransportFailure("invalid_metadata", "local_connect", false)
				}
			}
			value, err := strconv.ParseInt(raw, 10, 64)
			if err != nil || length == nil || value != *length {
				return m, codexTransportFailure("invalid_metadata", "local_connect", false)
			}
		}
	}
	m = codexRequestMetadata{Version: 1, RequestID: strconv.FormatUint(codexRequestSequence.Add(1), 10), Profile: s.profile, Purpose: options.Purpose, Method: req.Method, URL: req.URL.String(), Headers: headers, ContentLength: length, ProxyURL: proxyText, HTTPProtocol: policy.Protocol, Shards: policy.Shards, IdleTimeoutMS: s.idleMS, MaxIdleConnections: s.maxIdle, MaxIdlePerHost: s.maxIdleHost, CAPEMB64: s.ca, ConnectTimeoutMS: 30000, HeaderTimeoutMS: headerMS, TotalTimeoutMS: totalMS, MaxRequestBytes: s.requestBytes, MaxWSMessageBytes: s.wsBytes}
	for key, value := range map[string]int64{"header_timeout_ms": headerMS, "total_timeout_ms": totalMS} {
		r, ok := s.health.Limits[key]
		if !ok || value < r.Min || value > r.Max {
			return codexRequestMetadata{}, codexTransportFailure("unsupported_policy", "local_connect", false)
		}
	}
	return m, nil
}

func codexHopHeaders(headers http.Header, ws bool) map[string]bool {
	excluded := map[string]bool{"connection": true, "keep-alive": true, "proxy-authenticate": true, "proxy-authorization": true, "te": true, "trailer": true, "transfer-encoding": true, "upgrade": true, "content-length": true, "host": true}
	for name, values := range headers {
		if strings.EqualFold(name, "connection") {
			for _, value := range values {
				for token := range strings.SplitSeq(value, ",") {
					excluded[strings.ToLower(strings.TrimSpace(token))] = true
				}
			}
		}
	}
	if ws {
		for _, key := range []string{"sec-websocket-key", "sec-websocket-accept", "sec-websocket-version", "sec-websocket-extensions"} {
			excluded[key] = true
		}
	}
	return excluded
}
func encodeCodexHeaders(headers http.Header, ws bool) ([][2]string, error) {
	result := make([][2]string, 0)
	excluded := codexHopHeaders(headers, ws)
	total := 0
	keys := make([]string, 0, len(headers))
	for name := range headers {
		keys = append(keys, name)
	}
	slices.Sort(keys)
	for _, name := range keys {
		lower := strings.ToLower(name)
		if excluded[lower] || strings.HasPrefix(lower, "x-codex-transport-") {
			continue
		}
		if !httpguts.ValidHeaderFieldName(name) || len(name) > 256 {
			return nil, codexTransportFailure("invalid_metadata", "local_connect", false)
		}
		for _, value := range headers[name] {
			total += len(name) + len(value)
			if !httpguts.ValidHeaderFieldValue(value) || len(value) > 8192 || total > 12288 || len(result) >= 100 {
				return nil, codexTransportFailure("invalid_metadata", "local_connect", false)
			}
			result = append(result, [2]string{lower, base64.StdEncoding.EncodeToString([]byte(value))})
		}
	}
	return result, nil
}
func encodeCodexMetadata(m codexRequestMetadata) (string, error) {
	data, err := common.Marshal(m)
	if err != nil || len(data) > 98304 {
		return "", codexTransportFailure("invalid_metadata", "local_connect", false)
	}
	value := base64.StdEncoding.EncodeToString(data)
	if len(value) > 131072 {
		return "", codexTransportFailure("invalid_metadata", "local_connect", false)
	}
	return value, nil
}

type codexRoundTripper struct {
	state   *codexTransportSnapshot
	options CodexTransportOptions
}

func (t *codexRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	source := req.Body
	if source == nil {
		source = http.NoBody
	}
	upload := &codexUploadBody{source: source}
	defer upload.Close()
	meta, err := t.state.metadata(req, t.options, false)
	if err != nil {
		return nil, err
	}
	encoded, err := encodeCodexMetadata(meta)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(req.Context())
	if meta.TotalTimeoutMS > 0 {
		cancel()
		ctx, cancel = context.WithTimeout(req.Context(), time.Duration(meta.TotalTimeoutMS)*time.Millisecond)
	}
	upload.max = meta.MaxRequestBytes
	// Always an opaque nonempty Body with unknown local length and nil GetBody.
	// POST plus no local idempotency headers and disabled reuse prohibit Go replay.
	local, _ := http.NewRequestWithContext(ctx, http.MethodPost, "http://codex-transport/v1/http", upload)
	local.Header.Set(codexMetaHeader, encoded)
	local.Header.Set("TE", "trailers")
	response, err := t.state.local.RoundTrip(local)
	if err != nil {
		failure := codexLocalFailure(ctx, err)
		cancel()
		return nil, failure
	}
	// An upstream early final response is authoritative. Stop a blocked source
	// as clean local upload EOF so net/http does not tear down the response socket
	// when closing the caller's reader returns a source error.
	upload.interrupted.Store(true)
	upload.Close()
	if response.StatusCode != http.StatusOK {
		defer response.Body.Close()
		cancel()
		if response.StatusCode == http.StatusBadGateway {
			return nil, decodeCodexError(response.Header)
		}
		return nil, codexTransportFailure("upstream_io", "maybe_sent", true)
	}
	if response.ContentLength != -1 || !slices.Equal(response.TransferEncoding, []string{"chunked"}) || len(response.Header.Values(codexErrorHeader)) != 0 {
		cancel()
		response.Body.Close()
		return nil, codexTransportFailure("upstream_io", "headers_received", true)
	}
	decoded, err := decodeCodexResponse(response.Header, req, false)
	if err != nil {
		cancel()
		response.Body.Close()
		return nil, err
	}
	expected := decoded.ContentLength
	if req.Method == http.MethodHead || decoded.StatusCode == 304 {
		expected = 0
	}
	if decoded.StatusCode == 204 {
		if expected > 0 {
			cancel()
			response.Body.Close()
			return nil, codexTransportFailure("upstream_io", "headers_received", true)
		}
		expected = 0
		decoded.ContentLength = 0
	}
	decoded.Body = &codexResponseBody{source: response.Body, local: response, cancel: cancel, expected: expected, status: decoded.StatusCode, ctx: ctx}
	return decoded, nil
}
func codexLocalFailure(ctx context.Context, err error) *CodexTransportError {
	var typed *CodexTransportError
	if errors.As(err, &typed) {
		return typed
	}
	code := "upstream_io"
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		code = "timeout"
	} else if errors.Is(ctx.Err(), context.Canceled) {
		code = "cancelled"
	} else {
		var ne net.Error
		if errors.As(err, &ne) && ne.Timeout() {
			code = "timeout"
		}
	}
	// An IPC write failure cannot prove whether Rust already started the upstream.
	return codexTransportFailure(code, "maybe_sent", true)
}

type codexUploadBody struct {
	source      io.ReadCloser
	max         int64
	count       int64
	closeOnce   sync.Once
	closeError  error
	interrupted atomic.Bool
}

func (b *codexUploadBody) Read(p []byte) (int, error) {
	if b.count > b.max {
		return 0, codexTransportFailure("invalid_metadata", "maybe_sent", true)
	}
	if int64(len(p)) > b.max-b.count+1 {
		p = p[:b.max-b.count+1]
	}
	n, err := b.source.Read(p)
	if b.interrupted.Load() {
		return 0, io.EOF
	}
	b.count += int64(n)
	if b.count > b.max {
		return 0, codexTransportFailure("invalid_metadata", "maybe_sent", true)
	}
	return n, err
}
func (b *codexUploadBody) Close() error {
	b.closeOnce.Do(func() { b.closeError = b.source.Close() })
	return b.closeError
}

type codexResponseMetadata struct {
	Version            int         `json:"version"`
	Status             int         `json:"status"`
	Headers            [][2]string `json:"headers"`
	ContentLength      *int64      `json:"content_length"`
	Protocol           string      `json:"protocol"`
	RejectionBodyB64   *string     `json:"rejection_body_b64,omitempty"`
	RejectionTruncated *bool       `json:"rejection_truncated,omitempty"`
	RejectionReadError *bool       `json:"rejection_read_error,omitempty"`
}

// Wire names are case-sensitive and nullable fields are still mandatory.
func decodeCodexJSON(data []byte, value any, kind string) error {
	var fields map[string]common.RawMessage
	if err := common.StrictUnmarshal(data, &fields); err != nil {
		return err
	}
	var required, optional []string
	switch kind {
	case "health":
		required = []string{"version", "profile", "platform", "target", "production", "purposes", "routes", "proxy_schemes", "http_protocols", "tls_insecure", "limits"}
	case codexResponseHeader:
		required = []string{"version", "status", "headers", "content_length", "protocol"}
		optional = []string{"rejection_body_b64", "rejection_truncated", "rejection_read_error"}
	case codexErrorHeader:
		required = []string{"version", "code", "phase", "may_have_sent", "upstream_status"}
	}
	for _, key := range required {
		if _, ok := fields[key]; !ok {
			return errors.New("missing wire field")
		}
	}
	for key, raw := range fields {
		if !slices.Contains(required, key) && !slices.Contains(optional, key) {
			return errors.New("unknown wire field")
		}
		if string(raw) == "null" && key != "content_length" && key != "upstream_status" {
			return errors.New("null wire field")
		}
	}
	if kind == "health" {
		var limits map[string]map[string]common.RawMessage
		if common.StrictUnmarshal(fields["limits"], &limits) != nil {
			return errors.New("invalid health limits")
		}
		for _, bounds := range limits {
			if len(bounds) != 2 || bounds["min"] == nil || bounds["max"] == nil || string(bounds["min"]) == "null" || string(bounds["max"]) == "null" {
				return errors.New("invalid health limits")
			}
		}
	}
	if raw, ok := fields["headers"]; ok {
		var pairs [][]string
		if common.StrictUnmarshal(raw, &pairs) != nil {
			return errors.New("invalid header pairs")
		}
		for _, pair := range pairs {
			if len(pair) != 2 {
				return errors.New("invalid header pair")
			}
		}
	}
	return common.StrictUnmarshal(data, value)
}

func decodeCodexEnvelope(headers http.Header, name string, maxEncoded, maxDecoded int, v any) error {
	values := headers.Values(name)
	if len(values) != 1 || len(values[0]) > maxEncoded {
		return codexTransportFailure("upstream_io", "maybe_sent", true)
	}
	data, err := base64.StdEncoding.Strict().DecodeString(values[0])
	if err != nil || len(data) > maxDecoded || decodeCodexJSON(data, v, name) != nil {
		return codexTransportFailure("upstream_io", "maybe_sent", true)
	}
	return nil
}
func decodeCodexError(headers http.Header) error {
	var wire struct {
		Version        int    `json:"version"`
		Code           string `json:"code"`
		Phase          string `json:"phase"`
		MayHaveSent    *bool  `json:"may_have_sent"`
		UpstreamStatus *int   `json:"upstream_status"`
	}
	if err := decodeCodexEnvelope(headers, codexErrorHeader, 2048, 1536, &wire); err != nil {
		return err
	}
	if wire.Version != 1 || wire.MayHaveSent == nil || !slices.Contains([]string{"invalid_metadata", "unsupported_policy", "target", "proxy", "connect", "tls", "timeout", "cancelled", "upstream_io", "capacity", "internal"}, wire.Code) || !slices.Contains([]string{"local_connect", "upstream_connect", "maybe_sent", "headers_received", "body_truncated"}, wire.Phase) || (wire.UpstreamStatus != nil && (*wire.UpstreamStatus < 200 || *wire.UpstreamStatus > 599)) {
		return codexTransportFailure("upstream_io", "maybe_sent", true)
	}
	if !*wire.MayHaveSent && slices.Contains([]string{"maybe_sent", "headers_received", "body_truncated"}, wire.Phase) {
		return codexTransportFailure("upstream_io", "maybe_sent", true)
	}
	return &CodexTransportError{Code: wire.Code, Phase: wire.Phase, MayHaveSent: *wire.MayHaveSent, UpstreamStatus: wire.UpstreamStatus}
}
func decodeCodexResponse(headers http.Header, req *http.Request, ws bool) (*http.Response, error) {
	var m codexResponseMetadata
	fail := codexTransportFailure("upstream_io", "maybe_sent", true)
	if err := decodeCodexEnvelope(headers, codexResponseHeader, 131072, 98304, &m); err != nil {
		return nil, err
	}
	if (!ws || m.Status == 101) && (m.RejectionBodyB64 != nil || m.RejectionTruncated != nil || m.RejectionReadError != nil) {
		return nil, fail
	}
	if m.Version != 1 || (m.Status < 200 && !(ws && m.Status == 101)) || m.Status > 599 || (m.ContentLength != nil && *m.ContentLength < 0) || len(m.Headers) > 100 {
		return nil, fail
	}
	major, minor, ok := http.ParseHTTPVersion(m.Protocol)
	if !ok || (m.Protocol != "HTTP/1.0" && m.Protocol != "HTTP/1.1" && m.Protocol != "HTTP/2.0") {
		return nil, fail
	}
	h := make(http.Header)
	total := 0
	for _, pair := range m.Headers {
		name := pair[0]
		if len(pair[1]) > base64.StdEncoding.EncodedLen(8192) {
			return nil, fail
		}
		value, err := base64.StdEncoding.Strict().DecodeString(pair[1])
		total += len(name) + len(value)
		if err != nil || name != strings.ToLower(name) || !httpguts.ValidHeaderFieldName(name) || len(name) > 256 || len(value) > 8192 || total > 12288 || !httpguts.ValidHeaderFieldValue(string(value)) {
			return nil, fail
		}
		h.Add(name, string(value))
	}
	excluded := codexHopHeaders(h, ws)
	for name := range h {
		lower := strings.ToLower(name)
		if excluded[lower] || strings.HasPrefix(lower, "x-codex-transport-") {
			h.Del(name)
		}
	}
	length := int64(-1)
	if m.ContentLength != nil {
		length = *m.ContentLength
	}
	resp := &http.Response{StatusCode: m.Status, Status: fmt.Sprintf("%d %s", m.Status, http.StatusText(m.Status)), Proto: m.Protocol, ProtoMajor: major, ProtoMinor: minor, Header: h, ContentLength: length, Request: req}
	if ws && m.Status != 101 {
		if m.RejectionBodyB64 == nil || m.RejectionTruncated == nil || m.RejectionReadError == nil {
			return nil, fail
		}
		if len(*m.RejectionBodyB64) > base64.StdEncoding.EncodedLen(1024) {
			return nil, fail
		}
		body, err := base64.StdEncoding.Strict().DecodeString(*m.RejectionBodyB64)
		if err != nil || len(body) > 1024 {
			return nil, fail
		}
		resp.Body = io.NopCloser(bytes.NewReader(body))
		resp.ContentLength = -1
	}
	return resp, nil
}

type codexResponseBody struct {
	source    io.ReadCloser
	local     *http.Response
	cancel    context.CancelFunc
	expected  int64
	count     int64
	status    int
	ctx       context.Context
	terminal  error
	closeOnce sync.Once
}

func (b *codexResponseBody) Read(p []byte) (int, error) {
	if b.terminal != nil {
		return 0, b.terminal
	}
	n, err := b.source.Read(p)
	b.count += int64(n)
	if b.expected >= 0 && b.count > b.expected {
		err = io.ErrUnexpectedEOF
	}
	if err == io.EOF && (len(b.local.Trailer.Values(codexCompleteTrailer)) != 1 || b.local.Trailer.Get(codexCompleteTrailer) != "1" || (b.expected >= 0 && b.count != b.expected)) {
		err = io.ErrUnexpectedEOF
	}
	if err != nil {
		if err != io.EOF {
			e := codexTransportFailure("upstream_io", "body_truncated", true)
			if b.ctx.Err() != nil {
				e = codexLocalFailure(b.ctx, err)
				e.Phase = "body_truncated"
			}
			e.UpstreamStatus = &b.status
			err = e
		}
		b.terminal = err
		b.Close()
	}
	return n, err
}
func (b *codexResponseBody) Close() error {
	var err error
	b.closeOnce.Do(func() { b.cancel(); err = b.source.Close() })
	return err
}

type CodexWSHandshakeError struct {
	Truncated bool
	ReadError bool
}

func (e *CodexWSHandshakeError) Error() string {
	return "codex transport: websocket handshake rejected"
}
func (e *CodexWSHandshakeError) Unwrap() error { return websocket.ErrBadHandshake }

// CodexWebSocketPolicyBinding identifies the resolved physical policy without
// retaining plaintext proxy credentials or trust material in the session.
func CodexWebSocketPolicyBinding(targetURL string, options CodexTransportOptions) ([32]byte, error) {
	req, err := http.NewRequest(http.MethodGet, targetURL, nil)
	if err != nil {
		return [32]byte{}, codexTransportFailure("target", "local_connect", false)
	}
	s := codexTransportState.Load()
	if s == nil || !s.enabled {
		return [32]byte{}, nil
	}
	metadata, err := s.metadata(req, options, true)
	if err != nil {
		return [32]byte{}, err
	}
	metadata.RequestID = ""
	data, err := common.Marshal(metadata)
	if err != nil {
		return [32]byte{}, err
	}
	return sha256.Sum256(data), nil
}

func DialCodexWebSocket(ctx context.Context, targetURL string, headers http.Header, options CodexTransportOptions) (*websocket.Conn, *http.Response, error) {
	s := codexTransportState.Load()
	if s == nil || !s.enabled {
		if common.CodexTransportEnabled && s == nil {
			return nil, nil, codexTransportFailure("unsupported_policy", "local_connect", false)
		}
		dialer := *websocket.DefaultDialer
		if options.ProxyURL != "" {
			proxyURL, _, err := common.ParseProxyURLRuntime(options.ProxyURL)
			if err != nil {
				return nil, nil, err
			}
			dialer.Proxy = http.ProxyURL(proxyURL)
		}
		return dialer.DialContext(ctx, targetURL, headers)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, nil, codexTransportFailure("target", "local_connect", false)
	}
	req.Header = headers.Clone()
	meta, err := s.metadata(req, options, true)
	if err != nil {
		return nil, nil, err
	}
	encoded, err := encodeCodexMetadata(meta)
	if err != nil {
		return nil, nil, err
	}
	dialer := websocket.Dialer{HandshakeTimeout: 45 * time.Second, EnableCompression: true}
	var localConn *codexWebSocketNetConn
	dialer.NetDialContext = func(dialCtx context.Context, network, address string) (net.Conn, error) {
		raw, err := s.local.DialContext(dialCtx, network, address)
		if err != nil {
			return nil, err
		}
		wrapped := &codexWebSocketNetConn{Conn: raw}
		localConn = wrapped
		wrapped.stop = context.AfterFunc(ctx, func() { _ = raw.Close() })
		return wrapped, nil
	}
	// Gorilla owns the local subprotocol handshake; metadata independently carries offers upstream.
	dialer.Subprotocols = websocket.Subprotocols(req)
	localHeaders := http.Header{codexMetaHeader: []string{encoded}}
	conn, response, err := dialer.DialContext(ctx, "ws://codex-transport/v1/ws", localHeaders)
	if localConn != nil {
		localConn.handshakeDone = true
	}
	if response == nil {
		return nil, nil, codexLocalFailure(ctx, err)
	}
	if err != nil {
		if response.Body != nil {
			response.Body.Close()
		}
		if response.StatusCode == 502 {
			return nil, nil, decodeCodexError(response.Header)
		}
		if response.StatusCode != 200 {
			return nil, nil, codexTransportFailure("upstream_io", "maybe_sent", true)
		}
		restored, e := decodeCodexResponse(response.Header, req, true)
		if e != nil {
			return nil, nil, e
		}
		if restored.StatusCode == 101 {
			restored.Body = http.NoBody
			return nil, nil, codexTransportFailure("upstream_io", "maybe_sent", true)
		}
		var m codexResponseMetadata
		_ = decodeCodexEnvelope(response.Header, codexResponseHeader, 131072, 98304, &m)
		return nil, restored, &CodexWSHandshakeError{Truncated: *m.RejectionTruncated, ReadError: *m.RejectionReadError}
	}
	restored, e := decodeCodexResponse(response.Header, req, true)
	if e != nil || restored.StatusCode != 101 {
		conn.Close()
		return nil, nil, codexTransportFailure("upstream_io", "headers_received", true)
	}
	if negotiated := conn.Subprotocol(); negotiated != restored.Header.Get("Sec-WebSocket-Protocol") || (negotiated != "" && !slices.Contains(dialer.Subprotocols, negotiated)) {
		conn.Close()
		return nil, nil, codexTransportFailure("upstream_io", "headers_received", true)
	}
	conn.SetReadLimit(meta.MaxWSMessageBytes)
	// The underlying connection keeps lifetime cancellation attached and removes
	// its callback on Close, including background contexts and failed handshakes.
	return conn, restored, nil
}

// Close releases the context callback as well as the socket without a waiter goroutine.
type codexWebSocketNetConn struct {
	net.Conn
	stop           func() bool
	handshakeBytes int
	handshakeDone  bool
}

func (c *codexWebSocketNetConn) Close() error {
	if c.stop != nil {
		c.stop()
	}
	return c.Conn.Close()
}

var codexProtocolLimits = map[string]codexTransportLimit{
	"target_url_bytes":                       {Min: 1, Max: 8192},
	"proxy_url_bytes":                        {Min: 1, Max: 8192},
	"request_id_bytes":                       {Min: 1, Max: 64},
	"header_pairs":                           {Min: 0, Max: 100},
	"header_name_bytes":                      {Min: 1, Max: 256},
	"header_value_bytes":                     {Min: 0, Max: 8192},
	"header_aggregate_bytes":                 {Min: 0, Max: 12288},
	"shards":                                 {Min: 1, Max: 8},
	"connect_timeout_ms":                     {Min: 1, Max: 300000},
	"header_timeout_ms":                      {Min: 0, Max: 9223372036854},
	"total_timeout_ms":                       {Min: 0, Max: 9223372036854},
	"channel_header_override_ms":             {Min: 0, Max: 3600000},
	"max_request_bytes":                      {Min: 1, Max: 2147483647},
	"max_ws_message_bytes":                   {Min: 1, Max: 134217728},
	"read_buffer_bytes":                      {Min: 1, Max: 65536},
	"ws_pending_messages_per_direction":      {Min: 0, Max: 1},
	"ws_pending_control_frames":              {Min: 0, Max: 1},
	"active_exchanges":                       {Min: 0, Max: 256},
	"idle_policy_pools":                      {Min: 0, Max: 128},
	"close_timeout_seconds":                  {Min: 0, Max: 5},
	"close_reason_bytes":                     {Min: 0, Max: 123},
	"upstream_status":                        {Min: 200, Max: 599},
	"request_metadata_encoded_bytes":         {Min: 1, Max: 131072},
	"request_metadata_decoded_bytes":         {Min: 1, Max: 98304},
	"response_metadata_encoded_bytes":        {Min: 1, Max: 131072},
	"response_metadata_decoded_bytes":        {Min: 1, Max: 98304},
	"error_metadata_encoded_bytes":           {Min: 1, Max: 2048},
	"error_metadata_decoded_bytes":           {Min: 1, Max: 1536},
	"local_http_header_bytes":                {Min: 1, Max: 262144},
	"ca_pem_bytes":                           {Min: 0, Max: 32768},
	"ws_rejection_capture_bytes":             {Min: 0, Max: 1024},
	"ws_queue_payload_bytes_per_direction":   {Min: 0, Max: 134217728},
	"ws_control_payload_bytes":               {Min: 0, Max: 125},
	"ws_reserved_payload_bytes":              {Min: 0, Max: 536870912},
	"idle_timeout_ms":                        {Min: 1, Max: 9223372036854},
	"max_idle_connections":                   {Min: 1, Max: 8192},
	"max_idle_per_host":                      {Min: 1, Max: 8192},
	"http_pending_chunks_per_direction":      {Min: 0, Max: 1},
	"http_queue_payload_bytes_per_direction": {Min: 0, Max: 65536},
	"ws_rejection_capture_timeout_ms":        {Min: 1, Max: 1000},
}

func (c *codexWebSocketNetConn) Read(p []byte) (int, error) {
	if c.handshakeDone {
		return c.Conn.Read(p)
	}
	remaining := 262144 - c.handshakeBytes
	if remaining <= 0 {
		return 0, codexTransportFailure("upstream_io", "maybe_sent", true)
	}
	if len(p) > remaining {
		p = p[:remaining]
	}
	n, err := c.Conn.Read(p)
	c.handshakeBytes += n
	return n, err
}
