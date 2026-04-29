import React from 'react';
import { Lock } from 'lucide-react';
import { BookingFieldRenderer } from './BookingFieldRenderer';
import { getVisibleFields, resolveLabel, isFieldRequired } from '../../../config/booking/bookingVisibilityRules';
import type { SectionDef, BookingFormContext } from '../../../config/booking/bookingFieldTypes';
import type { ValidationErrors } from './bookingFormValidation';

// Controls that should span the full 3-column grid (too wide for a single column)
const FULL_WIDTH_CONTROLS = new Set([
  'textarea', 'repeater', 'multi-select', 'multi-value', 'multi-profile-lookup',
]);

// SidePanel defaults to zIndexBase 1100 and renders the panel at 1110.
// Booking field overlays are portaled to document.body, so they must sit
// above the panel rather than inside the page stack.
const BOOKING_SHEET_DROPDOWN_Z_INDEX = 1125;

interface Props {
  section: SectionDef;
  formState: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  ctx: BookingFormContext;
  errors?: ValidationErrors;
  disabled?: boolean;
  resolvedOptions?: Record<string, string[]>;
  /** DB-backed catalog options forwarded to BookingFieldRenderer (service_catalog, sub_service_catalog). */
  catalogOptions?: Record<string, string[]>;
  /** Rendered on the right side of the section header — used for Edit/Save/Cancel controls */
  headerAction?: React.ReactNode;
  /** When true, renders as a borderless sheet slice (no card chrome). Default: false. */
  sheet?: boolean;
  requiredFieldKeys?: readonly string[];
}

export function BookingSectionRenderer({
  section,
  formState,
  onChange,
  ctx,
  errors = {},
  disabled,
  resolvedOptions,
  catalogOptions,
  headerAction,
  sheet = false,
  requiredFieldKeys,
}: Props) {
  const visibleFields = getVisibleFields(section, ctx).filter(
    f => f.control !== 'team-assignment',
  );
  const requiredFieldOverride = requiredFieldKeys ? new Set(requiredFieldKeys) : null;

  if (visibleFields.length === 0) return null;

  if (sheet) {
    return (
      <div style={{ backgroundColor: 'var(--theme-bg-surface)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px 0',
          }}
        >
          <h3
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--neuron-ink-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              margin: 0,
            }}
          >
            {section.title}
          </h3>
          {headerAction && <div>{headerAction}</div>}
        </div>
        <div
          style={{
            padding: '16px 24px 24px',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px 20px',
            alignItems: 'start',
          }}
        >
          {visibleFields.map(field => {
            const label = resolveLabel(field, ctx);
            const required = requiredFieldOverride
              ? requiredFieldOverride.has(field.key)
              : isFieldRequired(field, ctx);
            const error = errors[field.key];
            const isFullWidth = FULL_WIDTH_CONTROLS.has(field.control);
            const fieldWithResolvedOptions =
              resolvedOptions && field.optionKey && resolvedOptions[field.optionKey]
                ? { ...field, options: resolvedOptions[field.optionKey] }
                : field;

            // Tier-based label style derived from schema metadata
            const isTertiary = field.control === 'autofill-readonly' || field.required === 'no';
            const isPrimary = !isTertiary && field.required === 'yes';
            const labelStyle: React.CSSProperties = isTertiary
              ? { fontSize: '12px', fontWeight: 400, color: 'var(--neuron-ink-muted)' }
              : isPrimary
                ? { fontSize: '13px', fontWeight: 600, color: 'var(--neuron-ink-base)' }
                : { fontSize: '13px', fontWeight: 500, color: 'var(--neuron-ink-base)' };

            return (
              <div key={field.key} style={{ gridColumn: isFullWidth ? 'span 3' : undefined }}>
                <label
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    marginBottom: '6px',
                    ...labelStyle,
                  }}
                >
                  {label}
                  {required && <span style={{ color: 'var(--theme-status-danger-fg)' }}>*</span>}
                  {disabled && <Lock size={11} color="var(--theme-text-muted)" style={{ flexShrink: 0, marginTop: 1 }} />}
                </label>
                <BookingFieldRenderer
                  field={fieldWithResolvedOptions}
                  value={formState[field.key]}
                  onChange={onChange}
                  ctx={ctx}
                  error={error}
                  disabled={disabled}
                  catalogOptions={catalogOptions}
                  portalZIndex={BOOKING_SHEET_DROPDOWN_Z_INDEX}
                />
                {error && (
                  <p style={{ fontSize: '12px', color: 'var(--theme-status-danger-fg)', marginTop: '4px' }}>
                    {error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--theme-bg-surface)',
        border: '1px solid var(--neuron-ui-border)',
        borderRadius: '8px',
        marginBottom: '16px',
        overflow: 'hidden',
      }}
    >
      {/* Section header — matches old EditableSectionCard style */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--neuron-ui-border)',
        }}
      >
        <h3
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--theme-action-primary-bg)',
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
            margin: 0,
          }}
        >
          {section.title}
        </h3>
        {headerAction && <div>{headerAction}</div>}
      </div>

      {/* Fields — 3-column responsive grid; full-width controls span all columns */}
      <div
        style={{
          padding: '20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px 20px',
          alignItems: 'start',
        }}
      >
        {visibleFields.map(field => {
          const label = resolveLabel(field, ctx);
          const required = requiredFieldOverride
            ? requiredFieldOverride.has(field.key)
            : isFieldRequired(field, ctx);
          const error = errors[field.key];
          const isFullWidth = FULL_WIDTH_CONTROLS.has(field.control);
          const fieldWithResolvedOptions =
            resolvedOptions && field.optionKey && resolvedOptions[field.optionKey]
              ? { ...field, options: resolvedOptions[field.optionKey] }
              : field;

          return (
            <div
              key={field.key}
              style={{ gridColumn: isFullWidth ? 'span 3' : undefined }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--neuron-ink-base)',
                  marginBottom: '6px',
                }}
              >
                {label}
                {required && (
                  <span style={{ color: 'var(--theme-status-danger-fg)' }}>*</span>
                )}
                {disabled && (
                  <Lock size={11} color="var(--theme-text-muted)" style={{ flexShrink: 0 }} />
                )}
              </label>

              <BookingFieldRenderer
                field={fieldWithResolvedOptions}
                value={formState[field.key]}
                onChange={onChange}
                ctx={ctx}
                error={error}
                disabled={disabled}
                catalogOptions={catalogOptions}
                portalZIndex={sheet ? BOOKING_SHEET_DROPDOWN_Z_INDEX : undefined}
              />

              {error && (
                <p style={{ fontSize: '12px', color: 'var(--theme-status-danger-fg)', marginTop: '4px' }}>
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
