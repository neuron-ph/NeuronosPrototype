-- 088_enum_profile_tables.sql
-- Promote previously-hardcoded dropdown enums into governance-managed profile tables.
-- Each enum gets its own profile_<plural> table following the same shape:
--   id, value, label, sort_order, is_active, created_at, updated_at
-- RLS mirrors profile_countries: read for any non-HR user, write for executives.
--
-- BOOLEAN ('Yes'/'No') and Operation Services (Brokerage/Forwarding/Trucking/Marine
-- Insurance/Others) are intentionally NOT migrated — they are foundational
-- taxonomy used by routing, schemas, and team structure.

-- ---------------------------------------------------------------------------
-- 1. profile_modes
-- ---------------------------------------------------------------------------
create table public.profile_modes (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_modes enable row level security;
create policy profile_modes_read on public.profile_modes for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_modes_write_exec on public.profile_modes for all using (is_executive()) with check (is_executive());
insert into public.profile_modes (value, sort_order) values ('FCL', 10), ('LCL', 20), ('Air Freight', 30);

-- ---------------------------------------------------------------------------
-- 2. profile_movements
-- ---------------------------------------------------------------------------
create table public.profile_movements (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  applicable_service_types text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_movements enable row level security;
create policy profile_movements_read on public.profile_movements for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_movements_write_exec on public.profile_movements for all using (is_executive()) with check (is_executive());
insert into public.profile_movements (value, sort_order, applicable_service_types) values
  ('Import', 10, array['Brokerage','Forwarding','Trucking','Marine Insurance','Others']),
  ('Export', 20, array['Brokerage','Forwarding','Trucking','Marine Insurance','Others']),
  ('Domestic', 30, array['Forwarding','Trucking']);

-- ---------------------------------------------------------------------------
-- 3. profile_incoterms
-- ---------------------------------------------------------------------------
create table public.profile_incoterms (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_incoterms enable row level security;
create policy profile_incoterms_read on public.profile_incoterms for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_incoterms_write_exec on public.profile_incoterms for all using (is_executive()) with check (is_executive());
insert into public.profile_incoterms (value, sort_order) values
  ('EXW', 10), ('FCA', 20), ('FOB', 30), ('CFR', 40), ('CIF', 50),
  ('CPT', 60), ('CIP', 70), ('DAP', 80), ('DDU', 90), ('DDP', 100);

-- ---------------------------------------------------------------------------
-- 4. profile_cargo_types
-- ---------------------------------------------------------------------------
create table public.profile_cargo_types (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_cargo_types enable row level security;
create policy profile_cargo_types_read on public.profile_cargo_types for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_cargo_types_write_exec on public.profile_cargo_types for all using (is_executive()) with check (is_executive());
insert into public.profile_cargo_types (value, sort_order) values
  ('Dry', 10), ('Reefer', 20), ('Breakbulk', 30), ('RORO', 40),
  ('Dangerous Goods', 50), ('Perishables', 60), ('Other', 70);

-- ---------------------------------------------------------------------------
-- 5. profile_cargo_natures
-- ---------------------------------------------------------------------------
create table public.profile_cargo_natures (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_cargo_natures enable row level security;
create policy profile_cargo_natures_read on public.profile_cargo_natures for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_cargo_natures_write_exec on public.profile_cargo_natures for all using (is_executive()) with check (is_executive());
insert into public.profile_cargo_natures (value, sort_order) values
  ('General Cargo', 10), ('Dangerous Goods', 20), ('Perishables', 30),
  ('Valuables', 40), ('Temperature Controlled', 50);

-- ---------------------------------------------------------------------------
-- 6. profile_brokerage_types (Type of Entry)
-- ---------------------------------------------------------------------------
create table public.profile_brokerage_types (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_brokerage_types enable row level security;
create policy profile_brokerage_types_read on public.profile_brokerage_types for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_brokerage_types_write_exec on public.profile_brokerage_types for all using (is_executive()) with check (is_executive());
insert into public.profile_brokerage_types (value, sort_order) values
  ('Standard', 10), ('All-Inclusive', 20), ('Non-Regular', 30);

-- ---------------------------------------------------------------------------
-- 7. profile_customs_entries
-- ---------------------------------------------------------------------------
create table public.profile_customs_entries (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_customs_entries enable row level security;
create policy profile_customs_entries_read on public.profile_customs_entries for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_customs_entries_write_exec on public.profile_customs_entries for all using (is_executive()) with check (is_executive());
insert into public.profile_customs_entries (value, sort_order) values ('Formal', 10), ('Informal', 20);

-- ---------------------------------------------------------------------------
-- 8. profile_customs_entry_procedures
-- ---------------------------------------------------------------------------
create table public.profile_customs_entry_procedures (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_customs_entry_procedures enable row level security;
create policy profile_customs_entry_procedures_read on public.profile_customs_entry_procedures for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_customs_entry_procedures_write_exec on public.profile_customs_entry_procedures for all using (is_executive()) with check (is_executive());
insert into public.profile_customs_entry_procedures (value, sort_order) values
  ('Consumption', 10), ('PEZA', 20), ('Warehousing', 30);

-- ---------------------------------------------------------------------------
-- 9. profile_truck_types
-- ---------------------------------------------------------------------------
create table public.profile_truck_types (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_truck_types enable row level security;
create policy profile_truck_types_read on public.profile_truck_types for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_truck_types_write_exec on public.profile_truck_types for all using (is_executive()) with check (is_executive());
insert into public.profile_truck_types (value, sort_order) values
  ('4W', 10), ('6W', 20), ('10W', 30), ('20ft', 40), ('40ft', 50), ('45ft', 60);

-- ---------------------------------------------------------------------------
-- 10. profile_selectivity_colors
-- ---------------------------------------------------------------------------
create table public.profile_selectivity_colors (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_selectivity_colors enable row level security;
create policy profile_selectivity_colors_read on public.profile_selectivity_colors for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_selectivity_colors_write_exec on public.profile_selectivity_colors for all using (is_executive()) with check (is_executive());
insert into public.profile_selectivity_colors (value, sort_order) values
  ('Yellow', 10), ('Orange', 20), ('Red', 30);

-- ---------------------------------------------------------------------------
-- 11. profile_examinations
-- ---------------------------------------------------------------------------
create table public.profile_examinations (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_examinations enable row level security;
create policy profile_examinations_read on public.profile_examinations for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_examinations_write_exec on public.profile_examinations for all using (is_executive()) with check (is_executive());
insert into public.profile_examinations (value, sort_order) values
  ('X-ray', 10), ('Spotcheck', 20), ('DEA', 30);

-- ---------------------------------------------------------------------------
-- 12. profile_container_types
-- ---------------------------------------------------------------------------
create table public.profile_container_types (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_container_types enable row level security;
create policy profile_container_types_read on public.profile_container_types for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_container_types_write_exec on public.profile_container_types for all using (is_executive()) with check (is_executive());
insert into public.profile_container_types (value, sort_order) values
  ('20ft', 10), ('40ft', 20), ('45ft', 30);

-- ---------------------------------------------------------------------------
-- 13. profile_package_types
-- ---------------------------------------------------------------------------
create table public.profile_package_types (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_package_types enable row level security;
create policy profile_package_types_read on public.profile_package_types for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_package_types_write_exec on public.profile_package_types for all using (is_executive()) with check (is_executive());
insert into public.profile_package_types (value, sort_order) values
  ('Pallet', 10), ('Carton', 20), ('Crate', 30), ('Bag', 40),
  ('Drum', 50), ('Bundle', 60), ('Container', 70), ('Other', 999);

-- ---------------------------------------------------------------------------
-- 14. profile_preferential_treatments
-- ---------------------------------------------------------------------------
create table public.profile_preferential_treatments (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_preferential_treatments enable row level security;
create policy profile_preferential_treatments_read on public.profile_preferential_treatments for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_preferential_treatments_write_exec on public.profile_preferential_treatments for all using (is_executive()) with check (is_executive());
insert into public.profile_preferential_treatments (value, sort_order) values
  ('Form E', 10), ('Form D', 20);

-- ---------------------------------------------------------------------------
-- 15. profile_credit_terms
-- ---------------------------------------------------------------------------
create table public.profile_credit_terms (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_credit_terms enable row level security;
create policy profile_credit_terms_read on public.profile_credit_terms for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_credit_terms_write_exec on public.profile_credit_terms for all using (is_executive()) with check (is_executive());
insert into public.profile_credit_terms (value, sort_order) values
  ('Cash', 10), ('15 Days', 20), ('30 Days', 30), ('45 Days', 40),
  ('60 Days', 50), ('90 Days', 60);

-- ---------------------------------------------------------------------------
-- 16. profile_cpe_codes (Forwarding)
-- ---------------------------------------------------------------------------
create table public.profile_cpe_codes (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile_cpe_codes enable row level security;
create policy profile_cpe_codes_read on public.profile_cpe_codes for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_cpe_codes_write_exec on public.profile_cpe_codes for all using (is_executive()) with check (is_executive());
insert into public.profile_cpe_codes (value, sort_order) values ('23', 10), ('24', 20);

-- ---------------------------------------------------------------------------
-- 17. profile_service_statuses (per service_type)
-- ---------------------------------------------------------------------------
create table public.profile_service_statuses (
  id uuid primary key default gen_random_uuid(),
  service_type text not null,
  value text not null,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_type, value)
);
alter table public.profile_service_statuses enable row level security;
create policy profile_service_statuses_read on public.profile_service_statuses for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);
create policy profile_service_statuses_write_exec on public.profile_service_statuses for all using (is_executive()) with check (is_executive());
insert into public.profile_service_statuses (service_type, value, sort_order) values
  ('Brokerage','Draft',10),('Brokerage','Waiting for Arrival',20),('Brokerage','Ongoing',30),('Brokerage','Delivered',40),('Brokerage','Billed',50),('Brokerage','Paid',60),('Brokerage','Audited',70),('Brokerage','Cancelled',80),
  ('Forwarding','Draft',10),('Forwarding','Ongoing',20),('Forwarding','In Transit',30),('Forwarding','Delivered',40),('Forwarding','Completed',50),('Forwarding','Billed',60),('Forwarding','Paid',70),('Forwarding','Cancelled',80),
  ('Trucking','Draft',10),('Trucking','Ongoing',20),('Trucking','Delivered',30),('Trucking','Empty Return',40),('Trucking','Liquidated',50),('Trucking','Billed',60),('Trucking','Paid',70),('Trucking','Cancelled',80),
  ('Marine Insurance','Draft',10),('Marine Insurance','Ongoing',20),('Marine Insurance','Issued',30),('Marine Insurance','Billed',40),('Marine Insurance','Paid',50),('Marine Insurance','Cancelled',60),
  ('Others','Draft',10),('Others','Ongoing',20),('Others','Completed',30),('Others','Billed',40),('Others','Paid',50),('Others','Cancelled',60);
