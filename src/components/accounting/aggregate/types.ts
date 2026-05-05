/**
 * Aggregate Financial Shell — Shared Types
 * 
 * Used by ScopeBar, KPIStrip, AgingStrip, GroupedDataTable, and all tab configs.
 */

import type { LucideIcon } from "lucide-react";

// ── Date Scoping ──

export type ScopePreset = "this-week" | "this-month" | "this-quarter" | "ytd" | "all" | "custom";

export interface DateScope {
  preset: ScopePreset;
  from: Date;
  to: Date;
}

export interface DateScopeQueryRange {
  fromIso: string;
  toIso: string;
}

/** Returns a DateScope for the given preset (relative to today). */
export function createDateScope(preset: ScopePreset, customFrom?: Date, customTo?: Date): DateScope {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case "this-week": {
      const dayOfWeek = today.getDay(); // 0=Sun
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7)); // Monday
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { preset, from: monday, to: sunday };
    }
    case "this-month": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { preset, from: first, to: last };
    }
    case "this-quarter": {
      const q = Math.floor(today.getMonth() / 3);
      const first = new Date(today.getFullYear(), q * 3, 1);
      const last = new Date(today.getFullYear(), q * 3 + 3, 0);
      return { preset, from: first, to: last };
    }
    case "ytd": {
      const jan1 = new Date(today.getFullYear(), 0, 1);
      return { preset, from: jan1, to: today };
    }
    case "all":
      return { preset, from: new Date(2000, 0, 1), to: new Date(2100, 0, 1) };
    case "custom":
      return {
        preset,
        from: customFrom || today,
        to: customTo || today,
      };
    default:
      return { preset: "this-month", from: new Date(today.getFullYear(), today.getMonth(), 1), to: new Date(today.getFullYear(), today.getMonth() + 1, 0) };
  }
}

/** Checks if a date string falls within a DateScope range. */
export function isInScope(dateStr: string | undefined, scope: DateScope): boolean {
  if (!dateStr) return scope.preset === "all"; // If no date, only include in "all"
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  // Normalize to start of day for comparison
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return day >= scope.from && day <= scope.to;
}

/** Returns an inclusive ISO timestamp range suitable for DB queries. */
export function getDateScopeQueryRange(scope: DateScope): DateScopeQueryRange {
  const from = new Date(scope.from);
  from.setHours(0, 0, 0, 0);

  const to = new Date(scope.to);
  to.setHours(23, 59, 59, 999);

  return {
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
  };
}


// ── KPI Cards ──

export interface KPICard {
  label: string;
  value: string;             // Formatted display (e.g., "PHP 2.4M")
  rawValue?: number;         // Numeric value for sorting/comparison
  subtext?: string;          // e.g., "23 items" or "+12% MoM"
  trend?: "up" | "down" | "flat";
  severity?: "normal" | "warning" | "danger";
  icon: LucideIcon;
}


// ── Aging Buckets ──

export interface AgingBucket {
  label: string;
  amount: number;
  count: number;
  color: string;             // CSS color value
  isActive?: boolean;
}


// ── Grouping ──

export interface GroupOption {
  value: string;
  label: string;
}

export interface GroupedItems<T> {
  key: string;
  label: string;
  items: T[];
  subtotal: number;
  count: number;
}


// ── Tab Config (used by Phase 2+) ──

export interface StatusOption {
  value: string;
  label: string;
  color: string;
}

/** 
 * Full aggregate tab configuration. Each financial tab provides one of these. 
 * The shell uses it to render KPIs, grouping, table, etc.
 */
export interface AggregateTabConfig<T> {
  tabId: string;
  
  // KPIs
  computeKPIs: (items: T[], scope: DateScope) => KPICard[];
  
  // Aging (optional)
  agingConfig?: {
    computeBuckets: (items: T[]) => AgingBucket[];
    dateField: string;
  };
  
  // Grouping
  groupByOptions: GroupOption[];
  defaultGroupBy: string;
  getGroupKey: (item: T, groupBy: string) => string;
  getGroupLabel: (key: string, groupBy: string, items: T[]) => string;
  getGroupSubtotal: (items: T[]) => number;
  
  // Status filters
  statusOptions: StatusOption[];
  getStatus: (item: T) => string;
  
  // Date field for scoping
  dateField: string;
  
  // Search
  searchFields: string[];
  getSearchText: (item: T) => string;
}


// ── Currency Formatting ──

export const formatCurrencyCompact = (amount: number, currency: string = "PHP"): string => {
  if (Math.abs(amount) >= 1_000_000) {
    return `${currency} ${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(amount) >= 1_000) {
    return `${currency} ${(amount / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatCurrencyFull = (amount: number, currency: string = "PHP"): string => {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};
