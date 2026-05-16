// Display formatting helpers for the printable document model.
//
// All money formatting goes through `accountingCurrency.formatMoney` when a
// currency is known so PHP/USD outputs stay consistent with the rest of the
// app. For renderer-level needs (totals/cells) we expose simple helpers.

import { formatMoney } from "../accountingCurrency";
import type {
  PrintableField,
  PrintableTableColumn,
  PrintableValue,
} from "./printableDocument";

export function joinNonEmpty(
  values: Array<unknown>,
  separator: string = ", ",
): string | null {
  const cleaned = values
    .filter((v) => v !== null && v !== undefined)
    .map((v) => (typeof v === "string" ? v.trim() : v))
    .filter((v) => {
      if (typeof v === "string") return v.length > 0;
      return v !== null && v !== undefined;
    });
  if (cleaned.length === 0) return null;
  return cleaned.join(separator);
}

function humanizeValueObject(value: Record<string, unknown>): string {
  const type = value.type || value.container_type || value.size || value.name;
  const qty = value.qty ?? value.quantity ?? value.count;
  if (type && qty !== undefined && qty !== null && qty !== "") return `${qty} x ${type}`;
  if (type) return String(type);
  return Object.entries(value)
    .filter(([key, entry]) => key !== "id" && entry !== null && entry !== undefined && entry !== "")
    .map(([key, entry]) => `${key.replace(/_/g, " ")}: ${String(entry)}`)
    .join(", ");
}

function humanizePrintableValue(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return humanizeValueObject(value as Record<string, unknown>);
  }
  return String(value);
}

export function formatDateValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const str = String(value);
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) return str;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatMoneyValue(amount: number, currency?: string): string {
  if (!Number.isFinite(amount)) return "";
  if (currency) return formatMoney(amount, currency);
  return amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPercentValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  // Accept a ratio (0..1) or already-a-percent number > 1
  const pct = value <= 1 && value >= -1 ? value * 100 : value;
  return `${pct.toFixed(2)}%`;
}

export function formatNumberValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString("en-PH");
}

export function formatPrintableValue(
  value: PrintableValue,
  format?: PrintableField["format"] | PrintableTableColumn["format"],
  currency?: string,
): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .filter((v) => v !== null && v !== undefined && v !== "")
      .map(humanizePrintableValue)
      .filter((v) => v.trim().length > 0)
      .join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "";
  if (typeof value === "number") {
    if (format === "money") return formatMoneyValue(value, currency);
    if (format === "percent") return formatPercentValue(value);
    if (format === "number") return formatNumberValue(value);
    return String(value);
  }
  if (typeof value === "object") return humanizePrintableValue(value);
  // string
  if (format === "date") return formatDateValue(value);
  if (format === "money") {
    const num = Number(value);
    if (Number.isFinite(num)) return formatMoneyValue(num, currency);
    return value;
  }
  return value;
}
