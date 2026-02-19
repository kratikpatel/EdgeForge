package main

import (
	"log"
	"net/http"
)

func main() {
	// Health endpoint
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","service":"edgeforge-gateway"}`))
	})

	log.Println("EdgeForge backend running on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
