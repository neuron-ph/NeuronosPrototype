-- Migration 247: make the catalog→COA invariant REAL at the database level.
--
-- NEU-091 (mig 241) added the link and made it UI-required on *create* — but every
-- pre-existing row was left NULL and the edit path dropped it on save, so the rule
-- "every catalog item resolves to an equivalent COA" was never actually true
-- (0 of 335 items, 0 of 31 categories had an account). The AP two-step for expense
-- vouchers (Dr Expense per particular / Cr Accounts Payable) has nothing to debit
-- without it, so this has to be enforced, not just documented.
--
-- This migration backfills every row to a sensible default account, then adds
-- NOT NULL so the link can never regress. The account stays an EDITABLE AUTOFILL
-- seed — the Transaction Journal overrides it per line at finalize time; the DB
-- just guarantees a non-null starting point.
--
-- Portable + idempotent: overrides match on stable account CODE + category name/side
-- (not environment-specific ids), every backfill UPDATE is guarded on IS NULL
-- (re-run safe, never clobbers a manual re-mapping), and the DDL uses DROP ... IF
-- EXISTS before re-adding.

-- ── 1. Backfill ──────────────────────────────────────────────────────────────
-- Specific overrides first (guarded IS NULL so they win over the defaults below),
-- then the side catch-alls fill the remainder.

-- expense overrides
UPDATE catalog_categories c SET parent_account_id = a.id FROM accounts a
  WHERE a.code = '5020' AND c.parent_account_id IS NULL AND c.side = 'expense' AND c.name ILIKE '%TRUCKING%';
UPDATE catalog_categories c SET parent_account_id = a.id FROM accounts a
  WHERE a.code = '6660' AND c.parent_account_id IS NULL AND c.side = 'expense' AND (c.name ILIKE '%MISCELLANEOUS%' OR c.name = 'CC');

-- revenue overrides
UPDATE catalog_categories c SET parent_account_id = a.id FROM accounts a
  WHERE a.code = '4010' AND c.parent_account_id IS NULL AND c.side = 'revenue' AND c.name ILIKE '%BROKERAGE%';
UPDATE catalog_categories c SET parent_account_id = a.id FROM accounts a
  WHERE a.code = '4030' AND c.parent_account_id IS NULL AND c.side = 'revenue' AND c.name ILIKE '%MARINE INSURANCE%';
UPDATE catalog_categories c SET parent_account_id = a.id FROM accounts a
  WHERE a.code = '4000' AND c.parent_account_id IS NULL AND c.side = 'revenue' AND (c.name ILIKE '%SEA FREIGHT%' OR c.name ILIKE '%AIR FREIGHT%');
UPDATE catalog_categories c SET parent_account_id = a.id FROM accounts a
  WHERE a.code = '4020' AND c.parent_account_id IS NULL AND c.side = 'revenue' AND c.name ILIKE '%DELIVERY CHARGES%';

-- side defaults (catch-all)
UPDATE catalog_categories c SET parent_account_id = a.id FROM accounts a
  WHERE a.code = '5080' AND c.parent_account_id IS NULL AND c.side = 'expense';
UPDATE catalog_categories c SET parent_account_id = a.id FROM accounts a
  WHERE a.code = '4040' AND c.parent_account_id IS NULL AND c.side = 'revenue';
-- any category with a blank/unknown side → miscellaneous expense (safety net)
UPDATE catalog_categories c SET parent_account_id = a.id FROM accounts a
  WHERE a.code = '6660' AND c.parent_account_id IS NULL;

-- items inherit their category's parent account
UPDATE catalog_items i SET account_id = c.parent_account_id
  FROM catalog_categories c WHERE i.category_id = c.id AND i.account_id IS NULL;
-- orphan items (no category) → miscellaneous expense catch-all
UPDATE catalog_items i SET account_id = a.id FROM accounts a
  WHERE a.code = '6660' AND i.account_id IS NULL;

-- ── 2. Guard ─────────────────────────────────────────────────────────────────
-- Abort loudly if anything is still NULL, rather than half-enforcing.
DO $$
DECLARE n_cat INT; n_item INT;
BEGIN
  SELECT count(*) INTO n_cat FROM catalog_categories WHERE parent_account_id IS NULL;
  SELECT count(*) INTO n_item FROM catalog_items WHERE account_id IS NULL;
  IF n_cat > 0 OR n_item > 0 THEN
    RAISE EXCEPTION 'catalog COA backfill incomplete: % categories, % items still NULL — aborting NOT NULL lock', n_cat, n_item;
  END IF;
END $$;

-- ── 3. Lock ──────────────────────────────────────────────────────────────────
-- Tighten the FK to RESTRICT (241 used ON DELETE SET NULL, incompatible with NOT
-- NULL) and enforce NOT NULL so the link can never fall back to NULL again.
ALTER TABLE catalog_categories DROP CONSTRAINT IF EXISTS catalog_categories_parent_account_id_fkey;
ALTER TABLE catalog_categories
  ADD CONSTRAINT catalog_categories_parent_account_id_fkey
  FOREIGN KEY (parent_account_id) REFERENCES accounts(id) ON DELETE RESTRICT;
ALTER TABLE catalog_categories ALTER COLUMN parent_account_id SET NOT NULL;

ALTER TABLE catalog_items DROP CONSTRAINT IF EXISTS catalog_items_account_id_fkey;
ALTER TABLE catalog_items
  ADD CONSTRAINT catalog_items_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT;
ALTER TABLE catalog_items ALTER COLUMN account_id SET NOT NULL;
