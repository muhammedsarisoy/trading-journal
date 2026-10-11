package api_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/muhammedsarisoy/trading-journal/api/internal/api"
	"github.com/muhammedsarisoy/trading-journal/api/internal/auth"
	"github.com/muhammedsarisoy/trading-journal/api/internal/files"
	"github.com/muhammedsarisoy/trading-journal/api/internal/store"
	"github.com/muhammedsarisoy/trading-journal/api/internal/testdb"
)

// Tarayıcının gönderdiği Origin; API yalnız bunu kabul edecek şekilde kurulur.
const origin = "http://app.test"

// 1x1 gerçek bir PNG.
var pngBytes, _ = base64.StdEncoding.DecodeString(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")

type app struct {
	t     *testing.T
	ts    *httptest.Server
	pool  *pgxpool.Pool
	files *files.Store
}

func newApp(t *testing.T, configure ...func(*api.Options)) *app {
	t.Helper()
	pool := testdb.Migrated(t)
	fs, err := files.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	o := api.Options{
		Store:       store.New(pool, "Europe/Istanbul"),
		Files:       fs,
		Sessions:    auth.NewSessions(pool, 30*24*time.Hour, false),
		AllowSignup: true,
	}
	for _, f := range configure {
		f(&o)
	}
	ts := httptest.NewServer(api.Router(api.NewServer(o), []string{origin}))
	t.Cleanup(ts.Close)
	return &app{t: t, ts: ts, pool: pool, files: fs}
}

// diskPath, bir görselin diskteki yeri.
func (a *app) diskPath(bucket, path string) string {
	return filepath.Join(a.files.Root(), bucket, filepath.FromSlash(path))
}

func (a *app) exists(bucket, path string) bool {
	_, err := os.Stat(a.diskPath(bucket, path))
	return err == nil
}

func (a *app) scalar(sql string, args ...any) string {
	a.t.Helper()
	var s string
	if err := a.pool.QueryRow(context.Background(), sql, args...).Scan(&s); err != nil {
		a.t.Fatalf("%s: %v", sql, err)
	}
	return s
}

// ------------------------------------------------------------------ istemci

type client struct {
	a    *app
	http *http.Client
}

// client, kendi çerez kavanozu olan bir tarayıcı gibi davranır.
// Yönlendirmeleri izlemez; testler Location başlığına bakar.
func (a *app) client() *client {
	jar, _ := cookiejar.New(nil)
	return &client{a: a, http: &http.Client{
		Jar:           jar,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}
}

type resp struct {
	status int
	header http.Header
	body   []byte
}

func (r resp) json(t *testing.T) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(r.body, &m); err != nil {
		t.Fatalf("JSON değil (%d): %s", r.status, r.body)
	}
	return m
}

func (r resp) errMsg(t *testing.T) string {
	t.Helper()
	e, _ := r.json(t)["error"].(map[string]any)
	msg, _ := e["message"].(string)
	return msg
}

func (c *client) send(method, path string, body io.Reader, ctype string, hdr map[string]string) resp {
	c.a.t.Helper()
	req, err := http.NewRequest(method, c.a.ts.URL+path, body)
	if err != nil {
		c.a.t.Fatal(err)
	}
	req.Header.Set("Origin", origin)
	if ctype != "" {
		req.Header.Set("Content-Type", ctype)
	}
	for k, v := range hdr {
		if v == "" {
			req.Header.Del(k)
		} else {
			req.Header.Set(k, v)
		}
	}
	res, err := c.http.Do(req)
	if err != nil {
		c.a.t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return resp{status: res.StatusCode, header: res.Header, body: b}
}

func (c *client) do(method, path string, payload any) resp {
	c.a.t.Helper()
	if payload == nil {
		return c.send(method, path, nil, "", nil)
	}
	b, _ := json.Marshal(payload)
	return c.send(method, path, bytes.NewReader(b), "application/json", nil)
}

func (c *client) upload(path string, fields map[string]string, content []byte) resp {
	c.a.t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	for k, v := range fields {
		_ = w.WriteField(k, v)
	}
	if content != nil {
		fw, _ := w.CreateFormFile("file", "grafik.png")
		_, _ = fw.Write(content)
	}
	_ = w.Close()
	return c.send("POST", path, &buf, w.FormDataContentType(), nil)
}

func (c *client) cookie(name string) *http.Cookie {
	u, _ := url.Parse(c.a.ts.URL)
	for _, ck := range c.http.Jar.Cookies(u) {
		if ck.Name == name {
			return ck
		}
	}
	return nil
}

// signedUp, yeni bir hesap açıp oturumu açık bir istemci döner.
func (a *app) signedUp(email string) (*client, string) {
	a.t.Helper()
	c := a.client()
	r := c.do("POST", "/api/v1/auth/signup", map[string]string{"email": email, "password": "parola1234"})
	if r.status != http.StatusCreated {
		a.t.Fatalf("kayıt %d: %s", r.status, r.body)
	}
	return c, r.json(a.t)["user_id"].(string)
}

func (c *client) createTrade() string {
	c.a.t.Helper()
	r := c.do("POST", "/api/v1/trades", map[string]any{
		"symbol": "EURUSD", "opened_at": "2026-10-09T10:00:00Z", "closed_at": "2026-10-09T12:00:00Z",
		"risk_manual": 100, "r_manual": 2.5,
	})
	if r.status != http.StatusCreated {
		c.a.t.Fatalf("işlem %d: %s", r.status, r.body)
	}
	return r.json(c.a.t)["id"].(string)
}

// ------------------------------------------------------------------ oturum

func TestSignupLoginLogout(t *testing.T) {
	a := newApp(t)
	c := a.client()

	r := c.do("POST", "/api/v1/auth/signup", map[string]string{
		"email": "Ali@Example.com", "password": "parola1234", "display_name": "Ali",
	})
	if r.status != http.StatusCreated {
		t.Fatalf("kayıt %d: %s", r.status, r.body)
	}
	if r.json(t)["email"] != "ali@example.com" {
		t.Fatalf("e-posta küçük harfe çevrilmedi: %s", r.body)
	}

	// Çerez bayrakları: JavaScript okuyamamalı, başka sitelerden POST'ta gitmemeli.
	set := r.header.Get("Set-Cookie")
	for _, want := range []string{auth.CookieName + "=", "HttpOnly", "SameSite=Lax", "Path=/"} {
		if !strings.Contains(set, want) {
			t.Errorf("Set-Cookie'de %q yok: %s", want, set)
		}
	}

	me := c.do("GET", "/api/v1/me", nil)
	if me.status != 200 || me.json(t)["display_name"] != "Ali" {
		t.Fatalf("me %d: %s", me.status, me.body)
	}

	if r := c.do("POST", "/api/v1/auth/logout", nil); r.status != http.StatusNoContent {
		t.Fatalf("çıkış %d", r.status)
	}
	if r := c.do("GET", "/api/v1/me", nil); r.status != http.StatusUnauthorized {
		t.Fatalf("çıkıştan sonra me %d", r.status)
	}
	if n := a.scalar("select count(*)::text from public.sessions"); n != "0" {
		t.Fatalf("çıkışta oturum silinmedi: %s", n)
	}

	if r := c.do("POST", "/api/v1/auth/login", map[string]string{"email": "ALI@example.com", "password": "parola1234"}); r.status != 200 {
		t.Fatalf("giriş %d: %s", r.status, r.body)
	}
	if r := c.do("GET", "/api/v1/me", nil); r.status != 200 {
		t.Fatalf("girişten sonra me %d", r.status)
	}
}

func TestSignupValidation(t *testing.T) {
	a := newApp(t)
	a.signedUp("ali@example.com")
	c := a.client()

	cases := []struct {
		name  string
		body  map[string]string
		code  int
		match string
	}{
		{"aynı e-posta, farklı harf", map[string]string{"email": "ALI@example.com", "password": "parola1234"}, 409, "zaten bir hesap"},
		{"kısa parola", map[string]string{"email": "b@example.com", "password": "1234567"}, 400, "en az 8"},
		{"uzun parola", map[string]string{"email": "b@example.com", "password": strings.Repeat("a", 73)}, 400, "72"},
		{"geçersiz e-posta", map[string]string{"email": "ali", "password": "parola1234"}, 400, "e-posta"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := c.do("POST", "/api/v1/auth/signup", tc.body)
			if r.status != tc.code || !strings.Contains(r.errMsg(t), tc.match) {
				t.Fatalf("%d %s", r.status, r.body)
			}
		})
	}
	if r := c.send("POST", "/api/v1/auth/signup", strings.NewReader(`{"email":"x@y.z","password":"parola1234","is_admin":true}`), "application/json", nil); r.status != 400 {
		t.Fatalf("bilinmeyen alan kabul edildi: %d", r.status)
	}
}

func TestLoginDoesNotRevealAccounts(t *testing.T) {
	a := newApp(t)
	a.signedUp("ali@example.com")
	c := a.client()

	wrong := c.do("POST", "/api/v1/auth/login", map[string]string{"email": "ali@example.com", "password": "yanlis1234"})
	unknown := c.do("POST", "/api/v1/auth/login", map[string]string{"email": "yok@example.com", "password": "yanlis1234"})
	if wrong.status != 401 || unknown.status != 401 || wrong.errMsg(t) != unknown.errMsg(t) {
		t.Fatalf("yanlış parola ve bilinmeyen e-posta ayırt edilebiliyor: %s / %s", wrong.body, unknown.body)
	}
	if c.cookie(auth.CookieName) != nil {
		t.Fatal("başarısız girişte oturum çerezi yazıldı")
	}
}

// loginFrom, verilen istemci IP'sinden (ters vekilin yazdığı X-Real-IP) giriş dener.
func (c *client) loginFrom(ip, email, password string) resp {
	c.a.t.Helper()
	b, _ := json.Marshal(map[string]string{"email": email, "password": password})
	return c.send("POST", "/api/v1/auth/login", bytes.NewReader(b), "application/json", map[string]string{"X-Real-IP": ip})
}

func TestLoginRateLimitPerEmail(t *testing.T) {
	a := newApp(t)
	a.signedUp("ali@example.com")
	c := a.client()
	const attacker = "198.51.100.7"

	for i := range 10 {
		if r := c.loginFrom(attacker, "ali@example.com", "yanlis1234"); r.status != 401 {
			t.Fatalf("deneme %d: %d", i+1, r.status)
		}
	}
	// Sınır dolunca aynı kaynaktan doğru parola da reddedilir; yoksa yanıt
	// farkı parolayı ele verirdi.
	if r := c.loginFrom(attacker, "Ali@Example.com", "parola1234"); r.status != http.StatusTooManyRequests {
		t.Fatalf("11. deneme (doğru parolayla bile) sınırlanmalı: %d", r.status)
	}
	// Hesap sahibi başka bir IP'den kilitlenmeden girer.
	if r := c.loginFrom("203.0.113.9", "ali@example.com", "parola1234"); r.status != 200 {
		t.Fatalf("saldırgan hesap sahibini kilitledi: %d", r.status)
	}
	// Başka bir hesap etkilenmez.
	a.signedUp("veli@example.com")
	if r := c.loginFrom(attacker, "veli@example.com", "parola1234"); r.status != 200 {
		t.Fatalf("başka e-posta sınırdan etkilendi: %d", r.status)
	}
}

func TestLoginCountsOnlyFailures(t *testing.T) {
	a := newApp(t)
	a.signedUp("ali@example.com")
	c := a.client()
	for i := range 12 {
		if r := c.loginFrom("203.0.113.9", "ali@example.com", "parola1234"); r.status != 200 {
			t.Fatalf("başarılı giriş %d sınırlandı: %d", i+1, r.status)
		}
	}
}

func TestAuthLimitIgnoresSpoofableIPHeaders(t *testing.T) {
	a := newApp(t)
	c := a.client()
	try := func(i int) resp {
		b, _ := json.Marshal(map[string]string{"email": "gecersiz", "password": "x"})
		return c.send("POST", "/api/v1/auth/login", bytes.NewReader(b), "application/json", map[string]string{
			"True-Client-IP":  fmt.Sprintf("192.0.2.%d", i),
			"X-Forwarded-For": fmt.Sprintf("192.0.2.%d", i),
		})
	}
	for i := range 30 {
		if r := try(i); r.status != 401 {
			t.Fatalf("istek %d: %d", i+1, r.status)
		}
	}
	if r := try(99); r.status != http.StatusTooManyRequests {
		t.Fatalf("sahte IP başlıkları IP sınırını atlattı: %d", r.status)
	}
}

func TestSignupDisabled(t *testing.T) {
	b := newApp(t, func(o *api.Options) { o.AllowSignup = false })
	c := b.client()
	if p := c.do("GET", "/api/v1/auth/providers", nil).json(t); p["signup"] != false || p["google"] != false {
		t.Fatalf("providers: %v", p)
	}
	if r := c.do("POST", "/api/v1/auth/signup", map[string]string{"email": "x@example.com", "password": "parola1234"}); r.status != 403 {
		t.Fatalf("kayıt kapalıyken %d", r.status)
	}
}

func TestSessionTokenStoredHashed(t *testing.T) {
	a := newApp(t)
	c, _ := a.signedUp("ali@example.com")
	token := c.cookie(auth.CookieName).Value

	sum := sha256.Sum256([]byte(token))
	n := a.scalar("select count(*)::text from public.sessions where token_hash = $1", sum[:])
	if n != "1" {
		t.Fatal("oturum jetonun SHA-256 özetiyle saklanmalı")
	}
	if n := a.scalar("select count(*)::text from public.sessions where token_hash = $1", []byte(token)); n != "0" {
		t.Fatal("jetonun kendisi veritabanında duruyor")
	}

	// Aynı jeton Authorization başlığıyla da geçer (tarayıcı dışı istemciler).
	r := a.client().send("GET", "/api/v1/me", nil, "", map[string]string{"Authorization": "Bearer " + token})
	if r.status != 200 {
		t.Fatalf("Bearer ile me %d", r.status)
	}
}

func TestSessionExpiryAndRenewal(t *testing.T) {
	a := newApp(t)
	c, uid := a.signedUp("ali@example.com")
	ctx := context.Background()

	// Ömrünün yarısından azı kalan oturum kullanılınca uzar ve çerez yenilenir.
	if _, err := a.pool.Exec(ctx, "update public.sessions set expires_at = now() + interval '1 hour' where user_id = $1", uid); err != nil {
		t.Fatal(err)
	}
	r := c.do("GET", "/api/v1/me", nil)
	if r.status != 200 || !strings.Contains(r.header.Get("Set-Cookie"), auth.CookieName+"=") {
		t.Fatalf("oturum yenilenmedi: %d %v", r.status, r.header)
	}
	if left := a.scalar("select (expires_at > now() + interval '29 days')::text from public.sessions where user_id = $1", uid); left != "true" {
		t.Fatal("süre veritabanında uzatılmadı")
	}

	// Süresi geçmiş oturum reddedilir ve çerez silinir.
	if _, err := a.pool.Exec(ctx, "update public.sessions set expires_at = now() - interval '1 minute' where user_id = $1", uid); err != nil {
		t.Fatal(err)
	}
	r = c.do("GET", "/api/v1/me", nil)
	if r.status != 401 || !strings.Contains(r.header.Get("Set-Cookie"), "Max-Age=0") {
		t.Fatalf("süresi geçmiş oturum: %d %v", r.status, r.header.Get("Set-Cookie"))
	}
}

func TestProtectedRoutesNeedSession(t *testing.T) {
	a := newApp(t)
	c := a.client()
	for _, p := range []string{"/api/v1/me", "/api/v1/trades", "/api/v1/stats/summary", "/api/v1/files/trade-screenshots/x/y/z.png"} {
		if r := c.do("GET", p, nil); r.status != 401 {
			t.Errorf("%s oturumsuz %d döndü", p, r.status)
		}
	}
	if r := c.send("GET", "/api/v1/me", nil, "", map[string]string{"Authorization": "Bearer uydurma"}); r.status != 401 {
		t.Errorf("uydurma jeton kabul edildi: %d", r.status)
	}
}

func TestOriginCheck(t *testing.T) {
	a := newApp(t)
	c, _ := a.signedUp("ali@example.com")

	r := c.send("POST", "/api/v1/funds", strings.NewReader(`{"name":"Kötü"}`), "application/json",
		map[string]string{"Origin": "https://evil.test"})
	if r.status != 403 {
		t.Fatalf("yabancı origin %d", r.status)
	}
	r = c.send("POST", "/api/v1/funds", strings.NewReader(`{"name":"Kötü"}`), "application/json",
		map[string]string{"Origin": "", "Sec-Fetch-Site": "cross-site"})
	if r.status != 403 {
		t.Fatalf("Origin'siz cross-site %d", r.status)
	}
	if n := a.scalar("select count(*)::text from public.funds"); n != "0" {
		t.Fatal("reddedilen istek yine de kayıt açtı")
	}
}

// --------------------------------------------------------- ekran görüntüleri

func TestScreenshotLifecycle(t *testing.T) {
	a := newApp(t)
	c, uid := a.signedUp("ali@example.com")
	tid := c.createTrade()
	base := "/api/v1/trades/" + tid + "/screenshots"

	r := c.upload(base, map[string]string{"phase": "exit", "caption": " giriş anı "}, pngBytes)
	if r.status != http.StatusCreated {
		t.Fatalf("yükleme %d: %s", r.status, r.body)
	}
	shot := r.json(t)
	path := shot["path"].(string)
	if !strings.HasPrefix(path, uid+"/"+tid+"/") || !strings.HasSuffix(path, ".png") {
		t.Fatalf("yol %q", path)
	}
	if shot["phase"] != "exit" || shot["caption"] != "giriş anı" {
		t.Fatalf("alanlar kaydedilmedi: %v", shot)
	}
	if !a.exists(files.Screenshots, path) {
		t.Fatal("dosya diske yazılmadı")
	}

	list := c.do("GET", base, nil)
	if list.status != 200 || !bytes.Contains(list.body, []byte(path)) {
		t.Fatalf("liste: %s", list.body)
	}

	f := c.do("GET", "/api/v1/files/trade-screenshots/"+path, nil)
	if f.status != 200 || !bytes.Equal(f.body, pngBytes) {
		t.Fatalf("görsel sunulmadı: %d", f.status)
	}
	for k, want := range map[string]string{
		"Content-Type":            "image/png",
		"X-Content-Type-Options":  "nosniff",
		"Content-Security-Policy": "default-src 'none'; sandbox",
	} {
		if got := f.header.Get(k); got != want {
			t.Errorf("%s = %q, beklenen %q", k, got, want)
		}
	}
	if !strings.HasPrefix(f.header.Get("Cache-Control"), "private") {
		t.Errorf("görsel paylaşılan önbelleğe girebilir: %q", f.header.Get("Cache-Control"))
	}

	if r := c.do("DELETE", "/api/v1/screenshots/"+shot["id"].(string), nil); r.status != 200 {
		t.Fatalf("silme %d", r.status)
	}
	if a.exists(files.Screenshots, path) {
		t.Fatal("kayıt silindi ama dosya diskte kaldı")
	}

	// İşlem silinince tüm görselleri de gider.
	p1 := c.upload(base, nil, pngBytes).json(t)["path"].(string)
	p2 := c.upload(base, nil, pngBytes).json(t)["path"].(string)
	if r := c.do("DELETE", "/api/v1/trades/"+tid, nil); r.status != 200 {
		t.Fatalf("işlem silme %d", r.status)
	}
	if a.exists(files.Screenshots, p1) || a.exists(files.Screenshots, p2) {
		t.Fatal("işlem silindi ama görseller diskte kaldı")
	}
}

func TestScreenshotUploadRejections(t *testing.T) {
	a := newApp(t)
	c, uid := a.signedUp("ali@example.com")
	tid := c.createTrade()
	base := "/api/v1/trades/" + tid + "/screenshots"

	big := append(append([]byte{}, pngBytes[:16]...), make([]byte, files.MaxBytes)...)
	cases := []struct {
		name   string
		fields map[string]string
		body   []byte
		code   int
	}{
		{"görsel değil", nil, []byte("<html><script>alert(1)</script>"), 415},
		{"dosya yok", map[string]string{"phase": "entry"}, nil, 400},
		{"geçersiz aşama", map[string]string{"phase": "hayal"}, pngBytes, 400},
		{"10 MB üstü", nil, big, 413},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if r := c.upload(base, tc.fields, tc.body); r.status != tc.code {
				t.Fatalf("%d, beklenen %d: %s", r.status, tc.code, r.body)
			}
		})
	}

	if r := c.send("POST", base, strings.NewReader(`{"path":"x"}`), "application/json", nil); r.status != 400 {
		t.Fatalf("JSON gövde kabul edildi: %d", r.status)
	}

	// Hiçbir reddedilen yükleme diskte dosya bırakmamalı.
	entries, _ := os.ReadDir(filepath.Join(a.files.Root(), files.Screenshots, uid, tid))
	if len(entries) != 0 {
		t.Fatalf("reddedilen yüklemeler iz bıraktı: %v", entries)
	}
}

func TestUsersCannotReachEachOthersData(t *testing.T) {
	a := newApp(t)
	alice, _ := a.signedUp("alice@example.com")
	bob, bobID := a.signedUp("bob@example.com")

	tid := alice.createTrade()
	path := alice.upload("/api/v1/trades/"+tid+"/screenshots", nil, pngBytes).json(t)["path"].(string)

	for name, r := range map[string]resp{
		"işlemi okuma":        bob.do("GET", "/api/v1/trades/"+tid, nil),
		"işlemi güncelleme":   bob.do("PUT", "/api/v1/trades/"+tid, map[string]any{"symbol": "X", "opened_at": "2026-10-09T10:00:00Z"}),
		"işlemi silme":        bob.do("DELETE", "/api/v1/trades/"+tid, nil),
		"görsel yükleme":      bob.upload("/api/v1/trades/"+tid+"/screenshots", nil, pngBytes),
		"dosyayı okuma":       bob.do("GET", "/api/v1/files/trade-screenshots/"+path, nil),
		"yol oyunuyla okuma":  bob.do("GET", "/api/v1/files/trade-screenshots/"+bobID+"/../"+path, nil),
		"kodlanmış yol oyunu": bob.do("GET", "/api/v1/files/trade-screenshots/"+bobID+"%2F..%2F"+strings.ReplaceAll(path, "/", "%2F"), nil),
		"başka bucket'tan":    bob.do("GET", "/api/v1/files/lesson-images/"+path, nil),
		"bilinmeyen bucket":   bob.do("GET", "/api/v1/files/../../etc/passwd", nil),
	} {
		if r.status == 200 || r.status == 201 {
			t.Errorf("%s: Bob erişebildi (%d)", name, r.status)
		}
	}

	// Listeler boş döner (200 ama Alice'e ait hiçbir şey yok).
	if body := string(bob.do("GET", "/api/v1/trades", nil).body); strings.Contains(body, tid) {
		t.Error("Bob'un listesinde Alice'in işlemi var")
	}
	if body := string(bob.do("GET", "/api/v1/trades/"+tid+"/screenshots", nil).body); strings.Contains(body, path) {
		t.Error("Bob, Alice'in görsel listesini görebildi")
	}
	if r := alice.do("GET", "/api/v1/trades/"+tid, nil); r.status != 200 || !a.exists(files.Screenshots, path) {
		t.Fatal("Alice'in verisi bozuldu")
	}
}

// ---------------------------------------------------------- eğitim görselleri

func TestLessonImages(t *testing.T) {
	a := newApp(t)
	c, _ := a.signedUp("ali@example.com")
	other, _ := a.signedUp("veli@example.com")

	cid := c.do("POST", "/api/v1/courses", map[string]string{"title": "ICT"}).json(t)["id"].(string)
	lid := c.do("POST", "/api/v1/courses/"+cid+"/lessons", map[string]any{"title": "Gün 1", "day_no": 1}).json(t)["id"].(string)
	imgURL := "/api/v1/lessons/" + lid + "/images"

	if r := other.upload(imgURL, nil, pngBytes); r.status != 404 {
		t.Fatalf("başkasının dersine görsel yüklendi: %d", r.status)
	}

	p1 := c.upload(imgURL, nil, pngBytes).json(t)["path"].(string)
	note := c.do("POST", "/api/v1/lessons/"+lid+"/notes", map[string]any{"heading": "FVG", "image_path": p1})
	if note.status != 201 {
		t.Fatalf("not %d: %s", note.status, note.body)
	}
	nid := note.json(t)["id"].(string)

	// Görsel değişince eskisi silinir.
	p2 := c.upload(imgURL, nil, pngBytes).json(t)["path"].(string)
	if r := c.do("PUT", "/api/v1/notes/"+nid, map[string]any{"heading": "FVG", "image_path": p2}); r.status != 200 {
		t.Fatalf("güncelleme %d: %s", r.status, r.body)
	}
	if a.exists(files.LessonImages, p1) || !a.exists(files.LessonImages, p2) {
		t.Fatal("görsel değişince eskisi silinmeli, yenisi kalmalı")
	}

	// Görselsiz başka bir güncelleme görseli korur mu? Aynı yol gönderilirse evet.
	if r := c.do("PUT", "/api/v1/notes/"+nid, map[string]any{"heading": "FVG 2", "image_path": p2}); r.status != 200 || !a.exists(files.LessonImages, p2) {
		t.Fatal("aynı görselle güncelleme dosyayı sildi")
	}

	// Başkasının dosya yolu nota yazılamaz.
	foreign := strings.Replace(p2, strings.Split(p2, "/")[0], "22222222-2222-2222-2222-222222222222", 1)
	if r := c.do("PUT", "/api/v1/notes/"+nid, map[string]any{"image_path": foreign}); r.status != 400 {
		t.Fatalf("yabancı yol kabul edildi: %d", r.status)
	}

	// Görsel kaldırılınca dosya gider.
	if r := c.do("PUT", "/api/v1/notes/"+nid, map[string]any{"heading": "FVG", "image_path": nil}); r.status != 200 {
		t.Fatalf("görsel kaldırma %d", r.status)
	}
	if a.exists(files.LessonImages, p2) {
		t.Fatal("görsel kaldırıldı ama dosya kaldı")
	}

	// Eğitim silinince notlardaki tüm görseller gider.
	p3 := c.upload(imgURL, nil, pngBytes).json(t)["path"].(string)
	c.do("POST", "/api/v1/lessons/"+lid+"/notes", map[string]any{"image_path": p3})
	if r := c.do("DELETE", "/api/v1/courses/"+cid, nil); r.status != 200 {
		t.Fatalf("eğitim silme %d", r.status)
	}
	if a.exists(files.LessonImages, p3) {
		t.Fatal("eğitim silindi ama görsel kaldı")
	}
}

// ------------------------------------------------------------------- Google

// fakeGoogle, yetkilendirme kodu akışının sunucu tarafını taklit eder.
type fakeGoogle struct {
	mu        sync.Mutex
	users     map[string]auth.GoogleUser // kod -> kullanıcı
	verifiers map[string]string          // kod -> gelen code_verifier
	srv       *httptest.Server
}

func newFakeGoogle(t *testing.T) *fakeGoogle {
	g := &fakeGoogle{users: map[string]auth.GoogleUser{}, verifiers: map[string]string{}}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		code := r.Form.Get("code")
		g.mu.Lock()
		_, ok := g.users[code]
		g.verifiers[code] = r.Form.Get("code_verifier")
		g.mu.Unlock()
		if !ok || r.Form.Get("client_secret") != "gizli" {
			http.Error(w, `{"error":"invalid_grant"}`, 400)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"access_token":"tok-%s","token_type":"Bearer","expires_in":3600}`, code)
	})
	mux.HandleFunc("GET /userinfo", func(w http.ResponseWriter, r *http.Request) {
		code := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer tok-")
		g.mu.Lock()
		u, ok := g.users[code]
		g.mu.Unlock()
		if !ok {
			http.Error(w, "unauthorized", 401)
			return
		}
		_ = json.NewEncoder(w).Encode(u)
	})
	g.srv = httptest.NewServer(mux)
	t.Cleanup(g.srv.Close)
	return g
}

func (g *fakeGoogle) configure(o *api.Options) {
	o.Google = auth.NewGoogle("istemci", "gizli", origin+"/api/v1/auth/google/callback").
		WithEndpoints(g.srv.URL+"/auth", g.srv.URL+"/token", g.srv.URL+"/userinfo")
}

// login, start → (Google onayı) → callback akışını yürütür ve dönüşün
// Location başlığını verir.
func (g *fakeGoogle) login(t *testing.T, c *client, next string, u auth.GoogleUser) string {
	t.Helper()
	code := "kod-" + u.Sub
	g.mu.Lock()
	g.users[code] = u
	g.mu.Unlock()

	start := c.do("GET", "/api/v1/auth/google/start?next="+url.QueryEscape(next), nil)
	if start.status != http.StatusFound {
		t.Fatalf("start %d: %s", start.status, start.body)
	}
	authURL, _ := url.Parse(start.header.Get("Location"))
	q := authURL.Query()
	if !strings.HasPrefix(authURL.String(), g.srv.URL+"/auth") || q.Get("state") == "" || q.Get("code_challenge_method") != "S256" {
		t.Fatalf("onay adresi: %s", authURL)
	}

	cb := c.do("GET", "/api/v1/auth/google/callback?code="+code+"&state="+url.QueryEscape(q.Get("state")), nil)
	if cb.status != http.StatusFound {
		t.Fatalf("callback %d: %s", cb.status, cb.body)
	}

	// PKCE: token isteğindeki doğrulayıcı, onay adresindeki challenge'a uymalı.
	g.mu.Lock()
	verifier := g.verifiers[code]
	g.mu.Unlock()
	if verifier != "" {
		sum := sha256.Sum256([]byte(verifier))
		if base64.RawURLEncoding.EncodeToString(sum[:]) != q.Get("code_challenge") {
			t.Fatal("code_verifier, code_challenge ile eşleşmiyor")
		}
	}
	return cb.header.Get("Location")
}

func TestGoogleLoginCreatesAndLinksAccounts(t *testing.T) {
	g := newFakeGoogle(t)
	a := newApp(t, g.configure)

	if p := a.client().do("GET", "/api/v1/auth/providers", nil).json(t); p["google"] != true {
		t.Fatalf("providers: %v", p)
	}

	// Yeni kullanıcı: hesap açılır, ad Google'dan gelir, next korunur.
	c := a.client()
	loc := g.login(t, c, "/trades?x=1", auth.GoogleUser{Sub: "g-1", Email: "Yeni@Gmail.com", EmailVerified: true, Name: "Yeni Kişi"})
	if loc != "/trades?x=1" {
		t.Fatalf("yönlendirme %q", loc)
	}
	me := c.do("GET", "/api/v1/me", nil).json(t)
	if me["email"] != "yeni@gmail.com" || me["display_name"] != "Yeni Kişi" {
		t.Fatalf("me: %v", me)
	}
	if c.cookie("tj_oauth") != nil {
		t.Fatal("tek kullanımlık OAuth çerezi silinmedi")
	}

	// Aynı Google hesabıyla tekrar giriş yeni hesap açmaz.
	g.login(t, a.client(), "/", auth.GoogleUser{Sub: "g-1", Email: "yeni@gmail.com", EmailVerified: true})
	if n := a.scalar("select count(*)::text from public.users"); n != "1" {
		t.Fatalf("tekrar girişte yeni hesap açıldı: %s", n)
	}

	// Parola hesabı olan e-posta: Google kimliği ona bağlanır.
	_, uid := a.signedUp("ali@example.com")
	g.login(t, a.client(), "/", auth.GoogleUser{Sub: "g-2", Email: "ali@example.com", EmailVerified: true})
	if sub := a.scalar("select coalesce(google_sub,'') from public.users where id = $1", uid); sub != "g-2" {
		t.Fatalf("Google kimliği bağlanmadı: %q", sub)
	}
}

// Biri, kurbanın e-postasıyla önceden parolalı hesap açarsa (kayıtta e-posta
// doğrulanmıyor), kurban Google ile girdiğinde o parola ve oturumlar geçersiz
// olmalı; yoksa saldırgan kurbanın verisini okumaya devam eder.
func TestGoogleLinkRevokesPreRegisteredPassword(t *testing.T) {
	g := newFakeGoogle(t)
	a := newApp(t, g.configure)

	attacker, uid := a.signedUp("kurban@gmail.com")

	victim := a.client()
	g.login(t, victim, "/", auth.GoogleUser{Sub: "g-kurban", Email: "kurban@gmail.com", EmailVerified: true})
	if me := victim.do("GET", "/api/v1/me", nil); me.status != 200 || me.json(t)["user_id"] != uid {
		t.Fatalf("kurban hesaba giremedi: %d %s", me.status, me.body)
	}
	tid := victim.createTrade()

	if r := attacker.do("GET", "/api/v1/trades/"+tid, nil); r.status != http.StatusUnauthorized {
		t.Fatalf("saldırganın eski oturumu hâlâ geçerli: %d", r.status)
	}
	if r := a.client().do("POST", "/api/v1/auth/login", map[string]string{"email": "kurban@gmail.com", "password": "parola1234"}); r.status != http.StatusUnauthorized {
		t.Fatalf("önceden kaydedilen parola hâlâ çalışıyor: %d", r.status)
	}
	// Kurbanın kendi Google oturumu açık kalır.
	if r := victim.do("GET", "/api/v1/trades/"+tid, nil); r.status != 200 {
		t.Fatalf("kurbanın oturumu kapandı: %d", r.status)
	}
}

func TestGoogleLinkRefusesSecondSub(t *testing.T) {
	g := newFakeGoogle(t)
	a := newApp(t, g.configure)

	g.login(t, a.client(), "/", auth.GoogleUser{Sub: "g-ilk", Email: "ayse@gmail.com", EmailVerified: true})
	// Aynı e-postayı taşıyan başka bir Google kimliği hesaba giremez.
	c := a.client()
	loc := g.login(t, c, "/", auth.GoogleUser{Sub: "g-baska", Email: "ayse@gmail.com", EmailVerified: true})
	if !strings.HasPrefix(loc, "/login?error=") || c.cookie(auth.CookieName) != nil {
		t.Fatalf("ikinci Google kimliği hesaba girdi: %s", loc)
	}
}

func TestGoogleLoginRejections(t *testing.T) {
	g := newFakeGoogle(t)
	a := newApp(t, g.configure)

	t.Run("doğrulanmamış e-posta", func(t *testing.T) {
		c := a.client()
		loc := g.login(t, c, "/", auth.GoogleUser{Sub: "g-x", Email: "x@gmail.com", EmailVerified: false})
		if !strings.HasPrefix(loc, "/login?error=") || c.cookie(auth.CookieName) != nil {
			t.Fatalf("doğrulanmamış e-posta kabul edildi: %s", loc)
		}
	})

	t.Run("güvensiz next", func(t *testing.T) {
		loc := g.login(t, a.client(), "//evil.test/x", auth.GoogleUser{Sub: "g-n", Email: "n@gmail.com", EmailVerified: true})
		if loc != "/dashboard" {
			t.Fatalf("açık yönlendirme: %q", loc)
		}
	})

	t.Run("state uyuşmazlığı", func(t *testing.T) {
		c := a.client()
		c.do("GET", "/api/v1/auth/google/start", nil)
		r := c.do("GET", "/api/v1/auth/google/callback?code=x&state=uydurma", nil)
		if !strings.HasPrefix(r.header.Get("Location"), "/login?error=") || c.cookie(auth.CookieName) != nil {
			t.Fatalf("sahte state kabul edildi: %s", r.header.Get("Location"))
		}
	})

	t.Run("çerezsiz dönüş", func(t *testing.T) {
		r := a.client().do("GET", "/api/v1/auth/google/callback?code=x&state=y", nil)
		if !strings.HasPrefix(r.header.Get("Location"), "/login?error=") {
			t.Fatalf("çerezsiz dönüş: %s", r.header.Get("Location"))
		}
	})

	t.Run("kullanıcı reddetti", func(t *testing.T) {
		r := a.client().do("GET", "/api/v1/auth/google/callback?error=access_denied", nil)
		if !strings.Contains(r.header.Get("Location"), "error=") {
			t.Fatalf("ret: %s", r.header.Get("Location"))
		}
	})

	t.Run("kayıt kapalıyken yeni hesap", func(t *testing.T) {
		closed := newApp(t, g.configure, func(o *api.Options) { o.AllowSignup = false })
		loc := g.login(t, closed.client(), "/", auth.GoogleUser{Sub: "g-k", Email: "k@gmail.com", EmailVerified: true})
		if !strings.Contains(loc, "error=") {
			t.Fatalf("kayıt kapalıyken hesap açıldı: %s", loc)
		}
		if n := closed.scalar("select count(*)::text from public.users"); n != "0" {
			t.Fatal("kayıt kapalıyken kullanıcı oluştu")
		}
	})
}

func TestGoogleNotConfigured(t *testing.T) {
	a := newApp(t)
	c := a.client()
	if r := c.do("GET", "/api/v1/auth/google/start", nil); r.status != 404 {
		t.Fatalf("start %d", r.status)
	}
	r := c.do("GET", "/api/v1/auth/google/callback?code=x&state=y", nil)
	if r.status != 302 || !strings.HasPrefix(r.header.Get("Location"), "/login?error=") {
		t.Fatalf("callback %d %s", r.status, r.header.Get("Location"))
	}
}
