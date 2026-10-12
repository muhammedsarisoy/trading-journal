-- =====================================================================
-- Trading Journal — PostgreSQL şeması
--
-- API açılışta bu dosyayı kendiliğinden uygular (AUTO_MIGRATE=false ile
-- kapatılabilir). Elle: cd api && go run ./cmd/migrate
--
-- Tekrar çalıştırılabilir (idempotent). Yeni bir değişiklik eklerken de bu
-- kurala uy: "if not exists", "create or replace", "drop ... if exists".
--
-- Satır düzeyi yetki API'de: her sorgu user_id ile süzülür. Veritabanına
-- yalnız API bağlanır, dışarıya açık değildir.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------
-- 1. Kullanıcılar ve oturumlar
-- ---------------------------------------------------------------------
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  password_hash text,                                 -- bcrypt; yalnız Google ile girenlerde boş
  google_sub    text unique,                          -- Google hesabının değişmez kimliği
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

-- Çerezdeki jetonun kendisi değil, SHA-256 özeti saklanır: veritabanı
-- sızsa bile oturumlar ele geçirilemez.
create table if not exists public.sessions (
  token_hash bytea primary key,
  user_id    uuid not null references public.users on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text
);

create index if not exists sessions_user_idx    on public.sessions (user_id);
create index if not exists sessions_expires_idx on public.sessions (expires_at);

-- ---------------------------------------------------------------------
-- 2. Profil
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references public.users on delete cascade,
  display_name  text,
  base_currency text not null default 'USD',
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Fonlar / hesaplar  ("hangi fondan aldım")
-- ---------------------------------------------------------------------
create table if not exists public.funds (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users on delete cascade,
  name             text not null,
  broker           text,
  currency         text not null default 'USD',
  starting_balance numeric(18,2) not null default 0,
  is_prop          boolean not null default false,   -- prop firma hesabı mı
  is_active        boolean not null default true,
  note             text,
  created_at       timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------------------------------------------------------------------
-- 4. Platformlar  ("hangi platformdan aldım")
-- ---------------------------------------------------------------------
create table if not exists public.platforms (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------------------------------------------------------------------
-- 5. İşlemler
-- ---------------------------------------------------------------------
create table if not exists public.trades (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users on delete cascade,
  fund_id       uuid references public.funds     on delete set null,
  platform_id   uuid references public.platforms on delete set null,

  -- Enstrüman
  symbol        text not null,
  asset_class   text not null default 'forex'
                check (asset_class in ('forex','crypto','stock','futures','commodity','index','option')),
  direction     text not null default 'long' check (direction in ('long','short')),
  currency      text not null default 'USD',

  -- Zaman
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  timeframe     text,

  -- Sonuç
  -- Günlük akışı elle net tutar girmeye dayanır; pnl_override asıl kaynaktır.
  pnl_override  numeric(18,4),
  risk_manual   numeric(18,4),                      -- riske edilen tutar
  r_manual      numeric(12,4),                      -- kazanılan R (doğrudan girilir)

  -- Fiyat / boyut — isteğe bağlı. Doldurulursa K/Z ve risk bunlardan hesaplanır.
  entry_price   numeric(20,8),
  exit_price    numeric(20,8),
  stop_loss     numeric(20,8),
  take_profit   numeric(20,8),
  quantity      numeric(20,8),
  quantity_unit text default 'unit'
                check (quantity_unit in ('lot','contract','share','coin','unit')),
  contract_size numeric(20,8) default 1,            -- 1 birimin sözleşme çarpanı
  leverage      numeric(10,2),
  fees          numeric(18,4) not null default 0,   -- komisyon (pozitif = maliyet)
  swap          numeric(18,4) not null default 0,   -- swap/funding (işaretli)

  -- Karar gerekçesi  ("neye göre aldım / nelere baktım")
  setup         text,                               -- strateji adı
  reason        text,                               -- giriş gerekçesi (serbest metin)
  confluences   text[] not null default '{}',       -- bakılan teyitler (etiket listesi)
  tags          text[] not null default '{}',

  -- Psikoloji
  emotion_before text,
  emotion_after  text,
  confidence     smallint check (confidence between 1 and 5),
  stress         smallint check (stress between 1 and 5),
  followed_plan  boolean,
  mistakes       text[] not null default '{}',
  lesson         text,
  notes          text,

  -- Türetilmiş alanlar
  -- Net tutar girildiyse ya da çıkış fiyatı varsa işlem kapalı sayılır.
  status        text generated always as (
                  case when pnl_override is null and r_manual is null and exit_price is null
                       then 'open' else 'closed' end
                ) stored,

  pnl           numeric(24,8) generated always as (
                  coalesce(
                    pnl_override,
                    r_manual * risk_manual,
                    case
                      when exit_price is null or entry_price is null or quantity is null
                        then null
                      else (case when direction = 'long' then 1 else -1 end)
                           * (exit_price - entry_price) * quantity * coalesce(contract_size, 1)
                           - fees + swap
                    end
                  )
                ) stored,

  risk_amount   numeric(24,8) generated always as (
                  coalesce(
                    risk_manual,
                    case
                      when stop_loss is null or entry_price is null or quantity is null
                        then null
                      else abs(entry_price - stop_loss) * quantity * coalesce(contract_size, 1)
                    end
                  )
                ) stored,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint trades_close_needs_time check (exit_price is null or closed_at is not null)
);

create index if not exists trades_user_opened_idx on public.trades (user_id, opened_at desc);
create index if not exists trades_user_status_idx on public.trades (user_id, status);
create index if not exists trades_user_symbol_idx on public.trades (user_id, symbol);
create index if not exists trades_fund_idx        on public.trades (fund_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trades_touch_updated_at on public.trades;
create trigger trades_touch_updated_at
  before update on public.trades
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 6. İşlem ekran görüntüleri
--    Dosya diskte: <UPLOAD_DIR>/trade-screenshots/<user_id>/<trade_id>/<dosya>
-- ---------------------------------------------------------------------
create table if not exists public.trade_screenshots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users on delete cascade,
  trade_id   uuid not null references public.trades on delete cascade,
  path       text not null,
  caption    text,
  phase      text not null default 'entry' check (phase in ('entry','exit','analysis')),
  created_at timestamptz not null default now()
);

create index if not exists screenshots_trade_idx on public.trade_screenshots (trade_id);

-- ---------------------------------------------------------------------
-- 7. Zenginleştirilmiş görünüm — liste/rapor sorguları tek yerden
-- ---------------------------------------------------------------------
drop view if exists public.trades_enriched;
create view public.trades_enriched as
select
  t.*,
  f.name     as fund_name,
  f.currency as fund_currency,
  p.name     as platform_name,
  coalesce(
    t.r_manual,
    case
      when t.risk_amount is null or t.risk_amount = 0 or t.pnl is null then null
      else round(t.pnl / t.risk_amount, 4)
    end
  ) as r_multiple
from public.trades t
-- user_id da eşleşmeli: başka kullanıcının hesap/platform adı hiç görünmesin.
left join public.funds     f on f.id = t.fund_id     and f.user_id = t.user_id
left join public.platforms p on p.id = t.platform_id and p.user_id = t.user_id;

-- ---------------------------------------------------------------------
-- 8. Eğitim defteri
--    courses → lessons (gün) → lesson_notes (metin + grafik görseli)
-- ---------------------------------------------------------------------
create table if not exists public.courses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users on delete cascade,
  title       text not null,
  instructor  text,                                  -- eğitmen / kanal
  url         text,                                  -- oynatma listesi ya da kurs adresi
  description text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists courses_user_idx on public.courses (user_id, created_at desc);

create table if not exists public.lessons (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users on delete cascade,
  course_id    uuid not null references public.courses on delete cascade,
  day_no       integer,                              -- serideki sıra ("Gün 3")
  title        text not null,
  video_url    text,
  studied_on   date,                                 -- hangi gün çalıştım
  duration_min integer,
  summary      text,
  tags         text[] not null default '{}',
  completed    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists lessons_course_idx on public.lessons (course_id, day_no, created_at);
create index if not exists lessons_user_idx   on public.lessons (user_id, studied_on desc);

-- Görsel dosyası diskte: <UPLOAD_DIR>/lesson-images/<user_id>/<lesson_id>/<dosya>
create table if not exists public.lesson_notes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users on delete cascade,
  lesson_id     uuid not null references public.lessons on delete cascade,
  sort_order    integer not null default 0,
  heading       text,
  body          text,
  image_path    text,
  image_side    text not null default 'right' check (image_side in ('left','right')),
  timestamp_sec integer check (timestamp_sec >= 0),  -- videodaki an
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists lesson_notes_lesson_idx on public.lesson_notes (lesson_id, sort_order, created_at);

drop trigger if exists courses_touch_updated_at on public.courses;
create trigger courses_touch_updated_at
  before update on public.courses
  for each row execute function public.touch_updated_at();

drop trigger if exists lessons_touch_updated_at on public.lessons;
create trigger lessons_touch_updated_at
  before update on public.lessons
  for each row execute function public.touch_updated_at();

drop trigger if exists lesson_notes_touch_updated_at on public.lesson_notes;
create trigger lesson_notes_touch_updated_at
  before update on public.lesson_notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 9. Prop firma harcamaları
--    fee    challenge / hesap ücreti (harcama)
--    payout firmadan alınan ödeme
--    refund ilk payout'la iade edilen challenge ücreti
--    Net = payout + refund − fee. Tutar her zaman pozitif; yönü kind belirler.
-- ---------------------------------------------------------------------
create table if not exists public.prop_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users on delete cascade,
  kind         text not null check (kind in ('fee','payout','refund')),
  firm         text not null,
  amount       numeric(18,2) not null check (amount > 0),
  currency     text not null default 'USD',
  occurred_on  date not null default current_date,
  account_size numeric(18,2) check (account_size > 0),   -- ücret için: 100000 gibi
  fund_id      uuid references public.funds on delete set null,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists prop_tx_user_date_idx on public.prop_transactions (user_id, occurred_on desc, created_at desc);

-- Liste görünümü — gün ve not sayıları tek sorguda
drop view if exists public.courses_enriched;
create view public.courses_enriched as
select
  c.*,
  l.lesson_count,
  l.completed_count,
  n.note_count,
  l.last_studied_on
from public.courses c
left join lateral (
  select
    count(*)::int                              as lesson_count,
    count(*) filter (where les.completed)::int as completed_count,
    max(les.studied_on)                        as last_studied_on
  from public.lessons les
  where les.course_id = c.id
) l on true
left join lateral (
  select count(*)::int as note_count
  from public.lesson_notes ln
  join public.lessons les on les.id = ln.lesson_id
  where les.course_id = c.id
) n on true;

-- Bitti.
