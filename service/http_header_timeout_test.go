package service

import (
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestChannelHeaderTimeoutStopsStalledUpstream(t *testing.T) {
	withRelayHTTPTransportSettings(t)
	for _, protocol := range []string{dto.HTTPProtocolAuto, dto.HTTPProtocolHTTP1} {
		t.Run(protocol, func(t *testing.T) {
			release := make(chan struct{})
			server := startHTTP2TLSServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				select {
				case <-r.Context().Done():
				case <-release:
				}
			}))
			defer server.Close()
			defer close(release)
			policy := NormalizeHTTPTransportPolicy(dto.ChannelSettings{HTTPProtocol: protocol, ResponseHeaderTimeoutSeconds: 1})
			client := newHTTPClientWithPolicyAndTLS(policy, testTLSClientConfig(t, server))
			defer client.CloseIdleConnections()
			resp, err := client.Get(server.URL)
			if resp != nil {
				resp.Body.Close()
			}
			require.Error(t, err)
			var timeout net.Error
			require.ErrorAs(t, err, &timeout)
			assert.True(t, timeout.Timeout())
		})
	}
}

func TestChannelHeaderTimeoutPreservesResponseBody(t *testing.T) {
	withRelayHTTPTransportSettings(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "complete response")
	}))
	defer server.Close()
	bounded := dto.ChannelSettings{ResponseHeaderTimeoutSeconds: 1}
	client, err := GetHttpClientWithProxySettings("", bounded)
	require.NoError(t, err)
	unlimited, err := GetHttpClientWithProxySettings("", dto.ChannelSettings{})
	require.NoError(t, err)
	assert.NotSame(t, client, unlimited, "channels with different deadlines must not share a client")
	assert.Zero(t, client.Timeout, "header timeout must not impose a deadline on the entire stream")
	resp, err := client.Get(server.URL)
	require.NoError(t, err)
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	assert.Equal(t, "complete response", string(body))
}
