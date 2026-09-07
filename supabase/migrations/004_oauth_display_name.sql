-- =====================================================================
-- 004 — OAuth ile gelen kullanıcıların görünen adı
--
-- Parola ile kayıtta görünen adı biz 'display_name' anahtarıyla yazıyoruz.
-- Google gibi sağlayıcılar ise adı 'full_name' / 'name' anahtarında
-- gönderiyor; eski hâlde bu kullanıcıların adı e-postanın baş kısmına
-- düşüyordu. Sıralama: kendi alanımız > sağlayıcının alanı > e-posta.
--
-- Tekrar çalıştırılabilir (create or replace).
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;
