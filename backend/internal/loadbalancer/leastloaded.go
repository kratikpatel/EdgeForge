package loadbalancer

import "edgeforge/backend/internal/registry"

type LeastLoaded struct{}

func NewLeastLoaded() *LeastLoaded {
	return &LeastLoaded{}
}

func (ll *LeastLoaded) Select(instances []registry.ServiceInstance) registry.ServiceInstance {
	selected := instances[0]

	for _, instance := range instances[1:] {
		if instance.ActiveRequests < selected.ActiveRequests {
			selected = instance
		}
	}

	return selected
}
