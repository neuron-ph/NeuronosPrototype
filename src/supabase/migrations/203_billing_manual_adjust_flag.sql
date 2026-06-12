-- ============================================================================
-- 203: billing_line_items.is_manually_adjusted (NEU-022)
-- ============================================================================
-- WHY: contract amendment (NEU-022) live re-rates every open booking's
-- un-invoiced, contract-sourced billing lines to the new contract rate. Lines a
-- human has hand-overridden must be SKIPPED by that re-rate and must carry a
-- visible "Manually adjusted" badge. Today source_type ('contract_rate' vs
-- 'manual') is the only signal, but editing a contract_rate line's amount does
-- NOT flip it (UnifiedBillingsTab.handleItemChange silently overwrites), so an
-- edited line is indistinguishable from an untouched one. This explicit flag
-- closes that gap.
--
-- Set true (client, UnifiedBillingsTab) when a user overrides amount/unit_price
-- on a source_type='contract_rate' line. The re-rate RPC (migration to follow)
-- filters on  source_type='contract_rate' AND is_manually_adjusted = false.
-- ============================================================================

alter table public.billing_line_items
  add column if not exists is_manually_adjusted boolean not null default false;

comment on column public.billing_line_items.is_manually_adjusted is
  'NEU-022: true when a human overrode this line''s amount/unit_price away from its source rate. Contract amendments skip these on live re-rate, and the UI shows a "Manually adjusted" badge.';
