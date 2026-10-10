package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"slices"
)

type ctxKey string

const (
	ctxUserID ctxKey = "user_id"
	ctxEmail  ctxKey = "email"
)

// ErrUnauthorized, doğrulanamayan istekler için tek tip hata.
var ErrUnauthorized = errors.New("yetkisiz istek")

// UserID, middleware'in context'e koyduğu kullanıcı kimliğini döner.
func UserID(ctx context.Context) string {
	id, _ := ctx.Value(ctxUserID).(string)
	return id
}

// Email, oturum sahibinin e-posta adresini döner.
func Email(ctx context.Context) string {
	e, _ := ctx.Value(ctxEmail).(string)
	return e
}

func withUser(ctx context.Context, id, email string) context.Context {
	ctx = context.WithValue(ctx, ctxUserID, id)
	return context.WithValue(ctx, ctxEmail, email)
}

// RequireOrigin, durum değiştiren isteklerde Origin başlığını izinli
// listeyle karşılaştırır. Oturum çerezde taşındığı için bu, SameSite=Lax'ın
// üstüne ikinci bir CSRF katmanıdır.
//
// Origin yoksa (curl, sunucudan sunucuya istek) geçer: tarayıcılar POST,
// PUT ve DELETE isteklerinde Origin'i her zaman gönderir.
func RequireOrigin(allowed []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodGet, http.MethodHead, http.MethodOptions:
				next.ServeHTTP(w, r)
				return
			}
			origin := r.Header.Get("Origin")
			if origin != "" && !slices.Contains(allowed, origin) {
				writeError(w, http.StatusForbidden, "İstek kaynağı kabul edilmedi")
				return
			}
			if origin == "" && r.Header.Get("Sec-Fetch-Site") == "cross-site" {
				writeError(w, http.StatusForbidden, "İstek kaynağı kabul edilmedi")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	fmt.Fprintf(w, `{"error":{"message":%q}}`, msg)
}
