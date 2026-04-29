import type { FieldDef, SectionDef, ServiceSchema, ServiceType } from './bookingFieldTypes';
import {
  BOOLEAN_OPTIONS,
  BROKERAGE_TYPE_OPTIONS,
  CARGO_NATURE_OPTIONS,
  CARGO_TYPE_OPTIONS,
  CUSTOMS_ENTRY_OPTIONS,
  CUSTOMS_ENTRY_PROCEDURE_OPTIONS,
  EXAMINATION_OPTIONS,
  FORWARDING_CPE_CODE_OPTIONS,
  INCOTERMS_OPTIONS,
  MODE_OPTIONS,
  MOVEMENT_OPTIONS,
  MOVEMENT_OPTIONS_WITH_DOMESTIC,
  SELECTIVITY_COLOR_OPTIONS,
  SERVICE_STATUS_OPTIONS,
  TRUCK_TYPE_OPTIONS,
} from './bookingFieldOptions';

// ---------------------------------------------------------------------------
// Shared General Information — movement type first; auto-generated refs last
// ---------------------------------------------------------------------------

const SHARED_GENERAL_INFORMATION: SectionDef = {
  key: 'general_information',
  title: 'Overview',
  displayGroup: 'general',
  fields: [
    {
      key: 'movement_type',
      label: 'Movement',
      control: 'segmented',
      required: 'yes',
      storage: 'top-level',
      options: MOVEMENT_OPTIONS,
      optionsByService: {
        Trucking: MOVEMENT_OPTIONS_WITH_DOMESTIC,
        Forwarding: MOVEMENT_OPTIONS_WITH_DOMESTIC,
      },
      // Matrix: Movement shown for BR, FWD, TKG. MI = No.
      showWhen: [{ field: 'service_type', op: 'in', value: ['Brokerage', 'Forwarding', 'Trucking'] }],
    },
    {
      key: 'customer_name',
      label: 'Customer Name',
      control: 'profile-lookup',
      profileType: 'customer',
      required: 'yes',
      storage: 'top-level',
    },
    {
      // Present for Brokerage and Forwarding; Trucking/Marine/Others use 'service' in their own General Specific section.
      key: 'services',
      label: 'Service/s',
      control: 'multi-select',
      optionKey: 'operation_services',
      required: 'no',
      storage: 'details',
      gridSpan: 1,
      showWhen: [{ field: 'service_type', op: 'in', value: ['Brokerage', 'Forwarding'] }],
    },
    {
      key: 'booking_name',
      label: 'Booking Name',
      control: 'free-text',
      required: 'no',
      storage: 'top-level',
      storageKey: 'name',
      gridSpan: 3,
    },
    {
      key: 'account_owner',
      label: 'Account Owner',
      control: 'profile-lookup',
      profileType: 'user',
      required: 'yes',
      storage: 'details',
    },
    // Auto-generated references — already visible in page header; tertiary priority
    {
      key: 'booking_number',
      label: 'Booking Number',
      control: 'autofill-readonly',
      required: 'no',        // generated server-side after submit; not user-required on create
      storage: 'top-level',
    },
    {
      key: 'service_type',
      label: 'Service Type',
      control: 'autofill-readonly',
      required: 'no',        // pre-set from the panel; never user-entered
      storage: 'top-level',
    },
    {
      // Auto-filled lineage — not required for manual bookings created without a pricing source
      key: 'quotation_reference_number',
      label: 'Quotation Reference Number',
      control: 'autofill-readonly',
      required: 'no',
      storage: 'details',
      showWhen: [{ field: 'service_type', op: 'neq', value: 'Trucking' }],
    },
    {
      key: 'project_number',
      label: 'Project / Contract Number',
      control: 'autofill-readonly',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'status',
      label: 'Status',
      control: 'option-lookup',
      optionKey: 'status',
      required: 'yes',
      storage: 'top-level',
      optionsByService: SERVICE_STATUS_OPTIONS,
    },
    {
      key: 'team_assignment',
      label: 'Team Assignment',
      control: 'team-assignment',
      required: 'yes',
      storage: 'top-level',
    },
    // ---------------------------------------------------------------------------
    // Matrix-aligned GI fields — moved here from service-specific sections
    // ---------------------------------------------------------------------------
    {
      // Matrix: Consignee = Yes for all five services in Booking GI.
      key: 'consignee',
      label: 'Consignee',
      control: 'profile-lookup',
      profileType: 'consignee',
      required: 'yes',
      storage: 'details',
    },
    {
      // Matrix: Customs Entry = Yes for BR and FWD only.
      key: 'customs_entry',
      label: 'Customs Entry',
      control: 'dropdown',
      required: 'yes',
      storage: 'details',
      options: CUSTOMS_ENTRY_OPTIONS,
      showWhen: [{ field: 'service_type', op: 'in', value: ['Brokerage', 'Forwarding'] }],
    },
    {
      // Matrix: Customs Entry Procedure = Yes for BR, FWD, and TKG.
      key: 'customs_entry_procedure',
      label: 'Customs Entry Procedure Code',
      control: 'dropdown',
      required: 'yes',
      storage: 'details',
      options: CUSTOMS_ENTRY_PROCEDURE_OPTIONS,
      showWhen: [{ field: 'service_type', op: 'in', value: ['Brokerage', 'Forwarding', 'Trucking'] }],
    },
    {
      // Matrix: Overseas Agent = Yes for FWD and MI.
      key: 'overseas_agent',
      label: 'Overseas Agent',
      control: 'profile-lookup',
      profileType: 'agent',
      required: 'yes',
      storage: 'details',
      showWhen: [{ field: 'service_type', op: 'in', value: ['Forwarding', 'Marine Insurance'] }],
    },
    {
      // Matrix: Local Agent = Yes for FWD only.
      key: 'local_agent',
      label: 'Local Agent',
      control: 'profile-lookup',
      profileType: 'agent',
      required: 'yes',
      storage: 'details',
      showWhen: [{ field: 'service_type', op: 'eq', value: 'Forwarding' }],
    },
  ],
};

// ---------------------------------------------------------------------------
// Reusable field fragments shared across multiple services
// ---------------------------------------------------------------------------

const PRIMARY_TRADE_PARTY: FieldDef = {
  key: 'primary_trade_party',
  label: 'Consignee / Shipper Name',
  control: 'profile-lookup',
  profileType: 'consignee_or_shipper',
  required: 'yes',
  storage: 'details',
  dynamicLabels: [
    { when: [{ field: 'movement_type', op: 'eq', value: 'Import' }], label: 'Consignee Name' },
    { when: [{ field: 'movement_type', op: 'eq', value: 'Export' }], label: 'Shipper Name' },
  ],
};

const MBL_MAWB: FieldDef = {
  key: 'mbl_mawb',
  label: 'MBL Number',
  control: 'free-text',
  required: 'yes',
  storage: 'details',
  dynamicLabels: [
    { when: [{ field: 'mode', op: 'eq', value: 'Air Freight' }], label: 'MAWB Number' },
  ],
};

const HBL_HAWB: FieldDef = {
  key: 'hbl_hawb',
  label: 'HBL Number',
  control: 'free-text',
  required: 'yes',
  storage: 'details',
  dynamicLabels: [
    { when: [{ field: 'mode', op: 'eq', value: 'Air Freight' }], label: 'HAWB Number' },
  ],
};

const POL_AOL: FieldDef = {
  key: 'pol_aol',
  label: 'POL / AOL',
  control: 'profile-lookup',
  profileType: 'port',
  required: 'yes',
  storage: 'details',
  dynamicLabels: [
    { when: [{ field: 'mode', op: 'eq', value: 'Air Freight' }], label: 'AOL' },
    { when: [{ field: 'mode', op: 'in', value: ['FCL', 'LCL'] }], label: 'POL' },
  ],
};

const POD_AOD: FieldDef = {
  key: 'pod_aod',
  label: 'POD / AOD',
  control: 'profile-lookup',
  profileType: 'port',
  required: 'yes',
  storage: 'details',
  dynamicLabels: [
    { when: [{ field: 'mode', op: 'eq', value: 'Air Freight' }], label: 'AOD' },
    { when: [{ field: 'mode', op: 'in', value: ['FCL', 'LCL'] }], label: 'POD' },
  ],
};

// ---------------------------------------------------------------------------
// BROKERAGE
// ---------------------------------------------------------------------------

const BROKERAGE_GENERAL_SPECIFIC: SectionDef = {
  key: 'brokerage_general_specific',
  title: 'Clearance Parameters',
  displayGroup: 'general',
  fields: [
    {
      key: 'brokerage_type',
      label: 'Brokerage Type',
      control: 'segmented',
      required: 'no',
      storage: 'details',
      options: BROKERAGE_TYPE_OPTIONS,
    },
    {
      key: 'mode',
      label: 'Mode',
      control: 'option-lookup',
      optionKey: 'mode',
      required: 'yes',
      storage: 'top-level',
      options: MODE_OPTIONS,
    },
    PRIMARY_TRADE_PARTY,
    {
      key: 'cargo_type',
      label: 'Cargo Type',
      control: 'option-lookup',
      optionKey: 'cargo_type',
      required: 'yes',
      storage: 'details',
      options: CARGO_TYPE_OPTIONS,
    },
    {
      // Spec: Commodity Description moves to General Information at booking time.
      key: 'description_of_goods',
      label: 'Commodity Description',
      control: 'textarea',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'incoterms',
      label: 'Incoterms',
      control: 'dropdown',
      required: 'conditional',
      storage: 'details',
      options: INCOTERMS_OPTIONS,
    },
    {
      key: 'sub_services',
      label: 'Sub-Service/s',
      control: 'multi-value',
      required: 'conditional',
      storage: 'details',
    },
  ],
};

const BROKERAGE_BOOKING_DETAILS: SectionDef = {
  key: 'brokerage_details',
  title: 'Shipment Details',
  fields: [
    // Trade parties — consignee moved to shared GI (matrix: GI for all services)
    {
      key: 'shipper',
      label: 'Shipper',
      control: 'profile-lookup',
      profileType: 'shipper',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'carrier',
      label: 'Carrier / Airline',
      control: 'profile-lookup',
      profileType: 'carrier',
      required: 'yes',
      storage: 'details',
      dynamicLabels: [
        { when: [{ field: 'mode', op: 'eq', value: 'Air Freight' }], label: 'Airline' },
        { when: [{ field: 'mode', op: 'in', value: ['FCL', 'LCL'] }], label: 'Carrier' },
      ],
    },
    // Cargo (description_of_goods moved to General Information per spec)
    {
      key: 'gross_weight',
      label: 'Gross Weight',
      control: 'number',
      required: 'yes',
      storage: 'details',
      unit: 'kg',
    },
    {
      key: 'measurement',
      label: 'Measurement',
      control: 'free-text',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'chargeable_weight',
      label: 'Chargeable Weight',
      control: 'number',
      required: 'yes',
      storage: 'details',
      unit: 'kg',
      showWhen: [{ field: 'mode', op: 'eq', value: 'Air Freight' }],
    },
    {
      key: 'country_of_origin',
      label: 'Country of Origin',
      control: 'profile-lookup',
      profileType: 'country',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'preferential_treatment',
      label: 'Preferential Treatment',
      control: 'free-text',
      required: 'yes',
      storage: 'details',
    },
    // Documents
    MBL_MAWB,
    HBL_HAWB,
    {
      key: 'registry_number',
      label: 'Registry Number',
      control: 'free-text',
      required: 'conditional',
      storage: 'details',
      showWhen: [{ field: 'movement_type', op: 'eq', value: 'Export' }],
    },
    // Routing
    POL_AOL,
    POD_AOD,
    {
      key: 'vessel',
      label: 'Vessel',
      control: 'free-text',
      required: 'no',
      storage: 'details',
      showWhen: [{ field: 'mode', op: 'in', value: ['FCL', 'LCL'] }],
    },
    {
      key: 'flight_number',
      label: 'Flight Number',
      control: 'free-text',
      required: 'no',
      storage: 'details',
      showWhen: [{ field: 'mode', op: 'eq', value: 'Air Freight' }],
    },
    // Dates
    {
      key: 'etd',
      label: 'ETD',
      control: 'date',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'eta',
      label: 'ETA',
      control: 'date',
      required: 'yes',
      storage: 'details',
    },
    {
      // Spec: ETB Y/Y/N for FCL/LCL/AIR — gated only by mode, not movement.
      key: 'etb',
      label: 'ETB',
      control: 'date',
      required: 'conditional',
      storage: 'details',
      showWhen: [{ field: 'mode', op: 'in', value: ['FCL', 'LCL'] }],
    },
    {
      key: 'lct',
      label: 'LCT',
      control: 'datetime',
      required: 'conditional',
      storage: 'details',
      showWhen: [{ field: 'movement_type', op: 'eq', value: 'Export' }],
    },
    // Optional
    {
      key: 'forwarder',
      label: 'Forwarder',
      control: 'profile-lookup',
      profileType: 'forwarder',
      required: 'no',
      storage: 'details',
    },
  ],
};

const BROKERAGE_FCL_DETAILS: SectionDef = {
  key: 'brokerage_fcl',
  title: 'FCL Details',
  showWhen: [{ field: 'mode', op: 'eq', value: 'FCL' }],
  fields: [
    {
      key: 'container_numbers',
      label: 'Container Number/s',
      control: 'multi-value',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'seal_numbers',
      label: 'Seal Number/s',
      control: 'multi-value',
      required: 'conditional',
      storage: 'details',
      showWhen: [{ field: 'movement_type', op: 'eq', value: 'Export' }],
    },
    {
      key: 'tare_weight',
      label: 'Tare Weight',
      control: 'number',
      required: 'conditional',
      storage: 'details',
      unit: 'kg',
      showWhen: [{ field: 'movement_type', op: 'eq', value: 'Export' }],
    },
    {
      key: 'vgm',
      label: 'VGM',
      control: 'number',
      required: 'conditional',
      storage: 'details',
      unit: 'kg',
      showWhen: [{ field: 'movement_type', op: 'eq', value: 'Export' }],
    },
    {
      // Spec: brokerage container deposit applies to all FCL bookings, not just Import.
      key: 'container_deposit',
      label: 'Container Deposit',
      control: 'boolean-dropdown',
      required: 'conditional',
      storage: 'details',
      options: BOOLEAN_OPTIONS,
    },
    {
      // Spec: Stripping Date / Date of Discharge — Brokerage FCL Y.
      key: 'stripping_date',
      label: 'Stripping Date / Date of Discharge',
      control: 'date',
      required: 'conditional',
      storage: 'details',
    },
    {
      // Spec: Location of Goods — Brokerage FCL Y.
      key: 'location_of_goods',
      label: 'Location of Goods',
      control: 'profile-lookup',
      profileType: 'warehouse',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'empty_return',
      label: 'Empty Return',
      control: 'date',
      required: 'conditional',
      storage: 'details',
    },
    {
      key: 'det_dem_validity',
      label: 'Det/Dem Validity',
      control: 'date',
      required: 'conditional',
      storage: 'details',
    },
    {
      key: 'storage_validity',
      label: 'Storage Validity',
      control: 'date',
      required: 'conditional',
      storage: 'details',
    },
    {
      key: 'cro_availability',
      label: 'CRO Availability',
      control: 'date',
      required: 'conditional',
      storage: 'details',
    },
    {
      key: 'booking_confirmation_number',
      label: 'Booking Confirmation Number',
      control: 'free-text',
      required: 'conditional',
      storage: 'details',
      showWhen: [{ field: 'movement_type', op: 'eq', value: 'Export' }],
    },
    {
      key: 'pull_out',
      label: 'Pull Out',
      control: 'free-text',
      required: 'no',
      storage: 'details',
      showWhen: [{ field: 'movement_type', op: 'eq', value: 'Export' }],
    },
    {
      key: 'collection_address',
      label: 'Collection Address',
      control: 'free-text',
      required: 'no',
      storage: 'details',
      showWhen: [{ field: 'movement_type', op: 'eq', value: 'Export' }],
    },
    {
      key: 'trucking_name',
      label: 'Trucking Name',
      control: 'profile-lookup',
      profileType: 'trucking_company',
      required: 'no',
      storage: 'details',
      showWhen: [{ field: 'movement_type', op: 'eq', value: 'Export' }],
    },
    {
      key: 'plate_number',
      label: 'Plate Number',
      control: 'free-text',
      required: 'no',
      storage: 'details',
      showWhen: [{ field: 'movement_type', op: 'eq', value: 'Export' }],
    },
  ],
};

const BROKERAGE_LCL_DETAILS: SectionDef = {
  key: 'brokerage_lcl',
  title: 'LCL Details',
  showWhen: [{ field: 'mode', op: 'eq', value: 'LCL' }],
  fields: [
    {
      key: 'container_numbers',
      label: 'Container Number/s',
      control: 'multi-value',
      required: 'conditional',
      storage: 'details',
    },
    {
      key: 'consolidator',
      label: 'Consolidator',
      control: 'profile-lookup',
      profileType: 'consolidator',
      required: 'conditional',
      storage: 'details',
    },
    {
      key: 'location_of_goods',
      label: 'Location of Goods',
      control: 'profile-lookup',
      profileType: 'warehouse',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'warehouse_location',
      label: 'Warehouse Location',
      control: 'profile-lookup',
      profileType: 'warehouse',
      required: 'conditional',
      storage: 'details',
    },
    {
      // Spec: Stripping Date / Date of Discharge — Brokerage LCL Y (no movement gate).
      key: 'stripping_date',
      label: 'Stripping Date / Date of Discharge',
      control: 'date',
      required: 'conditional',
      storage: 'details',
    },
  ],
};

const BROKERAGE_AIR_DETAILS: SectionDef = {
  key: 'brokerage_air',
  title: 'Air Freight Details',
  showWhen: [{ field: 'mode', op: 'eq', value: 'Air Freight' }],
  fields: [
    {
      key: 'location_of_goods',
      label: 'Location of Goods',
      control: 'profile-lookup',
      profileType: 'warehouse',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'warehouse_location',
      label: 'Warehouse Location',
      control: 'profile-lookup',
      profileType: 'warehouse',
      required: 'conditional',
      storage: 'details',
    },
  ],
};

const BROKERAGE_IMPORT_CUSTOMS: SectionDef = {
  // Spec: customs fields (Selectivity Color, Entry Number, Examinations, Customs
  // Duties, Brokerage Fee SAD, etc.) apply to all Brokerage modes regardless of
  // Import/Export. Section is no longer movement-gated.
  key: 'brokerage_import_customs',
  title: 'Customs Details',
  fields: [
    {
      key: 'selectivity_color',
      label: 'Selectivity Color',
      control: 'dropdown',
      required: 'yes',
      storage: 'details',
      options: SELECTIVITY_COLOR_OPTIONS,
    },
    {
      key: 'entry_number',
      label: 'Entry Number',
      control: 'free-text',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'examinations',
      label: 'Examinations',
      control: 'repeater',
      required: 'no',
      storage: 'details',
      repeaterColumns: [
        { key: 'type', label: 'Type', control: 'dropdown', options: EXAMINATION_OPTIONS },
        { key: 'date', label: 'Date', control: 'date' },
        { key: 'remarks', label: 'Remarks', control: 'free-text' },
      ],
    },
    {
      key: 'customs_duties_taxes_paid',
      label: 'Customs Duties & Taxes Paid',
      control: 'currency',
      required: 'yes',
      storage: 'details',
    },
    {
      // Matrix: Brokerage Fee (SAD). Kept distinct from the legacy Net of VAT field.
      key: 'brokerage_fee_sad',
      label: 'Brokerage Fee (SAD)',
      control: 'currency',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'brokerage_fee_net_of_vat',
      label: 'Brokerage Fee Net of VAT',
      control: 'currency',
      required: 'no',
      storage: 'details',
    },
    {
      key: 'delivery_address',
      label: 'Delivery Address',
      control: 'free-text',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'hs_codes',
      label: 'HS Code/s',
      control: 'multi-value',
      required: 'no',
      storage: 'details',
    },
    {
      key: 'rate_of_duty',
      label: 'Rate of Duty',
      control: 'percent',
      required: 'no',
      storage: 'details',
    },
    {
      key: 'permits',
      label: 'Permit/s',
      control: 'multi-value',
      required: 'no',
      storage: 'details',
    },
  ],
};

// ---------------------------------------------------------------------------
// FORWARDING
// ---------------------------------------------------------------------------

const FORWARDING_GENERAL_SPECIFIC: SectionDef = {
  key: 'forwarding_general_specific',
  title: 'Mode & Cargo',
  displayGroup: 'general',
  fields: [
    // Mode first — FCL/LCL/Air determines what every downstream field means
    {
      key: 'mode',
      label: 'Mode',
      control: 'option-lookup',
      optionKey: 'mode',
      required: 'yes',
      storage: 'top-level',
      options: MODE_OPTIONS,
    },
    PRIMARY_TRADE_PARTY,
    {
      key: 'incoterms',
      label: 'Incoterms',
      control: 'dropdown',
      required: 'yes',
      storage: 'details',
      options: INCOTERMS_OPTIONS,
    },
    {
      key: 'cargo_type',
      label: 'Cargo Type',
      control: 'option-lookup',
      optionKey: 'cargo_type',
      required: 'yes',
      storage: 'details',
      options: CARGO_TYPE_OPTIONS,
    },
    {
      key: 'cargo_nature',
      label: 'Cargo Nature',
      control: 'dropdown',
      required: 'yes',
      storage: 'details',
      options: CARGO_NATURE_OPTIONS,
    },
    {
      // Spec: Commodity Description moves to General Information at booking time.
      key: 'commodity_description',
      label: 'Commodity Description',
      control: 'textarea',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'sub_services',
      label: 'Sub-Service/s',
      control: 'multi-value',
      required: 'conditional',
      storage: 'details',
    },
    // customs_entry_procedure moved to shared GI (matrix: GI field for BR/FWD/TKG)
    // overseas_agent and local_agent moved to shared GI (matrix: GI fields for FWD+MI / FWD)
  ],
};

const FORWARDING_BOOKING_DETAILS: SectionDef = {
  key: 'forwarding_details',
  title: 'Shipment Details',
  fields: [
    // Trade parties — consignee moved to shared GI
    {
      key: 'shipper',
      label: 'Shipper',
      control: 'profile-lookup',
      profileType: 'shipper',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'carrier',
      label: 'Carrier',
      control: 'profile-lookup',
      profileType: 'carrier',
      required: 'yes',
      storage: 'details',
    },
    // Cargo — commodity_description moved to General Information per spec.
    {
      key: 'gross_weight',
      label: 'Gross Weight',
      control: 'number',
      required: 'yes',
      storage: 'details',
      unit: 'kg',
    },
    {
      // Matrix: Measurement. Legacy key 'dimensions' aliased in bookingDetailsCompat.
      key: 'measurement',
      label: 'Measurement',
      control: 'free-text',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'chargeable_weight',
      label: 'Chargeable Weight',
      control: 'number',
      required: 'yes',
      storage: 'details',
      unit: 'kg',
      showWhen: [{ field: 'mode', op: 'eq', value: 'Air Freight' }],
    },
    {
      key: 'country_of_origin',
      label: 'Country of Origin',
      control: 'profile-lookup',
      profileType: 'country',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'country_of_destination',
      label: 'Country of Destination',
      control: 'profile-lookup',
      profileType: 'country',
      required: 'conditional',
      storage: 'details',
      showWhen: [{ field: 'movement_type', op: 'eq', value: 'Export' }],
    },
    {
      key: 'preferential_treatment',
      label: 'Preferential Treatment',
      control: 'free-text',
      required: 'yes',
      storage: 'details',
    },
    // Documents
    MBL_MAWB,
    HBL_HAWB,
    {
      key: 'registry_number',
      label: 'Registry Number',
      control: 'free-text',
      required: 'yes',
      storage: 'details',
    },
    // Routing
    { ...POL_AOL, required: 'yes' as const },
    { ...POD_AOD, required: 'yes' as const },
    {
      key: 'vessel',
      label: 'Vessel',
      control: 'free-text',
      required: 'no',
      storage: 'details',
      showWhen: [{ field: 'mode', op: 'in', value: ['FCL', 'LCL'] }],
    },
    {
      key: 'flight_number',
      label: 'Flight Number',
      control: 'free-text',
      required: 'no',
      storage: 'details',
      showWhen: [{ field: 'mode', op: 'eq', value: 'Air Freight' }],
    },
    // Dates
    {
      key: 'etd',
      label: 'ETD',
      control: 'date',
      required: 'yes',
      storage: 'details',
    },
    {
      // Spec: ETA / ATA on forwarding bookings.
      key: 'eta',
      label: 'ETA / ATA',
      control: 'date',
      required: 'yes',
      storage: 'details',
    },
    {
      // Spec: ETB Y/Y/N for FCL/LCL/AIR — gated only by mode.
      key: 'etb',
      label: 'ETB',
      control: 'date',
      required: 'conditional',
      storage: 'details',
      showWhen: [{ field: 'mode', op: 'in', value: ['FCL', 'LCL'] }],
    },
    {
      // Matrix: Tagging Time = Yes for all forwarding modes.
      key: 'tagging_time',
      label: 'Tagging Time',
      control: 'datetime',
      required: 'yes',
      storage: 'details',
    },
    // Optional parties
    {
      // Matrix: Forwarder (if any). Key 'agent' is canonical (forwarder aliased via SERVICE_LEGACY_MAP).
      key: 'agent',
      label: 'Forwarder',
      control: 'profile-lookup',
      profileType: 'agent',
      required: 'no',
      storage: 'details',
    },
    {
      key: 'consolidator',
      label: 'Consolidator',
      control: 'profile-lookup',
      profileType: 'consolidator',
      required: 'conditional',
      storage: 'details',
      showWhen: [{ field: 'mode', op: 'eq', value: 'LCL' }],
    },
    // Supplementary
    {
      // Matrix: Type of Package = Yes for all forwarding modes (FCL, LCL, AIR).
      key: 'type_of_package',
      label: 'Type of Package',
      control: 'free-text',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'remarks',
      label: 'Remarks',
      control: 'textarea',
      required: 'no',
      storage: 'details',
    },
  ],
};

const FORWARDING_FCL_DETAILS: SectionDef = {
  key: 'forwarding_fcl',
  title: 'FCL Details',
  showWhen: [{ field: 'mode', op: 'eq', value: 'FCL' }],
  fields: [
    {
      key: 'container_numbers',
      label: 'Container Number/s',
      control: 'multi-value',
      required: 'yes',
      storage: 'details',
    },
    {
      // Spec: Container Deposit Y for FCL (no movement gate).
      key: 'container_deposit',
      label: 'Container Deposit',
      control: 'boolean-dropdown',
      required: 'yes',
      storage: 'details',
      options: BOOLEAN_OPTIONS,
    },
    {
      key: 'det_dem_validity',
      label: 'Det/Dem Validity',
      control: 'date',
      required: 'yes',
      storage: 'details',
    },
    {
      // Spec: Stripping Date / Date of Discharge — Forwarding FCL Y.
      key: 'stripping_date',
      label: 'Stripping Date / Date of Discharge',
      control: 'date',
      required: 'yes',
      storage: 'details',
    },
    {
      // Spec: Location of Goods — Forwarding FCL Y.
      key: 'location_of_goods',
      label: 'Location of Goods',
      control: 'profile-lookup',
      profileType: 'warehouse',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'cut_off_time',
      label: 'Cut Off Time',
      control: 'datetime',
      required: 'no',
      storage: 'details',
      showWhen: [{ field: 'movement_type', op: 'eq', value: 'Export' }],
    },
    {
      key: 'transit_time',
      label: 'Transit Time',
      control: 'number',
      required: 'yes',
      storage: 'details',
      unit: 'days',
    },
    {
      key: 'routing',
      label: 'Routing',
      control: 'free-text',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'stackable',
      label: 'Stackable',
      control: 'boolean-dropdown',
      required: 'no',
      storage: 'details',
      options: BOOLEAN_OPTIONS,
    },
  ],
};

const FORWARDING_LCL_DETAILS: SectionDef = {
  key: 'forwarding_lcl',
  title: 'LCL Details',
  showWhen: [{ field: 'mode', op: 'eq', value: 'LCL' }],
  fields: [
    {
      key: 'container_numbers',
      label: 'Container Number/s',
      control: 'multi-value',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'warehouse_location',
      label: 'Warehouse Location',
      control: 'profile-lookup',
      profileType: 'warehouse',
      required: 'conditional',
      storage: 'details',
    },
    {
      key: 'location_of_goods',
      label: 'Location of Goods',
      control: 'profile-lookup',
      profileType: 'warehouse',
      required: 'yes',
      storage: 'details',
    },
    {
      // Spec: Stripping Date / Date of Discharge — Forwarding LCL Y (no movement gate).
      key: 'stripping_date',
      label: 'Stripping Date / Date of Discharge',
      control: 'date',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'cut_off_time',
      label: 'Cut Off Time',
      control: 'datetime',
      required: 'no',
      storage: 'details',
      showWhen: [{ field: 'movement_type', op: 'eq', value: 'Export' }],
    },
    {
      key: 'transit_time',
      label: 'Transit Time',
      control: 'number',
      required: 'yes',
      storage: 'details',
      unit: 'days',
    },
    {
      key: 'routing',
      label: 'Routing',
      control: 'free-text',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'stackable',
      label: 'Stackable',
      control: 'boolean-dropdown',
      required: 'no',
      storage: 'details',
      options: BOOLEAN_OPTIONS,
    },
    {
      key: 'consolidator_charges',
      label: 'Consolidator Charges',
      control: 'currency',
      required: 'no',
      storage: 'details',
    },
  ],
};

const FORWARDING_AIR_DETAILS: SectionDef = {
  key: 'forwarding_air',
  title: 'Air Freight Details',
  showWhen: [{ field: 'mode', op: 'eq', value: 'Air Freight' }],
  fields: [
    {
      key: 'warehouse_location',
      label: 'Warehouse Location',
      control: 'profile-lookup',
      profileType: 'warehouse',
      required: 'conditional',
      storage: 'details',
    },
    {
      key: 'location_of_goods',
      label: 'Location of Goods',
      control: 'profile-lookup',
      profileType: 'warehouse',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'transit_time',
      label: 'Transit Time',
      control: 'number',
      required: 'yes',
      storage: 'details',
      unit: 'days',
    },
    {
      key: 'routing',
      label: 'Routing',
      control: 'free-text',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'stackable',
      label: 'Stackable',
      control: 'boolean-dropdown',
      required: 'no',
      storage: 'details',
      options: BOOLEAN_OPTIONS,
    },
  ],
};

// Incoterm-driven fields — always-visible section, each field has its own showWhen
const FORWARDING_INCOTERM_DETAILS: SectionDef = {
  key: 'forwarding_incoterm',
  title: 'Delivery Information',
  fields: [
    {
      key: 'collection_address',
      label: 'Collection Address',
      control: 'free-text',
      required: 'conditional',
      storage: 'details',
      showWhen: [{ field: 'incoterms', op: 'eq', value: 'EXW' }],
    },
    {
      key: 'delivery_address',
      label: 'Delivery Address',
      control: 'free-text',
      required: 'conditional',
      storage: 'details',
      showWhen: [{ field: 'incoterms', op: 'in', value: ['DAP', 'DDU', 'DDP'] }],
    },
    {
      key: 'shipping_charges',
      label: 'Shipping Charges',
      control: 'currency',
      required: 'no',
      storage: 'details',
    },
  ],
};

// ---------------------------------------------------------------------------
// TRUCKING
// ---------------------------------------------------------------------------

const TRUCKING_GENERAL_SPECIFIC: SectionDef = {
  key: 'trucking_general_specific',
  title: 'Vehicle & Service',
  displayGroup: 'general',
  fields: [
    {
      key: 'mode',
      label: 'Mode',
      control: 'segmented',
      required: 'yes',
      storage: 'top-level',
      options: ['FCL', 'LCL'],
    },
    {
      key: 'truck_type',
      label: 'Truck Type',
      control: 'dropdown',
      required: 'yes',
      storage: 'details',
      options: TRUCK_TYPE_OPTIONS,
    },
    {
      key: 'preferred_delivery_date',
      label: 'Preferred Delivery Date',
      control: 'date',
      required: 'no',
      storage: 'details',
    },
    {
      key: 'service',
      label: 'Service/s',
      control: 'multi-select',
      optionKey: 'operation_services',
      required: 'no',
      storage: 'details',
    },
  ],
};

const TRUCKING_DELIVERY_INFORMATION: SectionDef = {
  key: 'trucking_delivery',
  title: 'Delivery Details',
  fields: [
    // consignee moved to shared GI
    {
      key: 'delivery_address',
      label: 'Delivery Address',
      control: 'free-text',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'pull_out_location',
      label: 'Pull Out',
      control: 'free-text',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'pull_out_date',
      label: 'Pull Out Date',
      control: 'datetime',
      required: 'conditional',
      storage: 'details',
    },
    {
      // Matrix: Driver = Yes (FCL + LCL)
      key: 'driver',
      label: 'Driver',
      control: 'profile-lookup',
      profileType: 'driver',
      required: 'yes',
      storage: 'details',
    },
    {
      // Matrix: Vehicle Reference Number = Yes (FCL + LCL)
      key: 'vehicle_reference_number',
      label: 'Vehicle Reference Number',
      control: 'free-text',
      required: 'yes',
      storage: 'details',
    },
    {
      // Matrix: Helper = Yes (FCL + LCL)
      key: 'helper',
      label: 'Helper',
      control: 'profile-lookup',
      profileType: 'helper',
      required: 'yes',
      storage: 'details',
    },
    {
      // Matrix: Selling Rate = Yes (FCL + LCL)
      key: 'selling_rate',
      label: 'Selling Rate',
      control: 'currency',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'delivery_instructions',
      label: 'Delivery Instructions',
      control: 'textarea',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'date_delivered',
      label: 'Date Delivered',
      control: 'datetime',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'date_empty_return',
      label: 'Date of Empty Return',
      control: 'datetime',
      required: 'conditional',
      storage: 'details',
      showWhen: [{ field: 'status', op: 'in', value: ['Empty Return', 'Liquidated'] }],
    },
  ],
};

const TRUCKING_DESTINATIONS: SectionDef = {
  key: 'trucking_destinations',
  title: 'Destinations',
  fields: [
    {
      key: 'trucking_line_items',
      label: 'Destinations',
      control: 'repeater',
      required: 'yes',
      storage: 'details',
      repeaterColumns: [
        { key: 'destination', label: 'Destination', control: 'free-text' },
        { key: 'truck_type', label: 'Truck Type', control: 'dropdown', options: TRUCK_TYPE_OPTIONS },
        { key: 'quantity', label: 'Qty', control: 'number' },
      ],
    },
  ],
};

const TRUCKING_FCL_DETAILS: SectionDef = {
  key: 'trucking_fcl',
  title: 'Container Details',
  showWhen: [{ field: 'mode', op: 'eq', value: 'FCL' }],
  fields: [
    {
      key: 'container_number',
      label: 'Container Number',
      control: 'multi-value',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'tabs_booking',
      label: 'TABS Booking',
      control: 'free-text',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'empty_return',
      label: 'Empty Return',
      control: 'date',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'cy_fee',
      label: 'CY Fee',
      control: 'boolean-dropdown',
      required: 'yes',
      storage: 'details',
      options: BOOLEAN_OPTIONS,
    },
    {
      key: 'eir_availability',
      label: 'EIR Availability',
      control: 'date',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'early_gate_in',
      label: 'Early Gate In',
      control: 'boolean-dropdown',
      required: 'yes',
      storage: 'details',
      options: BOOLEAN_OPTIONS,
    },
    {
      key: 'storage_validity',
      label: 'Storage Validity',
      control: 'date',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'det_dem_validity',
      label: 'Det/Dem Validity',
      control: 'date',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'shipping_line',
      label: 'Shipping Line',
      control: 'profile-lookup',
      profileType: 'shipping_line',
      required: 'yes',
      storage: 'details',
    },
  ],
};

// ---------------------------------------------------------------------------
// MARINE INSURANCE
// ---------------------------------------------------------------------------

const MARINE_GENERAL_SPECIFIC: SectionDef = {
  key: 'marine_general_specific',
  title: 'Coverage',
  displayGroup: 'general',
  fields: [
    {
      key: 'service',
      label: 'Service/s',
      control: 'multi-select',
      optionKey: 'operation_services',
      required: 'no',
      storage: 'details',
    },
  ],
};

const MARINE_POLICY_INFORMATION: SectionDef = {
  key: 'marine_policy',
  title: 'Policy Details',
  fields: [
    // Primary parties
    {
      key: 'shipper',
      label: 'Shipper',
      control: 'profile-lookup',
      profileType: 'shipper',
      required: 'yes',
      storage: 'details',
    },
    // consignee moved to shared GI
    {
      key: 'carrier',
      label: 'Carrier',
      control: 'profile-lookup',
      profileType: 'carrier',
      required: 'conditional',
      storage: 'details',
    },
    {
      key: 'insurer',
      label: 'Insurer',
      control: 'profile-lookup',
      profileType: 'insurer',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'amount_insured',
      label: 'Amount Insured',
      control: 'currency',
      required: 'yes',
      storage: 'details',
    },
    // Cargo
    {
      key: 'commodity_description',
      label: 'Commodity Description',
      control: 'textarea',
      required: 'yes',
      storage: 'details',
    },
    {
      key: 'hs_codes',
      label: 'HS Code/s',
      control: 'multi-value',
      required: 'no',
      storage: 'details',
    },
    // Document
    {
      key: 'bl_awb_number',
      label: 'BL / AWB Number',
      control: 'free-text',
      required: 'yes',
      storage: 'details',
    },
    // Routing
    POL_AOL,
    POD_AOD,
    // Dates
    {
      key: 'etd',
      label: 'ETD',
      control: 'date',
      required: 'conditional',
      storage: 'details',
    },
    {
      key: 'eta',
      label: 'ETA',
      control: 'date',
      required: 'conditional',
      storage: 'details',
    },
    {
      key: 'date_issued',
      label: 'Date Issued',
      control: 'date',
      required: 'conditional',
      storage: 'details',
      showWhen: [{ field: 'status', op: 'in', value: ['Issued', 'Billed', 'Paid'] }],
    },
  ],
};

const MARINE_OPTIONAL_INTERNAL: SectionDef = {
  key: 'marine_optional_internal',
  title: 'Internal Notes',
  fields: [
    {
      key: 'policy_number',
      label: 'Policy Number',
      control: 'free-text',
      required: 'no',
      storage: 'details',
    },
    {
      key: 'premium',
      label: 'Premium',
      control: 'currency',
      required: 'no',
      storage: 'details',
    },
    {
      key: 'coverage_type',
      label: 'Coverage Type',
      control: 'free-text',
      required: 'no',
      storage: 'details',
    },
    {
      key: 'policy_start_date',
      label: 'Policy Start Date',
      control: 'date',
      required: 'no',
      storage: 'details',
    },
    {
      key: 'policy_end_date',
      label: 'Policy End Date',
      control: 'date',
      required: 'no',
      storage: 'details',
    },
    {
      key: 'remarks',
      label: 'Remarks',
      control: 'textarea',
      required: 'no',
      storage: 'details',
    },
  ],
};

// ---------------------------------------------------------------------------
// OTHERS
// ---------------------------------------------------------------------------

const OTHERS_GENERAL_SPECIFIC: SectionDef = {
  key: 'others_general_specific',
  title: 'Service',
  displayGroup: 'general',
  fields: [
    {
      key: 'service',
      label: 'Service/s',
      control: 'multi-select',
      optionKey: 'operation_services',
      required: 'no',
      storage: 'details',
    },
  ],
};

const OTHERS_BOOKING_DETAILS: SectionDef = {
  key: 'others_details',
  title: 'Scope of Work',
  fields: [
    {
      key: 'service_description',
      label: 'Service/s Description',
      control: 'textarea',
      required: 'yes',
      storage: 'details',
    },
  ],
};

const OTHERS_OPTIONAL_INTERNAL: SectionDef = {
  key: 'others_optional_internal',
  title: 'Notes & Scheduling',
  fields: [
    {
      key: 'delivery_location',
      label: 'Delivery Location',
      control: 'free-text',
      required: 'no',
      storage: 'details',
    },
    {
      key: 'schedule_date',
      label: 'Schedule Date',
      control: 'date',
      required: 'no',
      storage: 'details',
    },
    {
      key: 'completion_date',
      label: 'Completion Date',
      control: 'date',
      required: 'no',
      storage: 'details',
    },
    {
      key: 'contact_person',
      label: 'Contact Person',
      control: 'free-text',
      required: 'no',
      storage: 'details',
    },
    {
      key: 'contact_number',
      label: 'Contact Number',
      control: 'free-text',
      required: 'no',
      storage: 'details',
    },
    {
      key: 'estimated_cost',
      label: 'Estimated Cost',
      control: 'currency',
      required: 'no',
      storage: 'details',
    },
    {
      key: 'actual_cost',
      label: 'Actual Cost',
      control: 'currency',
      required: 'no',
      storage: 'details',
    },
    {
      key: 'special_instructions',
      label: 'Special Instructions',
      control: 'textarea',
      required: 'no',
      storage: 'details',
    },
  ],
};

// ---------------------------------------------------------------------------
// Service schemas — each starts with the shared General Information section
// ---------------------------------------------------------------------------

export const BROKERAGE_SCHEMA: ServiceSchema = {
  serviceType: 'Brokerage',
  sections: [
    SHARED_GENERAL_INFORMATION,
    BROKERAGE_GENERAL_SPECIFIC,
    BROKERAGE_BOOKING_DETAILS,
    BROKERAGE_FCL_DETAILS,
    BROKERAGE_LCL_DETAILS,
    BROKERAGE_AIR_DETAILS,
    BROKERAGE_IMPORT_CUSTOMS,
  ],
};

export const FORWARDING_SCHEMA: ServiceSchema = {
  serviceType: 'Forwarding',
  sections: [
    SHARED_GENERAL_INFORMATION,
    FORWARDING_GENERAL_SPECIFIC,
    FORWARDING_BOOKING_DETAILS,
    FORWARDING_FCL_DETAILS,
    FORWARDING_LCL_DETAILS,
    FORWARDING_AIR_DETAILS,
    FORWARDING_INCOTERM_DETAILS,
  ],
};

export const TRUCKING_SCHEMA: ServiceSchema = {
  serviceType: 'Trucking',
  sections: [
    SHARED_GENERAL_INFORMATION,
    TRUCKING_GENERAL_SPECIFIC,
    TRUCKING_DELIVERY_INFORMATION,
    TRUCKING_DESTINATIONS,
    TRUCKING_FCL_DETAILS,
  ],
};

export const MARINE_INSURANCE_SCHEMA: ServiceSchema = {
  serviceType: 'Marine Insurance',
  sections: [
    SHARED_GENERAL_INFORMATION,
    MARINE_GENERAL_SPECIFIC,
    MARINE_POLICY_INFORMATION,
    MARINE_OPTIONAL_INTERNAL,
  ],
};

export const OTHERS_SCHEMA: ServiceSchema = {
  serviceType: 'Others',
  sections: [
    SHARED_GENERAL_INFORMATION,
    OTHERS_GENERAL_SPECIFIC,
    OTHERS_BOOKING_DETAILS,
    OTHERS_OPTIONAL_INTERNAL,
  ],
};

export const BOOKING_SCHEMA_MAP: Record<ServiceType, ServiceSchema> = {
  Brokerage: BROKERAGE_SCHEMA,
  Forwarding: FORWARDING_SCHEMA,
  Trucking: TRUCKING_SCHEMA,
  'Marine Insurance': MARINE_INSURANCE_SCHEMA,
  Others: OTHERS_SCHEMA,
};

export function getServiceSchema(serviceType: string): ServiceSchema | undefined {
  return BOOKING_SCHEMA_MAP[serviceType as ServiceType];
}
