-- Familien-Carsharing: Autos absichern, Mengen pruefen
-- Im Supabase-Dashboard unter SQL Editor ausfuehren (nach 0006).
--
-- 1. Autos koennen nicht mehr geloescht werden. Das Loeschen eines Autos hat
--    alle seine Reservierungen und Fahrten mitgeloescht und damit fruehere
--    Abrechnungen veraendert. Ein verkauftes Auto wird stattdessen deaktiviert.
-- 2. Fuer ein deaktiviertes Auto nimmt die Datenbank keine neue Reservierung
--    und keine neue Fahrt mehr an, auch nicht an der App vorbei. Bestehende
--    Eintraege bleiben aenderbar, solange sie beim selben Auto bleiben.
-- 3. Liter und kWh muessen groesser als 0 sein, Liter gibt es nur beim Tanken
--    und kWh nur beim Laden.
--
-- Das Skript laeuft als Ganzes oder gar nicht. Scheitert Punkt 3 an alten
-- Eintraegen, zeigt diese Abfrage sie an; danach in der App korrigieren:
--
--   select id, category, liters, kwh from public.expenses
--   where (liters is not null and (liters <= 0 or category <> 'fuel'))
--      or (kwh is not null and (kwh <= 0 or category <> 'charging'));

-- ------------------------------------------------- 1. kein loeschen ---

drop policy if exists cars_write on public.cars;
drop policy if exists cars_insert on public.cars;
drop policy if exists cars_update on public.cars;

create policy cars_insert on public.cars
  for insert with check (public.is_family_member());
create policy cars_update on public.cars
  for update using (public.is_family_member()) with check (public.is_family_member());

-- Ohne Delete-Policy greift schon RLS; das Entziehen des Rechts macht es
-- zusaetzlich unabhaengig von kuenftigen Policies.
revoke delete, truncate on public.cars from anon, authenticated;

-- ------------------------------------- 2. deaktivierte autos sperren ---

create or replace function public.check_car_active()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Eine alte Reservierung oder Fahrt darf korrigiert werden, solange sie beim
  -- selben Auto bleibt.
  if tg_op = 'UPDATE' and new.car_id = old.car_id then
    return new;
  end if;
  if exists (select 1 from public.cars where id = new.car_id and not active) then
    raise exception 'Dieses Auto ist deaktiviert.'
      using errcode = 'CS001',
            hint = 'Unter „Mehr“ wieder aktivieren, falls es noch genutzt wird.';
  end if;
  return new;
end $$;

drop trigger if exists bookings_car_active on public.bookings;
create trigger bookings_car_active before insert or update on public.bookings
  for each row execute function public.check_car_active();

drop trigger if exists trips_car_active on public.trips;
create trigger trips_car_active before insert or update on public.trips
  for each row execute function public.check_car_active();

-- ------------------------------------------------- 3. mengen pruefen ---

alter table public.expenses drop constraint if exists expenses_liters_positive;
alter table public.expenses add constraint expenses_liters_positive
  check (liters is null or liters > 0);

alter table public.expenses drop constraint if exists expenses_kwh_positive;
alter table public.expenses add constraint expenses_kwh_positive
  check (kwh is null or kwh > 0);

alter table public.expenses drop constraint if exists expenses_quantity_category;
alter table public.expenses add constraint expenses_quantity_category
  check ((liters is null or category = 'fuel') and (kwh is null or category = 'charging'));

-- ------------------------------------------------------- kontrolle ---

-- Zeigt im SQL Editor, ob alles angekommen ist. Erwartet: jede Zeile "ok".
select 'cars: kein delete-recht' as pruefung,
       case when not has_table_privilege('authenticated', 'public.cars', 'delete')
            then 'ok' else 'FEHLT' end as ergebnis
union all
select 'cars: keine delete-policy',
       case when not exists (select 1 from pg_policies where schemaname = 'public'
              and tablename = 'cars' and cmd in ('DELETE', 'ALL'))
            then 'ok' else 'FEHLT' end
union all
select 'trigger reservierungen',
       case when exists (select 1 from pg_trigger where tgname = 'bookings_car_active')
            then 'ok' else 'FEHLT' end
union all
select 'trigger fahrten',
       case when exists (select 1 from pg_trigger where tgname = 'trips_car_active')
            then 'ok' else 'FEHLT' end
union all
select 'mengen-pruefungen',
       case when (select count(*) from pg_constraint where conname in
              ('expenses_liters_positive', 'expenses_kwh_positive', 'expenses_quantity_category')) = 3
            then 'ok' else 'FEHLT' end;
