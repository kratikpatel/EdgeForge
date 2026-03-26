# Sprint 2

## User Stories

- As a user, I want my request to actually go to real backend services instead of mock responses so the system feels realistic.
- As a user, I want the gateway to distribute requests across multiple service instances so no single service gets overloaded.
- As a user, I want the system to avoid sending requests to services that are down so requests don’t fail unnecessarily.
- As a user, I want the gateway to limit excessive requests so the system doesn’t get overwhelmed.
- As a user, I want to see how many requests were blocked or failed so I can understand system behavior.

---

## What We Planned

We planned to move from a **simulated gateway** to a **real working system**.

### Backend (Kratik):

- #1 Create orders service with /health and /handle endpoints
- #2 Create analytics service with /health and /handle endpoints
- #3 Add service registry for backend instances
- #4 Implement request forwarding from gateway to services
- #5 Add round-robin load balancing
- #6 Track routing state for load balancing
- #7 Add periodic health checks for services
- #8 Exclude unhealthy instances from routing
- #9 Add in-memory rate limiting
- #10 Return proper 429 responses for throttled requests
- #11 Track rate-limited requests in metrics
- #12 Add backend unit tests
- #13 Add backend API documentation

### Frontend (Yash):

- #1 Add traffic simulation controls
- #2 Add live request log panel
- #3 Add real-time charts for metrics
- #4 Update dashboard layout for Sprint 2
- #5 Improve error handling for bulk requests
- Add Cypress E2E test
- Add unit tests for frontend components and utilities

---

## What Got Done

Everything planned was completed on both frontend and backend.

### Frontend

- Added traffic simulation controls with 3 modes: Normal Load (10 reqs), Traffic Spike (50 reqs), Abusive Requests (100 reqs) — PR #36
- Added live request log panel showing requestId, routedTo, status, and latency in a scrollable table — PR #54
- Added real-time area charts for requests/sec, errors/sec, and rate limited/sec using recharts — PR #55
- Updated dashboard layout and header for Sprint 2 — PR #56
- Improved error handling with specific messages for 429 rate limiting, 500 server errors, and network failures — PR #58
- Added 32 unit tests (Vitest + React Testing Library)
- Added 5 Cypress E2E tests

### Backend

Everything planned for the backend was completed.

- Created real backend services (orders and analytics) running on different ports
- Gateway now forwards requests to actual services instead of returning mock strings
- Implemented round-robin load balancing across multiple instances
- Added health checks that run every few seconds and detect service failures
- Gateway automatically avoids unhealthy services
- Implemented rate limiting (5 requests per 10 seconds per client)
- Added proper 429 responses with Retry-After header
- Metrics now track total requests, errors, and rate-limited requests
- Wrote unit tests for rate limiter, load balancer, and service registry
- Added full backend API documentation

Now the flow is:

Client → Gateway → Selected Service → Response → Gateway → Client

---

## What Didn't Get Done and Why

- Advanced load balancing (least-loaded) — we implemented round-robin first since it’s simpler and enough for this sprint.
- Distributed rate limiting (Redis) — current version is in-memory only. We kept it simple to avoid overcomplicating the system.
- Detailed per-service metrics — right now metrics are global. Per-instance metrics can be added later.
- Failure injection — we manually stopped services to test failures, but didn’t build automated failure injection yet.

We intentionally kept these for Sprint 3 so Sprint 2 stays focused on getting the **core system working properly**.

---

## Unit Tests

### Backend Unit Tests

We added backend unit tests for the main Sprint 2 logic so we could verify the internal behavior without needing to manually test everything through the browser or terminal each time.

#### Files Added

- `ratelimiter_test.go`
- `roundrobin_test.go`
- `registry_test.go`

---

### ratelimiter_test.go

#### 1. TestAllowWithinLimit

**What it tests:**  
Checks that the rate limiter allows requests as long as the client has not crossed the allowed limit.

**Why it was written:**  
This verifies the most basic expected behavior of the rate limiter. If this fails, the limiter is blocking requests too early and normal users would be affected.

---

#### 2. TestBlockWhenLimitExceeded

**What it tests:**  
Checks that the rate limiter blocks requests once the maximum allowed number of requests is reached in the current time window.

**Why it was written:**  
This confirms that rate limiting is actually being enforced. Without this test, the limiter could exist in code but still fail to protect the gateway.

---

#### 3. TestAllowAfterWindowReset

**What it tests:**  
Checks that after the rate-limit window passes, the same client is allowed to send requests again.

**Why it was written:**  
This ensures the limiter is temporary and resets correctly, instead of blocking a client forever after they exceed the limit once.

---

### roundrobin_test.go

#### 4. TestRoundRobinSelectAlternatesInstances

**What it tests:**  
Checks that the round-robin load balancer rotates requests across service instances in the expected order.

**Why it was written:**  
This verifies that load balancing is actually distributing traffic, instead of repeatedly selecting the same instance and defeating the purpose of having multiple instances.

---

#### 5. TestRoundRobinTracksIndexPerService

**What it tests:**  
Checks that the round-robin state is tracked correctly for each service after selections happen.

**Why it was written:**  
This confirms that the gateway remembers which instance should receive the next request, which is necessary for consistent round-robin behavior.

---

### registry_test.go

#### 6. TestGetInstancesReturnsServiceInstances

**What it tests:**  
Checks that the service registry returns the expected service instances for a valid service.

**Why it was written:**  
This verifies that the registry is storing and exposing the configured backend instances correctly, which is the foundation for routing.

---

#### 7. TestGetHealthyInstancesFiltersUnhealthyOnes

**What it tests:**  
Checks that the registry only returns healthy instances after one instance is marked unhealthy.

**Why it was written:**  
This ensures the gateway does not keep routing traffic to services that are down, which is a major part of Sprint 2 fault tolerance.

---

#### 8. TestGetHealthyInstancesReturnsErrorWhenNoneHealthy

**What it tests:**  
Checks that the registry returns an error when all instances for a service are unhealthy.

**Why it was written:**  
This verifies the failure case where no valid instance is available. The gateway depends on this behavior to return a proper error instead of trying to forward to a dead service.

---

#### 9. TestSetInstanceHealthUpdatesHealthStatus

**What it tests:**  
Checks that the registry correctly updates the stored health status of a service instance.

**Why it was written:**  
This confirms that the periodic health-check mechanism can actually update instance health in the registry, which is necessary for healthy/unhealthy routing decisions.

---

### How to run backend tests

````bash
go test ./...

## Backend API (Summary)

### Endpoints

- `GET /health` → checks if gateway is running
- `GET /api/v1/status` → returns metrics
- `POST /api/v1/request` → routes request to backend service

---

### Example Request

```json
{
  "route": "/orders",
  "payload": {
    "orderId": 101
  }
}
````

---

## Frontend Unit Tests (Vitest + React Testing Library)

We added frontend unit tests to verify utility functions and component rendering behavior without needing to run the full app.

### Files Added

- `src/utils/metrics.js` — extracted testable helper functions
- `src/utils/metrics.test.js` — 21 unit tests for utility functions
- `src/pages/Dashboard.test.jsx` — 11 component tests

---

### metrics.test.js (21 tests)

| #   | Test                                                           | What it verifies                 |
| --- | -------------------------------------------------------------- | -------------------------------- |
| 1   | computeRate returns 0 when previous is null                    | Handles initial state            |
| 2   | computeRate returns 0 when previous is undefined               | Handles missing data             |
| 3   | computeRate computes rate correctly with default interval      | Calculates req/sec over 1.5s     |
| 4   | computeRate computes rate with custom interval                 | Supports variable poll intervals |
| 5   | computeRate returns 0 when current equals previous             | No change = zero rate            |
| 6   | computeRate clamps negative values to 0                        | Prevents negative rates          |
| 7   | parseStatus parses a full status response                      | Maps all fields correctly        |
| 8   | parseStatus returns dashes for missing fields                  | Graceful fallback for empty data |
| 9   | parseStatus returns dashes for null input                      | Handles null response            |
| 10  | parseStatus handles partial data                               | Mixes real and fallback values   |
| 11  | getHealthMessage returns "UP" when status is ok                | Happy path health check          |
| 12  | getHealthMessage returns unexpected payload for other statuses | Non-standard response handling   |
| 13  | getHealthMessage handles missing status field                  | Graceful fallback                |
| 14  | classifyError classifies 429 as rate limited                   | Rate limit detection             |
| 15  | classifyError classifies 500 as server error                   | Server error detection           |
| 16  | classifyError classifies 503 as server error                   | Includes status code in message  |
| 17  | classifyError classifies network_error as offline              | Network failure detection        |
| 18  | classifyError classifies other errors with custom message      | Generic error passthrough        |
| 19  | classifyError uses default message when none provided          | Fallback error message           |
| 20  | formatMetricsEntry computes all three rates                    | Full metrics computation         |
| 21  | formatMetricsEntry returns 0 rates when no previous values     | Initial state handling           |

---

### Dashboard.test.jsx (11 tests)

| #   | Test                                       | What it verifies                                    |
| --- | ------------------------------------------ | --------------------------------------------------- |
| 1   | renders the dashboard title                | "EdgeForge Dashboard" renders                       |
| 2   | shows loading state initially for health   | Health indicator starts as "Checking..."            |
| 3   | shows "UP" when health check succeeds      | Green status after successful /health call          |
| 4   | shows "DOWN" when health check fails       | Red status on network error                         |
| 5   | renders all 5 stats cards                  | Uptime, Requests, Errors, Rate Limited, Active Sims |
| 6   | renders the Send Test Request button       | Button is present and clickable                     |
| 7   | disables button while sending              | Button shows "Sending..." and is disabled           |
| 8   | displays response after successful request | Shows requestId in response panel                   |
| 9   | shows rate limit error for 429 response    | Yellow banner with rate limit message               |
| 10  | shows network error when fetch fails       | Shows "Cannot reach backend" message                |
| 11  | renders chart cards                        | All 3 chart sections render                         |

### How to run frontend unit tests

```bash
cd frontend && npm test
```

---

## Cypress E2E Test

### File Added

- `cypress/e2e/dashboard.cy.js`

| #   | Test                                               | What it verifies                         |
| --- | -------------------------------------------------- | ---------------------------------------- |
| 1   | loads the dashboard page                           | Visits / and verifies title is visible   |
| 2   | displays the health indicator                      | Backend Health card is visible           |
| 3   | displays all five stats cards                      | All stats cards render on the page       |
| 4   | has a send test request button that can be clicked | Clicks button and verifies response area |
| 5   | displays chart sections                            | All 3 chart sections are visible         |

### How to run Cypress tests

```bash
cd frontend && npx cypress run       # headless
cd frontend && npx cypress open      # interactive
```
