package metrics

import (
	"sync"
	"sync/atomic"
	"time"

	"edgeforge/backend/internal/registry"
)

type InstanceMetrics struct {
	Requests uint64 `json:"requests"`
	Failures uint64 `json:"failures"`
}

type Metrics struct {
	startTime time.Time

	requestsTotal     atomic.Uint64
	errorsTotal       atomic.Uint64
	rateLimitedTotal  atomic.Uint64
	activeSimulations atomic.Int64

	mu                 sync.RWMutex
	serviceRequests    map[string]uint64
	instanceStatistics map[string]map[string]InstanceMetrics
}

func New() *Metrics {
	return &Metrics{
		startTime:          time.Now(),
		serviceRequests:    make(map[string]uint64),
		instanceStatistics: make(map[string]map[string]InstanceMetrics),
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

func (m *Metrics) IncServiceRequests(serviceName string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.serviceRequests[serviceName]++
}

func (m *Metrics) IncInstanceRequests(serviceName, instanceName string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.instanceStatistics[serviceName]; !ok {
		m.instanceStatistics[serviceName] = make(map[string]InstanceMetrics)
	}

	stats := m.instanceStatistics[serviceName][instanceName]
	stats.Requests++
	m.instanceStatistics[serviceName][instanceName] = stats
}

func (m *Metrics) IncInstanceFailures(serviceName, instanceName string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.instanceStatistics[serviceName]; !ok {
		m.instanceStatistics[serviceName] = make(map[string]InstanceMetrics)
	}

	stats := m.instanceStatistics[serviceName][instanceName]
	stats.Failures++
	m.instanceStatistics[serviceName][instanceName] = stats
}

func (m *Metrics) GetServiceRequests(serviceName string) uint64 {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.serviceRequests[serviceName]
}

func (m *Metrics) GetInstanceMetrics(serviceName, instanceName string) InstanceMetrics {
	m.mu.RLock()
	defer m.mu.RUnlock()

	serviceStats, ok := m.instanceStatistics[serviceName]
	if !ok {
		return InstanceMetrics{}
	}

	return serviceStats[instanceName]
}

func (m *Metrics) Snapshot() map[string]any {
	uptimeSec := int64(time.Since(m.startTime).Seconds())

	m.mu.RLock()
	serviceRequestsCopy := make(map[string]uint64, len(m.serviceRequests))
	for serviceName, count := range m.serviceRequests {
		serviceRequestsCopy[serviceName] = count
	}

	instanceStatisticsCopy := make(map[string]map[string]InstanceMetrics, len(m.instanceStatistics))
	for serviceName, instances := range m.instanceStatistics {
		instanceCopy := make(map[string]InstanceMetrics, len(instances))
		for instanceName, stats := range instances {
			instanceCopy[instanceName] = stats
		}
		instanceStatisticsCopy[serviceName] = instanceCopy
	}
	m.mu.RUnlock()

	return map[string]any{
		"uptimeSec":          uptimeSec,
		"requestsTotal":      m.requestsTotal.Load(),
		"errorsTotal":        m.errorsTotal.Load(),
		"rateLimitedTotal":   m.rateLimitedTotal.Load(),
		"activeSimulations":  m.activeSimulations.Load(),
		"serviceRequests":    serviceRequestsCopy,
		"instanceStatistics": instanceStatisticsCopy,
	}
}

func (m *Metrics) ServiceSnapshot(serviceRegistry *registry.ServiceRegistry) map[string]any {
	allServices := serviceRegistry.GetAll()

	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make(map[string]any, len(allServices))

	for serviceName, instances := range allServices {
		serviceData := map[string]any{
			"requests":  m.serviceRequests[serviceName],
			"instances": make([]map[string]any, 0, len(instances)),
		}

		for _, instance := range instances {
			stats := InstanceMetrics{}
			if serviceStats, ok := m.instanceStatistics[serviceName]; ok {
				stats = serviceStats[instance.Name]
			}

			serviceData["instances"] = append(serviceData["instances"].([]map[string]any), map[string]any{
				"name":           instance.Name,
				"url":            instance.URL,
				"healthy":        instance.Healthy,
				"activeRequests": instance.ActiveRequests,
				"requests":       stats.Requests,
				"failures":       stats.Failures,
			})
		}

		result[serviceName] = serviceData
	}

	return result
}

func (m *Metrics) APISnapshot(serviceRegistry *registry.ServiceRegistry) map[string]any {
	return map[string]any{
		"gateway":  m.Snapshot(),
		"services": m.ServiceSnapshot(serviceRegistry),
	}
}
