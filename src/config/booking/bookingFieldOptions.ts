import type { ServiceType } from './bookingFieldTypes';
import type { ExecutionStatus } from '../../types/operations';

export const SERVICE_STATUS_OPTIONS: Record<ServiceType, string[]> = {
  Brokerage: ['Draft', 'Waiting for Arrival', 'Ongoing', 'Delivered', 'Billed', 'Paid', 'Audited', 'Cancelled'],
  Forwarding: ['Draft', 'Ongoing', 'In Transit', 'Delivered', 'Completed', 'Billed', 'Paid', 'Cancelled'],
  Trucking: ['Draft', 'Ongoing', 'Delivered', 'Empty Return', 'Liquidated', 'Billed', 'Paid', 'Cancelled'],
  'Marine Insurance': ['Draft', 'Ongoing', 'Issued', 'Billed', 'Paid', 'Cancelled'],
  Others: ['Draft', 'Ongoing', 'Completed', 'Billed', 'Paid', 'Cancelled'],
};

/**
 * Which list tab a booking status belongs to.
 *
 * Colocated with SERVICE_STATUS_OPTIONS on purpose: the tabs used to filter on
 * hardcoded strings ("In Progress", "Completed") that no service actually
 * offers, so ~92% of bookings — including every submitted one, which is written
 * as "Created" — matched no tab at all. Keeping the vocabulary and its buckets
 * in one file is what stops that drifting again.
 *
 * Every ExecutionStatus must appear in exactly one bucket.
 * `bookingStatusBuckets.test.ts` fails if one is added and not bucketed.
 */
export const BOOKING_STATUS_BUCKETS = {
  draft: ['Draft'],
  inProgress: [
    'Created',
    'Pending',
    'Confirmed',
    'In Progress',
    'On Hold',
    'Waiting for Arrival',
    'Ongoing',
    'In Transit',
    'Empty Return',
    'Issued',
  ],
  completed: ['Delivered', 'Completed', 'Liquidated', 'Billed', 'Paid', 'Audited'],
  archived: ['Cancelled', 'Closed'],
} as const satisfies Record<string, readonly ExecutionStatus[]>;

export type BookingStatusBucket = keyof typeof BOOKING_STATUS_BUCKETS;

/**
 * Statuses that are NOT "in progress".
 *
 * The In Progress tab filters by exclusion rather than inclusion, so a status
 * that exists but isn't listed above still shows up somewhere instead of
 * vanishing. That matters because `profile_service_statuses` is admin-editable
 * through Profiling — a status can be added at runtime that this file has never
 * heard of, which is exactly how "Created" came to match no tab at all.
 */
export const BOOKING_STATUS_NOT_IN_PROGRESS: readonly string[] = [
  ...BOOKING_STATUS_BUCKETS.draft,
  ...BOOKING_STATUS_BUCKETS.completed,
  ...BOOKING_STATUS_BUCKETS.archived,
];

export const MODE_OPTIONS = ['FCL', 'LCL', 'Air Freight'];
export const MOVEMENT_OPTIONS = ['Import', 'Export'];
export const MOVEMENT_OPTIONS_WITH_DOMESTIC = ['Import', 'Export', 'Domestic'];
export const INCOTERMS_OPTIONS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DDU', 'DDP'];
export const CARGO_TYPE_OPTIONS = ['Dry', 'Reefer', 'Breakbulk', 'RORO', 'Dangerous Goods', 'Perishables', 'Other'];
export const CARGO_NATURE_OPTIONS = ['General Cargo', 'Dangerous Goods', 'Perishables', 'Valuables', 'Temperature Controlled'];
export const BROKERAGE_TYPE_OPTIONS = ['Standard', 'All-Inclusive', 'Non-Regular'];
export const CUSTOMS_ENTRY_OPTIONS = ['Formal', 'Informal'];
export const CUSTOMS_ENTRY_PROCEDURE_OPTIONS = ['Consumption', 'PEZA', 'Warehousing'];
export const FORWARDING_CPE_CODE_OPTIONS = ['23', '24'];
export const TRUCK_TYPE_OPTIONS = ['4W', '6W', '10W', '20ft', '40ft', '45ft'];
export const SELECTIVITY_COLOR_OPTIONS = ['Yellow', 'Orange', 'Red'];
export const BOOLEAN_OPTIONS = ['Yes', 'No'];
export const EXAMINATION_OPTIONS = ['X-ray', 'Spotcheck', 'DEA'];
export const MAIN_OPERATION_SERVICE_OPTIONS: ServiceType[] = [
  'Brokerage',
  'Forwarding',
  'Trucking',
  'Marine Insurance',
  'Others',
];

export function getStatusOptions(serviceType: string): string[] {
  return SERVICE_STATUS_OPTIONS[serviceType as ServiceType] ?? [];
}

export function getMovementOptions(serviceType: string): string[] {
  return (serviceType === 'Trucking' || serviceType === 'Forwarding')
    ? MOVEMENT_OPTIONS_WITH_DOMESTIC
    : MOVEMENT_OPTIONS;
}

export function getOptionKeyOptions(optionKey: string | undefined, serviceType: string): string[] {
  if (!optionKey) return [];

  if (optionKey === 'status') {
    return getStatusOptions(serviceType);
  }

  if (optionKey === 'operation_services') {
    return MAIN_OPERATION_SERVICE_OPTIONS;
  }

  return [];
}
