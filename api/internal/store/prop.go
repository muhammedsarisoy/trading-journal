package store

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"

	"github.com/jackc/pgx/v5"

	"github.com/muhammedsarisoy/trading-journal/api/internal/model"
)

// ------------------------------------------------------- Prop harcamaları

const propColumns = `p.id, p.kind, p.firm, p.amount::float8, p.currency, p.occurred_on::text,
	p.account_size::float8, p.fund_id, f.name, p.note, p.created_at`

const propFrom = `from public.prop_transactions p
	left join public.funds f on f.id = p.fund_id`

func scanProp(row pgx.Row) (model.PropTransaction, error) {
	var t model.PropTransaction
	err := row.Scan(&t.ID, &t.Kind, &t.Firm, &t.Amount, &t.Currency, &t.OccurredOn,
		&t.AccountSize, &t.FundID, &t.FundName, &t.Note, &t.CreatedAt)
	return t, err
}

// PropFilter, liste süzgeci. Boş alanlar süzmez.
type PropFilter struct {
	Firm *string
	Kind *string
}

func (s *Store) ListPropTransactions(ctx context.Context, userID string, f PropFilter) ([]model.PropTransaction, error) {
	b := &argBuilder{}
	where := "p.user_id = " + b.add(userID)
	if f.Firm != nil {
		where += " and p.firm = " + b.add(*f.Firm)
	}
	if f.Kind != nil {
		where += " and p.kind = " + b.add(*f.Kind)
	}
	rows, err := s.pool.Query(ctx,
		"select "+propColumns+" "+propFrom+" where "+where+" order by p.occurred_on desc, p.created_at desc",
		b.args...)
	if err != nil {
		return nil, fmt.Errorf("prop kayıtları okunamadı: %w", err)
	}
	defer rows.Close()

	out := []model.PropTransaction{}
	for rows.Next() {
		t, err := scanProp(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) getProp(ctx context.Context, userID, id string) (*model.PropTransaction, error) {
	t, err := scanProp(s.pool.QueryRow(ctx,
		"select "+propColumns+" "+propFrom+" where p.id = $1 and p.user_id = $2", id, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("prop kaydı okunamadı: %w", err)
	}
	return &t, nil
}

// ownsFund, bağlanmak istenen hesabın bu kullanıcıya ait olduğunu doğrular.
// Yabancı anahtar yalnız varlığı denetler; sahipliği denetlemez.
func (s *Store) ownsFund(ctx context.Context, userID string, fundID *string) error {
	if fundID == nil {
		return nil
	}
	var ok bool
	if err := s.pool.QueryRow(ctx,
		"select exists(select 1 from public.funds where id = $1 and user_id = $2)", *fundID, userID).Scan(&ok); err != nil {
		return fmt.Errorf("hesap doğrulanamadı: %w", err)
	}
	if !ok {
		return ErrNotFound
	}
	return nil
}

func (s *Store) CreatePropTransaction(ctx context.Context, userID string, in model.PropTransactionInput) (*model.PropTransaction, error) {
	if err := s.ownsFund(ctx, userID, in.FundID); err != nil {
		return nil, err
	}
	var id string
	err := s.pool.QueryRow(ctx,
		`insert into public.prop_transactions
		   (user_id, kind, firm, amount, currency, occurred_on, account_size, fund_id, note)
		 values ($1,$2,$3,$4,$5,$6::date,$7,$8,$9) returning id`,
		userID, in.Kind, in.Firm, in.Amount, in.Currency, in.OccurredOn, in.AccountSize, in.FundID, in.Note).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("prop kaydı açılamadı: %w", err)
	}
	return s.getProp(ctx, userID, id)
}

func (s *Store) UpdatePropTransaction(ctx context.Context, userID, id string, in model.PropTransactionInput) (*model.PropTransaction, error) {
	if err := s.ownsFund(ctx, userID, in.FundID); err != nil {
		return nil, err
	}
	tag, err := s.pool.Exec(ctx,
		`update public.prop_transactions
		 set kind = $3, firm = $4, amount = $5, currency = $6, occurred_on = $7::date,
		     account_size = $8, fund_id = $9, note = $10
		 where id = $1 and user_id = $2`,
		id, userID, in.Kind, in.Firm, in.Amount, in.Currency, in.OccurredOn, in.AccountSize, in.FundID, in.Note)
	if err != nil {
		return nil, fmt.Errorf("prop kaydı güncellenemedi: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrNotFound
	}
	return s.getProp(ctx, userID, id)
}

func (s *Store) DeletePropTransaction(ctx context.Context, userID, id string) error {
	tag, err := s.pool.Exec(ctx, "delete from public.prop_transactions where id = $1 and user_id = $2", id, userID)
	if err != nil {
		return fmt.Errorf("prop kaydı silinemedi: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// propTotalsSelect, bir grubun toplamlarını hesaplayan sütunlar.
const propTotalsSelect = `
	coalesce(sum(amount) filter (where kind = 'fee'), 0)::float8,
	coalesce(sum(amount) filter (where kind = 'refund'), 0)::float8,
	coalesce(sum(amount) filter (where kind = 'payout'), 0)::float8,
	count(*) filter (where kind = 'fee')::int,
	count(*) filter (where kind = 'payout')::int`

func scanTotals(dst *model.PropTotals, extra ...any) []any {
	return append(extra, &dst.Fees, &dst.Refunds, &dst.Payouts, &dst.ChallengeCount, &dst.PayoutCount)
}

// finish, net ve ROI'yi doldurur. ROI, harcanan ücrete göre getiri: ücret
// yoksa tanımsızdır (sıfıra bölme yerine null).
func finish(t *model.PropTotals) {
	t.Net = round2(t.Payouts + t.Refunds - t.Fees)
	if t.Fees > 0 {
		roi := round4(t.Net / t.Fees)
		t.ROI = &roi
	}
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }
func round4(v float64) float64 { return math.Round(v*10000) / 10000 }

// PropSummary, toplamları, firma ve ay kırılımını döner.
func (s *Store) PropSummary(ctx context.Context, userID string) (*model.PropSummary, error) {
	out := &model.PropSummary{ByFirm: []model.PropFirmTotals{}, ByMonth: []model.PropMonth{}, Currencies: []string{}}

	if err := s.pool.QueryRow(ctx,
		"select "+propTotalsSelect+", coalesce(array_agg(distinct currency) filter (where currency is not null), '{}') from public.prop_transactions where user_id = $1",
		userID).Scan(append(scanTotals(&out.Total), &out.Currencies)...); err != nil {
		return nil, fmt.Errorf("prop özeti okunamadı: %w", err)
	}
	finish(&out.Total)

	rows, err := s.pool.Query(ctx,
		"select firm, "+propTotalsSelect+" from public.prop_transactions where user_id = $1 group by firm",
		userID)
	if err != nil {
		return nil, fmt.Errorf("firma kırılımı okunamadı: %w", err)
	}
	for rows.Next() {
		var f model.PropFirmTotals
		if err := rows.Scan(scanTotals(&f.PropTotals, &f.Firm)...); err != nil {
			rows.Close()
			return nil, err
		}
		finish(&f.PropTotals)
		out.ByFirm = append(out.ByFirm, f)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// En çok harcanan firma en üstte; eşitlikte ada göre, sıra kararlı olsun.
	sort.Slice(out.ByFirm, func(i, j int) bool {
		a, b := out.ByFirm[i], out.ByFirm[j]
		if a.Fees != b.Fees {
			return a.Fees > b.Fees
		}
		return a.Firm < b.Firm
	})

	rows, err = s.pool.Query(ctx,
		`select to_char(occurred_on, 'YYYY-MM') as m, `+propTotalsSelect+`
		 from public.prop_transactions where user_id = $1 group by m order by m`,
		userID)
	if err != nil {
		return nil, fmt.Errorf("aylık kırılım okunamadı: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var m model.PropMonth
		if err := rows.Scan(scanTotals(&m.PropTotals, &m.Month)...); err != nil {
			return nil, err
		}
		finish(&m.PropTotals)
		out.ByMonth = append(out.ByMonth, m)
	}
	return out, rows.Err()
}
