-- Phase 4: move balance aggregation into the database. Previously the client
-- pulled every posted journal entry and summed JSONB lines in JS (unbounded for
-- the cumulative Balance Sheet). This RPC aggregates server-side and returns one
-- row per account. See docs/ACCOUNTING_REFACTOR_PLAN.md

create index if not exists idx_journal_entries_status_date
  on public.journal_entries (status, entry_date);

create or replace function public.get_account_balances(
  p_from timestamptz,
  p_to timestamptz,
  p_cumulative boolean
)
returns table (
  account_id text,
  account_code text,
  account_name text,
  total_debit numeric,
  total_credit numeric
)
language sql
stable
as $$
  select
    line->>'account_id'                            as account_id,
    max(line->>'account_code')                     as account_code,
    max(line->>'account_name')                     as account_name,
    sum(coalesce((line->>'debit')::numeric, 0))    as total_debit,
    sum(coalesce((line->>'credit')::numeric, 0))   as total_credit
  from public.journal_entries je
  cross join lateral jsonb_array_elements(coalesce(je.lines, '[]'::jsonb)) as line
  where je.status = 'posted'
    and case when p_cumulative then je.entry_date <= p_to
             else je.entry_date >= p_from and je.entry_date <= p_to end
    and (line->>'account_id') is not null
    and (line->>'account_code') is not null
  group by line->>'account_id';
$$;
