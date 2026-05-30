-- ============================================================================
-- Migration 125 — Scope the duplicate MBL/MAWB guard per service_type (NEU-001)
-- ============================================================================
-- Migration 124 enforced GLOBAL uniqueness on the carrier MBL/MAWB number, but a
-- single shipment may legitimately have more than one booking referencing the
-- same MBL across different services (e.g. a Forwarding booking and a Brokerage
-- booking for the same arrival). Global uniqueness wrongly blocked the second.
--
-- Uniqueness is now scoped to (service_type, normalized MBL): a duplicate is
-- still blocked WITHIN the same service, but the same MBL is allowed ACROSS
-- different services. Partial WHERE keeps blank/draft MBLs exempt; lower(btrim())
-- keeps it case/whitespace-insensitive. The index name is preserved because the
-- app matches on it (`duplicateMblMawbMessage`) to surface a friendly error.

DROP INDEX IF EXISTS bookings_unique_mbl_mawb;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_unique_mbl_mawb
ON bookings (service_type, lower(btrim(details->>'mbl_mawb')))
WHERE btrim(coalesce(details->>'mbl_mawb', '')) <> '';
