-- =====================================================================
-- DEMIG · Haftalık toplantı güncellemeleri (Toplantılar > Güncellemeler / Rapor)
-- Supabase > SQL Editor'de BİR KEZ çalıştırın. Tekrar çalıştırmak zararsızdır.
-- =====================================================================

create table if not exists public.meeting_updates (
  id            uuid primary key default gen_random_uuid(),
  week_date     date not null,                 -- toplantı tarihi (Çarşamba)
  person_id     text not null,                 -- people.id  ('_pm' = yöneticinin düzenlediği gündem mesajı)
  track_id      text not null,                 -- other_side | expert_survey | synthetic_agents | model_dev | full_group | _agenda
  done_text     text,                          -- Bu hafta yaptıklarım
  next_text     text,                          -- Sıradaki adımlarım (her satır bir to-do)
  agenda_text   text,                          -- Toplantıda konuşulsun (her satır bir gündem maddesi) / WhatsApp metni
  blockers      text,                          -- Engel / destek ihtiyacı
  no_agenda     boolean not null default false,-- "Bu oturuma gerek yok / özel maddem yok"
  todos_sent_at timestamptz,                   -- sıradaki adımlar to-do'ya aktarıldığında dolar
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (week_date, person_id, track_id)
);

create index if not exists meeting_updates_week_idx on public.meeting_updates (week_date);

alter table public.meeting_updates enable row level security;

-- Yazma yetkisi: kişi yalnızca kendi kaydını; yöneticiler (p1 Tahir, p2 Eslem) herkesinkini.
-- Giriş yapan kullanıcı, e-postası üzerinden people tablosundaki kaydıyla eşleştirilir.
create or replace function public.demig_can_write_update(pid text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.people p
    where lower(trim(p.email)) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and (p.id = pid or p.id in ('p1', 'p2'))
  );
$$;

drop policy if exists "meeting_updates_read"   on public.meeting_updates;
drop policy if exists "meeting_updates_insert" on public.meeting_updates;
drop policy if exists "meeting_updates_update" on public.meeting_updates;
drop policy if exists "meeting_updates_delete" on public.meeting_updates;

-- Giriş yapmış herkes tüm güncellemeleri okuyabilir (rapor ekip içinde ortak).
create policy "meeting_updates_read" on public.meeting_updates
  for select to authenticated using (true);

create policy "meeting_updates_insert" on public.meeting_updates
  for insert to authenticated with check (public.demig_can_write_update(person_id));

create policy "meeting_updates_update" on public.meeting_updates
  for update to authenticated
  using (public.demig_can_write_update(person_id))
  with check (public.demig_can_write_update(person_id));

create policy "meeting_updates_delete" on public.meeting_updates
  for delete to authenticated using (public.demig_can_write_update(person_id));
