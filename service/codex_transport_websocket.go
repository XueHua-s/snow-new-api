package service

import (
	"context"
	"crypto/sha256"
	"net"
	"net/http"
	"slices"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/gorilla/websocket"
)

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
