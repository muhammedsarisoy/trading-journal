package api

import (
	"strings"

	"github.com/muhammedsarisoy/trading-journal/api/internal/httpx"
	"github.com/muhammedsarisoy/trading-journal/api/internal/model"
)

var (
	assetClasses  = []string{"forex", "crypto", "stock", "futures", "commodity", "index", "option"}
	directions    = []string{"long", "short"}
	quantityUnits = []string{"lot", "contract", "share", "coin", "unit"}
)

func allowed(v string, options ...string) bool {
	for _, o := range options {
		if v == o {
			return true
		}
	}
	return false
}

// validateTrade, gövdeyi doğrular ve eksik alanlara makul varsayılan verir.
func validateTrade(in *model.TradeInput) error {
	in.Symbol = strings.ToUpper(strings.TrimSpace(in.Symbol))
	if in.Symbol == "" {
		return httpx.BadRequest("Sembol zorunlu", nil)
	}

	if in.AssetClass == "" {
		in.AssetClass = "forex"
	}
	if !allowed(in.AssetClass, assetClasses...) {
		return httpx.BadRequest("Geçersiz enstrüman sınıfı", nil)
	}

	if in.Direction == "" {
		in.Direction = "long"
	}
	if !allowed(in.Direction, directions...) {
		return httpx.BadRequest("Geçersiz yön", nil)
	}

	if in.QuantityUnit != nil && !allowed(*in.QuantityUnit, quantityUnits...) {
		return httpx.BadRequest("Geçersiz miktar birimi", nil)
	}

	if in.Currency == "" {
		in.Currency = "USD"
	}
	in.Currency = strings.ToUpper(in.Currency)

	if in.OpenedAt.IsZero() {
		return httpx.BadRequest("İşlem tarihi zorunlu", nil)
	}

	// Fiyat/miktar alanları isteğe bağlı; verildiyse anlamlı olmalı.
	if err := positive("Giriş fiyatı", in.EntryPrice); err != nil {
		return err
	}
	if err := positive("Çıkış fiyatı", in.ExitPrice); err != nil {
		return err
	}
	if err := positive("Miktar", in.Quantity); err != nil {
		return err
	}
	if err := positive("Riske edilen tutar", in.RiskManual); err != nil {
		return err
	}
	if in.ContractSize != nil && *in.ContractSize <= 0 {
		in.ContractSize = nil
	}

	// Çıkış fiyatı varsa kapanış zamanı da olmalı (şemadaki kısıtla aynı kural).
	if in.ExitPrice != nil {
		if in.ClosedAt == nil {
			return httpx.BadRequest("Çıkış fiyatı girildiyse kapanış zamanı da gerekli", nil)
		}
		if in.ClosedAt.Before(in.OpenedAt) {
			return httpx.BadRequest("Kapanış zamanı açılıştan önce olamaz", nil)
		}
	} else {
		// Açık işlemde kapanış bilgisi tutulmaz.
		in.ClosedAt = nil
	}

	if in.Confidence != nil && (*in.Confidence < 1 || *in.Confidence > 5) {
		return httpx.BadRequest("Güven düzeyi 1-5 aralığında olmalı", nil)
	}
	if in.Stress != nil && (*in.Stress < 1 || *in.Stress > 5) {
		return httpx.BadRequest("Stres düzeyi 1-5 aralığında olmalı", nil)
	}

	in.Confluences = cleanList(in.Confluences)
	in.Tags = cleanList(in.Tags)
	in.Mistakes = cleanList(in.Mistakes)

	trimPtr(&in.Setup)
	trimPtr(&in.Reason)
	trimPtr(&in.Lesson)
	trimPtr(&in.Notes)
	trimPtr(&in.Timeframe)
	trimPtr(&in.EmotionBefore)
	trimPtr(&in.EmotionAfter)
	trimPtr(&in.FundID)
	trimPtr(&in.PlatformID)

	return nil
}

// positive, verilmişse alanın sıfırdan büyük olmasını şart koşar.
func positive(label string, v *float64) error {
	if v != nil && *v <= 0 {
		return httpx.BadRequest(label+" sıfırdan büyük olmalı", nil)
	}
	return nil
}

func validateFund(in *model.FundInput) error {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return httpx.BadRequest("Fon adı zorunlu", nil)
	}
	if in.Currency == "" {
		in.Currency = "USD"
	}
	in.Currency = strings.ToUpper(strings.TrimSpace(in.Currency))
	trimPtr(&in.Broker)
	trimPtr(&in.Note)
	return nil
}

// cleanList, boşlukları kırpar, boşları ve tekrarları atar.
func cleanList(items []string) []string {
	if items == nil {
		return []string{}
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, len(items))
	for _, it := range items {
		t := strings.TrimSpace(it)
		if t == "" {
			continue
		}
		if _, dup := seen[t]; dup {
			continue
		}
		seen[t] = struct{}{}
		out = append(out, t)
	}
	return out
}

// trimPtr, işaretçideki metni kırpar; boşaldıysa nil yapar.
func trimPtr(p **string) {
	if *p == nil {
		return
	}
	t := strings.TrimSpace(**p)
	if t == "" {
		*p = nil
		return
	}
	*p = &t
}
