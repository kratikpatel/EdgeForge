package main

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"edgeforge/backend/internal/apiresponse"
	"edgeforge/backend/internal/config"
	"edgeforge/backend/internal/loadbalancer"
	"edgeforge/backend/internal/logger"
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
						logger.Error("health_check_update_failed", logger.Fields{
							"service":  serviceName,
							"instance": instance.Name,
							"error":    err.Error(),
						})
						continue
					}

					logger.Info("health_check_completed", logger.Fields{
						"service":       serviceName,
						"instance":      instance.Name,
						"success":       healthy,
						"latencyMs":     latency.Milliseconds(),
						"threshold":     failureThreshold,
						"instanceUrl":   instance.URL,
						"previousState": instance.Healthy,
					})
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

func buildGatewayHandler(
	cfg config.Config,
	m *metrics.Metrics,
	serviceRegistry *registry.ServiceRegistry,
	ll *loadbalancer.LeastLoaded,
	rl *ratelimiter.RateLimiter,
	httpClient *http.Client,
) http.Handler {
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

			logger.Error("request_rate_limited", logger.Fields{
				"clientIP": clientIP,
				"path":     r.URL.Path,
				"method":   r.Method,
			})

			writeRateLimitResponse(w, r)
			return
		}

		var body RequestBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			m.IncErrors()

			logger.Error("request_invalid_json", logger.Fields{
				"clientIP": clientIP,
				"path":     r.URL.Path,
				"method":   r.Method,
				"error":    err.Error(),
			})

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

			logger.Error("request_unknown_route", logger.Fields{
				"requestId": reqID,
				"route":     body.Route,
			})

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

			logger.Error("request_no_healthy_instances", logger.Fields{
				"requestId": reqID,
				"service":   serviceName,
				"error":     err.Error(),
			})

			apiresponse.WriteError(
				w,
				r,
				http.StatusServiceUnavailable,
				"no_healthy_instances",
				"no healthy instances are available for service "+serviceName,
			)
			return
		}

		logger.Info("request_routing_started", logger.Fields{
			"requestId": reqID,
			"route":     body.Route,
			"service":   serviceName,
		})

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

			logger.Error("request_forwarding_failed", logger.Fields{
				"requestId": reqID,
				"service":   serviceName,
				"error":     err.Error(),
			})

			apiresponse.WriteError(
				w,
				r,
				http.StatusBadGateway,
				"backend_forwarding_failed",
				err.Error(),
			)
			return
		}

		logger.Info("request_routing_succeeded", logger.Fields{
			"requestId": reqID,
			"route":     body.Route,
			"service":   serviceName,
			"instance":  result.SelectedInstance.Name,
			"targetUrl": result.SelectedInstance.URL,
		})

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

	return middleware.WithRequestIDAndLogging(mux)
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

	handler := buildGatewayHandler(
		cfg,
		m,
		serviceRegistry,
		ll,
		rl,
		httpClient,
	)

	server := &http.Server{
		Addr:    cfg.ServerAddress,
		Handler: handler,
	}

	serverErrors := make(chan error, 1)

	go func() {
		logger.Info("server_started", logger.Fields{
			"address": cfg.ServerAddress,
		})

		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrors <- err
		}
	}()

	shutdownSignals := make(chan os.Signal, 1)
	signal.Notify(shutdownSignals, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-serverErrors:
		logger.Error("server_failed", logger.Fields{
			"error": err.Error(),
		})
		os.Exit(1)

	case sig := <-shutdownSignals:
		logger.Info("shutdown_signal_received", logger.Fields{
			"signal": sig.String(),
		})

		ctx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancel()

		if err := server.Shutdown(ctx); err != nil {
			logger.Error("graceful_shutdown_failed", logger.Fields{
				"error": err.Error(),
			})

			if closeErr := server.Close(); closeErr != nil {
				logger.Error("forced_server_close_failed", logger.Fields{
					"error": closeErr.Error(),
				})
			}
		} else {
			logger.Info("server_shutdown_completed", logger.Fields{
				"mode": "graceful",
			})
		}
	}
}
