package apiresponse

import (
	"encoding/json"
	"net/http"

	"edgeforge/backend/internal/middleware"
)

type ErrorResponse struct {
	Error     string `json:"error"`
	Message   string `json:"message"`
	Code      int    `json:"code"`
	RequestID string `json:"requestId,omitempty"`
}

func WriteJSON(w http.ResponseWriter, statusCode int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(v)
}

func WriteError(w http.ResponseWriter, r *http.Request, statusCode int, errorCode string, message string) {
	WriteJSON(w, statusCode, ErrorResponse{
		Error:     errorCode,
		Message:   message,
		Code:      statusCode,
		RequestID: middleware.GetRequestID(r),
	})
}
