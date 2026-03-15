-- ============================================================================
-- 004: Role & Department Constraints — Enforce Canonical Taxonomy
-- ============================================================================
-- Phase 5 of the User Roles Fix Blueprint.
-- Adds CHECK constraints to the users table so that department, role,
-- service_type, and operations_role can only hold canonical values.
-- Also drops the dead `permissions` column and fixes the RLS policies
-- from 003 that still reference non-canonical role strings.
--
-- PREREQUISITES:
--   - Migrations 001, 002, 003 have been applied.
--   - Phase 1 (frontend taxonomy fix) is complete, so all new writes
--     already use canonical values.
--   - You have run the validation query (Step 0) and fixed any bad rows.
--
-- HOW TO USE:
--   1. Run Step 0 in the Supabase SQL Editor to check for bad data.
--   2. If Step 0 returns rows, fix them with Step 0b UPDATE statements.
--   3. Run Steps 1-4 in sequence.
--   4. (Optional, after Phase 3 server-side is confirmed) Run Step 5.
-- ============================================================================


-- ============================================================================
-- STEP 0: Validate existing data (run this FIRST, review output)
-- ============================================================================
-- Copy-paste this SELECT into the SQL Editor and check the results.
-- If it returns 0 rows, you're safe to proceed.
-- If it returns rows, fix them with Step 0b before applying constraints.

-- SELECT id, email, name, department, role, service_type, operations_role
-- FROM users
-- WHERE department NOT IN ('Business Development','Pricing','Operations','Accounting','Executive','HR')
--    OR role NOT IN ('rep','manager','director')
--    OR (service_type IS NOT NULL AND service_type NOT IN ('Forwarding','Brokerage','Trucking','Marine Insurance','Others'))
--    OR (operations_role IS NOT NULL AND operations_role NOT IN ('Manager','Supervisor','Handler'));


-- ============================================================================
-- STEP 0b: Fix any bad data found by Step 0 (uncomment & adjust as needed)
-- ============================================================================
-- Map legacy department values to canonical ones:

UPDATE users SET department = 'Business Development' WHERE department IN ('BD', 'Sales', 'Business Dev');
UPDATE users SET department = 'Pricing'              WHERE department IN ('PD', 'Pricing Department');
UPDATE users SET department = 'Accounting'           WHERE department IN ('Finance', 'Treasury');
UPDATE users SET department = 'Executive'            WHERE department IN ('Admin', 'Management', 'IT');
UPDATE users SET department = 'Operations'           WHERE department IN ('Ops', 'Logistics');

-- Map legacy role values to canonical ones:
UPDATE users SET role = 'director' WHERE role IN ('Admin', 'admin', 'President', 'Director', 'Executive');
UPDATE users SET role = 'manager'  WHERE role IN ('Manager', 'Supervisor', 'Lead', 'Finance Manager');
UPDATE users SET role = 'rep'      WHERE role IN ('Employee', 'Staff', 'Rep', 'Accountant', 'Agent', 'Handler', 'Officer');

-- Null out operations fields for non-Operations users:
UPDATE users SET service_type = NULL, operations_role = NULL
WHERE department != 'Operations' AND (service_type IS NOT NULL OR operations_role IS NOT NULL);

-- Set defaults for any remaining NULLs (adjust department/role as appropriate):
UPDATE users SET department = 'Business Development' WHERE department IS NULL;
UPDATE users SET role = 'rep' WHERE role IS NULL;


-- ============================================================================
-- STEP 1: Add CHECK constraints
-- ============================================================================
-- Using CHECK constraints (not ENUMs) so future values can be added with
-- a simple ALTER TABLE ... DROP/ADD CONSTRAINT, no type migration needed.

ALTER TABLE users ADD CONSTRAINT users_department_check
  CHECK (department IN (
    'Business Development',
    'Pricing',
    'Operations',
    'Accounting',
    'Executive',
    'HR'
  ));

ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'rep',
    'manager',
    'director'
  ));

ALTER TABLE users ADD CONSTRAINT users_service_type_check
  CHECK (
    service_type IS NULL
    OR service_type IN (
      'Forwarding',
      'Brokerage',
      'Trucking',
      'Marine Insurance',
      'Others'
    )
  );

ALTER TABLE users ADD CONSTRAINT users_operations_role_check
  CHECK (
    operations_role IS NULL
    OR operations_role IN (
      'Manager',
      'Supervisor',
      'Handler'
    )
  );

-- Operations users should have both fields set; non-Operations should have neither.
-- This is a soft convention, not enforced here, because onboarding flows may
-- set department before service_type. Uncomment if you want strict enforcement:
--
-- ALTER TABLE users ADD CONSTRAINT users_ops_fields_consistency
--   CHECK (
--     (department = 'Operations' AND service_type IS NOT NULL AND operations_role IS NOT NULL)
--     OR (department != 'Operations' AND service_type IS NULL AND operations_role IS NULL)
--   );


-- ============================================================================
-- STEP 2: Drop the dead `permissions` column
-- ============================================================================
-- The permissions TEXT[] column (added in 001) is always '{}' — never read or
-- written by any frontend or server code. The real permission system uses
-- department + role checks in permissions.ts and RouteGuard.tsx.

ALTER TABLE users DROP COLUMN IF EXISTS permissions;


-- ============================================================================
-- STEP 3: Update column comments (documentation for Supabase dashboard)
-- ============================================================================

COMMENT ON COLUMN users.department IS 'Canonical: Business Development | Pricing | Operations | Accounting | Executive | HR';
COMMENT ON COLUMN users.role IS 'Canonical: rep | manager | director';
COMMENT ON COLUMN users.service_type IS 'Operations only: Forwarding | Brokerage | Trucking | Marine Insurance | Others';
COMMENT ON COLUMN users.operations_role IS 'Operations only: Manager | Supervisor | Handler';


-- ============================================================================
-- STEP 4: Fix RLS policies — replace legacy role strings with canonical values
-- ============================================================================
-- Migration 003 created policies that check for 'Admin', 'admin', 'Manager'
-- in get_my_role(). Now that we have CHECK constraints, those values can
-- never appear. Replace with canonical 'manager' and 'director'.

-- Drop the old policies
DROP POLICY IF EXISTS "Admins can update any user" ON users;
DROP POLICY IF EXISTS "Admins can insert users" ON users;
DROP POLICY IF EXISTS "Admins can delete users" ON users;

-- Recreate with canonical role values only
CREATE POLICY "Managers and directors can update any user"
  ON users FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('manager', 'director'))
  WITH CHECK (public.get_my_role() IN ('manager', 'director'));

CREATE POLICY "Managers and directors can insert users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('manager', 'director'));

CREATE POLICY "Directors can delete users"
  ON users FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'director');


-- ============================================================================
-- STEP 5: Drop password column (DO NOT RUN YET)
-- ============================================================================
-- Only run this AFTER all of the following are confirmed:
--   [ ] Phase 3 server-side JWT middleware is deployed
--   [ ] POST /auth/login endpoint is removed from the server
--   [ ] All users have auth_id linked (SELECT count(*) FROM users WHERE auth_id IS NULL returns 0)
--   [ ] E2E login tested end-to-end with Supabase Auth
--
-- ALTER TABLE users DROP COLUMN IF EXISTS password;


-- ============================================================================
-- MIGRATION COMPLETE — 004_role_constraints
-- ============================================================================
-- What this migration did:
--   1. Fixed any legacy department/role values to canonical names
--   2. Added CHECK constraints on department, role, service_type, operations_role
--   3. Dropped unused permissions TEXT[] column
--   4. Fixed RLS policies to use canonical role values
--
-- What's deferred:
--   - password column drop (Step 5) — waiting on Phase 3 server confirmation
--   - Operations field consistency constraint — optional strict enforcement
--
-- Next steps:
--   a. Verify constraints: INSERT a test user with role='Employee' — should fail
--   b. Proceed with Phase 3 frontend (apiFetch wrapper, isAuthenticated fix)
--   c. After Phase 3 server is live, come back and run Step 5
-- ============================================================================
