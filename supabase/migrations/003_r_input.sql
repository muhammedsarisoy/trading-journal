-- =====================================================================
-- 003 — R doğrudan girilebilir
--
-- Yeni sütun: r_manual ("kazandığım R"). Artık iki yönlü çalışır:
--   risk + R      girilirse  →  K/Z   = R × risk
--   risk + K/Z    girilirse  →  R     = K/Z ÷ risk
-- İkisi de girilirse ikisi de olduğu gibi saklanır.
--
-- Çalıştırma: Supabase SQL Editor > yapıştır > Run. Tekrar çalıştırılabilir.
-- =====================================================================

drop view if exists public.trades_enriched;

alter table public.trades add column if not exists r_manual numeric(12,4);

-- pnl: elle net tutar > (R × risk) > eski fiyat formülü
alter table public.trades drop column if exists pnl;
alter table public.trades
  add column pnl numeric(24,8) generated always as (
    coalesce(
      pnl_override,
      r_manual * risk_manual,
      case
        when exit_price is null or entry_price is null or quantity is null then null
        else (case when direction = 'long' then 1 else -1 end)
             * (exit_price - entry_price) * quantity * coalesce(contract_size, 1)
             - fees + swap
      end
    )
  ) stored;

-- Sadece R girilmiş işlem de kapalı sayılmalı.
alter table public.trades drop column if exists status;
alter table public.trades
  add column status text generated always as (
    case when pnl_override is null and r_manual is null and exit_price is null
         then 'open' else 'closed' end
  ) stored;

create index if not exists trades_user_status_idx on public.trades (user_id, status);

-- r_multiple: elle girilen R öncelikli, yoksa K/Z ÷ risk
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
