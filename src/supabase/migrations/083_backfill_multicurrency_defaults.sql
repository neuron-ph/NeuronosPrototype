-- Migration 083: Backfill FX defaults for all pre-existing rows.
--
-- Every legacy record predates multi-currency support and is implicitly PHP.
-- After this runs, every row has populated FX columns so that new read paths
-- can rely on `base_amount` / `base_currency` / `exchange_rate` being present.

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
UPDATE invoices SET
  original_currency  = COALESCE(original_currency, NULLIF(currency, ''), 'PHP'),
  exchange_rate      = COALESCE(exchange_rate, 1),
  base_currency      = COALESCE(base_currency, 'PHP'),
  base_amount        = COALESCE(base_amount, total_amount, 0),
  exchange_rate_date = COALESCE(
    exchange_rate_date,
    invoice_date::DATE,
    created_at::DATE
  )
WHERE original_currency IS NULL
   OR exchange_rate IS NULL
   OR base_amount IS NULL
   OR exchange_rate_date IS NULL;

-- ---------------------------------------------------------------------------
-- collections
-- ---------------------------------------------------------------------------
UPDATE collections SET
  original_currency  = COALESCE(original_currency, NULLIF(currency, ''), 'PHP'),
  exchange_rate      = COALESCE(exchange_rate, 1),
  base_currency      = COALESCE(base_currency, 'PHP'),
  base_amount        = COALESCE(base_amount, amount, 0),
  exchange_rate_date = COALESCE(
    exchange_rate_date,
    collection_date::DATE,
    created_at::DATE
  )
WHERE original_currency IS NULL
   OR exchange_rate IS NULL
   OR base_amount IS NULL
   OR exchange_rate_date IS NULL;

-- ---------------------------------------------------------------------------
-- evouchers
-- ---------------------------------------------------------------------------
UPDATE evouchers SET
  original_currency  = COALESCE(original_currency, NULLIF(currency, ''), 'PHP'),
  exchange_rate      = COALESCE(exchange_rate, 1),
  base_currency      = COALESCE(base_currency, 'PHP'),
  base_amount        = COALESCE(base_amount, amount, 0),
  exchange_rate_date = COALESCE(exchange_rate_date, created_at::DATE)
WHERE original_currency IS NULL
   OR exchange_rate IS NULL
   OR base_amount IS NULL
   OR exchange_rate_date IS NULL;

-- ---------------------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------------------
UPDATE expenses SET
  original_currency  = COALESCE(original_currency, NULLIF(currency, ''), 'PHP'),
  exchange_rate      = COALESCE(exchange_rate, 1),
  base_currency      = COALESCE(base_currency, 'PHP'),
  base_amount        = COALESCE(base_amount, amount, 0),
  exchange_rate_date = COALESCE(exchange_rate_date, created_at::DATE)
WHERE original_currency IS NULL
   OR exchange_rate IS NULL
   OR base_amount IS NULL
   OR exchange_rate_date IS NULL;

-- ---------------------------------------------------------------------------
-- billing_line_items
-- ---------------------------------------------------------------------------
UPDATE billing_line_items SET
  exchange_rate = COALESCE(exchange_rate, 1),
  base_currency = COALESCE(base_currency, 'PHP'),
  base_amount   = COALESCE(base_amount, amount, 0)
WHERE exchange_rate IS NULL
   OR base_amount IS NULL;

-- ---------------------------------------------------------------------------
-- journal_entries
-- Treat every legacy entry as a PHP-native posting. total_debit is already
-- the PHP-base sum, so we mirror it into source_amount/base_amount.
-- ---------------------------------------------------------------------------
UPDATE journal_entries SET
  transaction_currency = COALESCE(transaction_currency, 'PHP'),
  exchange_rate        = COALESCE(exchange_rate, 1),
  base_currency        = COALESCE(base_currency, 'PHP'),
  source_amount        = COALESCE(source_amount, total_debit, 0),
  base_amount          = COALESCE(base_amount, total_debit, 0),
  exchange_rate_date   = COALESCE(
    exchange_rate_date,
    entry_date::DATE,
    created_at::DATE
  )
WHERE transaction_currency IS NULL
   OR exchange_rate IS NULL
   OR base_amount IS NULL
   OR exchange_rate_date IS NULL;
