-- Migration 255: KPI metric resolvers (Phase 1 — Pricing).
--
-- One function per metric_key in kpi_definitions. Each returns a single row:
--   actual   NUMERIC — the number the rating is derived from (NULL = no data)
--   display  TEXT    — what the UI shows ('11 of 14 (78.6%)')
--   evidence JSONB   — the rows behind the number, so every figure drills down
--
-- NULL actual means "cannot be computed" and the caller EXCLUDES the KPI and
-- renormalises. It must never be read as zero.
--
-- Plain supabase.from() cannot express these, and none of them need service-role
-- privilege, so they are SQL functions called via RPC — same pattern as
-- get_catalog_usage_counts().

-- ─── quotation_tat (35% of the Pricing scorecard) ────────────────────────────
--
-- Clock: activity_log status transitions, NOT quotations.submitted_at (that
-- column is NULL on all 290 rows — nothing writes it).
--     start = -> 'Pending Pricing'   (the inquiry lands on Pricing's desk)
--     stop  = 'Pending Pricing' -> 'Priced'
--
-- Owner: the user_id on the '-> Priced' event — whoever actually priced it.
-- Falls back to assigned_to (140/290 populated), then created_by (290/290).
--
-- Threshold per the Falcons PDF, strictest wins on multi-service quotes (a quote
-- is not finished until every leg is priced):
--     Forwarding  Asia POL 24h / non-Asia 48h      Brokerage All-Inclusive  24h
--     Trucking                 12h                 Brokerage Standard/Non-Reg 12h
--     Marine Insurance         24h                 Others                    24h
--
-- Unknown classification resolves to the LENIENT threshold, never the strict one.
-- 92 of 179 forwarding services carry no parseable origin, and a data gap must
-- not become a penalty. Every resolved threshold is recorded in evidence.

CREATE OR REPLACE FUNCTION kpi_metric_quotation_tat(
  p_user_id TEXT, p_start DATE, p_end DATE
) RETURNS TABLE (actual NUMERIC, display TEXT, evidence JSONB)
LANGUAGE sql STABLE AS $$
WITH priced AS (
  SELECT al.entity_id AS qid, al.created_at AS priced_at, al.user_id AS priced_by
  FROM activity_log al
  WHERE al.entity_type = 'quotation'
    AND al.action_type = 'status_change'
    AND al.old_value = 'Pending Pricing'
    AND al.new_value = 'Priced'
    AND al.created_at >= p_start
    AND al.created_at < (p_end + 1)
),
started AS (
  SELECT p.qid, p.priced_at, p.priced_by,
         (SELECT max(a2.created_at) FROM activity_log a2
          WHERE a2.entity_type = 'quotation' AND a2.entity_id = p.qid
            AND a2.action_type = 'status_change'
            AND a2.new_value = 'Pending Pricing'
            AND a2.created_at <= p.priced_at) AS started_at
  FROM priced p
),
owned AS (
  SELECT s.*, q.quotation_number, q.quote_number
  FROM started s
  JOIN quotations q ON q.id = s.qid
  WHERE COALESCE(NULLIF(s.priced_by, ''), NULLIF(q.assigned_to, ''), q.created_by) = p_user_id
    AND s.started_at IS NOT NULL
),
svc AS (
  SELECT o.qid,
         sm ->> 'service_type' AS svc_type,
         COALESCE(NULLIF(sm -> 'service_details' ->> 'brokerage_type', ''),
                  NULLIF(sm -> 'service_details' ->> 'brokerageType', '')) AS brok,
         upper(substring(COALESCE(NULLIF(sm -> 'service_details' ->> 'pol_aol', ''),
                                  NULLIF(sm -> 'service_details' ->> 'aol_pol', ''))
                         FROM '\(([A-Za-z]{5})\)')) AS locode
  FROM owned o
  JOIN quotations q ON q.id = o.qid
  CROSS JOIN LATERAL jsonb_array_elements(q.services_metadata) sm
),
svc_threshold AS (
  SELECT s.qid,
         CASE s.svc_type
           WHEN 'Forwarding' THEN
             CASE WHEN c.region = 'Asia' THEN 24 ELSE 48 END
           WHEN 'Brokerage' THEN
             CASE WHEN s.brok = 'All-Inclusive' THEN 24
                  WHEN s.brok IN ('Standard', 'Non-Regular') THEN 12
                  ELSE 24 END
           WHEN 'Trucking' THEN 12
           WHEN 'Marine Insurance' THEN 24
           ELSE 24
         END AS hours
  FROM svc s
  LEFT JOIN profile_countries c ON upper(c.iso_code) = left(s.locode, 2)
),
threshold AS (
  SELECT qid, min(hours) AS threshold_hours FROM svc_threshold GROUP BY qid
),
scored AS (
  SELECT o.qid,
         COALESCE(o.quotation_number, o.quote_number, o.qid) AS ref,
         o.started_at, o.priced_at,
         ROUND(EXTRACT(EPOCH FROM (o.priced_at - o.started_at)) / 3600.0, 1) AS hours_taken,
         COALESCE(t.threshold_hours, 24) AS threshold_hours,
         (EXTRACT(EPOCH FROM (o.priced_at - o.started_at)) / 3600.0)
           <= COALESCE(t.threshold_hours, 24) AS on_time
  FROM owned o
  LEFT JOIN threshold t ON t.qid = o.qid
)
SELECT
  CASE WHEN count(*) = 0 THEN NULL
       ELSE ROUND(100.0 * count(*) FILTER (WHERE on_time) / count(*), 1) END,
  CASE WHEN count(*) = 0 THEN 'No quotations priced this period'
       ELSE count(*) FILTER (WHERE on_time) || ' of ' || count(*) || ' within turnaround' END,
  COALESCE(jsonb_agg(jsonb_build_object(
    'quotation_id', qid, 'ref', ref,
    'started_at', started_at, 'priced_at', priced_at,
    'hours_taken', hours_taken, 'threshold_hours', threshold_hours,
    'on_time', on_time
  ) ORDER BY on_time, hours_taken DESC), '[]'::jsonb)
FROM scored;
$$;

-- ─── billing_tat_24h (15%) ───────────────────────────────────────────────────
--
-- "Billing statement issued within 24 hours after completion of delivery."
--
-- Granularity note: bookings.details.date_delivered is a DATE (no time), so
-- "within 24 hours" is evaluated as invoice_date::date - date_delivered <= 1 day.
-- That is the honest reading at the precision available. If Falcons wants true
-- hour precision, date_delivered has to become a timestamp first.

CREATE OR REPLACE FUNCTION kpi_metric_billing_tat_24h(
  p_user_id TEXT, p_start DATE, p_end DATE
) RETURNS TABLE (actual NUMERIC, display TEXT, evidence JSONB)
LANGUAGE sql STABLE AS $$
WITH billed AS (
  SELECT i.id, i.invoice_number, i.invoice_date, b.booking_number,
         (b.details ->> 'date_delivered')::date AS delivered_on,
         (i.invoice_date::date - (b.details ->> 'date_delivered')::date) AS days_taken
  FROM invoices i
  JOIN bookings b ON b.id = i.booking_id
  WHERE i.created_by = p_user_id
    AND i.invoice_date >= p_start
    AND i.invoice_date < (p_end + 1)
    AND NULLIF(b.details ->> 'date_delivered', '') IS NOT NULL
)
SELECT
  CASE WHEN count(*) = 0 THEN NULL
       ELSE ROUND(100.0 * count(*) FILTER (WHERE days_taken <= 1) / count(*), 1) END,
  CASE WHEN count(*) = 0 THEN 'No deliveries billed this period'
       ELSE count(*) FILTER (WHERE days_taken <= 1) || ' of ' || count(*) || ' billed within 24 hrs' END,
  COALESCE(jsonb_agg(jsonb_build_object(
    'invoice_id', id, 'invoice_number', invoice_number, 'booking_number', booking_number,
    'delivered_on', delivered_on, 'invoice_date', invoice_date,
    'days_taken', days_taken, 'on_time', days_taken <= 1
  ) ORDER BY days_taken DESC), '[]'::jsonb)
FROM billed;
$$;

-- ─── sales_quota (15%) ───────────────────────────────────────────────────────
--
-- Numerator is in the system; the denominator is user_targets. No target row
-- => NULL actual => the KPI excludes itself and the remaining weights
-- renormalise. It must never score zero for want of configuration.

CREATE OR REPLACE FUNCTION kpi_metric_sales_quota(
  p_user_id TEXT, p_start DATE, p_end DATE
) RETURNS TABLE (actual NUMERIC, display TEXT, evidence JSONB)
LANGUAGE sql STABLE AS $$
WITH tgt AS (
  SELECT target_value FROM user_targets
  WHERE user_id = p_user_id AND metric_key = 'sales_quota'
  ORDER BY period_id NULLS LAST LIMIT 1
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
$$;

-- ─── misquote_revisions (15%, source='proposed') ─────────────────────────────
--
-- A quote bounced back for revision is an objective signal, not an opinion.
-- The system counts them and proposes the rating; the evaluator can add lapses
-- the system cannot see, or override with a reason.

CREATE OR REPLACE FUNCTION kpi_metric_misquote_revisions(
  p_user_id TEXT, p_start DATE, p_end DATE
) RETURNS TABLE (actual NUMERIC, display TEXT, evidence JSONB)
LANGUAGE sql STABLE AS $$
WITH revs AS (
  SELECT al.entity_id AS qid, al.created_at, al.old_value,
         COALESCE(q.quotation_number, q.quote_number, q.id) AS ref, q.customer_name
  FROM activity_log al
  JOIN quotations q ON q.id = al.entity_id
  WHERE al.entity_type = 'quotation'
    AND al.action_type = 'status_change'
    AND al.new_value = 'Needs Revision'
    AND al.created_at >= p_start
    AND al.created_at < (p_end + 1)
    AND COALESCE(NULLIF(q.assigned_to, ''), q.created_by) = p_user_id
)
SELECT
  count(*)::numeric,
  CASE WHEN count(*) = 0 THEN 'None' ELSE count(*) || ' sent back for revision' END,
  COALESCE(jsonb_agg(jsonb_build_object(
    'quotation_id', qid, 'ref', ref, 'customer', customer_name,
    'from_status', old_value, 'at', created_at
  ) ORDER BY created_at DESC), '[]'::jsonb)
FROM revs;
$$;

GRANT EXECUTE ON FUNCTION kpi_metric_quotation_tat(TEXT, DATE, DATE)      TO authenticated;
GRANT EXECUTE ON FUNCTION kpi_metric_billing_tat_24h(TEXT, DATE, DATE)    TO authenticated;
GRANT EXECUTE ON FUNCTION kpi_metric_sales_quota(TEXT, DATE, DATE)        TO authenticated;
GRANT EXECUTE ON FUNCTION kpi_metric_misquote_revisions(TEXT, DATE, DATE) TO authenticated;
