import React from 'react';
import { BookingSectionRenderer } from './BookingSectionRenderer';
import type { BookingFormContext, SectionDef } from '../../../config/booking/bookingFieldTypes';
import type { ValidationErrors } from './bookingFormValidation';

interface Props {
  title: string;
  sections: SectionDef[];
  formState: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  ctx: BookingFormContext;
  errors?: ValidationErrors;
  disabled?: boolean;
  resolvedOptions?: Record<string, string[]>;
  catalogOptions?: Record<string, string[]>;
  headerAction?: React.ReactNode;
  requiredFieldKeys?: readonly string[];
}

export function BookingSectionGroupCard({
  title,
  sections,
  formState,
  onChange,
  ctx,
  errors = {},
  disabled,
  resolvedOptions,
  catalogOptions,
  headerAction,
  requiredFieldKeys,
}: Props) {
  if (sections.length === 0) return null;

  return (
    <div
      style={{
        backgroundColor: 'var(--theme-bg-surface)',
        border: '1px solid var(--neuron-ui-border)',
        borderRadius: '8px',
        overflow: 'hidden',
        marginBottom: '16px',
      }}
    >
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
          {title}
        </h3>
        {headerAction && <div>{headerAction}</div>}
      </div>

      {sections.map((section, idx) => (
        <div
          key={section.key}
          style={{
            borderBottom:
              idx < sections.length - 1
                ? '1px solid var(--neuron-ui-border)'
                : undefined,
          }}
        >
          <BookingSectionRenderer
            section={section}
            formState={formState}
            onChange={onChange}
            ctx={ctx}
            errors={errors}
            disabled={disabled}
            resolvedOptions={resolvedOptions}
            catalogOptions={catalogOptions}
            requiredFieldKeys={requiredFieldKeys}
            sheet
          />
        </div>
      ))}
    </div>
  );
}
