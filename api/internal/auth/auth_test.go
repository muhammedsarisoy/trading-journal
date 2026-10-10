package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPasswordRoundTrip(t *testing.T) {
	hash, err := HashPassword("doğru-parola")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(hash, "$2a$12$") {
		t.Fatalf("beklenmeyen bcrypt biçimi: %s", hash[:7])
	}
	if !CheckPassword(&hash, "doğru-parola") {
		t.Fatal("doğru parola reddedildi")
	}
	if CheckPassword(&hash, "yanlış-parola") {
		t.Fatal("yanlış parola kabul edildi")
	}
}

func TestCheckPasswordAcceptsSupabaseHash(t *testing.T) {
	// Supabase (GoTrue) $2a$10$ biçiminde yazar; taşınan hesaplar aynı
	// parolayla girebilmeli. Bu hash "parola123" içindir.
	hash := "$2a$10$t6gxgGjcIiuno2tcnq/tkeAEQ5LtOA0hUJUwFihQE0bs6GL.bLLMC"
	if !CheckPassword(&hash, "parola123") {
		t.Fatal("Supabase hash'i doğrulanamadı")
	}
}

func TestCheckPasswordWithoutHash(t *testing.T) {
	empty := ""
	for _, h := range []*string{nil, &empty} {
		if CheckPassword(h, "herhangi") {
			t.Fatal("hash'siz hesap parolayla girebildi")
		}
	}
}

func TestHashPasswordRejectsOver72Bytes(t *testing.T) {
	if _, err := HashPassword(strings.Repeat("a", MaxPasswordLen+1)); err == nil {
		t.Fatal("72 bayttan uzun parola sessizce kırpılmamalı")
	}
}

func TestRequireOrigin(t *testing.T) {
	h := RequireOrigin([]string{"https://app.test"})(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	cases := []struct {
		name, method, origin, fetchSite string
		want                            int
	}{
		{"aynı origin POST", "POST", "https://app.test", "", 204},
		{"yabancı origin POST", "POST", "https://evil.test", "", 403},
		{"yabancı origin DELETE", "DELETE", "https://evil.test", "", 403},
		{"alt alan da yabancı", "PUT", "https://x.app.test", "", 403},
		{"Origin yok, sunucudan", "POST", "", "", 204},
		{"Origin yok ama cross-site", "POST", "", "cross-site", 403},
		{"GET her zaman geçer", "GET", "https://evil.test", "", 204},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := httptest.NewRequest(c.method, "/x", nil)
			if c.origin != "" {
				r.Header.Set("Origin", c.origin)
			}
			if c.fetchSite != "" {
				r.Header.Set("Sec-Fetch-Site", c.fetchSite)
			}
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != c.want {
				t.Fatalf("durum %d, beklenen %d", w.Code, c.want)
			}
		})
	}
}

func TestTokenFrom(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	if TokenFrom(r) != "" {
		t.Fatal("boş istekte jeton bulundu")
	}
	r.Header.Set("Authorization", "Bearer abc")
	if TokenFrom(r) != "abc" {
		t.Fatal("Bearer başlığı okunmadı")
	}
	r.AddCookie(&http.Cookie{Name: CookieName, Value: "cerez"})
	if TokenFrom(r) != "cerez" {
		t.Fatal("çerez başlıktan öncelikli olmalı")
	}
}

func TestNewGoogleRequiresBothCredentials(t *testing.T) {
	if NewGoogle("", "", "x") != nil || NewGoogle("id", "", "x") != nil || NewGoogle("", "s", "x") != nil {
		t.Fatal("eksik kimlikle Google açılmamalı")
	}
	g := NewGoogle("id", "secret", "https://app.test/cb")
	if g == nil {
		t.Fatal("Google yapılandırılmadı")
	}
	u := g.AuthURL("durum", g.NewVerifier())
	for _, want := range []string{"state=durum", "code_challenge=", "code_challenge_method=S256", "redirect_uri=https%3A%2F%2Fapp.test%2Fcb", "prompt=select_account"} {
		if !strings.Contains(u, want) {
			t.Errorf("onay adresinde %q yok: %s", want, u)
		}
	}
}
