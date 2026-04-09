-- ============================================================================
-- 020: Fix customers + contacts SELECT policies
-- ============================================================================
-- Customers and contacts are shared reference data. The can_access_record()
-- filter applied in 019 was correct for personal records (tasks, evouchers)
-- but incorrectly restricts cross-department reads for reference entities.
-- Pricing, Operations, and Accounting all need full read access to customers
-- and contacts owned by Business Development.
-- ============================================================================

-- Drop the restrictive policies set by 019
DROP POLICY IF EXISTS "customers_select" ON customers;
DROP POLICY IF EXISTS "contacts_select" ON contacts;

-- All non-HR authenticated users can read all customers
CREATE POLICY "customers_select" ON customers FOR SELECT TO authenticated
  USING (get_my_department() != 'HR');

-- All non-HR authenticated users can read all contacts
CREATE POLICY "contacts_select" ON contacts FOR SELECT TO authenticated
  USING (get_my_department() != 'HR');
