package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/endpoints"
)

const googleUserInfoURL = "https://openidconnect.googleapis.com/v1/userinfo"

// Google, "Google ile devam et" akışını yürütür (yetkilendirme kodu + PKCE).
type Google struct {
	cfg *oauth2.Config
}

// NewGoogle, istemci kimliği ve sırrı verilmemişse nil döner; o durumda
// giriş ekranında Google düğmesi görünmez.
func NewGoogle(clientID, clientSecret, redirectURL string) *Google {
	if clientID == "" || clientSecret == "" {
		return nil
	}
	return &Google{cfg: &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURL,
		Endpoint:     endpoints.Google,
		Scopes:       []string{"openid", "email", "profile"},
	}}
}

// GoogleUser, userinfo ucundan dönen alanların ihtiyaç duyulanları.
type GoogleUser struct {
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
}

// NewVerifier, PKCE doğrulayıcısı üretir.
func (g *Google) NewVerifier() string { return oauth2.GenerateVerifier() }

// AuthURL, kullanıcının yönlendirileceği Google onay adresi.
func (g *Google) AuthURL(state, verifier string) string {
	return g.cfg.AuthCodeURL(state,
		oauth2.S256ChallengeOption(verifier),
		oauth2.SetAuthURLParam("prompt", "select_account"),
	)
}

// Exchange, dönüşteki kodu jetona çevirir ve kullanıcı bilgisini okur.
func (g *Google) Exchange(ctx context.Context, code, verifier string) (*GoogleUser, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	tok, err := g.cfg.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return nil, fmt.Errorf("google kodu çevrilemedi: %w", err)
	}

	resp, err := g.cfg.Client(ctx, tok).Get(googleUserInfoURL)
	if err != nil {
		return nil, fmt.Errorf("google kullanıcı bilgisi alınamadı: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("google userinfo yanıtı %d: %s", resp.StatusCode, body)
	}

	var u GoogleUser
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<16)).Decode(&u); err != nil {
		return nil, fmt.Errorf("google kullanıcı bilgisi çözülemedi: %w", err)
	}
	if u.Sub == "" || u.Email == "" {
		return nil, errors.New("google yanıtında sub ya da e-posta yok")
	}
	return &u, nil
}
