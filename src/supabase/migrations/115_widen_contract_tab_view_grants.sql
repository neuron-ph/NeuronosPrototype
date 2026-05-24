-- Migration 114 added contract tab view grants only to profiles with
-- target_department = 'Business Development'. That missed custom profiles
-- with target_department = NULL (e.g. "BDO") which are applied to BD users in
-- practice. Tab visibility should be role/context-driven, not keyed off the
-- profile's optional target_department label.
--
-- Contract tab grants are read-only; the record-level visibility (created_by
-- OR customer.owner_id in the viewer's scope — see ContractsModule scope
-- filter) already restricts *which* contracts each user can see. Granting tab
-- view to every active profile just unlocks the detail UI for any contract
-- the user is already entitled to see.
--
-- Idempotent: jsonb concat preserves existing grants; only the listed keys
-- are added if missing.

WITH widened_grants AS (
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
FROM widened_grants g
WHERE ap.is_active = true;
