# Sprint 3

## Team Members

- Kratik Patel — Backend
- Yash Sarwaiya — Frontend

---

## Sprint Goal

Enhance the backend gateway with smarter routing, fault tolerance, and detailed observability.

---

## Backend Work Completed

1.⁠ ⁠Added active request tracking per service instance
2.⁠ ⁠Implemented least-loaded load balancing
3.⁠ ⁠Added timeout and retry handling for failed service requests
4.⁠ ⁠Added per-service and per-instance metrics
5.⁠ ⁠Added service discovery/status API (/api/v1/services)

---

## Backend Unit Tests

•⁠ ⁠TestIncrementActiveRequests
•⁠ ⁠TestDecrementActiveRequests
•⁠ ⁠TestDecrementActiveRequestsDoesNotGoNegative
•⁠ ⁠TestLeastLoadedSelectChoosesLowestActiveRequests
•⁠ ⁠TestLeastLoadedSelectReturnsFirstInstanceOnTie
•⁠ ⁠TestLeastLoadedSelectWorksWithSingleInstance
•⁠ ⁠TestForwardWithRetrySucceedsOnFirstHealthyInstance
•⁠ ⁠TestForwardWithRetryRetriesAfterFailure
•⁠ ⁠TestForwardWithRetryFailsWhenAllAttemptsFail
•⁠ ⁠TestForwardWithRetryDecrementsActiveRequestsAfterFailure
•⁠ ⁠TestIncServiceRequests
•⁠ ⁠TestIncInstanceRequests
•⁠ ⁠TestIncInstanceFailures
•⁠ ⁠TestSnapshotIncludesServiceAndInstanceMetrics

(All Sprint 2 backend tests are also passing)

---

## Frontend Work Completed

1. Added per-service metrics panel that aggregates the request log client-side by service and shows total, success, rate limited, errors, and average latency per service.
2. Added filtering and search to the live request log — filter by service, filter by status (success, rate limited, error), and search by request ID substring. Shows "Showing X of Y" live count.
3. Added a request detail modal — clicking any row in the log opens a modal with full response JSON and a Copy Request ID button.
4. Added CSV export for the request log — downloads a timestamped CSV with columns for time, request ID, routed service, status, and latency.
5. Added a dashboard settings panel with configurable poll interval (1s / 1.5s / 3s), max log entries (50 / 100 / 200), and chart history window (15 / 30 / 60). Persisted to localStorage.

---

## Frontend Unit Tests

### Utility Function Tests (`src/utils/metrics.test.js`)

- `aggregateByService` — returns empty array for empty log
- `aggregateByService` — aggregates a single service correctly
- `aggregateByService` — aggregates multiple services and counts statuses
- `aggregateByService` — handles missing routedTo and latency gracefully
- `filterRequestLog` — returns full log when no filters applied
- `filterRequestLog` — filters by service
- `filterRequestLog` — filters by status success
- `filterRequestLog` — filters by status rateLimited
- `filterRequestLog` — filters by status error
- `filterRequestLog` — filters by search substring on id
- `filterRequestLog` — returns empty array for non-array input
- `toCsv` — returns header only for empty log
- `toCsv` — formats a single row correctly
- `toCsv` — formats multiple rows
- `toCsv` — escapes commas and quotes in fields
- `loadSettings` — returns defaults when localStorage is empty
- `loadSettings / saveSettings` — round-trips saved settings
- `loadSettings` — falls back to defaults when localStorage has invalid JSON

(All Sprint 2 utility tests — `computeRate`, `parseStatus`, `getHealthMessage`, `classifyError`, `formatMetricsEntry` — are also still passing.)

### Component Tests (`src/pages/Dashboard.test.jsx`)

- Renders per-service metrics panel with empty state
- Renders request log filter controls
- Does not render the request details modal by default
- Renders Export CSV button disabled when log is empty
- Renders the Settings panel

(All Sprint 2 Dashboard component tests are also still passing.)

### Cypress E2E Tests (`cypress/e2e/dashboard.cy.js`)

- Loads the dashboard page
- Displays the health indicator
- Displays all five stats cards
- Has a send test request button that can be clicked
- Displays chart sections

---

## Updated Backend API

### GET /health

Returns the health status of the gateway.

Example:

{
"status": "ok",
"service": "edgeforge-gateway"
}

---

### GET /api/v1/status

Returns global metrics including:

•⁠ ⁠uptime
•⁠ ⁠total requests
•⁠ ⁠errors
•⁠ ⁠rate-limited requests
•⁠ ⁠per-service metrics
•⁠ ⁠per-instance metrics

Example:

{
"uptimeSec": 120,
"requestsTotal": 10,
"errorsTotal": 1,
"rateLimitedTotal": 0,
"serviceRequests": {
"orders": 6
}
}

---

### GET /api/v1/services

Returns detailed state of all services and instances.

Includes:

•⁠ ⁠service-level request count
•⁠ ⁠instance health
•⁠ ⁠active requests
•⁠ ⁠request count per instance
•⁠ ⁠failure count per instance

Example:

{
"orders": {
"requests": 5,
"instances": [
{
"name": "orders-service-1",
"url": "http://localhost:9001",
"healthy": true,
"activeRequests": 0,
"requests": 3,
"failures": 1
},
{
"name": "orders-service-2",
"url": "http://localhost:9002",
"healthy": true,
"activeRequests": 0,
"requests": 2,
"failures": 0
}
]
}
}

---

### POST /api/v1/request

Routes a request to the appropriate backend service.

Features:

•⁠ ⁠least-loaded load balancing
•⁠ ⁠retry mechanism on failure
•⁠ ⁠active request tracking

Example request:

{
"route": "/orders"
}

Example response:

{
"requestId": "abc-123",
"route": "/orders",
"service": "orders",
"routedTo": "orders-service-1",
"targetUrl": "http://localhost:9001",
"status": "success",
"backendResponse": {
"message": "ok"
}
}

---
