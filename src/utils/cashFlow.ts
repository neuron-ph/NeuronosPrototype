// Cash Flow Statement builder (Phase 2 + Phase 3 transparency).
//
// Reads account labels (Account Type + Detail Type) — never hardcoded account
// codes. Operating section uses the indirect method (net income + non-cash
// add-backs + working-capital changes). Investing/Financing are read from the
// CASH SIDE of journal entries (the actual cash that moved), because differencing
// balances breaks on disposals. Finally it RECONCILES the computed change against
// the actual movement in Cash and Cash Equivalents accounts.
//
// Every line also carries the journal entries that produced it (`sources`), so the
// statement can drill down to show its work. See docs/ACCOUNTING_REFACTOR_PLAN.md

import { activityForDetailType, normalizeAccountType, type CashFlowActivity } from "./accountingDetailTypes";

interface RawLine { account_id?: string; debit?: number | string; credit?: number | string; }
interface RawEntry {
  entry_date?: string; description?: string; reference?: string;
  invoice_id?: string | null; collection_id?: string | null;
  evoucher_id?: string | null; booking_id?: string | null;
  lines?: RawLine[] | null;
}
interface RawAccount { id: string; type?: string | null; detail_type?: string | null; }

export interface CashFlowSource {
  date: string; description: string; reference: string; amount: number; source: string | null;
}
export interface CashFlowLine { label: string; amount: number; sources: CashFlowSource[]; }

export interface CashFlowResult {
  netIncome: number;
  netIncomeSources: CashFlowSource[];
  nonCash: CashFlowLine[];
  workingCapital: CashFlowLine[];
  operatingTotal: number;
  investing: CashFlowLine[];
  investingTotal: number;
  financing: CashFlowLine[];
  financingTotal: number;
  netChange: number;          // operating + investing + financing
  actualCashChange: number;   // ground truth: movement in Cash and Cash Equivalents accounts
  difference: number;         // netChange - actualCashChange
  reconciled: boolean;
  entryCount: number;
}

const n = (v: unknown) => Number(v) || 0;
const sumLines = (rows: CashFlowLine[]) => rows.reduce((s, r) => s + r.amount, 0);

const sourceLabel = (e: RawEntry): string | null =>
  e.invoice_id ? "Invoice" : e.collection_id ? "Collection"
    : e.evoucher_id ? "E-Voucher" : e.booking_id ? "Booking" : null;

type Group = Map<string, { total: number; sources: CashFlowSource[] }>;

export function buildCashFlow(entries: RawEntry[], accounts: RawAccount[]): CashFlowResult {
  interface Meta { type: string; detail: string; activity: CashFlowActivity | null; }
  const meta = new Map<string, Meta>();
  for (const a of accounts) {
    meta.set(a.id, {
      type: normalizeAccountType(a.type),
      detail: a.detail_type ?? "",
      activity: activityForDetailType(a.detail_type),
    });
  }
  const M = (id: string | undefined): Meta | undefined => (id ? meta.get(id) : undefined);

  const srcOf = (e: RawEntry, amount: number): CashFlowSource => ({
    date: String(e.entry_date ?? "").slice(0, 10),
    description: e.description ?? "",
    reference: e.reference ?? "",
    amount,
    source: sourceLabel(e),
  });
  const addTo = (g: Group, key: string, amount: number, e: RawEntry) => {
    if (Math.abs(amount) < 0.005) return;
    const cur = g.get(key) ?? { total: 0, sources: [] };
    cur.total += amount;
    cur.sources.push(srcOf(e, amount));
    g.set(key, cur);
  };

  let netIncome = 0;
  const netIncomeSources: CashFlowSource[] = [];
  const nonCashG: Group = new Map();
  const wcG: Group = new Map();
  const invG: Group = new Map();
  const finG: Group = new Map();
  let actualCashChange = 0;

  for (const e of entries) {
    const lines = e.lines ?? [];
    let entryNet = 0;     // net income contribution
    let cashDelta = 0;    // actual cash moved in this entry
    let touchesCash = false;

    for (const l of lines) {
      const mm = M(l.account_id);
      if (!mm) continue;
      const dr = n(l.debit), cr = n(l.credit);
      if (mm.type === "revenue" || mm.type === "expense") entryNet += cr - dr;
      if (mm.activity === "Operating (non-cash adjustments)") addTo(nonCashG, mm.detail, dr - cr, e);
      if (mm.activity === "Operating" && (mm.type === "asset" || mm.type === "liability")) addTo(wcG, mm.detail, cr - dr, e);
      if (mm.activity === "Cash") { touchesCash = true; cashDelta += dr - cr; actualCashChange += dr - cr; }
    }

    netIncome += entryNet;
    if (Math.abs(entryNet) > 0.005) netIncomeSources.push(srcOf(e, entryNet));

    // Investing / Financing — read the CASH SIDE: attribute the actual cash delta
    // to the activity of the non-cash counterpart. Operating cash flows are skipped
    // (captured indirectly via net income + working capital).
    if (touchesCash && Math.abs(cashDelta) > 0.005) {
      const invLine = lines.find((l) => M(l.account_id)?.activity === "Investing");
      const finLine = lines.find((l) => M(l.account_id)?.activity === "Financing");
      if (invLine) addTo(invG, M(invLine.account_id)!.detail || "Investing", cashDelta, e);
      else if (finLine) addTo(finG, M(finLine.account_id)!.detail || "Financing", cashDelta, e);
    }
  }

  const toLines = (g: Group): CashFlowLine[] =>
    [...g.entries()]
      .filter(([, v]) => Math.abs(v.total) > 0.005)
      .map(([label, v]) => ({ label, amount: v.total, sources: v.sources }));

  const nonCash = toLines(nonCashG);
  const workingCapital = toLines(wcG);
  const investing = toLines(invG);
  const financing = toLines(finG);

  const operatingTotal = netIncome + sumLines(nonCash) + sumLines(workingCapital);
  const investingTotal = sumLines(investing);
  const financingTotal = sumLines(financing);
  const netChange = operatingTotal + investingTotal + financingTotal;
  const difference = netChange - actualCashChange;

  return {
    netIncome, netIncomeSources, nonCash, workingCapital, operatingTotal,
    investing, investingTotal, financing, financingTotal,
    netChange, actualCashChange, difference,
    reconciled: Math.abs(difference) < 0.01,
    entryCount: entries.length,
  };
}
