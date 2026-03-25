package loadbalancer

import (
	"sync"

	"edgeforge/backend/internal/registry"
)

type RoundRobin struct {
	mu      sync.Mutex
	indices map[string]int
}

func NewRoundRobin() *RoundRobin {
	return &RoundRobin{
		indices: make(map[string]int),
	}
}

func (rr *RoundRobin) Select(serviceName string, instances []registry.ServiceInstance) registry.ServiceInstance {
	rr.mu.Lock()
	defer rr.mu.Unlock()

	currentIndex := rr.indices[serviceName]
	selected := instances[currentIndex%len(instances)]
	rr.indices[serviceName] = (currentIndex + 1) % len(instances)

	return selected
}

func (rr *RoundRobin) GetIndex(serviceName string) int {
	rr.mu.Lock()
	defer rr.mu.Unlock()

	return rr.indices[serviceName]
}
