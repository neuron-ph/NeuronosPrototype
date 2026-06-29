// Detail Type catalog — the finer account label that drives Cash-Flow activity
// and statement sectioning.
//
// The catalog is now DATA: it lives in the `account_detail_types` table and is
// fetched via fetchDetailTypeCatalog() / the useAccountDetailTypes() hook. The
// BUILTIN list below is the seed and a guaranteed fallback, so the statements
// always work even if the table is empty or unreachable.
//
// Account Type (the broad 5) drives statement placement; Detail Type drives
// Operating/Investing/Financing. See docs/ACCOUNTING_REFACTOR_PLAN.md

import { supabase } from "./supabase/client";

export type CashFlowActivity =
  | "Cash"
  | "Operating"
  | "Operating (non-cash adjustments)"
  | "Investing"
  | "Financing"
  | "None";

export interface DetailTypeRow {
  name: string;
  /** Broad Account Types this Detail Type is valid under (lowercased for matching). */
  accountTypes: string[];
  activity: CashFlowActivity;
  /** Income Statement / Balance Sheet section this rolls into. */
  statementSection: string;
}

/** Seed + fallback. The live catalog comes from the account_detail_types table. */
export const BUILTIN_DETAIL_TYPES: DetailTypeRow[] = [
  { name: "Cash and Cash Equivalents", accountTypes: ["asset"], activity: "Cash", statementSection: "Current Assets" },
  { name: "Accounts Receivable", accountTypes: ["asset"], activity: "Operating", statementSection: "Current Assets" },
  { name: "Inventory", accountTypes: ["asset"], activity: "Operating", statementSection: "Current Assets" },
  { name: "Prepaid Expenses", accountTypes: ["asset"], activity: "Operating", statementSection: "Current Assets" },
  { name: "Other Current Assets", accountTypes: ["asset"], activity: "Operating", statementSection: "Current Assets" },
  { name: "Accounts Payable", accountTypes: ["liability"], activity: "Operating", statementSection: "Current Liabilities" },
  { name: "Accrued Expenses", accountTypes: ["liability"], activity: "Operating", statementSection: "Current Liabilities" },
  { name: "Taxes Payable", accountTypes: ["liability"], activity: "Operating", statementSection: "Current Liabilities" },
  { name: "Deferred Revenue", accountTypes: ["liability"], activity: "Operating", statementSection: "Current Liabilities" },
  { name: "Other Current Liabilities", accountTypes: ["liability"], activity: "Operating", statementSection: "Current Liabilities" },
  { name: "Revenue", accountTypes: ["income", "revenue"], activity: "Operating", statementSection: "Service Revenue" },
  { name: "Other Income", accountTypes: ["income", "revenue"], activity: "Operating", statementSection: "Other Income" },
  { name: "Cost of Services", accountTypes: ["expense", "cost"], activity: "Operating", statementSection: "Cost of Services" },
  { name: "Operating Expense", accountTypes: ["expense"], activity: "Operating", statementSection: "Operating Expenses" },
  { name: "Tax Expense", accountTypes: ["expense"], activity: "Operating", statementSection: "Income Tax" },
  { name: "Interest", accountTypes: ["expense"], activity: "Operating", statementSection: "Other Expenses" },
  { name: "Depreciation & Amortization", accountTypes: ["expense"], activity: "Operating (non-cash adjustments)", statementSection: "Operating Expenses" },
  { name: "Loss/Gain on Disposal", accountTypes: ["expense", "income"], activity: "Operating (non-cash adjustments)", statementSection: "Other Expenses" },
  { name: "Unrealized FX Gain/Loss", accountTypes: ["expense", "income", "revenue"], activity: "Operating (non-cash adjustments)", statementSection: "Other Expenses" },
  { name: "Fixed Assets", accountTypes: ["asset"], activity: "Investing", statementSection: "Non-Current Assets" },
  { name: "Other Non-Current Assets", accountTypes: ["asset"], activity: "Investing", statementSection: "Non-Current Assets" },
  { name: "Long-term Investments", accountTypes: ["asset"], activity: "Investing", statementSection: "Non-Current Assets" },
  { name: "Loans / Long-term Debt", accountTypes: ["liability"], activity: "Financing", statementSection: "Non-Current Liabilities" },
  { name: "Capital / Contributions", accountTypes: ["equity"], activity: "Financing", statementSection: "Equity" },
  { name: "Dividends / Drawings", accountTypes: ["equity"], activity: "Financing", statementSection: "Equity" },
  { name: "Retained Earnings", accountTypes: ["equity"], activity: "None", statementSection: "Equity" },
];

export const CASH_FLOW_ACTIVITIES: CashFlowActivity[] = [
  "Cash", "Operating", "Operating (non-cash adjustments)", "Investing", "Financing", "None",
];

/** Section labels a Detail Type can roll into (for the admin picker). */
export const STATEMENT_SECTIONS: string[] = [
  "Current Assets", "Non-Current Assets",
  "Current Liabilities", "Non-Current Liabilities", "Equity",
  "Service Revenue", "Other Income",
  "Cost of Services", "Operating Expenses", "Other Expenses", "Income Tax",
];

export function activityLabel(a: CashFlowActivity): string {
  switch (a) {
    case "Cash": return "Cash";
    case "Operating": return "Operating Activity";
    case "Operating (non-cash adjustments)": return "Operating Activity (non-cash adjustments)";
    case "Investing": return "Investing Activity";
    case "Financing": return "Financing Activity";
    case "None": return "Other (not a cash flow)";
  }
}

// ── Account-type normalization ───────────────────────────────────────────────

export type CanonicalAccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

/** Normalize a stored Account Type to the engine's canonical vocabulary (lowercase; income→revenue, cost→expense). */
export function normalizeAccountType(raw: string | undefined | null): CanonicalAccountType {
  const t = (raw ?? "").trim().toLowerCase();
  if (t === "income") return "revenue";
  if (t === "cost") return "expense";
  if (t === "asset" || t === "liability" || t === "equity" || t === "revenue" || t === "expense") return t;
  return "expense";
}

function lc(accountType: string | undefined | null): string {
  return (accountType ?? "").trim().toLowerCase();
}

// ── Catalog lookups (operate on a fetched catalog) ───────────────────────────

export function detailTypesForAccountType(catalog: DetailTypeRow[], accountType: string | undefined | null): DetailTypeRow[] {
  const t = lc(accountType);
  // Match income/revenue and expense/cost interchangeably so a Detail Type stays
  // valid whichever naming an account uses.
  const syn = t === "income" ? "revenue" : t === "revenue" ? "income"
    : t === "expense" ? "cost" : t === "cost" ? "expense" : t;
  return catalog.filter((d) => d.accountTypes.includes(t) || d.accountTypes.includes(syn));
}

export interface DetailTypeGroup {
  activity: CashFlowActivity;
  items: DetailTypeRow[];
}

/** Detail Types valid for the given Account Type, grouped by Cash-Flow activity (for the picker). */
export function detailTypeGroups(catalog: DetailTypeRow[], accountType: string | undefined | null): DetailTypeGroup[] {
  const items = detailTypesForAccountType(catalog, accountType);
  return CASH_FLOW_ACTIVITIES
    .map((activity) => ({ activity, items: items.filter((d) => d.activity === activity) }))
    .filter((g) => g.items.length > 0);
}

export function activityForDetailType(catalog: DetailTypeRow[], name: string | undefined | null): CashFlowActivity | null {
  if (!name) return null;
  return catalog.find((d) => d.name === name)?.activity ?? null;
}

export function isValidDetailType(catalog: DetailTypeRow[], accountType: string | undefined | null, name: string | undefined | null): boolean {
  if (!name) return false;
  return detailTypesForAccountType(catalog, accountType).some((d) => d.name === name);
}

/**
 * The statement section (Income Statement / Balance Sheet) an account rolls into,
 * from its Detail Type. Account number is never used. Falls back by Account Type
 * for unknown/unlabelled accounts.
 */
export function statementSection(
  catalog: DetailTypeRow[],
  accountType: string | undefined | null,
  name: string | undefined | null,
): string {
  const t = normalizeAccountType(accountType);
  const row = name ? catalog.find((d) => d.name === name) : undefined;
  if (row) {
    let section = row.statementSection;
    // Dual-natured detail types (e.g. Unrealized FX, gain/loss on disposal): on the
    // income side they belong in Other Income, not Other Expenses.
    if (t === "revenue" && section === "Other Expenses") section = "Other Income";
    return section;
  }
  if (t === "asset") return "Current Assets";
  if (t === "liability") return "Current Liabilities";
  if (t === "equity") return "Equity";
  if (t === "revenue") return "Other Income";
  return "Operating Expenses";
}

// ── Fetching the live catalog ────────────────────────────────────────────────

/** Loads the catalog from the DB, falling back to the built-in list if empty/unreachable. */
export async function fetchDetailTypeCatalog(): Promise<DetailTypeRow[]> {
  const { data, error } = await supabase
    .from("account_detail_types")
    .select("name, account_types, activity, statement_section, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error || !data || data.length === 0) return BUILTIN_DETAIL_TYPES;
  return data.map((r: any) => ({
    name: r.name as string,
    accountTypes: (r.account_types ?? []) as string[],
    activity: r.activity as CashFlowActivity,
    statementSection: r.statement_section as string,
  }));
}
