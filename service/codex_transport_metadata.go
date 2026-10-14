package service

import (
	"encoding/base64"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"sync/atomic"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"

	"golang.org/x/net/http/httpguts"
)

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
