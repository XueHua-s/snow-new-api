package dto

// ChannelPin binds a request to the channel selected by its API credential.
type ChannelPin struct{ ChannelId int }
type ChannelFilterKind string

const (
	FilterRequestPath        ChannelFilterKind = "request_path"
	FilterResponsesWebSocket ChannelFilterKind = "responses_websocket"
)

type ChannelFilter struct {
	Kind        ChannelFilterKind
	RequestPath string
}
type ChannelConstraints struct {
	Pin     *ChannelPin
	Filters []ChannelFilter
}

func (c *ChannelConstraints) AddPin(pin ChannelPin)          { c.Pin = &pin }
func (c *ChannelConstraints) AddFilter(filter ChannelFilter) { c.Filters = append(c.Filters, filter) }
func (c *ChannelConstraints) ResolvedPin() (ChannelPin, bool) {
	if c == nil || c.Pin == nil {
		return ChannelPin{}, false
	}
	return *c.Pin, true
}
func (c *ChannelConstraints) SuppressesRetry() bool { return c != nil && c.Pin != nil }
