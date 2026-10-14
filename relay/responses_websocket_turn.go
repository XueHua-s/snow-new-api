package relay

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
)

type responsesWSAction uint8

const (
	responsesWSForward responsesWSAction = iota
	responsesWSDrop
	responsesWSComplete
	responsesWSReject
)

// A decision contains usage only for events belonging to the current turn.
// Complete preserves the upstream terminal frame; Reject uses the normal
// pre-acceptance refund/error path. Neither decision performs IO or billing.
type responsesWSDecision struct {
	action     responsesWSAction
	event      *dto.ResponsesStreamResponse
	err        *types.NewAPIError
	diagnostic string
	ambiguous  bool
}

// responsesWSTurn owns correlation for one serial generation. History belongs
// to the session and retains hashed response IDs until reconnect. The request
// worker alone accesses this state; socket readers never update it.
type responsesWSTurn struct {
	streamID       string
	responseID     string
	history        map[[32]byte]struct{}
	accepted       bool
	pendingControl []byte
	sentControl    []byte
}

func (t *responsesWSTurn) observe(body []byte) responsesWSDecision {
	var event struct {
		dto.ResponsesStreamResponse
		StreamID   string `json:"stream_id"`
		ResponseID string `json:"response_id"`
		Message    string `json:"message"`
		Code       any    `json:"code"`
	}
	decodeErr := common.Unmarshal(body, &event)
	action := responsesWSForward
	switch event.Type {
	case "response.completed", "response.done", "response.incomplete", "response.failed", "response.cancelled", "response.canceled":
		action = responsesWSComplete
	}
	if decodeErr != nil {
		// Preserve the transport's terminal handling when the envelope type
		// decoded but its payload did not. Never account partially decoded usage.
		return responsesWSDecision{action: action, diagnostic: "invalid upstream websocket event"}
	}
	responseID := event.ResponseID
	if event.Response != nil && event.Response.ID != "" {
		if responseID != "" && responseID != event.Response.ID {
			return responsesWSDecision{action: responsesWSDrop}
		}
		responseID = event.Response.ID
	}
	_, seen := t.history[sha256.Sum256([]byte(responseID))]
	if event.Type == "error" {
		var rejection responsesWSErrorEvent
		_ = common.Unmarshal(body, &rejection)
		rejection.ResponseID = responseID
		terminal, ambiguous, controlError := responsesWSErrorEndsRequest(rejection, t.streamID, t.responseID, t.sentControl)
		// A cancellation error may reference an older response but still
		// acknowledge the current pending control, without ending generation.
		if responseID != "" && responseID != t.responseID && seen && !controlError {
			return responsesWSDecision{action: responsesWSDrop}
		}
		if !terminal {
			if controlError {
				t.sentControl = nil
			}
			return responsesWSDecision{action: responsesWSForward}
		}
		if t.accepted {
			result := responsesWSDecision{action: responsesWSComplete, event: &event.ResponsesStreamResponse, ambiguous: ambiguous}
			if rejection.Error != nil {
				code := ""
				if rejection.Error.Code != nil {
					code = fmt.Sprint(rejection.Error.Code)
				}
				result.diagnostic = fmt.Sprintf("upstream error: code=%s type=%s status=%d", code, rejection.Error.Type, rejection.Status)
			}
			return result
		}
		if rejection.Error == nil {
			rejection.Error = &types.OpenAIError{Type: "invalid_request_error", Message: event.Message, Code: event.Code}
		}
		err := types.WithOpenAIError(*rejection.Error, rejection.Status, types.ErrOptionWithSkipRetry())
		if err.StatusCode < 400 || err.StatusCode > 599 {
			err.StatusCode = http.StatusBadRequest
		}
		return responsesWSDecision{action: responsesWSReject, err: err}
	}
	if responseID != "" && seen && responseID != t.responseID {
		return responsesWSDecision{action: responsesWSDrop}
	}
	if event.StreamID != "" && event.StreamID != t.streamID {
		return responsesWSDecision{action: responsesWSForward}
	}
	if responseID != "" && t.responseID != "" && responseID != t.responseID {
		return responsesWSDecision{action: responsesWSDrop}
	}
	if strings.HasPrefix(event.Type, "response.") {
		t.accepted = true
		if t.responseID == "" && responseID != "" {
			t.responseID = responseID
			t.history[sha256.Sum256([]byte(responseID))] = struct{}{}
		}
	}
	return responsesWSDecision{action: action, event: &event.ResponsesStreamResponse}
}

// A single generation is active, but a cancel can fail independently. Correlate
// available IDs first; uncorrelated control/server errors require a bounded
// connection close because continuing could leave the generation stuck forever.
func responsesWSErrorEndsRequest(event responsesWSErrorEvent, streamID, responseID string, control []byte) (terminal, ambiguous, controlError bool) {
	if len(control) > 0 {
		var pending struct {
			EventID    string `json:"event_id"`
			StreamID   string `json:"stream_id"`
			ResponseID string `json:"response_id"`
		}
		_ = common.Unmarshal(control, &pending)
		if event.EventID != "" && event.EventID == pending.EventID {
			return false, false, true
		}
		if event.ResponseID != "" && event.ResponseID == pending.ResponseID && event.ResponseID != responseID {
			return false, false, true
		}
		if (event.StreamID == "" || event.StreamID == pending.StreamID) && event.Error != nil && event.Error.Type == "invalid_request_error" {
			switch event.Error.Code {
			case "response_not_found", "response_not_active", "response_already_completed":
				return false, false, true
			}
		}
	}
	if event.StreamID != "" && event.StreamID != streamID || responseID != "" && event.ResponseID != "" && event.ResponseID != responseID {
		return false, false, false
	}
	return true, len(control) > 0 && event.ResponseID == "", false
}
