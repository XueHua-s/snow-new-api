package volcengine

import (
	"fmt"
)

type (
	EventType         int32
	MsgType           uint8
	MsgTypeFlagBits   uint8
	VersionBits       uint8
	HeaderSizeBits    uint8
	SerializationBits uint8
	CompressionBits   uint8
)

const (
	MsgTypeFlagNoSeq       MsgTypeFlagBits = 0
	MsgTypeFlagPositiveSeq MsgTypeFlagBits = 0b1
	MsgTypeFlagNegativeSeq MsgTypeFlagBits = 0b11
	MsgTypeFlagWithEvent   MsgTypeFlagBits = 0b100
)

const (
	Version1 VersionBits = iota + 1
)

const (
	HeaderSize4 HeaderSizeBits = iota + 1
)

const (
	SerializationJSON SerializationBits = 0b1
)

const (
	CompressionNone CompressionBits = 0
)

const (
	MsgTypeFullClientRequest    MsgType = 0b1
	MsgTypeAudioOnlyClient      MsgType = 0b10
	MsgTypeFullServerResponse   MsgType = 0b1001
	MsgTypeAudioOnlyServer      MsgType = 0b1011
	MsgTypeFrontEndResultServer MsgType = 0b1100
	MsgTypeError                MsgType = 0b1111
)

func (t MsgType) String() string {
	switch t {
	case MsgTypeFullClientRequest:
		return "MsgType_FullClientRequest"
	case MsgTypeAudioOnlyClient:
		return "MsgType_AudioOnlyClient"
	case MsgTypeFullServerResponse:
		return "MsgType_FullServerResponse"
	case MsgTypeAudioOnlyServer:
		return "MsgType_AudioOnlyServer"
	case MsgTypeError:
		return "MsgType_Error"
	case MsgTypeFrontEndResultServer:
		return "MsgType_FrontEndResultServer"
	default:
		return fmt.Sprintf("MsgType_(%d)", t)
	}
}

const (
	EventType_None EventType = 0

	EventType_StartConnection  EventType = 1
	EventType_FinishConnection EventType = 2

	EventType_ConnectionStarted  EventType = 50
	EventType_ConnectionFailed   EventType = 51
	EventType_ConnectionFinished EventType = 52

	EventType_StartSession  EventType = 100
	EventType_CancelSession EventType = 101
	EventType_FinishSession EventType = 102

	EventType_SessionStarted  EventType = 150
	EventType_SessionCanceled EventType = 151
	EventType_SessionFinished EventType = 152
	EventType_SessionFailed   EventType = 153

	EventType_UsageResponse EventType = 154

	EventType_TaskRequest  EventType = 200
	EventType_UpdateConfig EventType = 201

	EventType_AudioMuted EventType = 250

	EventType_SayHello EventType = 300

	EventType_TTSSentenceStart     EventType = 350
	EventType_TTSSentenceEnd       EventType = 351
	EventType_TTSResponse          EventType = 352
	EventType_TTSEnded             EventType = 359
	EventType_PodcastRoundStart    EventType = 360
	EventType_PodcastRoundResponse EventType = 361
	EventType_PodcastRoundEnd      EventType = 362

	EventType_ASRInfo     EventType = 450
	EventType_ASRResponse EventType = 451
	EventType_ASREnded    EventType = 459

	EventType_ChatTTSText EventType = 500

	EventType_ChatResponse EventType = 550
	EventType_ChatEnded    EventType = 559

	EventType_SourceSubtitleStart    EventType = 650
	EventType_SourceSubtitleResponse EventType = 651
	EventType_SourceSubtitleEnd      EventType = 652

	EventType_TranslationSubtitleStart    EventType = 653
	EventType_TranslationSubtitleResponse EventType = 654
	EventType_TranslationSubtitleEnd      EventType = 655
)

func (t EventType) String() string {
	switch t {
	case EventType_None:
		return "EventType_None"
	case EventType_StartConnection:
		return "EventType_StartConnection"
	case EventType_FinishConnection:
		return "EventType_FinishConnection"
	case EventType_ConnectionStarted:
		return "EventType_ConnectionStarted"
	case EventType_ConnectionFailed:
		return "EventType_ConnectionFailed"
	case EventType_ConnectionFinished:
		return "EventType_ConnectionFinished"
	case EventType_StartSession:
		return "EventType_StartSession"
	case EventType_CancelSession:
		return "EventType_CancelSession"
	case EventType_FinishSession:
		return "EventType_FinishSession"
	case EventType_SessionStarted:
		return "EventType_SessionStarted"
	case EventType_SessionCanceled:
		return "EventType_SessionCanceled"
	case EventType_SessionFinished:
		return "EventType_SessionFinished"
	case EventType_SessionFailed:
		return "EventType_SessionFailed"
	case EventType_UsageResponse:
		return "EventType_UsageResponse"
	case EventType_TaskRequest:
		return "EventType_TaskRequest"
	case EventType_UpdateConfig:
		return "EventType_UpdateConfig"
	case EventType_AudioMuted:
		return "EventType_AudioMuted"
	case EventType_SayHello:
		return "EventType_SayHello"
	case EventType_TTSSentenceStart:
		return "EventType_TTSSentenceStart"
	case EventType_TTSSentenceEnd:
		return "EventType_TTSSentenceEnd"
	case EventType_TTSResponse:
		return "EventType_TTSResponse"
	case EventType_TTSEnded:
		return "EventType_TTSEnded"
	case EventType_PodcastRoundStart:
		return "EventType_PodcastRoundStart"
	case EventType_PodcastRoundResponse:
		return "EventType_PodcastRoundResponse"
	case EventType_PodcastRoundEnd:
		return "EventType_PodcastRoundEnd"
	case EventType_ASRInfo:
		return "EventType_ASRInfo"
	case EventType_ASRResponse:
		return "EventType_ASRResponse"
	case EventType_ASREnded:
		return "EventType_ASREnded"
	case EventType_ChatTTSText:
		return "EventType_ChatTTSText"
	case EventType_ChatResponse:
		return "EventType_ChatResponse"
	case EventType_ChatEnded:
		return "EventType_ChatEnded"
	case EventType_SourceSubtitleStart:
		return "EventType_SourceSubtitleStart"
	case EventType_SourceSubtitleResponse:
		return "EventType_SourceSubtitleResponse"
	case EventType_SourceSubtitleEnd:
		return "EventType_SourceSubtitleEnd"
	case EventType_TranslationSubtitleStart:
		return "EventType_TranslationSubtitleStart"
	case EventType_TranslationSubtitleResponse:
		return "EventType_TranslationSubtitleResponse"
	case EventType_TranslationSubtitleEnd:
		return "EventType_TranslationSubtitleEnd"
	default:
		return fmt.Sprintf("EventType_(%d)", t)
	}
}
