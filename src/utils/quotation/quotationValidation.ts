import { QUOTATION_SCHEMA_MAP } from '../../config/quotation/quotationScreenSchema';
import type { QuotationFormContext, QuotationFieldDef } from '../../config/quotation/quotationFieldTypes';
import type { ServiceType } from '../../config/booking/bookingFieldTypes';

export type QuotationValidationError = {
  fieldKey: string;
  label: string;
  message: string;
};

export type QuotationValidationResult = {
  valid: boolean;
  errors: QuotationValidationError[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function evaluateConditions(
  conditions: NonNullable<QuotationFieldDef['showWhen']>,
  ctx: QuotationFormContext,
): boolean {
  return conditions.every(cond => {
    const ctxValue = ctx[cond.field] ?? '';
    switch (cond.op) {
      case 'eq':  return ctxValue === cond.value;
      case 'neq': return ctxValue !== cond.value;
      case 'in':  return Array.isArray(cond.value) && cond.value.includes(ctxValue);
      case 'nin': return Array.isArray(cond.value) && !cond.value.includes(ctxValue);
      default: return true;
    }
  });
}

/**
 * Looks up a field's value from form data using the canonical key first, then
 * any declared legacy aliases. Works whether the form state uses camelCase or
 * canonical snake_case keys.
 */
function getFieldValue(
  formData: Record<string, unknown>,
  field: QuotationFieldDef,
): unknown {
  if (field.key in formData) return formData[field.key];
  if (field.legacyKeys) {
    for (const alias of field.legacyKeys) {
      if (alias in formData) return formData[alias];
    }
  }
  return undefined;
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function isRequired(field: QuotationFieldDef, ctx: QuotationFormContext): boolean {
  if (field.required === 'yes') return true;
  if (field.required === 'no') return false;
  // 'conditional': required when requiredWhen conditions match
  if (field.required === 'conditional') {
    if (!field.requiredWhen || field.requiredWhen.length === 0) return false;
    return evaluateConditions(field.requiredWhen, ctx);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates form data for a single service against the quotation schema.
 *
 * formData: the raw service form state (may use camelCase or canonical keys).
 * ctx: the QuotationFormContext for visibility evaluation.
 *
 * Only fields that are both visible AND required produce errors.
 */
export function validateQuotation(
  serviceType: ServiceType,
  formData: Record<string, unknown>,
  ctx: QuotationFormContext,
): QuotationValidationResult {
  const schema = QUOTATION_SCHEMA_MAP[serviceType];
  const errors: QuotationValidationError[] = [];

  for (const section of schema.sections) {
    // The general_information section is validated by the builder (customerName, date, etc.)
    // Skip it here to avoid duplicate errors.
    if (section.key === 'general_information') continue;
    // Skip sections that aren't visible
    if (section.showWhen && !evaluateConditions(section.showWhen, ctx)) continue;

    for (const field of section.fields) {
      // Skip fields that aren't visible
      if (field.showWhen && !evaluateConditions(field.showWhen, ctx)) continue;
      // Skip non-required fields
      if (!isRequired(field, ctx)) continue;
      // Check if value is present
      if (isEmpty(getFieldValue(formData, field))) {
        errors.push({
          fieldKey: field.key,
          label: field.label,
          message: `${field.label} is required`,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
