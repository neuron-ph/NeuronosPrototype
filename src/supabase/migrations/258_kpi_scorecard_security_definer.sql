-- Migration 258: the scorecard must compute over TRUE data, not over what the
-- reader happens to be allowed to see.
--
-- THE BUG (found by driving the UI as a real pricer, not by SQL):
--
-- get_kpi_scorecard ran SECURITY INVOKER, so every table it read was filtered by
-- the caller's RLS. activity_log_select is:
--
--     current_user_has_module_permission('exec_activity_log','view')
--       OR user_id = get_my_profile_id()
--
-- A pricer holds neither, so they only see activity_log rows THEY generated.
-- The 'Needs Revision' event that feeds Misquote / Lapses is written by the
-- supervisor who sent the quote back — so the employee could not see it, the
-- count came back 0 instead of 1, the rating went 3 -> 5, and the score rose
-- from 61.2 to 67.2.
--
-- The scorecard was silently flattering whoever was reading it. A KPI that
-- under-reports exactly the evidence against you is worse than no KPI: it looks
-- authoritative and is wrong in a consistent, self-serving direction.
--
-- FIX: SECURITY DEFINER so the numbers are computed over real data, with an
-- explicit self-only authorisation check inside so DEFINER does not become a
-- way to read other people's scorecards. Reading someone else's card is a
-- separate door (hr_performance, Phase 2), which will widen this check
-- deliberately rather than by accident.
--
-- search_path is pinned: a SECURITY DEFINER function without it can be hijacked
-- by a caller-controlled search_path.

CREATE OR REPLACE FUNCTION get_kpi_scorecard(p_user_id TEXT, p_period_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_caller     TEXT;
  v_key        TEXT;
  v_period     kpi_periods%ROWTYPE;
  v_user       users%ROWTYPE;
  d            RECORD;
  v_actual     NUMERIC;
  v_display    TEXT;
  v_evidence   JSONB;
  v_stored     kpi_scores%ROWTYPE;
  v_suggested  SMALLINT;
  v_rating     SMALLINT;
  v_excluded   BOOLEAN;
  v_excl_why   TEXT;
  v_weighted   NUMERIC;
  v_fn         TEXT;
  v_kpis       JSONB := '[]'::jsonb;
  v_incl_wt    NUMERIC := 0;
  v_wt_sum     NUMERIC := 0;
  v_excl_count INT := 0;
  v_score      NUMERIC;
BEGIN
  -- Authorisation. auth.uid() IS NULL means service_role / SQL console, which is
  -- already trusted. Any real session may only ask for its own scorecard.
  IF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_caller FROM users WHERE auth_id = auth.uid();
    IF v_caller IS NULL OR p_user_id IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'You can only read your own scorecard.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'unknown user'); END IF;

  SELECT * INTO v_period FROM kpi_periods WHERE id = p_period_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'unknown period'); END IF;

  v_key := kpi_scorecard_key_for_user(p_user_id);
  IF v_key IS NULL THEN
    RETURN jsonb_build_object(
      'user_id', p_user_id, 'user_name', v_user.name,
      'scorecard_key', NULL, 'has_scorecard', false,
      'period', jsonb_build_object('id', v_period.id, 'label', v_period.label,
                                   'status', v_period.status),
      'kpis', '[]'::jsonb);
  END IF;

  FOR d IN
    SELECT * FROM kpi_definitions
    WHERE scorecard_key = v_key
      AND effective_from <= v_period.end_date
      AND (effective_to IS NULL OR effective_to >= v_period.start_date)
    ORDER BY sort_order
  LOOP
    v_actual := NULL; v_display := NULL; v_evidence := '[]'::jsonb;
    v_excluded := false; v_excl_why := NULL;
    v_stored := NULL;

    SELECT * INTO v_stored FROM kpi_scores
    WHERE period_id = p_period_id AND user_id = p_user_id
      AND kpi_definition_id = d.id;

    IF v_period.status = 'locked' AND v_stored.id IS NOT NULL THEN
      v_actual   := v_stored.actual_value;
      v_display  := v_stored.actual_display;
      v_evidence := COALESCE(v_stored.evidence, '[]'::jsonb);
      v_excluded := v_stored.excluded;
      v_excl_why := v_stored.excluded_reason;
    ELSIF d.metric_key IS NOT NULL AND d.source IN ('auto', 'proposed') THEN
      v_fn := 'kpi_metric_' || d.metric_key;
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = v_fn) THEN
        EXECUTE format('SELECT actual, display, evidence FROM %I($1,$2,$3)', v_fn)
          INTO v_actual, v_display, v_evidence
          USING p_user_id, v_period.start_date, v_period.end_date;
      ELSE
        v_display := 'Not yet measurable';
      END IF;
    ELSE
      IF v_stored.id IS NOT NULL THEN
        v_actual   := v_stored.actual_value;
        v_display  := v_stored.actual_display;
        v_evidence := COALESCE(v_stored.evidence, '[]'::jsonb);
      ELSE
        v_display := 'Awaiting evaluation';
      END IF;
    END IF;

    v_suggested := kpi_suggest_rating(v_actual, d.target_value, d.direction, d.rating_thresholds);
    v_rating    := COALESCE(v_stored.rating, v_suggested);

    IF v_rating IS NULL AND NOT v_excluded THEN
      v_excluded := true;
      v_excl_why := COALESCE(NULLIF(v_display, ''), 'No data for this period');
    END IF;

    IF v_excluded THEN
      v_weighted := NULL;
      v_excl_count := v_excl_count + 1;
    ELSE
      v_weighted := ROUND(d.weight_pct * v_rating / 5.0, 2);
      v_incl_wt  := v_incl_wt + d.weight_pct;
      v_wt_sum   := v_wt_sum + v_weighted;
    END IF;

    v_kpis := v_kpis || jsonb_build_object(
      'definition_id',    d.id,
      'name',             d.name,
      'sort_order',       d.sort_order,
      'weight_pct',       d.weight_pct,
      'source',           d.source,
      'definition_text',  d.definition_text,
      'target_text',      d.target_text,
      'measurement_text', d.measurement_text,
      'actual',           v_actual,
      'actual_display',   v_display,
      'suggested_rating', v_suggested,
      'rating',           v_rating,
      'is_override',      (v_stored.rating IS NOT NULL AND v_stored.rating IS DISTINCT FROM v_suggested),
      'override_reason',  v_stored.override_reason,
      'excluded',         v_excluded,
      'excluded_reason',  v_excl_why,
      'weighted_score',   v_weighted,
      'points_lost',      CASE WHEN v_excluded THEN NULL
                               ELSE ROUND(d.weight_pct - v_weighted, 2) END,
      'evidence',         COALESCE(v_evidence, '[]'::jsonb)
    );
  END LOOP;

  v_score := CASE WHEN v_incl_wt > 0 THEN ROUND(v_wt_sum / v_incl_wt * 100, 1) END;

  RETURN jsonb_build_object(
    'user_id',       p_user_id,
    'user_name',     v_user.name,
    'department',    v_user.department,
    'position',      v_user.position,
    'scorecard_key', v_key,
    'has_scorecard', true,
    'period', jsonb_build_object('id', v_period.id, 'label', v_period.label,
                                 'status', v_period.status,
                                 'start_date', v_period.start_date,
                                 'end_date', v_period.end_date),
    'score', v_score,
    'band', CASE
              WHEN v_score IS NULL  THEN NULL
              WHEN v_score >= 90    THEN 'Outstanding'
              WHEN v_score >= 80    THEN 'Very Satisfactory'
              WHEN v_score >= 70    THEN 'Satisfactory'
              WHEN v_score >= 60    THEN 'Needs Improvement'
              ELSE 'Poor' END,
    'scored_on_pct',  v_incl_wt,
    'excluded_count', v_excl_count,
    'kpis', v_kpis
  );
END;
$fn$;

-- The raw resolvers are internal. Called directly by a session they would run
-- under that session's RLS and return the same misleadingly flattering numbers,
-- and they would also let anyone probe another user's figures. get_kpi_scorecard
-- is the only supported entry point.
REVOKE EXECUTE ON FUNCTION kpi_metric_quotation_tat(TEXT, DATE, DATE)      FROM authenticated;
REVOKE EXECUTE ON FUNCTION kpi_metric_billing_tat_24h(TEXT, DATE, DATE)    FROM authenticated;
REVOKE EXECUTE ON FUNCTION kpi_metric_sales_quota(TEXT, DATE, DATE)        FROM authenticated;
REVOKE EXECUTE ON FUNCTION kpi_metric_misquote_revisions(TEXT, DATE, DATE) FROM authenticated;

GRANT EXECUTE ON FUNCTION get_kpi_scorecard(TEXT, TEXT) TO authenticated;
