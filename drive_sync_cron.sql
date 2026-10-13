-- Her Perşembe 12:00 (İstanbul = 09:00 UTC) sync-drive-todos fonksiyonunu çağırır.
-- Hazır doldurulmuş: proje ref ve anahtar dahil. Olduğu gibi çalıştırın.

-- 1) Eklentileri aç (panelden açtıysanız bu satırlar zararsızdır)
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- 2) Varsa eski zamanlamayı kaldır (hata vermez)
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'sync-drive-todos';
end $$;

-- 3) Zamanlama
select cron.schedule(
  'sync-drive-todos',
  '0 9 * * 4',
  $$ select net.http_post(
       url := 'https://wdenbvysepcbobtebdgc.supabase.co/functions/v1/sync-drive-todos',
       headers := jsonb_build_object(
         'Authorization', 'Bearer sb_publishable_JH3FBrGXq0H3AIqwWBhctg_EvM0Sb6c',
         'Content-Type', 'application/json'),
       body := '{}'::jsonb
     ) $$
);
