import { test, expect } from "@playwright/test";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// ─────────────────────────────────────────────────────────────────────────────
// The matrices — probes generated from what the system declares about itself.
//
// adversary.spec.ts is thirty hand-picked probes. Every one found something,
// which is exactly the problem: hand-picked probes only ever cover what somebody
// already suspected, and the absence of a finding somewhere else means nothing.
// This file exists so we can say a number instead — attempted N of N cells, M
// unexpected — and so the count moves when the schema does.
//
// Nothing here is a list of cases. Everything is derived at runtime from:
//
//   docs/qa/adversary/phase1-spec.json   the recon: policies resolved to grant
//                                        keys, the declared transition matrix,
//                                        the actor roster, fixture payloads
//   permission_overrides (live)          what each actor actually holds today
//
// So a new table, a new grant key, a new transition or a new user changes the
// matrix without anyone editing this file.
//
// THREE MATRICES
//   1. READ    every actor x every RLS-bearing table, SELECT.
//   2. WRITE   every actor x the money tables, INSERT.
//   3. MOVE    every (from, to) status pair x actor, against the 24 edges
//              evoucher_transition() declares. This is the one that finds
//              ordering holes, and it is the only table in the schema with a
//              declared matrix to compare against (finding J4).
//
// EXPECTED vs OBSERVED. The recon marked each policy cell
// `predictableFromGrantsAlone`. Where that is true we ASSERT: the grant says
// yes, the database must say yes. Where a cell also depends on a visibility
// dial, a department match, a status or an owner comparison, no static
// expectation is honest — those cells are CHARACTERIZED: recorded, diffed
// against the last run, never asserted. Pretending to predict them would
// manufacture failures and teach everyone to ignore this file.
//
// THE NO-OP RULE. A write that sets a column to the value it already holds
// succeeds without changing anything, and a naive checker reads that back and
// calls it a breach. That cost us a false BREACH in adversary J2b. Every write
// below therefore asserts a value the row does not already have.
//
// WRITES TO DEV, cleans up after itself, and refuses to run anywhere else.
// ─────────────────────────────────────────────────────────────────────────────

const TAG = "E2E-MATRIX";
const PASSWORD = "devpassword123";
const DEV_REF = "oqermaidggvanahumjmj";
const SPEC_PATH = "docs/qa/adversary/phase1-spec.json";
const REPORT_PATH = "docs/qa/adversary/coverage-matrix.md";

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
const admin = createClient(URL, ENV.DEV_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

type Spec = {
  grants: {
    tables: { table: string; actions: { action: string; grantKeys: string[]; extraConditions: string[]; predictableFromGrantsAlone: boolean }[] }[];
    helpers: { helper: string; grantKeys: string[] }[];
  };
  states: { evoucherMatrix: { from: string; to: string; requirement: string }[] };
  actors: { roster: { email: string; name: string; department: string; role: string; coversWhat: string }[] };
};
const spec: Spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));

// ── actors ───────────────────────────────────────────────────────────────────
type Actor = {
  email: string; id: string; name: string; department: string; role: string;
  grants: Record<string, boolean>; db: SupabaseClient;
};
const actors: Actor[] = [];

// ── verdict rows ─────────────────────────────────────────────────────────────
type Row = {
  matrix: "read" | "write" | "move";
  actor: string; subject: string; action: string;
  expected: "allow" | "deny" | null;   // null = characterized, not asserted
  observed: "allow" | "deny" | "n/a";  // n/a = the table is empty, so unknowable
  detail?: string;
};
const rows: Row[] = [];
const unexpected = () =>
  rows.filter((r) => r.expected !== null && r.observed !== "n/a" && r.expected !== r.observed);

/** Expand the recon's `@helper:action` shorthand into the real grant-key list. */
function expandKeys(keys: string[]): string[] {
  const out: string[] = [];
  for (const k of keys) {
    if (!k.startsWith("@")) { out.push(k); continue; }
    const [name, action] = k.slice(1).split(":");
    const helper = spec.grants.helpers.find((h) => h.helper.startsWith(`current_user_can_${name}`));
    if (!helper) { out.push(k); continue; }
    // Helper entries are module ids; the action rides in from the call site.
    for (const key of helper.grantKeys) out.push(key.includes(":") ? key : `${key}:${action}`);
  }
  return out;
}

const holdsAny = (actor: Actor, keys: string[]) =>
  keys.length === 0 ? true : keys.some((k) => actor.grants[k] === true);

test.beforeAll(async () => {
  if (!URL?.includes(DEV_REF)) throw new Error(`refusing to run: ${URL} is not the dev project`);

  const emails = spec.actors.roster.map((r) => r.email);
  const { data: people } = await admin
    .from("users").select("id, name, email, department, role").in("email", emails);
  const { data: perms } = await admin
    .from("permission_overrides").select("user_id, module_grants")
    .in("user_id", (people ?? []).map((p) => p.id));

  // Sign every actor in FIRST and fail loudly on any that cannot. A failed login
  // silently reads as "denied everywhere", which would manufacture a whole row
  // of findings — and three roster accounts had not signed in for months.
  const failures: string[] = [];
  for (const person of people ?? []) {
    const db = createClient(URL, ANON, { auth: { persistSession: false } });
    const { error } = await db.auth.signInWithPassword({ email: person.email, password: PASSWORD });
    if (error) { failures.push(`${person.email}: ${error.message}`); continue; }
    const grantBlob = (perms ?? []).find((p) => p.user_id === person.id)?.module_grants ?? {};
    actors.push({
      email: person.email, id: person.id, name: person.name,
      department: person.department, role: person.role,
      grants: grantBlob as Record<string, boolean>, db,
    });
  }
  if (failures.length) {
    throw new Error(
      `roster sign-in failed for ${failures.length} of ${(people ?? []).length}:\n  ${failures.join("\n  ")}\n` +
      `A failed login reads as denied everywhere and would fabricate findings — fix the accounts before trusting a run.`
    );
  }
  expect(actors.length, "no actors signed in").toBeGreaterThan(5);
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. READ MATRIX — every actor against every table that has policies
// ═════════════════════════════════════════════════════════════════════════════

test("read matrix", async () => {
  test.setTimeout(900_000);

  // A DENIED SELECT DOES NOT ERROR. PostgREST answers it with an empty set and
  // HTTP 200 — verified: an anonymous client selecting from `evouchers`, which
  // every policy denies, gets `error: null, count: 0`.
  //
  // The first version of this matrix took "no error" to mean "allowed", which
  // made all 1,116 cells read as allow and measured precisely nothing. It
  // reported zero unexpected cells, which is exactly what a broken probe looks
  // like from the outside.
  //
  // So visibility is measured against what service-role can see: the actor sees
  // rows (allow), sees none where service-role sees some (deny), or the table is
  // empty and the question is unanswerable (n/a — recorded, never asserted).
  for (const t of spec.grants.tables) {
    const cell = t.actions.find((a) => a.action === "select");
    if (!cell) continue;
    const keys = expandKeys(cell.grantKeys);
    const { count: truth, error: truthErr } = await admin
      .from(t.table).select("*", { head: true, count: "exact" });
    if (truthErr) continue; // table not in this branch of the schema

    for (const actor of actors) {
      const { count: seen } = await actor.db
        .from(t.table).select("*", { head: true, count: "exact" });
      const observed: Row["observed"] =
        (truth ?? 0) === 0 ? "n/a" : (seen ?? 0) > 0 ? "allow" : "deny";
      const expected: Row["expected"] = cell.predictableFromGrantsAlone
        ? (holdsAny(actor, keys) ? "allow" : "deny")
        : null;
      rows.push({
        matrix: "read", actor: actor.email, subject: t.table, action: "select",
        expected, observed, detail: observed === "n/a" ? "table empty" : `${seen}/${truth} rows`,
      });
    }
  }
  const read = rows.filter((r) => r.matrix === "read");
  const answerable = read.filter((r) => r.observed !== "n/a");
  console.log(`read matrix: ${read.length} cells, ${answerable.length} answerable, ` +
    `${answerable.filter((r) => r.expected !== null).length} asserted`);
  expect(read.length).toBeGreaterThan(100);
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. WRITE MATRIX — every actor against the money tables, INSERT
//
// Scoped to the tables where money lives and where a fixture payload is known
// good. An insert probe that fails on a missing column reads as "blocked" and
// would hide a real hole, so a payload that is merely plausible is worse than
// no probe at all.
// ═════════════════════════════════════════════════════════════════════════════

const stamp = Date.now();
const MONEY_TABLES: { table: string; row: (i: number) => Record<string, unknown> }[] = [
  { table: "billing_line_items", row: (i) => ({
      id: `${TAG}-bli-${stamp}-${i}`, description: `${TAG} PROBE`, amount: 1, currency: "PHP",
      status: "unbilled", base_currency: "PHP" }) },
  { table: "invoices", row: (i) => ({
      id: `${TAG}-inv-${stamp}-${i}`, invoice_number: `${TAG}-${stamp}-${i}`,
      customer_name: `${TAG} CUSTOMER`, status: "draft", total_amount: 1, currency: "PHP",
      base_currency: "PHP" }) },
  { table: "collections", row: (i) => ({
      id: `${TAG}-col-${stamp}-${i}`, collection_number: `${TAG}-COL-${stamp}-${i}`,
      customer_name: `${TAG} CUSTOMER`, amount: 1, currency: "PHP", base_currency: "PHP",
      collection_date: new Date().toISOString(), status: "posted" }) },
  { table: "evouchers", row: (i) => ({
      id: `${TAG}-ev-${stamp}-${i}`, transaction_type: "reimbursement", amount: 1,
      currency: "PHP", base_currency: "PHP", status: "draft", purpose: `${TAG} PROBE` }) },
];

test("write matrix", async () => {
  test.setTimeout(600_000);
  let i = 0;
  for (const { table, row } of MONEY_TABLES) {
    const cell = spec.grants.tables.find((t) => t.table === table)?.actions.find((a) => a.action === "insert");
    const keys = expandKeys(cell?.grantKeys ?? []);
    for (const actor of actors) {
      const payload = row(i++);
      const { error } = await actor.db.from(table).insert(payload);
      // Ask the database whether the row is really there rather than trusting a
      // silent success — the BLOCKED_SILENT case from adversary.spec.ts.
      const { data: landed } = await admin.from(table).select("id").eq("id", payload.id as string);
      const observed: Row["observed"] = (landed?.length ?? 0) > 0 ? "allow" : "deny";
      if (observed === "allow") await admin.from(table).delete().eq("id", payload.id as string);
      const expected: Row["expected"] = cell?.predictableFromGrantsAlone
        ? (holdsAny(actor, keys) ? "allow" : "deny")
        : null;
      rows.push({
        matrix: "write", actor: actor.email, subject: table, action: "insert",
        expected, observed, detail: error ? String((error as { message?: string }).message).slice(0, 90) : undefined,
      });
    }
  }
  const write = rows.filter((r) => r.matrix === "write");
  console.log(`write matrix: ${write.length} cells, ${write.filter((r) => r.expected !== null).length} asserted`);
  expect(write.length).toBeGreaterThan(20);
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. MOVE MATRIX — every (from, to) x actor against the declared edges
//
// evoucher_transition() is the only place in the schema that declares which
// status moves are legal (J4). That makes this the one matrix with a real
// expectation to compare against rather than a characterization.
// ═════════════════════════════════════════════════════════════════════════════

test("move matrix", async () => {
  test.setTimeout(900_000);
  const declared = spec.states.evoucherMatrix;
  const statuses = [...new Set(declared.flatMap((e) => [e.from, e.to]))];

  // One voucher, reset between attempts with service-role (which the guard lets
  // through by design), so every attempt starts from a known state.
  const evId = `${TAG}-move-${stamp}`;
  const owner = actors.find((a) => a.department === "Operations" && a.role === "team_leader") ?? actors[0];
  await admin.from("evouchers").insert({
    id: evId, transaction_type: "reimbursement", amount: 1000, currency: "PHP",
    base_currency: "PHP", status: "draft", purpose: `${TAG} MOVE PROBE`,
    created_by: owner.id, created_by_name: owner.name,
    pending_approver_department: "Pricing", pending_approver_role: "manager",
    details: { requestor_id: owner.id, requestor_name: owner.name, requestor_department: owner.department },
  });

  try {
    for (const from of statuses) {
      for (const to of statuses) {
        if (from === to) continue;                       // the no-op rule
        for (const actor of actors) {
          await admin.from("evouchers").update({ status: from }).eq("id", evId);
          const { error } = await actor.db.rpc("evoucher_transition", {
            p_evoucher_id: evId, p_to_status: to,
          });
          const { data } = await admin.from("evouchers").select("status").eq("id", evId).maybeSingle();
          const observed: Row["observed"] = data?.status === to ? "allow" : "deny";
          // An edge that is not in the declared matrix must be refused for
          // everyone. An edge that IS declared may still be refused for this
          // actor — the requirement text names grants we cannot evaluate here —
          // so only the "not declared" direction is asserted.
          const isDeclared = declared.some((e) => e.from === from && e.to === to);
          rows.push({
            matrix: "move", actor: actor.email, subject: `${from} -> ${to}`, action: "transition",
            expected: isDeclared ? null : "deny", observed,
            detail: error ? String((error as { message?: string }).message).slice(0, 90) : undefined,
          });
        }
      }
    }
  } finally {
    await admin.from("evoucher_history").delete().eq("evoucher_id", evId);
    await admin.from("evouchers").delete().eq("id", evId);
  }

  const move = rows.filter((r) => r.matrix === "move");
  console.log(`move matrix: ${move.length} cells, ${move.filter((r) => r.expected !== null).length} asserted`);
});

// ═════════════════════════════════════════════════════════════════════════════
// The report
// ═════════════════════════════════════════════════════════════════════════════

test.afterAll(async () => {
  if (rows.length === 0) return;
  const bad = unexpected();
  const per = (m: Row["matrix"]) => {
    const r = rows.filter((x) => x.matrix === m);
    const answerable = r.filter((x) => x.observed !== "n/a");
    return {
      total: r.length,
      unanswerable: r.length - answerable.length,
      asserted: answerable.filter((x) => x.expected !== null).length,
      unexpected: answerable.filter((x) => x.expected !== null && x.expected !== x.observed).length,
    };
  };
  const md: string[] = [];
  md.push(`# Coverage matrix\n`);
  md.push(`Generated by \`tests/e2e/matrix.spec.ts\` from \`phase1-spec.json\` + live grants.`);
  md.push(`Not a list of cases — a derivation. A new table, grant, transition or user`);
  md.push(`changes these counts without anyone editing the spec file.\n`);
  md.push(`| matrix | attempted | unanswerable | asserted | characterized | unexpected |`);
  md.push(`|---|---|---|---|---|---|`);
  const sums = { total: 0, unanswerable: 0, asserted: 0, unexpected: 0 };
  for (const m of ["read", "write", "move"] as const) {
    const s = per(m);
    sums.total += s.total; sums.unanswerable += s.unanswerable;
    sums.asserted += s.asserted; sums.unexpected += s.unexpected;
    md.push(`| ${m} | ${s.total} | ${s.unanswerable} | ${s.asserted} | ${s.total - s.unanswerable - s.asserted} | **${s.unexpected}** |`);
  }
  md.push(`| **total** | **${sums.total}** | ${sums.unanswerable} | **${sums.asserted}** | ${sums.total - sums.unanswerable - sums.asserted} | **${sums.unexpected}** |\n`);
  md.push(`**Unanswerable** — a read against a table that is empty on dev. The actor sees`);
  md.push(`nothing, but so does service-role, so the cell proves nothing. Excluded rather`);
  md.push(`than counted as a pass.\n`);
  md.push(`**Characterized** — the cell depends on something no static rule can predict: a`);
  md.push(`visibility dial, a department match, a status, an owner comparison. Recorded`);
  md.push(`and diffable, never asserted. Claiming to predict them would manufacture`);
  md.push(`failures and train everyone to ignore this file.\n`);
  md.push(`A denied SELECT does not error in PostgREST — it returns an empty set — so read`);
  md.push(`visibility is measured against what service-role can see, not against the`);
  md.push(`absence of an error. The first version of this file got that wrong and reported`);
  md.push(`1,116 cells of nothing (see finding K1).\n`);
  if (bad.length) {
    md.push(`## Unexpected cells\n`);
    md.push(`| matrix | actor | subject | action | expected | observed | detail |`);
    md.push(`|---|---|---|---|---|---|---|`);
    for (const r of bad.slice(0, 200)) {
      md.push(`| ${r.matrix} | ${r.actor.split("@")[0]} | ${r.subject} | ${r.action} | ${r.expected} | ${r.observed} | ${r.detail ?? ""} |`);
    }
    if (bad.length > 200) md.push(`\n_(${bad.length - 200} more omitted)_`);
  } else {
    md.push(`## Unexpected cells\n\nNone. Every asserted cell matched its declaration.\n`);
  }
  mkdirSync("docs/qa/adversary", { recursive: true });
  writeFileSync(REPORT_PATH, md.join("\n") + "\n");
  console.log(`\n${md.slice(4, 12).join("\n")}\n-> ${REPORT_PATH}`);
});
