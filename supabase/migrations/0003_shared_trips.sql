-- Familien-Carsharing: gemeinsame Fahrten und gemeinsame Rechte
-- Im Supabase-Dashboard unter SQL Editor ausfuehren (nach 0001 und 0002).
--
-- 1. Eine Fahrt kann mehreren Personen gehoeren (participant_ids). Alle
--    Eingetragenen sind gleichberechtigt, die km werden gleichmaessig geteilt.
-- 2. Jedes aktive Familienmitglied darf jede Reservierung, Fahrt und jeden
--    Kosteneintrag anlegen, aendern und loeschen. Statt Sperren gibt es ein
--    Protokoll: created_by, updated_by und updated_at setzt die Datenbank selbst.
-- 3. Zwei Fahrten desselben Autos duerfen sich bei den km-Staenden nicht
--    ueberschneiden, damit keine km doppelt abgerechnet werden.
--
-- VOR dem Ausfuehren pruefen, ob es schon Ueberschneidungen gibt. Liefert diese
-- Abfrage Zeilen, zuerst die doppelten Fahrten in der App korrigieren:
--
--   select a.id, b.id, a.odometer_start, a.odometer_end, b.odometer_start, b.odometer_end
--   from public.trips a
--   join public.trips b on a.car_id = b.car_id and a.id < b.id
--    and int4range(a.odometer_start, a.odometer_end) && int4range(b.odometer_start, b.odometer_end);

-- ------------------------------------------------------- mitfahrende ---

alter table public.trips add column if not exists participant_ids uuid[];

do $$ begin
  -- Bisher gehoerte jede Fahrt genau der Person in user_id.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trips' and column_name = 'user_id'
  ) then
    update public.trips set participant_ids = array[user_id] where participant_ids is null;
    alter table public.trips rename column user_id to created_by;
  end if;
end $$;

alter table public.trips alter column participant_ids set not null;

alter table public.trips drop constraint if exists trips_participants_not_empty;
alter table public.trips add constraint trips_participants_not_empty
  check (cardinality(participant_ids) >= 1);

create index if not exists trips_participants_idx on public.trips using gin (participant_ids);

-- created_by ist nur noch Protokoll. Wird ein Zugang geloescht, sollen seine
-- Eintraege bleiben, deshalb set null statt cascade.
alter table public.trips drop constraint if exists trips_user_id_fkey;
alter table public.trips drop constraint if exists trips_created_by_fkey;
alter table public.trips alter column created_by drop not null;
alter table public.trips add constraint trips_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

-- --------------------------------------------------- doppelte fahrten ---

alter table public.trips drop constraint if exists trips_no_odometer_overlap;
alter table public.trips add constraint trips_no_odometer_overlap exclude using gist (
  car_id with =,
  int4range(odometer_start, odometer_end) with &&
);

-- ------------------------------------------------------ protokoll ---

alter table public.bookings
  add column if not exists created_by uuid references public.profiles (id) on delete set null;
alter table public.expenses
  add column if not exists created_by uuid references public.profiles (id) on delete set null;

update public.bookings set created_by = user_id where created_by is null;
update public.expenses set created_by = user_id where created_by is null;

alter table public.bookings
  add column if not exists updated_by uuid references public.profiles (id) on delete set null,
  add column if not exists updated_at timestamptz;
alter table public.trips
  add column if not exists updated_by uuid references public.profiles (id) on delete set null,
  add column if not exists updated_at timestamptz;
alter table public.expenses
  add column if not exists updated_by uuid references public.profiles (id) on delete set null,
  add column if not exists updated_at timestamptz;

-- Setzt die Protokollspalten aus der Anmeldung, damit der Client sie nicht
-- faelschen kann. Im SQL Editor (ohne Anmeldung) bleiben die Werte erhalten.
create or replace function public.stamp_audit()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := null;
    new.updated_at := null;
  else
    new.created_by := old.created_by;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists bookings_audit on public.bookings;
create trigger bookings_audit before insert or update on public.bookings
  for each row execute function public.stamp_audit();

drop trigger if exists trips_audit on public.trips;
create trigger trips_audit before insert or update on public.trips
  for each row execute function public.stamp_audit();

drop trigger if exists expenses_audit on public.expenses;
create trigger expenses_audit before insert or update on public.expenses
  for each row execute function public.stamp_audit();

-- Nur echte Familienmitglieder koennen an einer Fahrt teilnehmen.
create or replace function public.check_trip_participants()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (
    select 1 from unnest(new.participant_ids) as p(id)
    where not exists (select 1 from public.profiles where profiles.id = p.id)
  ) then
    raise exception 'Unbekannte Person in der Fahrt' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trips_participants_check on public.trips;
create trigger trips_participants_check before insert or update on public.trips
  for each row execute function public.check_trip_participants();

-- --------------------------------------------------------- rechte ---

-- Die Familie pflegt die Daten gemeinsam: jedes aktive Mitglied darf alles.
drop policy if exists bookings_insert_own on public.bookings;
drop policy if exists bookings_modify_own on public.bookings;
drop policy if exists bookings_delete_own on public.bookings;
drop policy if exists bookings_write on public.bookings;
create policy bookings_write on public.bookings
  for all using (public.is_family_member()) with check (public.is_family_member());

drop policy if exists trips_insert_own on public.trips;
drop policy if exists trips_modify_own on public.trips;
drop policy if exists trips_delete_own on public.trips;
drop policy if exists trips_write on public.trips;
create policy trips_write on public.trips
  for all using (public.is_family_member()) with check (public.is_family_member());

drop policy if exists expenses_insert_own on public.expenses;
drop policy if exists expenses_modify_own on public.expenses;
drop policy if exists expenses_delete_own on public.expenses;
drop policy if exists expenses_write on public.expenses;
create policy expenses_write on public.expenses
  for all using (public.is_family_member()) with check (public.is_family_member());

-- ----------------------------------------------------- austragen ---

-- Austragen aus einer Fahrt in einem Schritt. Wer als letzte Person austritt,
-- loescht die Fahrt. Rueckgabe: 'left', 'deleted' oder 'not_participant'.
create or replace function public.leave_trip(trip_id uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_family_member() then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;

  update public.trips
  set participant_ids = array_remove(participant_ids, auth.uid())
  where id = trip_id
    and auth.uid() = any (participant_ids)
    and cardinality(participant_ids) > 1;
  if found then return 'left'; end if;

  delete from public.trips
  where id = trip_id and participant_ids = array[auth.uid()];
  if found then return 'deleted'; end if;

  return 'not_participant';
end $$;

revoke all on function public.leave_trip(uuid) from public, anon;
grant execute on function public.leave_trip(uuid) to authenticated;
