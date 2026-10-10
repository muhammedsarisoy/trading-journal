package db_test

import (
	"context"
	"strings"
	"testing"

	"github.com/muhammedsarisoy/trading-journal/api/internal/db"
	"github.com/muhammedsarisoy/trading-journal/api/internal/testdb"
)

func TestMigrateIsIdempotent(t *testing.T) {
	pool := testdb.Pool(t)
	ctx := context.Background()

	for i := range 3 {
		if err := db.Migrate(ctx, pool); err != nil {
			t.Fatalf("%d. uygulama: %v", i+1, err)
		}
	}

	// Veri varken tekrar uygulamak veriye dokunmamalı.
	if _, err := pool.Exec(ctx, "insert into public.users (email) values ('a@b.co')"); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := pool.QueryRow(ctx, "select count(*) from public.users").Scan(&n); err != nil || n != 1 {
		t.Fatalf("şema tekrar uygulanınca veri kayboldu: n=%d err=%v", n, err)
	}

	for _, rel := range []string{"users", "sessions", "profiles", "funds", "platforms", "trades",
		"trade_screenshots", "courses", "lessons", "lesson_notes", "trades_enriched", "courses_enriched"} {
		var ok bool
		if err := pool.QueryRow(ctx, "select to_regclass('public.'||$1) is not null", rel).Scan(&ok); err != nil || !ok {
			t.Errorf("%s yok", rel)
		}
	}
}

func TestGeneratedColumns(t *testing.T) {
	pool := testdb.Migrated(t)
	ctx := context.Background()

	var uid string
	if err := pool.QueryRow(ctx, "insert into public.users (email) values ('a@b.co') returning id").Scan(&uid); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name, cols, vals string
		pnl, r, status   string
	}{
		{"R + risk", "risk_manual, r_manual", "100, 2.5", "250.00000000", "2.5000", "closed"},
		{"K/Z + risk", "risk_manual, pnl_override", "100, -50", "-50.00000000", "-0.5000", "closed"},
		{"boş", "risk_manual", "100", "", "", "open"},
		{"fiyat yolu", "entry_price, exit_price, quantity, stop_loss, closed_at", "1.1, 1.2, 1000, 1.05, now()", "100.00000000", "2.0000", "closed"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var id, pnl, r, status string
			if err := pool.QueryRow(ctx,
				`insert into public.trades (user_id, symbol, `+c.cols+`) values ($1, 'X', `+c.vals+`) returning id`,
				uid).Scan(&id); err != nil {
				t.Fatal(err)
			}
			if err := pool.QueryRow(ctx,
				"select coalesce(pnl::text,''), coalesce(r_multiple::text,''), status from public.trades_enriched where id = $1",
				id).Scan(&pnl, &r, &status); err != nil {
				t.Fatal(err)
			}
			if pnl != c.pnl || r != c.r || status != c.status {
				t.Fatalf("pnl=%q r=%q status=%q; beklenen %q %q %q", pnl, r, status, c.pnl, c.r, c.status)
			}
		})
	}
}

func TestMigrateRefusesSupabase(t *testing.T) {
	pool := testdb.Pool(t)
	testdb.Exec(t, pool, `
		create schema auth;    create table auth.users (id uuid);
		create schema storage; create table storage.objects (id uuid);`)

	err := db.Migrate(context.Background(), pool)
	if err == nil || !strings.Contains(err.Error(), "Supabase") {
		t.Fatalf("Supabase veritabanına şema uygulandı: %v", err)
	}
	var n int
	if err := pool.QueryRow(context.Background(),
		"select count(*) from information_schema.tables where table_schema = 'public'").Scan(&n); err != nil || n != 0 {
		t.Fatalf("reddedilmesine rağmen %d tablo açıldı (err=%v)", n, err)
	}
}
