// migrate, gömülü şemayı (internal/db/schema.sql) veritabanına uygular.
//
// API açılışta bunu zaten yapıyor (AUTO_MIGRATE=true). Bu araç, şemayı
// sunucuyu başlatmadan uygulamak ya da AUTO_MIGRATE kapalıyken kullanmak için.
//
//	go run ./cmd/migrate
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/joho/godotenv"

	"github.com/muhammedsarisoy/trading-journal/api/internal/db"
)

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

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	pool, err := db.New(ctx, url)
	if err != nil {
		return err
	}
	defer pool.Close()

	if err := db.Migrate(ctx, pool); err != nil {
		return err
	}
	fmt.Println("şema güncel")
	return nil
}
