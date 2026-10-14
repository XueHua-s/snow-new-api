package dto

import (
	"strings"

	kitutil "github.com/QuantumNous/new-api/relaykit/relayconvert/kitutil"
	"github.com/QuantumNous/new-api/relaykit/types"
)

func (c *ClaudeRequest) GetTokenCountMeta() *types.TokenCountMeta {
	maxTokens := 0
	if c.MaxTokens != nil {
		maxTokens = int(*c.MaxTokens)
	}
	var tokenCountMeta = types.TokenCountMeta{
		TokenType: types.TokenTypeTokenizer,
		MaxTokens: maxTokens,
	}

	var texts = make([]string, 0)
	var fileMeta = make([]*types.FileMeta, 0)

	// system
	if c.System != nil {
		if c.IsStringSystem() {
			sys := c.GetStringSystem()
			if sys != "" {
				texts = append(texts, sys)
			}
		} else {
			systemMedia := c.ParseSystem()
			for _, media := range systemMedia {
				switch media.Type {
				case "text":
					texts = append(texts, media.GetText())
				case "image":
					if source := media.ToFileSource(); source != nil {
						fileMeta = append(fileMeta, &types.FileMeta{
							FileType: types.FileTypeImage,
							Source:   source,
						})
					}
				}
			}
		}
	}

	// messages
	for _, message := range c.Messages {
		tokenCountMeta.MessagesCount++
		texts = append(texts, message.Role)
		if message.IsStringContent() {
			content := message.GetStringContent()
			if content != "" {
				texts = append(texts, content)
			}
			continue
		}

		content, _ := message.ParseContent()
		for _, media := range content {
			switch media.Type {
			case "text":
				texts = append(texts, media.GetText())
			case "image":
				if source := media.ToFileSource(); source != nil {
					fileMeta = append(fileMeta, &types.FileMeta{
						FileType: types.FileTypeImage,
						Source:   source,
					})
				}
			case "tool_use":
				if media.Name != "" {
					texts = append(texts, media.Name)
				}
				if media.Input != nil {
					b, _ := kitutil.Marshal(media.Input)
					texts = append(texts, string(b))
				}
			case "tool_result":
				if media.Content != nil {
					b, _ := kitutil.Marshal(media.Content)
					texts = append(texts, string(b))
				}
			}
		}
	}

	// tools
	if c.Tools != nil {
		tools := c.GetTools()
		normalTools, webSearchTools := ProcessTools(tools)
		if normalTools != nil {
			for _, t := range normalTools {
				tokenCountMeta.ToolsCount++
				if t.Name != "" {
					texts = append(texts, t.Name)
				}
				if t.Description != "" {
					texts = append(texts, t.Description)
				}
				if t.InputSchema != nil {
					b, _ := kitutil.Marshal(t.InputSchema)
					texts = append(texts, string(b))
				}
			}
		}
		if webSearchTools != nil {
			for _, t := range webSearchTools {
				tokenCountMeta.ToolsCount++
				if t.Name != "" {
					texts = append(texts, t.Name)
				}
				if t.UserLocation != nil {
					b, _ := kitutil.Marshal(t.UserLocation)
					texts = append(texts, string(b))
				}
			}
		}
	}

	tokenCountMeta.CombineText = strings.Join(texts, "\n")
	tokenCountMeta.Files = fileMeta
	return &tokenCountMeta
}
