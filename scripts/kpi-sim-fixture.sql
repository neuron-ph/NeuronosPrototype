-- KPI Phase 1 simulation fixture — DEV ONLY. Never a migration, never prod.
-- Subject: Sarah May B. Baylon (user-ef8325fb), Pricing Officer, period 2026-07.
--
-- Designed so the expected score is hand-computable and every branch is hit:
--   * all three brokerage subtypes, both forwarding regions, trucking
--   * the exactly-at-threshold boundary (12.0h vs 12h)
--   * a 40h quote that PASSES 48h but would fail 24h  (region split)
--   * a 20h quote that FAILS 12h but would pass 24h   (trucking strictness)
--   * all four source kinds: auto, proposed, logged, judgment
--
-- Teardown: DELETE FROM ... WHERE id LIKE 'kpi-sim-%'  (see bottom)

DELETE FROM activity_log WHERE id LIKE 'kpi-sim-%';
DELETE FROM invoices     WHERE id LIKE 'kpi-sim-%';
DELETE FROM bookings     WHERE id LIKE 'kpi-sim-%';
DELETE FROM quotations   WHERE id LIKE 'kpi-sim-%';
DELETE FROM kpi_scores   WHERE id LIKE 'kpi-sim-%';
DELETE FROM user_targets WHERE id LIKE 'kpi-sim-%';

-- ─── KPI 1: Quotation TAT — 10 quotes, 8 on time = 80% -> rating 2 ───────────

INSERT INTO quotations (id, quotation_number, quotation_type, status, created_by, assigned_to,
                        customer_name, currency, total_selling, services, services_metadata,
                        created_at, updated_at)
VALUES
 ('kpi-sim-q01','SIM-Q01','spot','Priced','user-ef8325fb','user-ef8325fb','Sim Client A','PHP',0,
  ARRAY['Brokerage'],'[{"service_type":"Brokerage","service_details":{"brokerage_type":"All-Inclusive"}}]'::jsonb,
  '2026-07-05 08:00+08','2026-07-05 18:00+08'),
 ('kpi-sim-q02','SIM-Q02','spot','Priced','user-ef8325fb','user-ef8325fb','Sim Client A','PHP',0,
  ARRAY['Brokerage'],'[{"service_type":"Brokerage","service_details":{"brokerage_type":"All-Inclusive"}}]'::jsonb,
  '2026-07-06 08:00+08','2026-07-07 07:00+08'),
 ('kpi-sim-q03','SIM-Q03','spot','Priced','user-ef8325fb','user-ef8325fb','Sim Client B','PHP',0,
  ARRAY['Brokerage'],'[{"service_type":"Brokerage","service_details":{"brokerage_type":"All-Inclusive"}}]'::jsonb,
  '2026-07-07 08:00+08','2026-07-08 14:00+08'),
 ('kpi-sim-q04','SIM-Q04','spot','Priced','user-ef8325fb','user-ef8325fb','Sim Client B','PHP',0,
  ARRAY['Brokerage'],'[{"service_type":"Brokerage","service_details":{"brokerage_type":"Standard"}}]'::jsonb,
  '2026-07-08 08:00+08','2026-07-08 14:00+08'),
 ('kpi-sim-q05','SIM-Q05','spot','Priced','user-ef8325fb','user-ef8325fb','Sim Client C','PHP',0,
  ARRAY['Brokerage'],'[{"service_type":"Brokerage","service_details":{"brokerage_type":"Standard"}}]'::jsonb,
  '2026-07-09 08:00+08','2026-07-09 20:00+08'),
 ('kpi-sim-q06','SIM-Q06','spot','Priced','user-ef8325fb','user-ef8325fb','Sim Client C','PHP',0,
  ARRAY['Brokerage'],'[{"service_type":"Brokerage","service_details":{"brokerage_type":"Non-Regular"}}]'::jsonb,
  '2026-07-10 08:00+08','2026-07-10 19:00+08'),
 ('kpi-sim-q07','SIM-Q07','spot','Priced','user-ef8325fb','user-ef8325fb','Sim Client D','PHP',0,
  ARRAY['Forwarding'],'[{"service_type":"Forwarding","service_details":{"pol_aol":"PORT OF SHANGHAI (CNSHA)"}}]'::jsonb,
  '2026-07-11 08:00+08','2026-07-12 04:00+08'),
 ('kpi-sim-q08','SIM-Q08','spot','Priced','user-ef8325fb','user-ef8325fb','Sim Client D','PHP',0,
  ARRAY['Forwarding'],'[{"service_type":"Forwarding","service_details":{"pol_aol":"PORT OF ROTTERDAM (NLRTM)"}}]'::jsonb,
  '2026-07-12 08:00+08','2026-07-14 00:00+08'),
 ('kpi-sim-q09','SIM-Q09','spot','Priced','user-ef8325fb','user-ef8325fb','Sim Client E','PHP',0,
  ARRAY['Trucking'],'[{"service_type":"Trucking","service_details":{}}]'::jsonb,
  '2026-07-15 08:00+08','2026-07-15 16:00+08'),
 ('kpi-sim-q10','SIM-Q10','spot','Priced','user-ef8325fb','user-ef8325fb','Sim Client E','PHP',0,
  ARRAY['Trucking'],'[{"service_type":"Trucking","service_details":{}}]'::jsonb,
  '2026-07-16 08:00+08','2026-07-17 04:00+08');

-- Pending Pricing (clock start) then Priced (clock stop) for each.
INSERT INTO activity_log (id, entity_type, entity_id, entity_name, action_type,
                          old_value, new_value, user_id, user_name, user_department, created_at)
SELECT 'kpi-sim-start-'||q.n, 'quotation', q.qid, q.qid, 'status_change',
       'Draft','Pending Pricing','user-ef8325fb','Sarah May B. Baylon','Pricing', q.started
FROM (VALUES
 ('01','kpi-sim-q01', timestamptz '2026-07-05 08:00+08'),
 ('02','kpi-sim-q02', timestamptz '2026-07-06 08:00+08'),
 ('03','kpi-sim-q03', timestamptz '2026-07-07 08:00+08'),
 ('04','kpi-sim-q04', timestamptz '2026-07-08 08:00+08'),
 ('05','kpi-sim-q05', timestamptz '2026-07-09 08:00+08'),
 ('06','kpi-sim-q06', timestamptz '2026-07-10 08:00+08'),
 ('07','kpi-sim-q07', timestamptz '2026-07-11 08:00+08'),
 ('08','kpi-sim-q08', timestamptz '2026-07-12 08:00+08'),
 ('09','kpi-sim-q09', timestamptz '2026-07-15 08:00+08'),
 ('10','kpi-sim-q10', timestamptz '2026-07-16 08:00+08')
) AS q(n, qid, started);

INSERT INTO activity_log (id, entity_type, entity_id, entity_name, action_type,
                          old_value, new_value, user_id, user_name, user_department, created_at)
SELECT 'kpi-sim-priced-'||q.n, 'quotation', q.qid, q.qid, 'status_change',
       'Pending Pricing','Priced','user-ef8325fb','Sarah May B. Baylon','Pricing', q.priced
FROM (VALUES
 ('01','kpi-sim-q01', timestamptz '2026-07-05 18:00+08'),  -- 10h / 24h  ok
 ('02','kpi-sim-q02', timestamptz '2026-07-07 07:00+08'),  -- 23h / 24h  ok
 ('03','kpi-sim-q03', timestamptz '2026-07-08 14:00+08'),  -- 30h / 24h  LATE
 ('04','kpi-sim-q04', timestamptz '2026-07-08 14:00+08'),  --  6h / 12h  ok
 ('05','kpi-sim-q05', timestamptz '2026-07-09 20:00+08'),  -- 12h / 12h  ok  (boundary)
 ('06','kpi-sim-q06', timestamptz '2026-07-10 19:00+08'),  -- 11h / 12h  ok
 ('07','kpi-sim-q07', timestamptz '2026-07-12 04:00+08'),  -- 20h / 24h  ok  (Asia)
 ('08','kpi-sim-q08', timestamptz '2026-07-14 00:00+08'),  -- 40h / 48h  ok  (non-Asia)
 ('09','kpi-sim-q09', timestamptz '2026-07-15 16:00+08'),  --  8h / 12h  ok
 ('10','kpi-sim-q10', timestamptz '2026-07-17 04:00+08')   -- 20h / 12h  LATE
) AS q(n, qid, priced);

-- ─── KPI 2: Misquote — 1 revision -> rating 3 ────────────────────────────────

INSERT INTO activity_log (id, entity_type, entity_id, entity_name, action_type,
                          old_value, new_value, user_id, user_name, user_department, created_at)
VALUES ('kpi-sim-rev-01','quotation','kpi-sim-q03','kpi-sim-q03','status_change',
        'Priced','Needs Revision','user-c1fbae71','Jayson P. Nabos','Pricing','2026-07-09 09:00+08');

-- ─── KPI 3: Billing — 4 of 4 within 24h = 100% -> rating 4 (Guide cap) ───────

INSERT INTO bookings (id, booking_number, service_type, status, customer_name, details, created_at, updated_at)
VALUES
 ('kpi-sim-bk01','SIM-BK01','Brokerage','Delivered','Sim Client A','{"date_delivered":"2026-07-03"}'::jsonb,'2026-07-01+08','2026-07-03+08'),
 ('kpi-sim-bk02','SIM-BK02','Brokerage','Delivered','Sim Client B','{"date_delivered":"2026-07-06"}'::jsonb,'2026-07-01+08','2026-07-06+08'),
 ('kpi-sim-bk03','SIM-BK03','Trucking','Delivered','Sim Client C','{"date_delivered":"2026-07-10"}'::jsonb,'2026-07-01+08','2026-07-10+08'),
 ('kpi-sim-bk04','SIM-BK04','Forwarding','Delivered','Sim Client D','{"date_delivered":"2026-07-14"}'::jsonb,'2026-07-01+08','2026-07-14+08');

INSERT INTO invoices (id, invoice_number, invoice_date, booking_id, customer_name,
                      total_amount, currency, status, created_by, created_at, updated_at)
VALUES
 ('kpi-sim-inv01','SIM-INV01','2026-07-03 15:00+08','kpi-sim-bk01','Sim Client A',120000,'PHP','Issued','user-ef8325fb','2026-07-03+08','2026-07-03+08'),
 ('kpi-sim-inv02','SIM-INV02','2026-07-07 10:00+08','kpi-sim-bk02','Sim Client B',95000,'PHP','Issued','user-ef8325fb','2026-07-07+08','2026-07-07+08'),
 ('kpi-sim-inv03','SIM-INV03','2026-07-11 09:00+08','kpi-sim-bk03','Sim Client C',60000,'PHP','Issued','user-ef8325fb','2026-07-11+08','2026-07-11+08'),
 ('kpi-sim-inv04','SIM-INV04','2026-07-14 17:00+08','kpi-sim-bk04','Sim Client D',210000,'PHP','Issued','user-ef8325fb','2026-07-14+08','2026-07-14+08');

-- ─── KPI 4: Sales Quota — 1,200,000 of 1,000,000 = 120% -> rating 5 ─────────
-- No activity_log transitions on these two, so they do NOT enter the TAT count.

INSERT INTO user_targets (id, user_id, period_id, metric_key, target_value)
VALUES ('kpi-sim-target-01','user-ef8325fb',NULL,'sales_quota',1000000);

INSERT INTO quotations (id, quotation_number, quotation_type, status, created_by, assigned_to,
                        customer_name, currency, total_selling, services, services_metadata,
                        created_at, updated_at)
VALUES
 ('kpi-sim-w01','SIM-W01','spot','Accepted by Client','user-ef8325fb','user-ef8325fb','Sim Client F','PHP',700000,
  ARRAY['Forwarding'],'[{"service_type":"Forwarding","service_details":{}}]'::jsonb,'2026-06-20+08','2026-07-18 10:00+08'),
 ('kpi-sim-w02','SIM-W02','spot','Converted to Project','user-ef8325fb','user-ef8325fb','Sim Client G','PHP',500000,
  ARRAY['Brokerage'],'[{"service_type":"Brokerage","service_details":{"brokerage_type":"Standard"}}]'::jsonb,'2026-06-25+08','2026-07-22 14:00+08');

-- ─── KPI 5 (logged) + KPI 6 (judgment): what only a human can put there ─────

INSERT INTO kpi_scores (id, period_id, user_id, kpi_definition_id, weight_pct_snapshot,
                        actual_value, actual_display, actual_source, evaluated_by, evaluated_at)
VALUES ('kpi-sim-score-punct','kpi-period-2026-07','user-ef8325fb','kpi-pricing-punctuality',12,
        2,'2 late arrivals','manual','user-c1fbae71', now());

INSERT INTO kpi_scores (id, period_id, user_id, kpi_definition_id, weight_pct_snapshot,
                        actual_display, actual_source, rating, evaluated_by, evaluated_at)
VALUES ('kpi-sim-score-behav','kpi-period-2026-07','user-ef8325fb','kpi-pricing-behavior',8,
        'Supervisor evaluation — no incidents','manual',4,'user-c1fbae71', now());

-- ─── Expected result ────────────────────────────────────────────────────────
--   Quotation TAT   35%   80%       rating 2   14.00   lost 21.00
--   Misquote        15%   1         rating 3    9.00   lost  6.00
--   Billing         15%   100%      rating 4   12.00   lost  3.00   <- Guide cap
--   Sales Quota     15%   120%      rating 5   15.00   lost  0.00
--   Punctuality     12%   2         rating 2    4.80   lost  7.20
--   Behavior         8%   manual    rating 4    6.40   lost  1.60
--                                             ------
--   included weight 100        weighted sum   61.20    score 61.2
--   band: Needs Improvement (60-69)

-- TEARDOWN:
-- DELETE FROM activity_log WHERE id LIKE 'kpi-sim-%';
-- DELETE FROM invoices     WHERE id LIKE 'kpi-sim-%';
-- DELETE FROM bookings     WHERE id LIKE 'kpi-sim-%';
-- DELETE FROM quotations   WHERE id LIKE 'kpi-sim-%';
-- DELETE FROM kpi_scores   WHERE id LIKE 'kpi-sim-%';
-- DELETE FROM user_targets WHERE id LIKE 'kpi-sim-%';
