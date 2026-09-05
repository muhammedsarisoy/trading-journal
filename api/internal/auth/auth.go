package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type ctxKey string

const (
	ctxUserID ctxKey = "user_id"
	ctxEmail  ctxKey = "email"
)

// ErrUnauthorized, doğrulanamayan istekler için tek tip hata.
var ErrUnauthorized = errors.New("yetkisiz istek")

// Verifier, Supabase erişim jetonlarını doğrular.
// Simetrik (HS256 / legacy JWT secret) ve asimetrik (JWKS) modu destekler.
type Verifier struct {
	secret []byte
	jwks   *keyCache
}

// NewVerifier, en az biri dolu olmak üzere secret veya jwksURL ister.
func NewVerifier(secret, jwksURL string) (*Verifier, error) {
	if secret == "" && jwksURL == "" {
		return nil, errors.New("JWT doğrulaması için secret veya JWKS adresi gerekli")
	}
	v := &Verifier{}
	if secret != "" {
		v.secret = []byte(secret)
	}
	if jwksURL != "" {
		v.jwks = newKeyCache(jwksURL)
	}
	return v, nil
}

// Claims, uygulamanın ilgilendiği jeton alanları.
type Claims struct {
	UserID string
	Email  string
	Role   string
}

// Parse, jetonu doğrular ve kullanıcı bilgilerini döner.
func (v *Verifier) Parse(tokenString string) (*Claims, error) {
	parsed, err := jwt.Parse(tokenString, v.keyFunc,
		jwt.WithValidMethods([]string{"HS256", "RS256", "ES256"}),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnauthorized, err)
	}

	mapClaims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return nil, ErrUnauthorized
	}

	sub, _ := mapClaims["sub"].(string)
	if sub == "" {
		return nil, fmt.Errorf("%w: sub alanı yok", ErrUnauthorized)
	}

	// Supabase'in anon ve service_role anahtarları da aynı proje anahtarıyla
	// imzalanır. Yalnız gerçek bir kullanıcı oturumu kabul edilir; aksi halde
	// sızan bir servis anahtarı doğrudan API erişimine dönüşür.
	role, _ := mapClaims["role"].(string)
	if role != "authenticated" {
		return nil, fmt.Errorf("%w: beklenmeyen rol %q", ErrUnauthorized, role)
	}

	// aud dizi ya da tek dize olabilir. Yoksa reddedilmez — asıl koruma rol
	// kontrolü; aud yalnız varsa doğrulanır.
	if raw, ok := mapClaims["aud"]; ok && !hasAudience(raw, "authenticated") {
		return nil, fmt.Errorf("%w: beklenmeyen aud", ErrUnauthorized)
	}

	email, _ := mapClaims["email"].(string)

	return &Claims{UserID: sub, Email: email, Role: role}, nil
}

// hasAudience, aud alanının beklenen değeri içerip içermediğine bakar.
func hasAudience(raw any, want string) bool {
	switch v := raw.(type) {
	case string:
		return v == want
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok && s == want {
				return true
			}
		}
	}
	return false
}

func (v *Verifier) keyFunc(token *jwt.Token) (any, error) {
	switch token.Method.Alg() {
	case "HS256":
		if v.secret == nil {
			return nil, errors.New("HS256 jetonu geldi ama SUPABASE_JWT_SECRET tanımlı değil")
		}
		return v.secret, nil

	case "RS256", "ES256":
		if v.jwks == nil {
			return nil, errors.New("asimetrik jeton geldi ama SUPABASE_JWKS_URL tanımlı değil")
		}
		kid, _ := token.Header["kid"].(string)
		if kid == "" {
			return nil, errors.New("jeton başlığında kid yok")
		}
		return v.jwks.publicKey(kid)

	default:
		return nil, fmt.Errorf("desteklenmeyen imza algoritması: %s", token.Method.Alg())
	}
}

// Middleware, Authorization: Bearer <token> başlığını doğrulayıp
// kullanıcı kimliğini context'e koyar.
func (v *Verifier) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			unauthorized(w, "Authorization başlığı eksik")
			return
		}

		claims, err := v.Parse(strings.TrimPrefix(header, "Bearer "))
		if err != nil {
			unauthorized(w, "Oturum geçersiz veya süresi dolmuş")
			return
		}

		ctx := context.WithValue(r.Context(), ctxUserID, claims.UserID)
		ctx = context.WithValue(ctx, ctxEmail, claims.Email)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// UserID, middleware'in context'e koyduğu kullanıcı kimliğini döner.
func UserID(ctx context.Context) string {
	id, _ := ctx.Value(ctxUserID).(string)
	return id
}

// Email, jetondaki e-posta adresini döner.
func Email(ctx context.Context) string {
	e, _ := ctx.Value(ctxEmail).(string)
	return e
}

func unauthorized(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusUnauthorized)
	fmt.Fprintf(w, `{"error":{"message":%q}}`, msg)
}
