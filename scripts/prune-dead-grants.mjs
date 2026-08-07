#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Prune dead keys from permission_overrides.module_grants.
//
//   node scripts/prune-dead-grants.mjs            → dry run, writes nothing
//   node scripts/prune-dead-grants.mjs --apply    → archives, then prunes
//   node scripts/prune-dead-grants.mjs --stale-only [--apply]
//
// Grant keys are "moduleId:action". Applying an access profile MATERIALIZES an
// absolute blob, so every key ever written survives forever. Two kinds rot:
//
//   stale — moduleId is not in ACCESS_SCHEMA at all. The door is gone (14 keys
//           are residue from the accounting removal, migrations 250-252; 19 more
//           predate ACCESS_SCHEMA existing). Nothing can ever consult these.
//
//   inert — moduleId exists, but the action is not in APPLICABLE_ACTIONS for it.
//           NOT strictly dead: enforcement reads module_grants directly, so
//           can(module, action) would return TRUE for these. They are latent
//           grants nobody intended — e.g. inbox:export held by 40 users. If an
//           Export button is ever added to Inbox, those users get it silently.
//
// Everything removed is archived to public.permission_grant_archive AND to a
// timestamped JSON file, so the operation is reversible either way.
//
// Reads/writes dev only — refuses to run against the prod project ref.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "qa");
const APPLY = process.argv.includes("--apply");
const STALE_ONLY = process.argv.includes("--stale-only");

for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const URL = process.env.DEV_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Missing DEV_SUPABASE_URL / DEV_SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (/ubspbukgcxmzegnomlgi/.test(URL)) {
  console.error("Refusing to run: that URL is the PRODUCTION project.");
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false } });

// ─── the door list, from the generated inventory ─────────────────────────────

const invPath = path.join(OUT, "inventory.json");
if (!fs.existsSync(invPath)) {
  console.error("Run scripts/inventory-capabilities.mjs first.");
  process.exit(1);
}
const inv = JSON.parse(fs.readFileSync(invPath, "utf8"));

const doors = new Map(); // moduleId → Set(applicable actions)
for (const d of inv.departments) {
  for (const m of d.modules) {
    doors.set(m.moduleId, new Set(m.actions));
    for (const t of m.tabs) doors.set(t.moduleId, new Set(t.actions));
  }
}

// Safety rail: if APPLICABLE_ACTIONS were ever missing entries, every grant on
// that door would look inert and get pruned. Refuse rather than guess.
const emptyDoors = [...doors.entries()].filter(([, a]) => a.size === 0).map(([id]) => id);
if (emptyDoors.length && !STALE_ONLY) {
  console.error(
    `Refusing to prune: ${emptyDoors.length} door(s) have no applicable actions, ` +
      `so their grants cannot be classified.\n  ${emptyDoors.slice(0, 10).join("\n  ")}\n` +
      `Re-run with --stale-only, or fix APPLICABLE_ACTIONS.`
  );
  process.exit(1);
}

// ─── classify ────────────────────────────────────────────────────────────────

const { data: overrides, error } = await db
  .from("permission_overrides")
  .select("user_id,module_grants");
if (error) throw error;

const plan = [];
let staleTotal = 0;
let inertTotal = 0;

for (const row of overrides) {
  const grants = row.module_grants ?? {};
  const removed = {};

  for (const [key, value] of Object.entries(grants)) {
    const i = key.lastIndexOf(":");
    const moduleId = key.slice(0, i);
    const action = key.slice(i + 1);
    const door = doors.get(moduleId);

    if (!door) {
      removed[key] = value;
      staleTotal++;
    } else if (!STALE_ONLY && !door.has(action)) {
      removed[key] = value;
      inertTotal++;
    }
  }

  if (Object.keys(removed).length) {
    const after = { ...grants };
    for (const k of Object.keys(removed)) delete after[k];
    plan.push({ userId: row.user_id, before: grants, removed, after });
  }
}

const keptTotal = overrides.reduce(
  (n, r) => n + Object.keys(r.module_grants ?? {}).length, 0
) - staleTotal - inertTotal;

console.log(APPLY ? "PRUNE — applying\n" : "PRUNE — dry run (pass --apply to write)\n");
console.log(`  users with overrides       ${overrides.length}`);
console.log(`  users affected             ${plan.length}`);
console.log(`  stale keys (door gone)     ${staleTotal}`);
console.log(`  inert keys (action n/a)    ${STALE_ONLY ? "skipped" : inertTotal}`);
console.log(`  keys kept                  ${keptTotal}`);

if (!plan.length) {
  console.log("\nNothing to prune.");
  process.exit(0);
}

// ─── file archive (written in both modes, so a dry run still leaves evidence) ─

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const archivePath = path.join(OUT, `grant-prune-${stamp}${APPLY ? "" : ".dryrun"}.json`);
fs.writeFileSync(
  archivePath,
  JSON.stringify(
    { generatedAt: new Date().toISOString(), mode: APPLY ? "apply" : "dry-run",
      staleOnly: STALE_ONLY, staleTotal, inertTotal, plan },
    null, 2
  )
);
console.log(`\n  file archive → ${path.relative(ROOT, archivePath)}`);

if (!APPLY) {
  console.log("\nDry run — database untouched.");
  process.exit(0);
}

// ─── archive to the table, THEN prune ────────────────────────────────────────

const reason = STALE_ONLY
  ? "prune dead grants: stale keys only (door absent from ACCESS_SCHEMA)"
  : "prune dead grants: stale (door absent) + inert (action not applicable)";

const { error: archErr } = await db.from("permission_grant_archive").insert(
  plan.map((p) => ({
    user_id: p.userId,
    reason,
    removed_keys: p.removed,
    grants_before: p.before,
  }))
);
if (archErr) {
  console.error("Archive failed — nothing pruned:", archErr.message);
  process.exit(1);
}
console.log(`  archived ${plan.length} row(s) to permission_grant_archive`);

let pruned = 0;
for (const p of plan) {
  const { error: upErr } = await db
    .from("permission_overrides")
    .update({ module_grants: p.after, updated_at: new Date().toISOString() })
    .eq("user_id", p.userId);
  if (upErr) {
    console.error(`  FAILED for ${p.userId}: ${upErr.message}`);
    continue;
  }
  pruned++;
}

console.log(`  pruned ${pruned}/${plan.length} user(s)`);
console.log("\nTo restore: permission_grant_archive holds grants_before per user.");
