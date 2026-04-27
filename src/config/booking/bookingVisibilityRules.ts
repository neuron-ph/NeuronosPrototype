import type {
  BookingFormContext,
  VisibilityCondition,
  FieldDef,
  SectionDef,
} from './bookingFieldTypes';
import { getOptionKeyOptions } from './bookingFieldOptions';

export function evaluateCondition(cond: VisibilityCondition, ctx: BookingFormContext): boolean {
  const val = ctx[cond.field] ?? '';
  switch (cond.op) {
    case 'eq':  return val === cond.value;
    case 'neq': return val !== cond.value;
    case 'in':  return Array.isArray(cond.value) ? cond.value.includes(val) : val === cond.value;
    case 'nin': return Array.isArray(cond.value) ? !cond.value.includes(val) : val !== cond.value;
    default:    return true;
  }
}

function allMatch(conditions: VisibilityCondition[], ctx: BookingFormContext): boolean {
  return conditions.every(c => evaluateCondition(c, ctx));
}

export function isFieldVisible(field: FieldDef, ctx: BookingFormContext): boolean {
  if (!field.showWhen?.length) return true;
  return allMatch(field.showWhen, ctx);
}

export function isSectionVisible(section: SectionDef, ctx: BookingFormContext): boolean {
  if (!section.showWhen?.length) return true;
  return allMatch(section.showWhen, ctx);
}

// Returns the first matching dynamic label, or falls back to field.label
export function resolveLabel(field: FieldDef, ctx: BookingFormContext): string {
  if (!field.dynamicLabels?.length) return field.label;
  for (const dl of field.dynamicLabels) {
    if (allMatch(dl.when, ctx)) return dl.label;
  }
  return field.label;
}

export function getVisibleFields(section: SectionDef, ctx: BookingFormContext): FieldDef[] {
  return section.fields.filter(f => isFieldVisible(f, ctx));
}

export function getVisibleSections(sections: SectionDef[], ctx: BookingFormContext): SectionDef[] {
  return sections.filter(s => isSectionVisible(s, ctx));
}

/**
 * Returns whether a field is required in the current context.
 *
 * - 'yes'         — required whenever the field is visible
 * - 'no'          — never required
 * - 'conditional' — required only when requiredWhen conditions all match;
 *                   if requiredWhen is absent, the field is NOT required
 *                   (avoids blocking create forms with optional enrichment fields)
 */
export function isFieldRequired(field: FieldDef, ctx: BookingFormContext): boolean {
  if (field.required === 'yes') return isFieldVisible(field, ctx);
  if (field.required === 'no') return false;
  // 'conditional': only required when explicit requiredWhen conditions match
  if (!field.requiredWhen?.length) return false;
  return allMatch(field.requiredWhen, ctx);
}

// Returns resolved option list, respecting per-service overrides
export function resolveOptions(field: FieldDef, ctx: BookingFormContext): string[] {
  if (field.optionsByService?.[ctx.service_type as never]) {
    return field.optionsByService[ctx.service_type as never]!;
  }
  const keyedOptions = getOptionKeyOptions(field.optionKey, ctx.service_type);
  if (keyedOptions.length > 0) return keyedOptions;
  return field.options ?? [];
}
