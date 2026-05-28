-- Contract Rate Versions
-- Stores immutable snapshots of contract rate matrices so bookings
-- can be pinned to the version that was current when they were created.

CREATE TABLE IF NOT EXISTS contract_rate_versions (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  contract_id     TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL DEFAULT 1,
  rate_matrices   JSONB NOT NULL DEFAULT '[]'::jsonb,
  effective_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_until TIMESTAMPTZ,
  change_summary  TEXT,
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contract_id, version_number)
);

CREATE INDEX idx_crv_contract ON contract_rate_versions(contract_id);
CREATE INDEX idx_crv_contract_effective ON contract_rate_versions(contract_id, effective_from DESC);
CREATE INDEX idx_crv_current ON contract_rate_versions(contract_id) WHERE effective_until IS NULL;

-- Pin bookings to a specific rate version
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS rate_version_id TEXT REFERENCES contract_rate_versions(id) ON DELETE SET NULL;

CREATE INDEX idx_bookings_rate_version ON bookings(rate_version_id) WHERE rate_version_id IS NOT NULL;

-- RLS
ALTER TABLE contract_rate_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON contract_rate_versions
  FOR ALL USING (true) WITH CHECK (true);

-- Backfill: create v1 for every existing contract that has rate_matrices
INSERT INTO contract_rate_versions (contract_id, version_number, rate_matrices, effective_from, change_summary, created_by_name)
SELECT
  q.id,
  1,
  COALESCE(q.details->'rate_matrices', '[]'::jsonb),
  COALESCE(q.created_at, now()),
  'Initial version (backfill)',
  'System'
FROM quotations q
WHERE q.quotation_type = 'contract'
  AND q.details IS NOT NULL
  AND jsonb_typeof(COALESCE(q.details->'rate_matrices', 'null'::jsonb)) = 'array'
  AND jsonb_array_length(COALESCE(q.details->'rate_matrices', '[]'::jsonb)) > 0
ON CONFLICT (contract_id, version_number) DO NOTHING;

-- Backfill: pin existing contract bookings to their contract's v1
UPDATE bookings b
SET rate_version_id = crv.id
FROM contract_rate_versions crv
WHERE b.contract_id IS NOT NULL
  AND b.contract_id = crv.contract_id
  AND crv.version_number = 1
  AND b.rate_version_id IS NULL;
