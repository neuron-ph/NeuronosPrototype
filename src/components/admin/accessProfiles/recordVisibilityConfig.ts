// NEU-012 Contract #6 Slice 3 — catalog for the Record Visibility tab.
//
// One entry per record TYPE the DB enforces a dial on (keys must match the
// seed in migration 157 and the keys the RLS policies pass). Each type lists
// the feature-access modules that gate it: if a profile can `view` ANY of
// them, the record type is reachable (LIVE) and its dial is editable; if not,
// the row is greyed — you grant access in Feature Access first. This keeps the
// two tabs in lockstep, exactly like the locked design.

export type RecordDial = "own" | "team" | "everything";
export type RecordVisibilityMap = Partial<Record<string, RecordDial>>;

export const RECORD_DIALS: { value: RecordDial; label: string; description: string }[] = [
  { value: "own", label: "Own", description: "Records they created or are directly assigned to." },
  { value: "team", label: "Team", description: "Their own records plus their teammates'." },
  { value: "everything", label: "Everything", description: "Every record of this type." },
];

export const DIAL_RANK: Record<RecordDial, number> = { own: 0, team: 1, everything: 2 };

export interface RecordType {
  key: string;
  label: string;
  /** view on ANY of these feature-access modules makes the type reachable. */
  gatingModules: string[];
}

export const RECORD_TYPE_GROUPS: { group: string; types: RecordType[] }[] = [
  {
    group: "Business Development & CRM",
    types: [
      { key: "contacts", label: "Contacts", gatingModules: ["bd_contacts", "pricing_contacts"] },
      { key: "customers", label: "Customers", gatingModules: ["bd_customers", "pricing_customers", "acct_customers"] },
      { key: "quotations", label: "Quotations & Contracts", gatingModules: ["pricing_quotations", "pricing_contracts", "bd_contracts", "bd_inquiries"] },
      { key: "tasks", label: "Tasks", gatingModules: ["bd_tasks"] },
      { key: "evouchers", label: "E-Vouchers", gatingModules: ["acct_evouchers", "my_evouchers", "bd_budget_requests"] },
    ],
  },
  {
    group: "Operations — Bookings",
    types: [
      { key: "bookings_forwarding", label: "Forwarding Bookings", gatingModules: ["ops_forwarding"] },
      { key: "bookings_brokerage", label: "Brokerage Bookings", gatingModules: ["ops_brokerage"] },
      { key: "bookings_trucking", label: "Trucking Bookings", gatingModules: ["ops_trucking"] },
      { key: "bookings_marine_insurance", label: "Marine Insurance Bookings", gatingModules: ["ops_marine_insurance"] },
      { key: "bookings_others", label: "Other Bookings", gatingModules: ["ops_others"] },
    ],
  },
  {
    group: "Accounting — Financials",
    types: [
      { key: "invoices", label: "Invoices", gatingModules: ["acct_financials", "accounting_financials_invoices_tab"] },
      { key: "collections", label: "Collections", gatingModules: ["acct_financials", "accounting_financials_collections_tab", "acct_collections"] },
      { key: "billings", label: "Billings", gatingModules: ["acct_financials", "accounting_financials_billings_tab", "acct_billings", "acct_bookings", "ops_bookings_billings_tab", "ops_projects_billings_tab", "pricing_contracts_billings_tab"] },
      { key: "expenses", label: "Expenses", gatingModules: ["acct_financials", "accounting_financials_expenses_tab", "acct_expenses", "ops_bookings_expenses_tab", "ops_projects_expenses_tab"] },
    ],
  },
];

export const ALL_RECORD_TYPES: RecordType[] = RECORD_TYPE_GROUPS.flatMap((g) => g.types);

/** A type is reachable when the profile has `view` on any of its gating modules. */
export function isRecordTypeAccessible(
  rt: RecordType,
  resolvedGrants: Record<string, boolean>,
): boolean {
  return rt.gatingModules.some((m) => resolvedGrants[`${m}:view`] === true);
}

export function dialFor(map: RecordVisibilityMap, key: string): RecordDial {
  return map[key] ?? "own";
}

/** Legacy single-scope column is inert under the dial model but kept coherent:
 *  the broadest dial across accessible types, mapped to the old vocabulary. */
export function legacyScopeFromMap(map: RecordVisibilityMap): "own" | "team" | "department" {
  let best: RecordDial = "own";
  for (const rt of ALL_RECORD_TYPES) {
    const d = dialFor(map, rt.key);
    if (DIAL_RANK[d] > DIAL_RANK[best]) best = d;
  }
  return best === "everything" ? "department" : best;
}
