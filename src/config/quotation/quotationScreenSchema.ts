import type {
  QuotationFieldDef,
  QuotationSectionDef,
  QuotationServiceSchema,
} from './quotationFieldTypes';
import type { ServiceType } from '../booking/bookingFieldTypes';

// ---------------------------------------------------------------------------
// Incoterm groups used for Forwarding visibility rules
// ---------------------------------------------------------------------------

// Incoterms where the seller arranges collection from origin — show Collection Address
const INCOTERMS_WITH_COLLECTION_ADDRESS = ['EXW'];

// Incoterms where the buyer arranges destination delivery — show Delivery Address
const INCOTERMS_WITH_DELIVERY_ADDRESS = ['DAP', 'DDU', 'DDP'];

// Incoterms where the seller nominates carrier/routing — show Transit Time, Carrier/Airline, Routing
const INCOTERMS_WITH_CARRIER_ROUTING = ['EXW', 'FOB', 'FCA'];

// Incoterms where stackable preference is relevant
const INCOTERMS_WITH_STACKABLE = ['EXW', 'FOB', 'FCA', 'DAP', 'DDU', 'DDP'];

// ---------------------------------------------------------------------------
// Shared Quotation General Information
// These fields appear at the top of every quotation regardless of service type.
// ---------------------------------------------------------------------------

export const QUOTATION_GENERAL_SECTION: QuotationSectionDef = {
  key: 'general_information',
  title: 'General Information',
  fields: [
    {
      key: 'customer',
      label: 'Customer',
      control: 'profile-lookup',
      required: 'yes',
      storage: 'top-level',
      storageKey: 'customer_name',
      legacyKeys: ['customerName', 'customer_name'],
    },
    {
      key: 'contact_person',
      label: 'Contact Person',
      control: 'profile-lookup',
      required: 'yes',
      storage: 'top-level',
      storageKey: 'contact_person_name',
      legacyKeys: ['contactPerson', 'contact_person_name'],
    },
    {
      key: 'quotation_name',
      label: 'Quotation Name',
      control: 'free-text',
      required: 'yes',
      storage: 'top-level',
      legacyKeys: ['quotationName'],
    },
    {
      key: 'services',
      label: 'Services',
      control: 'multi-select',
      required: 'yes',
      storage: 'top-level',
      options: ['Brokerage', 'Forwarding', 'Trucking', 'Marine Insurance', 'Others'],
      legacyKeys: ['selectedServices'],
    },
    {
      key: 'date',
      label: 'Date',
      control: 'date',
      required: 'yes',
      storage: 'top-level',
    },
    {
      key: 'credit_terms',
      label: 'Credit Terms',
      control: 'dropdown',
      required: 'no',
      storage: 'top-level',
      optionsKind: 'credit_terms',
      legacyKeys: ['creditTerms'],
    },
    {
      key: 'validity',
      label: 'Validity',
      control: 'date',
      required: 'no',
      storage: 'top-level',
      storageKey: 'validity_date',
      legacyKeys: ['validityDate', 'validity_date', 'contractValidityEnd'],
    },
  ],
};

// ---------------------------------------------------------------------------
// Brokerage Quotation Schema
// Matrix: Standard / All-Inclusive / Non-Regular packages × mode overlays
// Source: FINAL_QUOTATION_BOOKING_INPUT_SCHEMA.md — Brokerage Service/s table
// ---------------------------------------------------------------------------

const BROKERAGE_PACKAGE_SECTION: QuotationSectionDef = {
  key: 'brokerage_package',
  title: 'Brokerage Package',
  fields: [
    {
      key: 'brokerage_type',
      label: 'Brokerage Package',
      control: 'segmented',
      required: 'yes',
      storage: 'details',
      optionsKind: 'brokerage_type',
      legacyKeys: ['brokerageType', 'subtype'],
    },
  ],
};

const BROKERAGE_SHIPMENT_SECTION: QuotationSectionDef = {
  key: 'brokerage_shipment',
  title: 'Shipment Details',
  fields: [
    {
      // Standard: Yes, All-Inclusive: No, Non-Regular: Yes — hide for All-Inclusive
      key: 'type_of_entry',
      label: 'Type of Entry',
      control: 'dropdown',
      required: 'no',
      storage: 'details',
      optionsKind: 'customs_entry_procedure',
      showWhen: [{ field: 'brokerage_type', op: 'in', value: ['Standard', 'Non-Regular'] }],
      legacyKeys: ['typeOfEntry', 'type_of_entry', 'consumption', 'warehousing', 'peza'],
    },
    {
      key: 'pod_aod',
      label: 'AOD/POD',
      control: 'profile-lookup',
      profileType: 'port',
      required: 'no',
      storage: 'details',
      legacyKeys: ['pod', 'aodPod', 'aod_pod'],
    },
    {
      key: 'mode',
      label: 'Mode',
      control: 'segmented',
      required: 'no',
      storage: 'details',
      optionsKind: 'mode',
    },
    {
      key: 'cargo_type',
      label: 'Cargo Type',
      control: 'dropdown',
      required: 'no',
      storage: 'details',
      optionsKind: 'cargo_type',
      legacyKeys: ['cargoType'],
    },
    {
      key: 'commodity_description',
      label: 'Commodity Description',
      control: 'free-text',
      required: 'no',
      storage: 'details',
      legacyKeys: ['commodity', 'commodityDescription'],
    },
    {
      key: 'delivery_address',
      label: 'Delivery Address',
      control: 'free-text',
      required: 'no',
      storage: 'details',
      legacyKeys: ['deliveryAddress'],
    },
    {
      // All-Inclusive: Yes — hidden for Standard and Non-Regular
      key: 'country_of_origin',
      label: 'Country of Origin',
      control: 'profile-lookup',
      profileType: 'country',
      required: 'no',
      storage: 'details',
      showWhen: [{ field: 'brokerage_type', op: 'eq', value: 'All-Inclusive' }],
      legacyKeys: ['countryOfOrigin'],
    },
    {
      // All-Inclusive: Yes — hidden for Standard and Non-Regular
      key: 'preferential_treatment',
      label: 'Preferential Treatment',
      control: 'dropdown',
      required: 'no',
      storage: 'details',
      optionsKind: 'preferential_treatment',
      showWhen: [{ field: 'brokerage_type', op: 'eq', value: 'All-Inclusive' }],
      legacyKeys: ['preferentialTreatment'],
    },
  ],
};

// FCL: Container Types and Quantity
const BROKERAGE_FCL_OVERLAY: QuotationSectionDef = {
  key: 'brokerage_fcl_overlay',
  title: 'FCL Details',
  showWhen: [{ field: 'mode', op: 'eq', value: 'FCL' }],
  fields: [
    {
      key: 'containers',
      label: 'Containers',
      control: 'repeater',
      required: 'no',
      storage: 'details',
      repeaterColumns: [
        { key: 'type', label: 'Container Type', control: 'dropdown', optionsKind: 'container_type' },
        { key: 'qty', label: 'Quantity', control: 'number' },
      ],
      legacyKeys: ['containers', 'fcl_20ft', 'fcl_40ft', 'fcl_45ft'],
    },
  ],
};

// LCL: Gross Weight and Measurement
const BROKERAGE_LCL_OVERLAY: QuotationSectionDef = {
  key: 'brokerage_lcl_overlay',
  title: 'LCL Details',
  showWhen: [{ field: 'mode', op: 'eq', value: 'LCL' }],
  fields: [
    {
      key: 'gross_weight',
      label: 'Gross Weight',
      control: 'number',
      required: 'no',
      storage: 'details',
      unit: 'kg',
      legacyKeys: ['grossWeight', 'lcl_gwt', 'lclGwt'],
    },
    {
      key: 'measurement',
      label: 'Measurement',
      control: 'number',
      required: 'no',
      storage: 'details',
      unit: 'CBM',
      legacyKeys: ['dimensions', 'lcl_dims', 'lclDims'],
    },
  ],
};

// Air: Gross Weight and Chargeable Weight
const BROKERAGE_AIR_OVERLAY: QuotationSectionDef = {
  key: 'brokerage_air_overlay',
  title: 'Air Details',
  showWhen: [{ field: 'mode', op: 'eq', value: 'Air Freight' }],
  fields: [
    {
      key: 'gross_weight',
      label: 'Gross Weight',
      control: 'number',
      required: 'no',
      storage: 'details',
      unit: 'kg',
      legacyKeys: ['grossWeight', 'airGwt', 'air_gwt'],
    },
    {
      key: 'chargeable_weight',
      label: 'Chargeable Weight',
      control: 'number',
      required: 'no',
      storage: 'details',
      unit: 'kg',
      legacyKeys: ['chargeableWeight', 'airCwt', 'air_cwt'],
    },
  ],
};

export const BROKERAGE_QUOTATION_SCHEMA: QuotationServiceSchema = {
  serviceType: 'Brokerage',
  sections: [
    QUOTATION_GENERAL_SECTION,
    BROKERAGE_PACKAGE_SECTION,
    BROKERAGE_SHIPMENT_SECTION,
    BROKERAGE_FCL_OVERLAY,
    BROKERAGE_LCL_OVERLAY,
    BROKERAGE_AIR_OVERLAY,
  ],
};

// ---------------------------------------------------------------------------
// Forwarding Quotation Schema
// Matrix: 10 incoterms × field visibility rules
// Source: FINAL_QUOTATION_BOOKING_INPUT_SCHEMA.md — Forwarding Service/s table
// ---------------------------------------------------------------------------

const FORWARDING_CORE_SECTION: QuotationSectionDef = {
  key: 'forwarding_core',
  title: 'Shipment Details',
  fields: [
    {
      key: 'incoterms',
      label: 'Incoterms',
      control: 'dropdown',
      required: 'no',
      storage: 'details',
      optionsKind: 'incoterms',
    },
    {
      key: 'cargo_type',
      label: 'Cargo Type',
      control: 'dropdown',
      required: 'no',
      storage: 'details',
      optionsKind: 'cargo_type',
      legacyKeys: ['cargoType'],
    },
    {
      key: 'cargo_nature',
      label: 'Cargo Nature',
      control: 'dropdown',
      required: 'no',
      storage: 'details',
      optionsKind: 'cargo_nature',
      legacyKeys: ['cargoNature'],
    },
    {
      key: 'commodity_description',
      label: 'Commodity Description',
      control: 'free-text',
      required: 'no',
      storage: 'details',
      legacyKeys: ['commodity', 'commodityDescription'],
    },
    {
      key: 'pol_aol',
      label: 'AOL/POL',
      control: 'profile-lookup',
      profileType: 'port',
      required: 'no',
      storage: 'details',
      legacyKeys: ['aolPol', 'aol_pol', 'pol'],
    },
    {
      key: 'pod_aod',
      label: 'AOD/POD',
      control: 'profile-lookup',
      profileType: 'port',
      required: 'no',
      storage: 'details',
      legacyKeys: ['aodPod', 'aod_pod', 'pod'],
    },
    {
      key: 'mode',
      label: 'Mode',
      control: 'segmented',
      required: 'no',
      storage: 'details',
      optionsKind: 'mode',
    },
    {
      // EXW only — Collection Address (origin pickup)
      key: 'collection_address',
      label: 'Collection Address',
      control: 'free-text',
      required: 'no',
      storage: 'details',
      showWhen: [{ field: 'incoterms', op: 'in', value: INCOTERMS_WITH_COLLECTION_ADDRESS }],
      legacyKeys: ['collectionAddress'],
    },
    {
      // DAP / DDU / DDP
      key: 'delivery_address',
      label: 'Delivery Address',
      control: 'free-text',
      required: 'no',
      storage: 'details',
      showWhen: [{ field: 'incoterms', op: 'in', value: INCOTERMS_WITH_DELIVERY_ADDRESS }],
      legacyKeys: ['deliveryAddress'],
    },
    {
      // EXW / FOB / FCA: Yes
      key: 'transit_time',
      label: 'Transit Time',
      control: 'free-text',
      required: 'no',
      storage: 'details',
      showWhen: [{ field: 'incoterms', op: 'in', value: INCOTERMS_WITH_CARRIER_ROUTING }],
      legacyKeys: ['transitTime'],
    },
    {
      // EXW / FOB / FCA: Yes
      key: 'carrier_airline',
      label: 'Carrier/Airline',
      control: 'profile-lookup',
      profileType: 'carrier',
      required: 'no',
      storage: 'details',
      showWhen: [{ field: 'incoterms', op: 'in', value: INCOTERMS_WITH_CARRIER_ROUTING }],
      legacyKeys: ['carrierAirline', 'carrier_airline'],
    },
    {
      // EXW / FOB / FCA: Yes
      key: 'routing',
      label: 'Routing',
      control: 'free-text',
      required: 'no',
      storage: 'details',
      showWhen: [{ field: 'incoterms', op: 'in', value: INCOTERMS_WITH_CARRIER_ROUTING }],
      legacyKeys: ['route'],
    },
    {
      // EXW / FOB / FCA / DAP / DDU / DDP: Yes
      key: 'stackable',
      label: 'Stackable',
      control: 'boolean-dropdown',
      required: 'no',
      storage: 'details',
      showWhen: [{ field: 'incoterms', op: 'in', value: INCOTERMS_WITH_STACKABLE }],
      legacyKeys: ['stackability'],
    },
  ],
};

// FCL mode overlay — Container Types and Quantity (shared pattern with Brokerage)
const FORWARDING_FCL_OVERLAY: QuotationSectionDef = {
  key: 'forwarding_fcl_overlay',
  title: 'FCL Details',
  showWhen: [{ field: 'mode', op: 'eq', value: 'FCL' }],
  fields: [
    {
      key: 'containers',
      label: 'Containers',
      control: 'repeater',
      required: 'no',
      storage: 'details',
      repeaterColumns: [
        { key: 'type', label: 'Container Type', control: 'dropdown', optionsKind: 'container_type' },
        { key: 'qty', label: 'Quantity', control: 'number' },
      ],
      legacyKeys: ['containers', 'fcl_20ft', 'fcl_40ft', 'fcl_45ft'],
    },
  ],
};

// LCL mode overlay — Gross Weight and Measurement
const FORWARDING_LCL_OVERLAY: QuotationSectionDef = {
  key: 'forwarding_lcl_overlay',
  title: 'LCL Details',
  showWhen: [{ field: 'mode', op: 'eq', value: 'LCL' }],
  fields: [
    {
      key: 'gross_weight',
      label: 'Gross Weight',
      control: 'number',
      required: 'no',
      storage: 'details',
      unit: 'kg',
      legacyKeys: ['grossWeight', 'lcl_gwt', 'lclGwt'],
    },
    {
      key: 'measurement',
      label: 'Measurement',
      control: 'number',
      required: 'no',
      storage: 'details',
      unit: 'CBM',
      legacyKeys: ['dimensions', 'lcl_dims', 'lclDims'],
    },
  ],
};

// Air mode overlay — Gross Weight and Chargeable Weight
const FORWARDING_AIR_OVERLAY: QuotationSectionDef = {
  key: 'forwarding_air_overlay',
  title: 'Air Freight Details',
  showWhen: [{ field: 'mode', op: 'eq', value: 'Air Freight' }],
  fields: [
    {
      key: 'gross_weight',
      label: 'Gross Weight',
      control: 'number',
      required: 'no',
      storage: 'details',
      unit: 'kg',
      legacyKeys: ['grossWeight', 'airGwt', 'air_gwt'],
    },
    {
      key: 'chargeable_weight',
      label: 'Chargeable Weight',
      control: 'number',
      required: 'no',
      storage: 'details',
      unit: 'kg',
      legacyKeys: ['chargeableWeight', 'airCwt', 'air_cwt'],
    },
  ],
};

export const FORWARDING_QUOTATION_SCHEMA: QuotationServiceSchema = {
  serviceType: 'Forwarding',
  sections: [
    QUOTATION_GENERAL_SECTION,
    FORWARDING_CORE_SECTION,
    FORWARDING_FCL_OVERLAY,
    FORWARDING_LCL_OVERLAY,
    FORWARDING_AIR_OVERLAY,
  ],
};

// ---------------------------------------------------------------------------
// Trucking Quotation Schema
// Matrix: Pickup Location, Destination/s, Delivery Instructions, Truck Type, Qty
// The current multi-destination repeater is a richer UI of the matrix's Destination/s;
// it is preserved as long as each row maps to (destination, truckType, qty).
// ---------------------------------------------------------------------------

const TRUCKING_DETAILS_SECTION: QuotationSectionDef = {
  key: 'trucking_details',
  title: 'Service Details',
  fields: [
    {
      key: 'pull_out_location',
      label: 'Pickup Location',
      control: 'free-text',
      required: 'no',
      storage: 'details',
      legacyKeys: ['pullOut', 'pullOutLocation', 'pull_out'],
    },
    {
      // Multi-destination repeater. Each row = destination + truck type + qty.
      // Maps to matrix field "Destination/s".
      key: 'trucking_line_items',
      label: 'Destination/s',
      control: 'repeater',
      required: 'no',
      storage: 'details',
      repeaterColumns: [
        { key: 'destination', label: 'Destination', control: 'free-text' },
        { key: 'truck_type', label: 'Truck Type', control: 'dropdown', optionsKind: 'truck_type' },
        { key: 'quantity', label: 'Qty', control: 'number' },
      ],
      legacyKeys: ['truckingLineItems', 'destinations'],
    },
    {
      key: 'delivery_instructions',
      label: 'Delivery Instructions',
      control: 'textarea',
      required: 'no',
      storage: 'details',
      legacyKeys: ['deliveryInstructions'],
    },
  ],
};

export const TRUCKING_QUOTATION_SCHEMA: QuotationServiceSchema = {
  serviceType: 'Trucking',
  sections: [
    QUOTATION_GENERAL_SECTION,
    TRUCKING_DETAILS_SECTION,
  ],
};

// ---------------------------------------------------------------------------
// Marine Insurance Quotation Schema
// Matrix: Commodity Description, HS Code, AOL/POL, AOD/POD, Invoice Value
// ---------------------------------------------------------------------------

const MARINE_INSURANCE_DETAILS_SECTION: QuotationSectionDef = {
  key: 'marine_insurance_details',
  title: 'Cargo Details',
  fields: [
    {
      key: 'commodity_description',
      label: 'Commodity Description',
      control: 'free-text',
      required: 'no',
      storage: 'details',
      legacyKeys: ['commodity', 'commodityDescription'],
    },
    {
      key: 'hs_codes',
      label: 'HS Code',
      control: 'free-text',
      required: 'no',
      storage: 'details',
      legacyKeys: ['hsCode', 'hs_code', 'hsCodes'],
    },
    {
      key: 'pol_aol',
      label: 'AOL/POL',
      control: 'profile-lookup',
      profileType: 'port',
      required: 'no',
      storage: 'details',
      legacyKeys: ['aolPol', 'aol_pol', 'pol', 'departurePort'],
    },
    {
      key: 'pod_aod',
      label: 'AOD/POD',
      control: 'profile-lookup',
      profileType: 'port',
      required: 'no',
      storage: 'details',
      legacyKeys: ['aodPod', 'aod_pod', 'pod', 'arrivalPort'],
    },
    {
      key: 'invoice_value',
      label: 'Invoice Value',
      control: 'currency',
      required: 'no',
      storage: 'details',
      legacyKeys: ['invoiceValue'],
    },
  ],
};

export const MARINE_INSURANCE_QUOTATION_SCHEMA: QuotationServiceSchema = {
  serviceType: 'Marine Insurance',
  sections: [
    QUOTATION_GENERAL_SECTION,
    MARINE_INSURANCE_DETAILS_SECTION,
  ],
};

// ---------------------------------------------------------------------------
// Others Quotation Schema
// Matrix: Service Description
// ---------------------------------------------------------------------------

const OTHERS_DETAILS_SECTION: QuotationSectionDef = {
  key: 'others_details',
  title: 'Service Details',
  fields: [
    {
      key: 'service_description',
      label: 'Service Description',
      control: 'textarea',
      required: 'no',
      storage: 'details',
      legacyKeys: ['serviceDescription'],
    },
  ],
};

export const OTHERS_QUOTATION_SCHEMA: QuotationServiceSchema = {
  serviceType: 'Others',
  sections: [
    QUOTATION_GENERAL_SECTION,
    OTHERS_DETAILS_SECTION,
  ],
};

// ---------------------------------------------------------------------------
// Combined map — keyed by ServiceType for easy lookup
// ---------------------------------------------------------------------------

export const QUOTATION_SCHEMA_MAP: Record<ServiceType, QuotationServiceSchema> = {
  Brokerage: BROKERAGE_QUOTATION_SCHEMA,
  Forwarding: FORWARDING_QUOTATION_SCHEMA,
  Trucking: TRUCKING_QUOTATION_SCHEMA,
  'Marine Insurance': MARINE_INSURANCE_QUOTATION_SCHEMA,
  Others: OTHERS_QUOTATION_SCHEMA,
};

// ---------------------------------------------------------------------------
// Helper: get all fields (flattened) for a given service
// ---------------------------------------------------------------------------

export function getQuotationFields(serviceType: ServiceType): import('./quotationFieldTypes').QuotationFieldDef[] {
  const schema = QUOTATION_SCHEMA_MAP[serviceType];
  return schema.sections.flatMap(s => s.fields);
}

// ---------------------------------------------------------------------------
// Helper: get sections visible for a given quotation context
// ---------------------------------------------------------------------------

export function getVisibleSections(
  serviceType: ServiceType,
  ctx: import('./quotationFieldTypes').QuotationFormContext,
): import('./quotationFieldTypes').QuotationSectionDef[] {
  const schema = QUOTATION_SCHEMA_MAP[serviceType];
  return schema.sections.filter(section => {
    if (!section.showWhen) return true;
    return section.showWhen.every(cond => evaluateCondition(cond, ctx));
  });
}

// ---------------------------------------------------------------------------
// Helper: get fields visible for a given quotation context (single section)
// ---------------------------------------------------------------------------

export function getVisibleFields(
  fields: import('./quotationFieldTypes').QuotationFieldDef[],
  ctx: import('./quotationFieldTypes').QuotationFormContext,
): import('./quotationFieldTypes').QuotationFieldDef[] {
  return fields.filter(field => {
    if (!field.showWhen) return true;
    return field.showWhen.every(cond => evaluateCondition(cond, ctx));
  });
}

// ---------------------------------------------------------------------------
// Internal: evaluate a single visibility condition against the context
// ---------------------------------------------------------------------------

function evaluateCondition(
  cond: import('./quotationFieldTypes').QuotationVisibilityCondition,
  ctx: import('./quotationFieldTypes').QuotationFormContext,
): boolean {
  const ctxValue = ctx[cond.field] ?? '';
  switch (cond.op) {
    case 'eq':
      return ctxValue === cond.value;
    case 'neq':
      return ctxValue !== cond.value;
    case 'in':
      return Array.isArray(cond.value) && cond.value.includes(ctxValue);
    case 'nin':
      return Array.isArray(cond.value) && !cond.value.includes(ctxValue);
    default:
      return true;
  }
}
