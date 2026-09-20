-- Familien-Carsharing: initial schema
-- Run in the Supabase dashboard under SQL Editor, or via the Supabase CLI.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------- tables ---

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  color        text not null default '#0f766e',
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.cars (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  license_plate    text,
  initial_odometer integer not null default 0 check (initial_odometer >= 0),
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

create table if not exists public.bookings (
  id         uuid primary key default gen_random_uuid(),
  car_id     uuid not null references public.cars (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  purpose    text,
  created_at timestamptz not null default now(),
  constraint bookings_time_order check (ends_at > starts_at),
  -- Two people cannot reserve the same car for overlapping times. Enforced by
  -- the database, so it holds even when two phones submit at the same moment.
  constraint bookings_no_overlap exclude using gist (
    car_id with =,
    tstzrange(starts_at, ends_at) with &&
  )
);

create table if not exists public.trips (
  id             uuid primary key default gen_random_uuid(),
  car_id         uuid not null references public.cars (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  booking_id     uuid references public.bookings (id) on delete set null,
  driven_on      date not null default current_date,
  odometer_start integer not null check (odometer_start >= 0),
  odometer_end   integer not null check (odometer_end >= 0),
  -- Distance is derived, never typed in, so it cannot disagree with the readings.
  distance_km    integer generated always as (odometer_end - odometer_start) stored,
  note           text,
  created_at     timestamptz not null default now(),
  constraint trips_odometer_order check (odometer_end >= odometer_start)
);

do $$ begin
  create type public.expense_category as enum
    ('fuel', 'insurance', 'tax', 'repair', 'service', 'tires', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.split_rule as enum
    ('fixed_equal_variable_km', 'all_by_km', 'all_equal');
exception when duplicate_object then null; end $$;

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  car_id       uuid references public.cars (id) on delete set null,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  category     public.expense_category not null,
  -- Integer cents. Money is never stored as a float.
  amount_cents integer not null check (amount_cents <> 0),
  incurred_on  date not null default current_date,
  -- Period the cost covers, for yearly bills such as Versicherung and Steuer.
  period_start date,
  period_end   date,
  liters       numeric(8, 2),
  note         text,
  receipt_path text,
  created_at   timestamptz not null default now(),
  constraint expenses_period_pair  check ((period_start is null) = (period_end is null)),
  constraint expenses_period_order check (period_end is null or period_end >= period_start)
);

create table if not exists public.settings (
  id         integer primary key default 1 check (id = 1),
  split_rule public.split_rule not null default 'fixed_equal_variable_km',
  currency   text not null default 'EUR'
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

create index if not exists bookings_starts_at_idx on public.bookings (starts_at);
create index if not exists bookings_car_idx       on public.bookings (car_id, starts_at);
create index if not exists trips_driven_on_idx    on public.trips (driven_on);
create index if not exists trips_car_odo_idx      on public.trips (car_id, odometer_end desc);
create index if not exists expenses_incurred_idx  on public.expenses (incurred_on);

-- ------------------------------------------------------------- new users ---

-- Accounts are created by hand in the Supabase dashboard; this gives each one
-- a profile row automatically so nobody has to remember a second step.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------- row security ----

-- security definer, so the check does not recurse through the profiles policy
create or replace function public.is_family_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active
  );
$$;

alter table public.profiles enable row level security;
alter table public.cars     enable row level security;
alter table public.bookings enable row level security;
alter table public.trips    enable row level security;
alter table public.expenses enable row level security;
alter table public.settings enable row level security;

-- Everyone in the family sees the whole shared ledger.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (public.is_family_member());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Cars and settings are shared property: any member may edit them.
drop policy if exists cars_read on public.cars;
create policy cars_read on public.cars
  for select using (public.is_family_member());

drop policy if exists cars_write on public.cars;
create policy cars_write on public.cars
  for all using (public.is_family_member()) with check (public.is_family_member());

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings
  for select using (public.is_family_member());

drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings
  for update using (public.is_family_member()) with check (public.is_family_member());

-- Bookings, trips and expenses: everyone reads, but you may only touch your own.
drop policy if exists bookings_read on public.bookings;
create policy bookings_read on public.bookings
  for select using (public.is_family_member());

drop policy if exists bookings_insert_own on public.bookings;
create policy bookings_insert_own on public.bookings
  for insert with check (user_id = auth.uid() and public.is_family_member());

drop policy if exists bookings_modify_own on public.bookings;
create policy bookings_modify_own on public.bookings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists bookings_delete_own on public.bookings;
create policy bookings_delete_own on public.bookings
  for delete using (user_id = auth.uid());

drop policy if exists trips_read on public.trips;
create policy trips_read on public.trips
  for select using (public.is_family_member());

drop policy if exists trips_insert_own on public.trips;
create policy trips_insert_own on public.trips
  for insert with check (user_id = auth.uid() and public.is_family_member());

drop policy if exists trips_modify_own on public.trips;
create policy trips_modify_own on public.trips
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists trips_delete_own on public.trips;
create policy trips_delete_own on public.trips
  for delete using (user_id = auth.uid());

drop policy if exists expenses_read on public.expenses;
create policy expenses_read on public.expenses
  for select using (public.is_family_member());

drop policy if exists expenses_insert_own on public.expenses;
create policy expenses_insert_own on public.expenses
  for insert with check (user_id = auth.uid() and public.is_family_member());

drop policy if exists expenses_modify_own on public.expenses;
create policy expenses_modify_own on public.expenses
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists expenses_delete_own on public.expenses;
create policy expenses_delete_own on public.expenses
  for delete using (user_id = auth.uid());

-- ------------------------------------------------------- receipt photos ----

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists receipts_read on storage.objects;
create policy receipts_read on storage.objects
  for select using (bucket_id = 'receipts' and public.is_family_member());

drop policy if exists receipts_insert on storage.objects;
create policy receipts_insert on storage.objects
  for insert with check (bucket_id = 'receipts' and public.is_family_member());
