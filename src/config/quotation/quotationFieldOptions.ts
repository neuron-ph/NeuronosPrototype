// Re-export booking option lists that are shared across quotation and booking contexts.
// Quotation forms should use the same option values so carry-over into booking is lossless.
export {
  BROKERAGE_TYPE_OPTIONS,
  CARGO_NATURE_OPTIONS,
  CARGO_TYPE_OPTIONS,
  CUSTOMS_ENTRY_OPTIONS,
  CUSTOMS_ENTRY_PROCEDURE_OPTIONS,
  INCOTERMS_OPTIONS,
  MODE_OPTIONS,
  MOVEMENT_OPTIONS,
  TRUCK_TYPE_OPTIONS,
  BOOLEAN_OPTIONS,
} from '../booking/bookingFieldOptions';

// ---------------------------------------------------------------------------
// Quotation-specific option lists
// ---------------------------------------------------------------------------

export const CREDIT_TERMS_OPTIONS = [
  'Cash',
  '15 Days',
  '30 Days',
  '45 Days',
  '60 Days',
  '90 Days',
];

// Container type labels used in Brokerage and Forwarding FCL quotation overlays.
export const CONTAINER_TYPE_OPTIONS = ['20ft', '40ft', '45ft'];

// Forwarding incoterms grouped by whether the seller or buyer arranges main carriage.
// Same values as INCOTERMS_OPTIONS; provided as a grouped reference for UI labelling.
export const INCOTERMS_GROUPED: Record<string, string[]> = {
  'EXW / Origin': ['EXW'],
  'Seller arranges to port': ['FCA', 'FOB'],
  'Seller arranges carriage': ['CFR', 'CIF', 'CPT', 'CIP'],
  'Buyer destination': ['DAP', 'DDU', 'DDP'],
};
