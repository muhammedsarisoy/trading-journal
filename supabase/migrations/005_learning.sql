-- =====================================================================
-- 005 — Eğitim defteri
--
-- Üç katman:
--   courses       bir eğitim serisi / kurs
--   lessons       serinin bir günü (video + özet)
--   lesson_notes  gün içindeki not blokları (metin + grafik görseli)
--
-- Not bloğu ikiye bölünür: bir yanda grafiğin ekran görüntüsü, öbür
-- yanda o grafiğe dair not. image_side hangi yanın görsel olduğunu tutar.
--
-- Çalıştırma: Supabase SQL Editor > yapıştır > Run. Tekrar çalıştırılabilir.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Eğitim serisi
-- ---------------------------------------------------------------------
create table if not exists public.courses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  title       text not null,
  instructor  text,                                  -- eğitmen / kanal
  url         text,                                  -- oynatma listesi ya da kurs adresi
  description text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists courses_user_idx on public.courses (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Gün / ders
-- ---------------------------------------------------------------------
create table if not exists public.lessons (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
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

-- ---------------------------------------------------------------------
-- Not bloğu
-- Görsel dosyası Storage'ta: lesson-images/<user_id>/<lesson_id>/<dosya>
-- ---------------------------------------------------------------------
create table if not exists public.lesson_notes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
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

-- ---------------------------------------------------------------------
-- updated_at tetikleyicileri (fonksiyon 001'de tanımlı)
-- ---------------------------------------------------------------------
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
-- RLS
-- ---------------------------------------------------------------------
alter table public.courses      enable row level security;
alter table public.lessons      enable row level security;
alter table public.lesson_notes enable row level security;

drop policy if exists courses_own on public.courses;
create policy courses_own on public.courses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists lessons_own on public.lessons;
create policy lessons_own on public.lessons
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists lesson_notes_own on public.lesson_notes;
create policy lesson_notes_own on public.lesson_notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Storage — ders görselleri için özel bucket
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lesson-images', 'lesson-images', false, 10485760,
        array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists lesson_image_objects_own on storage.objects;
create policy lesson_image_objects_own on storage.objects
  for all
  using (
    bucket_id = 'lesson-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'lesson-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------
-- Liste görünümü — gün ve not sayıları tek sorguda
-- ---------------------------------------------------------------------
drop view if exists public.courses_enriched;
create view public.courses_enriched
with (security_invoker = true) as
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
