package ratelimiter

import (
	"sync"
	"time"
)

type clientWindow struct {
	count       int
	windowStart time.Time
}

type RateLimiter struct {
	mu      sync.Mutex
	limit   int
	window  time.Duration
	clients map[string]*clientWindow
}

func New(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		limit:   limit,
		window:  window,
		clients: make(map[string]*clientWindow),
	}
}

func (r *RateLimiter) Allow(clientID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()

	entry, exists := r.clients[clientID]
	if !exists {
		r.clients[clientID] = &clientWindow{
			count:       1,
			windowStart: now,
		}
		return true
	}

	if now.Sub(entry.windowStart) >= r.window {
		entry.count = 1
		entry.windowStart = now
		return true
	}

	if entry.count >= r.limit {
		return false
	}

	entry.count++
	return true
}
