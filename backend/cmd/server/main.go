package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"edgeforge/backend/internal/metrics"
)

type RequestBody struct {
	Route   string         `json:"route"`
	Payload map[string]any `json:"payload"`
}

type RequestResponse struct {
	RequestID string `json:"requestId"`
	RoutedTo  string `json:"routedTo"`
	Status    string `json:"status"`
}

func generateRequestID() string {
	b := make([]byte, 8) // 16 hex chars
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func writeJSON(w http.ResponseWriter, statusCode int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(v)
}

func main() {
	m := metrics.New()

	// Health endpoint
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "ok",
			"service": "edgeforge-gateway",
		})
	})

	// Status endpoint (for dashboard polling)
	http.HandleFunc("/api/v1/status", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, m.Snapshot())
	})

	// Request endpoint (simulate gateway routing)
	http.HandleFunc("/api/v1/request", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]any{
				"error": "method_not_allowed",
			})
			return
		}

		var body RequestBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			m.IncErrors()
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error": "invalid_json",
			})
			return
		}

		// Track request count (so /status updates)
		m.IncRequests()

		// Optional: simulate a little processing latency (makes demos look realistic)
		time.Sleep(80 * time.Millisecond)

		requestID := generateRequestID()

		// For Sprint 1, we "simulate" routing based on route prefix
		routedTo := "mock-generic-service"
		if body.Route == "/orders" {
			routedTo = "mock-orders-service"
		} else if body.Route == "/analytics" {
			routedTo = "mock-analytics-service"
		}

		writeJSON(w, http.StatusOK, RequestResponse{
			RequestID: requestID,
			RoutedTo:  routedTo,
			Status:    "success",
		})
	})

	log.Println("EdgeForge backend running on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
