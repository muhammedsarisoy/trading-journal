package store

import (
	"context"
	"fmt"

	"github.com/muhammedsarisoy/trading-journal/api/internal/model"
)

// Summary, süzgece uyan işlemlerin özet performansını hesaplar.
// Tüm ağır iş Postgres'te yapılır; Go yalnız oranları türetir.
func (s *Store) Summary(ctx context.Context, userID string, f model.TradeFilter) (*model.Summary, error) {
	b := &argBuilder{}
	where := buildWhere(userID, f, b)

	sql := `
	with f as (
	  select t.* from public.trades_enriched t
	  ` + where + `
	),
	c as (select * from f where status = 'closed'),
	eq as (
	  select opened_at, created_at,
	         sum(pnl) over (order by opened_at, created_at
	                        rows between unbounded preceding and current row) as cum,
	         sum(coalesce(r_multiple, 0)) over (order by opened_at, created_at
	                        rows between unbounded preceding and current row) as cum_r
	  from c
	),
	dd as (
	  select cum, cum_r,
	         max(cum) over (order by opened_at, created_at
	                        rows between unbounded preceding and current row) as peak,
	         max(cum_r) over (order by opened_at, created_at
	                        rows between unbounded preceding and current row) as peak_r
	  from eq
	)
	select
	  (select count(*) from f)                                     as trade_count,
	  (select count(*) from c)                                     as closed_count,
	  (select count(*) from f where status = 'open')               as open_count,
	  (select count(*) from c where pnl > 0)                       as win_count,
	  (select count(*) from c where pnl < 0)                       as loss_count,
	  (select count(*) from c where pnl = 0)                       as breakeven_count,
	  coalesce((select sum(pnl) from c), 0)                        as net_pnl,
	  coalesce((select sum(pnl) from c where pnl > 0), 0)          as gross_profit,
	  coalesce((select sum(pnl) from c where pnl < 0), 0)          as gross_loss,
	  (select avg(pnl) from c where pnl > 0)                       as avg_win,
	  (select avg(pnl) from c where pnl < 0)                       as avg_loss,
	  (select max(pnl) from c)                                     as largest_win,
	  (select min(pnl) from c)                                     as largest_loss,
	  (select avg(r_multiple) from c where r_multiple is not null) as avg_r,
	  coalesce((select sum(r_multiple) from c), 0)                 as total_r,
	  coalesce((select sum(fees) from f), 0)                       as total_fees,
	  (select avg(extract(epoch from (closed_at - opened_at)) / 60)
	     from c where closed_at is not null)                       as avg_hold_minutes,
	  coalesce((select max(peak - cum) from dd), 0)                as max_drawdown,
	  coalesce((select max(peak_r - cum_r) from dd), 0)            as max_drawdown_r`

	var out model.Summary
	err := s.pool.QueryRow(ctx, sql, b.args...).Scan(
		&out.TradeCount, &out.ClosedCount, &out.OpenCount,
		&out.WinCount, &out.LossCount, &out.BreakevenCount,
		&out.NetPnL, &out.GrossProfit, &out.GrossLoss,
		&out.AvgWin, &out.AvgLoss, &out.LargestWin, &out.LargestLoss,
		&out.AvgR, &out.TotalR, &out.TotalFees, &out.AvgHoldMinutes,
		&out.MaxDrawdown, &out.MaxDrawdownR,
	)
	if err != nil {
		return nil, fmt.Errorf("özet hesaplanamadı: %w", err)
	}

	if f.Currency != nil {
		out.Currency = *f.Currency
	}

	// Türetilmiş oranlar
	decided := out.WinCount + out.LossCount
	if decided > 0 {
		wr := float64(out.WinCount) / float64(decided)
		out.WinRate = &wr
	}
	if out.GrossLoss < 0 {
		pf := out.GrossProfit / -out.GrossLoss
		out.ProfitFactor = &pf
	}
	if out.ClosedCount > 0 {
		exp := out.NetPnL / float64(out.ClosedCount)
		out.Expectancy = &exp
	}

	return &out, nil
}

// bucketExpr, kova adını SQL ifadesine çevirir. Yalnız beyaz listedeki
// değerler kabul edilir; kullanıcı girdisi sorguya asla doğrudan girmez.
func bucketExpr(bucket, tzPlaceholder string) (string, error) {
	local := "(t.opened_at at time zone " + tzPlaceholder + ")"
	switch bucket {
	case "day":
		return "date_trunc('day', " + local + ")", nil
	case "week":
		return "date_trunc('week', " + local + ")", nil
	case "month":
		return "date_trunc('month', " + local + ")", nil
	case "quarter":
		return "date_trunc('quarter', " + local + ")", nil
	case "halfyear":
		return "make_timestamp(extract(year from " + local + ")::int, " +
			"case when extract(month from " + local + ") <= 6 then 1 else 7 end, 1, 0, 0, 0)", nil
	case "year":
		return "date_trunc('year', " + local + ")", nil
	default:
		return "", fmt.Errorf("geçersiz kova: %s", bucket)
	}
}

// Series, gün/hafta/ay/çeyrek/6 ay/yıl kırılımında kâr-zarar serisini döner.
// Kümülatif sütun sermaye eğrisini çizmek için hazırdır.
func (s *Store) Series(ctx context.Context, userID, bucket string, f model.TradeFilter) ([]model.SeriesPoint, error) {
	b := &argBuilder{}
	where := buildWhere(userID, f, b)
	tzArg := b.add(s.tz)

	expr, err := bucketExpr(bucket, tzArg)
	if err != nil {
		return nil, err
	}

	sql := `
	with g as (
	  select ` + expr + ` as bucket,
	         coalesce(sum(t.pnl), 0)                                  as net_pnl,
	         coalesce(sum(t.pnl) filter (where t.pnl > 0), 0)         as profit,
	         coalesce(sum(t.pnl) filter (where t.pnl < 0), 0)         as loss,
	         count(*)                                                 as trade_count,
	         count(*) filter (where t.pnl > 0)                        as win_count,
	         coalesce(sum(t.r_multiple), 0)                           as net_r
	  from public.trades_enriched t
	  ` + where + `
	    and t.status = 'closed'
	  group by 1
	)
	select bucket, net_pnl, profit, loss, trade_count, win_count,
	       sum(net_pnl) over w as cumulative,
	       net_r,
	       sum(net_r) over w as cumulative_r
	from g
	window w as (order by bucket rows between unbounded preceding and current row)
	order by bucket`

	rows, err := s.pool.Query(ctx, sql, b.args...)
	if err != nil {
		return nil, fmt.Errorf("seri hesaplanamadı: %w", err)
	}
	defer rows.Close()

	out := []model.SeriesPoint{}
	for rows.Next() {
		var p model.SeriesPoint
		if err := rows.Scan(&p.Bucket, &p.NetPnL, &p.Profit, &p.Loss,
			&p.TradeCount, &p.WinCount, &p.Cumulative,
			&p.NetR, &p.CumulativeR); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// breakdownDim, kırılım boyutunu SQL'e çevirir.
// İkinci dönüş değeri dizi alanları için lateral unnest cümlesidir.
//
// Saat dilimi argümanı yalnız onu gerçekten kullanan boyutlarda eklenir;
// aksi halde sorguda karşılığı olmayan bir parametre kalır ve pgx hata verir.
func breakdownDim(dim, tz string, b *argBuilder) (keyExpr, lateral string, err error) {
	local := func() string { return "(t.opened_at at time zone " + b.add(tz) + ")" }
	switch dim {
	case "setup":
		return "t.setup", "", nil
	case "symbol":
		return "t.symbol", "", nil
	case "asset_class":
		return "t.asset_class", "", nil
	case "direction":
		return "t.direction", "", nil
	case "timeframe":
		return "t.timeframe", "", nil
	case "platform":
		return "t.platform_name", "", nil
	case "fund":
		return "t.fund_name", "", nil
	case "emotion_before":
		return "t.emotion_before", "", nil
	case "emotion_after":
		return "t.emotion_after", "", nil
	case "followed_plan":
		return "case when t.followed_plan then 'plana uydum' when t.followed_plan is false then 'plandan saptım' end", "", nil
	case "confidence":
		return "t.confidence::text", "", nil
	case "stress":
		return "t.stress::text", "", nil
	case "weekday":
		return "extract(isodow from " + local() + ")::text", "", nil
	case "hour":
		return "to_char(" + local() + ", 'HH24')", "", nil
	case "confluence":
		return "k.val", "cross join lateral unnest(t.confluences) as k(val)", nil
	case "mistake":
		return "k.val", "cross join lateral unnest(t.mistakes) as k(val)", nil
	case "tag":
		return "k.val", "cross join lateral unnest(t.tags) as k(val)", nil
	default:
		return "", "", fmt.Errorf("geçersiz kırılım: %s", dim)
	}
}

// Breakdown, seçilen boyutta (strateji, sembol, duygu, hata...) performans dağılımı.
func (s *Store) Breakdown(ctx context.Context, userID, dim string, f model.TradeFilter) ([]model.BreakdownRow, error) {
	b := &argBuilder{}
	where := buildWhere(userID, f, b)

	keyExpr, lateral, err := breakdownDim(dim, s.tz, b)
	if err != nil {
		return nil, err
	}

	sql := `
	select coalesce(nullif(` + keyExpr + `, ''), '(belirtilmemiş)') as key,
	       count(*)                                    as trade_count,
	       count(*) filter (where t.pnl > 0)           as win_count,
	       coalesce(sum(t.pnl), 0)                     as net_pnl,
	       avg(t.r_multiple)                           as avg_r,
	       coalesce(sum(t.r_multiple), 0)              as total_r
	from public.trades_enriched t
	` + lateral + `
	` + where + `
	  and t.status = 'closed'
	group by 1
	order by net_pnl desc`

	rows, err := s.pool.Query(ctx, sql, b.args...)
	if err != nil {
		return nil, fmt.Errorf("kırılım hesaplanamadı: %w", err)
	}
	defer rows.Close()

	out := []model.BreakdownRow{}
	for rows.Next() {
		var r model.BreakdownRow
		if err := rows.Scan(&r.Key, &r.TradeCount, &r.WinCount, &r.NetPnL,
			&r.AvgR, &r.TotalR); err != nil {
			return nil, err
		}
		if r.TradeCount > 0 {
			wr := float64(r.WinCount) / float64(r.TradeCount)
			r.WinRate = &wr
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
