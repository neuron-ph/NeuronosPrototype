// ---------------------------------------------------------------------------
// Admin Profiling section metadata — drives the generic <ProfileSection>
// component. Each profileRegistry entry that should appear as a flat section in
// the Admin → Profiling UI declares an `admin` block of this shape.
// ---------------------------------------------------------------------------

export type ProfileColumnType = 'text' | 'badge' | 'pills' | 'monospace';

export type ProfileColumnDef = {
  key: string;
  header: string;
  width?: string;
  type?: ProfileColumnType;
  align?: 'left' | 'right' | 'center';
};

export type ProfileFormControl =
  | 'text'
  | 'textarea'
  | 'number'
  | 'dropdown'
  | 'multi-checkbox'
  | 'tag-list';

export type ProfileFormFieldDef = {
  key: string;
  label: string;
  control: ProfileFormControl;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  maxLength?: number;
  uppercase?: boolean;
  helpText?: string;
};

export type ProfileAdminConfig = {
  label: string;
  pluralLabel: string;
  description: string;
  /**
   * Filter applied to the source table. Values may be scalar (uses .eq) or
   * arrays (uses .in). e.g. { kind: 'port' } or { role_scope: ['consignee', 'both'] }
   */
  filter?: Record<string, unknown | unknown[]>;
  /**
   * For sources that store tags in an array column. e.g. service_providers
   * uses { booking_profile_tags: 'carrier' } to match rows tagged 'carrier'.
   */
  arrayContainsFilter?: Record<string, string>;
  /** Default values applied to inserts (combined with filter). */
  insertDefaults?: Record<string, unknown>;
  columns: ProfileColumnDef[];
  formFields: ProfileFormFieldDef[];
  orderBy?: { column: string; ascending?: boolean };
};
