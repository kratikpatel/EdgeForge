package metrics

import (
	"testing"

	"edgeforge/backend/internal/registry"
)

func TestIncServiceRequests(t *testing.T) {
	m := New()

	m.IncServiceRequests("orders")
	m.IncServiceRequests("orders")

	if got := m.GetServiceRequests("orders"); got != 2 {
		t.Fatalf("expected orders service requests to be 2, got %d", got)
	}
}

func TestIncInstanceRequests(t *testing.T) {
	m := New()

	m.IncInstanceRequests("orders", "orders-service-1")
	m.IncInstanceRequests("orders", "orders-service-1")

	stats := m.GetInstanceMetrics("orders", "orders-service-1")
	if stats.Requests != 2 {
		t.Fatalf("expected instance requests to be 2, got %d", stats.Requests)
	}
	if stats.Failures != 0 {
		t.Fatalf("expected instance failures to be 0, got %d", stats.Failures)
	}
}

func TestIncInstanceFailures(t *testing.T) {
	m := New()

	m.IncInstanceFailures("orders", "orders-service-1")
	m.IncInstanceFailures("orders", "orders-service-1")

	stats := m.GetInstanceMetrics("orders", "orders-service-1")
	if stats.Failures != 2 {
		t.Fatalf("expected instance failures to be 2, got %d", stats.Failures)
	}
	if stats.Requests != 0 {
		t.Fatalf("expected instance requests to be 0, got %d", stats.Requests)
	}
}

func TestSnapshotIncludesServiceAndInstanceMetrics(t *testing.T) {
	m := New()

	m.IncServiceRequests("orders")
	m.IncInstanceRequests("orders", "orders-service-1")
	m.IncInstanceFailures("orders", "orders-service-1")

	snapshot := m.Snapshot()

	serviceRequests, ok := snapshot["serviceRequests"].(map[string]uint64)
	if !ok {
		t.Fatal("expected serviceRequests in snapshot")
	}
	if serviceRequests["orders"] != 1 {
		t.Fatalf("expected orders service requests to be 1, got %d", serviceRequests["orders"])
	}

	instanceStats, ok := snapshot["instanceStatistics"].(map[string]map[string]InstanceMetrics)
	if !ok {
		t.Fatal("expected instanceStatistics in snapshot")
	}

	stats := instanceStats["orders"]["orders-service-1"]
	if stats.Requests != 1 {
		t.Fatalf("expected instance requests to be 1, got %d", stats.Requests)
	}
	if stats.Failures != 1 {
		t.Fatalf("expected instance failures to be 1, got %d", stats.Failures)
	}
}

func TestServiceSnapshotIncludesRegistryState(t *testing.T) {
	m := New()
	reg := registry.New()

	_ = reg.IncrementActiveRequests("orders", "orders-service-1")
	m.IncServiceRequests("orders")
	m.IncInstanceRequests("orders", "orders-service-1")
	m.IncInstanceFailures("orders", "orders-service-1")

	snapshot := m.ServiceSnapshot(reg)

	serviceData, ok := snapshot["orders"].(map[string]any)
	if !ok {
		t.Fatal("expected orders service data in snapshot")
	}

	if serviceData["requests"].(uint64) != 1 {
		t.Fatalf("expected orders requests to be 1, got %v", serviceData["requests"])
	}

	instances, ok := serviceData["instances"].([]map[string]any)
	if !ok {
		t.Fatal("expected instances slice in service snapshot")
	}

	var found bool
	for _, instance := range instances {
		if instance["name"] == "orders-service-1" {
			found = true
			if instance["activeRequests"].(int) != 1 {
				t.Fatalf("expected activeRequests to be 1, got %v", instance["activeRequests"])
			}
			if instance["requests"].(uint64) != 1 {
				t.Fatalf("expected requests to be 1, got %v", instance["requests"])
			}
			if instance["failures"].(uint64) != 1 {
				t.Fatalf("expected failures to be 1, got %v", instance["failures"])
			}
		}
	}

	if !found {
		t.Fatal("expected to find orders-service-1 in service snapshot")
	}
}
