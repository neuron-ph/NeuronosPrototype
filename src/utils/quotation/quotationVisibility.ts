import { QUOTATION_SCHEMA_MAP } from '../../config/quotation/quotationScreenSchema';
import type { QuotationFormContext, QuotationVisibilityCondition } from '../../config/quotation/quotationFieldTypes';
import type { ServiceType } from '../../config/booking/bookingFieldTypes';

// ---------------------------------------------------------------------------
// Context builders — map each form's raw state to QuotationFormContext
// ---------------------------------------------------------------------------

// Normalize the mode value written by the quotation forms ('AIR') to the
// canonical value used by the schema ('Air Freight'). Phase 3 normalization
// will standardize stored values; Phase 2 just needs visibility to work.
function normalizeMode(mode?: string): string {
  if (!mode) return '';
  if (mode === 'AIR') return 'Air Freight';
  return mode;
}

export function buildBrokerageContext(data: {
  brokerageType?: string;
  mode?: string;
}): QuotationFormContext {
  return {
    service_type: 'Brokerage',
    brokerage_type: data.brokerageType ?? '',
    incoterms: '',
    mode: normalizeMode(data.mode),
  };
}

export function buildForwardingContext(data: {
  incoterms?: string;
  mode?: string;
}): QuotationFormContext {
  return {
    service_type: 'Forwarding',
    brokerage_type: '',
    incoterms: data.incoterms ?? '',
    mode: normalizeMode(data.mode),
  };
}

export function buildTruckingContext(): QuotationFormContext {
  return { service_type: 'Trucking', brokerage_type: '', incoterms: '', mode: '' };
}

export function buildMarineInsuranceContext(): QuotationFormContext {
  return { service_type: 'Marine Insurance', brokerage_type: '', incoterms: '', mode: '' };
}

export function buildOthersContext(): QuotationFormContext {
  return { service_type: 'Others', brokerage_type: '', incoterms: '', mode: '' };
}

// ---------------------------------------------------------------------------
// Visibility evaluators — keyed against the quotation schema
// ---------------------------------------------------------------------------

function evaluateCondition(cond: QuotationVisibilityCondition, ctx: QuotationFormContext): boolean {
  const ctxValue = ctx[cond.field] ?? '';
  switch (cond.op) {
    case 'eq':  return ctxValue === cond.value;
    case 'neq': return ctxValue !== cond.value;
    case 'in':  return Array.isArray(cond.value) && cond.value.includes(ctxValue);
    case 'nin': return Array.isArray(cond.value) && !cond.value.includes(ctxValue);
    default: return true;
  }
}

/**
 * Returns true when the named field should be visible according to the
 * quotation schema's showWhen rules for the given service and context.
 */
export function isFieldVisible(
  fieldKey: string,
  serviceType: ServiceType,
  ctx: QuotationFormContext,
): boolean {
  const schema = QUOTATION_SCHEMA_MAP[serviceType];
  for (const section of schema.sections) {
    const field = section.fields.find(f => f.key === fieldKey);
    if (field) {
      if (!field.showWhen) return true;
      return field.showWhen.every(cond => evaluateCondition(cond, ctx));
    }
  }
  return false;
}

/**
 * Returns true when the named section should be visible according to the
 * quotation schema's showWhen rules for the given service and context.
 */
export function isSectionVisible(
  sectionKey: string,
  serviceType: ServiceType,
  ctx: QuotationFormContext,
): boolean {
  const schema = QUOTATION_SCHEMA_MAP[serviceType];
  const section = schema.sections.find(s => s.key === sectionKey);
  if (!section) return false;
  if (!section.showWhen) return true;
  return section.showWhen.every(cond => evaluateCondition(cond, ctx));
}
