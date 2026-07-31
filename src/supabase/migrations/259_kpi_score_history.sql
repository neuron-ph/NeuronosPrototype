-- Migration 259: score history, for the trend sparkline.
--
-- "Where do I stand" is half position and half direction. The band ladder gives
-- position; this gives direction.
--
-- Deliberately thin: it loops the periods and reuses get_kpi_scorecard rather
-- than reimplementing the scoring. One definition of the number, one place it
-- can be wrong.
--
-- Same security posture as 258: DEFINER, pinned search_path, self-only.

CREATE OR REPLACE FUNCTION get_kpi_score_history(p_user_id TEXT, p_limit INT DEFAULT 6)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_caller TEXT;
  p        RECORD;
  v_card   JSONB;
  v_out    JSONB := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_caller FROM users WHERE auth_id = auth.uid();
    IF v_caller IS NULL OR p_user_id IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'You can only read your own scorecard.' USING ERRCODE = '42501';
    END IF;
  END IF;

  FOR p IN
    SELECT * FROM (
      SELECT id, label, start_date FROM kpi_periods
      ORDER BY start_date DESC LIMIT GREATEST(p_limit, 1)
    ) recent ORDER BY start_date
  LOOP
    v_card := get_kpi_scorecard(p_user_id, p.id);
    v_out := v_out || jsonb_build_object(
      'period_id',     p.id,
      'label',         p.label,
      'score',         v_card -> 'score',
      'band',          v_card -> 'band',
      'scored_on_pct', v_card -> 'scored_on_pct'
    );
  END LOOP;

  RETURN v_out;
END;
$fn$;

GRANT EXECUTE ON FUNCTION get_kpi_score_history(TEXT, INT) TO authenticated;
