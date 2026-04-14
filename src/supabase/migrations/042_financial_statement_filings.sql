-- Financial statement filing/approval workflow
CREATE TABLE IF NOT EXISTS financial_statement_filings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_type    TEXT NOT NULL CHECK (statement_type IN ('income_statement', 'balance_sheet', 'cash_flow')),
  period_year       INTEGER NOT NULL,
  period_month      INTEGER NOT NULL, -- 0-indexed (0 = January)
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved', 'filed')),
  prepared_by       TEXT REFERENCES users(id),
  reviewed_by       TEXT REFERENCES users(id),
  approved_by       TEXT REFERENCES users(id),
  prepared_at       TIMESTAMPTZ,
  reviewed_at       TIMESTAMPTZ,
  approved_at       TIMESTAMPTZ,
  filed_at          TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (statement_type, period_year, period_month)
);

-- RLS
ALTER TABLE financial_statement_filings ENABLE ROW LEVEL SECURITY;

-- Accounting and Executive can read all filings
CREATE POLICY "filings_read" ON financial_statement_filings
  FOR SELECT USING (true);

-- Accounting can create/update filings
CREATE POLICY "filings_write" ON financial_statement_filings
  FOR ALL USING (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_filing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER filings_updated_at
  BEFORE UPDATE ON financial_statement_filings
  FOR EACH ROW EXECUTE FUNCTION update_filing_timestamp();
