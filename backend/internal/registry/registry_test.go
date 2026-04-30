package registry

import (
	"testing"
	"time"
)

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

func TestIncrementActiveRequests(t *testing.T) {
	r := New()

	err := r.IncrementActiveRequests("orders", "orders-service-1")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	instances, err := r.GetInstances("orders")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	var found bool
	for _, instance := range instances {
		if instance.Name == "orders-service-1" {
			found = true
			if instance.ActiveRequests != 1 {
				t.Fatalf("expected active requests to be 1, got %d", instance.ActiveRequests)
			}
		}
	}

	if !found {
		t.Fatal("expected to find orders-service-1")
	}
}

func TestDecrementActiveRequests(t *testing.T) {
	r := New()

	if err := r.IncrementActiveRequests("orders", "orders-service-1"); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if err := r.DecrementActiveRequests("orders", "orders-service-1"); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	instances, err := r.GetInstances("orders")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	var found bool
	for _, instance := range instances {
		if instance.Name == "orders-service-1" {
			found = true
			if instance.ActiveRequests != 0 {
				t.Fatalf("expected active requests to be 0, got %d", instance.ActiveRequests)
			}
		}
	}

	if !found {
		t.Fatal("expected to find orders-service-1")
	}
}

func TestDecrementActiveRequestsDoesNotGoNegative(t *testing.T) {
	r := New()

	if err := r.DecrementActiveRequests("orders", "orders-service-1"); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	instances, err := r.GetInstances("orders")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	for _, instance := range instances {
		if instance.Name == "orders-service-1" {
			if instance.ActiveRequests != 0 {
				t.Fatalf("expected active requests to stay at 0, got %d", instance.ActiveRequests)
			}
		}
	}
}

func TestIncrementActiveRequestsUnknownService(t *testing.T) {
	r := New()

	err := r.IncrementActiveRequests("payments", "payments-service-1")
	if err == nil {
		t.Fatal("expected error for unknown service, got nil")
	}
}

func TestIncrementActiveRequestsUnknownInstance(t *testing.T) {
	r := New()

	err := r.IncrementActiveRequests("orders", "orders-service-99")
	if err == nil {
		t.Fatal("expected error for unknown instance, got nil")
	}
}

func TestRecordInstanceFailureOpensCircuitAfterThreshold(t *testing.T) {
	r := New()

	if err := r.RecordInstanceFailure("orders", "orders-service-1", 2); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if err := r.RecordInstanceFailure("orders", "orders-service-1", 2); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	instances, err := r.GetInstances("orders")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	for _, instance := range instances {
		if instance.Name == "orders-service-1" {
			if instance.CircuitState != CircuitOpen {
				t.Fatalf("expected circuit to be open, got %s", instance.CircuitState)
			}

			if instance.ConsecutiveFailures != 2 {
				t.Fatalf("expected consecutive failures to be 2, got %d", instance.ConsecutiveFailures)
			}
		}
	}
}

func TestRecordInstanceSuccessClosesCircuitAndResetsFailures(t *testing.T) {
	r := New()

	if err := r.RecordInstanceFailure("orders", "orders-service-1", 1); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if err := r.RecordInstanceSuccess("orders", "orders-service-1"); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	instances, err := r.GetInstances("orders")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	for _, instance := range instances {
		if instance.Name == "orders-service-1" {
			if instance.CircuitState != CircuitClosed {
				t.Fatalf("expected circuit to be closed, got %s", instance.CircuitState)
			}

			if instance.ConsecutiveFailures != 0 {
				t.Fatalf("expected consecutive failures to reset to 0, got %d", instance.ConsecutiveFailures)
			}
		}
	}
}

func TestGetAvailableInstancesSkipsOpenCircuit(t *testing.T) {
	r := New()

	if err := r.RecordInstanceFailure("orders", "orders-service-1", 1); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	available, err := r.GetAvailableInstances("orders", 10*time.Second)
	if err != nil {
		t.Fatalf("expected at least one available instance, got error %v", err)
	}

	for _, instance := range available {
		if instance.Name == "orders-service-1" {
			t.Fatal("expected open circuit instance to be skipped")
		}
	}
}

func TestGetAvailableInstancesMovesOpenCircuitToHalfOpenAfterCooldown(t *testing.T) {
	r := New()

	if err := r.RecordInstanceFailure("orders", "orders-service-1", 1); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	available, err := r.GetAvailableInstances("orders", 0)
	if err != nil {
		t.Fatalf("expected available instances after cooldown, got error %v", err)
	}

	var found bool
	for _, instance := range available {
		if instance.Name == "orders-service-1" {
			found = true
			if instance.CircuitState != CircuitHalfOpen {
				t.Fatalf("expected circuit to be half-open, got %s", instance.CircuitState)
			}
		}
	}

	if !found {
		t.Fatal("expected half-open instance to be available after cooldown")
	}
}
