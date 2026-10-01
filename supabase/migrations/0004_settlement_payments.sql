-- Familien-Carsharing: Ausgleichszahlungen und Live-Aktualisierung
-- Im Supabase-Dashboard unter SQL Editor ausfuehren (nach 0003).
--
-- 1. Wer einen Ausgleich ueberwiesen hat, markiert ihn als bezahlt. Die Zahlung
--    zaehlt am Tag applies_on (Ende des abgerechneten Zeitraums) und gleicht
--    den Saldo aus, so geht ein offener Betrag beim Monatswechsel nicht verloren.
-- 2. Die App bekommt Aenderungen anderer Familienmitglieder sofort mit.

create table if not exists public.settlement_payments (
  id           uuid primary key default gen_random_uuid(),
  from_user    uuid not null references public.profiles (id) on delete cascade,
  to_user      uuid not null references public.profiles (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  applies_on   date not null,
  note         text,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint settlement_payments_two_people check (from_user <> to_user)
);

create index if not exists settlement_payments_applies_idx
  on public.settlement_payments (applies_on);

create or replace function public.stamp_created_by()
returns trigger language plpgsql set search_path = public as $$
begin
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end $$;

drop trigger if exists settlement_payments_audit on public.settlement_payments;
create trigger settlement_payments_audit before insert on public.settlement_payments
  for each row execute function public.stamp_created_by();

alter table public.settlement_payments enable row level security;

drop policy if exists settlement_payments_read on public.settlement_payments;
create policy settlement_payments_read on public.settlement_payments
  for select using (public.is_family_member());

drop policy if exists settlement_payments_write on public.settlement_payments;
create policy settlement_payments_write on public.settlement_payments
  for all using (public.is_family_member()) with check (public.is_family_member());

-- ---------------------------------------------------- live-aktualisierung ---

-- Realtime liefert nur Zeilen, die die Person auch lesen darf (RLS gilt).
do $$
declare
  t text;
begin
  foreach t in array array['bookings', 'trips', 'expenses', 'settlement_payments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
