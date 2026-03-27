-- ============================================================================
-- Migration 017 — contacts: add first_name and last_name columns
-- ============================================================================
-- The contacts table was created with only a `name` TEXT NOT NULL column.
-- All UI code expects separate first_name / last_name columns for search and
-- display. This migration adds them and backfills from the existing name field.
-- ============================================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_name  TEXT;

-- Backfill: store the full existing name in first_name for legacy rows.
-- New inserts from the app will provide both first_name and last_name.
UPDATE contacts
SET first_name = name
WHERE first_name IS NULL AND name IS NOT NULL;
