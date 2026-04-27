export type ControlType =
  | 'autofill-readonly'
  | 'free-text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'dropdown'
  | 'segmented'
  | 'multi-select'
  | 'boolean-dropdown'
  | 'multi-value'
  | 'repeater'
  | 'profile-lookup'         // single-select profile combobox (saves profile_id + label snapshot)
  | 'multi-profile-lookup'   // multi-select profile combobox (saves array of {profile_id, label_snapshot})
  | 'option-lookup'          // admin-configurable option list — saves string value; renders as dropdown until lookup tables exist
  | 'team-assignment';       // composite manager/supervisor/handler block

export type StorageTarget = 'top-level' | 'details';

// required: 'yes'         — always required when the field is visible
// required: 'no'          — never required (optional enrichment)
// required: 'conditional' — required only when `requiredWhen` conditions all match;
//                           if `requiredWhen` is absent the field is treated as NOT required
export type RequiredRule = 'yes' | 'no' | 'conditional';

export type ServiceType =
  | 'Brokerage'
  | 'Forwarding'
  | 'Trucking'
  | 'Marine Insurance'
  | 'Others';

// The context values that drive visibility and label switching
export type BookingFormContext = {
  service_type: string;
  movement_type: string;
  mode: string;
  incoterms: string;
  status: string;
};

// A single visibility predicate. Multiple conditions in showWhen are AND'd together.
// Use op:'in' to express OR over values of the same field.
export type VisibilityCondition = {
  field: keyof BookingFormContext;
  op: 'eq' | 'in' | 'neq' | 'nin';
  value: string | string[];
};

// First matching entry wins; fall back to field.label
export type DynamicLabel = {
  when: VisibilityCondition[];
  label: string;
};

// Column definition for repeater fields — drives both the header and new-row shape
export type RepeaterColumn = {
  key: string;
  label: string;
  control?: 'free-text' | 'dropdown' | 'date' | 'number';
  options?: string[];
};

export type FieldDef = {
  key: string;
  label: string;
  control: ControlType;
  required: RequiredRule;
  // Conditions that make this field required (only meaningful when required = 'conditional')
  requiredWhen?: VisibilityCondition[];
  storage: StorageTarget;
  storageKey?: string;                               // top-level column name when it differs from key
  profileType?: string;                              // profile-lookup: signals which master-data entity to search
  optionKey?: string;                                // option-lookup / dropdown: named option set from bookingFieldOptions
  options?: string[];                                // inline closed option list
  optionsByService?: Partial<Record<ServiceType, string[]>>; // per-service option overrides
  unit?: string;                                     // label shown beside a number input
  showWhen?: VisibilityCondition[];                  // ALL must be true; absent = always visible
  dynamicLabels?: DynamicLabel[];                    // label switches driven by context
  repeaterColumns?: RepeaterColumn[];                // column schema for repeater controls
};

export type SectionDef = {
  key: string;
  title: string;
  fields: FieldDef[];
  showWhen?: VisibilityCondition[];
  displayGroup?: 'general' | 'specific';
};

export type ServiceSchema = {
  serviceType: ServiceType;
  sections: SectionDef[];
};
