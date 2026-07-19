-- Migration 241: Catalog → Chart of Accounts linking (NEU-091, Model B)
--
-- Two-level link so every catalog line item resolves to a real GL account, which
-- is the autofill source for the Transaction Journal (NEU-099):
--   catalog_categories.parent_account_id  → the folder/parent account (required
--                                            when creating a new category, UI-enforced)
--   catalog_items.account_id              → the leaf account (a child of the
--                                            category's parent for expense, which has
--                                            a folder→leaf tree; revenue accounts are
--                                            flat, so the item picks a revenue account
--                                            directly).
-- Both nullable at the DB level for back-compat with existing rows; the "required
-- on create" rule lives in the catalog UI. The link is an editable autofill, never
-- a hard binding (the TJ can override the account per line).

ALTER TABLE catalog_categories
  ADD COLUMN IF NOT EXISTS parent_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;

ALTER TABLE catalog_items
  ADD COLUMN IF NOT EXISTS account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_categories_parent_account ON catalog_categories(parent_account_id);
CREATE INDEX IF NOT EXISTS idx_catalog_items_account ON catalog_items(account_id);
