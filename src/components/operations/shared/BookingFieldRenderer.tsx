import React, { useRef, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { CustomDropdown } from '../../bd/CustomDropdown';
import { CustomDatePicker } from '../../common/CustomDatePicker';
import { SegmentedToggle } from '../../ui/SegmentedToggle';
import { ProfileLookupCombobox } from '../../shared/profiles/ProfileLookupCombobox';
import { ProfileMultiLookupCombobox } from '../../shared/profiles/ProfileMultiLookupCombobox';
import { ConsigneePicker } from '../../shared/ConsigneePicker';
import {
  isFieldRequired,
  resolveLabel,
  resolveOptions,
} from '../../../config/booking/bookingVisibilityRules';
import type { FieldDef, BookingFormContext, RepeaterColumn } from '../../../config/booking/bookingFieldTypes';
import type { ProfileSelectionValue } from '../../../types/profiles';
import { withLegacyStringOption } from '../../../utils/forms/legacyOption';
import { useAllEnumOptions, useServiceStatusOptions, useEnumOptions } from '../../../hooks/useEnumOptions';

const INPUT_STYLE: React.CSSProperties = {
  border: '1px solid var(--theme-border-default)',
  color: 'var(--neuron-ink-primary)',
  backgroundColor: 'var(--theme-bg-surface)',
};

const READONLY_STYLE: React.CSSProperties = {
  padding: '10px 14px',
  backgroundColor: 'var(--theme-bg-surface-subtle)',
  border: '1px solid var(--theme-border-default)',
  borderRadius: '6px',
  fontSize: '13px',
  color: 'var(--neuron-ink-base)',
  cursor: 'not-allowed',
  minHeight: '40px',
};

function getDisabledValueStyle(field: FieldDef): React.CSSProperties {
  if (field.control === 'autofill-readonly' || field.required === 'no') {
    return { color: 'var(--neuron-ink-muted)' };
  }
  if (field.required === 'yes') {
    return {
      fontWeight: 500,
      color: 'var(--neuron-ink-primary)',
      backgroundColor: 'var(--theme-bg-surface-subtle)',
    };
  }
  // conditional — current treatment, no override
  return {};
}

interface Props {
  field: FieldDef;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  ctx: BookingFormContext;
  error?: string;
  disabled?: boolean;
  portalZIndex?: number;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MultiValueInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    const trimmed = draft.trim();
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setDraft('');
  }

  function remove(item: string) {
    onChange(value.filter(v => v !== item));
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: value.length ? '8px' : 0, flexWrap: 'wrap' }}>
        {value.map(item => (
          <span
            key={item}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              fontSize: '12px',
              backgroundColor: 'var(--theme-bg-page)',
              border: '1px solid var(--theme-border-default)',
              borderRadius: '4px',
              color: 'var(--neuron-ink-base)',
            }}
          >
            {item}
            {!disabled && (
              <button type="button" onClick={() => remove(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'var(--theme-text-muted)' }}>
                <X size={11} />
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder={placeholder ?? 'Type and press Enter'}
            className="flex-1 px-3.5 py-2.5 rounded-lg text-[13px]"
            style={INPUT_STYLE}
          />
          <button
            type="button"
            onClick={add}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '0 12px', fontSize: '12px', fontWeight: 500,
              backgroundColor: 'var(--theme-bg-page)',
              border: '1px solid var(--theme-border-default)',
              borderRadius: '6px', cursor: 'pointer',
              color: 'var(--neuron-ink-base)',
            }}
          >
            <Plus size={13} /> Add
          </button>
        </div>
      )}
    </div>
  );
}

function MultiSelectInput({
  options,
  value,
  onChange,
  disabled,
  placeholder,
  portalZIndex,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  portalZIndex?: number;
}) {
  const displayOptions = Array.from(new Set([...options, ...value]));
  const dropdownOptions = displayOptions.map(opt => ({ value: opt, label: opt }));

  return (
    <CustomDropdown
      value=""
      options={dropdownOptions}
      onChange={() => { /* no-op in multi-select mode */ }}
      multiSelect
      multiValue={value}
      onMultiChange={onChange}
      placeholder={placeholder ?? 'Select...'}
      disabled={disabled}
      fullWidth
      portalZIndex={portalZIndex}
    />
  );
}

function GenericRepeater({
  columns,
  value,
  onChange,
  disabled,
  serviceType,
}: {
  columns: RepeaterColumn[];
  value: Record<string, unknown>[];
  onChange: (rows: Record<string, unknown>[]) => void;
  disabled?: boolean;
  serviceType: string;
}) {
  const enumBundle = useAllEnumOptions();
  const movementForService = useEnumOptions('movement', { serviceType });
  // Build a blank row from the column schema
  function blankRow(): Record<string, unknown> {
    return Object.fromEntries(columns.map(c => [c.key, '']));
  }

  function addRow() {
    onChange([...value, blankRow()]);
  }

  function removeRow(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function updateCell(idx: number, key: string, val: string) {
    onChange(value.map((row, i) => i === idx ? { ...row, [key]: val } : row));
  }

  if (value.length === 0 && disabled) {
    return <div style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>—</div>;
  }

  // Derive columns from the first row's keys if no schema provided (legacy rows)
  const effectiveCols: RepeaterColumn[] = columns.length > 0
    ? columns
    : Object.keys(value[0] ?? {}).map(k => ({ key: k, label: k, control: 'free-text' as const }));

  return (
    <div>
      {/* Column headers */}
      {value.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${effectiveCols.length}, 1fr) 32px`, gap: '6px', marginBottom: '4px' }}>
          {effectiveCols.map(c => (
            <span key={c.key} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--theme-text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {c.label}
            </span>
          ))}
          <span />
        </div>
      )}

      {value.map((row, idx) => (
        <div key={idx} style={{ display: 'grid', gridTemplateColumns: `repeat(${effectiveCols.length}, 1fr) 32px`, gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
          {effectiveCols.map(col => {
            const cellVal = String(row[col.key] ?? '');
            const colOptions = col.optionsKind
              ? (col.optionsKind === 'movement' ? movementForService : enumBundle[col.optionsKind])
              : col.options;
            if ((col.control === 'dropdown') && colOptions?.length) {
              return (
                <CustomDropdown
                  key={col.key}
                  label=""
                  value={cellVal}
                  onChange={v => updateCell(idx, col.key, v)}
                  options={colOptions.map(o => ({ value: o, label: o }))}
                  placeholder={col.label}
                  fullWidth
                  disabled={disabled}
                />
              );
            }
            return (
              <input
                key={col.key}
                type={col.control === 'date' ? 'date' : col.control === 'number' ? 'number' : 'text'}
                value={cellVal}
                onChange={e => updateCell(idx, col.key, e.target.value)}
                placeholder={col.label}
                disabled={disabled}
                className="w-full px-3 py-2 rounded-lg text-[13px]"
                style={INPUT_STYLE}
              />
            );
          })}
          {!disabled ? (
            <button type="button" onClick={() => removeRow(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--theme-status-danger-fg)', padding: '4px' }}>
              <X size={14} />
            </button>
          ) : <span />}
        </div>
      ))}

      {!disabled && (
        <button
          type="button"
          onClick={addRow}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '6px 12px', fontSize: '12px', fontWeight: 500,
            backgroundColor: 'var(--theme-bg-page)',
            border: '1px dashed var(--theme-border-default)',
            borderRadius: '6px', cursor: 'pointer',
            color: 'var(--theme-text-muted)',
          }}
        >
          <Plus size={13} /> Add Row
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

export function BookingFieldRenderer({ field, value, onChange, ctx, error, disabled, portalZIndex }: Props) {
  const label = resolveLabel(field, ctx);
  const required = isFieldRequired(field, ctx);
  const disabledStyle = disabled ? getDisabledValueStyle(field) : {};
  const enumBundle = useAllEnumOptions();
  // Movement is service-type-scoped at the DB level (applicable_service_types[]).
  // Overlay the scoped list onto the bundle so optionsKind:'movement' fields
  // honour the Domestic-only-for-Trucking/Forwarding rule.
  const movementForService = useEnumOptions('movement', { serviceType: ctx.service_type });
  const scopedBundle = { ...enumBundle, movement: movementForService };
  const statusOptions = useServiceStatusOptions(ctx.service_type);
  const staticOptions = resolveOptions(field, ctx, { enumBundle: scopedBundle, statusOptions });

  const options = staticOptions;

  function set(val: unknown) {
    onChange(field.key, val);
  }

  const str = String(value ?? '');
  const arr = Array.isArray(value) ? value : [];

  switch (field.control) {
    case 'team-assignment':
      return null;

    case 'autofill-readonly':
      return (
        <div style={{ ...READONLY_STYLE, color: 'var(--neuron-ink-muted)' }}>
          {str || <span style={{ color: 'var(--theme-text-muted)' }}>—</span>}
        </div>
      );

    case 'textarea':
      return (
        <textarea
          value={str}
          onChange={e => set(e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder={label}
          className="w-full px-3.5 py-2.5 rounded-lg text-[13px] resize-none"
          style={{
            ...INPUT_STYLE,
            ...disabledStyle,
            ...(error ? { borderColor: 'var(--theme-status-danger-fg)' } : {}),
          }}
        />
      );

    case 'number':
      return (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input
            type="number"
            value={str}
            onChange={e => set(e.target.value)}
            disabled={disabled}
            placeholder="0"
            className="flex-1 px-3.5 py-2.5 rounded-lg text-[13px]"
            style={{
              ...INPUT_STYLE,
              ...disabledStyle,
              ...(error ? { borderColor: 'var(--theme-status-danger-fg)' } : {}),
            }}
          />
          {field.unit && (
            <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)', whiteSpace: 'nowrap' }}>
              {field.unit}
            </span>
          )}
        </div>
      );

    case 'currency':
      return (
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--theme-text-muted)' }}>
            ₱
          </span>
          <input
            type="number"
            value={str}
            onChange={e => set(e.target.value)}
            disabled={disabled}
            placeholder="0.00"
            className="w-full py-2.5 rounded-lg text-[13px]"
            style={{
              ...INPUT_STYLE,
              ...disabledStyle,
              paddingLeft: '28px',
              paddingRight: '14px',
              ...(error ? { borderColor: 'var(--theme-status-danger-fg)' } : {}),
            }}
          />
        </div>
      );

    case 'percent':
      return (
        <div style={{ position: 'relative' }}>
          <input
            type="number"
            value={str}
            onChange={e => set(e.target.value)}
            disabled={disabled}
            placeholder="0"
            className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
            style={{
              ...INPUT_STYLE,
              ...disabledStyle,
              paddingRight: '32px',
              ...(error ? { borderColor: 'var(--theme-status-danger-fg)' } : {}),
            }}
          />
          <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--theme-text-muted)' }}>
            %
          </span>
        </div>
      );

    case 'date':
      return (
        <div style={error ? { outline: `1px solid var(--theme-status-danger-fg)`, borderRadius: 8 } : undefined}>
          <CustomDatePicker
            value={str}
            onChange={v => set(v)}
            disabled={disabled}
            placeholder="Select date…"
            minWidth="100%"
          />
        </div>
      );

    case 'datetime':
      return (
        <input
          type="datetime-local"
          value={str}
          onChange={e => set(e.target.value)}
          disabled={disabled}
          className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
          style={{
            ...INPUT_STYLE,
            ...disabledStyle,
            colorScheme: 'light dark',
            ...(error ? { borderColor: 'var(--theme-status-danger-fg)' } : {}),
          }}
        />
      );

    case 'dropdown':
    case 'option-lookup':
    case 'boolean-dropdown': {
      // Append a synthetic option for legacy values not present in the schema's
      // option list. Prevents a stored value from rendering as blank and being
      // silently overwritten on save (e.g. preferential_treatment "Form A" before
      // the option set was tightened to Form E / Form D).
      const optionsWithLegacy = withLegacyStringOption(options, str);
      const dropOptions = optionsWithLegacy.map(o => ({
        value: o,
        label: !options.includes(o) ? `${o} (legacy)` : o,
      }));
      return (
        <CustomDropdown
          label=""
          value={str}
          onChange={v => set(v)}
          options={dropOptions}
          placeholder={`Select ${label}...`}
          fullWidth
          disabled={disabled}
          portalZIndex={portalZIndex}
        />
      );
    }

    case 'segmented': {
      const segOptions = options.map(o => ({ value: o, label: o }));
      return (
        <div style={{ pointerEvents: disabled ? 'none' : 'auto', opacity: disabled ? 0.6 : 1 }}>
          <SegmentedToggle
            value={str}
            onChange={v => !disabled && set(v)}
            options={segOptions}
            layoutIdPrefix={`seg-${field.key}`}
          />
        </div>
      );
    }

    case 'multi-select':
      return (
        <MultiSelectInput
          options={options}
          value={arr as string[]}
          onChange={set}
          disabled={disabled}
          placeholder={`Select ${label.toLowerCase()}...`}
          portalZIndex={portalZIndex}
        />
      );

    case 'multi-value':
      return (
        <MultiValueInput
          value={arr as string[]}
          onChange={set}
          placeholder={`Add ${label.toLowerCase()}`}
          disabled={disabled}
        />
      );

    case 'repeater':
      return (
        <GenericRepeater
          columns={field.repeaterColumns ?? []}
          value={arr as Record<string, unknown>[]}
          onChange={set}
          disabled={disabled}
          serviceType={ctx.service_type}
        />
      );

    case 'profile-lookup':
      // Consignee/shipper fields read from the per-customer `consignees` table,
      // not the global `trade_parties` adapter. The customer's saved consignees
      // are managed in the Customer profile (BD module).
      if (
        field.profileType === 'consignee_or_shipper' ||
        field.profileType === 'shipper' ||
        field.profileType === 'consignee'
      ) {
        return (
          <BookingConsigneePickerAdapter
            value={value as ProfileSelectionValue | string | null}
            customerId={ctx.customer_id ?? undefined}
            customerName={ctx.customer_name ?? undefined}
            label={label}
            onChange={set}
          />
        );
      }
      return (
        <ProfileLookupCombobox
          profileType={field.profileType ?? 'unknown'}
          value={value as ProfileSelectionValue | string | null}
          onChange={sel => set(sel)}
          disabled={disabled}
          placeholder={label}
          error={!!error}
          portalZIndex={portalZIndex}
        />
      );

    case 'multi-profile-lookup': {
      return (
        <ProfileMultiLookupCombobox
          profileType={field.profileType ?? 'unknown'}
          value={value as Array<ProfileSelectionValue | string> | null}
          onChange={sel => set(sel)}
          disabled={disabled}
          placeholder={label}
          error={!!error}
          portalZIndex={portalZIndex}
        />
      );
    }

    case 'free-text':
    default:
      return (
        <input
          type="text"
          value={str}
          onChange={e => set(e.target.value)}
          disabled={disabled}
          placeholder={label}
          className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
          style={{
            ...INPUT_STYLE,
            ...disabledStyle,
            ...(error ? { borderColor: 'var(--theme-status-danger-fg)' } : {}),
          }}
        />
      );
  }
}

export { isFieldRequired, resolveLabel };

// ---------------------------------------------------------------------------
// BookingConsigneePickerAdapter
// Bridges ConsigneePicker (which calls `onChange(name)` then
// `onConsigneeIdChange(id)` sequentially) into the form's single
// ProfileSelectionValue update. A ref captures the latest text so the
// id-callback can commit a unified value without closure staleness.
// ---------------------------------------------------------------------------
function BookingConsigneePickerAdapter({
  value,
  customerId,
  customerName,
  label,
  onChange,
}: {
  value: ProfileSelectionValue | string | null;
  customerId?: string;
  customerName?: string;
  label: string;
  onChange: (next: ProfileSelectionValue) => void;
}) {
  const sel = value && typeof value === 'object' ? value : null;
  const text = typeof value === 'string' ? value : sel?.label ?? '';
  const lastTextRef = useRef(text);
  lastTextRef.current = text;

  return (
    <ConsigneePicker
      value={text}
      customerId={customerId}
      customerName={customerName}
      placeholder={label}
      onChange={name => {
        // Capture the latest text so the id callback can commit with it.
        lastTextRef.current = name;
      }}
      onConsigneeIdChange={id => {
        onChange({
          id: id ?? null,
          label: lastTextRef.current,
          profileType: 'consignee',
          source: id ? 'linked' : 'manual',
        });
      }}
    />
  );
}
