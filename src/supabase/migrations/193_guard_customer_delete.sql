-- 193_guard_customer_delete.sql
--
-- Systemic fix for orphaned business records (NEU-020-class data integrity).
--
-- Problem: every FK pointing at `customers` is ON DELETE SET NULL
-- (quotations, projects, bookings, invoices, collections, evouchers, contacts)
-- or ON DELETE CASCADE (consignees). So deleting a customer that still has
-- live records SILENTLY orphaned them (customer_id nulled, only the
-- denormalized customer_name text left) and CASCADE-deleted its consignees.
-- A 34-customer purge on 2026-05-25 orphaned 14 quotations + their projects
-- and destroyed the consignees the booking flow needs (e.g. PRJ-504417 /
-- AF PHILIPPINES).
--
-- Fix: a BEFORE DELETE trigger that BLOCKS the delete when the customer still
-- has business/financial records. Enforced at the database so it holds for
-- every path (app, REST, MCP) — not just the UI. SECURITY DEFINER so the
-- integrity count is not narrowed by the caller's RLS. Ancillary owned records
-- (contacts, consignees, tasks, crm_activities, attachments) intentionally do
-- NOT block — a customer reasonably owns those — but they cannot be reached
-- anyway while business records keep the customer undeletable.

create or replace function public.guard_customer_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quotations  int;  -- includes inquiries + contracts (same table)
  v_projects    int;
  v_bookings    int;
  v_invoices    int;
  v_collections int;
  v_evouchers   int;
  v_total       int;
begin
  select count(*) into v_quotations  from public.quotations  where customer_id = old.id;
  select count(*) into v_projects    from public.projects    where customer_id = old.id;
  select count(*) into v_bookings    from public.bookings    where customer_id = old.id;
  select count(*) into v_invoices    from public.invoices    where customer_id = old.id;
  select count(*) into v_collections from public.collections where customer_id = old.id;
  select count(*) into v_evouchers   from public.evouchers   where customer_id = old.id;

  v_total := v_quotations + v_projects + v_bookings + v_invoices + v_collections + v_evouchers;

  if v_total > 0 then
    raise exception
      'Cannot delete customer "%": it still has % linked record(s) — % quotation/inquiry, % project, % booking, % invoice, % collection, % e-voucher. Reassign or remove those first.',
      coalesce(old.name, old.id::text), v_total,
      v_quotations, v_projects, v_bookings, v_invoices, v_collections, v_evouchers
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_guard_customer_delete on public.customers;
create trigger trg_guard_customer_delete
before delete on public.customers
for each row execute function public.guard_customer_delete();
