-- Her Perşembe 12:00 (İstanbul = 09:00 UTC) sync-drive-todos fonksiyonunu çağırır.
-- Önce Supabase > Database > Extensions bölümünden pg_cron ve pg_net'i etkinleştirin.
-- <PROJE-REF> ve <ANON-KEY> yerlerini doldurun (ANON-KEY: Project Settings > API).
select cron.unschedule('sync-drive-todos') where exists (select 1 from cron.job where jobname = 'sync-drive-todos');
select cron.schedule(
  'sync-drive-todos',
  '0 9 * * 4',
  $$ select net.http_post(
       url := 'https://<PROJE-REF>.supabase.co/functions/v1/sync-drive-todos',
       headers := jsonb_build_object('Authorization', 'Bearer <ANON-KEY>', 'Content-Type', 'application/json'),
       body := '{}'::jsonb
     ) $$
);
