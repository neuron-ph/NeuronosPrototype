-- 123_profile_countries_optional_iso.sql
-- Vendor/profile countries are name-keyed. ISO codes are no longer required —
-- the Profiling → Countries admin now adds countries by name only.
-- The existing UNIQUE index on iso_code tolerates multiple NULLs, and
-- countryAdapter labels by name (iso_code is only an optional search hint),
-- so dropping NOT NULL is safe for the booking lookups that share this table.

ALTER TABLE public.profile_countries ALTER COLUMN iso_code DROP NOT NULL;
