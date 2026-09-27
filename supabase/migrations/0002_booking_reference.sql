-- Familien-Carsharing: fortlaufende Reservierungsnummer
-- Im Supabase-Dashboard unter SQL Editor ausfuehren.
--
-- Gibt jeder Reservierung eine dauerhafte Nummer (#1, #2, #3 ...), damit man
-- sich in der Familie darauf beziehen kann. Die Nummer bleibt bestehen, auch
-- wenn andere Reservierungen geloescht werden.

alter table public.bookings
  add column if not exists reference integer;

-- Bestehende Reservierungen in ihrer Anlagereihenfolge durchnummerieren.
with numbered as (
  select id, row_number() over (order by created_at, id) as rn
  from public.bookings
  where reference is null
)
update public.bookings b
set reference = n.rn + coalesce((select max(reference) from public.bookings), 0)
from numbered n
where b.id = n.id;

-- Neue Reservierungen bekommen die naechste Nummer automatisch.
create sequence if not exists public.bookings_reference_seq as integer;

select setval(
  'public.bookings_reference_seq',
  coalesce((select max(reference) from public.bookings), 0) + 1,
  false
);

alter table public.bookings
  alter column reference set default nextval('public.bookings_reference_seq');

alter table public.bookings
  alter column reference set not null;

alter sequence public.bookings_reference_seq owned by public.bookings.reference;

create unique index if not exists bookings_reference_key
  on public.bookings (reference);
