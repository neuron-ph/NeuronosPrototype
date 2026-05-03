-- Migration 080: Exchange rate master table.
--
-- Stores manually maintained daily rates (initially USD <-> PHP). Posting flows
-- look up the rate for a given transaction date here so historical entries do
-- not drift when current market rates change.
--
-- Rates persisted on a posted document/journal are still authoritative for
-- that document. This table is a default/lookup source, not the source of
-- truth for posted FX.

CREATE TABLE IF NOT EXISTS exchange_rates (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  rate_date       DATE NOT NULL,
  from_currency   TEXT NOT NULL,
  to_currency     TEXT NOT NULL,
  rate            NUMERIC(18, 8) NOT NULL CHECK (rate > 0),
  source          TEXT,                          -- 'manual','treasury','accounting'
  notes           TEXT,
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT exchange_rates_currency_pair_check
    CHECK (from_currency IN ('PHP', 'USD') AND to_currency IN ('PHP', 'USD')),
  CONSTRAINT exchange_rates_distinct_currencies_check
    CHECK (from_currency <> to_currency),
  CONSTRAINT exchange_rates_unique_per_day
    UNIQUE (rate_date, from_currency, to_currency)
);

SELECT add_updated_at_trigger('exchange_rates');

CREATE INDEX IF NOT EXISTS idx_exchange_rates_date
  ON exchange_rates(rate_date DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair_date
  ON exchange_rates(from_currency, to_currency, rate_date DESC);

-- Seed a starter row so dev environments have a usable USD->PHP default.
INSERT INTO exchange_rates (rate_date, from_currency, to_currency, rate, source, notes)
VALUES (CURRENT_DATE, 'USD', 'PHP', 58.00, 'manual', 'Seed rate for dev/staging')
ON CONFLICT (rate_date, from_currency, to_currency) DO NOTHING;
