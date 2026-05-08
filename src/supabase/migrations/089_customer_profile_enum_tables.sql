-- 089_customer_profile_enum_tables.sql
-- Add profiling-managed customer vocabularies for Industry and Lead Source.

-- ---------------------------------------------------------------------------
-- 1. profile_industries
-- ---------------------------------------------------------------------------
create table public.profile_industries (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_industries enable row level security;
create policy profile_industries_read on public.profile_industries for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_industries_write_exec on public.profile_industries for all using (is_executive()) with check (is_executive());
insert into public.profile_industries (value, sort_order) values
  ('Garments', 10),
  ('Garments/Textile', 20),
  ('Automobile', 30),
  ('Energy', 40),
  ('Food & Beverage', 50),
  ('Heavy Equipment', 60),
  ('Construction', 70),
  ('Agricultural', 80),
  ('Pharmaceutical', 90),
  ('IT', 100),
  ('Electronics', 110),
  ('General Merchandise', 120)
on conflict (value) do nothing;

-- ---------------------------------------------------------------------------
-- 2. profile_lead_sources
-- ---------------------------------------------------------------------------
create table public.profile_lead_sources (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_lead_sources enable row level security;
create policy profile_lead_sources_read on public.profile_lead_sources for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_lead_sources_write_exec on public.profile_lead_sources for all using (is_executive()) with check (is_executive());
insert into public.profile_lead_sources (value, sort_order) values
  ('Referral', 10),
  ('Trade Show', 20),
  ('Cold Outreach', 30),
  ('Website', 40)
on conflict (value) do nothing;
