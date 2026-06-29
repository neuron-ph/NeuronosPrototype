-- Phase 0: add the finer cash-flow classification label (Neuron model).
-- `type` (Account Type) drives statement placement; `detail_type` drives
-- Operating/Investing/Financing activity. See docs/ACCOUNTING_REFACTOR_PLAN.md
alter table public.accounts add column if not exists detail_type text;

comment on column public.accounts.detail_type is
  'Finer cash-flow classification (Neuron model): drives Operating/Investing/Financing activity. type drives statement placement. See docs/ACCOUNTING_REFACTOR_PLAN.md';

update public.accounts set detail_type = case
  -- Cash (reconciliation target)
  when code in ('1000','1010','1020','1030','1090') then 'Cash and Cash Equivalents'
  -- Operating working capital — assets
  when code in ('1100','1110','1120','1150') then 'Accounts Receivable'
  when code in ('1130','1170') then 'Prepaid Expenses'
  when code in ('1160','1180') then 'Other Current Assets'
  -- Investing — long-term assets
  when code in ('1500','1510','1520','1530','1540','1550') then 'Fixed Assets'
  when code in ('1600','1610') then 'Other Non-Current Assets'
  -- Operating working capital — liabilities
  when code in ('2000','2010','2020','2030') then 'Accounts Payable'
  when code in ('2040','2070','2080','2090') then 'Accrued Expenses'
  when code in ('2050','2060','2100') then 'Taxes Payable'
  when code = '2110' then 'Deferred Revenue'
  when code = '2120' then 'Other Current Liabilities'
  -- Financing — long-term debt + equity
  when code in ('2500','2510') then 'Loans / Long-term Debt'
  when code = '3000' then 'Capital / Contributions'
  when code in ('3100','3200') then 'Retained Earnings'
  when code = '3300' then 'Dividends / Drawings'
  -- P&L special: non-cash adjustments + interest (by code)
  when code = '6600' then 'Depreciation & Amortization'
  when code = '7020' then 'Loss/Gain on Disposal'
  when code in ('4530','7030') then 'Unrealized FX Gain/Loss'
  when code = '7000' then 'Interest'
  -- P&L bulk (by sub_type)
  when sub_type = 'Service Revenue' then 'Revenue'
  when sub_type = 'Other Income' then 'Other Income'
  when sub_type = 'Cost of Services' then 'Cost of Services'
  when sub_type = 'Income Tax' then 'Tax Expense'
  when sub_type in ('Variable Expenses','Fixed Expenses','Selling Expenses','General & Administrative','Other Expenses') then 'Operating Expense'
  else 'Operating Expense'
end;
