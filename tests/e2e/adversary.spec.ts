import { test, expect } from "@playwright/test";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// ─────────────────────────────────────────────────────────────────────────────
// The adversary — the same operational spine, deliberately attacked.
//
// The spine (spine.spec.ts) proves the happy path: the right person, doing the
// right thing, in the right order. This proves the opposite half, which is where
// the money actually leaks — the WRONG person, doing the right thing; the right
// person, doing it OUT OF ORDER; and the doctrine we only enforce in a form.
//
// It works at the API, not the UI, on purpose. A UI probe can only tell you a
// button wasn't offered. That is not the same as the action being impossible:
// anyone with the browser console, a stale tab, or a copied bearer token talks
// to PostgREST directly. What we want to know is what the DATABASE permits, and
// the only honest way to ask is to ask it.
//
// Every probe lands in one of three buckets:
//
//   BLOCKED_LOUD    the write raised. Best outcome — the caller cannot mistake
//                   it for success.
//   BLOCKED_SILENT  no error, and nothing changed. RLS filtered the row out of
//                   the UPDATE's USING clause, so it matched zero rows and
//                   PostgREST returned 204. Safe, but a caller that doesn't
//                   check the affected count will report "Saved" to a user whose
//                   change evaporated. (This is exactly why EVoucherWorkflowPanel
//                   calls .select() after every update and throws on an empty
//                   result — see `transition()`.)
//   BREACH          the write landed. The rule exists only in the form.
//
// EXPECTED VERDICTS ARE CURRENT TRUTH, NOT DESIRED TRUTH. Several probes below
// expect BREACH. That is deliberate: this file is a characterization suite, and
// a breach recorded here is a finding with a test around it, not an endorsement.
// When one is fixed the probe goes RED — that is the signal to change the
// expectation to BLOCKED and delete the finding from docs/qa/findings.md. Do not
// "fix" a red probe by loosening it.
//
// WRITES TO DEV. Every fixture row is tagged E2E-ADVERSARY and deleted in
// afterAll, breach or no breach.
// ─────────────────────────────────────────────────────────────────────────────

const TAG = "E2E-ADVERSARY";
const PASSWORD = "devpassword123";

// The same cast as the spine, so a probe result is directly comparable to the
// happy-path stage it attacks.
const ACTORS = {
  bd: "jr.businessdev02@falconslogistics-ph.com",       // Johnna — BD Officer
  pricingMgr: "jr.manager03@falconslogistics-ph.com",   // Jayson — Pricing Manager
  ops: "jr.supervisor07@falconslogistics-ph.com",       // Princess — Ops TL / requestor
  opsMgr: "jr.manager02@falconslogistics-ph.com",       // Mariella — Operations Manager
  treasury: "treasury@falconslogistics-ph.com",         // Janice — Accounting, :disburse
} as const;

type ActorKey = keyof typeof ACTORS;

// ── env ──────────────────────────────────────────────────────────────────────
// Playwright doesn't load .env.local, and this spec needs the anon key (to sign
// in as a real person) and the service-role key (to build the fixture and to
// read back what actually happened, past RLS).
function env(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const ENV = env();
const URL = ENV.VITE_SUPABASE_URL;
const ANON = ENV.VITE_SUPABASE_ANON_KEY;
const SERVICE = ENV.DEV_SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = "oqermaidggvanahumjmj";

// ── clients ──────────────────────────────────────────────────────────────────
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const sessions = new Map<ActorKey, SupabaseClient>();

async function as(actor: ActorKey): Promise<SupabaseClient> {
  const cached = sessions.get(actor);
  if (cached) return cached;
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({
    email: ACTORS[actor], password: PASSWORD,
  });
  if (error) throw new Error(`sign in ${actor}: ${error.message}`);
  sessions.set(actor, client);
  return client;
}

// ── the verdict machinery ────────────────────────────────────────────────────
type Verdict = "BLOCKED_LOUD" | "BLOCKED_SILENT" | "BREACH" | "VISIBLE" | "HIDDEN";

const results: { probe: string; actor: ActorKey; got: Verdict; want: Verdict; note?: string }[] = [];

/** Attempt a write that should not be permitted, then ask the database — with
 *  service-role eyes — whether it actually landed. `changed` is what makes the
 *  difference between "refused" and "refused out loud". */
async function writeProbe(opts: {
  probe: string;
  actor: ActorKey;
  want: Verdict;
  note?: string;
  attempt: (db: SupabaseClient) => Promise<{ error: unknown }>;
  changed: () => Promise<boolean>;
}) {
  const db = await as(opts.actor);
  const { error } = await opts.attempt(db);
  const landed = await opts.changed();
  const got: Verdict = landed ? "BREACH" : error ? "BLOCKED_LOUD" : "BLOCKED_SILENT";
  results.push({ probe: opts.probe, actor: opts.actor, got, want: opts.want, note: opts.note });
  expect(got, `${opts.probe} (${opts.actor}) — ${opts.note ?? ""}`).toBe(opts.want);
}

/** Attempt a read that should return nothing. */
async function readProbe(opts: {
  probe: string;
  actor: ActorKey;
  want: Verdict;
  note?: string;
  attempt: (db: SupabaseClient) => Promise<{ data: unknown[] | null }>;
}) {
  const db = await as(opts.actor);
  const { data } = await opts.attempt(db);
  const got: Verdict = (data?.length ?? 0) > 0 ? "VISIBLE" : "HIDDEN";
  results.push({ probe: opts.probe, actor: opts.actor, got, want: opts.want, note: opts.note });
  expect(got, `${opts.probe} (${opts.actor}) — ${opts.note ?? ""}`).toBe(opts.want);
}

// ── the fixture ──────────────────────────────────────────────────────────────
// One job, frozen at every state a probe needs to attack. Built with the service
// role so no probe is testing the fixture's own permissions by accident.
const stamp = Date.now();
const ID = {
  project: `prj-adv-${stamp}`,
  booking: `bk-adv-${stamp}`,
  evA: `ev-adv-${stamp}-a`,
  evB: `ev-adv-${stamp}-b`,
  evC: `ev-adv-${stamp}-c`,
  evD: `ev-adv-${stamp}-d`,
  billing: `bli-adv-${stamp}`,
  invoice: `inv-adv-${stamp}`,
};
const PROJECT_NUMBER = `PRJ-ADV-${String(stamp).slice(-6)}`;
const BOOKING_NUMBER = `ADV${String(stamp).slice(-8)}`;
const users: Record<ActorKey, { id: string; name: string; department: string }> = {} as never;

const CATALOG_EXPENSE_ITEM = "ci-1779684041912"; // FC (OCEAN FREIGHT)
const CATALOG_REVENUE_ITEM = "ci-1779680898945"; // CRATING FEE

async function ins(table: string, row: Record<string, unknown>) {
  const { error } = await admin.from(table).insert(row);
  if (error) throw new Error(`fixture ${table}: ${error.message}`);
}

test.beforeAll(async () => {
  if (!URL?.includes(DEV_REF)) throw new Error(`refusing to run: ${URL} is not the dev project`);

  const { data: people } = await admin
    .from("users").select("id, name, email, department").in("email", Object.values(ACTORS));
  for (const [key, email] of Object.entries(ACTORS) as [ActorKey, string][]) {
    const u = (people ?? []).find((p) => p.email === email);
    if (!u) throw new Error(`fixture: no dev user for ${email}`);
    users[key] = { id: u.id, name: u.name, department: u.department };
  }

  await ins("projects", {
    id: ID.project, project_number: PROJECT_NUMBER, customer_name: `${TAG} CUSTOMER`,
    status: "Active", service_type: "Forwarding", created_by: users.pricingMgr.id,
  });
  await ins("bookings", {
    id: ID.booking, booking_number: BOOKING_NUMBER, name: `${TAG} ${stamp}`,
    service_type: "Forwarding", project_id: ID.project, customer_name: `${TAG} CUSTOMER`,
    status: "Created", created_by: users.pricingMgr.id,
  });

  // Four vouchers so no probe inherits the state another probe left behind.
  // All raised BY the Ops TL and routed TO Pricing, exactly as the routing rule
  // does for a Forwarding-booking expense (spine stage 7 / finding E12).
  const voucher = (id: string, status: string) => ({
    id, transaction_type: "reimbursement", amount: 5000, currency: "PHP",
    status, project_number: PROJECT_NUMBER, booking_id: ID.booking,
    vendor_name: `${TAG} VENDOR`, purpose: `${TAG} ${status}`,
    created_by: users.ops.id, created_by_name: users.ops.name,
    pending_approver_department: "Pricing", pending_approver_role: "manager",
    details: {
      requestor_id: users.ops.id, requestor_name: users.ops.name,
      requestor_department: users.ops.department,
    },
  });
  await ins("evouchers", voucher(ID.evA, "pending_manager"));
  await ins("evouchers", voucher(ID.evB, "pending_ceo"));
  await ins("evouchers", voucher(ID.evC, "pending_accounting"));
  await ins("evouchers", voucher(ID.evD, "pending_manager"));
  await ins("evoucher_line_items", {
    evoucher_id: ID.evA, description: "ADV LINE", amount: 5000,
    booking_id: ID.booking, catalog_item_id: CATALOG_EXPENSE_ITEM,
  });

  await ins("billing_line_items", {
    id: ID.billing, description: `${TAG} CRATING FEE`, amount: 25000, currency: "PHP",
    status: "unbilled", service_type: "Forwarding", booking_id: ID.booking,
    project_number: PROJECT_NUMBER, catalog_item_id: CATALOG_REVENUE_ITEM,
  });

  await ins("invoices", {
    id: ID.invoice, invoice_number: `${BOOKING_NUMBER}-001`, status: "draft",
    approval_status: "pending_approval", pending_approver_department: "Operations",
    pending_approver_role: "manager", customer_name: `${TAG} CUSTOMER`,
    booking_id: ID.booking, project_number: PROJECT_NUMBER,
    subtotal: 25000, total_amount: 25000, currency: "PHP",
    created_by: users.treasury.id,
  });
});

test.afterAll(async () => {
  // Ordered child-first, same reasoning as scripts/clean-spine-debris.mjs: these
  // FKs are ON DELETE SET NULL, so a parent delete would orphan rather than remove.
  const evIds = [ID.evA, ID.evB, ID.evC, ID.evD];
  await admin.from("collections").delete().eq("booking_id", ID.booking);
  await admin.from("billing_line_items").delete().eq("booking_id", ID.booking);
  await admin.from("invoices").delete().eq("id", ID.invoice);
  await admin.from("evoucher_history").delete().in("evoucher_id", evIds);
  await admin.from("evoucher_line_items").delete().in("evoucher_id", evIds);
  await admin.from("evouchers").delete().in("id", evIds);
  await admin.from("bookings").delete().eq("id", ID.booking);
  await admin.from("projects").delete().eq("id", ID.project);

  const width = Math.max(...results.map((r) => r.probe.length));
  const lines = results.map((r) =>
    `  ${r.got === r.want ? "·" : "!"} ${r.probe.padEnd(width)}  ${r.got.padEnd(14)} ${r.note ?? ""}`);
  console.log(`\n── adversary verdicts ──\n${lines.join("\n")}\n`);
});

// Read a single field back with service-role eyes — the only way to know whether
// a write really landed, since the actor's own read is filtered by the same RLS
// that may have filtered the write.
async function fieldIs(table: string, id: string, column: string, value: unknown) {
  const { data } = await admin.from(table).select(column).eq("id", id).maybeSingle();
  return (data as Record<string, unknown> | null)?.[column] === value;
}

// ═════════════════════════════════════════════════════════════════════════════
// A. The approval chain — wrong hands, wrong order
// ═════════════════════════════════════════════════════════════════════════════

test("A1 the requestor can approve her own e-voucher", async () => {
  // The UI never offers this: EVoucherWorkflowPanel gates approval on
  // my_evouchers:approve, which she does not hold. The DATABASE offers it —
  // evouchers_update has a branch for `created_by = me AND my_evouchers:edit`,
  // and that branch does not care which column you are changing. Status is a
  // column. So the requestor can walk her own voucher through the chain.
  await writeProbe({
    probe: "A1 self-approve own voucher",
    actor: "ops",
    want: "BREACH",
    note: "G1 — the requestor's edit grant covers the status column",
    attempt: (db) => db.from("evouchers").update({ status: "pending_ceo" }).eq("id", ID.evA),
    changed: () => fieldIs("evouchers", ID.evA, "status", "pending_ceo"),
  });
});

test("A2 the requestor can mark her own e-voucher disbursed", async () => {
  // The same hole, taken to its end: not just past her manager, but past the
  // CEO and Treasury, to the state that means "the cash has been released".
  // There IS a trigger meant to stop exactly this — it just never fires here,
  // because it only inspects updates whose OLD status is pending_accounting.
  // A7 runs the identical write from that state and gets refused. Same actor,
  // same column, same target value, opposite outcome.
  await writeProbe({
    probe: "A2 self-disburse own voucher",
    actor: "ops",
    want: "BREACH",
    note: "G1 — walks around evoucher_enforce_disburse, which only guards one doorway (see A7)",
    attempt: (db) => db.from("evouchers").update({ status: "disbursed" }).eq("id", ID.evA),
    changed: () => fieldIs("evouchers", ID.evA, "status", "disbursed"),
  });
});

test("A3 the wrong department's manager cannot approve", async () => {
  // Mariella holds my_evouchers:approve and Princess reports to her — but the
  // voucher was ROUTED to Pricing, and the RLS branch compares the materialized
  // approver department to hers. This is E12 enforced at the database, and it
  // is the one gate in the AP chain that genuinely holds.
  await writeProbe({
    probe: "A3 wrong-dept manager approves",
    actor: "opsMgr",
    want: "BLOCKED_SILENT",
    note: "RLS filters the row out of the UPDATE — 0 rows, no error",
    attempt: (db) => db.from("evouchers").update({ status: "pending_ceo" }).eq("id", ID.evD),
    changed: () => fieldIs("evouchers", ID.evD, "status", "pending_ceo"),
  });
});

test("A4 Treasury can disburse a voucher the CEO never approved", async () => {
  // evB is at pending_ceo. Disbursement is supposed to come after CEO approval;
  // the DB has no idea what order these states go in. Anyone holding
  // acct_evouchers:disburse can move any voucher to any status.
  await writeProbe({
    probe: "A4 skip the CEO",
    actor: "treasury",
    want: "BREACH",
    note: "G2 — the AP workflow order is enforced only by which button is rendered",
    attempt: (db) => db.from("evouchers").update({ status: "disbursed" }).eq("id", ID.evB),
    changed: () => fieldIs("evouchers", ID.evB, "status", "disbursed"),
  });
});

test("A5 a manager without the disburse grant cannot release cash", async () => {
  // The narrow gate holds: Jayson can approve at pending_manager and nothing
  // else. At pending_accounting he matches no branch of the update policy.
  await writeProbe({
    probe: "A5 disburse without the grant",
    actor: "pricingMgr",
    want: "BLOCKED_SILENT",
    note: "acct_evouchers:disburse is the only key that opens this",
    attempt: (db) => db.from("evouchers").update({ status: "disbursed" }).eq("id", ID.evC),
    changed: () => fieldIs("evouchers", ID.evC, "status", "disbursed"),
  });
});

test("A6 approving twice does nothing the second time", async () => {
  // The routed approver's branch is scoped to `status = 'pending_manager'`, so
  // once the first approval moves it the same person loses the row. Replay is
  // refused — quietly, but refused.
  const db = await as("pricingMgr");
  const first = await db.from("evouchers").update({ status: "pending_ceo" }).eq("id", ID.evD);
  expect(first.error, "the routed approver could not approve at all").toBeNull();
  expect(await fieldIs("evouchers", ID.evD, "status", "pending_ceo"),
    "the routed Pricing manager's approval did not land").toBe(true);

  await writeProbe({
    probe: "A6 approve the same voucher twice",
    actor: "pricingMgr",
    want: "BLOCKED_SILENT",
    note: "the approver branch is scoped to status = pending_manager",
    attempt: (d) => d.from("evouchers").update({ status: "pending_accounting" }).eq("id", ID.evD),
    changed: () => fieldIs("evouchers", ID.evD, "status", "pending_accounting"),
  });
});

test("A7 the same jump IS blocked when it starts from pending_accounting", async () => {
  // There is a guard — `evoucher_enforce_disburse` raises when someone without
  // acct_evouchers:disburse moves a voucher to disbursed/posted. But read its
  // condition: `old.status = 'pending_accounting'`. It defends exactly one
  // doorway. A2 proved the requestor walks to `disbursed` from pending_ceo
  // without meeting it; here the identical actor, target and column are refused,
  // loudly, because she happened to approach from the guarded state.
  //
  // The lesson is not "add another old.status" — it is that a trigger written
  // per-transition can only ever cover the transitions someone thought of.
  await writeProbe({
    probe: "A7 disburse FROM pending_accounting",
    actor: "ops",
    want: "BLOCKED_LOUD",
    note: "G1 — the guard is real but one-doorway-shaped; A2 walks around it",
    attempt: (db) => db.from("evouchers").update({ status: "disbursed" }).eq("id", ID.evC),
    changed: () => fieldIs("evouchers", ID.evC, "status", "disbursed"),
  });
});

test("A8 an e-voucher line can be written with no catalog item", async () => {
  // The expense-side twin of D1. Same doctrine, same absence of a constraint.
  const freeLine = `evli-adv-${stamp}-freetext`;
  await writeProbe({
    probe: "A8 e-voucher line with no catalog item",
    actor: "ops",
    want: "BREACH",
    note: "G5 — expense side of the same catalog gap",
    attempt: (db) => db.from("evoucher_line_items").insert({
      id: freeLine, evoucher_id: ID.evA, description: "MADE UP EXPENSE",
      amount: 1234, booking_id: ID.booking, catalog_item_id: null,
    }),
    changed: async () => {
      const { data } = await admin.from("evoucher_line_items").select("id").eq("id", freeLine);
      return (data?.length ?? 0) > 0;
    },
  });
  await admin.from("evoucher_line_items").delete().eq("id", freeLine);
});

test("A9 a negative charge is refused by the database", async () => {
  // A positive control, and proof that the constraint route works: this one rule
  // WAS written as a CHECK, and it is the only line-item rule that cannot be
  // walked around by talking to PostgREST directly.
  const negative = `bli-adv-${stamp}-negative`;
  await writeProbe({
    probe: "A9 negative billing amount",
    actor: "treasury",
    want: "BLOCKED_LOUD",
    note: "billing_line_items_amount_nonnegative — the model the other rules should follow",
    attempt: (db) => db.from("billing_line_items").insert({
      id: negative, description: `${TAG} CREDIT`, amount: -5000, currency: "PHP",
      status: "unbilled", booking_id: ID.booking, project_number: PROJECT_NUMBER,
      catalog_item_id: CATALOG_REVENUE_ITEM,
    }),
    changed: async () => {
      const { data } = await admin.from("billing_line_items").select("id").eq("id", negative);
      return (data?.length ?? 0) > 0;
    },
  });
  await admin.from("billing_line_items").delete().eq("id", negative);
});

// ═════════════════════════════════════════════════════════════════════════════
// B. Billings — the E15 family, from both sides
// ═════════════════════════════════════════════════════════════════════════════

test("B1 Operations cannot read the charges on its own booking", async () => {
  await readProbe({
    probe: "B1 read billings on own booking",
    actor: "ops",
    want: "HIDDEN",
    note: "E15 — the SELECT policy passes a NULL owner, so team/own dials deny",
    attempt: (db) => db.from("billing_line_items").select("id").eq("booking_id", ID.booking),
  });
});

test("B2 Operations CAN write a charge it will never be able to see", async () => {
  // The sharper half of E15. The INSERT check is `can_billings('create')`, which
  // she passes — only the SELECT policy has the NULL-owner bug. So the write
  // lands. The UI reported failure because it asks for the row back
  // (.insert().select()), and the RETURNING read is what RLS refuses.
  //
  // A row nobody in her department can read, edit, void or invoice.
  const orphan = `bli-adv-${stamp}-orphan`;
  await writeProbe({
    probe: "B2 write a charge she cannot read",
    actor: "ops",
    want: "BREACH",
    note: "G3 — insert passes, select denies: write-only rows",
    attempt: (db) => db.from("billing_line_items").insert({
      id: orphan, description: `${TAG} ORPHAN`, amount: 1000, currency: "PHP",
      status: "unbilled", service_type: "Forwarding", booking_id: ID.booking,
      project_number: PROJECT_NUMBER, catalog_item_id: CATALOG_REVENUE_ITEM,
    }),
    changed: async () => {
      const { data } = await admin.from("billing_line_items").select("id").eq("id", orphan);
      return (data?.length ?? 0) > 0;
    },
  });
  await admin.from("billing_line_items").delete().eq("id", orphan);
});

// ═════════════════════════════════════════════════════════════════════════════
// C. Invoices — the approval gate
// ═════════════════════════════════════════════════════════════════════════════

test("C1 a non-approver cannot approve an invoice", async () => {
  // approve_invoice is the one place in this codebase that does it properly:
  // a SECURITY DEFINER function that re-checks "am I the designated approver"
  // server-side and RAISEs. It is the model the status transitions should follow.
  const db = await as("pricingMgr");
  const { error } = await db.rpc("approve_invoice", { p_invoice_id: ID.invoice });
  const approved = await fieldIs("invoices", ID.invoice, "approval_status", "approved");
  const got: Verdict = approved ? "BREACH" : error ? "BLOCKED_LOUD" : "BLOCKED_SILENT";
  results.push({
    probe: "C1 approve an invoice you were not routed", actor: "pricingMgr",
    got, want: "BLOCKED_LOUD", note: "approve_invoice re-checks the approver and raises",
  });
  expect(got).toBe("BLOCKED_LOUD");
});

test("C2 Accounting can issue an invoice that was never approved", async () => {
  // handleFinalize refuses when approval_status !== 'approved' — in the client.
  // invoices_update has no such condition, so the same person can post the
  // invoice straight past the approver the routing engine chose.
  await writeProbe({
    probe: "C2 finalize before approval",
    actor: "treasury",
    want: "BREACH",
    note: "G4 — NEU-103's approval gate is client-side only",
    attempt: (db) => db.from("invoices").update({ status: "posted" }).eq("id", ID.invoice),
    changed: () => fieldIs("invoices", ID.invoice, "status", "posted"),
  });
});

test("C3 the routed approver CAN see an invoice she has no grant for", async () => {
  // A positive control for the one mechanism in this codebase that gets routing
  // right end to end. Mariella holds no invoice grants at all; she can read this
  // row solely because invoices_select_approver matches her to the materialized
  // approver while it is pending. Routing grants the sight-line, not a profile.
  await readProbe({
    probe: "C3 approver reads the routed invoice",
    actor: "opsMgr",
    want: "VISIBLE",
    note: "invoices_select_approver — the row is visible because she is the approver",
    attempt: (db) => db.from("invoices").select("id").eq("id", ID.invoice),
  });
});

test("C4 the approver cannot edit the invoice she is approving", async () => {
  // And the sight-line is all she gets: no invoice edit grant, so a direct
  // UPDATE finds nothing. The RPC is the only door — which is why approval had
  // to be a SECURITY DEFINER function rather than a status flip from the client.
  await writeProbe({
    probe: "C4 approver edits the invoice directly",
    actor: "opsMgr",
    want: "BLOCKED_SILENT",
    note: "read via the approver policy, write only via approve_invoice",
    attempt: (db) => db.from("invoices").update({ total_amount: 1 }).eq("id", ID.invoice),
    changed: async () => {
      const { data } = await admin.from("invoices").select("total_amount").eq("id", ID.invoice).maybeSingle();
      return Number((data as { total_amount?: number } | null)?.total_amount) === 1;
    },
  });
});

test("C5 a collection can exceed the invoice it settles", async () => {
  // CollectionCreatorPanel allocates against the open balance and will not let
  // you over-apply. Nothing below the form agrees: collections has no balance
  // check, so a payment of ten times the invoice posts happily and the customer
  // ledger goes negative.
  const over = `col-adv-${stamp}`;
  await writeProbe({
    probe: "C5 collect 10x the invoice total",
    actor: "treasury",
    want: "BREACH",
    note: "G6 — over-application is prevented only by the allocation UI",
    attempt: (db) => db.from("collections").insert({
      id: over, collection_number: `${TAG}-COL-${stamp}`, amount: 250000, currency: "PHP",
      payment_method: "Bank Transfer", customer_name: `${TAG} CUSTOMER`,
      invoice_id: ID.invoice, booking_id: ID.booking, project_number: PROJECT_NUMBER,
      collection_date: new Date().toISOString(), status: "posted",
    }),
    changed: async () => {
      const { data } = await admin.from("collections").select("id").eq("id", over);
      return (data?.length ?? 0) > 0;
    },
  });
  await admin.from("collections").delete().eq("id", over);
});

// ═════════════════════════════════════════════════════════════════════════════
// D. Catalog doctrine — "no line item may omit catalog_item_id"
// ═════════════════════════════════════════════════════════════════════════════

test("D1 a billing line can be written with no catalog item", async () => {
  // The catalog rules in CLAUDE.md are absolute — no revenue line outside the
  // Billing Catalog, no insert without catalog_item_id. They are enforced by the
  // combobox and by nothing else: the column is nullable and there is no check
  // constraint, so any caller that isn't the form can write free text.
  const freeText = `bli-adv-${stamp}-freetext`;
  await writeProbe({
    probe: "D1 billing line with no catalog item",
    actor: "treasury",
    want: "BREACH",
    note: "G5 — catalog doctrine is a form convention, not a constraint",
    attempt: (db) => db.from("billing_line_items").insert({
      id: freeText, description: "MADE UP CHARGE", amount: 9999, currency: "PHP",
      status: "unbilled", booking_id: ID.booking, project_number: PROJECT_NUMBER,
      catalog_item_id: null,
    }),
    changed: async () => {
      const { data } = await admin.from("billing_line_items").select("id").eq("id", freeText);
      return (data?.length ?? 0) > 0;
    },
  });
  await admin.from("billing_line_items").delete().eq("id", freeText);
});

// ═════════════════════════════════════════════════════════════════════════════
// E. Cross-department visibility
// ═════════════════════════════════════════════════════════════════════════════

test("E1 BD cannot read another department's e-voucher", async () => {
  await readProbe({
    probe: "E1 BD reads an Ops e-voucher",
    actor: "bd",
    want: "HIDDEN",
    note: "not the creator, not the approver's department, not the cash receiver",
    attempt: (db) => db.from("evouchers").select("id").eq("id", ID.evC),
  });
});
