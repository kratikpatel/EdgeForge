package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"edgeforge/backend/internal/config"
	"edgeforge/backend/internal/loadbalancer"
	"edgeforge/backend/internal/metrics"
	"edgeforge/backend/internal/ratelimiter"
	"edgeforge/backend/internal/registry"
)

func TestGatewayIntegrationForwardsRequestToBackendService(t *testing.T) {
	backendServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/handle":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"message": "orders handled",
				"source":  "integration-test-service",
			})
		case "/health":
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"status": "ok",
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer backendServer.Close()

	reg := registry.New()
	setIntegrationInstanceURL(t, reg, "orders", "orders-service-1", backendServer.URL)

	if err := reg.SetInstanceHealth("orders", "orders-service-2", false); err != nil {
		t.Fatalf("expected no error setting instance health, got %v", err)
	}

	handler := newTestGatewayHandler(reg)

	body := []byte(`{
		"route": "/orders",
		"payload": {
			"orderId": "123"
		}
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/request", bytes.NewReader(body))
	req.RemoteAddr = "127.0.0.1:12345"
	req.Header.Set("Content-Type", "application/json")

	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d with body %s", rec.Code, rec.Body.String())
	}

	var response GatewayResponse
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("expected valid gateway response, got error %v", err)
	}

	if response.Service != "orders" {
		t.Fatalf("expected service orders, got %s", response.Service)
	}

	if response.RoutedTo != "orders-service-1" {
		t.Fatalf("expected request to route to orders-service-1, got %s", response.RoutedTo)
	}

	if response.BackendResponse["message"] != "orders handled" {
		t.Fatalf("expected backend message orders handled, got %v", response.BackendResponse["message"])
	}
}

func TestGatewayIntegrationRetriesAfterFailedInstance(t *testing.T) {
	failedServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/handle" {
			http.Error(w, `{"error":"failed"}`, http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
	}))
	defer failedServer.Close()

	successServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/handle" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"message": "retried successfully",
			})
			return
		}

		w.WriteHeader(http.StatusOK)
	}))
	defer successServer.Close()

	reg := registry.New()
	setIntegrationInstanceURL(t, reg, "orders", "orders-service-1", failedServer.URL)
	setIntegrationInstanceURL(t, reg, "orders", "orders-service-2", successServer.URL)

	handler := newTestGatewayHandler(reg)

	body := []byte(`{
		"route": "/orders",
		"payload": {
			"orderId": "456"
		}
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/request", bytes.NewReader(body))
	req.RemoteAddr = "127.0.0.1:12345"
	req.Header.Set("Content-Type", "application/json")

	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200 after retry, got %d with body %s", rec.Code, rec.Body.String())
	}

	var response GatewayResponse
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("expected valid gateway response, got error %v", err)
	}

	if response.RoutedTo != "orders-service-2" {
		t.Fatalf("expected retry to route to orders-service-2, got %s", response.RoutedTo)
	}

	if response.BackendResponse["message"] != "retried successfully" {
		t.Fatalf("expected retry success message, got %v", response.BackendResponse["message"])
	}
}

func TestGatewayIntegrationReturnsErrorForUnknownRoute(t *testing.T) {
	reg := registry.New()
	handler := newTestGatewayHandler(reg)

	body := []byte(`{
		"route": "/payments",
		"payload": {
			"paymentId": "789"
		}
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/request", bytes.NewReader(body))
	req.RemoteAddr = "127.0.0.1:12345"
	req.Header.Set("Content-Type", "application/json")

	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for unknown route, got %d with body %s", rec.Code, rec.Body.String())
	}

	var response map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("expected valid error response JSON, got error %v", err)
	}

	if response["error"] != "unknown_route" {
		t.Fatalf("expected error unknown_route, got %v", response["error"])
	}
}

func TestGatewayIntegrationReturnsErrorWhenNoHealthyInstancesExist(t *testing.T) {
	reg := registry.New()

	if err := reg.SetInstanceHealth("orders", "orders-service-1", false); err != nil {
		t.Fatalf("expected no error setting health, got %v", err)
	}

	if err := reg.SetInstanceHealth("orders", "orders-service-2", false); err != nil {
		t.Fatalf("expected no error setting health, got %v", err)
	}

	handler := newTestGatewayHandler(reg)

	body := []byte(`{
		"route": "/orders",
		"payload": {
			"orderId": "999"
		}
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/request", bytes.NewReader(body))
	req.RemoteAddr = "127.0.0.1:12345"
	req.Header.Set("Content-Type", "application/json")

	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503 when no healthy instances exist, got %d with body %s", rec.Code, rec.Body.String())
	}

	var response map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("expected valid error response JSON, got error %v", err)
	}

	if response["error"] != "no_healthy_instances" {
		t.Fatalf("expected error no_healthy_instances, got %v", response["error"])
	}
}

func TestGatewayIntegrationMetricsEndpointReturnsGatewayAndServiceMetrics(t *testing.T) {
	reg := registry.New()
	handler := newTestGatewayHandler(reg)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/metrics", nil)
	req.RemoteAddr = "127.0.0.1:12345"

	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected metrics status 200, got %d with body %s", rec.Code, rec.Body.String())
	}

	var response map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("expected valid metrics JSON, got error %v", err)
	}

	if _, ok := response["gateway"]; !ok {
		t.Fatal("expected metrics response to include gateway")
	}

	if _, ok := response["services"]; !ok {
		t.Fatal("expected metrics response to include services")
	}
}

func newTestGatewayHandler(reg *registry.ServiceRegistry) http.Handler {
	cfg := config.Config{
		ServerAddress:                  ":8080",
		RequestTimeout:                 2 * time.Second,
		RetryCount:                     2,
		RateLimitMax:                   100,
		RateLimitWindow:                time.Second,
		HealthCheckInterval:            time.Second,
		ShutdownTimeout:                time.Second,
		CircuitBreakerFailureThreshold: 3,
		CircuitBreakerCooldown:         10 * time.Second,
		HealthCheckFailureThreshold:    3,
	}

	return buildGatewayHandler(
		cfg,
		metrics.New(),
		reg,
		loadbalancer.NewLeastLoaded(),
		ratelimiter.New(cfg.RateLimitMax, cfg.RateLimitWindow),
		&http.Client{Timeout: cfg.RequestTimeout},
	)
}

func setIntegrationInstanceURL(
	t *testing.T,
	reg *registry.ServiceRegistry,
	serviceName string,
	instanceName string,
	newURL string,
) {
	t.Helper()

	all := reg.GetAll()
	instances := all[serviceName]

	for i := range instances {
		if instances[i].Name == instanceName {
			instances[i].URL = newURL
		}
	}

	all[serviceName] = instances
	reg.SetServices(all)
}
