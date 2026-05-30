-- ============================================================================
-- Migration 124 — Prevent duplicate MBL/MAWB across bookings (NEU-001)
-- ============================================================================
-- A carrier-issued Master Bill of Lading / Master Air Waybill number is globally
-- unique to one shipment, so no two bookings may share one. Enforced as a hard
-- block via a partial, normalized unique index:
--   * Partial WHERE → blank/draft MBLs are exempt and never collide.
--   * lower(btrim(...)) → case- and whitespace-insensitive uniqueness.
-- Only Forwarding bookings ever populate details->>'mbl_mawb', so no service_type
-- filter is needed. Violations surface as a 23505 error referencing the index
-- name, which the app translates into a friendly message.

CREATE UNIQUE INDEX IF NOT EXISTS bookings_unique_mbl_mawb
ON bookings (lower(btrim(details->>'mbl_mawb')))
WHERE btrim(coalesce(details->>'mbl_mawb', '')) <> '';
