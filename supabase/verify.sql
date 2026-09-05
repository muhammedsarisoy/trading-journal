-- Şemanın beklenen halde olduğunu doğrular (migrate aracıyla çalıştırılır).
do $$
declare
  missing text;
begin
  select string_agg(c, ', ')
    into missing
    from unnest(array['pnl_override','risk_manual','r_manual','pnl','risk_amount','status']) as c
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'trades' and column_name = c
   );

  if missing is not null then
    raise exception 'trades tablosunda eksik sütun: %', missing;
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'trades_enriched'
       and column_name = 'r_multiple'
  ) then
    raise exception 'trades_enriched görünümünde r_multiple yok';
  end if;

  raise notice 'sema dogrulandi';
end $$;
