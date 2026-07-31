-- Migration 254: seed the Pricing scorecard + evaluation periods.
--
-- Config data, not schema — idempotent so it is safe to re-run and carries the
-- definitions to prod (same pattern as 246_routing_rules).
--
-- Text is VERBATIM from KPIs/Falcons_KPI-Pricing.pdf. definition_text /
-- target_text / measurement_text are shown in the UI on hover so an employee can
-- always see the rule they are being measured against, in Falcons' own words.
--
-- Weights sum to 100: 35 + 15 + 15 + 15 + 12 + 8.
--
-- rating_thresholds shapes:
--   {"kind":"pct_of_target"}   — the Guide's 5/4/3/2/1 scale (>100 / 100 / 90-99 / 70-89 / <70)
--   {"kind":"zero_incidents"}  — 0 incidents -> 5, 1 -> 3, 2 -> 2, 3+ -> 1.
--     The Guide's percentage scale is meaningless for a zero target (90% of zero
--     is nothing), so zero-target KPIs carry their own bands. Falcons tunes these
--     by editing the row.

-- effective_from is set explicitly to 2026-01-01, NOT left to default.
-- The default is CURRENT_DATE, which would make these definitions ineffective
-- for every period that ended before the day they were seeded — and Phase 1's
-- whole point is opening with real backfilled history rather than a blank page.
-- A definition's effective_from is when Falcons' rule applied, not when we typed it in.

INSERT INTO kpi_definitions (
  id, scorecard_key, sort_order, name,
  definition_text, target_text, measurement_text,
  weight_pct, source, metric_key, target_value, target_unit, direction, rating_thresholds,
  effective_from
)
SELECT * FROM (VALUES

  ('kpi-pricing-quotation-tat', 'pricing', 1, 'Quotation (All Types)',
   'All quotations are treated as ONE item. Each must be released within its applicable turnaround time from receipt of complete inquiry: Freight - Intra-Asia: within 24 hrs; Freight - Outside Asia: within 48 hrs; Brokerage - All-In: within 24 hrs; Brokerage - Regular / Non-Regular: within 12 hrs; Trucking: within 12 hrs; Marine Insurance: within 24 hrs; Miscellaneous: within 24 hrs',
   '100% released within the applicable turnaround time',
   '(No. of quotations released within the applicable turnaround time / Total quotation requests handled) x 100%',
   35, 'auto', 'quotation_tat', 100, 'pct', 'higher_better',
   '{"kind":"pct_of_target"}'::jsonb, DATE '2026-01-01'),

  ('kpi-pricing-misquote', 'pricing', 2, 'Misquote / Lapses',
   'Errors in rates, charges, or terms; omissions or lapses affecting profitability or client commitment.',
   'Zero misquotes / lapses',
   'Count of documented misquotes or lapses per month',
   15, 'proposed', 'misquote_revisions', 0, 'incidents', 'zero_target',
   '{"kind":"zero_incidents"}'::jsonb, DATE '2026-01-01'),

  ('kpi-pricing-billing', 'pricing', 3, 'Billing',
   'Billing statement issued within 24 hours after completion of delivery.',
   '100% billed within 24 hrs',
   '(No. of billings issued within 24 hrs / Total completed deliveries) x 100%',
   15, 'auto', 'billing_tat_24h', 100, 'pct', 'higher_better',
   '{"kind":"pct_of_target"}'::jsonb, DATE '2026-01-01'),

  ('kpi-pricing-sales-quota', 'pricing', 4, 'Sales Quota',
   'Achievement of the individually assigned monthly / quarterly sales target.',
   '100% or more of quota achieved',
   '(Actual sales achieved / Assigned quota) x 100%',
   15, 'auto', 'sales_quota', 100, 'pct', 'higher_better',
   '{"kind":"pct_of_target"}'::jsonb, DATE '2026-01-01'),

  -- source='logged' until the HR module lands. metric_key is reserved NOW so HR
  -- has a contract to satisfy, rather than KPIs being retrofitted onto whatever
  -- HR happens to build.
  ('kpi-pricing-punctuality', 'pricing', 5, 'Punctuality',
   'Attendance and on-time reporting for work and assigned tasks.',
   '100% - no tardiness / no absence without leave',
   'Count of tardiness / undertime / unauthorized absences per month',
   12, 'logged', 'attendance_punctuality', 0, 'incidents', 'zero_target',
   '{"kind":"zero_incidents"}'::jsonb, DATE '2026-01-01'),

  -- The only irreducibly human KPI on this scorecard. It should stay that way.
  ('kpi-pricing-behavior', 'pricing', 6, 'Behavior',
   'Conduct, professionalism, teamwork, and compliance with the Company Code of Conduct.',
   'Full compliance - no disciplinary record',
   'Supervisor evaluation and count of documented incidents',
   8, 'judgment', NULL, 0, 'incidents', 'zero_target',
   '{"kind":"zero_incidents"}'::jsonb, DATE '2026-01-01')

) AS v(id, scorecard_key, sort_order, name, definition_text, target_text, measurement_text,
       weight_pct, source, metric_key, target_value, target_unit, direction, rating_thresholds,
       effective_from)
WHERE NOT EXISTS (SELECT 1 FROM kpi_definitions d WHERE d.id = v.id);

-- ─── Evaluation periods ──────────────────────────────────────────────────────
-- Seeded back to May 2026 so Phase 1 opens with real history computed from
-- activity_log, not an empty page.
--
-- All three are 'open'. 'locked' means signed and frozen — it is NOT a synonym
-- for "in the past". May and June were never run through an evaluation, so
-- calling them locked would claim a sign-off that never happened. They stay
-- open and compute live until someone actually evaluates them.

INSERT INTO kpi_periods (id, label, start_date, end_date, status)
SELECT * FROM (VALUES
  ('kpi-period-2026-05', '2026-05', DATE '2026-05-01', DATE '2026-05-31', 'open'),
  ('kpi-period-2026-06', '2026-06', DATE '2026-06-01', DATE '2026-06-30', 'open'),
  ('kpi-period-2026-07', '2026-07', DATE '2026-07-01', DATE '2026-07-31', 'open')
) AS v(id, label, start_date, end_date, status)
WHERE NOT EXISTS (SELECT 1 FROM kpi_periods p WHERE p.id = v.id);
