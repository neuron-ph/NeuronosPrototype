-- Migration 266: fault attribution on charges, and the demurrage / detention /
-- storage resolvers that depend on it. ~20% of company-wide weight.
--
-- THE GUIDE'S RULE
--
--   "Charges, penalties and lapses are counted only when attributable to the
--    employee's own delay, error or negligence."
--
-- So a charge amount alone is not a KPI input. ₱42,000 of demurrage caused by a
-- red-lane examination is not the declarant's failure. Without a verdict the
-- number is not merely imprecise, it is measuring the wrong thing.
--
-- TWO PIECES
--
-- 1. catalog_items.kpi_charge_class — which items ARE these charges. Matching on
--    name (LIKE '%DEMURRAGE%') was never viable: the catalog blends charge types
--    into single items, so the class has to be an attribute someone sets, in
--    keeping with the catalog-as-data doctrine.
--
-- 2. evoucher_line_items fault fields — the verdict, who reached it, and why.
--
-- THE BLENDED PROBLEM, HANDLED HONESTLY
--
-- 23 of 30 storage-bearing line items use items that bundle storage with
-- arrastre and wharfage:
--
--     PC (ARRASTRE, WHARFAGE DUE & STORAGE FEE)          13 uses
--     WC (STORAGE & OTHER FEES)                           9 uses
--     PC (ARRASTRE, WHARFAGE DUE, REEFER & STORAGE FEE)   1 use
--
-- The storage portion cannot be extracted, so these are classed 'blended': not
-- silently dropped (which would compute Storage off 20% of the data while
-- looking complete), and not guessed at. They are counted, surfaced, and they
-- hold the KPI open until Falcons splits the items. That is their decision to
-- make; this migration only stops the system pretending it does not matter.

ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS kpi_charge_class TEXT
  CHECK (kpi_charge_class IN ('demurrage','detention','storage','penalty','blended'));

COMMENT ON COLUMN catalog_items.kpi_charge_class IS
  'Which KPI charge this item represents. "blended" means it mixes a KPI charge with other charges and cannot be attributed.';

-- Clean items: one charge type each.
UPDATE catalog_items SET kpi_charge_class = 'demurrage' WHERE id = 'ci-1779683651652'; -- DLC (DEMURRAGE)
UPDATE catalog_items SET kpi_charge_class = 'detention' WHERE id = 'ci-1779683632907'; -- DLC (DETENTION)
UPDATE catalog_items SET kpi_charge_class = 'storage'   WHERE id = 'ci-1779683818303'; -- PC (STORAGE FEE)
UPDATE catalog_items SET kpi_charge_class = 'penalty'
  WHERE id IN ('ci-1779684845014',  -- CC (PENALTY)
               'ci-1779684967095',  -- TC (OTHER PENALTY)
               'ci-1779684200527'); -- DELIVERY EXPENSES (PENALTY)

-- Blended: contain a KPI charge plus others, inseparable.
UPDATE catalog_items SET kpi_charge_class = 'blended'
  WHERE id IN ('ci-1779683775751',  -- PC (ARRASTRE, WHARFAGE DUE & STORAGE FEE)
               'ci-1779683934697',  -- WC (STORAGE & OTHER FEES)
               'ci-1779683801529'); -- PC (ARRASTRE, WHARFAGE DUE, REEFER & STORAGE FEE)

-- Deliberately left NULL: PC (ARRASTRE & WHARFAGE DUE) and the reefer variant
-- carry no KPI charge at all, so they are not this feature's business.

-- ─── The verdict ─────────────────────────────────────────────────────────────

ALTER TABLE evoucher_line_items
  ADD COLUMN IF NOT EXISTS fault_class         TEXT
    CHECK (fault_class IN ('internal','external')),
  ADD COLUMN IF NOT EXISTS fault_owner_user_id TEXT,
  ADD COLUMN IF NOT EXISTS fault_reason        TEXT,
  ADD COLUMN IF NOT EXISTS fault_tagged_by     TEXT,
  ADD COLUMN IF NOT EXISTS fault_tagged_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS evoucher_line_items_fault_idx
  ON evoucher_line_items(fault_class, fault_owner_user_id);

COMMENT ON COLUMN evoucher_line_items.fault_class IS
  'NULL means not yet reviewed. NULL is NOT "no fault" — untagged charges hold the KPI open rather than scoring as clean.';

-- ─── Proposal ────────────────────────────────────────────────────────────────
--
-- The reviewer should not face a blank verdict. Where the milestones already show
-- a breach on the same booking, internal fault is the high-confidence reading and
-- the evidence is handed over with it. The human still confirms; they are just
-- not asked to reconstruct it from memory.

CREATE OR REPLACE FUNCTION kpi_propose_fault(p_line_item_id TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp AS $fn$
DECLARE
  v_booking TEXT; v_class TEXT;
  v_lodged TIMESTAMPTZ; v_start TIMESTAMPTZ; v_returned TIMESTAMPTZ; v_validity TIMESTAMPTZ;
  v_hours NUMERIC;
BEGIN
  SELECT COALESCE(eli.booking_id, ev.booking_id), ci.kpi_charge_class
    INTO v_booking, v_class
  FROM evoucher_line_items eli
  LEFT JOIN evouchers ev ON ev.id = eli.evoucher_id
  LEFT JOIN catalog_items ci ON ci.id = eli.catalog_item_id
  WHERE eli.id = p_line_item_id;

  IF v_booking IS NULL OR v_class IS NULL THEN
    RETURN jsonb_build_object('proposal', NULL, 'why', 'No booking or charge class on this line.');
  END IF;

  IF v_class IN ('demurrage','detention') THEN
    v_lodged := kpi_milestone_at(v_booking, 'lodgment');
    v_start  := GREATEST(COALESCE(kpi_milestone_at(v_booking, 'final_docs'), '-infinity'::timestamptz),
                         COALESCE(kpi_milestone_at(v_booking, 'manifest'),   '-infinity'::timestamptz));
    IF v_lodged IS NOT NULL AND v_start > '-infinity'::timestamptz THEN
      v_hours := EXTRACT(EPOCH FROM (v_lodged - v_start)) / 3600.0;
      IF v_hours > 24 THEN
        RETURN jsonb_build_object('proposal','internal',
          'why', format('Lodgment took %s hrs against a 24 hr target on the same booking.',
                        ROUND(v_hours, 1)));
      END IF;
    END IF;

    v_returned := kpi_milestone_at(v_booking, 'empty_returned');
    SELECT NULLIF(b.details ->> 'det_dem_validity','')::timestamptz INTO v_validity
      FROM bookings b WHERE b.id = v_booking;
    IF v_returned IS NOT NULL AND v_validity IS NOT NULL AND v_returned > v_validity THEN
      RETURN jsonb_build_object('proposal','internal',
        'why','Empty return was later than the detention/demurrage validity date.');
    END IF;
  END IF;

  -- No supporting breach found. Deliberately NOT proposing "external": absence of
  -- evidence is not evidence of absence, and a default of external would quietly
  -- clear every charge nobody looked at.
  RETURN jsonb_build_object('proposal', NULL,
    'why', 'No milestone breach found on this booking. Needs a human read.');
END;
$fn$;

-- ─── Resolvers ───────────────────────────────────────────────────────────────
--
-- One shared body, three thin wrappers.
--
-- UNTAGGED HOLDS THE KPI OPEN. If any charge of this class on this person's
-- bookings is unreviewed (or blended, and so unattributable), the resolver
-- returns NULL and the KPI EXCLUDES itself with a reason. Scoring the tagged
-- subset would produce a clean-looking number that had simply ignored the
-- charges nobody had got to yet.

CREATE OR REPLACE FUNCTION kpi_metric_charge_class(
  p_user_id TEXT, p_start DATE, p_end DATE, p_class TEXT
) RETURNS TABLE (actual NUMERIC, display TEXT, evidence JSONB)
LANGUAGE sql STABLE AS $fn$
WITH lines AS (
  SELECT eli.id, eli.amount, eli.particular, eli.fault_class, eli.fault_owner_user_id,
         eli.fault_reason, ci.kpi_charge_class AS cls, ci.name AS item,
         COALESCE(eli.booking_id, ev.booking_id) AS booking_id,
         b.booking_number, ev.evoucher_number,
         COALESCE(ev.posted_at, ev.approved_at, ev.created_at) AS charged_at
  FROM evoucher_line_items eli
  JOIN catalog_items ci ON ci.id = eli.catalog_item_id
  LEFT JOIN evouchers ev ON ev.id = eli.evoucher_id
  LEFT JOIN bookings b ON b.id = COALESCE(eli.booking_id, ev.booking_id)
  WHERE ci.kpi_charge_class IN (p_class, 'blended')
),
mine AS (
  SELECT l.* FROM lines l
  WHERE COALESCE(
          l.fault_owner_user_id,
          kpi_booking_owner(l.booking_id,
            ARRAY['customs_declarant','handler','impex_officer',
                  'operations_supervisor','admin_logistics'])
        ) = p_user_id
    AND l.charged_at >= p_start AND l.charged_at < (p_end + 1)
),
tally AS (
  SELECT
    count(*) FILTER (WHERE cls = 'blended')                          AS blended,
    count(*) FILTER (WHERE cls = p_class AND fault_class IS NULL)    AS untagged,
    COALESCE(sum(amount) FILTER (WHERE cls = p_class AND fault_class = 'internal'), 0) AS internal_total
  FROM mine
)
SELECT
  CASE WHEN (SELECT blended + untagged FROM tally) > 0 THEN NULL
       ELSE (SELECT internal_total FROM tally) END,
  CASE
    WHEN (SELECT blended + untagged FROM tally) > 0 THEN
      trim(concat_ws(' · ',
        NULLIF((SELECT untagged FROM tally), 0) || ' awaiting fault review',
        NULLIF((SELECT blended FROM tally), 0)  || ' on blended catalog items'))
    WHEN (SELECT internal_total FROM tally) = 0 THEN 'None due to internal fault'
    ELSE 'PHP ' || to_char((SELECT internal_total FROM tally), 'FM999,999,999') || ' due to internal fault'
  END,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'line_item_id', id, 'item', item, 'particular', particular, 'amount', amount,
    'booking', booking_number, 'evoucher', evoucher_number, 'charged_at', charged_at,
    'charge_class', cls, 'fault_class', fault_class, 'fault_reason', fault_reason
  ) ORDER BY amount DESC) FROM mine), '[]'::jsonb);
$fn$;

CREATE OR REPLACE FUNCTION kpi_metric_charge_demurrage(p_user_id TEXT, p_start DATE, p_end DATE)
RETURNS TABLE (actual NUMERIC, display TEXT, evidence JSONB)
LANGUAGE sql STABLE AS $fn$
  SELECT * FROM kpi_metric_charge_class(p_user_id, p_start, p_end, 'demurrage');
$fn$;

CREATE OR REPLACE FUNCTION kpi_metric_charge_detention(p_user_id TEXT, p_start DATE, p_end DATE)
RETURNS TABLE (actual NUMERIC, display TEXT, evidence JSONB)
LANGUAGE sql STABLE AS $fn$
  SELECT * FROM kpi_metric_charge_class(p_user_id, p_start, p_end, 'detention');
$fn$;

CREATE OR REPLACE FUNCTION kpi_metric_charge_storage(p_user_id TEXT, p_start DATE, p_end DATE)
RETURNS TABLE (actual NUMERIC, display TEXT, evidence JSONB)
LANGUAGE sql STABLE AS $fn$
  SELECT * FROM kpi_metric_charge_class(p_user_id, p_start, p_end, 'storage');
$fn$;

-- ─── Tagging ─────────────────────────────────────────────────────────────────
--
-- Owner: the handler's SUPERVISOR, at liquidation review. Not the handler —
-- self-assessing fault on 30% of your own scorecard is not a control. Gated on
-- hr_performance:edit, the same grant that lets someone set a rating.

CREATE OR REPLACE FUNCTION tag_charge_fault(
  p_line_item_id TEXT, p_fault_class TEXT, p_reason TEXT DEFAULT NULL,
  p_owner_user_id TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_actor TEXT; v_owner TEXT; v_booking TEXT;
BEGIN
  IF NOT kpi_can_evaluate() THEN
    RAISE EXCEPTION 'You do not have permission to attribute fault.' USING ERRCODE = '42501';
  END IF;
  IF p_fault_class IS NOT NULL AND p_fault_class NOT IN ('internal','external') THEN
    RAISE EXCEPTION 'Fault must be internal or external.' USING ERRCODE = '22023';
  END IF;
  -- Blaming somebody needs a reason on the record; clearing a charge does not.
  IF p_fault_class = 'internal' AND NULLIF(p_reason,'') IS NULL THEN
    RAISE EXCEPTION 'Attributing internal fault needs a reason.' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_actor FROM users WHERE auth_id = auth.uid();
  SELECT COALESCE(eli.booking_id, ev.booking_id) INTO v_booking
  FROM evoucher_line_items eli LEFT JOIN evouchers ev ON ev.id = eli.evoucher_id
  WHERE eli.id = p_line_item_id;

  v_owner := COALESCE(p_owner_user_id,
    kpi_booking_owner(v_booking, ARRAY['customs_declarant','handler','impex_officer',
                                       'operations_supervisor','admin_logistics']));

  UPDATE evoucher_line_items SET
    fault_class = p_fault_class,
    fault_owner_user_id = CASE WHEN p_fault_class = 'internal' THEN v_owner END,
    fault_reason = NULLIF(p_reason,''),
    fault_tagged_by = v_actor,
    fault_tagged_at = now()
  WHERE id = p_line_item_id;

  RETURN jsonb_build_object('ok', true, 'fault_class', p_fault_class, 'owner', v_owner);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION kpi_metric_charge_class(TEXT, DATE, DATE, TEXT)  FROM authenticated;
REVOKE EXECUTE ON FUNCTION kpi_metric_charge_demurrage(TEXT, DATE, DATE)    FROM authenticated;
REVOKE EXECUTE ON FUNCTION kpi_metric_charge_detention(TEXT, DATE, DATE)    FROM authenticated;
REVOKE EXECUTE ON FUNCTION kpi_metric_charge_storage(TEXT, DATE, DATE)      FROM authenticated;
GRANT EXECUTE ON FUNCTION kpi_propose_fault(TEXT)                    TO authenticated;
GRANT EXECUTE ON FUNCTION tag_charge_fault(TEXT, TEXT, TEXT, TEXT)   TO authenticated;
