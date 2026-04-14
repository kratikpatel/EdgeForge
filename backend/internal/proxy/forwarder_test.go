package proxy

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"edgeforge/backend/internal/loadbalancer"
	"edgeforge/backend/internal/registry"
)

func TestForwardWithRetrySucceedsOnFirstHealthyInstance(t *testing.T) {
	reg := registry.New()
	lb := loadbalancer.NewLeastLoaded()
	client := &http.Client{Timeout: 2 * time.Second}

	successServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"message": "ok",
		})
	}))
	defer successServer.Close()

	_ = reg.SetInstanceHealth("orders", "orders-service-2", false)

	setInstanceURL(t, reg, "orders", "orders-service-1", successServer.URL)

	result, err := ForwardWithRetry(client, reg, lb, "orders", map[string]any{
		"route": "/orders",
	}, 2)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if result.SelectedInstance.Name != "orders-service-1" {
		t.Fatalf("expected orders-service-1, got %s", result.SelectedInstance.Name)
	}

	if result.BackendResponse["message"] != "ok" {
		t.Fatalf("expected backend response message=ok, got %v", result.BackendResponse["message"])
	}
}

func TestForwardWithRetryRetriesAfterFailure(t *testing.T) {
	reg := registry.New()
	lb := loadbalancer.NewLeastLoaded()
	client := &http.Client{Timeout: 2 * time.Second}

	failedServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"failed"}`, http.StatusInternalServerError)
	}))
	defer failedServer.Close()

	successServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"message": "retried-successfully",
		})
	}))
	defer successServer.Close()

	setInstanceURL(t, reg, "orders", "orders-service-1", failedServer.URL)
	setInstanceURL(t, reg, "orders", "orders-service-2", successServer.URL)

	result, err := ForwardWithRetry(client, reg, lb, "orders", map[string]any{
		"route": "/orders",
	}, 2)
	if err != nil {
		t.Fatalf("expected retry to succeed, got error %v", err)
	}

	if result.SelectedInstance.Name != "orders-service-2" {
		t.Fatalf("expected retry to land on orders-service-2, got %s", result.SelectedInstance.Name)
	}
}

func TestForwardWithRetryFailsWhenAllAttemptsFail(t *testing.T) {
	reg := registry.New()
	lb := loadbalancer.NewLeastLoaded()
	client := &http.Client{Timeout: 500 * time.Millisecond}

	badServer1 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"failed"}`, http.StatusInternalServerError)
	}))
	defer badServer1.Close()

	badServer2 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"failed"}`, http.StatusInternalServerError)
	}))
	defer badServer2.Close()

	setInstanceURL(t, reg, "orders", "orders-service-1", badServer1.URL)
	setInstanceURL(t, reg, "orders", "orders-service-2", badServer2.URL)

	_, err := ForwardWithRetry(client, reg, lb, "orders", map[string]any{
		"route": "/orders",
	}, 2)
	if err == nil {
		t.Fatal("expected error when all attempts fail, got nil")
	}
}

func TestForwardWithRetryDecrementsActiveRequestsAfterFailure(t *testing.T) {
	reg := registry.New()
	lb := loadbalancer.NewLeastLoaded()
	client := &http.Client{Timeout: 500 * time.Millisecond}

	badServer1 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"failed"}`, http.StatusInternalServerError)
	}))
	defer badServer1.Close()

	badServer2 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"failed"}`, http.StatusInternalServerError)
	}))
	defer badServer2.Close()

	setInstanceURL(t, reg, "orders", "orders-service-1", badServer1.URL)
	setInstanceURL(t, reg, "orders", "orders-service-2", badServer2.URL)

	_, _ = ForwardWithRetry(client, reg, lb, "orders", map[string]any{
		"route": "/orders",
	}, 2)

	instances, err := reg.GetInstances("orders")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	for _, instance := range instances {
		if instance.ActiveRequests != 0 {
			t.Fatalf("expected active requests to return to 0, got %d for %s", instance.ActiveRequests, instance.Name)
		}
	}
}

func setInstanceURL(t *testing.T, reg *registry.ServiceRegistry, serviceName, instanceName, newURL string) {
	t.Helper()

	all := reg.GetAll()
	instances := all[serviceName]

	for i := range instances {
		if instances[i].Name == instanceName {
			instances[i].URL = newURL
		}
	}

	replaceRegistryService(t, reg, serviceName, instances)
}

func replaceRegistryService(t *testing.T, reg *registry.ServiceRegistry, serviceName string, updated []registry.ServiceInstance) {
	t.Helper()

	// rebuild registry by applying updated slice through health-preserving overwrite logic
	current := reg.GetAll()

	current[serviceName] = updated

	newReg := registry.New()
	for svc, instances := range current {
		for _, instance := range instances {
			_ = newReg.SetInstanceHealth(svc, instance.Name, instance.Healthy)
		}
	}

	registryMapOverwrite(reg, current)
}

func registryMapOverwrite(reg *registry.ServiceRegistry, updated map[string][]registry.ServiceInstance) {
	// this helper depends on adding SetServices below in registry.go
	reg.SetServices(updated)
}
