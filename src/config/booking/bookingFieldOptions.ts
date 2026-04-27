import type { ServiceType } from './bookingFieldTypes';

export const SERVICE_STATUS_OPTIONS: Record<ServiceType, string[]> = {
  Brokerage: ['Draft', 'Waiting for Arrival', 'Ongoing', 'Delivered', 'Billed', 'Paid', 'Audited', 'Cancelled'],
  Forwarding: ['Draft', 'Ongoing', 'In Transit', 'Delivered', 'Completed', 'Billed', 'Paid', 'Cancelled'],
  Trucking: ['Draft', 'Ongoing', 'Delivered', 'Empty Return', 'Liquidated', 'Billed', 'Paid', 'Cancelled'],
  'Marine Insurance': ['Draft', 'Ongoing', 'Issued', 'Billed', 'Paid', 'Cancelled'],
  Others: ['Draft', 'Ongoing', 'Completed', 'Billed', 'Paid', 'Cancelled'],
};

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

export const SERVICE_CATALOG_OPTIONS: Record<ServiceType, string[]> = {
  Brokerage: [
    'Customs Brokerage',
    'Import Brokerage',
    'Export Brokerage',
    'All-Inclusive Brokerage',
    'Documentation',
    'Permit Processing',
  ],
  Forwarding: [
    'Freight Forwarding',
    'Import Forwarding',
    'Export Forwarding',
    'FCL Forwarding',
    'LCL Forwarding',
    'Air Freight Forwarding',
    'Door-to-Door Forwarding',
  ],
  Trucking: [
    'Container Trucking',
    'Loose Cargo Trucking',
    'Pull-out',
    'Delivery',
    'Empty Return',
    'Domestic Trucking',
  ],
  'Marine Insurance': [
    'Marine Cargo Insurance',
    'Policy Issuance',
    'Certificate Issuance',
    'Claims Assistance',
  ],
  Others: [
    'Other Services',
    'Documentation',
    'Permit Processing',
    'Warehousing',
    'Special Handling',
  ],
};

export const SUB_SERVICE_CATALOG_OPTIONS: Partial<Record<ServiceType, string[]>> = {
  Brokerage: [
    'Customs Clearance',
    'Duties and Taxes Processing',
    'Examination Coordination',
    'Permit Coordination',
    'Delivery Coordination',
    'PEZA Processing',
  ],
  Forwarding: [
    'Origin Handling',
    'Destination Handling',
    'Consolidation',
    'Pickup',
    'Delivery',
    'Documentation',
  ],
};

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

  const typedService = serviceType as ServiceType;
  if (optionKey === 'service_catalog') {
    return SERVICE_CATALOG_OPTIONS[typedService] ?? [];
  }

  if (optionKey === 'sub_service_catalog') {
    return SUB_SERVICE_CATALOG_OPTIONS[typedService] ?? [];
  }

  if (optionKey === 'status') {
    return getStatusOptions(serviceType);
  }

  return [];
}
