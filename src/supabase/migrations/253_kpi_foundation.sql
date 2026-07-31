-- Migration 253: KPI foundation (Phase 1 — Pricing scorecard)
--
-- Implements docs/KPI_FEATURE_PLAN.md §3. Four tables + one column.
--
-- Doctrine notes:
--   * Definitions are DATA, not code (same reasoning as routing_rules). Falcons
--     changes a weight -> row edit + effective_from, no deploy. The next client
--     gets different rows, not a fork.
--   * weight_pct_snapshot on kpi_scores mirrors catalog_snapshot / applied_rates:
--     a locked period must render exactly as it was signed, even after the
--     definition's weight moves.
--   * RLS follows migration 217 doctrine — permissive at the row layer; the
--     module grant gates PAGES and the visibility dial gates WHOSE scorecard you
--     may read, both enforced in the app (PermissionProvider / useDataScope).
--
-- Phase 1 deliberately omits kpi_period_signoffs (Phase 2) and booking_milestones
-- (Phase 3). They are not needed to score Pricing.

-- ─── Definitions ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kpi_definitions (
  id                TEXT PRIMARY KEY,
  scorecard_key     TEXT NOT NULL,          -- 'pricing' | 'brokerage' | 'forwarding' | 'trucking' | 'bdd'
  sort_order        INTEGER NOT NULL DEFAULT 0,
  name              TEXT NOT NULL,
  definition_text   TEXT,                   -- verbatim from the Falcons PDF
  target_text       TEXT,
  measurement_text  TEXT,
  weight_pct        NUMERIC NOT NULL CHECK (weight_pct > 0 AND weight_pct <= 100),
  -- how the actual arrives:
  --   auto     — computed, nobody touches it
  --   proposed — computed + a verdict the evaluator confirms or overrides
  --   logged   — a human records events, the system counts them
  --   judgment — irreducibly a person's opinion
  source            TEXT NOT NULL CHECK (source IN ('auto','proposed','logged','judgment')),
  metric_key        TEXT,                   -- resolver key; required when source='auto'
  target_value      NUMERIC,
  target_unit       TEXT,                   -- 'pct' | 'incidents' | 'php' | 'count'
  direction         TEXT NOT NULL CHECK (direction IN ('higher_better','lower_better','zero_target')),
  rating_thresholds JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_from    DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to      DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kpi_definitions_auto_needs_metric
    CHECK (source <> 'auto' OR metric_key IS NOT NULL),
  CONSTRAINT kpi_definitions_effective_range
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS kpi_definitions_scorecard_idx
  ON kpi_definitions(scorecard_key, sort_order);

-- ─── Evaluation periods ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kpi_periods (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL UNIQUE,         -- '2026-07'
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  -- open      — live, scores computed on read
  -- in_review — closed to new activity, evaluators working
  -- evaluated / reviewed — sign-off chain (Phase 2)
  -- locked    — immutable; corrections become amendments, never edits
  status      TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open','in_review','evaluated','reviewed','locked')),
  opened_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at   TIMESTAMPTZ,
  locked_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kpi_periods_date_range CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS kpi_periods_range_idx ON kpi_periods(start_date, end_date);

-- ─── Scores ──────────────────────────────────────────────────────────────────
--
-- Rows are materialized when a period closes. While a period is 'open' the
-- scorecard is computed on read (get_kpi_scorecard) — no cron, nothing stale.

CREATE TABLE IF NOT EXISTS kpi_scores (
  id                  TEXT PRIMARY KEY,
  period_id           TEXT NOT NULL REFERENCES kpi_periods(id) ON DELETE CASCADE,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kpi_definition_id   TEXT NOT NULL REFERENCES kpi_definitions(id),
  weight_pct_snapshot NUMERIC NOT NULL,
  actual_value        NUMERIC,
  actual_display      TEXT,                 -- '11 of 14 (78.6%)' — what the UI shows
  actual_source       TEXT CHECK (actual_source IN ('computed','manual')),
  actual_computed_at  TIMESTAMPTZ,
  evidence            JSONB,                -- row ids behind the number, frozen at compute time
  suggested_rating    SMALLINT CHECK (suggested_rating BETWEEN 1 AND 5),
  rating              SMALLINT CHECK (rating BETWEEN 1 AND 5),
  override_reason     TEXT,
  -- No data / no target => excluded and the remaining weights renormalise.
  -- Never score a missing input as zero: that looks precise while being wrong.
  excluded            BOOLEAN NOT NULL DEFAULT false,
  excluded_reason     TEXT,
  weighted_score      NUMERIC GENERATED ALWAYS AS (
                        CASE WHEN excluded OR rating IS NULL THEN NULL
                             ELSE ROUND(weight_pct_snapshot * rating / 5.0, 2) END
                      ) STORED,
  evaluated_by        TEXT,
  evaluated_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kpi_scores_unique_cell UNIQUE (period_id, user_id, kpi_definition_id),
  CONSTRAINT kpi_scores_override_needs_reason
    CHECK (rating IS NULL OR suggested_rating IS NULL
           OR rating = suggested_rating OR override_reason IS NOT NULL),
  CONSTRAINT kpi_scores_excluded_needs_reason
    CHECK (NOT excluded OR excluded_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS kpi_scores_period_user_idx ON kpi_scores(period_id, user_id);
CREATE INDEX IF NOT EXISTS kpi_scores_user_idx        ON kpi_scores(user_id);

-- ─── Per-user targets ────────────────────────────────────────────────────────
--
-- Sales quota (Pricing #4, BDD #5) has a numerator in the system and no
-- denominator. This is the denominator. A metric with no target row excludes
-- itself rather than scoring zero.
-- period_id NULL = a standing target that applies until superseded.

CREATE TABLE IF NOT EXISTS user_targets (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_id    TEXT REFERENCES kpi_periods(id) ON DELETE CASCADE,
  metric_key   TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_targets_scoped_idx
  ON user_targets(user_id, metric_key, period_id) WHERE period_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_targets_standing_idx
  ON user_targets(user_id, metric_key) WHERE period_id IS NULL;

-- ─── Trade lane region (Pricing quotation TAT thresholds) ────────────────────
--
-- The Pricing scorecard splits freight TAT into Intra-Asia (24 hrs) and Outside
-- Asia (48 hrs). Only those two values are needed, so only those two exist —
-- this is not a general region taxonomy.
--
-- Scope note: "Intra-Asia" here is the liner trade lane (East / Southeast /
-- South Asia). The Middle East is a separate lane and is NOT counted as Asia.
-- If Falcons disagrees, it is an UPDATE, not a migration.

ALTER TABLE profile_countries ADD COLUMN IF NOT EXISTS region TEXT;

UPDATE profile_countries SET region = 'Outside Asia' WHERE region IS NULL;

UPDATE profile_countries SET region = 'Asia'
WHERE upper(iso_code) IN (
  'CN','HK','MO','TW','JP','KR','KP',                    -- East Asia
  'SG','MY','TH','VN','ID','PH','KH','MM','LA','BN','TL',-- Southeast Asia
  'IN','BD','LK','PK','NP','BT','MV',                    -- South Asia
  'MN'                                                    -- Mongolia
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE kpi_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_periods     ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_scores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_targets    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_definitions_all" ON kpi_definitions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "kpi_periods_all" ON kpi_periods
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "kpi_scores_all" ON kpi_scores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "user_targets_all" ON user_targets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
