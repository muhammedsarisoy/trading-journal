package db

import (
	"context"
	_ "embed"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Schema, uygulamanın tüm tablolarını kuran idempotent betik.
//
//go:embed schema.sql
var Schema string

// New, Postgres'e bağlanan bir havuz açar ve erişimi doğrular.
func New(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("DATABASE_URL çözümlenemedi: %w", err)
	}

	cfg.MaxConns = 10
	cfg.MinConns = 1
	cfg.MaxConnLifetime = time.Hour
	cfg.MaxConnIdleTime = 15 * time.Minute
	cfg.HealthCheckPeriod = time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("veritabanı havuzu açılamadı: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("veritabanına erişilemedi: %w", err)
	}

	return pool, nil
}

// migrateLockID, aynı anda açılan iki API örneğinin şemayı birlikte
// uygulamasını engelleyen danışma kilidinin anahtarı.
const migrateLockID = 7_402_118_355

// Migrate, gömülü şemayı uygular. Betik idempotent olduğundan her açılışta
// çalıştırmak güvenli.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("şema için bağlantı alınamadı: %w", err)
	}
	defer conn.Release()

	// Eski Supabase bağlantı dizesi yanlışlıkla bırakılırsa şema oraya
	// uygulanmasın: görünümler RLS'siz yeniden kurulur ve Supabase'in açık
	// REST ucu üzerinden herkese açılabilirdi.
	var supabase bool
	if err := conn.QueryRow(ctx,
		"select to_regclass('auth.users') is not null and to_regclass('storage.objects') is not null").
		Scan(&supabase); err != nil {
		return fmt.Errorf("veritabanı denetlenemedi: %w", err)
	}
	if supabase {
		return fmt.Errorf("DATABASE_URL bir Supabase veritabanını gösteriyor; şema yalnız kendi Postgres'ine uygulanır")
	}

	if _, err := conn.Exec(ctx, "select pg_advisory_lock($1)", migrateLockID); err != nil {
		return fmt.Errorf("şema kilidi alınamadı: %w", err)
	}
	defer conn.Exec(context.Background(), "select pg_advisory_unlock($1)", migrateLockID) //nolint:errcheck

	// Çok ifadeli betik yalnız basit protokolde tek seferde çalışır.
	if _, err := conn.Conn().PgConn().Exec(ctx, Schema).ReadAll(); err != nil {
		return fmt.Errorf("şema uygulanamadı: %w", err)
	}
	return nil
}
