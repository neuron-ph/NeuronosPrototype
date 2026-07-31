-- Migration 260: sales_quota ignored user_targets.period_id.
--
-- THE BUG
--
-- The resolver picked any target row for the user:
--
--     WHERE user_id = p_user_id AND metric_key = 'sales_quota'
--     ORDER BY period_id NULLS LAST LIMIT 1
--
-- period_id was never compared to the period being scored, so a target set for
-- ONE period silently applied to EVERY period. Setting a July quota retro-scored
-- June against it, where the user had no won deals yet, producing 0% attainment
-- and a rating of 1 for a month that should simply have excluded the KPI.
--
-- Same failure family as the RLS bug in 258: the number was confidently wrong
-- rather than absent. Here it errs against the employee instead of for them.
--
-- THE FIX
--
-- A target scoped to the period being scored wins. A standing target
-- (period_id IS NULL) is the fallback. Neither means NULL actual, which excludes
-- the KPI and renormalises, exactly as "no quota set" always should have.
--
-- The resolver takes dates rather than a period id, so the period is recovered
-- by matching the range it was called with.

CREATE OR REPLACE FUNCTION kpi_metric_sales_quota(
  p_user_id TEXT, p_start DATE, p_end DATE
) RETURNS TABLE (actual NUMERIC, display TEXT, evidence JSONB)
LANGUAGE sql STABLE AS $fn$
WITH per AS (
  SELECT id FROM kpi_periods WHERE start_date = p_start AND end_date = p_end LIMIT 1
),
tgt AS (
  SELECT ut.target_value
  FROM user_targets ut
  WHERE ut.user_id = p_user_id
    AND ut.metric_key = 'sales_quota'
    AND (ut.period_id = (SELECT id FROM per) OR ut.period_id IS NULL)
  -- period-specific first, standing target as fallback
  ORDER BY (ut.period_id IS NULL)
  LIMIT 1
),
won AS (
  SELECT q.id, COALESCE(q.quotation_number, q.quote_number, q.id) AS ref,
         q.customer_name, q.total_selling, q.currency, q.updated_at
  FROM quotations q
  WHERE COALESCE(NULLIF(q.assigned_to, ''), q.created_by) = p_user_id
    AND q.status IN ('Accepted by Client', 'Converted to Project', 'Converted to Contract', 'Active')
    AND q.updated_at >= p_start
    AND q.updated_at < (p_end + 1)
)
SELECT
  CASE WHEN (SELECT target_value FROM tgt) IS NULL THEN NULL
       ELSE ROUND(100.0 * COALESCE((SELECT sum(total_selling) FROM won), 0)
                  / (SELECT target_value FROM tgt), 1) END,
  CASE WHEN (SELECT target_value FROM tgt) IS NULL THEN 'No quota set'
       ELSE to_char(COALESCE((SELECT sum(total_selling) FROM won), 0), 'FM999,999,999')
            || ' of ' || to_char((SELECT target_value FROM tgt), 'FM999,999,999') END,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'quotation_id', id, 'ref', ref, 'customer', customer_name,
    'amount', total_selling, 'currency', currency, 'won_at', updated_at
  ) ORDER BY total_selling DESC) FROM won), '[]'::jsonb);
$fn$;

REVOKE EXECUTE ON FUNCTION kpi_metric_sales_quota(TEXT, DATE, DATE) FROM authenticated;
