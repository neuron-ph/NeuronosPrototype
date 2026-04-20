import { forwardRef, useRef, useState } from "react";
import type { FocusEvent, InputHTMLAttributes } from "react";

interface NaturalNumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  value: number;
  onChange: (value: number) => void;
  decimals?: number;
  formatOnBlur?: boolean;
  allowNegative?: boolean;
  emptyValue?: number;
}

export function isAllowedNumberDraft(value: string, allowNegative = false) {
  const pattern = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
  return pattern.test(value);
}

export function commitNumberDraft(value: string, emptyValue = 0) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : emptyValue;
}

function formatValue(value: number, decimals: number, formatOnBlur: boolean) {
  if (!Number.isFinite(value)) return "";
  return formatOnBlur ? value.toFixed(decimals) : String(value);
}

export const NaturalNumberInput = forwardRef<HTMLInputElement, NaturalNumberInputProps>(
function NaturalNumberInput({
  value,
  onChange,
  decimals = 2,
  formatOnBlur = false,
  allowNegative = false,
  emptyValue = 0,
  onFocus,
  onBlur,
  inputMode = "decimal",
  ...props
}: NaturalNumberInputProps, ref) {
  const [draft, setDraft] = useState<string | null>(null);
  const latestValueRef = useRef(value);
  latestValueRef.current = value;

  const displayValue =
    draft !== null ? draft : formatValue(latestValueRef.current, decimals, formatOnBlur);

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setDraft(Number.isFinite(value) ? String(value) : "");
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (draft !== null) {
      onChange(commitNumberDraft(draft, emptyValue));
      setDraft(null);
    }
    onBlur?.(event);
  };

  return (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode={inputMode}
      value={displayValue}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={(event) => {
        const nextDraft = event.target.value;
        if (!isAllowedNumberDraft(nextDraft, allowNegative)) return;

        setDraft(nextDraft);
        const parsed = parseFloat(nextDraft);
        if (Number.isFinite(parsed)) {
          onChange(parsed);
        }
      }}
    />
  );
});
