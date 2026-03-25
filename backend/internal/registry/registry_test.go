package registry

import "testing"

func TestGetInstancesReturnsServiceInstances(t *testing.T) {
	r := New()

	instances, err := r.GetInstances("orders")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if len(instances) != 2 {
		t.Fatalf("expected 2 orders instances, got %d", len(instances))
	}
}

func TestGetHealthyInstancesFiltersUnhealthyOnes(t *testing.T) {
	r := New()

	err := r.SetInstanceHealth("orders", "orders-service-2", false)
	if err != nil {
		t.Fatalf("expected no error when updating health, got %v", err)
	}

	healthyInstances, err := r.GetHealthyInstances("orders")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if len(healthyInstances) != 1 {
		t.Fatalf("expected 1 healthy orders instance, got %d", len(healthyInstances))
	}

	if healthyInstances[0].Name != "orders-service-1" {
		t.Fatalf("expected remaining healthy instance to be orders-service-1, got %s", healthyInstances[0].Name)
	}
}

func TestGetHealthyInstancesReturnsErrorWhenNoneHealthy(t *testing.T) {
	r := New()

	if err := r.SetInstanceHealth("orders", "orders-service-1", false); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := r.SetInstanceHealth("orders", "orders-service-2", false); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	_, err := r.GetHealthyInstances("orders")
	if err == nil {
		t.Fatal("expected error when no healthy instances are available")
	}
}

func TestSetInstanceHealthUpdatesHealthStatus(t *testing.T) {
	r := New()

	err := r.SetInstanceHealth("analytics", "analytics-service-1", false)
	if err != nil {
		t.Fatalf("expected no error when updating health, got %v", err)
	}

	instances, err := r.GetInstances("analytics")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	var found bool
	for _, instance := range instances {
		if instance.Name == "analytics-service-1" {
			found = true
			if instance.Healthy {
				t.Fatal("expected analytics-service-1 to be unhealthy after update")
			}
		}
	}

	if !found {
		t.Fatal("expected analytics-service-1 to exist")
	}
}
