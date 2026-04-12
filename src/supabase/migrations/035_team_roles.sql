-- 035_team_roles.sql
-- Add team_role as a universal label/hierarchy column across all departments.
-- This is NOT RBAC — it's a display label only (Team Leader > Supervisor > Representative).
-- Separate from the `role` column which controls permissions.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS team_role TEXT
    CHECK (team_role IN ('Team Leader', 'Supervisor', 'Representative'));

-- Drop the old operations-only column (superseded by team_role)
ALTER TABLE users DROP COLUMN IF EXISTS operations_role;
