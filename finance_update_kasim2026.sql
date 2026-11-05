-- =====================================================================
-- DEMİG FİNANS — EKİM/KASIM 2026 GÜNCELLEMESİ
-- Kaynak: "DEMİG_Hizmet alımı takip" E-Tablosu ("Proje Odenek Aylık toplam gider"
-- sekmesi: 15 Eylül 2026'dan sonraki hareketler + personel aylık tablosu).
-- finance_seed_data.sql'den SONRA, Supabase SQL Editor'de çalıştırın.
-- Tekrar çalıştırmak güvenlidir: aynı tarih + açıklamaya sahip kayıt varsa eklenmez,
-- personel tutarları ise üzerine yazılır (aynı değerler).
-- =====================================================================

-- A) YENİ GİDER HAREKETLERİ
with v(entry_date, category, description, vendor, net_amount, other_tax_amount, total_amount, payment_method) as (values
  (date '2026-10-04', 'Yazılım / Abonelik', 'OpenRouter hizmet bedeli (Ekim)', 'OpenRouter', 514.05, 128.51, 642.56, 'Ödenek Hesabı'),
  (date '2026-10-04', 'Vergi / Harç', 'OpenRouter hizmet bedeli %20 stopaj ödemesi (Ekim)', 'Vergi Dairesi', 128.51, 0, 128.51, 'Ödenek Hesabı'),
  (date '2026-10-09', 'Personel / Burs', 'Aylık ekip ödemesi (Ekim): Eslem, Akif, Sena Betül, Ahmet Utku, Zeynep, Selim', 'Ekip (6 kişi)', 98500.00, 0, 98500.00, 'Havale/EFT'),
  (date '2026-10-09', 'Diğer', 'Ekim 2026 Teknopark kart basım maliyeti', 'Teknopark', 7800.00, 0, 7800.00, 'Havale/EFT'),
  (date '2026-10-09', 'Diğer', 'Banka işlem ücreti', 'Banka', 16.76, 0, 16.76, 'Havale/EFT'),
  (date '2026-11-03', 'Diğer', 'Kasım 2026 Teknopark kart basım maliyeti', 'Teknopark', 7800.00, 0, 7800.00, 'Havale/EFT'),
  (date '2026-11-03', 'Personel / Burs', 'Aylık ekip ödemesi (Kasım): Eslem, Akif, Sena Betül, Ahmet Utku, Zeynep, Selim, Abdullatif', 'Ekip (7 kişi)', 125750.00, 0, 125750.00, 'Havale/EFT'),
  (date '2026-11-03', 'Personel / Burs', 'Eylül 2026 kalan ödemesi (geçen aydan ödenek: 123.700 - 98.500)', 'Ekip (çeşitli)', 25200.00, 0, 25200.00, 'Havale/EFT')
)
insert into public.finance_entries
  (entry_date, entry_type, category, description, vendor, net_amount, vat_rate, vat_amount, other_tax_amount, total_amount, payment_method)
select v.entry_date, 'gider', v.category, v.description, v.vendor, v.net_amount, 0, 0, v.other_tax_amount, v.total_amount, v.payment_method
from v
where not exists (
  select 1 from public.finance_entries e
  where e.entry_date = v.entry_date and e.description = v.description
);

-- B) PERSONEL ÖDEME PLANI (mevcut kişilerin aylarına eklenir/güncellenir)
update public.finance_staff_plan set monthly_amounts = monthly_amounts ||
  '{"2026-09":12950,"2026-11":12950}'::jsonb
  where person_name = 'Ahmet Akbıyık';
update public.finance_staff_plan set monthly_amounts = monthly_amounts ||
  '{"2026-09":46000,"2026-11":46000}'::jsonb
  where person_name = 'Selim Yaman';
update public.finance_staff_plan set monthly_amounts = monthly_amounts ||
  '{"2026-09":25900,"2026-11":25900}'::jsonb
  where person_name = 'Eslem Akbıyık';
update public.finance_staff_plan set monthly_amounts = monthly_amounts ||
  '{"2026-09":12950}'::jsonb
  where person_name = 'Akif Ezerbolatoğlu';
update public.finance_staff_plan set monthly_amounts = monthly_amounts ||
  '{"2026-09":12950,"2026-11":12950}'::jsonb
  where person_name = 'Betül Sena Göktaş';
update public.finance_staff_plan set monthly_amounts = monthly_amounts ||
  '{"2026-03":8000,"2026-04":8000,"2026-05":8000,"2026-06":8000,"2026-07":8000,"2026-08":8000,"2026-09":12950,"2026-11":12950}'::jsonb
  where person_name like 'Zeynep%';

-- Abdüllatif sitede zaten kayıtlı olduğu için eklenmiyor (Kasım 15.000 TL'yi planda kontrol edin).

-- Kontrol: güncel plan
select person_name, monthly_amounts from public.finance_staff_plan order by sort_order;
