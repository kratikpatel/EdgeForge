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
		"service": "orders-service-2",
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
		Service: "orders-service-2",
		Status:  "processed",
		Message: "orders request handled successfully by instance 2",
		Payload: req.Payload,
	})
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/handle", handleHandler)

	log.Println("Orders service 2 running on :9002")
	log.Fatal(http.ListenAndServe(":9002", mux))
}
