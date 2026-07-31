-- Migration 261: the executive surface.
--
-- Two changes.
--
-- 1. get_kpi_scorecard's guard widens from "self only" to "self OR holds
--    hr_performance:view". Reading someone else's card was always meant to be a
--    separate door rather than a widened version of My Scorecard (see 258); this
--    is that door being opened deliberately, gated on the same module grant the
--    Access Configuration matrix controls.
--
-- 2. get_kpi_org_overview: everyone the caller may see, grouped by department,
--    with the median and band distribution the strip plot needs, plus systemic
--    detection.
--
-- SYSTEMIC DETECTION is the reason this surface exists. When most of a department
-- misses the SAME KPI, the constraint is upstream and coaching individuals is the
-- wrong response. The threshold is a share of the department, so it scales from a
-- team of 2 to a team of 21.

CREATE OR REPLACE FUNCTION kpi_can_read_others()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $fn$
  SELECT auth.uid() IS NULL
      OR current_user_has_module_permission('hr_performance', 'view');
$fn$;

-- Widen the guard. Body is otherwise byte-identical to 258.
CREATE OR REPLACE FUNCTION get_kpi_scorecard(p_user_id TEXT, p_period_id TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $fn$
DECLARE
  v_caller TEXT; v_key TEXT; v_period kpi_periods%ROWTYPE; v_user users%ROWTYPE;
  d RECORD; v_actual NUMERIC; v_display TEXT; v_evidence JSONB;
  v_stored kpi_scores%ROWTYPE; v_suggested SMALLINT; v_rating SMALLINT;
  v_excluded BOOLEAN; v_excl_why TEXT; v_weighted NUMERIC; v_fn TEXT;
  v_kpis JSONB := '[]'::jsonb; v_incl_wt NUMERIC := 0; v_wt_sum NUMERIC := 0;
  v_excl_count INT := 0; v_score NUMERIC;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT kpi_can_read_others() THEN
    SELECT id INTO v_caller FROM users WHERE auth_id = auth.uid();
    IF v_caller IS NULL OR p_user_id IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'You can only read your own scorecard.' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'unknown user'); END IF;
  SELECT * INTO v_period FROM kpi_periods WHERE id = p_period_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'unknown period'); END IF;

  v_key := kpi_scorecard_key_for_user(p_user_id);
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('user_id', p_user_id, 'user_name', v_user.name,
      'scorecard_key', NULL, 'has_scorecard', false,
      'period', jsonb_build_object('id', v_period.id, 'label', v_period.label,
                                   'status', v_period.status),
      'kpis', '[]'::jsonb);
  END IF;

  FOR d IN
    SELECT * FROM kpi_definitions WHERE scorecard_key = v_key
      AND effective_from <= v_period.end_date
      AND (effective_to IS NULL OR effective_to >= v_period.start_date)
    ORDER BY sort_order
  LOOP
    v_actual := NULL; v_display := NULL; v_evidence := '[]'::jsonb;
    v_excluded := false; v_excl_why := NULL; v_stored := NULL;

    SELECT * INTO v_stored FROM kpi_scores
    WHERE period_id = p_period_id AND user_id = p_user_id AND kpi_definition_id = d.id;

    IF v_period.status = 'locked' AND v_stored.id IS NOT NULL THEN
      v_actual := v_stored.actual_value; v_display := v_stored.actual_display;
      v_evidence := COALESCE(v_stored.evidence, '[]'::jsonb);
      v_excluded := v_stored.excluded; v_excl_why := v_stored.excluded_reason;
    ELSIF d.metric_key IS NOT NULL AND d.source IN ('auto', 'proposed') THEN
      v_fn := 'kpi_metric_' || d.metric_key;
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = v_fn) THEN
        EXECUTE format('SELECT actual, display, evidence FROM %I($1,$2,$3)', v_fn)
          INTO v_actual, v_display, v_evidence
          USING p_user_id, v_period.start_date, v_period.end_date;
      ELSE v_display := 'Not yet measurable'; END IF;
    ELSE
      IF v_stored.id IS NOT NULL THEN
        v_actual := v_stored.actual_value; v_display := v_stored.actual_display;
        v_evidence := COALESCE(v_stored.evidence, '[]'::jsonb);
      ELSE v_display := 'Awaiting evaluation'; END IF;
    END IF;

    v_suggested := kpi_suggest_rating(v_actual, d.target_value, d.direction, d.rating_thresholds);
    v_rating := COALESCE(v_stored.rating, v_suggested);

    IF v_rating IS NULL AND NOT v_excluded THEN
      v_excluded := true;
      v_excl_why := COALESCE(NULLIF(v_display, ''), 'No data for this period');
    END IF;

    IF v_excluded THEN v_weighted := NULL; v_excl_count := v_excl_count + 1;
    ELSE
      v_weighted := ROUND(d.weight_pct * v_rating / 5.0, 2);
      v_incl_wt := v_incl_wt + d.weight_pct; v_wt_sum := v_wt_sum + v_weighted;
    END IF;

    v_kpis := v_kpis || jsonb_build_object(
      'definition_id', d.id, 'name', d.name, 'sort_order', d.sort_order,
      'weight_pct', d.weight_pct, 'source', d.source,
      'definition_text', d.definition_text, 'target_text', d.target_text,
      'measurement_text', d.measurement_text, 'actual', v_actual,
      'actual_display', v_display, 'suggested_rating', v_suggested, 'rating', v_rating,
      'is_override', (v_stored.rating IS NOT NULL AND v_stored.rating IS DISTINCT FROM v_suggested),
      'override_reason', v_stored.override_reason, 'excluded', v_excluded,
      'excluded_reason', v_excl_why, 'weighted_score', v_weighted,
      'points_lost', CASE WHEN v_excluded THEN NULL ELSE ROUND(d.weight_pct - v_weighted, 2) END,
      'evidence', COALESCE(v_evidence, '[]'::jsonb));
  END LOOP;

  v_score := CASE WHEN v_incl_wt > 0 THEN ROUND(v_wt_sum / v_incl_wt * 100, 1) END;

  RETURN jsonb_build_object(
    'user_id', p_user_id, 'user_name', v_user.name, 'department', v_user.department,
    'position', v_user.position, 'scorecard_key', v_key, 'has_scorecard', true,
    'period', jsonb_build_object('id', v_period.id, 'label', v_period.label,
      'status', v_period.status, 'start_date', v_period.start_date, 'end_date', v_period.end_date),
    'score', v_score,
    'band', CASE WHEN v_score IS NULL THEN NULL
                 WHEN v_score >= 90 THEN 'Outstanding'
                 WHEN v_score >= 80 THEN 'Very Satisfactory'
                 WHEN v_score >= 70 THEN 'Satisfactory'
                 WHEN v_score >= 60 THEN 'Needs Improvement'
                 ELSE 'Poor' END,
    'scored_on_pct', v_incl_wt, 'excluded_count', v_excl_count, 'kpis', v_kpis);
END;
$fn$;

-- ─── Org overview ────────────────────────────────────────────────────────────
--
-- Provisional cards (coverage below the threshold) are carried with a flag
-- rather than dropped: a department where half the people cannot be measured is
-- itself the finding, and silently omitting them would make coverage look better
-- than it is.

CREATE OR REPLACE FUNCTION get_kpi_org_overview(
  p_period_id TEXT, p_provisional_pct NUMERIC DEFAULT 50, p_systemic_pct NUMERIC DEFAULT 60
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $fn$
DECLARE
  v_period kpi_periods%ROWTYPE;
  u RECORD; v_card JSONB;
  v_people JSONB := '[]'::jsonb;
BEGIN
  IF NOT kpi_can_read_others() THEN
    RAISE EXCEPTION 'You do not have access to other people''s scorecards.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_period FROM kpi_periods WHERE id = p_period_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'unknown period'); END IF;

  FOR u IN
    SELECT id, name, position, department, service_type FROM users
    WHERE COALESCE(is_active, true)
      AND kpi_scorecard_key_for_user(id) IS NOT NULL
    ORDER BY name
  LOOP
    v_card := get_kpi_scorecard(u.id, p_period_id);
    v_people := v_people || jsonb_build_object(
      'user_id',       u.id,
      'name',          u.name,
      'position',      u.position,
      'scorecard_key', v_card ->> 'scorecard_key',
      'score',         v_card -> 'score',
      'band',          v_card -> 'band',
      'coverage',      v_card -> 'scored_on_pct',
      -- ->> not ->: `v_card -> 'score'` yields JSONB null for an unscored card,
      -- and JSONB null IS NOT NULL in SQL, which flagged every unscored person
      -- as provisional (38 of 39 on first run).
      'provisional',   (v_card ->> 'score') IS NOT NULL
                         AND (v_card ->> 'scored_on_pct')::numeric < p_provisional_pct,
      -- per-KPI ratings, so systemic detection does not need a second pass
      'ratings', (
        SELECT COALESCE(jsonb_object_agg(k ->> 'name', k -> 'rating'), '{}'::jsonb)
        FROM jsonb_array_elements(v_card -> 'kpis') k
        WHERE (k ->> 'excluded')::boolean = false
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('id', v_period.id, 'label', v_period.label,
                                 'status', v_period.status),
    'provisional_pct', p_provisional_pct,
    'systemic_pct',    p_systemic_pct,
    'people',          v_people
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION kpi_can_read_others()                        TO authenticated;
GRANT EXECUTE ON FUNCTION get_kpi_org_overview(TEXT, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION get_kpi_scorecard(TEXT, TEXT)                TO authenticated;
