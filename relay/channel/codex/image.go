package codex

import (
	"bufio"
	"bytes"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

const maxCodexImageEventBytes = 64 << 20

func isCodexImageModelAlias(model string) bool {
	switch strings.ToLower(strings.TrimSpace(model)) {
	case "gpt-image-2-codex", "chatgpt-image-latest", "imagegen", "gpt-image-2.5":
		return true
	default:
		return false
	}
}

func buildCodexImageGenerationTool(request dto.ImageRequest) map[string]any {
	tool := map[string]any{"type": "image_generation"}
	if value := strings.TrimSpace(request.Size); value != "" {
		tool["size"] = value
	}
	if value := strings.TrimSpace(request.Quality); value != "" {
		if value == "standard" {
			value = "medium"
		}
		tool["quality"] = value
	}
	copyRawJSONField(tool, "background", request.Background)
	copyRawJSONField(tool, "moderation", request.Moderation)
	copyRawJSONField(tool, "output_format", request.OutputFormat)
	copyRawJSONField(tool, "output_compression", request.OutputCompression)
	return tool
}

func copyRawJSONField(target map[string]any, name string, raw []byte) {
	if len(raw) == 0 {
		return
	}
	var value any
	if err := common.Unmarshal(raw, &value); err == nil {
		target[name] = value
	}
}

func codexImageGenerationHandler(c *gin.Context, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	if resp == nil || resp.Body == nil {
		return nil, types.NewOpenAIError(errors.New("codex image generation: empty upstream response"), types.ErrorCodeBadResponse, http.StatusBadGateway)
	}
	defer service.CloseResponseBodyGracefully(resp)

	response := dto.ImageResponse{Created: time.Now().Unix()}
	usage := &dto.Usage{}
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 64*1024), maxCodexImageEventBytes)
	completed := false

	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if !bytes.HasPrefix(line, []byte("data:")) {
			continue
		}
		payload := bytes.TrimSpace(bytes.TrimPrefix(line, []byte("data:")))
		if len(payload) == 0 || bytes.Equal(payload, []byte("[DONE]")) {
			continue
		}

		switch gjson.GetBytes(payload, "type").String() {
		case "response.created":
			if createdAt := gjson.GetBytes(payload, "response.created_at").Int(); createdAt > 0 {
				response.Created = createdAt
			}
		case "response.output_item.done":
			if gjson.GetBytes(payload, "item.type").String() != dto.ResponsesOutputTypeImageGenerationCall {
				continue
			}
			result := gjson.GetBytes(payload, "item.result").String()
			if result != "" {
				response.Data = append(response.Data, dto.ImageData{
					B64Json:       result,
					RevisedPrompt: gjson.GetBytes(payload, "item.revised_prompt").String(),
				})
			}
		case "response.completed":
			completed = true
			mergeCodexUsage(usage, payload, "response.usage")
			mergeCodexUsage(usage, payload, "response.tool_usage.image_gen")
		case "response.failed", "error":
			message := gjson.GetBytes(payload, "response.error.message").String()
			if message == "" {
				message = gjson.GetBytes(payload, "error.message").String()
			}
			if message == "" {
				message = "Codex image generation failed"
			}
			return nil, types.NewOpenAIError(errors.New(message), types.ErrorCodeBadResponse, http.StatusBadGateway)
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusBadGateway)
	}
	if !completed {
		return nil, types.NewOpenAIError(errors.New("codex image generation ended before response.completed"), types.ErrorCodeBadResponse, http.StatusBadGateway)
	}
	if len(response.Data) == 0 {
		return nil, types.NewOpenAIError(errors.New("codex image generation returned no image"), types.ErrorCodeBadResponse, http.StatusBadGateway)
	}

	body, err := common.Marshal(response)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	c.Data(http.StatusOK, "application/json", body)
	return usage, nil
}

func mergeCodexUsage(usage *dto.Usage, payload []byte, path string) {
	input := int(gjson.GetBytes(payload, path+".input_tokens").Int())
	output := int(gjson.GetBytes(payload, path+".output_tokens").Int())
	if input == 0 && output == 0 {
		return
	}
	usage.InputTokens += input
	usage.OutputTokens += output
	usage.PromptTokens += input
	usage.CompletionTokens += output
	usage.TotalTokens += input + output
	usage.PromptTokensDetails.CachedTokens += int(gjson.GetBytes(payload, path+".input_tokens_details.cached_tokens").Int())
	usage.PromptTokensDetails.ImageTokens += int(gjson.GetBytes(payload, path+".input_tokens_details.image_tokens").Int())
	usage.PromptTokensDetails.TextTokens += int(gjson.GetBytes(payload, path+".input_tokens_details.text_tokens").Int())
	usage.CompletionTokenDetails.ImageTokens += int(gjson.GetBytes(payload, path+".output_tokens_details.image_tokens").Int())
	usage.CompletionTokenDetails.TextTokens += int(gjson.GetBytes(payload, path+".output_tokens_details.text_tokens").Int())
	usage.CompletionTokenDetails.ReasoningTokens += int(gjson.GetBytes(payload, path+".output_tokens_details.reasoning_tokens").Int())
}
