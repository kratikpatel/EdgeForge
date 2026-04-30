package apiresponse

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWriteJSONWritesContentTypeAndStatus(t *testing.T) {
	rec := httptest.NewRecorder()

	WriteJSON(rec, http.StatusCreated, map[string]string{
		"status": "created",
	})

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected status %d, got %d", http.StatusCreated, rec.Code)
	}

	contentType := rec.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Fatalf("expected Content-Type application/json, got %s", contentType)
	}

	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("expected valid JSON response, got error %v", err)
	}

	if body["status"] != "created" {
		t.Fatalf("expected status=created, got %s", body["status"])
	}
}

func TestWriteErrorWritesStandardErrorResponse(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/test", nil)

	WriteError(rec, req, http.StatusBadRequest, "bad_request", "invalid request")

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rec.Code)
	}

	var body ErrorResponse
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("expected valid error response JSON, got error %v", err)
	}

	if body.Error != "bad_request" {
		t.Fatalf("expected error bad_request, got %s", body.Error)
	}

	if body.Message != "invalid request" {
		t.Fatalf("expected message invalid request, got %s", body.Message)
	}

	if body.Code != http.StatusBadRequest {
		t.Fatalf("expected code %d, got %d", http.StatusBadRequest, body.Code)
	}
}
