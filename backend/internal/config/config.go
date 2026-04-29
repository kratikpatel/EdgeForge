package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	ServerAddress                  string
	RequestTimeout                 time.Duration
	RetryCount                     int
	RateLimitMax                   int
	RateLimitWindow                time.Duration
	HealthCheckInterval            time.Duration
	ShutdownTimeout                time.Duration
	CircuitBreakerFailureThreshold int
	CircuitBreakerCooldown         time.Duration
}

func Load() Config {
	return Config{
		ServerAddress:                  getString("SERVER_ADDRESS", ":8080"),
		RequestTimeout:                 getDuration("REQUEST_TIMEOUT", 2*time.Second),
		RetryCount:                     getInt("RETRY_COUNT", 2),
		RateLimitMax:                   getInt("RATE_LIMIT_MAX", 5),
		RateLimitWindow:                getDuration("RATE_LIMIT_WINDOW", 10*time.Second),
		HealthCheckInterval:            getDuration("HEALTH_CHECK_INTERVAL", 5*time.Second),
		ShutdownTimeout:                getDuration("SHUTDOWN_TIMEOUT", 5*time.Second),
		CircuitBreakerFailureThreshold: getInt("CIRCUIT_BREAKER_FAILURE_THRESHOLD", 3),
		CircuitBreakerCooldown:         getDuration("CIRCUIT_BREAKER_COOLDOWN", 10*time.Second),
	}
}

func getString(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func getInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}

	return parsed
}

func getDuration(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}

	return parsed
}
