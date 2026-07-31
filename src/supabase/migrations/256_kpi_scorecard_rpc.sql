-- Migration 256: scorecard assembly.
--
--   kpi_scorecard_key_for_user  — which of the five scorecards applies
--   kpi_suggest_rating          — actual + thresholds -> a 1-5 suggestion
--   get_kpi_scorecard           — the whole card, in one RPC call
--
-- The score is computed HERE and nowhere else. The client renders; it never
-- does the arithmetic. One number, one definition of it.

-- ─── Which scorecard applies ─────────────────────────────────────────────────
--
-- users.department does NOT match the Falcons scorecard set: Brokerage,
-- Forwarding and Trucking are all 'Operations'. users.service_type is the
-- discriminator (22 Brokerage / 3 Trucking / 2 Forwarding on dev).
-- Accounting, Executive and HR have no Falcons scorecard — they return NULL,
-- which the UI renders as "no scorecard", not as a zero.

CREATE OR REPLACE FUNCTION kpi_scorecard_key_for_user(p_user_id TEXT)
RETURNS TEXT LANGUAGE sql STABLE AS $fn$
  SELECT CASE
    WHEN u.department = 'Operations' THEN
      CASE lower(COALESCE(u.service_type, ''))
        WHEN 'brokerage'  THEN 'brokerage'
        WHEN 'forwarding' THEN 'forwarding'
        WHEN 'trucking'   THEN 'trucking'
        ELSE NULL END
    WHEN u.department = 'Pricing'              THEN 'pricing'
    WHEN u.department = 'Business Development' THEN 'bdd'
    ELSE NULL
  END
  FROM users u WHERE u.id = p_user_id;
$fn$;

-- ─── Rating suggestion ───────────────────────────────────────────────────────
--
-- pct_of_target — the Guide's scale, on attainment = actual / target * 100:
--     >100 -> 5   =100 -> 4   90-99 -> 3   70-89 -> 2   <70 -> 1
--
-- zero_incidents — the Guide's percentage scale is meaningless against a zero
-- target (90% of zero is nothing), so zero-target KPIs get their own bands:
--     0 -> 5   1 -> 3   2 -> 2   3+ -> 1
--
-- NULL actual returns NULL: no data is not a rating, and it must never fall
-- through to 1.

CREATE OR REPLACE FUNCTION kpi_suggest_rating(
  p_actual NUMERIC, p_target NUMERIC, p_direction TEXT, p_thresholds JSONB
) RETURNS SMALLINT LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  v_kind TEXT := COALESCE(p_thresholds ->> 'kind', 'pct_of_target');
  v_attain NUMERIC;
BEGIN
  IF p_actual IS NULL THEN RETURN NULL; END IF;

  IF v_kind = 'zero_incidents' OR p_direction = 'zero_target' THEN
    RETURN CASE
      WHEN p_actual <= 0 THEN 5
      WHEN p_actual < 2  THEN 3
      WHEN p_actual < 3  THEN 2
      ELSE 1 END;
  END IF;

  IF COALESCE(p_target, 0) = 0 THEN RETURN NULL; END IF;
  v_attain := p_actual / p_target * 100.0;

  IF p_direction = 'lower_better' THEN
    v_attain := 200.0 - v_attain;   -- mirror: under target is over-performing
  END IF;

  RETURN CASE
    WHEN v_attain > 100  THEN 5
    WHEN v_attain = 100  THEN 4
    WHEN v_attain >= 90  THEN 3
    WHEN v_attain >= 70  THEN 2
    ELSE 1 END;
END;
$fn$;

-- ─── The scorecard ───────────────────────────────────────────────────────────
--
-- Open period   -> computed live on read. No cron, nothing stale.
-- Locked period -> read frozen from kpi_scores, weights included.
--
-- Exclusion rule: a KPI with no computable actual (no data, no target, not yet
-- evaluated) is EXCLUDED and the remaining weights renormalise. It is never
-- scored zero. scored_on_pct tells the user how much of the card was live, so
-- an incomplete score is visibly incomplete rather than falsely precise.

CREATE OR REPLACE FUNCTION get_kpi_scorecard(p_user_id TEXT, p_period_id TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE AS $fn$
DECLARE
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

    SELECT * INTO v_stored FROM kpi_scores
    WHERE period_id = p_period_id AND user_id = p_user_id
      AND kpi_definition_id = d.id;

    IF v_period.status = 'locked' AND FOUND THEN
      -- Frozen. A locked period must render exactly as it was signed.
      v_actual   := v_stored.actual_value;
      v_display  := v_stored.actual_display;
      v_evidence := COALESCE(v_stored.evidence, '[]'::jsonb);
      v_excluded := v_stored.excluded;
      v_excl_why := v_stored.excluded_reason;
    ELSIF d.metric_key IS NOT NULL AND d.source IN ('auto', 'proposed') THEN
      v_fn := 'kpi_metric_' || d.metric_key;
      -- A definition may be seeded ahead of its resolver (attendance_punctuality
      -- is reserved for the HR module). Missing resolver = no data, not an error.
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = v_fn) THEN
        EXECUTE format('SELECT actual, display, evidence FROM %I($1,$2,$3)', v_fn)
          INTO v_actual, v_display, v_evidence
          USING p_user_id, v_period.start_date, v_period.end_date;
      ELSE
        v_display := 'Not yet measurable';
      END IF;
    ELSE
      -- logged / judgment: only a human can put a number here.
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
      -- what this KPI cost, in points. "-9.0" reads better than "rating 2".
      'points_lost',      CASE WHEN v_excluded THEN NULL
                               ELSE ROUND(d.weight_pct - v_weighted, 2) END,
      'evidence',         COALESCE(v_evidence, '[]'::jsonb)
    );
  END LOOP;

  -- Renormalise over what was actually scoreable.
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

GRANT EXECUTE ON FUNCTION kpi_scorecard_key_for_user(TEXT)          TO authenticated;
GRANT EXECUTE ON FUNCTION kpi_suggest_rating(NUMERIC, NUMERIC, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION get_kpi_scorecard(TEXT, TEXT)             TO authenticated;
