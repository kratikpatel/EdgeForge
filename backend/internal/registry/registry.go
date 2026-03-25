package registry

import (
	"fmt"
	"sync"
)

type ServiceInstance struct {
	Name    string `json:"name"`
	URL     string `json:"url"`
	Healthy bool   `json:"healthy"`
}

type ServiceRegistry struct {
	mu       sync.RWMutex
	services map[string][]ServiceInstance
}

func New() *ServiceRegistry {
	return &ServiceRegistry{
		services: map[string][]ServiceInstance{
			"orders": {
				{
					Name:    "orders-service-1",
					URL:     "http://localhost:9001",
					Healthy: true,
				},
				{
					Name:    "orders-service-2",
					URL:     "http://localhost:9002",
					Healthy: true,
				},
			},
			"analytics": {
				{
					Name:    "analytics-service-1",
					URL:     "http://localhost:9011",
					Healthy: true,
				},
				{
					Name:    "analytics-service-2",
					URL:     "http://localhost:9012",
					Healthy: true,
				},
			},
		},
	}
}

func (r *ServiceRegistry) GetInstances(serviceName string) ([]ServiceInstance, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	instances, ok := r.services[serviceName]
	if !ok {
		return nil, fmt.Errorf("service %q not found", serviceName)
	}

	copied := make([]ServiceInstance, len(instances))
	copy(copied, instances)
	return copied, nil
}

func (r *ServiceRegistry) GetHealthyInstances(serviceName string) ([]ServiceInstance, error) {
	instances, err := r.GetInstances(serviceName)
	if err != nil {
		return nil, err
	}

	healthy := make([]ServiceInstance, 0)
	for _, instance := range instances {
		if instance.Healthy {
			healthy = append(healthy, instance)
		}
	}

	if len(healthy) == 0 {
		return nil, fmt.Errorf("no healthy instances available for service %q", serviceName)
	}

	return healthy, nil
}

func (r *ServiceRegistry) GetAll() map[string][]ServiceInstance {
	r.mu.RLock()
	defer r.mu.RUnlock()

	copied := make(map[string][]ServiceInstance, len(r.services))
	for serviceName, instances := range r.services {
		instanceCopy := make([]ServiceInstance, len(instances))
		copy(instanceCopy, instances)
		copied[serviceName] = instanceCopy
	}

	return copied
}

func (r *ServiceRegistry) SetInstanceHealth(serviceName, instanceName string, healthy bool) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	instances, ok := r.services[serviceName]
	if !ok {
		return fmt.Errorf("service %q not found", serviceName)
	}

	for i := range instances {
		if instances[i].Name == instanceName {
			instances[i].Healthy = healthy
			r.services[serviceName] = instances
			return nil
		}
	}

	return fmt.Errorf("instance %q not found for service %q", instanceName, serviceName)
}
