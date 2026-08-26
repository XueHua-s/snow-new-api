package dto

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestResponsesStreamOptionsPreserveCodexReasoningSummaryDelivery(t *testing.T) {
	t.Parallel()

	var request OpenAIResponsesRequest
	require.NoError(t, json.Unmarshal([]byte(`{
		"model":"gpt-5.6-sol",
		"stream":true,
		"stream_options":{"reasoning_summary_delivery":"sequential_cutoff"}
	}`), &request))

	require.NotNil(t, request.StreamOptions)
	require.Equal(t, "sequential_cutoff", request.StreamOptions.ReasoningSummaryDelivery)
	encoded, err := json.Marshal(request)
	require.NoError(t, err)
	require.Equal(t, "sequential_cutoff", gjson.GetBytes(encoded, "stream_options.reasoning_summary_delivery").String())
}

func TestMediaContentFileSourceUsesFilenameMimeType(t *testing.T) {
	t.Parallel()

	content := MediaContent{
		Type: ContentTypeFile,
		File: map[string]any{
			"filename":  "spec.pdf",
			"file_data": "JVBERi0xLjQK",
		},
	}

	source := content.ToFileSource()

	require.NotNil(t, source)
	base64Source, ok := source.(*types.Base64Source)
	require.True(t, ok)
	require.Equal(t, "application/pdf", base64Source.MimeType)
}

func TestMediaContentFileSourceSupportsLegacyFileNameKey(t *testing.T) {
	t.Parallel()

	content := MediaContent{
		Type: ContentTypeFile,
		File: map[string]any{
			"file_name": "notes.txt",
			"file_data": "YWxwaGE=",
		},
	}

	source := content.ToFileSource()

	require.NotNil(t, source)
	base64Source, ok := source.(*types.Base64Source)
	require.True(t, ok)
	require.Contains(t, base64Source.MimeType, "text/plain")
}
