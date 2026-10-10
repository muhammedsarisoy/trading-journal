package config

import (
	"strings"
	"testing"
	"time"
)

// setEnv, Load'un okuduğu tüm değişkenleri boşaltıp verilenleri yazar;
// geliştiricinin kendi ortamı ya da .env dosyası testi etkilemesin.
func setEnv(t *testing.T, kv map[string]string) {
	t.Helper()
	t.Chdir(t.TempDir()) // .env okunmasın
	for _, k := range []string{
		"PORT", "DATABASE_URL", "APP_URL", "ALLOWED_ORIGINS", "AUTO_MIGRATE", "ALLOW_SIGNUP",
		"SESSION_TTL_DAYS", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "UPLOAD_DIR", "APP_TIMEZONE",
	} {
		t.Setenv(k, kv[k])
	}
}

func TestLoadDefaults(t *testing.T) {
	setEnv(t, map[string]string{"DATABASE_URL": "postgres://x"})
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.AppURL != "http://localhost:3000" || cfg.Port != "8080" || cfg.Timezone != "Europe/Istanbul" {
		t.Fatalf("beklenmeyen varsayılanlar: %+v", cfg)
	}
	if !cfg.AutoMigrate || !cfg.AllowSignup {
		t.Fatal("AUTO_MIGRATE ve ALLOW_SIGNUP varsayılan olarak açık olmalı")
	}
	if cfg.SessionTTL != 30*24*time.Hour {
		t.Fatalf("oturum süresi %v", cfg.SessionTTL)
	}
	if len(cfg.AllowedOrigins) != 1 || cfg.AllowedOrigins[0] != cfg.AppURL {
		t.Fatalf("izinli origin APP_URL'den türemeli: %v", cfg.AllowedOrigins)
	}
	if cfg.SecureCookies() {
		t.Fatal("http üzerinde Secure çerez yazılırsa tarayıcı onu hiç geri göndermez")
	}
}

func TestLoadDerivesFromAppURL(t *testing.T) {
	setEnv(t, map[string]string{
		"DATABASE_URL":     "postgres://x",
		"APP_URL":          "https://journal.example.com/",
		"ALLOW_SIGNUP":     "false",
		"SESSION_TTL_DAYS": "7",
	})
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.AppURL != "https://journal.example.com" {
		t.Fatalf("sondaki / kırpılmadı: %q", cfg.AppURL)
	}
	if !cfg.SecureCookies() {
		t.Fatal("https'te çerez Secure olmalı")
	}
	if got := cfg.GoogleRedirectURL(); got != "https://journal.example.com/api/v1/auth/google/callback" {
		t.Fatalf("dönüş adresi %q", got)
	}
	if cfg.AllowSignup || cfg.SessionTTL != 7*24*time.Hour {
		t.Fatalf("ayarlar okunmadı: %+v", cfg)
	}
}

func TestLoadRejectsBadConfig(t *testing.T) {
	cases := map[string]struct {
		env  map[string]string
		want string
	}{
		"DATABASE_URL yok":    {map[string]string{}, "DATABASE_URL"},
		"APP_URL şemasız":     {map[string]string{"DATABASE_URL": "x", "APP_URL": "journal.example.com"}, "APP_URL"},
		"yıldızlı origin":     {map[string]string{"DATABASE_URL": "x", "ALLOWED_ORIGINS": "*"}, "*"},
		"şemasız origin":      {map[string]string{"DATABASE_URL": "x", "ALLOWED_ORIGINS": "app.test"}, "geçersiz origin"},
		"yarım Google":        {map[string]string{"DATABASE_URL": "x", "GOOGLE_CLIENT_ID": "id"}, "GOOGLE_CLIENT_ID"},
		"bozuk bool":          {map[string]string{"DATABASE_URL": "x", "ALLOW_SIGNUP": "belki"}, "ALLOW_SIGNUP"},
		"sıfır oturum süresi": {map[string]string{"DATABASE_URL": "x", "SESSION_TTL_DAYS": "0"}, "SESSION_TTL_DAYS"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			setEnv(t, c.env)
			_, err := Load()
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("%q içeren hata bekleniyordu, gelen %v", c.want, err)
			}
		})
	}
}

func TestSplitAndTrim(t *testing.T) {
	got := splitAndTrim(" https://a.test/ ,, https://b.test ")
	if len(got) != 2 || got[0] != "https://a.test" || got[1] != "https://b.test" {
		t.Fatalf("%v", got)
	}
}
