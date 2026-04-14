package main

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"time"

	"edgeforge/backend/internal/loadbalancer"
	"edgeforge/backend/internal/metrics"
	"edgeforge/backend/internal/middleware"
	"edgeforge/backend/internal/proxy"
	"edgeforge/backend/internal/ratelimiter"
	"edgeforge/backend/internal/registry"
)

type RequestBody struct {
	Route   string         `json:"route"`
	Payload map[string]any `json:"payload"`
}

type GatewayResponse struct {
	RequestID       string         `json:"requestId"`
	Route           string         `json:"route"`
	Service         string         `json:"service"`
	RoutedTo        string         `json:"routedTo"`
	TargetURL       string         `json:"targetUrl"`
	Status          string         `json:"status"`
	BackendResponse map[string]any `json:"backendResponse,omitempty"`
}

func writeJSON(w http.ResponseWriter, statusCode int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(v)
}

func resolveServiceName(route string) string {
	switch route {
	case "/orders":
		return "orders"
	case "/analytics":
		return "analytics"
	default:
		return ""
	}
}

func startHealthChecks(serviceRegistry *registry.ServiceRegistry, client *http.Client, interval time.Duration) {
	ticker := time.NewTicker(interval)

	go func() {
		for range ticker.C {
			allServices := serviceRegistry.GetAll()

			for serviceName, instances := range allServices {
				for _, instance := range instances {
					healthy := checkInstanceHealth(client, instance.URL)
					if err := serviceRegistry.SetInstanceHealth(serviceName, instance.Name, healthy); err != nil {
						log.Printf("failed to update health for %s/%s: %v", serviceName, instance.Name, err)
						continue
					}

					log.Printf("health check: service=%s instance=%s healthy=%v", serviceName, instance.Name, healthy)
				}
			}
		}
	}()
}

func checkInstanceHealth(client *http.Client, baseURL string) bool {
	resp, err := client.Get(baseURL + "/health")
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode >= 200 && resp.StatusCode < 300
}

func getClientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func writeRateLimitResponse(w http.ResponseWriter) {
	w.Header().Set("Retry-After", "10")
	writeJSON(w, http.StatusTooManyRequests, map[string]any{
		"error":      "rate_limit_exceeded",
		"message":    "too many requests from this client",
		"statusCode": http.StatusTooManyRequests,
	})
}

func main() {
	m := metrics.New()
	serviceRegistry := registry.New()
	ll := loadbalancer.NewLeastLoaded()
	rl := ratelimiter.New(5, 10*time.Second)
	httpClient := &http.Client{
		Timeout: 2 * time.Second,
	}

	startHealthChecks(serviceRegistry, httpClient, 5*time.Second)

	mux := http.NewServeMux()

	// Health endpoint
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "ok",
			"service": "edgeforge-gateway",
		})
	})

	// Status endpoint
	mux.HandleFunc("/api/v1/status", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, m.Snapshot())
	})

	// Services endpoint
	mux.HandleFunc("/api/v1/services", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]any{
				"error": "method_not_allowed",
			})
			return
		}

		writeJSON(w, http.StatusOK, m.ServiceSnapshot(serviceRegistry))
	})

	// Request endpoint
	mux.HandleFunc("/api/v1/request", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]any{
				"error": "method_not_allowed",
			})
			return
		}

		clientIP := getClientIP(r)
		if !rl.Allow(clientIP) {
			m.IncRateLimited()
			writeRateLimitResponse(w)
			return
		}

		var body RequestBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			m.IncErrors()
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid_json",
			})
			return
		}

		m.IncRequests()

		time.Sleep(80 * time.Millisecond)

		reqID := middleware.GetRequestID(r)

		serviceName := resolveServiceName(body.Route)
		if serviceName == "" {
			m.IncErrors()
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "unknown_route",
			})
			return
		}

		if _, err := serviceRegistry.GetHealthyInstances(serviceName); err != nil {
			m.IncErrors()
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{
				"error":   "no_healthy_instances",
				"service": serviceName,
			})
			return
		}

		result, err := proxy.ForwardWithRetry(httpClient, serviceRegistry, ll, m, serviceName, body, 2)
		if err != nil {
			m.IncErrors()
			writeJSON(w, http.StatusBadGateway, map[string]any{
				"error": err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, GatewayResponse{
			RequestID:       reqID,
			Route:           body.Route,
			Service:         serviceName,
			RoutedTo:        result.SelectedInstance.Name,
			TargetURL:       result.SelectedInstance.URL,
			Status:          "success",
			BackendResponse: result.BackendResponse,
		})
	})

	handler := middleware.WithRequestIDAndLogging(mux)

	log.Println("EdgeForge backend running on :8080")
	log.Fatal(http.ListenAndServe(":8080", handler))
}
