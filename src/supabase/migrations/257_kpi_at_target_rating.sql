-- Migration 257: make the at-target rating configurable per definition.
--
-- The Falcons Guide scale reads:
--     5 Outstanding        — consistently EXCEEDS the target
--     4 Very Satisfactory  — FULLY MEETS the target
--
-- Which means a KPI whose target is "100%" can never score 5: you cannot exceed
-- 100% on-time. Flawless work caps at 4, so those KPIs top out at 80% of their
-- weight. On the Pricing card that is 65 points (Quotation TAT 35 + Billing 15 +
-- Sales Quota 15) with a ceiling of 52 — a perfect pricer lands near 87, never 100.
--
-- That is Falcons' scale, not a bug, so it stays the DEFAULT. But it is now a
-- per-definition knob rather than a hardcoded rule:
--
--     {"kind":"pct_of_target"}                 -> at target = 4  (Guide-faithful)
--     {"kind":"pct_of_target","at_target":5}   -> at target = 5  (perfection scores 100)
--
-- Data, not code — same doctrine as the weights. Falcons flips it per KPI by
-- editing a row, and the choice is visible in the definition rather than buried
-- in a function.

CREATE OR REPLACE FUNCTION kpi_suggest_rating(
  p_actual NUMERIC, p_target NUMERIC, p_direction TEXT, p_thresholds JSONB
) RETURNS SMALLINT LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  v_kind      TEXT    := COALESCE(p_thresholds ->> 'kind', 'pct_of_target');
  v_at_target SMALLINT;
  v_attain    NUMERIC;
BEGIN
  IF p_actual IS NULL THEN RETURN NULL; END IF;

  IF v_kind = 'zero_incidents' OR p_direction = 'zero_target' THEN
    -- Zero-target KPIs already reach 5: hitting zero IS the ceiling, and the
    -- Guide's percentage bands are meaningless against a target of zero.
    RETURN CASE
      WHEN p_actual <= 0 THEN 5
      WHEN p_actual < 2  THEN 3
      WHEN p_actual < 3  THEN 2
      ELSE 1 END;
  END IF;

  IF COALESCE(p_target, 0) = 0 THEN RETURN NULL; END IF;

  v_at_target := COALESCE((p_thresholds ->> 'at_target')::smallint, 4);
  v_attain    := p_actual / p_target * 100.0;

  IF p_direction = 'lower_better' THEN
    v_attain := 200.0 - v_attain;
  END IF;

  RETURN CASE
    WHEN v_attain > 100 THEN 5
    WHEN v_attain = 100 THEN v_at_target
    WHEN v_attain >= 90 THEN 3
    WHEN v_attain >= 70 THEN 2
    ELSE 1 END;
END;
$fn$;

GRANT EXECUTE ON FUNCTION kpi_suggest_rating(NUMERIC, NUMERIC, TEXT, JSONB) TO authenticated;
