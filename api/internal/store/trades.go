package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/muhammedsarisoy/trading-journal/api/internal/model"
)

// ErrNotFound, kayıt yok ya da başka kullanıcıya ait.
var ErrNotFound = errors.New("kayıt bulunamadı")

const tradeColumns = `
	t.id, t.fund_id, t.platform_id,
	t.symbol, t.asset_class, t.direction, t.currency,
	t.opened_at, t.closed_at, t.timeframe,
	t.entry_price, t.exit_price, t.stop_loss, t.take_profit,
	t.quantity, t.quantity_unit, t.contract_size, t.leverage,
	t.fees, t.swap, t.pnl_override, t.risk_manual, t.r_manual,
	t.setup, t.reason, t.confluences, t.tags,
	t.emotion_before, t.emotion_after, t.confidence, t.stress,
	t.followed_plan, t.mistakes, t.lesson, t.notes,
	t.status, t.pnl, t.risk_amount, t.r_multiple,
	t.fund_name, t.fund_currency, t.platform_name,
	t.created_at, t.updated_at`

// scanTrade, tradeColumns sırasına birebir bağlıdır.
func scanTrade(row pgx.Row) (model.Trade, error) {
	var t model.Trade
	err := row.Scan(
		&t.ID, &t.FundID, &t.PlatformID,
		&t.Symbol, &t.AssetClass, &t.Direction, &t.Currency,
		&t.OpenedAt, &t.ClosedAt, &t.Timeframe,
		&t.EntryPrice, &t.ExitPrice, &t.StopLoss, &t.TakeProfit,
		&t.Quantity, &t.QuantityUnit, &t.ContractSize, &t.Leverage,
		&t.Fees, &t.Swap, &t.PnLOverride, &t.RiskManual, &t.RManual,
		&t.Setup, &t.Reason, &t.Confluences, &t.Tags,
		&t.EmotionBefore, &t.EmotionAfter, &t.Confidence, &t.Stress,
		&t.FollowedPlan, &t.Mistakes, &t.Lesson, &t.Notes,
		&t.Status, &t.PnL, &t.RiskAmount, &t.RMultiple,
		&t.FundName, &t.FundCurrency, &t.PlatformName,
		&t.CreatedAt, &t.UpdatedAt,
	)
	if t.Confluences == nil {
		t.Confluences = []string{}
	}
	if t.Tags == nil {
		t.Tags = []string{}
	}
	if t.Mistakes == nil {
		t.Mistakes = []string{}
	}
	return t, err
}

// ListTrades, süzgece uyan işlemleri ve toplam sayıyı döner.
func (s *Store) ListTrades(ctx context.Context, userID string, f model.TradeFilter) (*model.TradeList, error) {
	if f.Limit <= 0 || f.Limit > 500 {
		f.Limit = 100
	}
	if f.Offset < 0 {
		f.Offset = 0
	}

	countB := &argBuilder{}
	countSQL := "select count(*) from public.trades_enriched t\n  " + buildWhere(userID, f, countB)

	var total int
	if err := s.pool.QueryRow(ctx, countSQL, countB.args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("işlem sayısı okunamadı: %w", err)
	}

	b := &argBuilder{}
	where := buildWhere(userID, f, b)
	sql := "select " + tradeColumns + "\n  from public.trades_enriched t\n  " + where +
		"\n  order by t.opened_at desc, t.created_at desc" +
		"\n  limit " + b.add(f.Limit) + " offset " + b.add(f.Offset)

	rows, err := s.pool.Query(ctx, sql, b.args...)
	if err != nil {
		return nil, fmt.Errorf("işlemler okunamadı: %w", err)
	}
	defer rows.Close()

	items := make([]model.Trade, 0, f.Limit)
	for rows.Next() {
		t, err := scanTrade(rows)
		if err != nil {
			return nil, fmt.Errorf("işlem satırı çözümlenemedi: %w", err)
		}
		items = append(items, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &model.TradeList{Items: items, Total: total, Limit: f.Limit, Offset: f.Offset}, nil
}

// GetTrade, tek işlemi döner.
func (s *Store) GetTrade(ctx context.Context, userID, id string) (*model.Trade, error) {
	sql := "select " + tradeColumns + `
	from public.trades_enriched t
	where t.user_id = $1 and t.id = $2`

	t, err := scanTrade(s.pool.QueryRow(ctx, sql, userID, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("işlem okunamadı: %w", err)
	}
	return &t, nil
}

const tradeWriteColumns = `fund_id, platform_id, symbol, asset_class, direction, currency,
	opened_at, closed_at, timeframe,
	entry_price, exit_price, stop_loss, take_profit,
	quantity, quantity_unit, contract_size, leverage, fees, swap,
	pnl_override, risk_manual, r_manual,
	setup, reason, confluences, tags,
	emotion_before, emotion_after, confidence, stress, followed_plan, mistakes, lesson, notes`

func tradeWriteArgs(in model.TradeInput) []any {
	return []any{
		in.FundID, in.PlatformID, in.Symbol, in.AssetClass, in.Direction, in.Currency,
		in.OpenedAt, in.ClosedAt, in.Timeframe,
		in.EntryPrice, in.ExitPrice, in.StopLoss, in.TakeProfit,
		in.Quantity, in.QuantityUnit, in.ContractSize, in.Leverage, in.Fees, in.Swap,
		in.PnLOverride, in.RiskManual, in.RManual,
		in.Setup, in.Reason, nonNil(in.Confluences), nonNil(in.Tags),
		in.EmotionBefore, in.EmotionAfter, in.Confidence, in.Stress, in.FollowedPlan,
		nonNil(in.Mistakes), in.Lesson, in.Notes,
	}
}

func nonNil(v []string) []string {
	if v == nil {
		return []string{}
	}
	return v
}

// CreateTrade, yeni işlem açar ve zenginleştirilmiş halini döner.
func (s *Store) CreateTrade(ctx context.Context, userID string, in model.TradeInput) (*model.Trade, error) {
	args := append([]any{userID}, tradeWriteArgs(in)...)
	placeholders := ""
	for i := range args {
		if i > 0 {
			placeholders += ", "
		}
		placeholders += fmt.Sprintf("$%d", i+1)
	}

	sql := "insert into public.trades (user_id, " + tradeWriteColumns + ")\n" +
		"values (" + placeholders + ") returning id"

	var id string
	if err := s.pool.QueryRow(ctx, sql, args...).Scan(&id); err != nil {
		return nil, fmt.Errorf("işlem kaydedilemedi: %w", err)
	}
	return s.GetTrade(ctx, userID, id)
}

// UpdateTrade, işlemi bütünüyle günceller (PUT semantiği).
func (s *Store) UpdateTrade(ctx context.Context, userID, id string, in model.TradeInput) (*model.Trade, error) {
	args := tradeWriteArgs(in)
	cols := []string{
		"fund_id", "platform_id", "symbol", "asset_class", "direction", "currency",
		"opened_at", "closed_at", "timeframe",
		"entry_price", "exit_price", "stop_loss", "take_profit",
		"quantity", "quantity_unit", "contract_size", "leverage", "fees", "swap",
		"pnl_override", "risk_manual", "r_manual",
		"setup", "reason", "confluences", "tags",
		"emotion_before", "emotion_after", "confidence", "stress", "followed_plan",
		"mistakes", "lesson", "notes",
	}

	set := ""
	for i, c := range cols {
		if i > 0 {
			set += ",\n    "
		}
		set += fmt.Sprintf("%s = $%d", c, i+1)
	}

	args = append(args, id, userID)
	sql := fmt.Sprintf(
		"update public.trades set\n    %s\n  where id = $%d and user_id = $%d",
		set, len(args)-1, len(args),
	)

	tag, err := s.pool.Exec(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("işlem güncellenemedi: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrNotFound
	}
	return s.GetTrade(ctx, userID, id)
}

// DeleteTrade, işlemi siler. Ekran görüntüsü satırları kaskad ile gider;
// Storage'taki dosyaları çağıran taraf temizler.
func (s *Store) DeleteTrade(ctx context.Context, userID, id string) error {
	tag, err := s.pool.Exec(ctx,
		"delete from public.trades where id = $1 and user_id = $2", id, userID)
	if err != nil {
		return fmt.Errorf("işlem silinemedi: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// DistinctValues, filtre kutuları için kullanıcının girdiği benzersiz değerleri döner.
func (s *Store) DistinctValues(ctx context.Context, userID string) (map[string][]string, error) {
	sql := `
	select 'symbol' as kind, symbol as value from public.trades where user_id = $1 and symbol <> ''
	union
	select 'setup', setup from public.trades where user_id = $1 and setup is not null and setup <> ''
	union
	select 'tag', unnest(tags) from public.trades where user_id = $1
	union
	select 'confluence', unnest(confluences) from public.trades where user_id = $1
	order by 1, 2`

	rows, err := s.pool.Query(ctx, sql, userID)
	if err != nil {
		return nil, fmt.Errorf("benzersiz değerler okunamadı: %w", err)
	}
	defer rows.Close()

	out := map[string][]string{"symbol": {}, "setup": {}, "tag": {}, "confluence": {}}
	for rows.Next() {
		var kind, value string
		if err := rows.Scan(&kind, &value); err != nil {
			return nil, err
		}
		out[kind] = append(out[kind], value)
	}
	return out, rows.Err()
}
