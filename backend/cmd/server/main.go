package main

import (
	"encoding/json"
	"log"
	"net/http"

	"edgeforge/backend/internal/metrics"
)

func main() {
	m := metrics.New()

	// Health endpoint
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","service":"edgeforge-gateway"}`))
	})

	// Status endpoint (for dashboard polling)
	http.HandleFunc("/api/v1/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(m.Snapshot())
	})

	log.Println("EdgeForge backend running on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
