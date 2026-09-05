# Trading Journal

Kişisel işlem günlüğü. Her işlemi **R cinsinden** kaydedersin; uygulama kâr-zararını,
kararlarını ve o anki psikolojini birlikte tutar, günlük/haftalık/aylık/6 aylık
grafiklerle gösterir.

Form bilerek kısa: fiyat-miktar matematiği yerine **riske ettiğin tutar** ve
**kazandığın R** girilir, gerisi hesaplanır.

| Katman | Teknoloji |
|---|---|
| `web/` | Next.js 16 · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Recharts |
| `api/` | Go 1.25 · chi · pgx · Supabase JWT doğrulama |
| `supabase/` | Postgres şeması, RLS politikaları, Storage bucket'ı |

Akış: **Next → Supabase Auth** (giriş/JWT) · **Next → Go API** (tüm veri) ·
**Next → Supabase Storage** (ekran görüntüleri, RLS klasör politikasıyla).

---

## Bu repoyu kendin için kurmak

> Depoda **hiçbir anahtar yok**. `.env` dosyaları git dışıdır. Kendi Supabase
> projeni açıp kendi anahtarlarını gireceksin; veriler senin projende durur.

### Gerekenler

**Docker ile (önerilen)** — başka bir şey kurmana gerek yok:
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

**Docker'sız:**
- [Node.js 22+](https://nodejs.org)
- [Go 1.25+](https://go.dev/dl/)

Her iki yolda da bir [Supabase](https://supabase.com) hesabı gerekir (ücretsiz katman yeter).

### 1. Depoyu al

```bash
git clone https://github.com/muhammedsarisoy/trading-journal.git
cd trading-journal
```

### 2. Supabase projesini hazırla

1. [supabase.com](https://supabase.com) → **New project**. Kurulumda verilen
   **veritabanı parolasını kaydet**, bir daha gösterilmiyor.
2. Sol menü **SQL Editor** → `supabase/schema.sql` dosyasının tamamını yapıştır → **Run**.
   Tablolar, RLS politikaları, `trade-screenshots` bucket'ı ve `trades_enriched`
   görünümü oluşur. Dosya idempotenttir, tekrar çalıştırılabilir.
3. Şemayı daha önce kurduysan `supabase/migrations/` altındakileri numara sırasına
   göre çalıştır.

### 3. Anahtarları topla

**Settings → API Keys**

| Alan | Değer |
|---|---|
| Project URL | `https://<proje-ref>.supabase.co` |
| Publishable key | `sb_publishable_...` (eski projelerde `anon` `public`, `eyJhbGci...`) |

> **Secret / `service_role` anahtarını hiçbir yere yazma.** RLS'i tamamen bypass
> eder. `NEXT_PUBLIC_` önekli her değer tarayıcıya gönderilen pakete gömülür,
> yani o anahtarı oraya koyarsan siteyi açan herkes tüm veriyi okuyup silebilir.
> Derleme bunu yakalayıp durdurur, ama en baştan yapma.

**Settings → Database → Connect → Session pooler** → bağlantı dizesini kopyala.
`[YOUR-PASSWORD]` yerine 1. adımdaki veritabanı parolanı yaz.

> Transaction pooler (port 6543) değil, **Session pooler (5432)** — pgx prepared
> statement kullanıyor, transaction pooler bunu desteklemiyor.

### 4. Ortam dosyalarını doldur

```bash
cp api/.env.example api/.env
cp web/.env.example web/.env.local
```

`api/.env`:
```bash
DATABASE_URL=postgresql://postgres.<ref>:<parola>@aws-0-<bolge>.pooler.supabase.com:5432/postgres
SUPABASE_JWKS_URL=https://<ref>.supabase.co/auth/v1/.well-known/jwks.json
```

`web/.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### 5. Çalıştır

**Docker:**
```bash
docker compose --env-file web/.env.local up -d --build
```

**Docker'sız:**
```bash
cd api  && go run ./cmd/server     # :8080
cd web  && npm install && npm run dev   # :3000
```

### 6. İlk kullanım

1. http://localhost:3000 → **Kayıt ol**
2. E-posta doğrulaması açıksa gelen kutunu kontrol et. Kapatmak için:
   Supabase → Authentication → Sign In / Providers → Email → **Confirm email** kapalı
3. **Ayarlar** → hesap tanımla ("Hazır listeyi ekle" ile tek tıkla birkaç tane gelir)
4. **Yeni İşlem** → ilk kaydı gir

---

## Neler var

- **İşlem:** sembol, yön, tarih, fon/hesap, enstrüman sınıfı, zaman dilimi
- **Sonuç:** riske edilen tutar, kazanılan R, net kâr/zarar — R ile para arasında
  iki yönlü çevrim
- **Neye göre aldım:** strateji, giriş gerekçesi, baktığın teyitlerin listesi, etiketler
- **Psikoloji:** işlem öncesi/sonrası duygu, güven ve stres düzeyi (1-5), plana uyum,
  yapılan hatalar, çıkarılan ders
- **Ekran görüntüleri:** giriş/çıkış/analiz aşamalarına göre, özel bucket + imzalı bağlantı
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

- Her tablo RLS altında; politika `user_id = auth.uid()`
- Go tarafında da her sorgu `user_id` ile sınırlanır — iki bağımsız katman
- JWT doğrulaması JWKS (ES256/RS256) veya legacy HS256; `role` ve `aud` alanları
  denetlenir, `anon` ve `service_role` jetonları reddedilir
- Storage yolu `<user_id>/<trade_id>/<dosya>`; bucket özel, görüntüleme imzalı
  bağlantıyla. API yolun kullanıcının kendi klasöründe kaldığını doğrular
- Kâr/zarar ve R hesabı veritabanında generated column — istemci ezemez
- İstek gövdesi 1 MiB ile sınırlı; container'lar root olmayan kullanıcıyla çalışır
- Secret koda yazılmaz; `.env` / `.env.local` git dışıdır ve `.dockerignore`
  sayesinde imaja da kopyalanmaz

## Bakım araçları

Docker veya `psql` gerektirmez; `api/.env` içindeki `DATABASE_URL`'i kullanır.

```bash
cd api
go run ./cmd/migrate                        # supabase/migrations/*.sql sırayla
go run ./cmd/migrate ../supabase/verify.sql # şema beklenen halde mi
go run ./cmd/smoke                          # tüm rapor sorgularını DB'ye karşı dener
```

`smoke` rastgele bir kullanıcı kimliğiyle çalışır — veri yazmaz, yalnız sorguların
geçerliliğini doğrular. Rapor SQL'i değiştirildiğinde çalıştır.

## Uçlar

Hepsi `Authorization: Bearer <supabase-access-token>` ister.

```
GET    /healthz
GET    /api/v1/me
GET    /api/v1/meta/distinct

GET    /api/v1/funds/            POST /api/v1/funds/
POST   /api/v1/funds/seed        PUT  /api/v1/funds/{id}      DELETE /api/v1/funds/{id}

GET    /api/v1/platforms/        POST /api/v1/platforms/
POST   /api/v1/platforms/seed    DELETE /api/v1/platforms/{id}

GET    /api/v1/trades/           POST /api/v1/trades/
GET    /api/v1/trades/{id}       PUT  /api/v1/trades/{id}     DELETE /api/v1/trades/{id}
GET    /api/v1/trades/{id}/screenshots
POST   /api/v1/trades/{id}/screenshots
DELETE /api/v1/screenshots/{id}

GET    /api/v1/stats/summary
GET    /api/v1/stats/series?bucket=day|week|month|quarter|halfyear|year
GET    /api/v1/stats/breakdown?by=setup|symbol|emotion_before|mistake|weekday|...
```

Ortak süzgeç: `from`, `to`, `fund_id`, `platform_id`, `status`, `symbol`,
`asset_class`, `direction`, `setup`, `currency`, `q`, `limit`, `offset`.

## Sorun giderme

| Belirti | Sebep |
|---|---|
| Kayıt olurken `401 Invalid API key` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` yanlış ya da placeholder. Düzeltip **yeniden derle** — `NEXT_PUBLIC_*` derleme anında pakete gömülür |
| API açılmıyor, `veritabanına erişilemedi` | `DATABASE_URL` yanlış, parola hatalı ya da Direct connection kullanılmış (IPv6 ister). Session pooler kullan |
| Panel boş, istekler `401` | Jeton süresi dolmuş; çıkış yapıp tekrar gir |
| Tablolar yok hatası | `supabase/schema.sql` çalıştırılmamış |
| Docker derlemesi `NEXT_PUBLIC_... zorunlu` diyor | `--env-file web/.env.local` bayrağı unutulmuş |

## Lisans

Kişisel kullanım için yazıldı. Fork'layıp kendi işlem günlüğün olarak kullanabilirsin.
