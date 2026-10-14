package relay

import (
	"crypto/sha256"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResponsesWSTurnCorrelatesUsageAndTerminalEvents(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		action     responsesWSAction
		usage      bool
	}{
		{"old terminal", `{"type":"response.completed","response":{"id":"old","usage":{"output_tokens":900}}}`, responsesWSDrop, false},
		{"conflicting ids", `{"type":"response.completed","response_id":"active","response":{"id":"other"}}`, responsesWSDrop, false},
		{"other stream", `{"type":"response.completed","stream_id":"other","response":{"id":"other","usage":{"output_tokens":900}}}`, responsesWSForward, false},
		{"other response", `{"type":"response.completed","response":{"id":"other","usage":{"output_tokens":900}}}`, responsesWSDrop, false},
		{"active terminal", `{"type":"response.completed","response":{"id":"active","usage":{"output_tokens":12}}}`, responsesWSComplete, true},
		{"malformed terminal", `{"type":"response.completed","response":{"usage":{"output_tokens":"invalid"}}}`, responsesWSComplete, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			turn := responsesWSTurn{streamID: "current", history: map[[32]byte]struct{}{sha256.Sum256([]byte("old")): {}}}
			created := turn.observe([]byte(`{"type":"response.created","response":{"id":"active"}}`))
			require.Equal(t, responsesWSForward, created.action)
			result := turn.observe([]byte(tc.body))
			assert.Equal(t, tc.action, result.action)
			if tc.usage {
				require.NotNil(t, result.event)
				require.NotNil(t, result.event.Response)
				require.NotNil(t, result.event.Response.Usage)
				assert.Equal(t, 12, result.event.Response.Usage.OutputTokens)
			} else {
				assert.Nil(t, result.event, "unrelated or invalid events must never enter accounting")
			}
		})
	}
}

func TestResponsesWSTurnControlErrorDoesNotEndGeneration(t *testing.T) {
	turn := responsesWSTurn{streamID: "current", history: map[[32]byte]struct{}{sha256.Sum256([]byte("old")): {}}}
	turn.observe([]byte(`{"type":"response.created","response":{"id":"active"}}`))
	turn.sentControl = []byte(`{"type":"response.cancel","event_id":"cancel","response_id":"old"}`)
	result := turn.observe([]byte(`{"type":"error","event_id":"cancel","response_id":"old","error":{"message":"already completed"}}`))
	assert.Equal(t, responsesWSForward, result.action)
	assert.Nil(t, result.event)
	assert.Nil(t, turn.sentControl, "acknowledged control allows a subsequent cancel")
	result = turn.observe([]byte(`{"type":"response.completed","response":{"id":"active"}}`))
	assert.Equal(t, responsesWSComplete, result.action)
}

func TestResponsesWSTurnRejectsBeforeAcceptanceAndSettlesAfterAcceptance(t *testing.T) {
	for _, accepted := range []bool{false, true} {
		turn := responsesWSTurn{history: make(map[[32]byte]struct{})}
		if accepted {
			turn.observe([]byte(`{"type":"response.created","response":{"id":"active"}}`))
			turn.sentControl = []byte(`{"type":"response.cancel","event_id":"cancel"}`)
		}
		result := turn.observe([]byte(`{"type":"error","status":500,"error":{"message":"upstream error"}}`))
		if !accepted {
			assert.Equal(t, responsesWSReject, result.action)
			require.NotNil(t, result.err)
			assert.Equal(t, 500, result.err.StatusCode)
			continue
		}
		assert.Equal(t, responsesWSComplete, result.action)
		assert.True(t, result.ambiguous, "uncorrelated error with a pending cancel requires reconnect after settlement")
		assert.Nil(t, result.err)
	}
}
