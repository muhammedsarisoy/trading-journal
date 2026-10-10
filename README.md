# Trading Journal

Kişisel işlem günlüğü. Her işlemi **R cinsinden** kaydedersin; uygulama kâr-zararını,
kararlarını ve o anki psikolojini birlikte tutar, günlük/haftalık/aylık/6 aylık
grafiklerle gösterir.

Form bilerek kısa: fiyat-miktar matematiği yerine **riske ettiğin tutar** ve
**kazandığın R** girilir, gerisi hesaplanır.

| Katman | Teknoloji |
|---|---|
| `web/` | Next.js 16 · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Recharts |
| `api/` | Go 1.25 · chi · pgx · oturum, Google OAuth, dosya yükleme |
| Veritabanı | PostgreSQL 17 (şema `api/internal/db/schema.sql`, API açılışta uygular) |

Akış: **Tarayıcı → Next** (tek origin) · **Next `/api/*` → Go API** (iç ağ) ·
**Go API → Postgres** ve **diskteki görseller**. Dışarıya yalnız web açılır.

Harici servis yok: veriler, hesaplar ve ekran görüntüleri kendi sunucunda durur.

---

## Sunucuya kurmak (Coolify)

> Depoda **hiçbir anahtar yok**. Değerleri Coolify'ın Environment Variables
> ekranına girersin.

1. Coolify → **New Resource → Docker Compose** → bu depo, dosya `docker-compose.yml`.
2. **Environment Variables** (bkz. `.env.example`):

   | Değişken | Değer |
   |---|---|
   | `POSTGRES_PASSWORD` | yalnız harf/rakam, uzun (`openssl rand -hex 24`) |
   | `APP_URL` | `https://journal.alanadin.com` |
   | `ALLOW_SIGNUP` | `true` — hesabını açınca `false` yap |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | isteğe bağlı, aşağıda |

3. **web** servisine alan adını ver: `https://journal.alanadin.com` (port 3000).
   `api` ve `db` servislerine alan adı **verme**; iç ağda kalmalılar.
4. Alan adının DNS'inde (Squarespace → Domains → DNS) bir `A` kaydı:
   `journal` → sunucunun IP'si. Sertifikayı Coolify alır.
5. **Deploy**. Şema ilk açılışta kendiliğinden kurulur.
6. **Yedek**: Coolify'da `db` için zamanlanmış yedek aç; `uploads` volume'u
   (ekran görüntüleri) da yedeğe dahil et.

### Google ile giriş (isteğe bağlı)

Google Cloud Console → **APIs & Services → Credentials → Create credentials →
OAuth client ID → Web application**:

- Authorized JavaScript origins: `https://journal.alanadin.com`
- Authorized redirect URIs: `https://journal.alanadin.com/api/v1/auth/google/callback`

Client ID ve secret'ı Coolify'a gir, yeniden deploy et. Supabase için açtığın
bir OAuth istemcisi varsa aynısına yeni redirect URI'ı ekleyebilirsin.

Aynı e-postayla parola hesabın varsa Google girişi ona bağlanır.

### Supabase'ten taşımak

Eski Supabase projesindeki kullanıcılar (parolalarıyla), tüm tablolar ve
görseller tek komutla taşınır. Hedef veritabanı boş olmalı.

Coolify → **api** servisi → **Terminal**:

```bash
SOURCE_DATABASE_URL='postgresql://postgres.<ref>:<parola>@aws-0-<bolge>.pooler.supabase.com:5432/postgres' \
SUPABASE_URL='https://<ref>.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='<secret key>' \
import-supabase
```

`DATABASE_URL` ve `UPLOAD_DIR` konteynerde zaten tanımlı. Görseller yarıda
kalırsa `import-supabase -files-only` tekrar çalıştırılabilir; var olan
dosyalara dokunmaz.

> Servis anahtarı RLS'i tamamen aşar. Yalnız bu komutta ver, bir dosyaya ya da
> Coolify değişkenine kaydetme. Taşıma bitince Supabase panelinden yenile
> (Settings → API Keys).

Oturumlar taşınmaz: herkes bir kez yeniden giriş yapar.

---

## Yerelde geliştirmek

Gerekenler: [Docker Desktop](https://www.docker.com/products/docker-desktop/),
[Node.js 22+](https://nodejs.org), [Go 1.25+](https://go.dev/dl/).

```bash
docker compose -f docker-compose.dev.yml up -d   # yalnız Postgres, :5432
cp api/.env.example api/.env
cp web/.env.example web/.env.local
```

```bash
cd api && go run ./cmd/server          # :8080 — şemayı kendisi kurar
cd web && npm install && npm run dev   # :3000
```

http://localhost:3000 → **Kayıt ol** → **Ayarlar** → hesap tanımla → **Yeni İşlem**.

Tüm yığını Docker'da denemek için kökte `.env` oluştur (`.env.example`'dan),
`docker-compose.yml` içinde web'e `ports: ["3000:3000"]` ekle ve
`docker compose up -d --build`.

---

## Neler var

- **İşlem:** sembol, yön, tarih, fon/hesap, enstrüman sınıfı, zaman dilimi
- **Sonuç:** riske edilen tutar, kazanılan R, net kâr/zarar — R ile para arasında
  iki yönlü çevrim
- **Neye göre aldım:** strateji, giriş gerekçesi, baktığın teyitlerin listesi, etiketler
- **Psikoloji:** işlem öncesi/sonrası duygu, güven ve stres düzeyi (1-5), plana uyum,
  yapılan hatalar, çıkarılan ders
- **Ekran görüntüleri:** giriş/çıkış/analiz aşamalarına göre; sunucu diskinde,
  yalnız sahibine açık
- **Eğitim defteri:** eğitim → gün → not blokları (metin + grafik görseli)
- Raporlar: net K/Z, toplam R, kazanma oranı, profit factor, beklenti, ortalama R,
  maksimum geri çekilme (para ve R), en büyük kazanç/kayıp
- Grafikler **Para / R** düğmesiyle birim değiştirir; gün/hafta/ay/çeyrek/6 ay/yıl kovaları
- Strateji, sembol, duygu, hata, haftanın günü, saat gibi 16 boyutta kırılım

## Kâr/zarar hesabı

```
K/Z    = pnl_override  →  yoksa  r_manual × risk_manual
R      = r_manual      →  yoksa  K/Z ÷ risk_manual
durum  = pnl_override ve r_manual boşsa "açık", biri doluysa "kapalı"
```

Örnek: risk 100 ₺, kazandığın R `2,5` → net K/Z `250 ₺`.
Tersi: risk 100 ₺, net K/Z `-50 ₺` → R `-0,5R`.

Eski fiyat/miktar yolu şemada duruyor ve **yedek** olarak çalışır: `entry_price`,
`exit_price`, `quantity` doldurulursa K/Z bunlardan hesaplanır. Her iki hesap da
Postgres'te `generated always as … stored`, yani tek yerde durur.

## Güvenlik

- Her sorgu Go tarafında `user_id` ile sınırlanır; veritabanına yalnız API bağlanır
  ve dışarıya açık değildir
- Oturum rastgele 32 baytlık jeton, **HttpOnly + SameSite=Lax** çerezde (https'de
  Secure). Veritabanında yalnız SHA-256 özeti tutulur; çıkışta silinir
- Durum değiştiren isteklerde `Origin` başlığı denetlenir (CSRF'e ikinci katman)
- Parolalar bcrypt. Girişte e-posta başına (15 dakikada 10) ve IP başına sınır;
  bilinmeyen e-postada da aynı süre harcanır, hesabın varlığı sızmaz
- Google girişi yetkilendirme kodu + PKCE + state; yalnız doğrulanmış e-posta
- Görseller `<user_id>/<sahip_id>/<dosya>` altında. Tür baytlardan anlaşılır
  (PNG/JPEG/WebP/GIF), 10 MB sınırı var, sunarken yolun sahibine ait olduğu doğrulanır
- `ALLOW_SIGNUP=false` ile yeni kayıt kapanır
- Kâr/zarar ve R hesabı veritabanında generated column — istemci ezemez
- JSON gövdesi 1 MiB ile sınırlı; container'lar root olmayan kullanıcıyla çalışır
- Secret koda yazılmaz; `.env` / `.env.local` git dışıdır ve `.dockerignore`
  sayesinde imaja da kopyalanmaz

## Güvenlik denetimi

Üç katman, hepsi otomatik:

**1. Yerel — push etmeden önce**

```bash
./scripts/security-check.sh
```

Sızmış anahtar (gitleaks, tüm geçmiş), takip edilen `.env`, `NEXT_PUBLIC_`
değişkenine konmuş gizli anahtar, `govulncheck`, `npm audit`, derleme ve tip
denetimi. Go kuruluysa doğrudan, değilse container'da çalışır; Node hiç gerekmez.

**2. CI — her push ve PR'da, ayrıca haftalık**

| Workflow | Ne yapar |
|---|---|
| `.github/workflows/security.yml` | gitleaks, projeye özel anahtar kontrolleri, `govulncheck`, `npm audit`, `go vet`, `gofmt`, tip denetimi, iki tarafın derlemesi |
| `.github/workflows/codeql.yml` | CodeQL kod analizi (Go + TypeScript) — enjeksiyon, doğrulanmamış girdi gibi desenler |

Haftalık cron önemli: kod değişmese de yeni açıklanan CVE'ler yakalanır.

**3. GitHub tarafı**

- **Secret scanning + push protection** — sızmış anahtar içeren push reddedilir
- **Dependabot alerts + security updates** — açık kapatan sürüm çıkınca otomatik PR
- `.github/dependabot.yml` haftalık olarak Go, npm, Docker ve Actions bağımlılıklarını tarar

## Testler

```bash
docker compose -f docker-compose.dev.yml up -d    # testlerin kullanacağı Postgres

cd api
TEST_DATABASE_URL='postgres://journal:journal@localhost:5432/trading_journal?sslmode=disable' \
  go test ./...          # birim + entegrasyon (her test kendi geçici veritabanını açar)
go test ./...            # TEST_DATABASE_URL yoksa yalnız birim testler; DB testleri atlanır

cd web && npm test       # API aktarıcısı, proxy, istemci, oturum yardımcıları

./scripts/e2e.sh         # sistem testi: docker-compose.yml yığınını kurar, web üzerinden dener
```

| Katman | Ne sınanıyor |
|---|---|
| Go birim | dosya türü tespiti, 10 MB sınırı, yol kaçışı; bcrypt (Supabase hash'i dahil); Origin/CSRF; config doğrulama |
| Go entegrasyon | kayıt/giriş/çıkış, oturum süresi ve yenileme, e-posta başına hız sınırı, kullanıcılar arası izolasyon, yükleme ve disk temizliği, Google akışı (sahte sunucuyla, PKCE dahil), şema idempotentliği ve Supabase koruması, `import-supabase` (sahte kaynak + sahte Storage) |
| Web | `/api` aktarıcısının başlıkları, akışı, Set-Cookie ve yönlendirmeleri; `proxy.ts` yönlendirmeleri ve matcher; istemcinin multipart ve hata davranışı |
| Sistem | gerçek imajlar: sayfalar, hesap, işlem, görsel, izolasyon, yeniden başlatmada kalıcılık, silme |

CI'da hepsi her push'ta çalışır (`.github/workflows/security.yml`).

## Bakım araçları

`api/.env` içindeki `DATABASE_URL` kullanılır.

```bash
cd api
go run ./cmd/migrate   # şemayı uygula (API açılışta zaten yapıyor)
go run ./cmd/smoke     # tüm rapor sorgularını DB'ye karşı dener
```

`smoke` rastgele bir kullanıcı kimliğiyle çalışır — veri yazmaz, yalnız sorguların
geçerliliğini doğrular. Rapor SQL'i değiştirildiğinde çalıştır.

Şemaya değişiklik eklerken `schema.sql` idempotent kalmalı (`if not exists`,
`create or replace`): her açılışta yeniden çalışır.

## Uçlar

Tarayıcı bunlara web'in `/api` yolundan ulaşır. `/auth/*` dışındakiler oturum
çerezi (ya da `Authorization: Bearer <jeton>`) ister.

```
GET    /healthz

GET    /api/v1/auth/providers    POST /api/v1/auth/signup     POST /api/v1/auth/login
POST   /api/v1/auth/logout       GET  /api/v1/auth/google/start?next=
GET    /api/v1/auth/google/callback

GET    /api/v1/me
GET    /api/v1/meta/distinct
GET    /api/v1/files/{bucket}/{user_id}/{sahip_id}/{dosya}

GET    /api/v1/funds/            POST /api/v1/funds/
POST   /api/v1/funds/seed        PUT  /api/v1/funds/{id}      DELETE /api/v1/funds/{id}

GET    /api/v1/platforms/        POST /api/v1/platforms/
POST   /api/v1/platforms/seed    DELETE /api/v1/platforms/{id}

GET    /api/v1/trades/           POST /api/v1/trades/
GET    /api/v1/trades/{id}       PUT  /api/v1/trades/{id}     DELETE /api/v1/trades/{id}
GET    /api/v1/trades/{id}/screenshots
POST   /api/v1/trades/{id}/screenshots      (multipart: phase, caption, file)
DELETE /api/v1/screenshots/{id}

POST   /api/v1/lessons/{id}/images          (multipart: file)

GET    /api/v1/stats/summary
GET    /api/v1/stats/series?bucket=day|week|month|quarter|halfyear|year
GET    /api/v1/stats/breakdown?by=setup|symbol|emotion_before|mistake|weekday|...
```

Ortak süzgeç: `from`, `to`, `fund_id`, `platform_id`, `status`, `symbol`,
`asset_class`, `direction`, `setup`, `currency`, `q`, `limit`, `offset`.

## Sorun giderme

| Belirti | Sebep |
|---|---|
| API açılmıyor, `veritabanına erişilemedi` | `DATABASE_URL` yanlış ya da Postgres ayakta değil |
| Giriş denemesi `API'ye ulaşılamadı` | Web API'yi bulamıyor: `API_INTERNAL_URL` yanlış ya da API kapalı |
| Girişten sonra yine giriş sayfası | `APP_URL` https ama site http'den açılıyor: Secure çerez yazılmaz |
| `İstek kaynağı kabul edilmedi` (403) | Tarayıcıdaki adres `APP_URL` / `ALLOWED_ORIGINS` ile aynı değil |
| Google `redirect_uri_mismatch` | Console'daki redirect URI `<APP_URL>/api/v1/auth/google/callback` değil |
| Görseller kayboldu | `uploads` volume'u bağlı değil ya da yeniden oluşturulmuş |

## Lisans

Kişisel kullanım için yazıldı. Fork'layıp kendi işlem günlüğün olarak kullanabilirsin.
