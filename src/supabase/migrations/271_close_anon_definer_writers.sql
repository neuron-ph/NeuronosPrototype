-- 271 — close the anonymous write path (findings H1, H2, H4)
--
-- H2 (critical): `send_billing_items_to_booking` inserts into
-- billing_line_items as its owner, bypassing every policy on the table, and was
-- reachable by an UNAUTHENTICATED caller. It is not unguarded — it opens with
--
--   IF v_department NOT IN ('Business Development','Pricing','Accounting','Executive')
--     THEN RAISE EXCEPTION 'Not authorized...'
--
-- but for a caller with no session `get_my_department()` returns NULL, and in
-- SQL `NULL NOT IN (...)` evaluates to NULL, not TRUE. The IF never fires. The
-- check was invisible to precisely the caller it was written to stop.
--
-- Proved rather than inferred: an anonymous client called it with a real
-- booking and project on dev and got {"inserted_count": 1}. Pinned as adversary
-- probe F2.
--
-- H1: `clone_introspect()` returns the whole live schema (121 tables) as JSON
-- and was likewise reachable anonymously. Its siblings clone_exec_sql and
-- clone_query were already restricted to service_role; this one was missed.
--
-- Three fixes, because any one of them alone is a single point of failure:
--   1. Revoke EXECUTE from PUBLIC and anon. Note `=X/postgres` in proacl means
--      PUBLIC, and every role including anon is a member of PUBLIC — revoking
--      from anon alone leaves the function reachable.
--   2. Rewrite the guard so a NULL department cannot slip past it, and check a
--      GRANT rather than a department string (H4: gating on department let any
--      BD/Pricing/Accounting/Executive user bypass the billings permission
--      model entirely, regardless of their own grants or visibility dial).
--   3. Reject an unauthenticated caller explicitly, first thing.
--
-- `authenticated` and `service_role` keep their own explicit grants, so the app
-- and scripts/clone-prod-to-dev.mjs are unaffected.
--
-- Applied to prod on the same day, with permission, as two REVOKE statements
-- (migrations revoke_anon_execute_on_definer_writers and
-- revoke_public_execute_on_definer_writers). The guard rewrite below is dev-only
-- until it ships with the next release.

-- ── 1. Nothing anonymous reaches a definer writer ────────────────────────────
revoke execute on function public.send_billing_items_to_booking(text, text, jsonb) from public, anon;
revoke execute on function public.clone_introspect() from public, anon;

-- ── 2 + 3. The guard itself ──────────────────────────────────────────────────
create or replace function public.send_billing_items_to_booking(
  p_booking_id text,
  p_project_number text,
  p_items jsonb
)
returns table(inserted_count integer, updated_count integer)
language plpgsql
security definer
set search_path to 'public'
as $$
DECLARE
  v_department TEXT;
  v_project_id TEXT;
  v_booking_project_id TEXT;
  v_booking_number TEXT;
  v_item JSONB;
  v_item_id TEXT;
  v_is_virtual BOOLEAN;
  v_currency TEXT;
  v_amount NUMERIC;
  v_rate NUMERIC;
  v_rate_date DATE;
  v_base_amount NUMERIC;
  v_inserted_count INTEGER := 0;
  v_updated_count INTEGER := 0;
BEGIN
  -- H2: refuse the anonymous caller outright rather than relying on a
  -- comparison that silently evaluates to NULL for them.
  IF auth.uid() IS NULL OR public.get_my_profile_id() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- H4: a grant, not a department string. This function writes billing lines
  -- with RLS switched off, so it must ask the same question the billings
  -- policies ask. The department check is kept as a second, narrower condition
  -- rather than the only one.
  v_department := public.get_my_department();
  IF NOT public.current_user_can_billings('create')
     OR v_department IS NULL
     OR v_department NOT IN ('Business Development', 'Pricing', 'Accounting', 'Executive')
  THEN
    RAISE EXCEPTION 'Not authorized to send billing items to booking'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF COALESCE(BTRIM(p_booking_id), '') = '' THEN
    RAISE EXCEPTION 'Booking id is required';
  END IF;
  IF COALESCE(BTRIM(p_project_number), '') = '' THEN
    RAISE EXCEPTION 'Project number is required';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Items payload must be a JSON array';
  END IF;

  SELECT id INTO v_project_id FROM projects WHERE project_number = p_project_number;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Project % not found', p_project_number;
  END IF;

  SELECT project_id, booking_number INTO v_booking_project_id, v_booking_number
  FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id;
  END IF;
  IF v_booking_project_id IS NOT NULL AND v_booking_project_id <> v_project_id THEN
    RAISE EXCEPTION 'Booking % is not linked to project %', p_booking_id, p_project_number;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := NULLIF(v_item->>'id', '');
    v_is_virtual := COALESCE(NULLIF(v_item->>'is_virtual', '')::BOOLEAN, FALSE)
      OR COALESCE(v_item_id LIKE 'virtual-%', FALSE)
      OR COALESCE(v_item_id LIKE 'temp-%', FALSE);

    IF v_is_virtual THEN
      v_currency := COALESCE(NULLIF(v_item->>'currency', ''), 'PHP');
      v_amount := COALESCE(NULLIF(v_item->>'amount', '')::NUMERIC, 0);
      v_rate := COALESCE(NULLIF(v_item->>'exchange_rate', '')::NUMERIC, 1);
      v_rate_date := COALESCE(NULLIF(v_item->>'exchange_rate_date', '')::DATE, CURRENT_DATE);

      IF v_currency = 'PHP' THEN
        v_base_amount := v_amount;
      ELSIF v_rate IS NOT NULL AND v_rate > 0 THEN
        v_base_amount := ROUND(v_amount * v_rate, 2);
      ELSE
        v_base_amount := v_amount;
      END IF;

      INSERT INTO billing_line_items (
        id, booking_id, booking_number, project_number, description, service_type,
        category, quotation_category, amount, quantity, currency, original_currency,
        exchange_rate, exchange_rate_date, base_currency, base_amount, status, is_taxed,
        source_quotation_item_id, source_type, catalog_item_id, catalog_snapshot, created_at
      )
      VALUES (
        gen_random_uuid()::TEXT, p_booking_id, v_booking_number, p_project_number,
        COALESCE(v_item->>'description', ''),
        NULLIF(v_item->>'service_type', ''),
        COALESCE(NULLIF(v_item->>'category', ''), NULLIF(v_item->>'quotation_category', ''), 'Uncategorized'),
        NULLIF(v_item->>'quotation_category', ''),
        v_amount,
        COALESCE(NULLIF(v_item->>'quantity', '')::NUMERIC, 1),
        v_currency, v_currency,
        CASE WHEN v_currency = 'PHP' THEN 1 ELSE NULLIF(v_rate, 0) END,
        v_rate_date, 'PHP', v_base_amount,
        COALESCE(NULLIF(v_item->>'status', ''), 'unbilled'),
        COALESCE(NULLIF(v_item->>'is_taxed', '')::BOOLEAN, FALSE),
        NULLIF(v_item->>'source_quotation_item_id', ''),
        COALESCE(NULLIF(v_item->>'source_type', ''),
          CASE WHEN NULLIF(v_item->>'source_quotation_item_id', '') IS NOT NULL THEN 'quotation_item' ELSE 'manual' END),
        NULLIF(v_item->>'catalog_item_id', ''),
        COALESCE(v_item->'catalog_snapshot', '{}'::JSONB),
        COALESCE(NULLIF(v_item->>'created_at', '')::TIMESTAMPTZ, NOW())
      );

      v_inserted_count := v_inserted_count + 1;
    ELSE
      IF v_item_id IS NULL THEN
        RAISE EXCEPTION 'Persisted billing items must include an id';
      END IF;
      UPDATE billing_line_items
      SET booking_id = p_booking_id,
          booking_number = COALESCE(v_booking_number, booking_number),
          updated_at = NOW()
      WHERE id = v_item_id AND project_number = p_project_number;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Billing item % not found for project %', v_item_id, p_project_number;
      END IF;
      v_updated_count := v_updated_count + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_inserted_count, v_updated_count;
END;
$$;

-- CREATE OR REPLACE resets the ACL to the default (PUBLIC EXECUTE), so the
-- revoke has to come after it as well as before.
revoke execute on function public.send_billing_items_to_booking(text, text, jsonb) from public, anon;
grant execute on function public.send_billing_items_to_booking(text, text, jsonb) to authenticated, service_role;
