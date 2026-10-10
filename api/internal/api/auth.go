package api

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"log/slog"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/muhammedsarisoy/trading-journal/api/internal/auth"
	"github.com/muhammedsarisoy/trading-journal/api/internal/httpx"
	"github.com/muhammedsarisoy/trading-journal/api/internal/store"
)

const (
	oauthCookie     = "tj_oauth"
	oauthCookiePath = "/api/v1/auth/google"
	msgBadLogin     = "E-posta veya parola hatalı."
	msgSignupClosed = "Yeni kayıt kapalı."
)

type credentials struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

// normalizeEmail, adresi küçük harfe çevirir ve biçimini doğrular.
func normalizeEmail(raw string) (string, bool) {
	e := strings.ToLower(strings.TrimSpace(raw))
	if e == "" || len(e) > 254 {
		return "", false
	}
	addr, err := mail.ParseAddress(e)
	if err != nil || addr.Address != e {
		return "", false
	}
	return e, true
}

func defaultName(name, email string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		name, _, _ = strings.Cut(email, "@")
	}
	if utf8.RuneCountInString(name) > 80 {
		name = string([]rune(name)[:80])
	}
	return name
}

// startSession, oturum açar ve çerezini yazar.
func (s *Server) startSession(w http.ResponseWriter, r *http.Request, userID string) error {
	token, expires, err := s.sessions.Create(r.Context(), userID, r.UserAgent())
	if err != nil {
		return httpx.Internal("Oturum açılamadı", err)
	}
	s.sessions.SetCookie(w, token, expires)
	s.store.TouchLogin(r.Context(), userID)
	return nil
}

// authProviders, giriş ekranının hangi seçenekleri göstereceğini söyler.
func (s *Server) authProviders(w http.ResponseWriter, _ *http.Request) error {
	httpx.JSON(w, http.StatusOK, map[string]bool{
		"google": s.google != nil,
		"signup": s.allowSignup,
	})
	return nil
}

func (s *Server) signup(w http.ResponseWriter, r *http.Request) error {
	if !s.allowSignup {
		return &httpx.StatusError{Status: http.StatusForbidden, Message: msgSignupClosed}
	}
	var in credentials
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	email, ok := normalizeEmail(in.Email)
	if !ok {
		return httpx.BadRequest("Geçerli bir e-posta adresi gir.", nil)
	}
	if len(in.Password) < auth.MinPasswordLen {
		return httpx.BadRequest("Parola en az 8 karakter olmalı.", nil)
	}
	if len(in.Password) > auth.MaxPasswordLen {
		return httpx.BadRequest("Parola en çok 72 karakter olabilir.", nil)
	}

	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		return httpx.Internal("Parola işlenemedi", err)
	}
	u, err := s.store.CreateUser(r.Context(), store.NewUser{
		Email:        email,
		PasswordHash: &hash,
		DisplayName:  defaultName(in.DisplayName, email),
	})
	if errors.Is(err, store.ErrConflict) {
		return &httpx.StatusError{Status: http.StatusConflict, Message: "Bu e-posta ile zaten bir hesap var."}
	}
	if err != nil {
		return storeErr(err)
	}

	if err := s.startSession(w, r, u.ID); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, map[string]string{"user_id": u.ID, "email": u.Email})
	return nil
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) error {
	var in credentials
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	email, ok := normalizeEmail(in.Email)
	if !ok {
		return &httpx.StatusError{Status: http.StatusUnauthorized, Message: msgBadLogin}
	}
	if s.loginLimiter.RespondOnLimit(w, r, "login:"+email) {
		return nil
	}

	u, err := s.store.UserByEmail(r.Context(), email)
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		return storeErr(err)
	}
	var hash *string
	if u != nil {
		hash = u.PasswordHash
	}
	if !auth.CheckPassword(hash, in.Password) {
		return &httpx.StatusError{Status: http.StatusUnauthorized, Message: msgBadLogin}
	}

	if err := s.startSession(w, r, u.ID); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"user_id": u.ID, "email": u.Email})
	return nil
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) error {
	if token := auth.TokenFrom(r); token != "" {
		if err := s.sessions.Revoke(r.Context(), token); err != nil {
			slog.Warn("oturum silinemedi", "err", err)
		}
	}
	s.sessions.ClearCookie(w)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// ------------------------------------------------------------------ Google

// safeNext, açık yönlendirmeyi engeller: yalnız kendi içimizde bir yol kabul edilir.
func safeNext(v string) string {
	if !strings.HasPrefix(v, "/") || strings.HasPrefix(v, "//") || strings.HasPrefix(v, "/\\") {
		return "/dashboard"
	}
	return v
}

func randomString(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// googleStart, kullanıcıyı Google onay ekranına yollar. state ve PKCE
// doğrulayıcısı kısa ömürlü bir HttpOnly çerezde bekler.
func (s *Server) googleStart(w http.ResponseWriter, r *http.Request) error {
	if s.google == nil {
		return httpx.NotFound("Google ile giriş yapılandırılmamış")
	}
	state := randomString(24)
	verifier := s.google.NewVerifier()
	next := base64.RawURLEncoding.EncodeToString([]byte(safeNext(r.URL.Query().Get("next"))))

	http.SetCookie(w, &http.Cookie{
		Name:     oauthCookie,
		Value:    state + "." + verifier + "." + next,
		Path:     oauthCookiePath,
		MaxAge:   600,
		HttpOnly: true,
		Secure:   s.sessions.Secure(),
		// Google'dan dönüş üst düzey bir GET yönlendirmesi; Lax çerezi taşır.
		SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, s.google.AuthURL(state, verifier), http.StatusFound)
	return nil
}

func (s *Server) googleCallback(w http.ResponseWriter, r *http.Request) error {
	fail := func(msg string) error {
		http.Redirect(w, r, "/login?error="+url.QueryEscape(msg), http.StatusFound)
		return nil
	}
	if s.google == nil {
		return fail("Google ile giriş yapılandırılmamış.")
	}

	// Çerez tek kullanımlık: sonuç ne olursa olsun silinir.
	c, cookieErr := r.Cookie(oauthCookie)
	http.SetCookie(w, &http.Cookie{
		Name: oauthCookie, Value: "", Path: oauthCookiePath, MaxAge: -1,
		HttpOnly: true, Secure: s.sessions.Secure(), SameSite: http.SameSiteLaxMode,
	})

	q := r.URL.Query()
	if q.Get("error") != "" {
		return fail("Google girişi iptal edildi.")
	}
	if cookieErr != nil {
		return fail("Giriş oturumu zaman aşımına uğradı, tekrar dene.")
	}
	parts := strings.Split(c.Value, ".")
	if len(parts) != 3 || subtle.ConstantTimeCompare([]byte(parts[0]), []byte(q.Get("state"))) != 1 {
		return fail("Giriş isteği doğrulanamadı, tekrar dene.")
	}
	code := q.Get("code")
	if code == "" {
		return fail("Yetkilendirme kodu alınamadı.")
	}
	nextRaw, _ := base64.RawURLEncoding.DecodeString(parts[2])
	next := safeNext(string(nextRaw))

	ctx := r.Context()
	gu, err := s.google.Exchange(ctx, code, parts[1])
	if err != nil {
		slog.Warn("google girişi başarısız", "err", err)
		return fail("Google ile giriş tamamlanamadı.")
	}
	if !gu.EmailVerified {
		return fail("Google hesabının e-postası doğrulanmamış.")
	}
	email, ok := normalizeEmail(gu.Email)
	if !ok {
		return fail("Google hesabının e-postası geçersiz.")
	}

	u, err := s.store.UserByGoogleSub(ctx, gu.Sub)
	if errors.Is(err, store.ErrNotFound) {
		// Aynı e-postayla parola hesabı varsa ona bağlanır: Google adresin
		// sahipliğini doğruladı.
		u, err = s.store.UserByEmail(ctx, email)
		switch {
		case err == nil:
			err = s.store.LinkGoogle(ctx, u.ID, gu.Sub)
		case errors.Is(err, store.ErrNotFound) && !s.allowSignup:
			return fail(msgSignupClosed)
		case errors.Is(err, store.ErrNotFound):
			sub := gu.Sub
			u, err = s.store.CreateUser(ctx, store.NewUser{
				Email:       email,
				GoogleSub:   &sub,
				DisplayName: defaultName(gu.Name, email),
			})
		}
	}
	if err != nil {
		slog.Error("google kullanıcısı işlenemedi", "err", err)
		return fail("Google ile giriş tamamlanamadı.")
	}

	if err := s.startSession(w, r, u.ID); err != nil {
		slog.Error("google oturumu açılamadı", "err", err)
		return fail("Oturum açılamadı.")
	}
	http.Redirect(w, r, next, http.StatusFound)
	return nil
}
