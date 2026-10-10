// Package testdb, entegrasyon testlerine her çağrıda boş ve ayrı bir
// veritabanı verir.
//
// TEST_DATABASE_URL, veritabanı oluşturma yetkisi olan bir kullanıcıyla
// herhangi bir veritabanını göstermeli (yerelde docker-compose.dev.yml):
//
//	TEST_DATABASE_URL=postgres://journal:journal@localhost:5433/trading_journal?sslmode=disable go test ./...
//
// Tanımlı değilse veritabanı testleri atlanır; birim testler yine çalışır.
package testdb

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/muhammedsarisoy/trading-journal/api/internal/db"
)

// URL, yeni bir veritabanı açar ve bağlantı dizesini döner. Test bitince
// veritabanı silinir.
func URL(t testing.TB) string {
	t.Helper()
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		t.Skip("TEST_DATABASE_URL tanımlı değil; veritabanı testi atlandı")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	admin, err := pgx.Connect(ctx, base)
	if err != nil {
		t.Fatalf("test veritabanına bağlanılamadı: %v", err)
	}
	defer admin.Close(ctx)

	buf := make([]byte, 6)
	_, _ = rand.Read(buf)
	name := "tj_test_" + hex.EncodeToString(buf)
	if _, err := admin.Exec(ctx, "create database "+pgx.Identifier{name}.Sanitize()); err != nil {
		t.Fatalf("test veritabanı açılamadı: %v", err)
	}

	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		c, err := pgx.Connect(ctx, base)
		if err != nil {
			t.Logf("test veritabanı silinemedi (%s): %v", name, err)
			return
		}
		defer c.Close(ctx)
		if _, err := c.Exec(ctx, "drop database if exists "+pgx.Identifier{name}.Sanitize()+" with (force)"); err != nil {
			t.Logf("test veritabanı silinemedi (%s): %v", name, err)
		}
	})

	u, err := url.Parse(base)
	if err != nil {
		t.Fatalf("TEST_DATABASE_URL çözümlenemedi: %v", err)
	}
	u.Path = "/" + name
	return u.String()
}

// Pool, yeni bir veritabanına havuz açar. Test bitince kapanır.
func Pool(t testing.TB) *pgxpool.Pool {
	t.Helper()
	return poolFor(t, URL(t))
}

// Migrated, şeması kurulmuş yeni bir veritabanına havuz açar.
func Migrated(t testing.TB) *pgxpool.Pool {
	t.Helper()
	pool := Pool(t)
	if err := db.Migrate(context.Background(), pool); err != nil {
		t.Fatalf("şema uygulanamadı: %v", err)
	}
	return pool
}

func poolFor(t testing.TB, dsn string) *pgxpool.Pool {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := db.New(ctx, dsn)
	if err != nil {
		t.Fatalf("test havuzu açılamadı: %v", err)
	}
	// Silme, açık bağlantıları 'with (force)' ile kapatır; yine de önce biz kapatalım.
	t.Cleanup(pool.Close)
	return pool
}

// Exec, çok ifadeli bir betiği basit protokolle çalıştırır.
func Exec(t testing.TB, pool *pgxpool.Pool, sql string) {
	t.Helper()
	ctx := context.Background()
	conn, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Release()
	if _, err := conn.Conn().PgConn().Exec(ctx, sql).ReadAll(); err != nil {
		t.Fatalf("SQL çalıştırılamadı: %v", err)
	}
}
