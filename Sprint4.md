# Sprint 4 Summary

## Team Members

- **Kratik Patel** — Backend
- **Yash** — Frontend

---

## Sprint Goal

The goal of Sprint 4 was to move **EdgeForge** from a working distributed API gateway simulation toward a more production-like backend system.

The sprint focused on:

- Backend resilience
- Observability
- Configuration flexibility
- Consistent API responses
- Health monitoring
- Fault tolerance
- Stronger backend testing

By the end of Sprint 4, the backend gateway included graceful shutdown, centralized configuration, standardized error responses, circuit breaker logic, improved health checks, structured JSON logging, a dedicated metrics API, and integration tests.

---

## Project Overview

**EdgeForge** is a Go-based API Gateway system that simulates a distributed backend architecture.

### Request Flow

```text
Client → Gateway → Load Balancer → Microservices → Response
```

### Gateway Responsibilities

The gateway is responsible for:

- Receiving client requests
- Resolving the correct backend service
- Selecting the best service instance
- Forwarding requests
- Retrying failed requests
- Tracking health and metrics
- Returning consistent responses to the client

---

## Existing Functionality Before Sprint 4

Before Sprint 4, the backend already included:

- Basic Go server setup
- `/health` endpoint
- `/api/v1/status` endpoint
- `/api/v1/request` routing endpoint
- Request ID middleware
- Logging middleware
- Mock routing from Sprint 1
- Real mock microservices from Sprint 2
- Service registry
- Round-robin load balancing
- Least-loaded load balancing
- Rate limiting
- Retry and timeout handling
- Active request tracking
- Per-service and per-instance metrics
- Service discovery endpoint
- Backend unit tests for registry, load balancer, proxy, metrics, and rate limiter

---

# Work Completed in Sprint 4

## 1. Config Management System

A centralized backend configuration package was added to remove hardcoded gateway values from `main.go`.

### What Was Implemented

A new package was created:

```text
backend/internal/config/
```

The config system now manages:

- Server address
- Request timeout
- Retry count
- Rate limit max requests
- Rate limit window
- Health check interval
- Shutdown timeout
- Circuit breaker failure threshold
- Circuit breaker cooldown
- Health check failure threshold

### Why This Was Needed

Previously, values such as retry count, timeout duration, rate limit settings, and health check interval were hardcoded. This made the backend harder to tune and less realistic.

With this update, the backend now supports safe default values and environment-based configuration.

### Example Config Values

```env
SERVER_ADDRESS=:8080
REQUEST_TIMEOUT=2s
RETRY_COUNT=2
RATE_LIMIT_MAX=5
RATE_LIMIT_WINDOW=10s
HEALTH_CHECK_INTERVAL=5s
SHUTDOWN_TIMEOUT=5s
CIRCUIT_BREAKER_FAILURE_THRESHOLD=3
CIRCUIT_BREAKER_COOLDOWN=10s
HEALTH_CHECK_FAILURE_THRESHOLD=3
```

### Files Updated

- `backend/internal/config/config.go`
- `backend/internal/config/config_test.go`
- `backend/cmd/server/main.go`

---

## 2. Graceful Shutdown Handling

Graceful shutdown support was added so the backend gateway can stop safely when receiving termination signals.

### What Was Implemented

The backend now:

- Listens for `SIGINT`
- Listens for `SIGTERM`
- Stops accepting new requests during shutdown
- Allows in-flight requests to complete
- Uses a configurable shutdown timeout
- Logs shutdown activity clearly

### Why This Was Needed

Previously, the backend used direct `http.ListenAndServe`, which does not provide controlled shutdown behavior. In production-style systems, servers should avoid terminating suddenly while handling active requests.

### Implementation Detail

The server now uses:

```go
http.Server
```

and shuts down using:

```go
server.Shutdown(ctx)
```

### Files Updated

- `backend/cmd/server/main.go`
- `backend/internal/config/config.go`
- `backend/internal/config/config_test.go`

---

## 3. Standardized API Error Responses

A reusable API response package was added so backend errors return a consistent JSON format.

### What Was Implemented

A new package was created:

```text
backend/internal/apiresponse/
```

### Standard Error Format

```json
{
  "error": "unknown_route",
  "message": "route must be /orders or /analytics",
  "code": 400,
  "requestId": "abc123"
}
```

### Applied To

Standardized error responses were applied to:

- Invalid JSON request body
- Unknown route
- Method not allowed
- No healthy service instances
- Backend forwarding failure
- Rate limit exceeded

### Why This Was Needed

Before this update, different handlers returned error responses in slightly different formats. This made frontend handling and debugging less consistent.

### Files Updated

- `backend/internal/apiresponse/error.go`
- `backend/internal/apiresponse/error_test.go`
- `backend/cmd/server/main.go`

---

## 4. Dedicated Metrics API Endpoint

A new metrics endpoint was added to expose gateway, service, and instance-level metrics in a clean structure.

### New Endpoint

```http
GET /api/v1/metrics
```

### What It Returns

The endpoint returns:

- Gateway-level metrics
- Service-level metrics
- Instance-level metrics
- Request counts
- Failure counts
- Rate limit counts
- Active request counts
- Health information
- Circuit breaker state

### Example Response Structure

```json
{
  "gateway": {
    "uptimeSec": 120,
    "requestsTotal": 20,
    "errorsTotal": 2,
    "rateLimitedTotal": 1,
    "activeSimulations": 0,
    "serviceRequests": {},
    "instanceStatistics": {}
  },
  "services": {
    "orders": {
      "requests": 10,
      "instances": []
    },
    "analytics": {
      "requests": 5,
      "instances": []
    }
  }
}
```

### Why This Was Needed

Previously, metrics were partially available through the status endpoint and internal structures. A dedicated metrics endpoint makes observability clearer and easier to demonstrate.

### Files Updated

- `backend/internal/metrics/metrics.go`
- `backend/internal/metrics/metrics_test.go`
- `backend/cmd/server/main.go`

---

## 5. Circuit Breaker Pattern

A circuit breaker was added to prevent the gateway from repeatedly sending traffic to failing service instances.

### What Was Implemented

Each service instance now tracks:

- Circuit state
- Consecutive failures
- Circuit opened timestamp

### Supported Circuit States

- `closed`
- `open`
- `half-open`

### Circuit Breaker Flow

```text
Request succeeds
→ circuit remains closed

Request fails repeatedly
→ consecutive failure count increases

Failure threshold reached
→ circuit opens

Circuit open
→ instance is skipped during routing

Cooldown expires
→ circuit becomes half-open

Half-open request succeeds
→ circuit closes and failures reset
```

### Why This Was Needed

Retry logic alone is not enough. Without a circuit breaker, the gateway may keep attempting requests to unstable service instances. The circuit breaker improves fault tolerance by temporarily removing bad instances from routing.

### Files Updated

- `backend/internal/registry/registry.go`
- `backend/internal/registry/registry_test.go`
- `backend/internal/proxy/forwarder.go`
- `backend/internal/proxy/forwarder_test.go`
- `backend/internal/config/config.go`
- `backend/internal/config/config_test.go`
- `backend/cmd/server/main.go`

---

## 6. Improved Health Check Logic

Health checks were improved so one failed health check does not immediately mark a service instance unhealthy.

### What Was Implemented

Each service instance now tracks:

- Consecutive health check failures
- Last health check latency in milliseconds

### Behavior

```text
1 failed health check
→ instance stays healthy

3 failed health checks
→ instance becomes unhealthy

successful health check
→ failure count resets
→ instance becomes healthy again
```

### Why This Was Needed

A single temporary network issue should not immediately remove a service instance from routing. This makes health detection more stable and realistic.

### Files Updated

- `backend/internal/registry/registry.go`
- `backend/internal/registry/registry_test.go`
- `backend/internal/metrics/metrics.go`
- `backend/internal/config/config.go`
- `backend/internal/config/config_test.go`
- `backend/cmd/server/main.go`

---

## 7. Structured JSON Logging

Plain text logs were replaced with structured JSON logs.

### What Was Implemented

A new logger package was added:

```text
backend/internal/logger/
```

Logs now include fields such as:

- Timestamp
- Level
- Message
- Request ID
- Method
- Path
- Status
- Latency in milliseconds
- Service
- Instance
- Target URL
- Retry attempt
- Error

### Example Log

```json
{
  "level": "info",
  "message": "request_routing_succeeded",
  "timestamp": "2026-04-29T18:30:00Z",
  "requestId": "abc123",
  "route": "/orders",
  "service": "orders",
  "instance": "orders-service-1",
  "targetUrl": "http://localhost:9001"
}
```

### Applied To

Structured logging was added for:

- HTTP request completion
- Request routing
- Proxy forwarding attempts
- Retry failures
- Health checks
- Rate limiting
- Invalid JSON
- Unknown routes
- Server startup
- Server shutdown

### Why This Was Needed

Structured logs are easier to search, parse, and debug. This makes the gateway closer to a production backend system.

### Files Updated

- `backend/internal/logger/logger.go`
- `backend/internal/middleware/middleware.go`
- `backend/internal/proxy/forwarder.go`
- `backend/cmd/server/main.go`

---

## 8. Backend Integration Tests

Backend integration tests were added to verify that the gateway components work together end-to-end.

### What Was Implemented

The server setup was refactored to expose a reusable handler:

```go
buildGatewayHandler(...)
```

This allows tests to create an in-memory gateway using `httptest`.

### Integration Tests Added

The new integration tests cover:

- Successful request forwarding through the gateway
- Retry behavior after a failed service instance
- Unknown route error handling
- No healthy instances error handling
- Metrics endpoint response structure

### Why This Was Needed

Unit tests verify individual packages, but integration tests verify that routing, registry, load balancing, proxying, metrics, and error handling work together.

### Files Updated

- `backend/cmd/server/main.go`
- `backend/cmd/server/main_test.go`

---

# Backend API Documentation

## 1. Health Check Endpoint

```http
GET /health
```

Checks whether the gateway server is running.

### Example Response

```json
{
  "status": "ok",
  "service": "edgeforge-gateway"
}
```

---

## 2. Status Endpoint

```http
GET /api/v1/status
```

Returns gateway-level status and metrics.

### Example Response

```json
{
  "uptimeSec": 50,
  "requestsTotal": 10,
  "errorsTotal": 1,
  "rateLimitedTotal": 0,
  "activeSimulations": 0,
  "serviceRequests": {
    "orders": 5
  },
  "instanceStatistics": {
    "orders": {
      "orders-service-1": {
        "requests": 3,
        "failures": 1
      }
    }
  }
}
```

---

## 3. Request Routing Endpoint

```http
POST /api/v1/request
```

Accepts a client request and forwards it to the correct backend microservice.

### Supported Routes

- `/orders`
- `/analytics`

### Example Request Body

```json
{
  "route": "/orders",
  "payload": {
    "orderId": "123",
    "amount": 250
  }
}
```

### Example Success Response

```json
{
  "requestId": "abc123",
  "route": "/orders",
  "service": "orders",
  "routedTo": "orders-service-1",
  "targetUrl": "http://localhost:9001",
  "status": "success",
  "backendResponse": {
    "message": "orders handled"
  }
}
```

### Example Error Response

```json
{
  "error": "unknown_route",
  "message": "route must be /orders or /analytics",
  "code": 400,
  "requestId": "abc123"
}
```

---

## 4. Service Discovery Endpoint

```http
GET /api/v1/services
```

Returns service registry information, health status, active requests, circuit breaker state, and instance-level metrics.

### Example Response

```json
{
  "orders": {
    "requests": 10,
    "instances": [
      {
        "name": "orders-service-1",
        "url": "http://localhost:9001",
        "healthy": true,
        "activeRequests": 0,
        "requests": 5,
        "failures": 1,
        "circuitState": "closed",
        "consecutiveFailures": 0,
        "healthCheckFailures": 0,
        "lastHealthLatencyMs": 4
      }
    ]
  }
}
```

---

## 5. Metrics Endpoint

```http
GET /api/v1/metrics
```

Returns a dedicated metrics response containing gateway-level and service-level observability data.

### Example Response

```json
{
  "gateway": {
    "uptimeSec": 120,
    "requestsTotal": 20,
    "errorsTotal": 2,
    "rateLimitedTotal": 1,
    "activeSimulations": 0,
    "serviceRequests": {
      "orders": 10
    },
    "instanceStatistics": {
      "orders": {
        "orders-service-1": {
          "requests": 6,
          "failures": 1
        }
      }
    }
  },
  "services": {
    "orders": {
      "requests": 10,
      "instances": [
        {
          "name": "orders-service-1",
          "url": "http://localhost:9001",
          "healthy": true,
          "activeRequests": 0,
          "requests": 6,
          "failures": 1,
          "circuitState": "closed",
          "consecutiveFailures": 0,
          "healthCheckFailures": 0,
          "lastHealthLatencyMs": 4
        }
      ]
    }
  }
}
```

---

# Backend Tests

## Config Tests

- `TestLoadReturnsDefaultConfigValues`
- `TestLoadReadsEnvironmentVariables`
- `TestLoadFallsBackWhenEnvironmentVariablesAreInvalid`

These tests verify config defaults, environment values, and fallback behavior.

## Rate Limiter Tests

- `TestAllowWithinLimit`
- `TestBlockWhenLimitExceeded`
- `TestAllowAfterWindowReset`

These tests verify that the rate limiter allows requests within the limit, blocks requests after the limit, and resets after the configured window.

## Load Balancer Tests

- `TestRoundRobinSelectAlternatesInstances`
- `TestRoundRobinTracksIndexPerService`
- `TestLeastLoadedSelectChoosesLowestActiveRequests`
- `TestLeastLoadedSelectReturnsFirstInstanceOnTie`
- `TestLeastLoadedSelectWorksWithSingleInstance`

These tests verify round-robin and least-loaded load balancing behavior.

## Registry Tests

- `TestGetInstancesReturnsServiceInstances`
- `TestGetHealthyInstancesFiltersUnhealthyOnes`
- `TestGetHealthyInstancesReturnsErrorWhenNoneHealthy`
- `TestSetInstanceHealthUpdatesHealthStatus`
- `TestIncrementActiveRequests`
- `TestDecrementActiveRequests`
- `TestDecrementActiveRequestsDoesNotGoNegative`
- `TestIncrementActiveRequestsUnknownService`
- `TestIncrementActiveRequestsUnknownInstance`
- `TestRecordInstanceFailureOpensCircuitAfterThreshold`
- `TestRecordInstanceSuccessClosesCircuitAndResetsFailures`
- `TestGetAvailableInstancesSkipsOpenCircuit`
- `TestGetAvailableInstancesMovesOpenCircuitToHalfOpenAfterCooldown`
- `TestRecordHealthCheckResultDoesNotMarkUnhealthyBeforeThreshold`
- `TestRecordHealthCheckResultMarksUnhealthyAtThreshold`
- `TestRecordHealthCheckResultSuccessRestoresHealth`

These tests verify service registry behavior, health status updates, active request tracking, circuit breaker transitions, and improved health check logic.

## Proxy Tests

- `TestForwardWithRetrySucceedsOnFirstHealthyInstance`
- `TestForwardWithRetryRetriesAfterFailure`
- `TestForwardWithRetryFailsWhenAllAttemptsFail`
- `TestForwardWithRetryDecrementsActiveRequestsAfterFailure`
- `TestForwardWithRetryOpensCircuitAfterRepeatedFailure`

These tests verify request forwarding, retry behavior, failure handling, active request cleanup, and circuit breaker opening.

## Metrics Tests

- `TestIncServiceRequests`
- `TestIncInstanceRequests`
- `TestIncInstanceFailures`
- `TestSnapshotIncludesServiceAndInstanceMetrics`
- `TestServiceSnapshotIncludesRegistryState`
- `TestAPISnapshotIncludesGatewayAndServiceMetrics`

These tests verify global, service-level, instance-level, and API metrics snapshots.

## API Response Tests

- `TestWriteJSONWritesContentTypeAndStatus`
- `TestWriteErrorWritesStandardErrorResponse`

These tests verify JSON response writing and standardized error response formatting.

## Backend Integration Tests

- `TestGatewayIntegrationForwardsRequestToBackendService`
- `TestGatewayIntegrationRetriesAfterFailedInstance`
- `TestGatewayIntegrationReturnsErrorForUnknownRoute`
- `TestGatewayIntegrationReturnsErrorWhenNoHealthyInstancesExist`
- `TestGatewayIntegrationMetricsEndpointReturnsGatewayAndServiceMetrics`

These tests verify full gateway behavior using `httptest`.

---

# Frontend Testing Support

Frontend work was handled separately by the frontend team member.

The backend changes support the frontend by providing:

- Consistent API error responses
- Service discovery data
- Metrics endpoint data
- Gateway status data
- Request routing responses

Frontend tests should cover:

- Dashboard rendering
- Request form behavior
- Service status display
- Metrics display
- Error response handling
- Cypress test for submitting a request through the UI
- Cypress test for viewing service and metrics data

---

# How to Run the Backend

From the repository root:

```bash
cd backend
go run cmd/server/main.go
```

The gateway runs on:

```text
http://localhost:8080
```

---

# How to Run Backend Tests

From the backend directory:

```bash
go test ./...
```

This command runs all backend unit and integration tests.

---

# Demo Commands

## Health Check

```bash
curl http://localhost:8080/health
```

## Status

```bash
curl http://localhost:8080/api/v1/status
```

## Services

```bash
curl http://localhost:8080/api/v1/services
```

## Metrics

```bash
curl http://localhost:8080/api/v1/metrics
```

## Send Gateway Request to Orders Service

```bash
curl -X POST http://localhost:8080/api/v1/request \
  -H "Content-Type: application/json" \
  -d '{
    "route": "/orders",
    "payload": {
      "orderId": "123",
      "amount": 250
    }
  }'
```

## Send Gateway Request to Analytics Service

```bash
curl -X POST http://localhost:8080/api/v1/request \
  -H "Content-Type: application/json" \
  -d '{
    "route": "/analytics",
    "payload": {
      "event": "page_view",
      "userId": "user-123"
    }
  }'
```

## Invalid Route Example

```bash
curl -X POST http://localhost:8080/api/v1/request \
  -H "Content-Type: application/json" \
  -d '{
    "route": "/payments",
    "payload": {
      "paymentId": "pay-123"
    }
  }'
```

---

# Sprint 4 Backend Issues Completed

1. Add config management for backend gateway settings
2. Implement graceful shutdown for backend server
3. Standardize backend API error responses
4. Add dedicated backend metrics API endpoint
5. Add circuit breaker for failed service instances
6. Improve service health check logic with failure thresholds
7. Add structured JSON logging for backend requests
8. Add backend integration tests for gateway request flow
9. Update backend API documentation
10. Create `Sprint4.md` documentation

---

# Final Sprint 4 Outcome

Sprint 4 made EdgeForge more complete and production-like. The backend now has stronger resilience, cleaner configuration, better error handling, deeper observability, safer shutdown behavior, improved health monitoring, circuit breaker fault tolerance, structured logs, and integration tests that verify the gateway flow end-to-end.
