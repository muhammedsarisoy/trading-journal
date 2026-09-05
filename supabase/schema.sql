-- =====================================================================
-- Trader Journal — Supabase şeması
-- Çalıştırma: Supabase panel > SQL Editor > bu dosyanın tamamını yapıştır > Run
-- Tekrar çalıştırılabilir (idempotent).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Profil
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text,
  base_currency text not null default 'USD',
  created_at    timestamptz not null default now()
);

-- Yeni kullanıcı kaydolunca profil satırı otomatik açılır.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. Fonlar / hesaplar  ("hangi fondan aldım")
-- ---------------------------------------------------------------------
create table if not exists public.funds (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users on delete cascade,
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
-- 3. Platformlar  ("hangi platformdan aldım")
-- ---------------------------------------------------------------------
create table if not exists public.platforms (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------------------------------------------------------------------
-- 4. İşlemler
-- ---------------------------------------------------------------------
create table if not exists public.trades (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
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
-- 5. İşlem ekran görüntüleri
--    Dosya yolu: trade-screenshots/<user_id>/<trade_id>/<dosya>
-- ---------------------------------------------------------------------
create table if not exists public.trade_screenshots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  trade_id   uuid not null references public.trades on delete cascade,
  path       text not null,
  caption    text,
  phase      text not null default 'entry' check (phase in ('entry','exit','analysis')),
  created_at timestamptz not null default now()
);

create index if not exists screenshots_trade_idx on public.trade_screenshots (trade_id);

-- ---------------------------------------------------------------------
-- 6. RLS — her kullanıcı yalnız kendi satırını görür
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.funds             enable row level security;
alter table public.platforms         enable row level security;
alter table public.trades            enable row level security;
alter table public.trade_screenshots enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists funds_own on public.funds;
create policy funds_own on public.funds
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists platforms_own on public.platforms;
create policy platforms_own on public.platforms
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists trades_own on public.trades;
create policy trades_own on public.trades
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists screenshots_own on public.trade_screenshots;
create policy screenshots_own on public.trade_screenshots
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 7. Storage — özel bucket + klasör bazlı RLS
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trade-screenshots', 'trade-screenshots', false, 10485760,
        array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists screenshot_objects_own on storage.objects;
create policy screenshot_objects_own on storage.objects
  for all
  using (
    bucket_id = 'trade-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'trade-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------
-- 8. Zenginleştirilmiş görünüm — liste/rapor sorguları tek yerden
-- ---------------------------------------------------------------------
drop view if exists public.trades_enriched;
create view public.trades_enriched
with (security_invoker = true) as
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
left join public.funds     f on f.id = t.fund_id
left join public.platforms p on p.id = t.platform_id;

-- Bitti.
