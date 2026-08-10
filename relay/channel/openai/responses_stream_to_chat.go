package openai

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

// OaiResponsesStreamToChatHandler collects a Responses SSE stream and emits a
// single non-streaming response in the caller's original relay format. This is
// used when an upstream requires streaming even though the downstream request
// was non-streaming.
func OaiResponsesStreamToChatHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	if resp == nil || resp.Body == nil {
		return nil, types.NewOpenAIError(fmt.Errorf("invalid response"), types.ErrorCodeBadResponse, http.StatusInternalServerError)
	}
	defer service.CloseResponseBodyGracefully(resp)

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, helper.InitialScannerBufferSize), helper.DefaultMaxScannerBufferSize)

	var completed *dto.OpenAIResponsesResponse
	outputItems := make(map[int]dto.ResponsesOutput)
	nextOutputIndex := 0
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}

		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" || data == "[DONE]" {
			continue
		}

		var event dto.ResponsesStreamResponse
		if err := common.UnmarshalJsonStr(data, &event); err != nil {
			return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
		}

		switch event.Type {
		case "response.output_item.done":
			if event.Item != nil {
				outputIndex := nextOutputIndex
				if event.OutputIndex != nil {
					outputIndex = *event.OutputIndex
				}
				outputItems[outputIndex] = *event.Item
				if outputIndex >= nextOutputIndex {
					nextOutputIndex = outputIndex + 1
				}
			}
		case "response.completed":
			if event.Response != nil {
				completed = event.Response
			}
		case "response.error", "response.failed":
			if event.Response != nil {
				if oaiErr := event.Response.GetOpenAIError(); oaiErr != nil && oaiErr.Type != "" {
					return nil, types.WithOpenAIError(*oaiErr, http.StatusInternalServerError)
				}
			}
			return nil, types.NewOpenAIError(fmt.Errorf("responses stream error: %s", event.Type), types.ErrorCodeBadResponse, http.StatusInternalServerError)
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError)
	}
	if completed == nil {
		return nil, types.NewOpenAIError(fmt.Errorf("responses stream ended without response.completed"), types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	// The ChatGPT Codex backend currently omits output from the
	// response.completed payload. Rebuild it from the complete output-item
	// events while retaining the normal Responses API payload when present.
	if len(completed.Output) == 0 && len(outputItems) > 0 {
		indices := make([]int, 0, len(outputItems))
		for index := range outputItems {
			indices = append(indices, index)
		}
		sort.Ints(indices)
		completed.Output = make([]dto.ResponsesOutput, 0, len(indices))
		for _, index := range indices {
			completed.Output = append(completed.Output, outputItems[index])
		}
	}

	body, err := common.Marshal(completed)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeJsonMarshalFailed, http.StatusInternalServerError)
	}

	aggregatedResp := &http.Response{
		StatusCode: resp.StatusCode,
		Header:     resp.Header.Clone(),
		Body:       io.NopCloser(bytes.NewReader(body)),
	}
	aggregatedResp.Header.Set("Content-Type", "application/json")
	aggregatedResp.Header.Del("Content-Length")
	return OaiResponsesToChatHandler(c, info, aggregatedResp)
}
