// smoke, istatistik sorgularını gerçek veritabanına karşı bir kez çalıştırır.
// Rastgele bir kullanıcı kimliği kullanır: sonuç boş döner, amaç SQL'i doğrulamak.
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/muhammedsarisoy/trading-journal/api/internal/db"
	"github.com/muhammedsarisoy/trading-journal/api/internal/model"
	"github.com/muhammedsarisoy/trading-journal/api/internal/store"
)

func main() {
	_ = godotenv.Load()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	pool, err := db.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		fail(err)
	}
	defer pool.Close()

	s := store.New(pool, "Europe/Istanbul")
	uid := "00000000-0000-0000-0000-000000000000"
	f := model.TradeFilter{Limit: 10}

	if _, err := s.Summary(ctx, uid, f); err != nil {
		fail(fmt.Errorf("Summary: %w", err))
	}
	fmt.Println("Summary ok")

	for _, b := range []string{"day", "week", "month", "quarter", "halfyear", "year"} {
		if _, err := s.Series(ctx, uid, b, f); err != nil {
			fail(fmt.Errorf("Series(%s): %w", b, err))
		}
	}
	fmt.Println("Series ok (6 kova)")

	dims := []string{
		"setup", "symbol", "asset_class", "direction", "timeframe", "platform", "fund",
		"emotion_before", "emotion_after", "followed_plan", "confidence", "stress",
		"weekday", "hour", "confluence", "mistake", "tag",
	}
	for _, d := range dims {
		if _, err := s.Breakdown(ctx, uid, d, f); err != nil {
			fail(fmt.Errorf("Breakdown(%s): %w", d, err))
		}
	}
	fmt.Printf("Breakdown ok (%d boyut)\n", len(dims))

	if _, err := s.ListTrades(ctx, uid, f); err != nil {
		fail(fmt.Errorf("ListTrades: %w", err))
	}
	fmt.Println("ListTrades ok")

	if _, err := s.DistinctValues(ctx, uid); err != nil {
		fail(fmt.Errorf("DistinctValues: %w", err))
	}
	fmt.Println("DistinctValues ok")

	if _, err := s.ListFunds(ctx, uid); err != nil {
		fail(fmt.Errorf("ListFunds: %w", err))
	}
	fmt.Println("ListFunds ok")

	if err := printGenerated(ctx, pool); err != nil {
		fail(err)
	}

	fmt.Println("\nTUM SORGULAR GECERLI")
}

// printGenerated, türetilmiş sütunların veritabanındaki gerçek tanımını basar.
func printGenerated(ctx context.Context, pool *pgxpool.Pool) error {
	rows, err := pool.Query(ctx, `
		select column_name, generation_expression
		from information_schema.columns
		where table_schema = 'public' and table_name = 'trades'
		  and is_generated = 'ALWAYS'
		order by column_name`)
	if err != nil {
		return fmt.Errorf("generated sütunlar okunamadı: %w", err)
	}
	defer rows.Close()

	fmt.Println("\nTuretilmis sutunlar:")
	for rows.Next() {
		var name, expr string
		if err := rows.Scan(&name, &expr); err != nil {
			return err
		}
		fmt.Printf("  %s = %s\n", name, expr)
	}
	return rows.Err()
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "HATA:", err)
	os.Exit(1)
}
