package metrics

import (
	"sync/atomic"
	"time"
)

type Metrics struct {
	startTime time.Time

	requestsTotal     atomic.Uint64
	errorsTotal       atomic.Uint64
	rateLimitedTotal  atomic.Uint64
	activeSimulations atomic.Int64
}

func New() *Metrics {
	return &Metrics{
		startTime: time.Now(),
	}
}

func (m *Metrics) IncRequests() {
	m.requestsTotal.Add(1)
}

func (m *Metrics) IncErrors() {
	m.errorsTotal.Add(1)
}

func (m *Metrics) IncRateLimited() {
	m.rateLimitedTotal.Add(1)
}

func (m *Metrics) SetActiveSimulations(n int64) {
	m.activeSimulations.Store(n)
}

func (m *Metrics) Snapshot() map[string]any {
	uptimeSec := int64(time.Since(m.startTime).Seconds())

	return map[string]any{
		"uptimeSec":         uptimeSec,
		"requestsTotal":     m.requestsTotal.Load(),
		"errorsTotal":       m.errorsTotal.Load(),
		"rateLimitedTotal":  m.rateLimitedTotal.Load(),
		"activeSimulations": m.activeSimulations.Load(),
	}
}
