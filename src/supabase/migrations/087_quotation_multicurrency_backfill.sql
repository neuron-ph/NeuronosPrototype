-- Migration 087: backfill multi-currency defaults on quotation rate matrices
-- and line items so legacy rows carry explicit currency context.
--
-- Schema impact: NONE. Both targets live inside the existing
-- `quotations.details` JSONB column:
--   - details.rate_matrices: ContractRateMatrix[]
--       new fields: currency (string, "PHP"|"USD"), exchange_rate (numeric)
--   - details.line_items_new: QuotationLineItemNew[]
--       new field: forex_rate_date (string, ISO YYYY-MM-DD)
--
-- Backfill rules:
--   * Every rate matrix without `currency` gets currency="PHP", exchange_rate=1.
--   * Line items where forex_rate IS exactly 1 (or absent) get forex_rate_date=NULL
--     (PHP lines never had a meaningful date).
--   * Line items where forex_rate is non-1 BUT forex_rate_date is missing get
--     stamped with the parent quotation's created_at::date, since that's the
--     best available proxy for when the rate was originally locked.
--
-- Re-runnable. Updates only rows missing the new fields; existing values are
-- never overwritten.

-- --------------------------------------------------------------------------
-- 1. Backfill rate_matrices: stamp PHP/1 on matrices that lack currency.
-- --------------------------------------------------------------------------
UPDATE quotations q
SET details = jsonb_set(
  details,
  '{rate_matrices}',
  (
    SELECT COALESCE(
      jsonb_agg(
        CASE
          WHEN matrix ? 'currency' THEN matrix
          ELSE matrix
            || jsonb_build_object('currency', 'PHP', 'exchange_rate', 1)
        END
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements(details->'rate_matrices') AS matrix
  ),
  false
)
WHERE jsonb_typeof(details->'rate_matrices') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(details->'rate_matrices') AS m
    WHERE NOT (m ? 'currency')
  );

-- --------------------------------------------------------------------------
-- 2. Backfill line_items_new: stamp forex_rate_date on non-PHP lines that
--    have a real rate but no date. Use the quotation's created_at as the
--    historical proxy.
-- --------------------------------------------------------------------------
UPDATE quotations q
SET details = jsonb_set(
  details,
  '{line_items_new}',
  (
    SELECT COALESCE(
      jsonb_agg(
        CASE
          WHEN (li ? 'forex_rate_date') THEN li
          WHEN COALESCE((li->>'forex_rate')::numeric, 1) = 1 THEN li
          ELSE li
            || jsonb_build_object('forex_rate_date', to_char(q.created_at, 'YYYY-MM-DD'))
        END
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements(details->'line_items_new') AS li
  ),
  false
)
WHERE jsonb_typeof(details->'line_items_new') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(details->'line_items_new') AS li
    WHERE NOT (li ? 'forex_rate_date')
      AND COALESCE((li->>'forex_rate')::numeric, 1) <> 1
  );

-- --------------------------------------------------------------------------
-- Verification queries (run manually if you want to confirm coverage):
--
--   -- How many matrices now carry explicit currency?
--   SELECT COUNT(*) FROM quotations,
--     LATERAL jsonb_array_elements(details->'rate_matrices') AS m
--   WHERE m ? 'currency';
--
--   -- Any non-PHP line items still missing a rate date?
--   SELECT q.id, li
--   FROM quotations q,
--     LATERAL jsonb_array_elements(details->'line_items_new') AS li
--   WHERE COALESCE((li->>'forex_rate')::numeric, 1) <> 1
--     AND NOT (li ? 'forex_rate_date');
-- --------------------------------------------------------------------------
