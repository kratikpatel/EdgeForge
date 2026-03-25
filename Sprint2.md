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
- Integrate frontend with real backend (no more mock responses)  
- Add Cypress test  
- Add unit tests for frontend components  

---

## What Got Done

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
- Failure injection / traffic simulation — we manually stopped services to test failures, but didn’t build UI controls for it yet.  
- Visualization improvements — frontend still shows basic stats, not graphs or charts.  

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

```bash
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