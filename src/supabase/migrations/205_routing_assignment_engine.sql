-- 205_routing_assignment_engine.sql
-- Configurable routing / assignment engine.
--
-- A small, reusable layer that maps a TRIGGER (a match-spec over an attribute
-- bag describing some item) to an AUTHORITY (a role + department), so an item's
-- approver/assignee can be resolved from data instead of hard-coded logic.
-- The approver is materialized onto the item at write time (explicit, visible,
-- queryable) — consistent with the strict-RBAC doctrine (no hidden/implied
-- routing). First consumer: E-Voucher approval routing. The `domain` column
-- leaves room for a future 'ticket' consumer without schema change.

-- 1. Routing rules: trigger -> authority. First active rule (by priority) whose
--    trigger matches the item's attribute bag wins.
CREATE TABLE IF NOT EXISTS public.routing_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain      text    NOT NULL,                        -- 'evoucher' | 'ticket' | ...
  label       text    NOT NULL,                        -- human-readable description
  trigger     jsonb   NOT NULL DEFAULT '{}'::jsonb,    -- { field: value | [values] }; ALL must match (empty = catch-all)
  authority   jsonb   NOT NULL,                        -- { "department": "...", "role": "..."?, "scope": ...? }
  priority    integer NOT NULL DEFAULT 100,            -- lower evaluated first; first match wins
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routing_rules_domain_active
  ON public.routing_rules(domain, priority) WHERE active;

-- Config, not sensitive: any authenticated user may read rules (the client-side
-- resolver needs them). No write policy — rules are managed via migration/admin.
ALTER TABLE public.routing_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS routing_rules_read ON public.routing_rules;
CREATE POLICY routing_rules_read ON public.routing_rules
  FOR SELECT TO authenticated USING (true);

-- 2. Materialized approver on the E-Voucher (write-time, explicit, queryable).
--    Defaults to the requestor's department, so every existing queue is
--    byte-for-byte unchanged unless a routing rule redirects the voucher.
ALTER TABLE public.evouchers
  ADD COLUMN IF NOT EXISTS pending_approver_department text,
  ADD COLUMN IF NOT EXISTS pending_approver_role       text;

-- Backfill existing rows to today's implicit behavior (approver = requestor dept).
UPDATE public.evouchers
  SET pending_approver_department = details->>'requestor_department'
  WHERE pending_approver_department IS NULL;

-- Safety net: any insert path that doesn't explicitly set the column still gets
-- the default, so no voucher can silently fall out of an approval queue.
CREATE OR REPLACE FUNCTION public.set_evoucher_pending_approver()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.pending_approver_department IS NULL THEN
    NEW.pending_approver_department := NEW.details->>'requestor_department';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_evoucher_pending_approver ON public.evouchers;
CREATE TRIGGER trg_set_evoucher_pending_approver
  BEFORE INSERT ON public.evouchers
  FOR EACH ROW EXECUTE FUNCTION public.set_evoucher_pending_approver();

CREATE INDEX IF NOT EXISTS idx_evouchers_pending_approver_dept
  ON public.evouchers(pending_approver_department) WHERE status = 'pending_manager';

-- 3. Seed: forwarding-job expenses route to the Pricing Manager (not the
--    requestor's own Forwarding/Operations manager). Idempotent.
INSERT INTO public.routing_rules (domain, label, trigger, authority, priority)
SELECT
  'evoucher',
  'Forwarding-job expenses -> Pricing Manager',
  '{"booking_service_type": "Forwarding"}'::jsonb,
  '{"department": "Pricing", "role": "manager"}'::jsonb,
  10
WHERE NOT EXISTS (
  SELECT 1 FROM public.routing_rules
  WHERE domain = 'evoucher'
    AND trigger = '{"booking_service_type": "Forwarding"}'::jsonb
);
