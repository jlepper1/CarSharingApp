-- Familien-Carsharing: Antriebsart der Autos und Strom-Laden als Kostenart
-- Im Supabase-Dashboard unter SQL Editor ausfuehren (nach 0005).
--
-- Autos sind entweder Verbrenner ("fuel") oder reine Elektroautos ("electric").
-- Bestehende Autos gelten als Verbrenner. Elektroautos werden geladen statt
-- betankt: dafuer gibt es die Kostenart "charging" und die geladenen kWh, damit
-- die Abrechnung kWh/100 km statt l/100 km zeigen kann.

alter table public.cars
  add column if not exists drive_type text not null default 'fuel'
  check (drive_type in ('fuel', 'electric'));

alter type public.expense_category add value if not exists 'charging';

alter table public.expenses add column if not exists kwh numeric(8, 2);
