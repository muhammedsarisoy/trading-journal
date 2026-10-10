package api_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestPropTransactionsAndSummary(t *testing.T) {
	a := newApp(t)
	c, _ := a.signedUp("ali@example.com")

	add := func(body map[string]any) map[string]any {
		t.Helper()
		r := c.do("POST", "/api/v1/prop/transactions", body)
		if r.status != http.StatusCreated {
			t.Fatalf("kayıt %d: %s", r.status, r.body)
		}
		return r.json(t)
	}

	// Boş başlangıç: ROI tanımsız, listeler boş dizi (null değil).
	empty := c.do("GET", "/api/v1/prop/summary", nil).json(t)
	if empty["total"].(map[string]any)["roi"] != nil || len(empty["by_firm"].([]any)) != 0 {
		t.Fatalf("boş özet: %v", empty)
	}

	fund := c.do("POST", "/api/v1/funds", map[string]any{"name": "BEM 50K", "is_prop": true}).json(t)["id"].(string)

	fee := add(map[string]any{"kind": "fee", "firm": " BEM Funding ", "amount": 299.999, "occurred_on": "2026-08-03", "account_size": 50000, "fund_id": fund})
	if fee["firm"] != "BEM Funding" || fee["amount"] != 300.0 || fee["occurred_on"] != "2026-08-03" || fee["fund_name"] != "BEM 50K" || fee["currency"] != "USD" {
		t.Fatalf("ücret kaydı: %v", fee)
	}
	add(map[string]any{"kind": "fee", "firm": "BEM Funding", "amount": 300, "occurred_on": "2026-09-10"})
	add(map[string]any{"kind": "fee", "firm": "Funding Pips", "amount": 150, "occurred_on": "2026-09-12"})
	add(map[string]any{"kind": "payout", "firm": "BEM Funding", "amount": 1200, "occurred_on": "2026-09-28"})
	add(map[string]any{"kind": "refund", "firm": "BEM Funding", "amount": 300, "occurred_on": "2026-09-28"})

	sum := c.do("GET", "/api/v1/prop/summary", nil).json(t)
	total := sum["total"].(map[string]any)
	// Net = payout + iade − ücret = 1200 + 300 − 750 = 750; ROI = 750 / 750 = 1
	for k, want := range map[string]float64{"fees": 750, "refunds": 300, "payouts": 1200, "net": 750, "roi": 1, "challenge_count": 3, "payout_count": 1} {
		if got := total[k]; got != want {
			t.Errorf("toplam %s = %v, beklenen %v", k, got, want)
		}
	}

	firms := sum["by_firm"].([]any)
	if len(firms) != 2 {
		t.Fatalf("firma kırılımı: %v", firms)
	}
	bem, pips := firms[0].(map[string]any), firms[1].(map[string]any)
	if bem["firm"] != "BEM Funding" || bem["net"] != 900.0 || bem["roi"] != 1.5 {
		t.Errorf("BEM: %v", bem)
	}
	if pips["firm"] != "Funding Pips" || pips["net"] != -150.0 || pips["roi"] != -1.0 {
		t.Errorf("Funding Pips: %v", pips)
	}

	months := sum["by_month"].([]any)
	if len(months) != 2 || months[0].(map[string]any)["month"] != "2026-08" || months[1].(map[string]any)["net"] != 1050.0 {
		t.Errorf("aylar: %v", months)
	}

	// Liste en yeniden eskiye; firma ve türe göre süzülür.
	list := c.do("GET", "/api/v1/prop/transactions", nil)
	if n := len(jsonArray(t, list.body)); n != 5 {
		t.Fatalf("liste %d kayıt", n)
	}
	if n := len(jsonArray(t, c.do("GET", "/api/v1/prop/transactions?firm=BEM%20Funding&kind=fee", nil).body)); n != 2 {
		t.Fatalf("süzgeç %d kayıt", n)
	}

	// Güncelleme ve silme.
	id := fee["id"].(string)
	up := c.do("PUT", "/api/v1/prop/transactions/"+id, map[string]any{"kind": "fee", "firm": "BEM Funding", "amount": 250, "occurred_on": "2026-08-03"})
	if up.status != 200 || up.json(t)["amount"] != 250.0 || up.json(t)["fund_id"] != nil {
		t.Fatalf("güncelleme %d: %s", up.status, up.body)
	}
	if r := c.do("DELETE", "/api/v1/prop/transactions/"+id, nil); r.status != http.StatusNoContent {
		t.Fatalf("silme %d", r.status)
	}
	if r := c.do("DELETE", "/api/v1/prop/transactions/"+id, nil); r.status != 404 {
		t.Fatalf("ikinci silme %d", r.status)
	}

	// Hesap silinince kayıt kalır, bağlantı düşer.
	linked := add(map[string]any{"kind": "fee", "firm": "Breakout", "amount": 99, "fund_id": fund})
	c.do("DELETE", "/api/v1/funds/"+fund, nil)
	for _, row := range jsonArray(t, c.do("GET", "/api/v1/prop/transactions?firm=Breakout", nil).body) {
		if row["id"] == linked["id"] && row["fund_id"] != nil {
			t.Fatal("silinen hesaba bağlantı kaldı")
		}
	}
}

func TestPropValidation(t *testing.T) {
	a := newApp(t)
	c, _ := a.signedUp("ali@example.com")
	ok := map[string]any{"kind": "fee", "firm": "BEM Funding", "amount": 100}

	cases := map[string]map[string]any{
		"bilinmeyen tür":         {"kind": "bonus", "firm": "X", "amount": 1},
		"firma yok":              {"kind": "fee", "firm": "  ", "amount": 1},
		"sıfır tutar":            {"kind": "fee", "firm": "X", "amount": 0},
		"eksi tutar":             {"kind": "payout", "firm": "X", "amount": -5},
		"kuruştan küçük":         {"kind": "fee", "firm": "X", "amount": 0.001},
		"bozuk tarih":            {"kind": "fee", "firm": "X", "amount": 1, "occurred_on": "10.09.2026"},
		"bozuk para birimi":      {"kind": "fee", "firm": "X", "amount": 1, "currency": "US$"},
		"eksi hesap boyutu":      {"kind": "fee", "firm": "X", "amount": 1, "account_size": -1},
		"geçersiz hesap kimliği": {"kind": "fee", "firm": "X", "amount": 1, "fund_id": "abc"},
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			if r := c.do("POST", "/api/v1/prop/transactions", body); r.status != 400 {
				t.Fatalf("%d: %s", r.status, r.body)
			}
		})
	}

	// Tarih verilmezse bugün; para birimi büyük harfe çevrilir.
	r := c.do("POST", "/api/v1/prop/transactions", map[string]any{"kind": "fee", "firm": "X", "amount": 1, "currency": "eur"})
	if r.status != 201 || r.json(t)["currency"] != "EUR" || r.json(t)["occurred_on"] == "" {
		t.Fatalf("%d %s", r.status, r.body)
	}
	if r := c.do("POST", "/api/v1/prop/transactions", map[string]any{"kind": "fee", "firm": "X", "amount": 1, "currency": "usdt"}); r.status != 201 {
		t.Fatalf("USDT reddedildi: %d %s", r.status, r.body)
	}
	if r := c.do("POST", "/api/v1/prop/transactions", ok); r.status != 201 {
		t.Fatalf("geçerli kayıt %d", r.status)
	}
}

func TestPropIsolation(t *testing.T) {
	a := newApp(t)
	alice, _ := a.signedUp("alice@example.com")
	bob, _ := a.signedUp("bob@example.com")

	tx := alice.do("POST", "/api/v1/prop/transactions", map[string]any{"kind": "fee", "firm": "BEM Funding", "amount": 300}).json(t)["id"].(string)
	aliceFund := alice.do("POST", "/api/v1/funds", map[string]any{"name": "BEM 50K", "is_prop": true}).json(t)["id"].(string)

	if r := bob.do("PUT", "/api/v1/prop/transactions/"+tx, map[string]any{"kind": "fee", "firm": "X", "amount": 1}); r.status != 404 {
		t.Errorf("Bob başkasının kaydını güncelledi: %d", r.status)
	}
	if r := bob.do("DELETE", "/api/v1/prop/transactions/"+tx, nil); r.status != 404 {
		t.Errorf("Bob başkasının kaydını sildi: %d", r.status)
	}
	// Başkasının hesabına bağlanamaz (yabancı anahtar sahipliği denetlemez).
	if r := bob.do("POST", "/api/v1/prop/transactions", map[string]any{"kind": "fee", "firm": "X", "amount": 1, "fund_id": aliceFund}); r.status != 404 {
		t.Errorf("Bob, Alice'in hesabına kayıt bağladı: %d", r.status)
	}
	if n := len(jsonArray(t, bob.do("GET", "/api/v1/prop/transactions", nil).body)); n != 0 {
		t.Errorf("Bob'un listesinde %d kayıt var", n)
	}
	if total := bob.do("GET", "/api/v1/prop/summary", nil).json(t)["total"].(map[string]any); total["fees"] != 0.0 {
		t.Errorf("Bob'un özetine Alice'in ücreti girdi: %v", total)
	}
}

func jsonArray(t *testing.T, body []byte) []map[string]any {
	t.Helper()
	var out []map[string]any
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatalf("JSON dizi değil: %s", body)
	}
	return out
}
