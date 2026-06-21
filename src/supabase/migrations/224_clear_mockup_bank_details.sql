-- 224: Stop auto-filling Neuron's MOCKUP bank details.
-- Migrations 028 and 104 seeded the company_settings 'default' row with
-- placeholder bank info (BDO Unibank / Neuron Logistics Inc. / 0012-3456-7890).
-- That row is the source the PDF screens auto-fill from, so every quote showed
-- Neuron's fake bank. Clear those three fields so the bank card starts blank and
-- only fills from a company's own configured bank details.
--
-- Guard: only clear the KNOWN mockup signature, so a real bank that a company
-- has already entered is never wiped. Runs after 104, so a fresh DB (which
-- re-seeds the mockup via 104's INSERT) ends up blank too.

UPDATE company_settings
SET bank_name = NULL,
    bank_account_name = NULL,
    bank_account_number = NULL,
    updated_at = NOW()
WHERE id = 'default'
  AND bank_name = 'BDO Unibank'
  AND bank_account_number = '0012-3456-7890';

-- Also strip the mockup that was already baked into individual quotes: any quote
-- Saved through the PDF screen while the card was pre-filled froze the mockup
-- into details.bank_details_override. Remove only the mockup-signature ones so a
-- quote with a real per-document bank override is left untouched.
UPDATE quotations
SET details = details - 'bank_details_override'
WHERE details->'bank_details_override'->>'bank_name' = 'BDO Unibank'
  AND details->'bank_details_override'->>'account_number' = '0012-3456-7890';
