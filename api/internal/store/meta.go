package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/muhammedsarisoy/trading-journal/api/internal/model"
)

// ---------------------------------------------------------------- Fonlar

const fundColumns = `id, name, broker, currency, starting_balance, is_prop, is_active, note, created_at`

func scanFund(row pgx.Row) (model.Fund, error) {
	var f model.Fund
	err := row.Scan(&f.ID, &f.Name, &f.Broker, &f.Currency, &f.StartingBalance,
		&f.IsProp, &f.IsActive, &f.Note, &f.CreatedAt)
	return f, err
}

func (s *Store) ListFunds(ctx context.Context, userID string) ([]model.Fund, error) {
	rows, err := s.pool.Query(ctx,
		"select "+fundColumns+" from public.funds where user_id = $1 order by created_at", userID)
	if err != nil {
		return nil, fmt.Errorf("fonlar okunamadı: %w", err)
	}
	defer rows.Close()

	out := []model.Fund{}
	for rows.Next() {
		f, err := scanFund(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (s *Store) CreateFund(ctx context.Context, userID string, in model.FundInput) (*model.Fund, error) {
	active := true
	if in.IsActive != nil {
		active = *in.IsActive
	}
	sql := `insert into public.funds (user_id, name, broker, currency, starting_balance, is_prop, is_active, note)
	        values ($1,$2,$3,$4,$5,$6,$7,$8) returning ` + fundColumns

	f, err := scanFund(s.pool.QueryRow(ctx, sql, userID, in.Name, in.Broker, in.Currency,
		in.StartingBalance, in.IsProp, active, in.Note))
	if err != nil {
		return nil, fmt.Errorf("fon kaydedilemedi: %w", err)
	}
	return &f, nil
}

func (s *Store) UpdateFund(ctx context.Context, userID, id string, in model.FundInput) (*model.Fund, error) {
	active := true
	if in.IsActive != nil {
		active = *in.IsActive
	}
	sql := `update public.funds set
	          name = $1, broker = $2, currency = $3, starting_balance = $4,
	          is_prop = $5, is_active = $6, note = $7
	        where id = $8 and user_id = $9
	        returning ` + fundColumns

	f, err := scanFund(s.pool.QueryRow(ctx, sql, in.Name, in.Broker, in.Currency,
		in.StartingBalance, in.IsProp, active, in.Note, id, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("fon güncellenemedi: %w", err)
	}
	return &f, nil
}

// SeedFunds, hazır hesap listesini tek seferde ekler.
// Aynı adlı hesap varsa dokunmaz, böylece tekrar tekrar çağrılabilir.
func (s *Store) SeedFunds(ctx context.Context, userID string, items []model.FundInput) ([]model.Fund, error) {
	for _, in := range items {
		active := true
		if in.IsActive != nil {
			active = *in.IsActive
		}
		_, err := s.pool.Exec(ctx,
			`insert into public.funds (user_id, name, broker, currency, starting_balance, is_prop, is_active, note)
			 values ($1,$2,$3,$4,$5,$6,$7,$8)
			 on conflict (user_id, name) do nothing`,
			userID, in.Name, in.Broker, in.Currency, in.StartingBalance, in.IsProp, active, in.Note)
		if err != nil {
			return nil, fmt.Errorf("hesap eklenemedi (%s): %w", in.Name, err)
		}
	}
	return s.ListFunds(ctx, userID)
}

func (s *Store) DeleteFund(ctx context.Context, userID, id string) error {
	tag, err := s.pool.Exec(ctx, "delete from public.funds where id = $1 and user_id = $2", id, userID)
	if err != nil {
		return fmt.Errorf("fon silinemedi: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ------------------------------------------------------------ Platformlar

func (s *Store) ListPlatforms(ctx context.Context, userID string) ([]model.Platform, error) {
	rows, err := s.pool.Query(ctx,
		"select id, name, created_at from public.platforms where user_id = $1 order by name", userID)
	if err != nil {
		return nil, fmt.Errorf("platformlar okunamadı: %w", err)
	}
	defer rows.Close()

	out := []model.Platform{}
	for rows.Next() {
		var p model.Platform
		if err := rows.Scan(&p.ID, &p.Name, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) CreatePlatform(ctx context.Context, userID, name string) (*model.Platform, error) {
	var p model.Platform
	err := s.pool.QueryRow(ctx,
		`insert into public.platforms (user_id, name) values ($1,$2)
		 on conflict (user_id, name) do update set name = excluded.name
		 returning id, name, created_at`, userID, name).
		Scan(&p.ID, &p.Name, &p.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("platform kaydedilemedi: %w", err)
	}
	return &p, nil
}

// SeedPlatforms, boş hesaba yaygın platform listesini tek seferde ekler.
func (s *Store) SeedPlatforms(ctx context.Context, userID string, names []string) ([]model.Platform, error) {
	if len(names) == 0 {
		return s.ListPlatforms(ctx, userID)
	}
	_, err := s.pool.Exec(ctx,
		`insert into public.platforms (user_id, name)
		 select $1, unnest($2::text[])
		 on conflict (user_id, name) do nothing`, userID, names)
	if err != nil {
		return nil, fmt.Errorf("platformlar eklenemedi: %w", err)
	}
	return s.ListPlatforms(ctx, userID)
}

func (s *Store) DeletePlatform(ctx context.Context, userID, id string) error {
	tag, err := s.pool.Exec(ctx, "delete from public.platforms where id = $1 and user_id = $2", id, userID)
	if err != nil {
		return fmt.Errorf("platform silinemedi: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// -------------------------------------------------- Ekran görüntüsü kayıtları

func (s *Store) ListScreenshots(ctx context.Context, userID, tradeID string) ([]model.Screenshot, error) {
	rows, err := s.pool.Query(ctx,
		`select id, trade_id, path, caption, phase, created_at
		 from public.trade_screenshots
		 where user_id = $1 and trade_id = $2
		 order by created_at`, userID, tradeID)
	if err != nil {
		return nil, fmt.Errorf("ekran görüntüleri okunamadı: %w", err)
	}
	defer rows.Close()

	out := []model.Screenshot{}
	for rows.Next() {
		var sc model.Screenshot
		if err := rows.Scan(&sc.ID, &sc.TradeID, &sc.Path, &sc.Caption, &sc.Phase, &sc.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, sc)
	}
	return out, rows.Err()
}

func (s *Store) CreateScreenshot(ctx context.Context, userID, tradeID string, in model.ScreenshotInput) (*model.Screenshot, error) {
	// İşlem gerçekten bu kullanıcıya mı ait?
	var exists bool
	if err := s.pool.QueryRow(ctx,
		"select exists(select 1 from public.trades where id = $1 and user_id = $2)",
		tradeID, userID).Scan(&exists); err != nil {
		return nil, fmt.Errorf("işlem doğrulanamadı: %w", err)
	}
	if !exists {
		return nil, ErrNotFound
	}

	var sc model.Screenshot
	err := s.pool.QueryRow(ctx,
		`insert into public.trade_screenshots (user_id, trade_id, path, caption, phase)
		 values ($1,$2,$3,$4,$5)
		 returning id, trade_id, path, caption, phase, created_at`,
		userID, tradeID, in.Path, in.Caption, in.Phase).
		Scan(&sc.ID, &sc.TradeID, &sc.Path, &sc.Caption, &sc.Phase, &sc.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("ekran görüntüsü kaydedilemedi: %w", err)
	}
	return &sc, nil
}

// DeleteScreenshot, kaydı siler ve Storage temizliği için dosya yolunu döner.
func (s *Store) DeleteScreenshot(ctx context.Context, userID, id string) (string, error) {
	var path string
	err := s.pool.QueryRow(ctx,
		"delete from public.trade_screenshots where id = $1 and user_id = $2 returning path",
		id, userID).Scan(&path)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("ekran görüntüsü silinemedi: %w", err)
	}
	return path, nil
}

// ScreenshotPathsForTrade, işlem silinmeden önce Storage'tan kaldırılacak yolları verir.
func (s *Store) ScreenshotPathsForTrade(ctx context.Context, userID, tradeID string) ([]string, error) {
	rows, err := s.pool.Query(ctx,
		"select path from public.trade_screenshots where user_id = $1 and trade_id = $2", userID, tradeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	paths := []string{}
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		paths = append(paths, p)
	}
	return paths, rows.Err()
}
