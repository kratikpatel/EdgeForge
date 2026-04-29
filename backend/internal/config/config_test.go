package config

import (
	"testing"
	"time"
)

func TestLoadReturnsDefaultConfigValues(t *testing.T) {
	t.Setenv("SERVER_ADDRESS", "")
	t.Setenv("REQUEST_TIMEOUT", "")
	t.Setenv("RETRY_COUNT", "")
	t.Setenv("RATE_LIMIT_MAX", "")
	t.Setenv("RATE_LIMIT_WINDOW", "")
	t.Setenv("HEALTH_CHECK_INTERVAL", "")
	t.Setenv("SHUTDOWN_TIMEOUT", "")
	t.Setenv("CIRCUIT_BREAKER_FAILURE_THRESHOLD", "")
	t.Setenv("CIRCUIT_BREAKER_COOLDOWN", "")
	t.Setenv("HEALTH_CHECK_FAILURE_THRESHOLD", "")

	cfg := Load()

	if cfg.ServerAddress != ":8080" {
		t.Fatalf("expected ServerAddress to be :8080, got %s", cfg.ServerAddress)
	}

	if cfg.RequestTimeout != 2*time.Second {
		t.Fatalf("expected RequestTimeout to be 2s, got %s", cfg.RequestTimeout)
	}

	if cfg.RetryCount != 2 {
		t.Fatalf("expected RetryCount to be 2, got %d", cfg.RetryCount)
	}

	if cfg.RateLimitMax != 5 {
		t.Fatalf("expected RateLimitMax to be 5, got %d", cfg.RateLimitMax)
	}

	if cfg.RateLimitWindow != 10*time.Second {
		t.Fatalf("expected RateLimitWindow to be 10s, got %s", cfg.RateLimitWindow)
	}

	if cfg.HealthCheckInterval != 5*time.Second {
		t.Fatalf("expected HealthCheckInterval to be 5s, got %s", cfg.HealthCheckInterval)
	}

	if cfg.ShutdownTimeout != 5*time.Second {
		t.Fatalf("expected ShutdownTimeout to be 5s, got %s", cfg.ShutdownTimeout)
	}

	if cfg.CircuitBreakerFailureThreshold != 3 {
		t.Fatalf("expected CircuitBreakerFailureThreshold to be 3, got %d", cfg.CircuitBreakerFailureThreshold)
	}

	if cfg.CircuitBreakerCooldown != 10*time.Second {
		t.Fatalf("expected CircuitBreakerCooldown to be 10s, got %s", cfg.CircuitBreakerCooldown)
	}

	if cfg.HealthCheckFailureThreshold != 3 {
		t.Fatalf("expected HealthCheckFailureThreshold to be 3, got %d", cfg.HealthCheckFailureThreshold)
	}
}

func TestLoadReadsEnvironmentVariables(t *testing.T) {
	t.Setenv("SERVER_ADDRESS", ":9090")
	t.Setenv("REQUEST_TIMEOUT", "3s")
	t.Setenv("RETRY_COUNT", "4")
	t.Setenv("RATE_LIMIT_MAX", "10")
	t.Setenv("RATE_LIMIT_WINDOW", "30s")
	t.Setenv("HEALTH_CHECK_INTERVAL", "15s")
	t.Setenv("SHUTDOWN_TIMEOUT", "8s")
	t.Setenv("CIRCUIT_BREAKER_FAILURE_THRESHOLD", "5")
	t.Setenv("CIRCUIT_BREAKER_COOLDOWN", "20s")
	t.Setenv("HEALTH_CHECK_FAILURE_THRESHOLD", "6")

	cfg := Load()

	if cfg.ServerAddress != ":9090" {
		t.Fatalf("expected ServerAddress to be :9090, got %s", cfg.ServerAddress)
	}

	if cfg.RequestTimeout != 3*time.Second {
		t.Fatalf("expected RequestTimeout to be 3s, got %s", cfg.RequestTimeout)
	}

	if cfg.RetryCount != 4 {
		t.Fatalf("expected RetryCount to be 4, got %d", cfg.RetryCount)
	}

	if cfg.RateLimitMax != 10 {
		t.Fatalf("expected RateLimitMax to be 10, got %d", cfg.RateLimitMax)
	}

	if cfg.RateLimitWindow != 30*time.Second {
		t.Fatalf("expected RateLimitWindow to be 30s, got %s", cfg.RateLimitWindow)
	}

	if cfg.HealthCheckInterval != 15*time.Second {
		t.Fatalf("expected HealthCheckInterval to be 15s, got %s", cfg.HealthCheckInterval)
	}

	if cfg.ShutdownTimeout != 8*time.Second {
		t.Fatalf("expected ShutdownTimeout to be 8s, got %s", cfg.ShutdownTimeout)
	}

	if cfg.CircuitBreakerFailureThreshold != 5 {
		t.Fatalf("expected CircuitBreakerFailureThreshold to be 5, got %d", cfg.CircuitBreakerFailureThreshold)
	}

	if cfg.CircuitBreakerCooldown != 20*time.Second {
		t.Fatalf("expected CircuitBreakerCooldown to be 20s, got %s", cfg.CircuitBreakerCooldown)
	}

	if cfg.HealthCheckFailureThreshold != 6 {
		t.Fatalf("expected HealthCheckFailureThreshold to be 6, got %d", cfg.HealthCheckFailureThreshold)
	}
}

func TestLoadFallsBackWhenEnvironmentVariablesAreInvalid(t *testing.T) {
	t.Setenv("REQUEST_TIMEOUT", "bad-duration")
	t.Setenv("RETRY_COUNT", "bad-int")
	t.Setenv("RATE_LIMIT_MAX", "bad-int")
	t.Setenv("RATE_LIMIT_WINDOW", "bad-duration")
	t.Setenv("HEALTH_CHECK_INTERVAL", "bad-duration")
	t.Setenv("SHUTDOWN_TIMEOUT", "bad-duration")
	t.Setenv("CIRCUIT_BREAKER_FAILURE_THRESHOLD", "bad-int")
	t.Setenv("CIRCUIT_BREAKER_COOLDOWN", "bad-duration")
	t.Setenv("HEALTH_CHECK_FAILURE_THRESHOLD", "bad-int")

	cfg := Load()

	if cfg.RequestTimeout != 2*time.Second {
		t.Fatalf("expected fallback RequestTimeout to be 2s, got %s", cfg.RequestTimeout)
	}

	if cfg.RetryCount != 2 {
		t.Fatalf("expected fallback RetryCount to be 2, got %d", cfg.RetryCount)
	}

	if cfg.RateLimitMax != 5 {
		t.Fatalf("expected fallback RateLimitMax to be 5, got %d", cfg.RateLimitMax)
	}

	if cfg.RateLimitWindow != 10*time.Second {
		t.Fatalf("expected fallback RateLimitWindow to be 10s, got %s", cfg.RateLimitWindow)
	}

	if cfg.HealthCheckInterval != 5*time.Second {
		t.Fatalf("expected fallback HealthCheckInterval to be 5s, got %s", cfg.HealthCheckInterval)
	}

	if cfg.ShutdownTimeout != 5*time.Second {
		t.Fatalf("expected fallback ShutdownTimeout to be 5s, got %s", cfg.ShutdownTimeout)
	}

	if cfg.CircuitBreakerFailureThreshold != 3 {
		t.Fatalf("expected fallback CircuitBreakerFailureThreshold to be 3, got %d", cfg.CircuitBreakerFailureThreshold)
	}

	if cfg.CircuitBreakerCooldown != 10*time.Second {
		t.Fatalf("expected fallback CircuitBreakerCooldown to be 10s, got %s", cfg.CircuitBreakerCooldown)
	}

	if cfg.HealthCheckFailureThreshold != 3 {
		t.Fatalf("expected fallback HealthCheckFailureThreshold to be 3, got %d", cfg.HealthCheckFailureThreshold)
	}
}
