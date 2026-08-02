-- State-machine vocabulary for the capability inventory.
-- Run against dev (prod-cloned) via Supabase MCP or psql. Re-runnable, read-only.
--
-- Neuron OS declares almost no status enums: 24 status columns exist, only 6
-- carry a CHECK constraint. So the real vocabulary has to be read from the data
-- plus the constraints, not from the schema alone.

-- 1. Declared constraints — the statuses the DB actually enforces.
select rel.relname as table_name, con.conname, pg_get_constraintdef(con.oid) as def
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public'
  and con.contype = 'c'
  and pg_get_constraintdef(con.oid) ilike '%status%'
order by rel.relname;

-- 2. Every status-bearing column in the schema.
select table_name, column_name
from information_schema.columns
where table_schema = 'public' and column_name like '%status%'
order by table_name;

-- 3. Observed vocabulary on the spine entities. Values here that don't appear
--    in (1) are unenforced — that gap is where casing/spelling drift lives.
select 'bookings.status'           as col, status          as val, count(*) from bookings           group by 1,2
union all select 'bookings.billing_status',      billing_status,   count(*) from bookings           group by 1,2
union all select 'evouchers.status',             status,           count(*) from evouchers          group by 1,2
union all select 'quotations.status',            status,           count(*) from quotations         group by 1,2
union all select 'quotations.contract_status',   contract_status,  count(*) from quotations         group by 1,2
union all select 'invoices.status',              status,           count(*) from invoices           group by 1,2
union all select 'invoices.approval_status',     approval_status,  count(*) from invoices           group by 1,2
union all select 'collections.status',           status,           count(*) from collections        group by 1,2
union all select 'projects.status',              status,           count(*) from projects           group by 1,2
union all select 'billing_line_items.status',    status,           count(*) from billing_line_items group by 1,2
union all select 'expenses.status',              status,           count(*) from expenses           group by 1,2
union all select 'budget_requests.status',       status,           count(*) from budget_requests    group by 1,2
union all select 'tasks.status',                 status,           count(*) from tasks              group by 1,2
union all select 'tickets.status',               status,           count(*) from tickets            group by 1,2
order by 1, 3 desc;
