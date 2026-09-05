-- =====================================================================
-- 002 — İşlem formunun sadeleştirilmesi
--
-- Fiyat/miktar alanları isteğe bağlı hale gelir; kâr-zarar artık elle
-- girilen net tutardan (pnl_override) okunur. Sütunlar SİLİNMEZ — eski
-- hesaplama yolu, alanlar doldurulduğunda çalışmaya devam eder.
--
-- Yeni: risk_manual — R katsayısını yaşatmak için doğrudan risk tutarı.
--
-- Çalıştırma: Supabase SQL Editor'e yapıştır > Run. Tekrar çalıştırılabilir.
-- =====================================================================

-- Görünüm t.* kullandığı için sütun değişiminden önce düşürülmeli.
drop view if exists public.trades_enriched;

-- 1. Zorunluluğu kalkan alanlar
alter table public.trades alter column entry_price   drop not null;
alter table public.trades alter column quantity      drop not null;
alter table public.trades alter column quantity_unit drop not null;
alter table public.trades alter column contract_size drop not null;

-- 2. Doğrudan risk tutarı (stop mesafesi hesaplanamadığında kullanılır)
alter table public.trades add column if not exists risk_manual numeric(18,4);

-- 3. Türetilmiş sütunlar yeniden tanımlanır.
--    Postgres generated column'u yerinde değiştirmeye izin vermiyor.
alter table public.trades drop column if exists status;
alter table public.trades drop column if exists pnl;
alter table public.trades drop column if exists risk_amount;

-- Kapalı sayılma kuralı: net tutar girilmişse ya da çıkış fiyatı varsa.
alter table public.trades
  add column status text generated always as (
    case when pnl_override is null and exit_price is null then 'open' else 'closed' end
  ) stored;

-- Elle girilen net tutar önceliklidir; yoksa eski formül (alanlar doluysa).
alter table public.trades
  add column pnl numeric(24,8) generated always as (
    coalesce(
      pnl_override,
      case
        when exit_price is null or entry_price is null or quantity is null then null
        else (case when direction = 'long' then 1 else -1 end)
             * (exit_price - entry_price) * quantity * coalesce(contract_size, 1)
             - fees + swap
      end
    )
  ) stored;

-- Risk: elle girilen tutar, yoksa stop mesafesinden.
alter table public.trades
  add column risk_amount numeric(24,8) generated always as (
    coalesce(
      risk_manual,
      case
        when stop_loss is null or entry_price is null or quantity is null then null
        else abs(entry_price - stop_loss) * quantity * coalesce(contract_size, 1)
      end
    )
  ) stored;

-- 4. status düşürülünce indeksi de gitti.
create index if not exists trades_user_status_idx on public.trades (user_id, status);

-- 5. Görünüm yeniden kurulur.
create view public.trades_enriched
with (security_invoker = true) as
select
  t.*,
  f.name     as fund_name,
  f.currency as fund_currency,
  p.name     as platform_name,
  case
    when t.risk_amount is null or t.risk_amount = 0 or t.pnl is null then null
    else round(t.pnl / t.risk_amount, 4)
  end as r_multiple
from public.trades t
left join public.funds     f on f.id = t.fund_id
left join public.platforms p on p.id = t.platform_id;
