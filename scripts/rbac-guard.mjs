#!/usr/bin/env node
// NEU-012 step 10 — RBAC regression guard.
//
// Two layers:
//   1. STATIC  — scans src/ for legacy permission patterns that must never
//      return after the NEU-012 strict conversion:
//        a. imports of the deleted utils/permissions or utils/roles modules
//        b. calls to the deleted legacy permission functions
//        c. identity-based gating (role/department string comparisons) —
//           checked against a per-file allowlist of KNOWN SEMANTIC uses
//           (labels, seeds, workflow routing). A new comparison in a new file,
//           or a grown count in an allowlisted file, fails the guard: convert
//           it to usePermission().can(moduleId, action) or, if it is genuinely
//           semantic (data/routing, not gating), add it to the allowlist below
//           with a comment saying why.
//        d. action-applicability sync — every literal can("module", "action") /
//           hasExplicitGrant(...) call in src/ must be declared applicable in
//           config/access/actionApplicability.ts. Wiring a new affordance to a
//           knob the editor renders as inert "—" fails the guard: add the
//           action to the module's entry so the knob appears. (Dynamic first
//           args and DB-side RLS checks can't be traced statically — the map
//           was seeded from a full audit of those; keep it true by hand when
//           policies change.)
//   2. DB      — calls public.rbac_guard_report() (migration 167) and asserts
//      every section is empty: no identity-gated policies outside the
//      calendar/evoucher allowlist, no RLS-off tables, no wide-open INSERTs,
//      escalation trigger present, resolver chain present, legacy fns absent.
//      Skipped with a warning when DB env vars are missing.
//
// Usage:
//   node scripts/rbac-guard.mjs            # static + DB (if env present)
//   node scripts/rbac-guard.mjs --static   # static only
//
// DB env (.env.local — same as sync:dev):
//   VITE_SUPABASE_URL=...                  # dev project URL
//   DEV_SUPABASE_SERVICE_ROLE_KEY=...

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "src");
const STATIC_ONLY = process.argv.includes("--static");

// ── Static layer ──────────────────────────────────────────────────────────────

const FORBIDDEN = [
  { re: /from\s+["'][^"']*utils\/(permissions|roles)["']/, why: "imports the deleted legacy permissions/roles module" },
  { re: /\b(canPerformEVAction|canDeleteEVoucher|canAccessModule|canPerformQuotationAction|canPerformProjectAction|canPerformBookingAction)\b/, why: "calls a deleted legacy permission function" },
];

// Identity comparisons that are KNOWN SEMANTIC (not access gates). Counts are
// exact: if a file grows a new comparison, the guard fails until it is either
// converted to can() or consciously allowlisted here.
const IDENTITY_RE = /===\s*["'](manager|director|team_leader|executive|Executive)["']/g;
const IDENTITY_ALLOWLIST = {
  // routing / workflow semantics
  "src/lib/dashboardFetchers.ts": 1,                                    // exec queue copy
  "src/utils/evoucherApproval.ts": 1,                                   // EV routing context
  "src/components/accounting/evouchers/EVoucherWorkflowPanel.tsx": 1,   // submit-target routing
  "src/components/MyHomepage.tsx": 3,                                   // dept queue display
  "src/components/inbox/FileCabinet.tsx": 1,                            // drawer ownerDepts scoping (data-driven config)
  // labels / form state
  "src/components/admin/UserDetailPage.tsx": 4,                         // role labels + dept display
  "src/components/settings/Settings.tsx": 2,                            // role labels
  "src/components/admin/CreateUserPage.tsx": 2,                         // form state (role + dept on one line)
  // access-profile infrastructure (builds the grants themselves)
  "src/supabase/seeds/accessProfileSeedBuilder.ts": 4,
  "src/components/admin/accessProfiles/AccessProfiles.tsx": 2,
  "src/components/admin/accessProfiles/accessGrantUtils.ts": 3,
  // assignment role keys (booking role slots, not user identity)
  "src/components/operations/CreateBrokerageBookingPanel.tsx": 1,
  "src/components/operations/forwarding/CreateForwardingBookingPanel.tsx": 1,
};

// ── Static layer d: action-applicability sync ─────────────────────────────────
// Parse the applicability map (format is line-regex-parseable by contract —
// see the FORMAT IS LOAD-BEARING note in that file).
const APPLICABILITY_FILE = "src/config/access/actionApplicability.ts";
const applicabilityText = readFileSync(join(ROOT, APPLICABILITY_FILE), "utf8");
const APPLICABLE = new Map(); // moduleId -> Set(actions)
for (const m of applicabilityText.matchAll(/^\s{2}([a-z_]+):\s*\[([^\]]*)\],\s*$/gm)) {
  APPLICABLE.set(m[1], new Set([...m[2].matchAll(/"([a-z]+)"/g)].map(a => a[1])));
}
if (APPLICABLE.size < 100) {
  console.error(`✗ RBAC static guard FAILED: parsed only ${APPLICABLE.size} entries from ${APPLICABILITY_FILE} — format drift?`);
  process.exit(1);
}

// Literal permission checks: can("module", "action") / hasExplicitGrant(...).
// Legacy keys outside the ModuleId union (acct_billings/acct_expenses/
// acct_collections — still honored by RLS, absent from the grid) go through
// canKey() wrappers and are intentionally not matched here.
const CAN_LITERAL_RE = /\b(?:can|hasExplicitGrant)\(\s*["']([a-z_]+)["']\s*,\s*["']([a-z]+)["']/g;

const SKIP_DIRS = new Set(["node_modules", "migrations", "docs"]);
const SKIP_FILE_RE = /\.(test|spec)\.[tj]sx?$|\.(md|sql|css|json)$/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* walk(p);
    } else if (/\.[tj]sx?$/.test(name) && !SKIP_FILE_RE.test(name)) {
      yield p;
    }
  }
}

const failures = [];

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).split(sep).join("/");
  const text = readFileSync(file, "utf8");

  for (const { re, why } of FORBIDDEN) {
    const m = text.match(re);
    if (m) failures.push(`${rel}: ${why} (${m[0].trim().slice(0, 60)})`);
  }

  const count = (text.match(IDENTITY_RE) || []).length;
  if (count > 0) {
    const allowed = IDENTITY_ALLOWLIST[rel] ?? 0;
    if (count > allowed) {
      failures.push(
        `${rel}: ${count} identity comparison(s) (allowlisted: ${allowed}). ` +
        `Convert new gates to usePermission().can(), or allowlist if semantic.`,
      );
    }
  }

  if (rel === APPLICABILITY_FILE) continue; // the map's own docs mention can("…")
  for (const m of text.matchAll(CAN_LITERAL_RE)) {
    const [, moduleId, action] = m;
    const actions = APPLICABLE.get(moduleId);
    if (!actions) {
      failures.push(`${rel}: can("${moduleId}", "${action}") — moduleId missing from ${APPLICABILITY_FILE} (typo, or add the module)`);
    } else if (!actions.has(action)) {
      failures.push(`${rel}: can("${moduleId}", "${action}") — action not declared applicable in ${APPLICABILITY_FILE}; the editor renders this knob as inert "—"`);
    }
  }
}

if (failures.length) {
  console.error("✗ RBAC static guard FAILED:\n");
  for (const f of failures) console.error("  • " + f);
  process.exit(1);
}
console.log("✓ RBAC static guard passed");

// ── DB layer ──────────────────────────────────────────────────────────────────

if (STATIC_ONLY) process.exit(0);

const DEV_URL = process.env.VITE_SUPABASE_URL || process.env.DEV_SUPABASE_URL;
const DEV_KEY = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY;

if (!DEV_URL || !DEV_KEY) {
  console.warn("⚠ DB guard skipped: VITE_SUPABASE_URL / DEV_SUPABASE_SERVICE_ROLE_KEY not set");
  process.exit(0);
}

const { createClient } = await import("@supabase/supabase-js");
const db = createClient(DEV_URL, DEV_KEY, { auth: { persistSession: false } });
const { data: report, error } = await db.rpc("rbac_guard_report");
if (error) {
  console.error(`✗ RBAC DB guard errored: ${error.message} (is migration 167 applied?)`);
  process.exit(1);
}

const dbFailures = [];
for (const [section, value] of Object.entries(report)) {
  if (section === "users_escalation_guard_present") {
    if (value !== true) dbFailures.push("users escalation-guard trigger is MISSING");
  } else if (Array.isArray(value) && value.length > 0) {
    dbFailures.push(`${section}: ${JSON.stringify(value)}`);
  }
}

if (dbFailures.length) {
  console.error("✗ RBAC DB guard FAILED:\n");
  for (const f of dbFailures) console.error("  • " + f);
  process.exit(1);
}
console.log("✓ RBAC DB guard passed");
