package httpx

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"
)

// APIError, istemciye dönen tek tip hata gövdesi.
type APIError struct {
	Message string `json:"message"`
	Code    string `json:"code,omitempty"`
}

type errorEnvelope struct {
	Error APIError `json:"error"`
}

// StatusError, HTTP durum kodunu taşıyan uygulama hatası.
type StatusError struct {
	Status  int
	Message string
	Code    string
	Err     error
}

func (e *StatusError) Error() string {
	if e.Err != nil {
		return e.Message + ": " + e.Err.Error()
	}
	return e.Message
}

func (e *StatusError) Unwrap() error { return e.Err }

func BadRequest(msg string, err error) *StatusError {
	return &StatusError{Status: http.StatusBadRequest, Message: msg, Err: err}
}

func NotFound(msg string) *StatusError {
	return &StatusError{Status: http.StatusNotFound, Message: msg}
}

func Internal(msg string, err error) *StatusError {
	return &StatusError{Status: http.StatusInternalServerError, Message: msg, Err: err}
}

// JSON, gövdeyi verilen durum koduyla yazar.
func JSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if body == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Error("yanıt yazılamadı", "err", err)
	}
}

// Error, hatayı uygun durum koduyla JSON olarak yazar.
func Error(w http.ResponseWriter, err error) {
	var se *StatusError
	if errors.As(err, &se) {
		if se.Status >= 500 {
			slog.Error("sunucu hatası", "err", se.Error())
		}
		JSON(w, se.Status, errorEnvelope{APIError{Message: se.Message, Code: se.Code}})
		return
	}
	slog.Error("beklenmeyen hata", "err", err)
	JSON(w, http.StatusInternalServerError, errorEnvelope{APIError{Message: "Beklenmeyen bir hata oluştu"}})
}

// MaxBodyBytes, JSON istek gövdesi için üst sınır. İşlem kayıtları küçüktür;
// sınır, kötü niyetli büyük gövdenin belleği şişirmesini engeller.
const MaxBodyBytes = 1 << 20 // 1 MiB

// Decode, istek gövdesini hedefe çözer.
func Decode(r *http.Request, dst any) error {
	defer r.Body.Close()

	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, MaxBodyBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			return &StatusError{
				Status:  http.StatusRequestEntityTooLarge,
				Message: "İstek gövdesi çok büyük",
				Err:     err,
			}
		}
		return BadRequest("İstek gövdesi çözümlenemedi", err)
	}
	return nil
}

// Handler, hata döndürebilen işleyicileri http.HandlerFunc'a çevirir.
type Handler func(http.ResponseWriter, *http.Request) error

func (h Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if err := h(w, r); err != nil {
		Error(w, err)
	}
}

// QueryInt, sorgu parametresini tam sayı olarak okur.
func QueryInt(r *http.Request, key string, fallback int) int {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return v
}

// QueryTime, ISO-8601 veya YYYY-MM-DD biçimindeki parametreyi zamana çevirir.
func QueryTime(r *http.Request, key string) (*time.Time, error) {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return nil, nil
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02"} {
		if t, err := time.Parse(layout, raw); err == nil {
			return &t, nil
		}
	}
	return nil, BadRequest("Tarih biçimi geçersiz: "+key, nil)
}

// QueryStr, boş olmayan sorgu parametresini işaretçi olarak döner.
func QueryStr(r *http.Request, key string) *string {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return nil
	}
	return &raw
}
