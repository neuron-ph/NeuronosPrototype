-- 090_decouple_carrier_forwarder_profiles.sql
-- Decouple Carrier and Forwarder from the shared Vendors/Network Partners dataset.

-- ---------------------------------------------------------------------------
-- 1. profile_carriers
-- ---------------------------------------------------------------------------
create table public.profile_carriers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_carriers enable row level security;
create policy profile_carriers_read on public.profile_carriers for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_carriers_write_exec on public.profile_carriers for all using (is_executive()) with check (is_executive());

insert into public.profile_carriers (name)
select distinct trim(company_name)
from public.service_providers
where company_name is not null
  and trim(company_name) <> ''
  and booking_profile_tags @> array['carrier']::text[]
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 2. profile_forwarders
-- ---------------------------------------------------------------------------
create table public.profile_forwarders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_forwarders enable row level security;
create policy profile_forwarders_read on public.profile_forwarders for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_forwarders_write_exec on public.profile_forwarders for all using (is_executive()) with check (is_executive());

insert into public.profile_forwarders (name)
select distinct trim(company_name)
from public.service_providers
where company_name is not null
  and trim(company_name) <> ''
  and booking_profile_tags @> array['forwarder']::text[]
on conflict (name) do nothing;
