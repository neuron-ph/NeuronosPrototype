-- BD reuses the Pricing contracts module IDs (see ContractsList.tsx: contractDept
-- defaults to "pricing" for any non-Accounting caller). The Pricing contract tab
-- gates were never granted to BD-side access profiles, so a BD Manager opening
-- a contract from BD > Contracts could see the contract header but every detail
-- tab was hidden. Grant the read-only tab views BD needs to consume a contract.
-- Edit/admin grants stay with Pricing/Executive.
--
-- Idempotent: jsonb concat preserves existing grants; only the listed keys are
-- touched.

WITH bd_view_grants AS (
  SELECT jsonb_build_object(
    'pricing_contracts:view',                              true,
    'pricing_contracts_all_tab:view',                      true,
    'pricing_contracts_active_tab:view',                   true,
    'pricing_contracts_expiring_tab:view',                 true,
    'pricing_contracts_financial_overview_tab:view',       true,
    'pricing_contracts_quotation_tab:view',                true,
    'pricing_contracts_rate_card_tab:view',                true,
    'pricing_contracts_bookings_tab:view',                 true,
    'pricing_contracts_attachments_tab:view',              true,
    'pricing_contracts_comments_tab:view',                 true,
    'pricing_contracts_activity_tab:view',                 true
  ) AS grants
)
UPDATE access_profiles ap
SET module_grants = COALESCE(ap.module_grants, '{}'::jsonb) || g.grants,
    updated_at = now()
FROM bd_view_grants g
WHERE ap.target_department = 'Business Development'
  AND ap.is_active = true;
