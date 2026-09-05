// migrate, supabase/migrations altındaki .sql dosyalarını sırayla çalıştırır.
//
// Docker/psql gerekmez; bağlantı api/.env içindeki DATABASE_URL'den okunur.
//
//	go run ./cmd/migrate                       # tüm migrations klasörü
//	go run ./cmd/migrate ../supabase/schema.sql # tek dosya
package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

const defaultDir = "../supabase/migrations"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "hata:", err)
		os.Exit(1)
	}
}

func run() error {
	_ = godotenv.Load()

	url := os.Getenv("DATABASE_URL")
	if url == "" {
		return fmt.Errorf("DATABASE_URL tanımlı değil (api/.env)")
	}

	files, err := collect(os.Args[1:])
	if err != nil {
		return err
	}
	if len(files) == 0 {
		return fmt.Errorf("çalıştırılacak .sql dosyası bulunamadı")
	}

	cfg, err := pgx.ParseConfig(url)
	if err != nil {
		return fmt.Errorf("DATABASE_URL çözümlenemedi: %w", err)
	}
	// Çok ifadeli betikler yalnız basit protokolde tek seferde çalışır.
	cfg.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		return fmt.Errorf("veritabanına bağlanılamadı: %w", err)
	}
	defer conn.Close(ctx)

	for _, path := range files {
		sql, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("%s okunamadı: %w", path, err)
		}
		fmt.Printf("→ %s\n", filepath.Base(path))
		if _, err := conn.Exec(ctx, string(sql)); err != nil {
			return fmt.Errorf("%s başarısız: %w", filepath.Base(path), err)
		}
		fmt.Printf("  tamam\n")
	}

	fmt.Printf("\n%d dosya çalıştırıldı.\n", len(files))
	return nil
}

// collect, argüman verilmediyse varsayılan klasördeki .sql dosyalarını
// ada göre sıralı döner; verildiyse dosya ve klasörleri açar.
func collect(args []string) ([]string, error) {
	if len(args) == 0 {
		args = []string{defaultDir}
	}

	var files []string
	for _, arg := range args {
		info, err := os.Stat(arg)
		if err != nil {
			return nil, fmt.Errorf("%s bulunamadı: %w", arg, err)
		}
		if !info.IsDir() {
			files = append(files, arg)
			continue
		}
		matches, err := filepath.Glob(filepath.Join(arg, "*.sql"))
		if err != nil {
			return nil, err
		}
		sort.Strings(matches)
		files = append(files, matches...)
	}
	return files, nil
}
