-- Migration 265: manual entry, so `logged` and `judgment` KPIs can be scored.
--
-- Every KPI whose source is 'logged' or 'judgment' already works: get_kpi_scorecard
-- reads actual_value / rating straight out of kpi_scores. What was missing was any
-- way to put them there. That is roughly 36% of company-wide weight sitting at
-- "Awaiting evaluation" for want of a form:
--
--     BDD 47% · Trucking 46% · Forwarding 35% · Brokerage 30% · Pricing 20%
--
-- WRITE IS A SEPARATE GRANT from read. Seeing a scorecard and deciding somebody's
-- rating are different powers, so this is gated on hr_performance:EDIT while the
-- surfaces are gated on :view.
--
-- Auto KPIs are refused outright: their actual comes from a resolver, and letting
-- an evaluator hand-type over a computed number would quietly destroy the reason
-- the engine exists. Overriding a computed RATING is allowed, with a reason.

CREATE OR REPLACE FUNCTION kpi_can_evaluate()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $fn$
  SELECT auth.uid() IS NULL
      OR current_user_has_module_permission('hr_performance', 'edit');
$fn$;

CREATE OR REPLACE FUNCTION save_kpi_manual_entry(
  p_user_id         TEXT,
  p_period_id       TEXT,
  p_definition_id   TEXT,
  p_actual_value    NUMERIC DEFAULT NULL,
  p_actual_display  TEXT    DEFAULT NULL,
  p_rating          SMALLINT DEFAULT NULL,
  p_override_reason TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_def       kpi_definitions%ROWTYPE;
  v_period    kpi_periods%ROWTYPE;
  v_evaluator TEXT;
  v_suggested SMALLINT;
  v_display   TEXT;
  v_num       TEXT;
BEGIN
  IF NOT kpi_can_evaluate() THEN
    RAISE EXCEPTION 'You do not have permission to evaluate scorecards.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_def FROM kpi_definitions WHERE id = p_definition_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown KPI.' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_period FROM kpi_periods WHERE id = p_period_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown period.' USING ERRCODE = '22023'; END IF;

  -- A locked period is signed. Corrections belong in an amendment, not an edit.
  IF v_period.status = 'locked' THEN
    RAISE EXCEPTION 'This period is locked. Reopen it to make changes.'
      USING ERRCODE = '22023';
  END IF;

  -- The scorecard must actually apply to this person, or a supervisor could
  -- score a declarant against the Pricing sheet.
  IF kpi_scorecard_key_for_user(p_user_id) IS DISTINCT FROM v_def.scorecard_key THEN
    RAISE EXCEPTION 'That KPI does not belong to this person''s scorecard.'
      USING ERRCODE = '22023';
  END IF;

  IF v_def.source = 'auto' AND p_actual_value IS NOT NULL THEN
    RAISE EXCEPTION 'This KPI is measured automatically. Its actual cannot be typed in.'
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_evaluator FROM users WHERE auth_id = auth.uid();

  v_suggested := kpi_suggest_rating(
    p_actual_value, v_def.target_value, v_def.direction, v_def.rating_thresholds);

  -- Disagreeing with the suggestion is allowed; doing it silently is not.
  IF p_rating IS NOT NULL AND v_suggested IS NOT NULL
     AND p_rating <> v_suggested AND NULLIF(p_override_reason, '') IS NULL THEN
    RAISE EXCEPTION 'A rating that differs from the suggested one needs a reason.'
      USING ERRCODE = '22023';
  END IF;

  -- Whole numbers render as "0" / "3", not "0." — FM strips the trailing zero
  -- but leaves the decimal point behind.
  v_num := CASE
    WHEN p_actual_value IS NULL THEN NULL
    WHEN p_actual_value = trunc(p_actual_value) THEN trunc(p_actual_value)::bigint::text
    ELSE trim(to_char(p_actual_value, 'FM999999990.9')) END;

  v_display := COALESCE(
    NULLIF(p_actual_display, ''),
    CASE WHEN v_num IS NULL THEN NULL
         ELSE v_num || CASE v_def.target_unit WHEN 'pct' THEN '%'
                                              WHEN 'incidents' THEN ' recorded'
                                              ELSE '' END END,
    CASE WHEN v_def.source = 'judgment' THEN 'Supervisor evaluation' END);

  INSERT INTO kpi_scores (
    id, period_id, user_id, kpi_definition_id, weight_pct_snapshot,
    actual_value, actual_display, actual_source, actual_computed_at,
    suggested_rating, rating, override_reason, evaluated_by, evaluated_at, updated_at)
  VALUES (
    'kpis-' || p_period_id || '-' || p_user_id || '-' || p_definition_id,
    p_period_id, p_user_id, p_definition_id, v_def.weight_pct,
    p_actual_value, v_display, 'manual', now(),
    v_suggested, COALESCE(p_rating, v_suggested), NULLIF(p_override_reason, ''),
    v_evaluator, now(), now())
  ON CONFLICT (period_id, user_id, kpi_definition_id) DO UPDATE SET
    actual_value       = EXCLUDED.actual_value,
    actual_display     = EXCLUDED.actual_display,
    actual_source      = 'manual',
    actual_computed_at = now(),
    suggested_rating   = EXCLUDED.suggested_rating,
    rating             = EXCLUDED.rating,
    override_reason    = EXCLUDED.override_reason,
    evaluated_by       = EXCLUDED.evaluated_by,
    evaluated_at       = now(),
    updated_at         = now();

  RETURN jsonb_build_object(
    'ok', true, 'suggested_rating', v_suggested,
    'rating', COALESCE(p_rating, v_suggested), 'actual_display', v_display);
END;
$fn$;

-- Clearing an entry, so a mistake can be undone rather than overwritten with a
-- guess. Auto KPIs recompute; manual ones go back to "Awaiting evaluation".
CREATE OR REPLACE FUNCTION clear_kpi_manual_entry(
  p_user_id TEXT, p_period_id TEXT, p_definition_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_status TEXT;
BEGIN
  IF NOT kpi_can_evaluate() THEN
    RAISE EXCEPTION 'You do not have permission to evaluate scorecards.'
      USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status FROM kpi_periods WHERE id = p_period_id;
  IF v_status = 'locked' THEN
    RAISE EXCEPTION 'This period is locked. Reopen it to make changes.'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM kpi_scores
  WHERE period_id = p_period_id AND user_id = p_user_id
    AND kpi_definition_id = p_definition_id;

  RETURN jsonb_build_object('ok', true);
END;
$fn$;

GRANT EXECUTE ON FUNCTION kpi_can_evaluate() TO authenticated;
GRANT EXECUTE ON FUNCTION save_kpi_manual_entry(TEXT,TEXT,TEXT,NUMERIC,TEXT,SMALLINT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION clear_kpi_manual_entry(TEXT,TEXT,TEXT) TO authenticated;
