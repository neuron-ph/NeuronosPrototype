-- 238_credit_terms_bank_accounts_lookups.sql  (NEU-071)
--
-- Two Profiling-managed lookups that feed the invoice print, mirroring the
-- `currencies` master (194): a managed list = source of truth, add a row (config)
-- not a code change. Invoice printing selects from these instead of free text.
--   • credit_terms  — label + net_days (drives the due-date derivation directly)
--   • bank_accounts — multiple payable accounts, optionally currency-tagged

-- ── Credit terms ────────────────────────────────────────────────────────────
create table if not exists credit_terms (
  id          uuid primary key default gen_random_uuid(),
  label       text not null unique,             -- "NET 15", "COD", "Due on receipt"
  net_days    integer not null default 0,       -- days added to the invoice date
  is_active   boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
select add_updated_at_trigger('credit_terms');

insert into credit_terms (label, net_days, sort_order) values
  ('Due on receipt', 0, 10),
  ('COD',            0, 20),
  ('NET 7',          7, 30),
  ('NET 15',        15, 40),
  ('NET 30',        30, 50),
  ('NET 45',        45, 60),
  ('NET 60',        60, 70)
on conflict (label) do nothing;

create index if not exists idx_credit_terms_active on credit_terms(is_active, sort_order);

alter table credit_terms enable row level security;
drop policy if exists credit_terms_select on credit_terms;
create policy credit_terms_select on credit_terms for select to authenticated using (true);
drop policy if exists credit_terms_write on credit_terms;
create policy credit_terms_write on credit_terms for all to authenticated using (true) with check (true);

-- ── Bank accounts ───────────────────────────────────────────────────────────
create table if not exists bank_accounts (
  id             uuid primary key default gen_random_uuid(),
  label          text not null,                 -- nickname, e.g. "BDO PHP Main"
  bank_name      text not null,
  account_name   text not null,
  account_number text not null,
  currency       text,                          -- optional tag (PHP/USD…) — no FK, blank allowed
  is_active      boolean not null default true,
  sort_order     integer not null default 100,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
select add_updated_at_trigger('bank_accounts');

create index if not exists idx_bank_accounts_active on bank_accounts(is_active, sort_order);

alter table bank_accounts enable row level security;
drop policy if exists bank_accounts_select on bank_accounts;
create policy bank_accounts_select on bank_accounts for select to authenticated using (true);
drop policy if exists bank_accounts_write on bank_accounts;
create policy bank_accounts_write on bank_accounts for all to authenticated using (true) with check (true);

-- Seed one account from the existing company default (NEU-055) if present, so the
-- invoice selector isn't empty on first use. Guarded so re-runs don't duplicate.
insert into bank_accounts (label, bank_name, account_name, account_number, currency, sort_order)
select 'Company Default',
       cs.bank_name,
       coalesce(cs.bank_account_name, cs.company_name),
       cs.bank_account_number,
       'PHP',
       10
from company_settings cs
where cs.id = 'default'
  and cs.bank_name is not null and btrim(cs.bank_name) <> ''
  and cs.bank_account_number is not null and btrim(cs.bank_account_number) <> ''
  and not exists (select 1 from bank_accounts);
