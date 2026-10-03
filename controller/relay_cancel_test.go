package controller

import (
	"context"
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestRelayDoesNotRetryAfterClientCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses", nil).WithContext(ctx)
	err := types.NewError(errors.New("upstream disconnected"), types.ErrorCodeDoRequestFailed)
	assert.False(t, shouldRetry(c, err, 3))
}
