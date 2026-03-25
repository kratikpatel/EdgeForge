package registry

import "fmt"

type ServiceInstance struct {
	Name    string `json:"name"`
	URL     string `json:"url"`
	Healthy bool   `json:"healthy"`
}

type ServiceRegistry struct {
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
			},
			"analytics": {
				{
					Name:    "analytics-service-1",
					URL:     "http://localhost:9011",
					Healthy: true,
				},
			},
		},
	}
}

func (r *ServiceRegistry) GetInstances(serviceName string) ([]ServiceInstance, error) {
	instances, ok := r.services[serviceName]
	if !ok {
		return nil, fmt.Errorf("service %q not found", serviceName)
	}
	return instances, nil
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
	return r.services
}
