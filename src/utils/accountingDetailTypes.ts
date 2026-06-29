// Detail Type catalog — the finer account label that drives Cash-Flow activity.
//
// Single source of truth for BOTH the account-creation picker (grouped by
// activity) and (Phase 2) the Cash Flow Statement engine. The per-account
// classification lives as data on `accounts.detail_type`; this catalog maps
// each Detail Type → its Cash-Flow activity (universal accounting, ~24 rows).
// See docs/ACCOUNTING_REFACTOR_PLAN.md
//
// Account Type (the broad 5: Asset/Liability/Equity/Income/Expense) drives
// statement placement. Detail Type drives Operating/Investing/Financing.

export type CashFlowActivity =
  | "Cash"
  | "Operating"
  | "Operating (non-cash adjustments)"
  | "Investing"
  | "Financing"
  | "None";

export interface DetailTypeDef {
  name: string;
  /** Broad Account Types this Detail Type is valid under (lowercased for matching). */
  accountTypes: string[];
  activity: CashFlowActivity;
}

export const DETAIL_TYPES: DetailTypeDef[] = [
  // Cash — the reconciliation target (not an activity)
  { name: "Cash and Cash Equivalents", accountTypes: ["asset"], activity: "Cash" },

  // Operating — working capital (assets)
  { name: "Accounts Receivable", accountTypes: ["asset"], activity: "Operating" },
  { name: "Inventory", accountTypes: ["asset"], activity: "Operating" },
  { name: "Prepaid Expenses", accountTypes: ["asset"], activity: "Operating" },
  { name: "Other Current Assets", accountTypes: ["asset"], activity: "Operating" },

  // Operating — working capital (liabilities)
  { name: "Accounts Payable", accountTypes: ["liability"], activity: "Operating" },
  { name: "Accrued Expenses", accountTypes: ["liability"], activity: "Operating" },
  { name: "Taxes Payable", accountTypes: ["liability"], activity: "Operating" },
  { name: "Deferred Revenue", accountTypes: ["liability"], activity: "Operating" },
  { name: "Other Current Liabilities", accountTypes: ["liability"], activity: "Operating" },

  // Operating — P&L (feeds net profit)
  { name: "Revenue", accountTypes: ["income", "revenue"], activity: "Operating" },
  { name: "Other Income", accountTypes: ["income", "revenue"], activity: "Operating" },
  { name: "Cost of Services", accountTypes: ["expense", "cost"], activity: "Operating" },
  { name: "Operating Expense", accountTypes: ["expense"], activity: "Operating" },
  { name: "Tax Expense", accountTypes: ["expense"], activity: "Operating" },
  { name: "Interest", accountTypes: ["expense"], activity: "Operating" }, // policy toggle default = Operating

  // Operating — non-cash adjustments (added back / reversed out)
  { name: "Depreciation & Amortization", accountTypes: ["expense"], activity: "Operating (non-cash adjustments)" },
  { name: "Loss/Gain on Disposal", accountTypes: ["expense", "income"], activity: "Operating (non-cash adjustments)" },
  { name: "Unrealized FX Gain/Loss", accountTypes: ["expense", "income", "revenue"], activity: "Operating (non-cash adjustments)" },

  // Investing — long-term assets
  { name: "Fixed Assets", accountTypes: ["asset"], activity: "Investing" },
  { name: "Other Non-Current Assets", accountTypes: ["asset"], activity: "Investing" },
  { name: "Long-term Investments", accountTypes: ["asset"], activity: "Investing" },

  // Financing — long-term debt + equity
  { name: "Loans / Long-term Debt", accountTypes: ["liability"], activity: "Financing" },
  { name: "Capital / Contributions", accountTypes: ["equity"], activity: "Financing" },
  { name: "Dividends / Drawings", accountTypes: ["equity"], activity: "Financing" },
  { name: "Retained Earnings", accountTypes: ["equity"], activity: "None" }, // carry-over, not a cash flow
];

const ACTIVITY_ORDER: CashFlowActivity[] = [
  "Cash",
  "Operating",
  "Operating (non-cash adjustments)",
  "Investing",
  "Financing",
  "None",
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

function normalizeType(accountType: string | undefined | null): string {
  return (accountType ?? "").trim().toLowerCase();
}

export function detailTypesForAccountType(accountType: string | undefined | null): DetailTypeDef[] {
  const t = normalizeType(accountType);
  return DETAIL_TYPES.filter((d) => d.accountTypes.includes(t));
}

export interface DetailTypeGroup {
  activity: CashFlowActivity;
  items: DetailTypeDef[];
}

/** Detail Types valid for the given Account Type, grouped by Cash-Flow activity (for the picker). */
export function detailTypeGroups(accountType: string | undefined | null): DetailTypeGroup[] {
  const items = detailTypesForAccountType(accountType);
  return ACTIVITY_ORDER
    .map((activity) => ({ activity, items: items.filter((d) => d.activity === activity) }))
    .filter((g) => g.items.length > 0);
}

export function activityForDetailType(name: string | undefined | null): CashFlowActivity | null {
  if (!name) return null;
  return DETAIL_TYPES.find((d) => d.name === name)?.activity ?? null;
}

export function isValidDetailType(accountType: string | undefined | null, name: string | undefined | null): boolean {
  if (!name) return false;
  return detailTypesForAccountType(accountType).some((d) => d.name === name);
}

// ── Statement classification (Phase 1) ───────────────────────────────────────
// The statements engine reads these from each account's stored labels instead
// of guessing from the account number.

export type CanonicalAccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

/** Normalize a stored Account Type to the engine's canonical vocabulary (lowercase; income→revenue, cost→expense). */
export function normalizeAccountType(raw: string | undefined | null): CanonicalAccountType {
  const t = (raw ?? "").trim().toLowerCase();
  if (t === "income") return "revenue";
  if (t === "cost") return "expense";
  if (t === "asset" || t === "liability" || t === "equity" || t === "revenue" || t === "expense") return t;
  return "expense";
}

/**
 * Map an account's stored labels (Account Type + Detail Type) to the section
 * the Income Statement / Balance Sheet group by. The account number is never used.
 */
export function statementSection(
  accountType: string | undefined | null,
  detailType: string | undefined | null,
): string {
  const t = normalizeAccountType(accountType);
  const d = (detailType ?? "").trim();

  if (t === "asset") {
    return ["Fixed Assets", "Other Non-Current Assets", "Long-term Investments"].includes(d)
      ? "Non-Current Assets"
      : "Current Assets";
  }
  if (t === "liability") {
    return d === "Loans / Long-term Debt" ? "Non-Current Liabilities" : "Current Liabilities";
  }
  if (t === "equity") return "Equity";
  if (t === "revenue") {
    return d === "Revenue" ? "Service Revenue" : "Other Income";
  }
  // expense
  switch (d) {
    case "Cost of Services": return "Cost of Services";
    case "Tax Expense": return "Income Tax";
    case "Interest":
    case "Loss/Gain on Disposal":
    case "Unrealized FX Gain/Loss": return "Other Expenses";
    case "Operating Expense":
    case "Depreciation & Amortization": return "Operating Expenses";
    default: return "Operating Expenses";
  }
}
