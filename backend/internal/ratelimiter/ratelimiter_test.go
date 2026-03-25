package ratelimiter

import (
	"testing"
	"time"
)

func TestAllowWithinLimit(t *testing.T) {
	rl := New(3, 2*time.Second)
	clientID := "127.0.0.1"

	if !rl.Allow(clientID) {
		t.Fatal("expected first request to be allowed")
	}
	if !rl.Allow(clientID) {
		t.Fatal("expected second request to be allowed")
	}
	if !rl.Allow(clientID) {
		t.Fatal("expected third request to be allowed")
	}
}

func TestBlockWhenLimitExceeded(t *testing.T) {
	rl := New(2, 2*time.Second)
	clientID := "127.0.0.1"

	if !rl.Allow(clientID) {
		t.Fatal("expected first request to be allowed")
	}
	if !rl.Allow(clientID) {
		t.Fatal("expected second request to be allowed")
	}
	if rl.Allow(clientID) {
		t.Fatal("expected third request to be blocked")
	}
}

func TestAllowAfterWindowReset(t *testing.T) {
	rl := New(2, 200*time.Millisecond)
	clientID := "127.0.0.1"

	if !rl.Allow(clientID) {
		t.Fatal("expected first request to be allowed")
	}
	if !rl.Allow(clientID) {
		t.Fatal("expected second request to be allowed")
	}
	if rl.Allow(clientID) {
		t.Fatal("expected third request to be blocked before window reset")
	}

	time.Sleep(250 * time.Millisecond)

	if !rl.Allow(clientID) {
		t.Fatal("expected request to be allowed after window reset")
	}
}
