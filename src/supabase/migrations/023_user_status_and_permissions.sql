-- ─── 023: User status column + module-level permission grants ─────────────────
-- Apply in Supabase SQL Editor

-- 1. Add status column to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'
  CONSTRAINT users_status_check CHECK (status IN ('active', 'inactive', 'suspended'));

-- 2. Sync existing rows from is_active
UPDATE users SET status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END;

-- 3. Add module_grants JSONB to permission_overrides
-- Stores fine-grained module/action overrides:
--   { "bd_contacts:view": true, "acct_billings:delete": false, ... }
-- Key = "<module_id>:<action_id>", value = boolean (true=granted, false=explicitly denied)
ALTER TABLE permission_overrides
  ADD COLUMN IF NOT EXISTS module_grants jsonb DEFAULT '{}';
