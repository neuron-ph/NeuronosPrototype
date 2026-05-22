-- 111_org_settings_auto_caps.sql
-- Adds org-wide auto-uppercase toggle for text inputs.
-- Default ON per client request; executives can flip it from Settings.

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS auto_caps_enabled boolean NOT NULL DEFAULT true;
