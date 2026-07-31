-- Migration 264: operational metric resolvers.
--
-- Five resolvers. Two score real data today; three are structurally complete and
-- return NULL until the booking form starts writing their milestone dates, at
-- which point they light up on their own with no further code.
--
--   ontime_delivery   Trucking 25%   scores now (75 bookings have both dates)
--   new_customers     BDD      20%   scores now
--   lodgment_tat      Brokerage 15%  waits on details.lodgment_date
--   fan_tat           Brokerage 15%  waits on details.final_assessment_date
--   manifest_on_time  Forwarding 20% waits on details.manifest_submitted_at
--
-- All read booking_milestones (262) rather than bookings.details directly, so
-- they reckon on occurred_at with a recorded_at fallback and never depend on
-- activity_log, whose coverage was measured at 0-39%.
--
-- NOT BUILT: meetings_held. calendar_events.event_type is department/personal/
-- team and carries no customer link, so it cannot distinguish a client meeting
-- from an internal one. Counting internal standups toward a client-meeting KPI
-- would be worse than leaving it unmeasured.

-- ─── Ownership ───────────────────────────────────────────────────────────────
--
-- Score the person who does the work, not everyone attached to the booking.
-- booking_assignments carries the role; bookings.handler_id is the fallback for
-- older rows that predate assignments.

CREATE OR REPLACE FUNCTION kpi_booking_owner(p_booking_id TEXT, p_roles TEXT[])
RETURNS TEXT LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE(
    (SELECT ba.user_id FROM booking_assignments ba
      WHERE ba.booking_id = p_booking_id
        AND ba.role_key = ANY(p_roles)
        AND NULLIF(ba.user_id, '') IS NOT NULL
      ORDER BY array_position(p_roles, ba.role_key)
      LIMIT 1),
    (SELECT NULLIF(b.handler_id, '') FROM bookings b WHERE b.id = p_booking_id));
$fn$;

-- Milestone lookup: the real-world date when we have one, else when it reached
-- the system. Returning recorded_at rather than nothing keeps a booking
-- scoreable, and the is_proxy flag on the row records that the date is soft.
CREATE OR REPLACE FUNCTION kpi_milestone_at(p_booking_id TEXT, p_key TEXT)
RETURNS TIMESTAMPTZ LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE(occurred_at, recorded_at) FROM booking_milestones
  WHERE booking_id = p_booking_id AND milestone_key = p_key;
$fn$;

-- ─── ontime_delivery (Trucking 25%) ─────────────────────────────────────────
--
-- The KPI is "On-Time Delivery / On-Time Container Pull-Out". Only the delivery
-- half is scored: there is no agreed-pull-out-schedule field anywhere, and
-- inventing one from storage_validity would be guessing. The display says so
-- rather than implying both halves were measured.
--
-- Both sides are dates without times, so on-time is delivered <= promised at day
-- granularity. That is the honest precision available.

CREATE OR REPLACE FUNCTION kpi_metric_ontime_delivery(
  p_user_id TEXT, p_start DATE, p_end DATE
) RETURNS TABLE (actual NUMERIC, display TEXT, evidence JSONB)
LANGUAGE sql STABLE AS $fn$
WITH trips AS (
  SELECT b.id, b.booking_number, b.customer_name,
         kpi_milestone_at(b.id, 'delivered')::date         AS delivered_on,
         kpi_milestone_at(b.id, 'delivery_promised')::date AS promised_on
  FROM bookings b
  WHERE kpi_booking_owner(b.id,
          ARRAY['handler','admin_logistics','operations_supervisor']) = p_user_id
),
scored AS (
  SELECT id, booking_number, customer_name, delivered_on, promised_on,
         (delivered_on - promised_on) AS days_late,
         (delivered_on <= promised_on) AS on_time
  FROM trips
  WHERE delivered_on IS NOT NULL AND promised_on IS NOT NULL
    AND delivered_on >= p_start AND delivered_on <= p_end
)
SELECT
  CASE WHEN count(*) = 0 THEN NULL
       ELSE ROUND(100.0 * count(*) FILTER (WHERE on_time) / count(*), 1) END,
  CASE WHEN count(*) = 0 THEN 'No deliveries this period'
       ELSE count(*) FILTER (WHERE on_time) || ' of ' || count(*)
            || ' delivered on time (pull-out not yet measured)' END,
  COALESCE(jsonb_agg(jsonb_build_object(
    'booking_id', id, 'booking', booking_number, 'customer', customer_name,
    'promised_on', promised_on, 'delivered_on', delivered_on,
    'days_late', days_late, 'on_time', on_time
  ) ORDER BY on_time, days_late DESC), '[]'::jsonb)
FROM scored;
$fn$;

-- ─── new_customers (BDD 20%) ────────────────────────────────────────────────
--
-- The PDF reads "New accounts onboarded / first booking secured". FIRST BOOKING
-- is the bar used here: creating a CRM row is not onboarding, and bookings
-- carry a reliable created_at while a status transition would have to be read
-- out of activity_log.
--
-- Credited to customers.owner_id, falling back to created_by.

CREATE OR REPLACE FUNCTION kpi_metric_new_customers(
  p_user_id TEXT, p_start DATE, p_end DATE
) RETURNS TABLE (actual NUMERIC, display TEXT, evidence JSONB)
LANGUAGE sql STABLE AS $fn$
WITH firsts AS (
  SELECT b.customer_id, min(b.created_at) AS first_booking_at
  FROM bookings b
  WHERE NULLIF(b.customer_id, '') IS NOT NULL
  GROUP BY b.customer_id
),
won AS (
  SELECT c.id, c.name, f.first_booking_at,
         (SELECT b2.booking_number FROM bookings b2
           WHERE b2.customer_id = c.id ORDER BY b2.created_at LIMIT 1) AS booking
  FROM firsts f
  JOIN customers c ON c.id = f.customer_id
  WHERE COALESCE(NULLIF(c.owner_id, ''), c.created_by) = p_user_id
    AND f.first_booking_at >= p_start
    AND f.first_booking_at < (p_end + 1)
)
SELECT
  count(*)::numeric,
  CASE WHEN count(*) = 0 THEN 'No first bookings secured'
       ELSE count(*) || ' new ' || CASE WHEN count(*) = 1 THEN 'customer' ELSE 'customers' END END,
  COALESCE(jsonb_agg(jsonb_build_object(
    'customer_id', id, 'customer', name, 'first_booking', booking, 'won_at', first_booking_at
  ) ORDER BY first_booking_at), '[]'::jsonb)
FROM won;
$fn$;

-- ─── lodgment_tat (Brokerage 15%) ───────────────────────────────────────────
--
-- "Entry lodged within 24 hours from the date of completion of final import
-- documents OR the Manifest date, whichever comes LATER."
--
-- The later-of rule matters: taking the earlier date would penalise a declarant
-- for waiting on paperwork that had not arrived.
--
-- Returns NULL until details.lodgment_date and at least one of
-- final_docs_complete_date / manifest_date are being written. The
-- lodgment_proxy milestone (entry_number) is deliberately NOT used: it proves a
-- lodgment happened but carries no date, and a KPI cannot be built on a
-- timestamp that is really "when someone typed it in".

CREATE OR REPLACE FUNCTION kpi_metric_lodgment_tat(
  p_user_id TEXT, p_start DATE, p_end DATE
) RETURNS TABLE (actual NUMERIC, display TEXT, evidence JSONB)
LANGUAGE sql STABLE AS $fn$
WITH entries AS (
  SELECT b.id, b.booking_number, b.customer_name,
         kpi_milestone_at(b.id, 'lodgment') AS lodged_at,
         GREATEST(
           COALESCE(kpi_milestone_at(b.id, 'final_docs'), '-infinity'::timestamptz),
           COALESCE(kpi_milestone_at(b.id, 'manifest'),   '-infinity'::timestamptz)
         ) AS clock_start
  FROM bookings b
  WHERE kpi_booking_owner(b.id,
          ARRAY['customs_declarant','impex_officer','impex_supervisor']) = p_user_id
),
scored AS (
  SELECT id, booking_number, customer_name, clock_start, lodged_at,
         ROUND(EXTRACT(EPOCH FROM (lodged_at - clock_start)) / 3600.0, 1) AS hours_taken,
         (EXTRACT(EPOCH FROM (lodged_at - clock_start)) / 3600.0) <= 24 AS on_time
  FROM entries
  WHERE lodged_at IS NOT NULL AND clock_start > '-infinity'::timestamptz
    AND lodged_at >= p_start AND lodged_at < (p_end + 1)
)
SELECT
  CASE WHEN count(*) = 0 THEN NULL
       ELSE ROUND(100.0 * count(*) FILTER (WHERE on_time) / count(*), 1) END,
  CASE WHEN count(*) = 0 THEN 'No lodgment dates recorded this period'
       ELSE count(*) FILTER (WHERE on_time) || ' of ' || count(*) || ' lodged within 24 hrs' END,
  COALESCE(jsonb_agg(jsonb_build_object(
    'booking_id', id, 'booking', booking_number, 'customer', customer_name,
    'clock_start', clock_start, 'lodged_at', lodged_at,
    'hours_taken', hours_taken, 'threshold_hours', 24, 'on_time', on_time
  ) ORDER BY on_time, hours_taken DESC), '[]'::jsonb)
FROM scored;
$fn$;

-- ─── fan_tat (Brokerage 15%) ────────────────────────────────────────────────
--
-- "Final Assessment Notice secured within 48 hours from the date of lodgment."

CREATE OR REPLACE FUNCTION kpi_metric_fan_tat(
  p_user_id TEXT, p_start DATE, p_end DATE
) RETURNS TABLE (actual NUMERIC, display TEXT, evidence JSONB)
LANGUAGE sql STABLE AS $fn$
WITH entries AS (
  SELECT b.id, b.booking_number, b.customer_name,
         kpi_milestone_at(b.id, 'lodgment')         AS lodged_at,
         kpi_milestone_at(b.id, 'final_assessment') AS assessed_at
  FROM bookings b
  WHERE kpi_booking_owner(b.id,
          ARRAY['customs_declarant','impex_officer','impex_supervisor']) = p_user_id
),
scored AS (
  SELECT id, booking_number, customer_name, lodged_at, assessed_at,
         ROUND(EXTRACT(EPOCH FROM (assessed_at - lodged_at)) / 3600.0, 1) AS hours_taken,
         (EXTRACT(EPOCH FROM (assessed_at - lodged_at)) / 3600.0) <= 48 AS on_time
  FROM entries
  WHERE lodged_at IS NOT NULL AND assessed_at IS NOT NULL
    AND assessed_at >= p_start AND assessed_at < (p_end + 1)
)
SELECT
  CASE WHEN count(*) = 0 THEN NULL
       ELSE ROUND(100.0 * count(*) FILTER (WHERE on_time) / count(*), 1) END,
  CASE WHEN count(*) = 0 THEN 'No assessment dates recorded this period'
       ELSE count(*) FILTER (WHERE on_time) || ' of ' || count(*) || ' within 48 hrs' END,
  COALESCE(jsonb_agg(jsonb_build_object(
    'booking_id', id, 'booking', booking_number, 'customer', customer_name,
    'lodged_at', lodged_at, 'assessed_at', assessed_at,
    'hours_taken', hours_taken, 'threshold_hours', 48, 'on_time', on_time
  ) ORDER BY on_time, hours_taken DESC), '[]'::jsonb)
FROM scored;
$fn$;

-- ─── manifest_on_time (Forwarding 20%) ──────────────────────────────────────
--
-- Submitted before the carrier cut-off. Both sides must be recorded: without a
-- cut-off there is no deadline to be late against, and assuming one would
-- manufacture a result.

CREATE OR REPLACE FUNCTION kpi_metric_manifest_on_time(
  p_user_id TEXT, p_start DATE, p_end DATE
) RETURNS TABLE (actual NUMERIC, display TEXT, evidence JSONB)
LANGUAGE sql STABLE AS $fn$
WITH shipments AS (
  SELECT b.id, b.booking_number, b.customer_name,
         kpi_milestone_at(b.id, 'manifest_submitted') AS submitted_at,
         kpi_milestone_at(b.id, 'manifest_cutoff')    AS cutoff_at
  FROM bookings b
  WHERE kpi_booking_owner(b.id,
          ARRAY['handler','operations_supervisor','admin_logistics']) = p_user_id
),
scored AS (
  SELECT id, booking_number, customer_name, submitted_at, cutoff_at,
         ROUND(EXTRACT(EPOCH FROM (cutoff_at - submitted_at)) / 3600.0, 1) AS hours_spare,
         (submitted_at <= cutoff_at) AS on_time
  FROM shipments
  WHERE submitted_at IS NOT NULL AND cutoff_at IS NOT NULL
    AND submitted_at >= p_start AND submitted_at < (p_end + 1)
)
SELECT
  CASE WHEN count(*) = 0 THEN NULL
       ELSE ROUND(100.0 * count(*) FILTER (WHERE on_time) / count(*), 1) END,
  CASE WHEN count(*) = 0 THEN 'No manifest submissions recorded this period'
       ELSE count(*) FILTER (WHERE on_time) || ' of ' || count(*) || ' before cut-off' END,
  COALESCE(jsonb_agg(jsonb_build_object(
    'booking_id', id, 'booking', booking_number, 'customer', customer_name,
    'cutoff_at', cutoff_at, 'submitted_at', submitted_at,
    'hours_spare', hours_spare, 'on_time', on_time
  ) ORDER BY on_time, hours_spare), '[]'::jsonb)
FROM scored;
$fn$;

-- Internal, like the resolvers in 255: get_kpi_scorecard is the only entry point.
-- Called directly by a session they would run under that session's RLS and
-- return flatteringly incomplete numbers.
REVOKE EXECUTE ON FUNCTION kpi_metric_ontime_delivery(TEXT, DATE, DATE)  FROM authenticated;
REVOKE EXECUTE ON FUNCTION kpi_metric_new_customers(TEXT, DATE, DATE)    FROM authenticated;
REVOKE EXECUTE ON FUNCTION kpi_metric_lodgment_tat(TEXT, DATE, DATE)     FROM authenticated;
REVOKE EXECUTE ON FUNCTION kpi_metric_fan_tat(TEXT, DATE, DATE)          FROM authenticated;
REVOKE EXECUTE ON FUNCTION kpi_metric_manifest_on_time(TEXT, DATE, DATE) FROM authenticated;
GRANT EXECUTE ON FUNCTION kpi_booking_owner(TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION kpi_milestone_at(TEXT, TEXT)    TO authenticated;
