package relay

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	appconstant "github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/pkg/wsmanager"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

const responsesWSEventTypeResponseCreate = "response.create"

const responsesWSWriteTimeout = 30 * time.Second

// ResponsesWSRequestRunner executes the existing authentication and rate-limit
// middleware around one complete request, without a second HTTP connection.
type ResponsesWSRequestRunner func(*http.Request, string, func(*gin.Context) *types.NewAPIError) *types.NewAPIError

type responsesWSMessage struct {
	kind int
	body []byte
	err  error
}

// responsesWSControl is a client control event (response.cancel) whose
// envelope the read loop already parsed.
type responsesWSControl struct {
	body              []byte
	eventID, streamID string
}

// Only the request worker reads or changes billing state. Socket readers pass
// bounded messages to it; cancellation never performs an independent refund.
type responsesWSCallState struct {
	inbox    chan responsesWSMessage
	controls chan responsesWSControl
	done     chan struct{}
	terminal *responsesWSMessage
	// A nonzero closeCode ends the connection after this request.
	closeCode          int
	closeReason        string
	correlationMissing bool
}

type responsesWSSession struct {
	ctx            context.Context
	cancel         context.CancelFunc
	client         *websocket.Conn
	runner         ResponsesWSRequestRunner
	request        *http.Request
	requestID      string
	nextEventIndex int
	workers        sync.WaitGroup
	closeOnce      sync.Once

	clientWriteMu sync.Mutex
	targetWriteMu sync.Mutex
	connectionMu  sync.Mutex
	target        *websocket.Conn
	unregister    func()
	stateMu       sync.Mutex
	current       *responsesWSCallState

	// These fields belong to the serial request worker and describe the actual
	// established connection. Per-request token/user data is never stored here.
	responseIDs          map[[32]byte]struct{}
	responseHistoryLimit int
	lockedModel          string
	lockedChannelID      int
	lockedGroup          string
	lockedKey            string
	lockedKeyIndex       int
	lockedContext        map[appconstant.ContextKey]any
	lockedRoute          dto.AdvancedCustomRoute
	lockedBinding        *responsesWSConnectionBinding
}

func ResponsesWebSocketHelper(c *gin.Context, client *websocket.Conn, runner ResponsesWSRequestRunner) *types.NewAPIError {
	ctx, cancel := context.WithCancel(c.Request.Context())
	s := &responsesWSSession{ctx: ctx, cancel: cancel, client: client, runner: runner,
		request: c.Request.Clone(ctx), requestID: c.GetString(common.RequestIdKey)}
	done := make(chan struct{})
	unregisterSession := wsmanager.RegisterSession(wsmanager.KindResponses, s.closeForPolicy, done)
	defer func() { unregisterSession(); close(done) }()
	if s.requestID == "" {
		s.requestID = common.NewRequestId()
	}
	maxMB := appconstant.MaxRequestBodyMB
	if maxMB <= 0 {
		maxMB = 128
	}
	client.SetReadLimit(int64(maxMB) << 20)
	defer func() {
		// Unless an earlier shutdown ended the read, the client closed or left.
		// Gorilla already answered a client close frame, so this tells the upstream.
		s.shutdown(websocket.CloseNormalClosure, "")
		s.workers.Wait()
	}()

	for {
		_, message, err := client.ReadMessage()
		if err != nil {
			return nil
		}
		envelope, streamID, err := parseResponsesWSEnvelope(message)
		eventType := envelope.Type
		if err != nil {
			s.sendError(envelope.EventID, streamID, newResponsesWSInvalidRequestError(err))
			continue
		}
		if eventType != responsesWSEventTypeResponseCreate {
			// Controls are owned by the active request too. In particular a cancel
			// arriving during authentication must not precede its upstream create.
			state := s.getCurrent()
			if eventType != "response.cancel" || state == nil {
				s.sendError(envelope.EventID, streamID, newResponsesWSInvalidRequestError(fmt.Errorf("unsupported websocket event %q", eventType)))
				continue
			}
			select {
			case state.controls <- responsesWSControl{body: message, eventID: envelope.EventID, streamID: streamID}:
			case <-state.done:
			case <-s.ctx.Done():
				return nil
			default:
				s.sendError(envelope.EventID, streamID, newResponsesWSInvalidRequestError(errors.New("a response control event is already pending")))
			}
			continue
		}
		state := &responsesWSCallState{inbox: make(chan responsesWSMessage), controls: make(chan responsesWSControl, 1), done: make(chan struct{})}
		if !s.tryReserveCurrent(state) {
			s.sendError(envelope.EventID, streamID, types.NewErrorWithStatusCode(errors.New("another response.create is already in progress on this websocket connection"), types.ErrorCodeInvalidRequest, http.StatusConflict, types.ErrOptionWithSkipRetry()))
			continue
		}
		requestID := fmt.Sprintf("%s-ws-%d", s.requestID, s.nextEventIndex)
		s.nextEventIndex++
		s.workers.Go(func() { s.runRequest(state, message, envelope, streamID, requestID) })
	}
}

func (s *responsesWSSession) startTargetReader(target *websocket.Conn) {
	limit := int64(helper.DefaultMaxScannerBufferSize)
	if appconstant.StreamScannerMaxBufferMB > 0 {
		limit = int64(appconstant.StreamScannerMaxBufferMB) << 20
	}
	target.SetReadLimit(limit)
	s.workers.Go(func() {
		for {
			kind, body, err := target.ReadMessage()
			incoming := responsesWSMessage{kind: kind, body: body, err: err}
			if state := s.getCurrent(); state != nil {
				select {
				case state.inbox <- incoming:
					if err != nil {
						return
					}
					continue
				case <-state.done:
				case <-s.ctx.Done():
					return
				}
			}
			// No request owns this message. An idle upstream that closed
			// normally ends the client session with the same code.
			if err != nil {
				code := websocket.CloseInternalServerErr
				if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
					code = err.(*websocket.CloseError).Code
				}
				s.shutdown(code, "upstream connection closed")
				return
			}
			if writeErr := s.writeClient(kind, body); writeErr != nil {
				s.shutdown(websocket.CloseInternalServerErr, "")
				return
			}
		}
	})
}

func (s *responsesWSSession) getCurrent() *responsesWSCallState {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	return s.current
}

func (s *responsesWSSession) tryReserveCurrent(state *responsesWSCallState) bool {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	if s.current != nil {
		return false
	}
	s.current = state
	return true
}

func (s *responsesWSSession) getTarget() *websocket.Conn {
	s.connectionMu.Lock()
	defer s.connectionMu.Unlock()
	return s.target
}

func (s *responsesWSSession) setTarget(target *websocket.Conn) bool {
	s.connectionMu.Lock()
	defer s.connectionMu.Unlock()
	if s.ctx.Err() != nil {
		_ = target.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""), time.Now().Add(time.Second))
		_ = target.Close()
		return false
	}
	s.target = target
	return true
}

func (s *responsesWSSession) writeTarget(kind int, message []byte) error {
	s.targetWriteMu.Lock()
	defer s.targetWriteMu.Unlock()
	target := s.getTarget()
	if target == nil {
		return errors.New("responses websocket upstream is not connected")
	}
	if err := target.SetWriteDeadline(time.Now().Add(responsesWSWriteTimeout)); err != nil {
		return err
	}
	return target.WriteMessage(kind, message)
}

func (s *responsesWSSession) writeClient(kind int, message []byte) error {
	s.clientWriteMu.Lock()
	defer s.clientWriteMu.Unlock()
	if err := s.client.SetWriteDeadline(time.Now().Add(responsesWSWriteTimeout)); err != nil {
		return err
	}
	return s.client.WriteMessage(kind, message)
}

func (s *responsesWSSession) sendError(eventID, streamID string, apiErr *types.NewAPIError) {
	if apiErr == nil {
		return
	}
	payload, err := buildResponsesWSErrorPayload(eventID, streamID, apiErr)
	if err == nil {
		_ = s.writeClient(websocket.TextMessage, payload)
	}
}

// shutdown ends the connection once. Each peer gets a close frame that says
// why, bounded to one second, and both sockets close even if a write failed.
// Close frames are control writes, which gorilla allows alongside a blocked
// data writer, so shutdown takes no write lock and never waits for workers.
func (s *responsesWSSession) shutdown(code int, reason string) {
	s.closeOnce.Do(func() {
		s.cancel()
		s.connectionMu.Lock()
		target, unregister := s.target, s.unregister
		s.target, s.unregister = nil, nil
		s.connectionMu.Unlock()
		if unregister != nil {
			unregister()
		}
		closeMessage := websocket.FormatCloseMessage(code, reason)
		_ = s.client.WriteControl(websocket.CloseMessage, closeMessage, time.Now().Add(time.Second))
		if target != nil {
			_ = target.WriteControl(websocket.CloseMessage, closeMessage, time.Now().Add(time.Second))
			_ = target.Close()
		}
		_ = s.client.Close()
	})
}

func (s *responsesWSSession) registerChannelClose(channelID int) {
	unregister := wsmanager.Register(channelID, wsmanager.KindResponses, s.closeForPolicy)
	s.connectionMu.Lock()
	if s.ctx.Err() != nil {
		s.connectionMu.Unlock()
		unregister()
		return
	}
	previous := s.unregister
	s.unregister = unregister
	s.connectionMu.Unlock()
	if previous != nil {
		previous()
	}
}

// closeForPolicy tells both peers why the connection ends, like the realtime
// relay does.
func (s *responsesWSSession) closeForPolicy(reason string) {
	s.shutdown(websocket.ClosePolicyViolation, reason)
}
