package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config, sunucunun ihtiyaç duyduğu tüm ortam ayarlarını tutar.
type Config struct {
	Port        string
	DatabaseURL string
	AutoMigrate bool // açılışta şemayı uygula

	// AppURL, web uygulamasının dışarıdan görünen adresi (ör.
	// https://journal.alanadin.com). Google dönüş adresi, çerezin Secure
	// bayrağı ve varsayılan izinli origin bundan türetilir.
	AppURL         string
	AllowedOrigins []string // durum değiştiren isteklerde kabul edilen Origin'ler

	SessionTTL  time.Duration
	AllowSignup bool // false: yalnız mevcut hesaplar girebilir

	GoogleClientID     string
	GoogleClientSecret string

	UploadDir string // yüklenen görsellerin kök klasörü
	Timezone  string // gün/hafta/ay kovaları bu saat dilimine göre hesaplanır
}

// GoogleRedirectURL, Google Cloud Console'a girilecek dönüş adresi.
func (c *Config) GoogleRedirectURL() string {
	return c.AppURL + "/api/v1/auth/google/callback"
}

// SecureCookies, uygulama https üzerinden sunuluyorsa true.
func (c *Config) SecureCookies() bool {
	return strings.HasPrefix(c.AppURL, "https://")
}

// Load, .env dosyasını (varsa) okur ve ortamdan yapılandırmayı üretir.
func Load() (*Config, error) {
	// .env yoksa sorun değil; ortam değişkenleri doğrudan verilmiş olabilir.
	_ = godotenv.Load()

	cfg := &Config{
		Port:               getEnv("PORT", "8080"),
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		AppURL:             strings.TrimRight(getEnv("APP_URL", "http://localhost:3000"), "/"),
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		UploadDir:          getEnv("UPLOAD_DIR", "./data/uploads"),
		Timezone:           getEnv("APP_TIMEZONE", "Europe/Istanbul"),
	}

	var err error
	if cfg.AutoMigrate, err = getBool("AUTO_MIGRATE", true); err != nil {
		return nil, err
	}
	if cfg.AllowSignup, err = getBool("ALLOW_SIGNUP", true); err != nil {
		return nil, err
	}
	days, err := strconv.Atoi(getEnv("SESSION_TTL_DAYS", "30"))
	if err != nil || days < 1 {
		return nil, fmt.Errorf("SESSION_TTL_DAYS pozitif bir tam sayı olmalı")
	}
	cfg.SessionTTL = time.Duration(days) * 24 * time.Hour

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL tanımlı değil")
	}
	if !strings.HasPrefix(cfg.AppURL, "http://") && !strings.HasPrefix(cfg.AppURL, "https://") {
		return nil, fmt.Errorf("APP_URL http:// veya https:// ile başlamalı")
	}
	if (cfg.GoogleClientID == "") != (cfg.GoogleClientSecret == "") {
		return nil, fmt.Errorf("GOOGLE_CLIENT_ID ve GOOGLE_CLIENT_SECRET birlikte verilmeli")
	}

	cfg.AllowedOrigins = splitAndTrim(getEnv("ALLOWED_ORIGINS", cfg.AppURL))
	if len(cfg.AllowedOrigins) == 0 {
		return nil, fmt.Errorf("ALLOWED_ORIGINS boş olamaz")
	}
	for _, o := range cfg.AllowedOrigins {
		// "*" hiçbir zaman gerekmiyor: istemci tek ve bilinen bir origin.
		if o == "*" {
			return nil, fmt.Errorf("ALLOWED_ORIGINS içinde \"*\" kabul edilmiyor; origin'leri tek tek yaz")
		}
		if !strings.HasPrefix(o, "http://") && !strings.HasPrefix(o, "https://") {
			return nil, fmt.Errorf("geçersiz origin %q: http:// veya https:// ile başlamalı", o)
		}
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getBool(key string, fallback bool) (bool, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback, nil
	}
	v, err := strconv.ParseBool(raw)
	if err != nil {
		return false, fmt.Errorf("%s true ya da false olmalı", key)
	}
	return v, nil
}

func splitAndTrim(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		// Sondaki "/" origin eşleşmesini sessizce bozar: karşılaştırma tam
		// dize üzerinden yapılır.
		if trimmed := strings.TrimRight(strings.TrimSpace(p), "/"); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}
