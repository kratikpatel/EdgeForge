package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"edgeforge/backend/internal/apiresponse"
	"edgeforge/backend/internal/config"
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

func startHealthChecks(
	serviceRegistry *registry.ServiceRegistry,
	client *http.Client,
	interval time.Duration,
	failureThreshold int,
) {
	ticker := time.NewTicker(interval)

	go func() {
		for range ticker.C {
			allServices := serviceRegistry.GetAll()

			for serviceName, instances := range allServices {
				for _, instance := range instances {
					healthy, latency := checkInstanceHealth(client, instance.URL)

					if err := serviceRegistry.RecordHealthCheckResult(
						serviceName,
						instance.Name,
						healthy,
						latency,
						failureThreshold,
					); err != nil {
						log.Printf("failed to update health for %s/%s: %v", serviceName, instance.Name, err)
						continue
					}

					log.Printf(
						"health check: service=%s instance=%s success=%v latency=%s threshold=%d",
						serviceName,
						instance.Name,
						healthy,
						latency,
						failureThreshold,
					)
				}
			}
		}
	}()
}

func checkInstanceHealth(client *http.Client, baseURL string) (bool, time.Duration) {
	start := time.Now()

	resp, err := client.Get(baseURL + "/health")
	latency := time.Since(start)

	if err != nil {
		return false, latency
	}
	defer resp.Body.Close()

	return resp.StatusCode >= 200 && resp.StatusCode < 300, latency
}

func getClientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func writeRateLimitResponse(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Retry-After", "10")
	apiresponse.WriteError(
		w,
		r,
		http.StatusTooManyRequests,
		"rate_limit_exceeded",
		"too many requests from this client",
	)
}

func main() {
	cfg := config.Load()

	m := metrics.New()
	serviceRegistry := registry.New()
	ll := loadbalancer.NewLeastLoaded()
	rl := ratelimiter.New(cfg.RateLimitMax, cfg.RateLimitWindow)
	httpClient := &http.Client{
		Timeout: cfg.RequestTimeout,
	}

	startHealthChecks(
		serviceRegistry,
		httpClient,
		cfg.HealthCheckInterval,
		cfg.HealthCheckFailureThreshold,
	)

	mux := http.NewServeMux()

	// Health endpoint
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		apiresponse.WriteJSON(w, http.StatusOK, map[string]any{
			"status":  "ok",
			"service": "edgeforge-gateway",
		})
	})

	// Status endpoint
	mux.HandleFunc("/api/v1/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			apiresponse.WriteError(
				w,
				r,
				http.StatusMethodNotAllowed,
				"method_not_allowed",
				"this endpoint only supports GET requests",
			)
			return
		}

		apiresponse.WriteJSON(w, http.StatusOK, m.Snapshot())
	})

	// Metrics endpoint
	mux.HandleFunc("/api/v1/metrics", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			apiresponse.WriteError(
				w,
				r,
				http.StatusMethodNotAllowed,
				"method_not_allowed",
				"this endpoint only supports GET requests",
			)
			return
		}

		apiresponse.WriteJSON(w, http.StatusOK, m.APISnapshot(serviceRegistry))
	})

	// Services endpoint
	mux.HandleFunc("/api/v1/services", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			apiresponse.WriteError(
				w,
				r,
				http.StatusMethodNotAllowed,
				"method_not_allowed",
				"this endpoint only supports GET requests",
			)
			return
		}

		apiresponse.WriteJSON(w, http.StatusOK, m.ServiceSnapshot(serviceRegistry))
	})

	// Request endpoint
	mux.HandleFunc("/api/v1/request", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			apiresponse.WriteError(
				w,
				r,
				http.StatusMethodNotAllowed,
				"method_not_allowed",
				"this endpoint only supports POST requests",
			)
			return
		}

		clientIP := getClientIP(r)
		if !rl.Allow(clientIP) {
			m.IncRateLimited()
			writeRateLimitResponse(w, r)
			return
		}

		var body RequestBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			m.IncErrors()
			apiresponse.WriteError(
				w,
				r,
				http.StatusBadRequest,
				"invalid_json",
				"request body must be valid JSON",
			)
			return
		}

		m.IncRequests()

		time.Sleep(80 * time.Millisecond)

		reqID := middleware.GetRequestID(r)

		serviceName := resolveServiceName(body.Route)
		if serviceName == "" {
			m.IncErrors()
			apiresponse.WriteError(
				w,
				r,
				http.StatusBadRequest,
				"unknown_route",
				"route must be /orders or /analytics",
			)
			return
		}

		if _, err := serviceRegistry.GetHealthyInstances(serviceName); err != nil {
			m.IncErrors()
			apiresponse.WriteError(
				w,
				r,
				http.StatusServiceUnavailable,
				"no_healthy_instances",
				"no healthy instances are available for service "+serviceName,
			)
			return
		}

		result, err := proxy.ForwardWithRetry(
			httpClient,
			serviceRegistry,
			ll,
			m,
			serviceName,
			body,
			cfg.RetryCount,
			cfg.CircuitBreakerFailureThreshold,
			cfg.CircuitBreakerCooldown,
		)
		if err != nil {
			m.IncErrors()
			apiresponse.WriteError(
				w,
				r,
				http.StatusBadGateway,
				"backend_forwarding_failed",
				err.Error(),
			)
			return
		}

		apiresponse.WriteJSON(w, http.StatusOK, GatewayResponse{
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

	server := &http.Server{
		Addr:    cfg.ServerAddress,
		Handler: handler,
	}

	serverErrors := make(chan error, 1)

	go func() {
		log.Printf("EdgeForge backend running on %s", cfg.ServerAddress)

		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrors <- err
		}
	}()

	shutdownSignals := make(chan os.Signal, 1)
	signal.Notify(shutdownSignals, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-serverErrors:
		log.Fatalf("server failed: %v", err)

	case sig := <-shutdownSignals:
		log.Printf("shutdown signal received: %s", sig)

		ctx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancel()

		if err := server.Shutdown(ctx); err != nil {
			log.Printf("graceful shutdown failed: %v", err)

			if closeErr := server.Close(); closeErr != nil {
				log.Printf("forced server close failed: %v", closeErr)
			}
		} else {
			log.Println("server shut down gracefully")
		}
	}
}
