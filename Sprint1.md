# Sprint 1

## User Stories

- As a user, I want to see if the backend gateway is running or not so I know if the system is healthy.
- As a user, I want to see live stats like uptime, request count, and errors so I can monitor whats going on.
- As a user, I want to send a test request and see which service it gets routed to.
- As a user, I want a dashboard to do all of this visually instead of using terminal commands.

## What We Planned

We planned 11 issues total for sprint 1 — 5 backend and 5 frontend, plus 1 bug fix that came up during development.

Backend (Kratik):
- #1 Set up the Go project structure
- #2 Add GET /health endpoint
- #3 Add GET /api/v1/status endpoint
- #4 Add POST /api/v1/request endpoint
- #5 Add middleware for requestId and latency logging

Frontend (Yash):
- #10 Set up React frontend with Vite
- #11 Build the dashboard layout
- #12 Hook up health indicator to backend
- #13 Add status polling and stats cards
- #14 Add send test request button

Bug fix:
- #22 CORS issue — browser was blocking frontend from calling backend, had to add headers in middleware

## What Got Done

Everything we planned got done. All issues closed, all PRs merged.

- Backend is running on port 8080 with all 3 endpoints working
- Frontend dashboard shows health status, live stats, and can send test requests
- Middleware logs every request with a unique requestId and latency
- CORS was fixed so frontend and backend talk to each other properly

## What Didn't Get Done and Why

- Rate limiting — we wanted to keep sprint 1 focused on getting the basic gateway and dashboard up and running. Adding rate limiting on top of that felt like too much for one sprint.
- Load balancing — same thing, we decided to get the core working first.
- Actual microservices — right now the backend just returns mock service names like "mock-orders-service". We didn't create real services behind the gateway yet. Thats planned for sprint 2.
- Traffic simulation — the frontend can only send one request at a time. We want to add buttons that send a bunch of requests at once to simulate real traffic, but that's a sprint 2 thing.
- Charts and request logs — the dashboard just shows numbers right now. We want to add graphs and a live log of requests in sprint 2.
