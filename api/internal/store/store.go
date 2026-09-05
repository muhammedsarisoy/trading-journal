package store

import (
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/muhammedsarisoy/trading-journal/api/internal/model"
)

// Store, tüm veritabanı erişiminin tek giriş noktası.
type Store struct {
	pool *pgxpool.Pool
	tz   string // gün/hafta/ay kovaları bu saat dilimine göre
}

func New(pool *pgxpool.Pool, timezone string) *Store {
	if timezone == "" {
		timezone = "UTC"
	}
	return &Store{pool: pool, tz: timezone}
}

// Timezone, kova hesaplarında kullanılan saat dilimini döner.
func (s *Store) Timezone() string { return s.tz }

// argBuilder, $1, $2 ... yer tutucularını sırayla üretir.
type argBuilder struct {
	args []any
}

func (b *argBuilder) add(v any) string {
	b.args = append(b.args, v)
	return fmt.Sprintf("$%d", len(b.args))
}

// buildWhere, ortak işlem süzgecini SQL koşullarına çevirir.
// userID her zaman ilk koşuldur; hiçbir sorgu kullanıcı sınırını atlayamaz.
func buildWhere(userID string, f model.TradeFilter, b *argBuilder) string {
	conds := []string{"t.user_id = " + b.add(userID)}

	if f.From != nil {
		conds = append(conds, "t.opened_at >= "+b.add(*f.From))
	}
	if f.To != nil {
		conds = append(conds, "t.opened_at < "+b.add(*f.To))
	}
	if f.FundID != nil {
		conds = append(conds, "t.fund_id = "+b.add(*f.FundID))
	}
	if f.PlatformID != nil {
		conds = append(conds, "t.platform_id = "+b.add(*f.PlatformID))
	}
	if f.Status != nil {
		conds = append(conds, "t.status = "+b.add(*f.Status))
	}
	if f.Symbol != nil {
		conds = append(conds, "upper(t.symbol) = upper("+b.add(*f.Symbol)+")")
	}
	if f.AssetClass != nil {
		conds = append(conds, "t.asset_class = "+b.add(*f.AssetClass))
	}
	if f.Direction != nil {
		conds = append(conds, "t.direction = "+b.add(*f.Direction))
	}
	if f.Setup != nil {
		conds = append(conds, "t.setup = "+b.add(*f.Setup))
	}
	if f.Currency != nil {
		conds = append(conds, "t.currency = "+b.add(*f.Currency))
	}
	if f.Search != nil {
		p := b.add("%" + strings.ToLower(*f.Search) + "%")
		conds = append(conds, "(lower(t.symbol) like "+p+
			" or lower(coalesce(t.setup,'')) like "+p+
			" or lower(coalesce(t.reason,'')) like "+p+
			" or lower(coalesce(t.notes,'')) like "+p+")")
	}

	return "where " + strings.Join(conds, "\n    and ")
}
