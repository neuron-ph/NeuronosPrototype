-- 102_decouple_vendor_profiles.sql
-- Profiling is a separate concept from Vendors. Shipping lines, trucking companies,
-- consolidators, and insurers are dropdown values used by booking forms — not vendor
-- records. Until now they shared service_providers (along with their tag-filter), which
-- meant Profiling quick-creates hit the vendor table's text-id-without-default and
-- failed with NOT NULL violations. Same surgery migration 090 did for carrier/forwarder.

-- ---------------------------------------------------------------------------
-- 1. profile_shipping_lines
-- ---------------------------------------------------------------------------
create table public.profile_shipping_lines (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_shipping_lines enable row level security;
create policy profile_shipping_lines_read on public.profile_shipping_lines for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_shipping_lines_write_exec on public.profile_shipping_lines for all using (is_executive()) with check (is_executive());

insert into public.profile_shipping_lines (name)
select distinct trim(company_name)
from public.service_providers
where company_name is not null
  and trim(company_name) <> ''
  and booking_profile_tags @> array['shipping_line']::text[]
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 2. profile_trucking_companies
-- ---------------------------------------------------------------------------
create table public.profile_trucking_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_trucking_companies enable row level security;
create policy profile_trucking_companies_read on public.profile_trucking_companies for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_trucking_companies_write_exec on public.profile_trucking_companies for all using (is_executive()) with check (is_executive());

insert into public.profile_trucking_companies (name)
select distinct trim(company_name)
from public.service_providers
where company_name is not null
  and trim(company_name) <> ''
  and booking_profile_tags @> array['trucking_company']::text[]
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 3. profile_consolidators
-- ---------------------------------------------------------------------------
create table public.profile_consolidators (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_consolidators enable row level security;
create policy profile_consolidators_read on public.profile_consolidators for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_consolidators_write_exec on public.profile_consolidators for all using (is_executive()) with check (is_executive());

insert into public.profile_consolidators (name)
select distinct trim(company_name)
from public.service_providers
where company_name is not null
  and trim(company_name) <> ''
  and booking_profile_tags @> array['consolidator']::text[]
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 4. profile_insurers
-- ---------------------------------------------------------------------------
create table public.profile_insurers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_insurers enable row level security;
create policy profile_insurers_read on public.profile_insurers for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_insurers_write_exec on public.profile_insurers for all using (is_executive()) with check (is_executive());

insert into public.profile_insurers (name)
select distinct trim(company_name)
from public.service_providers
where company_name is not null
  and trim(company_name) <> ''
  and booking_profile_tags @> array['insurer']::text[]
on conflict (name) do nothing;
