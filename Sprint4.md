# Sprint 4 Summary

## Team

- **Kratik Patel** — Backend
- **Yash** — Frontend

## Sprint Goal

Move EdgeForge from a working API gateway simulation toward a production-like system. Backend focused on resilience, observability, and configuration. Frontend focused on surfacing the new backend signals (circuit state, traces, error rates) and adding usability features (dark mode, chaos controls).

## Project Overview

EdgeForge is a Go-based API gateway that simulates a distributed backend.

```text
Client → Gateway → Load Balancer → Microservices → Response
```

The gateway resolves routes, picks a healthy instance, forwards the request with retries, and returns a consistent response. Sprint 4 hardened the gateway and built a dashboard to observe and control it.

---

# Backend Work

## 1. Config Management (`backend/internal/config/`)

Replaced hardcoded gateway values with a centralized config loaded from environment variables, with safe defaults.

Configurable values: server address, request timeout, retry count, rate limit (max + window), health check interval, shutdown timeout, circuit breaker (failure threshold + cooldown), health check failure threshold.

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

## 2. Graceful Shutdown

The server now uses `http.Server` with `Shutdown(ctx)` — listens for `SIGINT`/`SIGTERM`, stops accepting new requests, drains in-flight requests, and exits within the configured shutdown timeout.

## 3. Standardized Error Responses (`backend/internal/apiresponse/`)

All gateway errors now return the same JSON shape:

```json
{ "error": "unknown_route", "message": "route must be /orders or /analytics", "code": 400, "requestId": "abc123" }
```

Applied to: invalid JSON, unknown route, method not allowed, no healthy instances, forwarding failure, rate limit exceeded.

## 4. Metrics Endpoint (`GET /api/v1/metrics`)

Dedicated endpoint exposing gateway-level and service/instance-level metrics: uptime, request/error/rate-limit counts, active simulations, per-service request counts, per-instance request/failure counts, health, and circuit state.

## 5. Circuit Breaker

Each instance tracks `circuitState` (`closed` / `open` / `half-open`), consecutive failures, and the timestamp the circuit opened.

```text
failures ≥ threshold      → circuit opens (instance skipped during routing)
cooldown elapsed          → circuit becomes half-open (one trial request allowed)
trial succeeds            → circuit closes, failure count resets
```

Prevents the gateway from hammering an unstable instance.

## 6. Improved Health Checks

Health checks now require N consecutive failures (configurable) before an instance is marked unhealthy. Each instance also tracks `lastHealthLatencyMs`. A single transient failure no longer evicts a healthy instance from routing.

## 7. Structured JSON Logging (`backend/internal/logger/`)

Plain text logs replaced with structured JSON. Fields: `timestamp`, `level`, `message`, `requestId`, `method`, `path`, `status`, `latencyMs`, `service`, `instance`, `targetUrl`, `retryAttempt`, `error`.

```json
{ "level": "info", "message": "request_routing_succeeded", "timestamp": "2026-04-29T18:30:00Z", "requestId": "abc123", "service": "orders", "instance": "orders-service-1", "targetUrl": "http://localhost:9001" }
```

## 8. Backend Integration Tests

Refactored `main.go` to expose `buildGatewayHandler(...)` so tests can spin up an in-memory gateway with `httptest`. Tests cover end-to-end forwarding, retry-after-failure, unknown routes, no-healthy-instances, and the metrics endpoint shape.

---

# Frontend Work

All frontend work extends the existing React dashboard at `frontend/src/pages/Dashboard.jsx` and the helpers in `frontend/src/utils/metrics.js`.

## F1. Services Status Panel + Circuit Breaker Badges

Polls `/api/v1/services` and renders each service with its instances. Each row shows a health dot (green/red), instance name, a circuit breaker badge (`closed` / `open` / `half-open` / `—`), active request count, and failure count. `breakerBadge()` and `normalizeBreakerState()` map backend strings to colored badges. This makes the new circuit breaker state from backend item #5 visible at a glance.

## F2. Chaos Controls Panel

Lists every backend instance in a table with its current injected mode (`off` / `fail` / `latency`). Selecting a mode posts to `/api/v1/admin/inject` so the user can deliberately break an instance and watch the circuit breaker, retries, and error-rate alert react in real time. Helpers: `getInstancesFromServices()`, `buildChaosPayload()`, `CHAOS_MODES`.

## F3. Request Trace Viewer

Each row in the request log opens a detail modal. The modal now renders a trace timeline built from `response.trace` — one row per attempt with attempt number, instance, outcome pill (`success` / `fail`), latency, and any error message. `parseTrace()` normalizes the backend trace payload. Makes retries and circuit-breaker skips visible per request.

## F4. Configurable Error-Rate Alert Banner

A red banner appears at the top of the dashboard when any service's error rate over the last N requests exceeds the configured threshold. Threshold (`errorRateAlertPct`), window size, and on/off toggle live in the Settings panel and persist via `localStorage`. Banner is dismissible per service. Helpers: `computeServiceErrorRates()`, `findAlertingServices()`. Requires at least 3 requests in the window before alerting to avoid noise.

## F5. Dark Mode Toggle

Theme selector in Settings: `system` / `light` / `dark`. `applyTheme()` sets `data-theme` on `<html>`; CSS in `index.css` defines variables (`--bg-page`, `--bg-card`, `--text-primary`, etc.) for both themes. The whole dashboard reads from these variables so all panels — cards, tables, modals, charts — respect the theme. Choice persists in `localStorage`; `system` follows `prefers-color-scheme` and updates live.

---

# API Reference

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | Gateway liveness |
| `/api/v1/status` | GET | Gateway-level counters |
| `/api/v1/services` | GET | Service registry, health, circuit state, per-instance metrics |
| `/api/v1/metrics` | GET | Combined gateway + service/instance metrics |
| `/api/v1/request` | POST | Route a request to `/orders` or `/analytics` |
| `/api/v1/admin/inject` | POST | Inject chaos mode (`off` / `fail` / `latency`) on an instance |

### `POST /api/v1/request`

```json
{ "route": "/orders", "payload": { "orderId": "123", "amount": 250 } }
```

Success:

```json
{ "requestId": "abc123", "route": "/orders", "service": "orders", "routedTo": "orders-service-1", "targetUrl": "http://localhost:9001", "status": "success", "backendResponse": { "message": "orders handled" } }
```

### `GET /api/v1/services` (excerpt)

```json
{
  "orders": {
    "requests": 10,
    "instances": [{
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
    }]
  }
}
```

---

# Tests

## Backend (`go test ./...`)

| Package | Coverage |
|---|---|
| `config` | defaults, env override, fallback on invalid values |
| `apiresponse` | JSON content-type/status, standardized error shape |
| `ratelimit` | within-limit, blocked over limit, reset after window |
| `loadbalancer` | round-robin alternation + per-service index, least-loaded selection + ties + single instance |
| `registry` | health filtering, active request counters, circuit transitions (open after threshold, half-open after cooldown, close on success), health check failure threshold |
| `proxy` | first-instance success, retry after failure, all-fail, active request cleanup, circuit opens after repeated failure |
| `metrics` | service/instance/global counters, snapshot includes registry state, API snapshot shape |
| `cmd/server` (integration) | end-to-end forward, retry after failed instance, unknown route, no healthy instances, metrics endpoint shape |

## Frontend

- **Vitest** (`frontend/src/utils/metrics.test.js`, `frontend/src/pages/Dashboard.test.jsx`): covers `parseServices`, `normalizeBreakerState`, `breakerBadge`, `parseTrace`, `computeServiceErrorRates`, `findAlertingServices`, `getInstancesFromServices`, `buildChaosPayload`, theme load/save/apply, and Dashboard panel rendering for circuit badges, trace timeline, alert banner, dark mode, and chaos table.
- **Cypress** (`frontend/cypress/e2e/dashboard.cy.js`): dashboard loads, send test request flow, dark mode toggles and persists across reload, Services Status panel renders instance rows, alert threshold control is exposed in settings.

---

# Running

**Backend** (from `backend/`):

```bash
go run cmd/server/main.go        # http://localhost:8080
go test ./...                    # all backend tests
```

**Frontend** (from `frontend/`):

```bash
npm run dev                      # http://localhost:5173
npm test                         # vitest
env -u ELECTRON_RUN_AS_NODE npx cypress run   # cypress
```

---

# Demo Commands

```bash
curl http://localhost:8080/health
curl http://localhost:8080/api/v1/status
curl http://localhost:8080/api/v1/services
curl http://localhost:8080/api/v1/metrics

curl -X POST http://localhost:8080/api/v1/request \
  -H "Content-Type: application/json" \
  -d '{"route":"/orders","payload":{"orderId":"123","amount":250}}'

# Trigger an unknown-route error (standardized error response)
curl -X POST http://localhost:8080/api/v1/request \
  -H "Content-Type: application/json" \
  -d '{"route":"/payments","payload":{}}'
```

---

# Sprint 4 Issues Completed

**Backend**: config management, graceful shutdown, standardized error responses, metrics endpoint, circuit breaker, improved health checks, structured JSON logging, integration tests, API docs.

**Frontend**: #F1 services status + circuit breaker badges, #F2 chaos controls panel, #F3 request trace viewer, #F4 error-rate alert banner, #F5 dark mode toggle.

---

# Outcome

The backend is now resilient (circuit breaker + retries + threshold-based health), observable (structured logs + dedicated metrics endpoint), and operationally safe (graceful shutdown + standardized errors + integration-tested). The frontend exposes every new backend signal directly in the dashboard — circuit state, request traces, error-rate alerts — and adds chaos injection so the resilience features can be demonstrated live, plus a dark mode for the demo.
