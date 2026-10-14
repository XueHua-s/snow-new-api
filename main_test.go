package main

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestShutdownDeadlineCancelsAndWaitsForRequestSettlement(t *testing.T) {
	requestContext, cancelRequests := context.WithCancel(context.Background())
	defer cancelRequests()
	entered := make(chan struct{})
	cancelled := make(chan struct{})
	settle := make(chan struct{})
	settled := make(chan struct{})
	drain := &httpHandlerDrain{handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: accepted\n\n"))
		w.(http.Flusher).Flush()
		close(entered)
		<-r.Context().Done()
		close(cancelled)
		<-settle
		close(settled)
	})}
	srv := httptest.NewUnstartedServer(drain)
	srv.Config.BaseContext = func(net.Listener) context.Context { return requestContext }
	srv.Start()
	defer srv.Close()
	response, err := srv.Client().Get(srv.URL)
	require.NoError(t, err)
	defer response.Body.Close()
	<-entered
	grace, cancelGrace := context.WithCancel(context.Background())
	cancelGrace()
	result := make(chan error, 1)
	go func() { result <- shutdownHTTPServer(grace, srv.Config, drain, cancelRequests, time.Second) }()
	select {
	case <-cancelled:
	case <-time.After(time.Second):
		t.Fatal("active HTTP request was not cancelled")
	}
	select {
	case err := <-result:
		t.Fatalf("shutdown returned before settlement: %v", err)
	default:
	}
	rejected := httptest.NewRecorder()
	drain.ServeHTTP(rejected, httptest.NewRequest("GET", "/", nil))
	assert.Equal(t, http.StatusServiceUnavailable, rejected.Code)
	close(settle)
	require.ErrorIs(t, <-result, context.Canceled)
	select {
	case <-settled:
	default:
		t.Fatal("handler settlement was not awaited")
	}
}

func TestShutdownReportsUnfinishedSettlement(t *testing.T) {
	requestContext, cancelRequests := context.WithCancel(context.Background())
	defer cancelRequests()
	release := make(chan struct{})
	entered := make(chan struct{})
	drain := &httpHandlerDrain{handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { close(entered); <-release })}
	srv := httptest.NewUnstartedServer(drain)
	srv.Config.BaseContext = func(net.Listener) context.Context { return requestContext }
	srv.Start()
	defer srv.Close()
	clientDone := make(chan struct{})
	go func() {
		defer close(clientDone)
		response, err := srv.Client().Get(srv.URL)
		if err == nil {
			response.Body.Close()
		}
	}()
	<-entered
	grace, cancelGrace := context.WithCancel(context.Background())
	cancelGrace()
	err := shutdownHTTPServer(grace, srv.Config, drain, cancelRequests, time.Millisecond)
	assert.True(t, errors.Is(err, errHTTPHandlersNotDrained))
	close(release)
	<-clientDone
}
