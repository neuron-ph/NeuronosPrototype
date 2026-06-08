// NEU-012 Contract #6 Slice 3 — catalog for the Record Visibility tab.
//
// One entry per record TYPE the DB enforces a dial on (keys must match the
// seed in migration 157 and the keys the RLS policies pass). Each type lists
// the feature-access modules that gate it: if a profile can `view` ANY of
// them, the record type is reachable (LIVE) and its dial is editable; if not,
// the row is greyed — you grant access in Feature Access first. This keeps the
// two tabs in lockstep, exactly like the locked design.

export type RecordDial = "own" | "team" | "department" | "everything";
export type RecordVisibilityMap = Partial<Record<string, RecordDial>>;

// CREW wording (PLAN_CREW_VISIBILITY_2026-06.md, D2/D6): a record's crew is its
// owner plus everyone assigned to work attached to it (linked bookings/projects).
// Each dial is a radius around the crew — the descriptions must state this in
// full, on-screen, so the rule is explicit, never implicit.
export const RECORD_DIALS: { value: RecordDial; label: string; description: string }[] = [
  { value: "own", label: "Own", description: "Records they own, are assigned to, or that belong to work they're part of." },
  { value: "team", label: "Team", description: "Own, plus records owned by or worked on by their teammates." },
  { value: "department", label: "Department", description: "Own, plus records owned by or worked on by anyone in their department." },
  { value: "everything", label: "All records", description: "Every record of this type, across all departments." },
];

export const DIAL_RANK: Record<RecordDial, number> = { own: 0, team: 1, department: 2, everything: 3 };

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
      // Split per the door doctrine: a Quotation (sales draft) and a Contract
      // (active agreement) are distinct nouns with their own rooms, so each gets
      // its own dial — even though both live on the `quotations` table. RLS keys
      // the dial off quotation_type (CASE in quotations_select). Contracts is its
      // own group below (a container record type, sibling to Projects).
      { key: "quotations", label: "Quotations", gatingModules: ["pricing_quotations", "bd_inquiries"] },
      { key: "tasks", label: "Tasks", gatingModules: ["bd_tasks"] },
      { key: "activities", label: "Activities", gatingModules: ["bd_activities"] },
      { key: "budget_requests", label: "Budget Requests", gatingModules: ["bd_budget_requests"] },
      { key: "evouchers", label: "E-Vouchers", gatingModules: ["acct_evouchers", "my_evouchers", "bd_budget_requests"] },
    ],
  },
  {
    group: "Projects",
    types: [
      { key: "projects", label: "Projects", gatingModules: ["bd_projects", "pricing_projects", "ops_projects", "acct_projects"] },
    ],
  },
  {
    group: "Contracts",
    types: [
      // Sibling container to Projects; its own dial (RLS keys 'contracts' off
      // quotation_type). Visibility also flows through the relationship gate
      // (a contract linked to a booking/project you can see).
      { key: "contracts", label: "Contracts", gatingModules: ["pricing_contracts", "bd_contracts"] },
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
      { key: "transactions", label: "Transactions", gatingModules: ["acct_financials", "acct_journal"] },
      { key: "journal_entries", label: "Journal Entries", gatingModules: ["acct_journal", "acct_financials"] },
      { key: "financial_filings", label: "Financial Statement Filings", gatingModules: ["acct_statements"] },
      { key: "liquidations", label: "Liquidation Submissions", gatingModules: ["acct_evouchers", "my_evouchers"] },
    ],
  },
  {
    group: "Support & Internal",
    types: [
      // Tickets have no gating feature-module — always editable (gated by the
      // dial + ticket participation, see migration 162).
      { key: "tickets", label: "Tickets", gatingModules: [] },
      { key: "memos", label: "Memos", gatingModules: ["exec_memos"] },
    ],
  },
];

export const ALL_RECORD_TYPES: RecordType[] = RECORD_TYPE_GROUPS.flatMap((g) => g.types);

/** A type is reachable when the profile has `view` on any of its gating modules.
 *  Types with NO gating module (e.g. Tickets) are always reachable. */
export function isRecordTypeAccessible(
  rt: RecordType,
  resolvedGrants: Record<string, boolean>,
): boolean {
  if (rt.gatingModules.length === 0) return true;
  return rt.gatingModules.some((m) => resolvedGrants[`${m}:view`] === true);
}

export function dialFor(map: RecordVisibilityMap, key: string): RecordDial {
  return map[key] ?? "own";
}

/** Effective per-type dials for a user: profile baseline overlaid with the
 *  per-user override (override wins per key), defaulting to 'own'. Mirrors the
 *  DB resolver current_user_visibility_dial. */
export function mergeVisibility(
  baseline: RecordVisibilityMap,
  override: RecordVisibilityMap,
): RecordVisibilityMap {
  const out: RecordVisibilityMap = {};
  for (const rt of ALL_RECORD_TYPES) {
    out[rt.key] = override[rt.key] ?? baseline[rt.key] ?? "own";
  }
  return out;
}

/** Minimal per-user override: only the types whose dial differs from the
 *  profile baseline (so profile changes still propagate to the rest). */
export function deriveVisibilityOverride(
  effective: RecordVisibilityMap,
  baseline: RecordVisibilityMap,
): RecordVisibilityMap {
  const out: RecordVisibilityMap = {};
  for (const rt of ALL_RECORD_TYPES) {
    const eff = dialFor(effective, rt.key);
    if (eff !== dialFor(baseline, rt.key)) out[rt.key] = eff;
  }
  return out;
}

/** Legacy single-scope column is inert under the dial model but kept coherent:
 *  the broadest dial across accessible types, mapped to the old vocabulary. */
export function legacyScopeFromMap(map: RecordVisibilityMap): "own" | "team" | "department" {
  let best: RecordDial = "own";
  for (const rt of ALL_RECORD_TYPES) {
    const d = dialFor(map, rt.key);
    if (DIAL_RANK[d] > DIAL_RANK[best]) best = d;
  }
  return best === "everything" || best === "department" ? "department" : best;
}
