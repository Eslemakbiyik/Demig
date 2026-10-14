-- Onaylanan toplantı görevlerinde durum ve yorum alanları.
-- Supabase > SQL Editor'de bir kez çalıştırın.
alter table public.meeting_action_items add column if not exists todo_status text default 'Başlamadı';
alter table public.meeting_action_items add column if not exists comments jsonb default '[]'::jsonb;
