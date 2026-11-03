package service

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
)

type recoveryTestBody struct{}

func (recoveryTestBody) Read([]byte) (int, error) {
	return 0, errors.New("http2: response body closed")
}
func (recoveryTestBody) Close() error { return nil }

type recoveryTestTransport struct{}

func (recoveryTestTransport) RoundTrip(*http.Request) (*http.Response, error) {
	return &http.Response{StatusCode: 200, ProtoMajor: 2, Body: recoveryTestBody{}}, nil
}

func TestRecoveryRoundTripperClosesIdleHTTP2ConnectionsOnBodyError(t *testing.T) {
	var closes atomic.Int32
	rt := &recoveryRoundTripper{base: recoveryTestTransport{}, closeIdle: func() { closes.Add(1) }}
	resp, err := rt.RoundTrip(&http.Request{})
	if err != nil {
		t.Fatal(err)
	}
	_, err = io.ReadAll(resp.Body)
	if err == nil || !strings.Contains(err.Error(), "response body closed") {
		t.Fatalf("expected body error, got %v", err)
	}
	if got := closes.Load(); got != 1 {
		t.Fatalf("expected one idle close, got %d", got)
	}
}
