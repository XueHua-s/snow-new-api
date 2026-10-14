package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"

	"golang.org/x/net/http/httpguts"
)

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
