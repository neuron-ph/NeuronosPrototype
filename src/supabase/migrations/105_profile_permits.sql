-- ---------------------------------------------------------------------------
-- 105_profile_permits.sql
--
-- Governed enum table for Brokerage booking `permits` field. Until now, the
-- field was free-text (any string Ops typed). To let the contract rate engine
-- gate `applies_when`-tagged processing-fee rows (BAI, SRA, BPI, FDA…) on
-- declared permits, the values must be a controlled vocabulary so matching
-- is deterministic.
--
-- Pattern mirrors migration 088 (profile_examinations et al.).
-- ---------------------------------------------------------------------------

create table public.profile_permits (
  id uuid primary key default gen_random_uuid(),
  value text not null unique,
  label text,
  sort_order int not null default 999,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profile_permits enable row level security;

create policy profile_permits_read on public.profile_permits for select using (
  exists (select 1 from public.users where users.auth_id = auth.uid() and users.department <> 'HR')
);

create policy profile_permits_write_exec on public.profile_permits for all using (is_executive()) with check (is_executive());

-- Seed: the four regulatory clearances that triggered the prod billing bug,
-- plus the most common additional Philippine regulatory permits Ops file
-- against shipments. Executives can add/edit via Admin → Profiling.
insert into public.profile_permits (value, sort_order) values
  ('BAI', 10),
  ('SRA', 20),
  ('BPI', 30),
  ('FDA', 40),
  ('BPS', 50),
  ('LTO', 60),
  ('PNP-FEO', 70),
  ('NTC', 80);
