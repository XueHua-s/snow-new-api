package dto

import (
	"testing"

	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/require"
)

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
