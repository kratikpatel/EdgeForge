package loadbalancer

import (
	"testing"

	"edgeforge/backend/internal/registry"
)

func TestLeastLoadedSelectChoosesLowestActiveRequests(t *testing.T) {
	ll := NewLeastLoaded()

	instances := []registry.ServiceInstance{
		{Name: "orders-service-1", URL: "http://localhost:9001", Healthy: true, ActiveRequests: 3},
		{Name: "orders-service-2", URL: "http://localhost:9002", Healthy: true, ActiveRequests: 1},
	}

	selected := ll.Select(instances)

	if selected.Name != "orders-service-2" {
		t.Fatalf("expected least-loaded instance to be orders-service-2, got %s", selected.Name)
	}
}

func TestLeastLoadedSelectReturnsFirstInstanceOnTie(t *testing.T) {
	ll := NewLeastLoaded()

	instances := []registry.ServiceInstance{
		{Name: "analytics-service-1", URL: "http://localhost:9011", Healthy: true, ActiveRequests: 2},
		{Name: "analytics-service-2", URL: "http://localhost:9012", Healthy: true, ActiveRequests: 2},
	}

	selected := ll.Select(instances)

	if selected.Name != "analytics-service-1" {
		t.Fatalf("expected tie to return first instance, got %s", selected.Name)
	}
}

func TestLeastLoadedSelectWorksWithSingleInstance(t *testing.T) {
	ll := NewLeastLoaded()

	instances := []registry.ServiceInstance{
		{Name: "orders-service-1", URL: "http://localhost:9001", Healthy: true, ActiveRequests: 5},
	}

	selected := ll.Select(instances)

	if selected.Name != "orders-service-1" {
		t.Fatalf("expected single instance to be selected, got %s", selected.Name)
	}
}
