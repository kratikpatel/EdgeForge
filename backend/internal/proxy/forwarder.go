package proxy

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"edgeforge/backend/internal/loadbalancer"
	"edgeforge/backend/internal/logger"
	"edgeforge/backend/internal/metrics"
	"edgeforge/backend/internal/registry"
)

type ForwardResult struct {
	SelectedInstance registry.ServiceInstance
	BackendResponse  map[string]any
}

func ForwardWithRetry(
	client *http.Client,
	serviceRegistry *registry.ServiceRegistry,
	balancer *loadbalancer.LeastLoaded,
	metricsCollector *metrics.Metrics,
	serviceName string,
	requestBody any,
	maxAttempts int,
	circuitFailureThreshold int,
	circuitCooldown time.Duration,
) (*ForwardResult, error) {
	tried := make(map[string]bool)

	for attempt := 0; attempt < maxAttempts; attempt++ {
		availableInstances, err := serviceRegistry.GetAvailableInstances(serviceName, circuitCooldown)
		if err != nil {
			logger.Error("proxy_no_available_instances", logger.Fields{
				"service": serviceName,
				"attempt": attempt + 1,
				"error":   err.Error(),
			})
			return nil, err
		}

		available := make([]registry.ServiceInstance, 0)
		for _, instance := range availableInstances {
			if !tried[instance.Name] {
				available = append(available, instance)
			}
		}

		if len(available) == 0 {
			err := fmt.Errorf("no remaining available instances for service %q", serviceName)

			logger.Error("proxy_no_remaining_instances", logger.Fields{
				"service": serviceName,
				"attempt": attempt + 1,
				"error":   err.Error(),
			})

			return nil, err
		}

		selected := balancer.Select(available)
		tried[selected.Name] = true

		logger.Info("proxy_forward_attempt_started", logger.Fields{
			"service":      serviceName,
			"instance":     selected.Name,
			"targetUrl":    selected.URL,
			"attempt":      attempt + 1,
			"maxAttempts":  maxAttempts,
			"circuitState": selected.CircuitState,
		})

		metricsCollector.IncServiceRequests(serviceName)
		metricsCollector.IncInstanceRequests(serviceName, selected.Name)

		if err := serviceRegistry.IncrementActiveRequests(serviceName, selected.Name); err != nil {
			logger.Error("proxy_increment_active_requests_failed", logger.Fields{
				"service":  serviceName,
				"instance": selected.Name,
				"error":    err.Error(),
			})
			return nil, err
		}

		result, err := forwardToInstance(client, selected, requestBody)

		if decErr := serviceRegistry.DecrementActiveRequests(serviceName, selected.Name); decErr != nil {
			logger.Error("proxy_decrement_active_requests_failed", logger.Fields{
				"service":  serviceName,
				"instance": selected.Name,
				"error":    decErr.Error(),
			})
			return nil, decErr
		}

		if err == nil {
			if err := serviceRegistry.RecordInstanceSuccess(serviceName, selected.Name); err != nil {
				logger.Error("proxy_record_success_failed", logger.Fields{
					"service":  serviceName,
					"instance": selected.Name,
					"error":    err.Error(),
				})
				return nil, err
			}

			logger.Info("proxy_forward_attempt_succeeded", logger.Fields{
				"service":   serviceName,
				"instance":  selected.Name,
				"targetUrl": selected.URL,
				"attempt":   attempt + 1,
			})

			return &ForwardResult{
				SelectedInstance: selected,
				BackendResponse:  result,
			}, nil
		}

		metricsCollector.IncInstanceFailures(serviceName, selected.Name)

		if recordErr := serviceRegistry.RecordInstanceFailure(serviceName, selected.Name, circuitFailureThreshold); recordErr != nil {
			logger.Error("proxy_record_failure_failed", logger.Fields{
				"service":  serviceName,
				"instance": selected.Name,
				"error":    recordErr.Error(),
			})
			return nil, recordErr
		}

		logger.Error("proxy_forward_attempt_failed", logger.Fields{
			"service":   serviceName,
			"instance":  selected.Name,
			"targetUrl": selected.URL,
			"attempt":   attempt + 1,
			"error":     err.Error(),
		})
	}

	err := fmt.Errorf("all retry attempts failed for service %q", serviceName)

	logger.Error("proxy_all_retry_attempts_failed", logger.Fields{
		"service":     serviceName,
		"maxAttempts": maxAttempts,
		"error":       err.Error(),
	})

	return nil, err
}

func forwardToInstance(
	client *http.Client,
	instance registry.ServiceInstance,
	requestBody any,
) (map[string]any, error) {
	requestBytes, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("failed_to_encode_forward_request: %w", err)
	}

	forwardURL := instance.URL + "/handle"

	forwardReq, err := http.NewRequest(http.MethodPost, forwardURL, bytes.NewBuffer(requestBytes))
	if err != nil {
		return nil, fmt.Errorf("failed_to_create_forward_request: %w", err)
	}

	forwardReq.Header.Set("Content-Type", "application/json")

	start := time.Now()
	resp, err := client.Do(forwardReq)
	latency := time.Since(start)

	if err != nil {
		return nil, fmt.Errorf("failed_to_forward_request: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed_to_read_backend_response: %w", err)
	}

	var backendResp map[string]any
	if err := json.Unmarshal(respBytes, &backendResp); err != nil {
		return nil, fmt.Errorf("invalid_backend_response: %w", err)
	}

	logger.Info("proxy_backend_response_received", logger.Fields{
		"instance":  instance.Name,
		"targetUrl": forwardURL,
		"status":    resp.StatusCode,
		"latencyMs": latency.Milliseconds(),
	})

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("backend_service_error")
	}

	return backendResp, nil
}
