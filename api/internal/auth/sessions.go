package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CookieName, oturum jetonunu taşıyan çerez.
const CookieName = "tj_session"

// Sessions, sunucu tarafı oturumları yönetir. Jeton rastgele 32 bayttır;
// veritabanında yalnız SHA-256 özeti tutulur.
type Sessions struct {
	pool   *pgxpool.Pool
	ttl    time.Duration
	secure bool // https üzerinde çerez yalnız güvenli bağlantıda gönderilir
}

func NewSessions(pool *pgxpool.Pool, ttl time.Duration, secure bool) *Sessions {
	return &Sessions{pool: pool, ttl: ttl, secure: secure}
}

// Secure, çerezlerin Secure bayrağıyla yazılıp yazılmadığını söyler.
func (s *Sessions) Secure() bool { return s.secure }

func hashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

// Create, kullanıcı için yeni oturum açar ve çereze yazılacak jetonu döner.
func (s *Sessions) Create(ctx context.Context, userID, userAgent string) (string, time.Time, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", time.Time{}, fmt.Errorf("oturum jetonu üretilemedi: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(buf)
	expires := time.Now().Add(s.ttl)

	if len(userAgent) > 200 {
		userAgent = userAgent[:200]
	}

	// Süresi geçmiş oturumlar her girişte temizlenir; ayrı bir zamanlayıcıya
	// gerek kalmıyor.
	if _, err := s.pool.Exec(ctx, "delete from public.sessions where expires_at < now()"); err != nil {
		slog.Warn("eski oturumlar temizlenemedi", "err", err)
	}

	_, err := s.pool.Exec(ctx,
		`insert into public.sessions (token_hash, user_id, expires_at, user_agent)
		 values ($1, $2, $3, nullif($4, ''))`,
		hashToken(token), userID, expires, userAgent)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("oturum kaydedilemedi: %w", err)
	}
	return token, expires, nil
}

type sessionUser struct {
	id      string
	email   string
	expires time.Time
}

// lookup, jetona ait geçerli oturumu bulur. Ömrünün yarısı dolmuşsa süreyi
// uzatır; böylece aktif kullanıcı hiç çıkış yapmak zorunda kalmaz.
func (s *Sessions) lookup(ctx context.Context, token string) (*sessionUser, bool, error) {
	var u sessionUser
	err := s.pool.QueryRow(ctx,
		`select u.id, u.email, s.expires_at
		 from public.sessions s
		 join public.users u on u.id = s.user_id
		 where s.token_hash = $1 and s.expires_at > now()`,
		hashToken(token)).Scan(&u.id, &u.email, &u.expires)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, ErrUnauthorized
	}
	if err != nil {
		return nil, false, fmt.Errorf("oturum okunamadı: %w", err)
	}

	if time.Until(u.expires) > s.ttl/2 {
		return &u, false, nil
	}
	u.expires = time.Now().Add(s.ttl)
	if _, err := s.pool.Exec(ctx,
		"update public.sessions set expires_at = $2 where token_hash = $1",
		hashToken(token), u.expires); err != nil {
		slog.Warn("oturum süresi uzatılamadı", "err", err)
		return &u, false, nil
	}
	return &u, true, nil
}

// Revoke, jetona ait oturumu siler. Jeton bilinmiyorsa hata vermez.
func (s *Sessions) Revoke(ctx context.Context, token string) error {
	_, err := s.pool.Exec(ctx, "delete from public.sessions where token_hash = $1", hashToken(token))
	return err
}

// SetCookie, oturum çerezini yazar.
func (s *Sessions) SetCookie(w http.ResponseWriter, token string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/",
		Expires:  expires,
		MaxAge:   int(time.Until(expires).Seconds()),
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// ClearCookie, oturum çerezini siler.
func (s *Sessions) ClearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// TokenFrom, isteğin oturum jetonunu çerezden ya da Authorization
// başlığından okur. Başlık, tarayıcı dışı istemciler için bırakıldı.
func TokenFrom(r *http.Request) string {
	if c, err := r.Cookie(CookieName); err == nil && c.Value != "" {
		return c.Value
	}
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	return ""
}

// Middleware, oturumu doğrulayıp kullanıcı kimliğini context'e koyar.
func (s *Sessions) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := TokenFrom(r)
		if token == "" {
			writeError(w, http.StatusUnauthorized, "Oturum bulunamadı")
			return
		}

		u, renewed, err := s.lookup(r.Context(), token)
		if errors.Is(err, ErrUnauthorized) {
			s.ClearCookie(w)
			writeError(w, http.StatusUnauthorized, "Oturum geçersiz veya süresi dolmuş")
			return
		}
		if err != nil {
			slog.Error("oturum doğrulanamadı", "err", err)
			writeError(w, http.StatusInternalServerError, "Oturum doğrulanamadı")
			return
		}
		if renewed {
			s.SetCookie(w, token, u.expires)
		}

		next.ServeHTTP(w, r.WithContext(withUser(r.Context(), u.id, u.email)))
	})
}
