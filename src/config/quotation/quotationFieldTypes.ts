// Re-export shared primitive types from booking so consumers don't need to import from two places.
export type {
  ControlType,
  StorageTarget,
  RequiredRule,
  ServiceType,
  DynamicLabel,
  RepeaterColumn,
} from '../booking/bookingFieldTypes';

// ---------------------------------------------------------------------------
// Quotation-specific visibility context
// ---------------------------------------------------------------------------

// The context values that drive quotation field visibility and requiredness.
export type QuotationFormContext = {
  service_type: string;   // Brokerage | Forwarding | Trucking | Marine Insurance | Others
  brokerage_type: string; // Standard | All-Inclusive | Non-Regular  (Brokerage only)
  incoterms: string;      // EXW | FOB | CFR | CIF | FCA | CPT | CIP | DAP | DDU | DDP  (Forwarding only)
  mode: string;           // FCL | LCL | Air Freight  (Brokerage + Forwarding)
};

// A single visibility predicate. Multiple conditions in showWhen are AND'd together.
// Use op:'in' to express OR over values of the same field.
export type QuotationVisibilityCondition = {
  field: keyof QuotationFormContext;
  op: 'eq' | 'in' | 'neq' | 'nin';
  value: string | string[];
};

// ---------------------------------------------------------------------------
// Field and section definitions
// ---------------------------------------------------------------------------

export type QuotationFieldDef = {
  key: string;
  label: string;
  control: import('../booking/bookingFieldTypes').ControlType;
  required: import('../booking/bookingFieldTypes').RequiredRule;
  // Conditions that make this field required (only meaningful when required = 'conditional')
  requiredWhen?: QuotationVisibilityCondition[];
  storage: import('../booking/bookingFieldTypes').StorageTarget;
  // Top-level column name when it differs from key
  storageKey?: string;
  options?: string[];
  unit?: string;
  // ALL must be true; absent = always visible
  showWhen?: QuotationVisibilityCondition[];
  // Legacy camelCase or abbreviated keys used by old saved quotation service_details.
  // The normalizer uses this to write canonical aliases when reading old records.
  legacyKeys?: string[];
  repeaterColumns?: import('../booking/bookingFieldTypes').RepeaterColumn[];
};

export type QuotationSectionDef = {
  key: string;
  title: string;
  fields: QuotationFieldDef[];
  // ALL must be true; absent = section always visible
  showWhen?: QuotationVisibilityCondition[];
};

export type QuotationServiceSchema = {
  serviceType: import('../booking/bookingFieldTypes').ServiceType;
  // General fields are included first so renderers can display them before service-specific sections.
  sections: QuotationSectionDef[];
};
