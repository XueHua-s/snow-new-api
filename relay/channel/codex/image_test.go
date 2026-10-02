package codex

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestConvertImageRequestUsesNativeImageTool(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	n := uint(1)
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeImagesGenerations}
	converted, err := (&Adaptor{}).ConvertImageRequest(c, info, dto.ImageRequest{
		Model:   "gpt-image-2-codex",
		Prompt:  "draw a blue square",
		N:       &n,
		Size:    "1024x1024",
		Quality: "low",
	})
	require.NoError(t, err)
	request := converted.(dto.OpenAIResponsesRequest)
	require.Equal(t, codexImageToolHostModel, request.Model)
	require.JSONEq(t, `[{"role":"user","content":[{"type":"input_text","text":"draw a blue square"}]}]`, string(request.Input))
	require.Contains(t, string(request.Tools), `"type":"image_generation"`)
	require.NotContains(t, string(request.Tools), `"n"`)
	require.True(t, *request.Stream)
}

func TestCodexImageGenerationHandlerConvertsSSE(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	stream := strings.Join([]string{
		`event: response.created`,
		`data: {"type":"response.created","response":{"created_at":123}}`,
		``,
		`event: response.output_item.done`,
		`data: {"type":"response.output_item.done","item":{"type":"image_generation_call","result":"aW1hZ2U=","revised_prompt":"blue square"}}`,
		``,
		`event: response.completed`,
		`data: {"type":"response.completed","response":{"usage":{"input_tokens":2,"output_tokens":3,"total_tokens":5},"tool_usage":{"image_gen":{"input_tokens":7,"output_tokens":11,"total_tokens":18}}}}`,
		``,
	}, "\n")
	resp := &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(stream))}
	usage, apiErr := codexImageGenerationHandler(c, resp)
	require.Nil(t, apiErr)
	require.JSONEq(t, `{"created":123,"data":[{"url":"","b64_json":"aW1hZ2U=","revised_prompt":"blue square"}]}`, w.Body.String())
	require.Equal(t, 9, usage.PromptTokens)
	require.Equal(t, 14, usage.CompletionTokens)
	require.Equal(t, 23, usage.TotalTokens)
}
