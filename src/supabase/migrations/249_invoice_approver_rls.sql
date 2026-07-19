-- Migration 249: let the tagged invoice approver see and approve the invoice.
--
-- NEU-103 routes an invoice to an approver (materialized as
-- pending_approver_department/role), but the invoices RLS had no approver
-- carve-out: SELECT was creator/visibility-only, so the designated approver (e.g.
-- the Operations manager) could not even find the invoice — the approval loop was
-- unfulfillable from her seat. This is the keystone for the Approvals module: the
-- approval assignment itself grants the access.
--
-- Approver match mirrors InvoiceBuilder.canApproveInvoice exactly:
--   (my dept = pending dept AND (no role required OR my role = pending role))
--   OR I'm Executive.

CREATE OR REPLACE FUNCTION public.is_invoice_approver_of(
  p_pending_dept text, p_pending_role text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    ( p_pending_dept = get_my_department()
      AND (p_pending_role IS NULL OR p_pending_role = get_my_role()) )
    OR get_my_department() = 'Executive';
$$;

-- SELECT carve-out — the pending approver (or any Executive) can read the invoice
-- so it surfaces in the Approvals module and can be reviewed.
DROP POLICY IF EXISTS invoices_select_approver ON public.invoices;
CREATE POLICY invoices_select_approver ON public.invoices
  FOR SELECT
  TO authenticated
  USING (
    approval_status = 'pending_approval'
    AND public.is_invoice_approver_of(pending_approver_department, pending_approver_role)
  );

-- The actual approval is a privileged transition, done via a SECURITY DEFINER RPC
-- rather than a direct UPDATE. This keeps the authorization in one auditable place
-- and sidesteps the invoices UPDATE RLS (which is keyed on general invoice-edit +
-- record visibility, not on "am I this invoice's approver"). The function enforces
-- the same approver check, then flips pending_approval -> approved.
DROP POLICY IF EXISTS invoices_update_approver ON public.invoices;

CREATE OR REPLACE FUNCTION public.approve_invoice(p_invoice_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE inv RECORD;
BEGIN
  SELECT id, approval_status, pending_approver_department, pending_approver_role
    INTO inv FROM public.invoices WHERE id = p_invoice_id;
  IF inv.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;
  IF inv.approval_status IS DISTINCT FROM 'pending_approval' THEN
    RAISE EXCEPTION 'Invoice is not pending approval';
  END IF;
  IF NOT public.is_invoice_approver_of(inv.pending_approver_department, inv.pending_approver_role) THEN
    RAISE EXCEPTION 'You are not the designated approver for this invoice';
  END IF;
  UPDATE public.invoices
    SET approval_status = 'approved',
        approved_by = get_my_profile_id(),
        approved_at = now(),
        updated_at = now()
    WHERE id = p_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_invoice(text) TO authenticated;
