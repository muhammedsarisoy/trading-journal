package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/muhammedsarisoy/trading-journal/api/internal/auth"
	"github.com/muhammedsarisoy/trading-journal/api/internal/db"
	"github.com/muhammedsarisoy/trading-journal/api/internal/files"
	"github.com/muhammedsarisoy/trading-journal/api/internal/testdb"
)

const (
	alice = "aaaaaaaa-0000-4000-8000-000000000001" // parola + Google
	bob   = "bbbbbbbb-0000-4000-8000-000000000002" // yalnız Google, profil satırı yok
	trade = "cccccccc-0000-4000-8000-000000000003"
	shotP = alice + "/" + trade + "/a.png"
	lessn = "dddddddd-0000-4000-8000-000000000004"
	noteP = alice + "/" + lessn + "/b.png"
)

// fakeSupabase, Supabase'in auth ve storage şemalarını taklit eden bir
// kaynak veritabanı kurar. public şeması uygulamanın kendi şemasıdır; eski
// Supabase şemasıyla aynı sütunları taşır.
func fakeSupabase(t *testing.T, aliceHash string) *pgxpool.Pool {
	t.Helper()
	src := testdb.Pool(t)
	testdb.Exec(t, src, db.Schema)
	testdb.Exec(t, src, `
		create schema auth;
		create table auth.users (
		  id uuid primary key, email text, encrypted_password text,
		  created_at timestamptz not null default now(), last_sign_in_at timestamptz);
		create table auth.identities (
		  user_id uuid, provider text, identity_data jsonb, created_at timestamptz not null default now());
		create schema storage;
		create table storage.objects (bucket_id text, name text);`)

	ctx := context.Background()
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`insert into auth.users (id, email, encrypted_password, last_sign_in_at) values
		    ($1, 'alice@example.com', $3, now()), ($2, 'bob@example.com', '', null)`, []any{alice, bob, aliceHash}},
		{`insert into auth.identities (user_id, provider, identity_data) values
		    ($1, 'email', '{"sub":"x"}'), ($1, 'google', '{"sub":"g-alice"}'), ($2, 'google', '{"sub":"g-bob"}')`, []any{alice, bob}},
		// public tarafındaki yabancı anahtarlar için kaynakta da kullanıcı satırı lazım.
		{`insert into public.users (id, email) values ($1, 'alice@example.com'), ($2, 'bob@example.com')`, []any{alice, bob}},
		{`insert into public.profiles (id, display_name, base_currency) values ($1, 'Alice', 'TRY')`, []any{alice}},
		{`insert into public.funds (id, user_id, name, broker, starting_balance, is_prop)
		    values ('eeeeeeee-0000-4000-8000-000000000005', $1, 'FTMO', 'FTMO', 100000, true)`, []any{alice}},
		{`insert into public.trades (id, user_id, fund_id, symbol, opened_at, closed_at, risk_manual, r_manual, confluences, mistakes, notes)
		    values ($2, $1, 'eeeeeeee-0000-4000-8000-000000000005', 'XAUUSD', '2026-01-02T10:00:00Z', '2026-01-02T11:00:00Z',
		            100, 2.5, '{fvg,"order block"}', '{fomo}', 'çok satırlı
		not ''tırnaklı''')`, []any{alice, trade}},
		{`insert into public.trade_screenshots (user_id, trade_id, path, phase) values ($1, $2, $3, 'exit')`, []any{alice, trade, shotP}},
		{`insert into public.courses (id, user_id, title) values ('ffffffff-0000-4000-8000-000000000006', $1, 'ICT')`, []any{alice}},
		{`insert into public.lessons (id, user_id, course_id, title, studied_on, tags)
		    values ($2, $1, 'ffffffff-0000-4000-8000-000000000006', 'Gün 1', '2026-01-03', '{a,b}')`, []any{alice, lessn}},
		{`insert into public.lesson_notes (user_id, lesson_id, sort_order, body, image_path, timestamp_sec)
		    values ($1, $2, 0, 'not', $3, 95)`, []any{alice, lessn, noteP}},
		{`insert into storage.objects (bucket_id, name) values
		    ('trade-screenshots', $1), ('lesson-images', $2),
		    ('trade-screenshots', $3), ('avatars', 'baska-bucket.png')`, []any{shotP, noteP, alice + "/" + trade + "/.emptyFolderPlaceholder"}},
	} {
		if _, err := src.Exec(ctx, q.sql, q.args...); err != nil {
			t.Fatalf("kaynak verisi: %v\n%s", err, q.sql)
		}
	}
	return src
}

func TestCopyTables(t *testing.T) {
	hash, _ := bcrypt.GenerateFromPassword([]byte("eski-parola"), 4)
	src := fakeSupabase(t, string(hash))
	dst := testdb.Pool(t)
	ctx := context.Background()

	if err := db.Migrate(ctx, dst); err != nil {
		t.Fatal(err)
	}
	if err := copyTables(ctx, src, dst); err != nil {
		t.Fatalf("copyTables: %v", err)
	}

	one := func(sql string, args ...any) string {
		t.Helper()
		var s string
		if err := dst.QueryRow(ctx, sql, args...).Scan(&s); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
		return s
	}

	// Kullanıcılar: parola hash'i aynen, Google kimliği identity_data'dan.
	var h *string
	if err := dst.QueryRow(ctx, "select password_hash from public.users where id = $1", alice).Scan(&h); err != nil {
		t.Fatal(err)
	}
	if !auth.CheckPassword(h, "eski-parola") {
		t.Fatal("taşınan hesap eski parolasıyla giremiyor")
	}
	if got := one("select google_sub from public.users where id = $1", alice); got != "g-alice" {
		t.Fatalf("Google kimliği %q", got)
	}
	if got := one("select coalesce(password_hash, 'yok') || ':' || google_sub from public.users where id = $1", bob); got != "yok:g-bob" {
		t.Fatalf("Google'lı kullanıcı: %q", got)
	}

	// Profili olmayan kullanıcıya profil açıldı.
	if got := one("select string_agg(display_name || '/' || base_currency, ',' order by display_name) from public.profiles"); got != "Alice/TRY,bob/USD" {
		t.Fatalf("profiller %q", got)
	}

	// Türetilmiş alanlar hedefte yeniden hesaplanır; diziler ve metin birebir.
	if got := one("select pnl::text || '|' || r_multiple::text || '|' || status || '|' || fund_name || '|' || array_to_string(confluences, ';') from public.trades_enriched where id = $1", trade); got != "250.00000000|2.5000|closed|FTMO|fvg;order block" {
		t.Fatalf("işlem %q", got)
	}
	if got := one("select notes from public.trades where id = $1", trade); got != "çok satırlı\n\t\tnot 'tırnaklı'" {
		t.Fatalf("metin bozuldu: %q", got)
	}
	if got := one("select path || '|' || phase from public.trade_screenshots"); got != shotP+"|exit" {
		t.Fatalf("ekran görüntüsü %q", got)
	}
	if got := one("select studied_on::text || '|' || array_to_string(tags, ',') from public.lessons"); got != "2026-01-03|a,b" {
		t.Fatalf("ders %q", got)
	}
	if got := one("select image_path || '|' || timestamp_sec from public.lesson_notes"); got != noteP+"|95" {
		t.Fatalf("not %q", got)
	}
	for _, tbl := range append([]string{"users"}, tables...) {
		var a, b int
		_ = src.QueryRow(ctx, "select count(*) from public."+tbl).Scan(&a)
		_ = dst.QueryRow(ctx, "select count(*) from public."+tbl).Scan(&b)
		if tbl == "profiles" {
			a++ // bob'un profili hedefte açılır
		}
		if a != b {
			t.Errorf("%s: kaynak %d, hedef %d", tbl, a, b)
		}
	}

	// İkinci çalıştırma veriyi çiftlemez.
	if err := copyTables(ctx, src, dst); err == nil || !strings.Contains(err.Error(), "zaten") {
		t.Fatalf("dolu hedefe tekrar taşındı: %v", err)
	}
}

func TestCopyFiles(t *testing.T) {
	src := fakeSupabase(t, "")
	ctx := context.Background()

	content := map[string]string{
		"/storage/v1/object/trade-screenshots/" + shotP: "PNG-A",
		"/storage/v1/object/lesson-images/" + noteP:     "PNG-B",
	}
	var hits int
	storage := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer servis-anahtari" || r.Header.Get("apikey") != "servis-anahtari" {
			http.Error(w, `{"error":"unauthorized"}`, 401)
			return
		}
		body, ok := content[r.URL.Path]
		if !ok {
			http.Error(w, `{"error":"not_found"}`, 404)
			return
		}
		hits++
		_, _ = w.Write([]byte(body))
	}))
	defer storage.Close()

	dir := t.TempDir()
	t.Setenv("UPLOAD_DIR", dir)
	t.Setenv("SUPABASE_URL", storage.URL+"/")
	t.Setenv("SUPABASE_SERVICE_ROLE_KEY", "servis-anahtari")

	if err := copyFiles(ctx, src); err != nil {
		t.Fatalf("copyFiles: %v", err)
	}
	for bucket, p := range map[string]string{files.Screenshots: shotP, files.LessonImages: noteP} {
		got, err := os.ReadFile(filepath.Join(dir, bucket, filepath.FromSlash(p)))
		if err != nil {
			t.Fatalf("%s/%s yazılmadı: %v", bucket, p, err)
		}
		if want := content["/storage/v1/object/"+bucket+"/"+p]; string(got) != want {
			t.Fatalf("%s içeriği %q", p, got)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, files.Screenshots, alice, trade, ".emptyFolderPlaceholder")); err == nil {
		t.Fatal("Supabase'in klasör yer tutucusu da indirildi")
	}

	// Tekrar çalıştırmak var olan dosyaları yeniden indirmez.
	before := hits
	if err := copyFiles(ctx, src); err != nil {
		t.Fatal(err)
	}
	if hits != before {
		t.Fatalf("ikinci çalıştırma var olan dosyaları yeniden indirdi (%d istek)", hits-before)
	}

	// Kaynakta olup Storage'ta bulunmayan dosya hata olarak raporlanır.
	if _, err := src.Exec(ctx, "insert into storage.objects values ('trade-screenshots', $1)", alice+"/"+trade+"/kayip.png"); err != nil {
		t.Fatal(err)
	}
	if err := copyFiles(ctx, src); err == nil {
		t.Fatal("eksik dosya sessizce geçildi")
	}

	// Anahtar verilmezse görseller atlanır, hata yok.
	t.Setenv("SUPABASE_SERVICE_ROLE_KEY", "")
	if err := copyFiles(ctx, src); err != nil {
		t.Fatalf("anahtarsız çalıştırma: %v", err)
	}
}
