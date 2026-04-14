-- Migration 044: Evoucher disbursement metadata columns
-- Renames journal_entry_id → closing_journal_entry_id (disambiguation: disbursement JE vs closing JE)
-- and adds all disbursement tracking columns needed by DisbursementSheet.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'evouchers' AND column_name = 'journal_entry_id'
  ) THEN
    ALTER TABLE evouchers RENAME COLUMN journal_entry_id TO closing_journal_entry_id;
  END IF;
END $$;

ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS disbursement_method              TEXT;
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS disbursement_reference           TEXT;
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS disbursement_date                TIMESTAMPTZ;
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS disbursement_source_account_id   TEXT;
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS disbursement_source_account_name TEXT;
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS disbursement_journal_entry_id    TEXT;
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS disbursed_by_user_id             TEXT;
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS disbursed_by_name                TEXT;
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS disbursement_remarks             TEXT;
