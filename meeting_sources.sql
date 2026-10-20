-- Toplantı notu kaynakları (Google Doc / Sheet linkleri). Cuma 09:00 senkronu buradaki aktif kaynakların hepsini çeker.
-- Supabase SQL Editor'de çalıştırın. Tekrar çalıştırmak güvenlidir.
create table if not exists public.meeting_sources (
  id uuid primary key default gen_random_uuid(),
  label text,
  url text not null unique,
  active boolean not null default true,
  created_at timestamptz default now()
);
alter table public.meeting_sources enable row level security;
drop policy if exists "meeting_sources_all" on public.meeting_sources;
create policy "meeting_sources_all" on public.meeting_sources for all to authenticated using (true) with check (true);

-- Mevcut DEMIG toplantı notları dokümanını ilk kaynak olarak ekle
insert into public.meeting_sources (label, url)
values ('DEMIG Toplantı Notları', 'https://docs.google.com/document/d/1j7LOlgUqwCC1Of001aciPP8Z0eWIkLQa/edit')
on conflict (url) do nothing;
