package channel

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type cancelTestAdaptor struct {
	Adaptor
	url string
}

func (a cancelTestAdaptor) GetRequestURL(*relaycommon.RelayInfo) (string, error) { return a.url, nil }
func (a cancelTestAdaptor) SetupRequestHeader(*gin.Context, *http.Header, *relaycommon.RelayInfo) error {
	return nil
}

func TestRelayCancelsHeaderWaitWhenClientDisconnects(t *testing.T) {
	service.InitHttpClient()
	for name, send := range map[string]func(Adaptor, *gin.Context, *relaycommon.RelayInfo, io.Reader) (*http.Response, error){"api": DoApiRequest, "form": DoFormRequest} {
		t.Run(name, func(t *testing.T) {
			arrived := make(chan struct{})
			stopped := make(chan struct{})
			release := make(chan struct{})
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = io.Copy(io.Discard, r.Body)
				close(arrived)
				select {
				case <-r.Context().Done():
					close(stopped)
				case <-release:
				}
			}))
			defer server.Close()
			defer close(release)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil).WithContext(ctx)
			info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{}}
			done := make(chan error, 1)
			go func() {
				resp, err := send(cancelTestAdaptor{url: server.URL}, c, info, strings.NewReader("{}"))
				if resp != nil {
					resp.Body.Close()
				}
				done <- err
			}()
			select {
			case <-arrived:
			case <-time.After(5 * time.Second):
				t.Fatal("upstream request did not arrive")
			}
			cancel()
			select {
			case err := <-done:
				require.Error(t, err)
			case <-time.After(5 * time.Second):
				t.Fatal("client cancellation did not stop header wait")
			}
			select {
			case <-stopped:
			case <-time.After(5 * time.Second):
				t.Fatal("upstream did not observe cancellation")
			}
			assert.ErrorIs(t, ctx.Err(), context.Canceled)
		})
	}
}
