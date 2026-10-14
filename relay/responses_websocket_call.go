package relay

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	appconstant "github.com/QuantumNous/new-api/constant"
	appdto "github.com/QuantumNous/new-api/dto"
	appmodel "github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	relaychannel "github.com/QuantumNous/new-api/relay/channel"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

func (s *responsesWSSession) runRequest(state *responsesWSCallState, message []byte, envelope responsesWSCreateEvent, streamID string, requestID string) {
	create, parseErr := normalizeResponsesWSCreateEvent(message, envelope, streamID)
	var apiErr *types.NewAPIError
	defer func() {
		if recovered := recover(); recovered != nil {
			apiErr = types.NewError(fmt.Errorf("responses websocket request panic: %v", recovered), types.ErrorCodeBadResponse, types.ErrOptionWithSkipRetry())
			state.closeCode = websocket.CloseInternalServerErr
		}
		historyLimit := s.responseHistoryLimit
		if historyLimit <= 0 {
			historyLimit = 1024
		}
		// Keep every admitted ID until the session ends. Close only here,
		// after the runner returned and its original settlement completed.
		if state.closeCode == 0 && (len(s.responseIDs) >= historyLimit || state.correlationMissing) {
			state.closeCode = websocket.CloseNormalClosure
			state.closeReason = "response correlation limit reached; reconnect required"
		}
		// Finish the middleware count before publishing the terminal event. Hold
		// admission while writing it so an immediate next create cannot race
		// the current request's release. A failing request also shuts down
		// before that release, so a concurrent upstream close cannot report it
		// as a normal closure; shutdown itself takes neither lock.
		outgoing := state.terminal
		if apiErr != nil {
			if body, err := buildResponsesWSErrorPayload(envelope.EventID, streamID, apiErr); err == nil {
				outgoing = &responsesWSMessage{kind: websocket.TextMessage, body: body}
			}
		}
		s.clientWriteMu.Lock()
		s.stateMu.Lock()
		if outgoing != nil {
			if err := s.client.SetWriteDeadline(time.Now().Add(responsesWSWriteTimeout)); err != nil {
				state.closeCode = websocket.CloseInternalServerErr
			} else if err := s.client.WriteMessage(outgoing.kind, outgoing.body); err != nil {
				state.closeCode = websocket.CloseInternalServerErr
			}
		}
		if state.closeCode != 0 {
			s.shutdown(state.closeCode, state.closeReason)
		}
		s.current = nil
		close(state.done)
		s.stateMu.Unlock()
		s.clientWriteMu.Unlock()
	}()
	request := s.request.Clone(s.ctx)
	request.Body = io.NopCloser(bytes.NewReader(message))
	request.ContentLength = int64(len(message))
	request.Header.Set("Content-Type", "application/json")
	apiErr = s.runner(request, requestID, func(c *gin.Context) *types.NewAPIError {
		if parseErr != nil {
			return newResponsesWSInvalidRequestError(parseErr)
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(create.Body))
		c.Request.ContentLength = int64(len(create.Body))
		return s.runCall(c, state, create)
	})
	if apiErr != nil && (apiErr.StatusCode == http.StatusUnauthorized || apiErr.StatusCode == http.StatusForbidden) {
		state.closeCode = websocket.ClosePolicyViolation
	}
}

func (s *responsesWSSession) runCall(c *gin.Context, state *responsesWSCallState, create responsesWSCreateRequest) (apiErr *types.NewAPIError) {
	modelName := create.Request.Model
	started := time.Now()
	var info *relaycommon.RelayInfo
	billingPrepared := false
	defer func() {
		if recovered := recover(); recovered != nil {
			apiErr = types.NewError(fmt.Errorf("responses websocket call panic: %v", recovered), types.ErrorCodeBadResponse, types.ErrOptionWithSkipRetry())
			state.closeCode = websocket.CloseInternalServerErr
		}
		if info == nil && modelName != "" {
			info = &relaycommon.RelayInfo{OriginModelName: modelName, UsingGroup: common.GetContextKeyString(c, appconstant.ContextKeyUsingGroup), StartTime: started}
		}
		if apiErr != nil && info != nil {
			perfmetrics.RecordRelaySample(info, false, 0)
		}
		// Settlement already marks the request policy successful, and nothing
		// reads a termination decision after this point on the WebSocket path,
		// so neither policy record belongs here.
		if info != nil && billingPrepared {
			apiErr = RefundFailedRequestBilling(c, info, apiErr)
		}
	}()
	if modelName == "" {
		return newResponsesWSInvalidRequestError(errors.New("model is required"))
	}
	if s.lockedModel != "" && modelName != s.lockedModel {
		return newResponsesWSInvalidRequestError(fmt.Errorf("responses websocket connection is locked to model %q", s.lockedModel))
	}
	if apiErr = checkResponsesWSModelAccess(c, modelName); apiErr != nil {
		return apiErr
	}
	common.SetContextKey(c, appconstant.ContextKeyOriginalModel, modelName)
	common.SetContextKey(c, appconstant.ContextKeyRequestStartTime, time.Now())
	service.GetChannelConstraints(c).AddFilter(appdto.ChannelFilter{Kind: appdto.FilterRequestPath, RequestPath: c.Request.URL.Path})

	if s.lockedChannelID != 0 {
		if apiErr = s.restoreConnectionContext(c, modelName); apiErr != nil {
			return apiErr
		}
		info = relaycommon.GenRelayInfoResponses(c, &create.Request)
		info.IsStream = true
		common.SetContextKey(c, appconstant.ContextKeyIsStream, true)
		if apiErr = PrepareRequestBilling(c, info); apiErr != nil {
			return apiErr
		}
		billingPrepared = true
		var payload []byte
		payload, apiErr = buildResponsesWSCreatePayload(c, info, create.Request, create.Generate, create.StreamID)
		if apiErr != nil {
			return apiErr
		}
		if err := s.writeTarget(websocket.TextMessage, payload); err != nil {
			state.closeCode = websocket.CloseInternalServerErr
			return types.NewError(err, types.ErrorCodeBadResponse, types.ErrOptionWithSkipRetry())
		}
	} else {
		retry := &service.RetryParam{Ctx: c, TokenGroup: common.GetContextKeyString(c, appconstant.ContextKeyUsingGroup), ModelName: modelName, RequestPath: c.Request.URL.Path, Retry: common.GetPointer(0)}
		for ; retry.GetRetry() <= common.RetryTimes; retry.IncreaseRetry() {
			var channel *appmodel.Channel
			channel, apiErr = selectResponsesWSChannel(c, modelName, retry)
			if apiErr != nil {
				return apiErr
			}
			service.AppendUsedChannel(c, channel.Id)
			if info == nil {
				info = relaycommon.GenRelayInfoResponses(c, &create.Request)
				info.IsStream = true
				common.SetContextKey(c, appconstant.ContextKeyIsStream, true)
				if apiErr = PrepareRequestBilling(c, info); apiErr != nil {
					return apiErr
				}
				billingPrepared = true
			} else {
				info.PriceData.GroupRatioInfo = helper.HandleGroupRatio(c, info)
				if apiErr = service.PrepareTieredBillingForSelectedGroup(c, info); apiErr != nil {
					return apiErr
				}
			}
			info.RetryIndex = retry.GetRetry()

			var payload []byte
			payload, apiErr = buildResponsesWSCreatePayload(c, info, create.Request, create.Generate, create.StreamID)
			if apiErr != nil {
				return apiErr
			}
			adaptor := GetAdaptor(info.ApiType)
			adaptor.Init(info)
			targetURL, targetErr := adaptor.GetRequestURL(info)
			if targetErr != nil {
				return types.NewError(targetErr, types.ErrorCodeDoRequestFailed, types.ErrOptionWithSkipRetry())
			}
			targetURL = strings.Replace(strings.Replace(targetURL, "https://", "wss://", 1), "http://", "ws://", 1)
			binding := &responsesWSConnectionBinding{channel: responsesWSChannelBinding(channel), generation: service.CodexTransportGeneration(), targetURL: targetURL,
				userID: common.GetContextKeyInt(c, appconstant.ContextKeyUserId), tokenID: common.GetContextKeyInt(c, appconstant.ContextKeyTokenId)}
			if channel.Type == appconstant.ChannelTypeCodex {
				var policyErr error
				binding.policy, policyErr = service.CodexWebSocketPolicyBinding(targetURL, service.CodexTransportOptions{ProxyURL: info.ChannelSetting.Proxy, Settings: info.ChannelSetting, Purpose: service.CodexTransportAPI})
				if policyErr != nil {
					return types.NewError(policyErr, types.ErrorCodeDoRequestFailed, types.ErrOptionWithSkipRetry())
				}
			}
			// Register before dialing, so a concurrent update also cancels an
			// in-flight handshake. Recheck the database before sending create.
			s.registerChannelClose(channel.Id)
			target, dialErr := relaychannel.DoWssRequest(adaptor, c, info, nil)
			if dialErr != nil {
				apiErr = service.NormalizeViolationFeeError(types.NewError(dialErr, types.ErrorCodeDoRequestFailed))
				service.ResetStatusCode(apiErr, c.GetString("status_code_mapping"))
				info.LastError = apiErr
				retryAllowed := service.ShouldRetryRelayError(c, apiErr, common.RetryTimes-retry.GetRetry())
				service.ProcessChannelError(c, *types.NewChannelError(channel.Id, channel.Type, channel.Name, channel.ChannelInfo.IsMultiKey, info.ApiKey, channel.GetAutoBan()), apiErr, info)
				if retryAllowed {
					continue
				}
				return apiErr
			}
			if !s.setTarget(target) {
				return types.NewError(context.Canceled, types.ErrorCodeBadResponse, types.ErrOptionWithSkipRetry())
			}
			currentChannel, currentErr := appmodel.GetChannelById(channel.Id, true)
			if currentErr != nil || currentChannel == nil || responsesWSChannelBinding(currentChannel) != binding.channel {
				state.closeCode = websocket.ClosePolicyViolation
				return types.NewErrorWithStatusCode(errors.New("upstream connection binding changed; reconnect required"), types.ErrorCodeAccessDenied, http.StatusForbidden, types.ErrOptionWithSkipRetry())
			}
			s.lockedBinding = binding
			if err := s.writeTarget(websocket.TextMessage, payload); err != nil {
				state.closeCode = websocket.CloseInternalServerErr
				return types.NewError(err, types.ErrorCodeBadResponse, types.ErrOptionWithSkipRetry())
			}
			s.lockedModel, s.lockedChannelID, s.lockedGroup = modelName, channel.Id, info.UsingGroup
			s.lockedKey, s.lockedKeyIndex = info.ApiKey, info.ChannelMultiKeyIndex
			s.lockedRoute, _ = channel.GetOtherSettings().AdvancedCustom.MatchPathForModel(c.Request.URL.Path, modelName)
			s.lockedContext = make(map[appconstant.ContextKey]any)
			for _, key := range []appconstant.ContextKey{
				appconstant.ContextKeyChannelId, appconstant.ContextKeyChannelName, appconstant.ContextKeyChannelType,
				appconstant.ContextKeyChannelCreateTime, appconstant.ContextKeyChannelSetting, appconstant.ContextKeyChannelOtherSetting,
				appconstant.ContextKeyChannelParamOverride, appconstant.ContextKeyChannelHeaderOverride, appconstant.ContextKeyChannelOrganization,
				appconstant.ContextKeyChannelAutoBan, appconstant.ContextKeyChannelModelMapping, appconstant.ContextKeyChannelStatusCodeMapping,
				appconstant.ContextKeyChannelIsMultiKey, appconstant.ContextKeyChannelMultiKeyIndex, appconstant.ContextKeyChannelKey, appconstant.ContextKeyChannelBaseUrl,
			} {
				if value, ok := c.Get(string(key)); ok {
					s.lockedContext[key] = value
				}
			}
			s.startTargetReader(target)
			apiErr = nil
			break
		}
		if apiErr != nil {
			return apiErr
		}
	}

	return s.receiveResponse(c, state, info, create.StreamID)
}

// receiveResponse owns the admitted turn until settlement. Event correlation
// decides which upstream frames belong to this turn; only this worker applies
// their usage and settles, including cancellation and transport interruption.
func (s *responsesWSSession) receiveResponse(c *gin.Context, state *responsesWSCallState, info *relaycommon.RelayInfo, streamID string) *types.NewAPIError {
	accumulator := service.NewResponsesUsageAccumulator(info)
	info.StreamStatus = relaycommon.NewStreamStatus()
	timeout := time.Duration(appconstant.StreamingTimeout) * time.Second
	if timeout <= 0 {
		timeout = 300 * time.Second
	}
	idle := time.NewTimer(timeout)
	defer idle.Stop()
	if s.responseIDs == nil {
		s.responseIDs = make(map[[32]byte]struct{})
	}
	turn := responsesWSTurn{streamID: streamID, history: s.responseIDs}
	defer func() { state.correlationMissing = turn.accepted && turn.responseID == "" }()
	for {
		select {
		case incoming := <-state.inbox:
			idle.Reset(timeout)
			if incoming.err != nil {
				info.StreamStatus.SetEndReason(relaycommon.StreamEndReasonScannerErr, incoming.err)
				state.closeCode, state.closeReason = websocket.CloseInternalServerErr, "upstream connection closed"
				ConsumeResponsesQuota(c, info, accumulator.Finish())
				return nil
			}
			info.SetFirstResponseTime()
			wasAccepted := turn.accepted
			result := turn.observe(incoming.body)
			if !wasAccepted && turn.accepted {
				service.RecordChannelAffinity(c, s.lockedChannelID)
			}
			if result.diagnostic != "" {
				info.StreamStatus.RecordError(result.diagnostic)
			}
			if result.event != nil {
				accumulator.Observe(result.event)
			}
			switch result.action {
			case responsesWSDrop:
				continue
			case responsesWSReject:
				return result.err
			case responsesWSComplete:
				info.StreamStatus.SetEndReason(relaycommon.StreamEndReasonDone, nil)
				state.terminal = &incoming
				if result.ambiguous {
					state.closeCode = websocket.CloseInternalServerErr
				}
				ConsumeResponsesQuota(c, info, accumulator.Finish())
				return nil
			}
			if err := s.writeClient(incoming.kind, incoming.body); err != nil {
				s.shutdown(websocket.CloseInternalServerErr, "")
			}
			if turn.accepted && turn.pendingControl != nil {
				if err := s.writeTarget(websocket.TextMessage, turn.pendingControl); err != nil {
					s.shutdown(websocket.CloseInternalServerErr, "")
				}
				turn.sentControl = turn.pendingControl
				turn.pendingControl = nil
			}
		case control := <-state.controls:
			if turn.pendingControl != nil || turn.sentControl != nil {
				s.sendError(control.eventID, control.streamID, newResponsesWSInvalidRequestError(errors.New("a response control event is already pending")))
				continue
			}
			if !turn.accepted {
				turn.pendingControl = control.body
				continue
			}
			if err := s.writeTarget(websocket.TextMessage, control.body); err != nil {
				s.shutdown(websocket.CloseInternalServerErr, "")
			}
			turn.sentControl = control.body
		case <-idle.C:
			info.StreamStatus.SetEndReason(relaycommon.StreamEndReasonTimeout, context.DeadlineExceeded)
			state.closeCode, state.closeReason = websocket.CloseInternalServerErr, "upstream response timed out"
			ConsumeResponsesQuota(c, info, accumulator.Finish())
			return nil
		case <-s.ctx.Done():
			info.StreamStatus.SetEndReason(relaycommon.StreamEndReasonClientGone, s.ctx.Err())
			ConsumeResponsesQuota(c, info, accumulator.Finish())
			return nil
		}
	}
}
