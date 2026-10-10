// import-supabase, eski Supabase projesindeki tüm veriyi yeni Postgres'e ve
// yüklenen görselleri UPLOAD_DIR'e taşır. Bir kez çalıştırılır.
//
// Ortam değişkenleri:
//
//	SOURCE_DATABASE_URL        Supabase bağlantı dizesi (Session pooler, 5432)
//	DATABASE_URL               yeni Postgres
//	SUPABASE_URL               https://<ref>.supabase.co          (görseller için)
//	SUPABASE_SERVICE_ROLE_KEY  Settings > API Keys > secret        (görseller için)
//	UPLOAD_DIR                 görsellerin yazılacağı klasör (varsayılan ./data/uploads)
//
// Servis anahtarını bir dosyaya yazma; yalnız bu komutu çalıştırırken ortamda
// ver. RLS'i tamamen aşan bir anahtardır. Taşıma bitince Supabase panelinden
// yenilemek (rotate) iyi olur.
//
//	go run ./cmd/import-supabase              # tablolar + görseller
//	go run ./cmd/import-supabase -skip-files  # yalnız tablolar
//	go run ./cmd/import-supabase -files-only  # yalnız görseller (tekrar çalıştırılabilir)
//
// Parolalar bcrypt olarak taşınır; kullanıcılar aynı parolayla girer. Açık
// oturumlar taşınmaz, herkes bir kez yeniden giriş yapar.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/muhammedsarisoy/trading-journal/api/internal/db"
	"github.com/muhammedsarisoy/trading-journal/api/internal/files"
)

// tables, yabancı anahtar sırasına göre taşınacak tablolar.
var tables = []string{
	"profiles",
	"funds",
	"platforms",
	"trades",
	"trade_screenshots",
	"courses",
	"lessons",
	"lesson_notes",
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "hata:", err)
		os.Exit(1)
	}
}

func run() error {
	skipFiles := flag.Bool("skip-files", false, "görselleri taşıma")
	filesOnly := flag.Bool("files-only", false, "yalnız görselleri taşı")
	flag.Parse()

	_ = godotenv.Load()

	srcURL := os.Getenv("SOURCE_DATABASE_URL")
	dstURL := os.Getenv("DATABASE_URL")
	if srcURL == "" || dstURL == "" {
		return errors.New("SOURCE_DATABASE_URL ve DATABASE_URL tanımlı olmalı")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	src, err := db.New(ctx, srcURL)
	if err != nil {
		return fmt.Errorf("kaynak (Supabase): %w", err)
	}
	defer src.Close()

	dst, err := db.New(ctx, dstURL)
	if err != nil {
		return fmt.Errorf("hedef: %w", err)
	}
	defer dst.Close()

	if !*filesOnly {
		if err := db.Migrate(ctx, dst); err != nil {
			return err
		}
		if err := copyTables(ctx, src, dst); err != nil {
			return err
		}
	}

	if *skipFiles {
		return nil
	}
	return copyFiles(ctx, src)
}

// ------------------------------------------------------------------ Tablolar

func copyTables(ctx context.Context, src, dst *pgxpool.Pool) error {
	var existing int
	if err := dst.QueryRow(ctx, "select count(*) from public.users").Scan(&existing); err != nil {
		return err
	}
	if existing > 0 {
		return fmt.Errorf("hedefte zaten %d kullanıcı var; taşıma yalnız boş veritabanına yapılır", existing)
	}

	tx, err := dst.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	n, err := copyUsers(ctx, src, tx)
	if err != nil {
		return fmt.Errorf("kullanıcılar: %w", err)
	}
	fmt.Printf("%-18s %d\n", "users", n)

	for _, t := range tables {
		n, err := copyTable(ctx, src, tx, t)
		if err != nil {
			return fmt.Errorf("%s: %w", t, err)
		}
		fmt.Printf("%-18s %d\n", t, n)
	}

	// Profil satırı olmayan kullanıcı kalmasın (eski tetikleyici kaçırdıysa).
	if _, err := tx.Exec(ctx,
		`insert into public.profiles (id, display_name)
		 select u.id, split_part(u.email::text, '@', 1) from public.users u
		 where not exists (select 1 from public.profiles p where p.id = u.id)`); err != nil {
		return fmt.Errorf("eksik profiller: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}
	fmt.Println("tablolar taşındı")
	return nil
}

// copyUsers, auth.users'tan kimlik, e-posta, bcrypt hash'i ve Google
// kimliğini alır.
func copyUsers(ctx context.Context, src *pgxpool.Pool, tx pgx.Tx) (int, error) {
	rows, err := src.Query(ctx,
		`select u.id, lower(u.email), nullif(u.encrypted_password, ''),
		        (select i.identity_data ->> 'sub' from auth.identities i
		          where i.user_id = u.id and i.provider = 'google'
		          order by i.created_at limit 1),
		        u.created_at, u.last_sign_in_at
		 from auth.users u
		 where u.email is not null`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	type user struct {
		id, email       string
		hash, googleSub *string
		createdAt       time.Time
		lastLogin       *time.Time
	}
	var users []user
	for rows.Next() {
		var u user
		if err := rows.Scan(&u.id, &u.email, &u.hash, &u.googleSub, &u.createdAt, &u.lastLogin); err != nil {
			return 0, err
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	for _, u := range users {
		if _, err := tx.Exec(ctx,
			`insert into public.users (id, email, password_hash, google_sub, created_at, last_login_at)
			 values ($1, $2, $3, $4, $5, $6)`,
			u.id, u.email, u.hash, u.googleSub, u.createdAt, u.lastLogin); err != nil {
			return 0, fmt.Errorf("%s: %w", u.email, err)
		}
	}
	return len(users), nil
}

// insertableColumns, tablonun elle yazılabilen (generated olmayan) sütunları.
func insertableColumns(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, table string) ([]string, error) {
	rows, err := q.Query(ctx,
		`select column_name from information_schema.columns
		 where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER'
		 order by ordinal_position`, table)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// copyTable, satırları JSON olarak okuyup hedef tablonun türlerine
// json_populate_record ile çevirir. Böylece numeric, dizi ve tarih türleri
// Go'dan geçmeden birebir aktarılır.
func copyTable(ctx context.Context, src *pgxpool.Pool, tx pgx.Tx, table string) (int, error) {
	dstCols, err := insertableColumns(ctx, tx, table)
	if err != nil {
		return 0, err
	}
	srcCols, err := insertableColumns(ctx, src, table)
	if err != nil {
		return 0, err
	}
	if len(srcCols) == 0 {
		fmt.Printf("%-18s kaynakta yok, atlandı\n", table)
		return 0, nil
	}

	inSrc := map[string]bool{}
	for _, c := range srcCols {
		inSrc[c] = true
	}
	var cols []string
	for _, c := range dstCols {
		if inSrc[c] {
			cols = append(cols, pgx.Identifier{c}.Sanitize())
		}
	}
	colList := strings.Join(cols, ", ")
	ident := pgx.Identifier{"public", table}.Sanitize()

	rows, err := src.Query(ctx, "select row_to_json(t)::text from "+ident+" t")
	if err != nil {
		return 0, err
	}
	records, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return 0, err
	}

	insert := "insert into " + ident + " (" + colList + ") select " + colList +
		" from json_populate_record(null::" + ident + ", $1::json)"
	for _, rec := range records {
		if _, err := tx.Exec(ctx, insert, rec); err != nil {
			return 0, err
		}
	}
	return len(records), nil
}

// ------------------------------------------------------------------ Görseller

func copyFiles(ctx context.Context, src *pgxpool.Pool) error {
	base := strings.TrimRight(os.Getenv("SUPABASE_URL"), "/")
	key := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
	if base == "" || key == "" {
		fmt.Println("SUPABASE_URL ya da SUPABASE_SERVICE_ROLE_KEY yok: görseller atlandı")
		return nil
	}

	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./data/uploads"
	}
	store, err := files.New(uploadDir)
	if err != nil {
		return err
	}

	rows, err := src.Query(ctx,
		`select bucket_id, name from storage.objects
		 where bucket_id = any($1) and name not like '%/.emptyFolderPlaceholder'
		 order by bucket_id, name`,
		[]string{files.Screenshots, files.LessonImages})
	if err != nil {
		return fmt.Errorf("storage.objects okunamadı: %w", err)
	}
	type object struct{ bucket, name string }
	objects, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (object, error) {
		var o object
		return o, r.Scan(&o.bucket, &o.name)
	})
	if err != nil {
		return err
	}
	fmt.Printf("%d görsel bulundu → %s\n", len(objects), store.Root())

	client := &http.Client{Timeout: 2 * time.Minute}
	var copied, skipped, failed atomic.Int64
	jobs := make(chan object)
	var wg sync.WaitGroup
	for range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for o := range jobs {
				wrote, err := downloadObject(ctx, client, base, key, store, o.bucket, o.name)
				switch {
				case err != nil:
					failed.Add(1)
					fmt.Fprintf(os.Stderr, "  %s/%s: %v\n", o.bucket, o.name, err)
				case wrote:
					copied.Add(1)
				default:
					skipped.Add(1)
				}
			}
		}()
	}
	for _, o := range objects {
		jobs <- o
	}
	close(jobs)
	wg.Wait()

	fmt.Printf("görseller: %d kopyalandı, %d zaten vardı, %d hata\n",
		copied.Load(), skipped.Load(), failed.Load())
	if failed.Load() > 0 {
		return errors.New("bazı görseller indirilemedi; komutu -files-only ile tekrar çalıştırabilirsin")
	}
	return nil
}

func downloadObject(ctx context.Context, client *http.Client, base, key string, store *files.Store, bucket, name string) (bool, error) {
	// Tekrar çalıştırmada var olan dosya yeniden indirilmez.
	if store.Exists(bucket, name) {
		return false, nil
	}
	segments := strings.Split(name, "/")
	for i, s := range segments {
		segments[i] = url.PathEscape(s)
	}
	u := base + "/storage/v1/object/" + url.PathEscape(bucket) + "/" + strings.Join(segments, "/")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("apikey", key)

	resp, err := client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
		return false, fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return store.Write(bucket, name, io.LimitReader(resp.Body, files.MaxBytes*2))
}
