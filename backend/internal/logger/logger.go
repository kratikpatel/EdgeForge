package logger

import (
	"encoding/json"
	"log"
	"time"
)

type Fields map[string]any

func Info(message string, fields Fields) {
	write("info", message, fields)
}

func Error(message string, fields Fields) {
	write("error", message, fields)
}

func write(level string, message string, fields Fields) {
	if fields == nil {
		fields = Fields{}
	}

	fields["level"] = level
	fields["message"] = message
	fields["timestamp"] = time.Now().Format(time.RFC3339Nano)

	encoded, err := json.Marshal(fields)
	if err != nil {
		log.Printf(`{"level":"error","message":"failed_to_encode_log","error":%q}`, err.Error())
		return
	}

	log.Println(string(encoded))
}
