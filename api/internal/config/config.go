package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

// Config, sunucunun ihtiyaç duyduğu tüm ortam ayarlarını tutar.
type Config struct {
	Port           string
	DatabaseURL    string
	JWTSecret      string   // Supabase "legacy JWT secret" (HS256)
	JWKSURL        string   // Asimetrik anahtar kullanılıyorsa (ES256/RS256)
	AllowedOrigins []string // CORS
	Timezone       string   // Gün/hafta/ay kovaları bu saat dilimine göre hesaplanır
}

// Load, .env dosyasını (varsa) okur ve ortamdan yapılandırmayı üretir.
func Load() (*Config, error) {
	// .env yoksa sorun değil; ortam değişkenleri doğrudan verilmiş olabilir.
	_ = godotenv.Load()

	cfg := &Config{
		Port:        getEnv("PORT", "8080"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		JWTSecret:   os.Getenv("SUPABASE_JWT_SECRET"),
		JWKSURL:     os.Getenv("SUPABASE_JWKS_URL"),
		Timezone:    getEnv("APP_TIMEZONE", "Europe/Istanbul"),
		AllowedOrigins: splitAndTrim(
			getEnv("ALLOWED_ORIGINS", "http://localhost:3000"),
		),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL tanımlı değil")
	}
	if cfg.JWTSecret == "" && cfg.JWKSURL == "" {
		return nil, fmt.Errorf("SUPABASE_JWT_SECRET veya SUPABASE_JWKS_URL tanımlı olmalı")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func splitAndTrim(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}
