-- 194_currency_master.sql  (NEU-027 Phase 1 — multi-currency foundation)
--
-- The accounting engine was PHP/USD-only via hardcoded CHECK constraints. The
-- core math is already currency-agnostic, so we open the gate the FLEXIBLE way:
-- a `currencies` master table becomes the source of truth, and the currency
-- columns reference it. Adding a currency later = INSERT a row (data/config),
-- not a code change or a migration.
--
-- Functional currency stays PHP (the GL still balances in PHP). This migration
-- only widens WHICH currencies are allowed to exist; it changes no posting math
-- and no existing data.

-- ---------------------------------------------------------------------------
-- 1. Currency master
-- ---------------------------------------------------------------------------
create table if not exists currencies (
  code        text primary key,                 -- ISO 4217, e.g. PHP/USD/EUR/CNY
  name        text not null,
  symbol      text,                             -- display glyph, e.g. ₱
  decimals    smallint not null default 2,
  is_active   boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

select add_updated_at_trigger('currencies');

insert into currencies (code, name, symbol, decimals, sort_order) values
  ('PHP', 'Philippine Peso',     '₱', 2, 10),
  ('USD', 'US Dollar',           '$', 2, 20),
  ('EUR', 'Euro',                '€', 2, 30),
  ('CNY', 'Chinese Yuan',        '¥', 2, 40)
on conflict (code) do nothing;

-- Defensive: make sure any currency code already present in the data exists in
-- the master before we add the foreign keys below (so FK creation can't fail on
-- an unexpected legacy value).
insert into currencies (code, name)
select distinct upper(btrim(currency)), upper(btrim(currency))
from accounts where currency is not null and btrim(currency) <> ''
on conflict (code) do nothing;

insert into currencies (code, name)
select distinct upper(btrim(c)), upper(btrim(c)) from (
  select from_currency as c from exchange_rates
  union select to_currency from exchange_rates
  union select base_currency from invoices
  union select base_currency from collections
  union select base_currency from evouchers
  union select base_currency from expenses
  union select base_currency from billing_line_items
  union select base_currency from journal_entries
) s
where c is not null and btrim(c) <> ''
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Repoint currency columns: drop the PHP/USD CHECKs, add FK → currencies
--    (FK both widens the allowed set AND keeps referential integrity)
-- ---------------------------------------------------------------------------

-- accounts.currency (account denomination — the real "foreign account" gate)
alter table accounts drop constraint if exists accounts_currency_check;
alter table accounts drop constraint if exists accounts_currency_fk;
alter table accounts add constraint accounts_currency_fk
  foreign key (currency) references currencies(code);

-- exchange_rates pair (the real "which rate pairs can be stored" gate)
alter table exchange_rates drop constraint if exists exchange_rates_currency_pair_check;
alter table exchange_rates drop constraint if exists exchange_rates_from_currency_fk;
alter table exchange_rates drop constraint if exists exchange_rates_to_currency_fk;
alter table exchange_rates add constraint exchange_rates_from_currency_fk
  foreign key (from_currency) references currencies(code);
alter table exchange_rates add constraint exchange_rates_to_currency_fk
  foreign key (to_currency) references currencies(code);
-- (exchange_rates_distinct_currencies_check stays — from <> to is still valid)

-- Document base_currency (always functional PHP, but FK keeps it honest + flexible)
do $$
declare t text;
begin
  foreach t in array array['invoices','collections','evouchers','expenses','billing_line_items','journal_entries']
  loop
    execute format('alter table %I drop constraint if exists %I', t, t || '_base_currency_check');
    execute format('alter table %I drop constraint if exists %I', t, t || '_base_currency_fk');
    execute format('alter table %I add constraint %I foreign key (base_currency) references currencies(code)', t, t || '_base_currency_fk');
  end loop;
end$$;

create index if not exists idx_currencies_active on currencies(is_active, sort_order);

-- RLS: reference data — readable by any authenticated user; writes are managed
-- by the app's admin surfaces (Profiling). Mirrors the other lookup tables.
alter table currencies enable row level security;
drop policy if exists currencies_select on currencies;
create policy currencies_select on currencies for select to authenticated using (true);
drop policy if exists currencies_write on currencies;
create policy currencies_write on currencies for all to authenticated using (true) with check (true);
