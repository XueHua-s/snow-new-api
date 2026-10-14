package dto

import (
	"encoding/json"
	"mime"
	"path/filepath"
	"strings"

	kitutil "github.com/QuantumNous/new-api/relaykit/relayconvert/kitutil"
	"github.com/QuantumNous/new-api/relaykit/types"
)

type Message struct {
	Role             string          `json:"role"`
	Content          any             `json:"content"`
	Name             *string         `json:"name,omitempty"`
	Prefix           *bool           `json:"prefix,omitempty"`
	ReasoningContent *string         `json:"reasoning_content,omitempty"`
	Reasoning        *string         `json:"reasoning,omitempty"`
	ToolCalls        json.RawMessage `json:"tool_calls,omitempty"`
	ToolCallId       string          `json:"tool_call_id,omitempty"`
	parsedContent    []MediaContent
	//parsedStringContent *string
}

type MediaContent struct {
	Type       string `json:"type"`
	Text       string `json:"text,omitempty"`
	ImageUrl   any    `json:"image_url,omitempty"`
	InputAudio any    `json:"input_audio,omitempty"`
	File       any    `json:"file,omitempty"`
	VideoUrl   any    `json:"video_url,omitempty"`
	// OpenRouter Params
	CacheControl json.RawMessage `json:"cache_control,omitempty"`
}

func (m *MediaContent) GetImageMedia() *MessageImageUrl {
	if m.ImageUrl != nil {
		if _, ok := m.ImageUrl.(*MessageImageUrl); ok {
			return m.ImageUrl.(*MessageImageUrl)
		}
		if itemMap, ok := m.ImageUrl.(map[string]any); ok {
			out := &MessageImageUrl{
				Url:      kitutil.Interface2String(itemMap["url"]),
				Detail:   kitutil.Interface2String(itemMap["detail"]),
				MimeType: kitutil.Interface2String(itemMap["mime_type"]),
			}
			return out
		}
	}
	return nil
}

func (m *MediaContent) GetInputAudio() *MessageInputAudio {
	if m.InputAudio != nil {
		if _, ok := m.InputAudio.(*MessageInputAudio); ok {
			return m.InputAudio.(*MessageInputAudio)
		}
		if itemMap, ok := m.InputAudio.(map[string]any); ok {
			out := &MessageInputAudio{
				Data:   kitutil.Interface2String(itemMap["data"]),
				Format: kitutil.Interface2String(itemMap["format"]),
			}
			return out
		}
	}
	return nil
}

func (m *MediaContent) GetFile() *MessageFile {
	if m.File != nil {
		if _, ok := m.File.(*MessageFile); ok {
			return m.File.(*MessageFile)
		}
		if itemMap, ok := m.File.(map[string]any); ok {
			fileName := kitutil.Interface2String(itemMap["filename"])
			if fileName == "" {
				fileName = kitutil.Interface2String(itemMap["file_name"])
			}
			out := &MessageFile{
				FileName: fileName,
				FileData: kitutil.Interface2String(itemMap["file_data"]),
				FileId:   kitutil.Interface2String(itemMap["file_id"]),
			}
			return out
		}
	}
	return nil
}

func (m *MediaContent) GetVideoUrl() *MessageVideoUrl {
	if m.VideoUrl != nil {
		if _, ok := m.VideoUrl.(*MessageVideoUrl); ok {
			return m.VideoUrl.(*MessageVideoUrl)
		}
		if itemMap, ok := m.VideoUrl.(map[string]any); ok {
			out := &MessageVideoUrl{
				Url: kitutil.Interface2String(itemMap["url"]),
			}
			return out
		}
	}
	return nil
}

func (m *MediaContent) ToFileSource() types.FileSource {
	switch m.Type {
	case ContentTypeImageURL:
		img := m.GetImageMedia()
		if img == nil || img.Url == "" {
			return nil
		}
		return types.NewFileSourceFromData(img.Url, img.MimeType)
	case ContentTypeInputAudio:
		audio := m.GetInputAudio()
		if audio == nil || audio.Data == "" {
			return nil
		}
		mimeType := ""
		if audio.Format != "" {
			mimeType = "audio/" + audio.Format
		}
		return types.NewFileSourceFromData(audio.Data, mimeType)
	case ContentTypeFile:
		file := m.GetFile()
		if file == nil || file.FileData == "" {
			return nil
		}
		mimeType := ""
		if ext := filepath.Ext(file.FileName); ext != "" {
			mimeType = mime.TypeByExtension(ext)
		}
		return types.NewFileSourceFromData(file.FileData, mimeType)
	case ContentTypeVideoUrl:
		video := m.GetVideoUrl()
		if video == nil || video.Url == "" {
			return nil
		}
		return types.NewFileSourceFromData(video.Url, "")
	}
	return nil
}

type MessageImageUrl struct {
	Url      string `json:"url"`
	Detail   string `json:"detail,omitempty"`
	MimeType string
}

func (m *MessageImageUrl) IsRemoteImage() bool {
	return strings.HasPrefix(m.Url, "http")
}

type MessageInputAudio struct {
	Data   string `json:"data"` //base64
	Format string `json:"format"`
}

type MessageFile struct {
	FileName string `json:"filename,omitempty"`
	FileData string `json:"file_data,omitempty"`
	FileId   string `json:"file_id,omitempty"`
}

type MessageVideoUrl struct {
	Url string `json:"url"`
}

const (
	ContentTypeText       = "text"
	ContentTypeImageURL   = "image_url"
	ContentTypeInputAudio = "input_audio"
	ContentTypeFile       = "file"
	ContentTypeVideoUrl   = "video_url" // 阿里百炼视频识别
	//ContentTypeAudioUrl   = "audio_url"
)

func (m *Message) GetReasoningContent() string {
	if m.ReasoningContent == nil && m.Reasoning == nil {
		return ""
	}
	if m.ReasoningContent != nil {
		return *m.ReasoningContent
	}
	return *m.Reasoning
}

func (m *Message) GetPrefix() bool {
	if m.Prefix == nil {
		return false
	}
	return *m.Prefix
}

func (m *Message) SetPrefix(prefix bool) {
	m.Prefix = &prefix
}

func (m *Message) ParseToolCalls() []ToolCallRequest {
	if m.ToolCalls == nil {
		return nil
	}
	var toolCalls []ToolCallRequest
	if err := json.Unmarshal(m.ToolCalls, &toolCalls); err == nil {
		return toolCalls
	}
	return toolCalls
}

func (m *Message) SetToolCalls(toolCalls any) {
	toolCallsJson, _ := json.Marshal(toolCalls)
	m.ToolCalls = toolCallsJson
}

func (m *Message) StringContent() string {
	switch m.Content.(type) {
	case string:
		return m.Content.(string)
	case []any:
		var contentStr string
		for _, contentItem := range m.Content.([]any) {
			contentMap, ok := contentItem.(map[string]any)
			if !ok {
				continue
			}
			if contentMap["type"] == ContentTypeText {
				if subStr, ok := contentMap["text"].(string); ok {
					contentStr += subStr
				}
			}
		}
		return contentStr
	}

	return ""
}

func (m *Message) SetNullContent() {
	m.Content = nil
	m.parsedContent = nil
}

func (m *Message) SetStringContent(content string) {
	m.Content = content
	m.parsedContent = nil
}

func (m *Message) SetMediaContent(content []MediaContent) {
	m.Content = content
	m.parsedContent = content
}

func (m *Message) IsStringContent() bool {
	_, ok := m.Content.(string)
	if ok {
		return true
	}
	return false
}

func (m *Message) ParseContent() []MediaContent {
	if m.Content == nil {
		return nil
	}
	if len(m.parsedContent) > 0 {
		return m.parsedContent
	}

	var contentList []MediaContent
	// 先尝试解析为字符串
	content, ok := m.Content.(string)
	if ok {
		contentList = []MediaContent{{
			Type: ContentTypeText,
			Text: content,
		}}
		m.parsedContent = contentList
		return contentList
	}

	// 尝试解析为数组
	//var arrayContent []map[string]interface{}

	arrayContent, ok := m.Content.([]any)
	if !ok {
		return contentList
	}

	for _, contentItemAny := range arrayContent {
		mediaItem, ok := contentItemAny.(MediaContent)
		if ok {
			contentList = append(contentList, mediaItem)
			continue
		}

		contentItem, ok := contentItemAny.(map[string]any)
		if !ok {
			continue
		}
		contentType, ok := contentItem["type"].(string)
		if !ok {
			continue
		}

		switch contentType {
		case ContentTypeText:
			if text, ok := contentItem["text"].(string); ok {
				contentList = append(contentList, MediaContent{
					Type: ContentTypeText,
					Text: text,
				})
			}

		case ContentTypeImageURL:
			imageUrl := contentItem["image_url"]
			temp := &MessageImageUrl{
				Detail: "high",
			}
			switch v := imageUrl.(type) {
			case string:
				temp.Url = v
			case map[string]interface{}:
				url, ok1 := v["url"].(string)
				detail, ok2 := v["detail"].(string)
				if ok2 {
					temp.Detail = detail
				}
				if ok1 {
					temp.Url = url
				}
			}
			contentList = append(contentList, MediaContent{
				Type:     ContentTypeImageURL,
				ImageUrl: temp,
			})

		case ContentTypeInputAudio:
			if audioData, ok := contentItem["input_audio"].(map[string]interface{}); ok {
				data, ok1 := audioData["data"].(string)
				format, ok2 := audioData["format"].(string)
				if ok1 && ok2 {
					temp := &MessageInputAudio{
						Data:   data,
						Format: format,
					}
					contentList = append(contentList, MediaContent{
						Type:       ContentTypeInputAudio,
						InputAudio: temp,
					})
				}
			}
		case ContentTypeFile:
			if fileData, ok := contentItem["file"].(map[string]interface{}); ok {
				fileId, ok3 := fileData["file_id"].(string)
				if ok3 {
					contentList = append(contentList, MediaContent{
						Type: ContentTypeFile,
						File: &MessageFile{
							FileId: fileId,
						},
					})
				} else {
					fileName, ok1 := fileData["filename"].(string)
					fileDataStr, ok2 := fileData["file_data"].(string)
					if ok1 && ok2 {
						contentList = append(contentList, MediaContent{
							Type: ContentTypeFile,
							File: &MessageFile{
								FileName: fileName,
								FileData: fileDataStr,
							},
						})
					}
				}
			}
		case ContentTypeVideoUrl:
			if videoUrl, ok := contentItem["video_url"].(string); ok {
				contentList = append(contentList, MediaContent{
					Type: ContentTypeVideoUrl,
					VideoUrl: &MessageVideoUrl{
						Url: videoUrl,
					},
				})
			}
		}
	}

	if len(contentList) > 0 {
		m.parsedContent = contentList
	}
	return contentList
}
