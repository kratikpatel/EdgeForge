package loadbalancer

import (
	"testing"

	"edgeforge/backend/internal/registry"
)

func TestRoundRobinSelectAlternatesInstances(t *testing.T) {
	rr := NewRoundRobin()

	instances := []registry.ServiceInstance{
		{Name: "orders-service-1", URL: "http://localhost:9001", Healthy: true},
		{Name: "orders-service-2", URL: "http://localhost:9002", Healthy: true},
	}

	selected1 := rr.Select("orders", instances)
	selected2 := rr.Select("orders", instances)
	selected3 := rr.Select("orders", instances)

	if selected1.Name != "orders-service-1" {
		t.Fatalf("expected first selection to be orders-service-1, got %s", selected1.Name)
	}
	if selected2.Name != "orders-service-2" {
		t.Fatalf("expected second selection to be orders-service-2, got %s", selected2.Name)
	}
	if selected3.Name != "orders-service-1" {
		t.Fatalf("expected third selection to wrap back to orders-service-1, got %s", selected3.Name)
	}
}

func TestRoundRobinTracksIndexPerService(t *testing.T) {
	rr := NewRoundRobin()

	instances := []registry.ServiceInstance{
		{Name: "analytics-service-1", URL: "http://localhost:9011", Healthy: true},
		{Name: "analytics-service-2", URL: "http://localhost:9012", Healthy: true},
	}

	_ = rr.Select("analytics", instances)

	index := rr.GetIndex("analytics")
	if index != 1 {
		t.Fatalf("expected analytics index to be 1 after one selection, got %d", index)
	}
}
