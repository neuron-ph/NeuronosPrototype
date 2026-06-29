-- Makes the Detail Type → cash-flow-activity mapping data-driven (was hardcoded
-- in src/utils/accountingDetailTypes.ts). Adding a row here makes a new Detail
-- Type appear in the account picker and route correctly in the Cash Flow
-- Statement — no code change. Managed in Chart of Accounts → Detail Types.
-- See docs/ACCOUNTING_REFACTOR_PLAN.md
create table if not exists public.account_detail_types (
  name              text primary key,
  account_types     text[]      not null,   -- broad Account Types this is valid under (lowercase)
  activity          text        not null,   -- cash-flow activity (fixed set)
  statement_section text        not null,   -- Income Statement / Balance Sheet section
  sort_order        integer     not null default 100,
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint account_detail_types_activity_check check (activity in
    ('Cash','Operating','Operating (non-cash adjustments)','Investing','Financing','None'))
);

alter table public.account_detail_types enable row level security;

create policy account_detail_types_select on public.account_detail_types
  for select to authenticated using (true);
create policy account_detail_types_write on public.account_detail_types
  for all to authenticated using (true) with check (true);

insert into public.account_detail_types (name, account_types, activity, statement_section, sort_order) values
  ('Cash and Cash Equivalents', '{asset}',                  'Cash',                              'Current Assets',          10),
  ('Accounts Receivable',       '{asset}',                  'Operating',                         'Current Assets',          20),
  ('Inventory',                 '{asset}',                  'Operating',                         'Current Assets',          30),
  ('Prepaid Expenses',          '{asset}',                  'Operating',                         'Current Assets',          40),
  ('Other Current Assets',      '{asset}',                  'Operating',                         'Current Assets',          50),
  ('Accounts Payable',          '{liability}',              'Operating',                         'Current Liabilities',     60),
  ('Accrued Expenses',          '{liability}',              'Operating',                         'Current Liabilities',     70),
  ('Taxes Payable',             '{liability}',              'Operating',                         'Current Liabilities',     80),
  ('Deferred Revenue',          '{liability}',              'Operating',                         'Current Liabilities',     90),
  ('Other Current Liabilities', '{liability}',              'Operating',                         'Current Liabilities',    100),
  ('Revenue',                   '{income,revenue}',         'Operating',                         'Service Revenue',        110),
  ('Other Income',              '{income,revenue}',         'Operating',                         'Other Income',           120),
  ('Cost of Services',          '{expense,cost}',           'Operating',                         'Cost of Services',       130),
  ('Operating Expense',         '{expense}',                'Operating',                         'Operating Expenses',     140),
  ('Tax Expense',               '{expense}',                'Operating',                         'Income Tax',             150),
  ('Interest',                  '{expense}',                'Operating',                         'Other Expenses',         160),
  ('Depreciation & Amortization','{expense}',               'Operating (non-cash adjustments)',  'Operating Expenses',     170),
  ('Loss/Gain on Disposal',     '{expense,income}',         'Operating (non-cash adjustments)',  'Other Expenses',         180),
  ('Unrealized FX Gain/Loss',   '{expense,income,revenue}', 'Operating (non-cash adjustments)',  'Other Expenses',         190),
  ('Fixed Assets',              '{asset}',                  'Investing',                         'Non-Current Assets',     200),
  ('Other Non-Current Assets',  '{asset}',                  'Investing',                         'Non-Current Assets',     210),
  ('Long-term Investments',     '{asset}',                  'Investing',                         'Non-Current Assets',     220),
  ('Loans / Long-term Debt',    '{liability}',              'Financing',                         'Non-Current Liabilities',230),
  ('Capital / Contributions',   '{equity}',                 'Financing',                         'Equity',                 240),
  ('Dividends / Drawings',      '{equity}',                 'Financing',                         'Equity',                 250),
  ('Retained Earnings',         '{equity}',                 'None',                              'Equity',                 260)
on conflict (name) do nothing;
