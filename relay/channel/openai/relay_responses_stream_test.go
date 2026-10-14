package openai

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A Responses client can stop reading immediately after the terminal event is
// flushed, while the upstream HTTP connection is still open.
type responsesDisconnectWriter struct {
	gin.ResponseWriter
	cancel context.CancelFunc
	fail   bool
}

func (w *responsesDisconnectWriter) Flush() {
	w.ResponseWriter.Flush()
	if w.cancel != nil {
		w.cancel()
	}
}

func (w *responsesDisconnectWriter) Write(p []byte) (int, error) {
	if w.fail {
		return 0, io.ErrClosedPipe
	}
	return w.ResponseWriter.Write(p)
}

func TestResponsesStreamTerminalAndDisconnect(t *testing.T) {
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })
	for _, tc := range []struct {
		name, event, status string
		cancel, fail        bool
		wantReason          relaycommon.StreamEndReason
		wantError           bool
	}{
		{name: "completed_without_eof", event: "response.completed", status: "completed", wantReason: relaycommon.StreamEndReasonDone},
		{name: "disconnect_after_completed", event: "response.completed", status: "completed", cancel: true, wantReason: relaycommon.StreamEndReasonDone},
		{name: "disconnect_after_done", event: "response.done", status: "completed", cancel: true, wantReason: relaycommon.StreamEndReasonDone},
		{name: "failed", event: "response.failed", status: "failed", wantReason: relaycommon.StreamEndReasonHandlerStop, wantError: true},
		{name: "incomplete", event: "response.incomplete", status: "incomplete", wantReason: relaycommon.StreamEndReasonHandlerStop, wantError: true},
		{name: "cancelled", event: "response.cancelled", status: "cancelled", wantReason: relaycommon.StreamEndReasonHandlerStop, wantError: true},
		{name: "canceled", event: "response.canceled", status: "canceled", wantReason: relaycommon.StreamEndReasonHandlerStop, wantError: true},
		{name: "done_with_failed_status", event: "response.done", status: "failed", wantReason: relaycommon.StreamEndReasonHandlerStop, wantError: true},
		{name: "terminal_write_failure", event: "response.completed", status: "completed", fail: true, wantReason: relaycommon.StreamEndReasonDone, wantError: true},
		{name: "disconnect_before_terminal", event: "response.created", status: "in_progress", cancel: true, wantReason: relaycommon.StreamEndReasonClientGone},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil).WithContext(ctx)
			writer := &responsesDisconnectWriter{ResponseWriter: c.Writer, fail: tc.fail}
			if tc.cancel {
				writer.cancel = cancel
			}
			c.Writer = writer
			data := fmt.Sprintf(`{"type":%q,"response":{"status":%q,"usage":{"input_tokens":11,"output_tokens":7,"total_tokens":18,"input_tokens_details":{"cached_tokens":5}}}}`, tc.event, tc.status)
			body := &blockingBody{chunk: []byte("data: " + data + "\n\n"), closed: make(chan struct{})}
			defer body.Close()
			info := &relaycommon.RelayInfo{IsStream: true, DisablePing: true, ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "gpt-5.1"}}
			resp := &http.Response{StatusCode: http.StatusOK, Body: body, Header: http.Header{"Content-Type": {"text/event-stream"}}}
			var usage *dto.Usage
			var apiErr *types.NewAPIError
			finished := make(chan struct{})
			go func() {
				usage, apiErr = OaiResponsesStreamHandler(c, info, resp)
				close(finished)
			}()
			select {
			case <-finished:
			case <-time.After(2 * time.Second):
				cancel()
				<-finished
				t.Fatal("stream did not finish after its terminal event")
			}
			require.Nil(t, apiErr)
			require.NotNil(t, info.StreamStatus)
			assert.Equal(t, tc.wantReason, info.StreamStatus.EndReason)
			assert.Equal(t, tc.wantError, info.StreamStatus.HasErrors())
			select {
			case <-body.closed:
			default:
				t.Error("upstream body was not closed")
			}
			if tc.event != "response.created" {
				require.NotNil(t, usage)
				assert.Equal(t, 11, usage.PromptTokens)
				assert.Equal(t, 7, usage.CompletionTokens)
				assert.Equal(t, 18, usage.TotalTokens)
				assert.Equal(t, 5, usage.PromptTokensDetails.CachedTokens)
			}
			if !tc.fail {
				assert.Equal(t, "event: "+tc.event+"\ndata: "+data+"\n\n", recorder.Body.String())
			}
		})
	}
}
