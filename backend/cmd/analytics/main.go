package main

import (
	"encoding/json"
	"log"
	"net/http"
)

type HandleRequest struct {
	Route   string         `json:"route"`
	Payload map[string]any `json:"payload"`
}

type HandleResponse struct {
	Service string         `json:"service"`
	Status  string         `json:"status"`
	Message string         `json:"message"`
	Payload map[string]any `json:"payload,omitempty"`
}

func writeJSON(w http.ResponseWriter, statusCode int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(v)
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{
			"error": "method_not_allowed",
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"service": "analytics-service",
	})
}

func handleHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{
			"error": "method_not_allowed",
		})
		return
	}

	var req HandleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error": "invalid_json",
		})
		return
	}

	writeJSON(w, http.StatusOK, HandleResponse{
		Service: "analytics-service",
		Status:  "processed",
		Message: "analytics request handled successfully",
		Payload: req.Payload,
	})
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/handle", handleHandler)

	log.Println("Analytics service running on :9011")
	log.Fatal(http.ListenAndServe(":9011", mux))
}
