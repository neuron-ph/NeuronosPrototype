-- 275 — Wave 0, part 3: deletion stops being the unguarded verb (finding M2)
--
-- Deletion was the least-tested verb in the system and the most destructive.
-- Twelve breaches, of which the shape that matters:
--
--   Delete one booking carrying a full money trail. Census before and after:
--     billing_line_items  5 rows, 0 NULL booking_id  ->  5 rows, 4 NULL
--     invoices            2 rows, 0 NULL             ->  2 rows, 2 NULL
--     collections         3 rows, 0 NULL             ->  3 rows, 3 NULL
--   NINE MONEY ROWS ORPHANED BY ONE CLICK. Nothing deleted, nothing raised.
--
-- That is L2 realised: every money-graph FK was ON DELETE SET NULL, so the parent
-- vanishes and its revenue, receivables and cash receipts survive with no booking
-- — and therefore no customer and no project — to attach them to. The schema did
-- not merely fail to prevent untenanted money. It manufactured it.
--
-- And the row-level guards were absent everywhere: not one delete policy consulted
-- a status, a child row, or a posting state.
--   * a requestor could delete her own DISBURSED voucher. Migration 270 froze the
--     status column so nobody can walk a voucher backwards — but DELETE is not a
--     transition. She could not un-disburse the cash; she could erase the record
--     that it ever left.
--   * an already-INVOICED billing line could be deleted, leaving the invoice
--     header claiming a total its lines no longer sum to.
--   * an invoice with a posted collection against it could be deleted, leaving
--     the collection posted=true with a NULL invoice_id — cash applied to nothing.
--
-- Two layers, because either alone leaves a door: the FK stops the cascade, the
-- policy stops the individual act. No backfill — these constrain future deletes.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The booking edge REFUSES rather than orphans
-- ─────────────────────────────────────────────────────────────────────────────
-- Deleting a booking that carries money must fail loudly and tell the caller
-- what is in the way. Void the documents first, or keep the booking.

alter table public.billing_line_items
  drop constraint if exists billing_line_items_booking_id_fkey,
  add  constraint billing_line_items_booking_id_fkey
       foreign key (booking_id) references public.bookings(id) on delete restrict;

alter table public.invoices
  drop constraint if exists invoices_booking_id_fkey,
  add  constraint invoices_booking_id_fkey
       foreign key (booking_id) references public.bookings(id) on delete restrict;

alter table public.collections
  drop constraint if exists collections_booking_id_fkey,
  add  constraint collections_booking_id_fkey
       foreign key (booking_id) references public.bookings(id) on delete restrict;

alter table public.evouchers
  drop constraint if exists evouchers_booking_id_fkey,
  add  constraint evouchers_booking_id_fkey
       foreign key (booking_id) references public.bookings(id) on delete restrict;

-- A collection is cash applied to an invoice. Deleting the invoice out from
-- under it is how you get a posted receipt pointing at nothing.
alter table public.collections
  drop constraint if exists collections_invoice_id_fkey,
  add  constraint collections_invoice_id_fkey
       foreign key (invoice_id) references public.invoices(id) on delete restrict;

alter table public.billing_line_items
  drop constraint if exists billing_line_items_invoice_id_fkey,
  add  constraint billing_line_items_invoice_id_fkey
       foreign key (invoice_id) references public.invoices(id) on delete restrict;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The row-level guards: what may be deleted, and when
-- ─────────────────────────────────────────────────────────────────────────────

-- An e-voucher is deletable only before it becomes a financial fact. Once it has
-- been disbursed, posted, or is mid-liquidation, it is a record of money moving
-- and the way out is a reversal, not an erasure. (NEU-096 already applies this
-- reasoning to CANCEL; delete simply never got it.)
drop policy if exists evouchers_delete on public.evouchers;
create policy evouchers_delete on public.evouchers
  for delete
  using (
    status in ('draft', 'rejected', 'cancelled')
    and (
      current_user_has_module_permission('acct_evouchers', 'delete')
      or (created_by = get_my_profile_id()
          and current_user_has_module_permission('my_evouchers', 'delete'))
    )
    and current_user_can_view_record('evouchers', created_by)
  );

-- A billing line that has been claimed by an invoice is part of that invoice's
-- total. Deleting it silently rewrites what the customer was billed.
drop policy if exists billing_line_items_delete on public.billing_line_items;
create policy billing_line_items_delete on public.billing_line_items
  for delete
  using (
    invoice_id is null
    and coalesce(lower(status), 'unbilled') not in ('invoiced', 'billed', 'paid')
    and current_user_can_billings('delete')
    and current_user_can_view_record('billings', null)
  );

-- An invoice with cash applied to it, or one that has been issued, is a document
-- the customer has seen. Void it; do not make it disappear.
drop policy if exists invoices_delete on public.invoices;
create policy invoices_delete on public.invoices
  for delete
  using (
    not exists (select 1 from public.collections c where c.invoice_id = invoices.id)
    and coalesce(lower(status), 'draft') not in ('posted', 'sent', 'open', 'paid')
    and current_user_can_invoices('delete')
    and current_user_can_view_record('invoices', created_by)
  );

comment on policy evouchers_delete on public.evouchers is
  'Deletable only before the voucher is a financial fact (draft/rejected/cancelled). '
  'Migration 275, finding M2: 270 froze the status column, but DELETE is not a transition.';
