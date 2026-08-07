#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Persona / grant extractor — the second half of the capability inventory.
//
//   node scripts/inventory-personas.mjs        → writes docs/qa/personas.json
//
// inventory-capabilities.mjs maps the DOORS (what the system declares can be
// done). This maps the KEYS (who actually holds what), which lives only in the
// database: access profiles are templates, and applying one MATERIALIZES an
// absolute grant blob into permission_overrides.module_grants.
//
// Grant keys are composite: "moduleId:action" → true.
//
// Reads dev only. Never writes.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "qa");

// ─── env ─────────────────────────────────────────────────────────────────────

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

// ─── door list from the static inventory ─────────────────────────────────────

const invPath = path.join(OUT, "inventory.json");
if (!fs.existsSync(invPath)) {
  console.error("Run scripts/inventory-capabilities.mjs first.");
  process.exit(1);
}
const inv = JSON.parse(fs.readFileSync(invPath, "utf8"));

const doors = new Map(); // moduleId → { dept, label, isTab, applicable:Set }
for (const d of inv.departments) {
  for (const m of d.modules) {
    doors.set(m.moduleId, {
      dept: d.label, label: m.label, isTab: false, applicable: new Set(m.actions),
    });
    for (const t of m.tabs)
      doors.set(t.moduleId, {
        dept: d.label, label: t.label, isTab: true, applicable: new Set(t.actions),
      });
  }
}
// moduleId → the route a smoke test can actually visit.
//
// A module often has both a list route and a detail route under the same guard
// (/bd/contacts and /bd/contacts/:contactId). Only the parameterless one can be
// navigated to directly — visiting a literal ":contactId" matches no route and
// bounces to the dashboard, which previously showed up as a false RouteGuard
// contradiction in the smoke run. Prefer parameterless; fall back to the
// parameterised path only when a module has nothing else, and never let a
// parameterised route overwrite a parameterless one.
const routeByModule = new Map();
for (const r of inv.routes) {
  if (!r.guard?.moduleId) continue;
  const existing = routeByModule.get(r.guard.moduleId);
  if (existing && !existing.includes(":")) continue; // keep the visitable one
  routeByModule.set(r.guard.moduleId, r.path);
}

// ─── fetch ───────────────────────────────────────────────────────────────────

const { data: users, error: uErr } = await db
  .from("users")
  // ev_approval_authority is deliberately absent — migration 268 drops it.
  .select("id,name,email,role,department,position,is_active,access_profile_id");
if (uErr) throw uErr;

const { data: overrides, error: oErr } = await db
  .from("permission_overrides")
  .select("user_id,scope,departments,module_grants,applied_profile_id,visibility_scopes");
if (oErr) throw oErr;

const { data: profiles, error: pErr } = await db
  .from("access_profiles")
  .select("id,name,target_department,target_role,is_active,is_baseline");
if (pErr) throw pErr;

const { data: rules, error: rErr } = await db
  .from("routing_rules")
  .select("domain,label,trigger,authority,priority,active");
if (rErr) throw rErr;

const overrideBy = new Map(overrides.map((o) => [o.user_id, o]));
const profileBy = new Map(profiles.map((p) => [p.id, p]));

// ─── per-user capability map ─────────────────────────────────────────────────

const heldGlobally = new Set();
const staleKeyCounts = new Map(); // grant key not in schema → how many users hold it

const personas = users.map((u) => {
  const ov = overrideBy.get(u.id);
  const grants = ov?.module_grants ?? {};

  const held = [];   // { moduleId, action } that the schema declares
  const stale = [];  // grant keys pointing at a door the schema no longer has
  const inert = [];  // real door, but the action isn't applicable there

  for (const [key, value] of Object.entries(grants)) {
    if (value !== true) continue;
    const idx = key.lastIndexOf(":");
    const moduleId = key.slice(0, idx);
    const action = key.slice(idx + 1);
    const door = doors.get(moduleId);
    if (!door) {
      stale.push(key);
      staleKeyCounts.set(key, (staleKeyCounts.get(key) ?? 0) + 1);
      continue;
    }
    held.push({ moduleId, action });
    heldGlobally.add(`${moduleId}:${action}`);
    if (!door.applicable.has(action)) inert.push(key);
  }

  const pages = held
    .filter((h) => h.action === "view" && routeByModule.has(h.moduleId))
    .map((h) => routeByModule.get(h.moduleId))
    // Anything still carrying a :param can't be visited without seeding a real
    // record id — that belongs to tier 2/3, not the route smoke.
    .filter((p) => !p.includes(":"))
    .sort();

  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    department: u.department,
    position: u.position,
    isActive: u.is_active,
    profile: profileBy.get(u.access_profile_id)?.name ?? null,
    visibilityScope: ov?.scope ?? null,
    visibilityDepartments: ov?.departments ?? null,
    counts: { held: held.length, stale: stale.length, inert: inert.length, pages: pages.length },
    // routes this persona can actually load — the smoke-test worklist per user
    reachableRoutes: [...new Set(pages)],
    held,
    staleKeys: stale,
    inertKeys: inert,
  };
});

// ─── reconciliation ──────────────────────────────────────────────────────────

const declaredPairs = [];
for (const [moduleId, d] of doors)
  for (const a of d.applicable) declaredPairs.push(`${moduleId}:${a}`);

const unheldDoors = declaredPairs
  .filter((p) => !heldGlobally.has(p))
  .map((p) => {
    const i = p.lastIndexOf(":");
    const d = doors.get(p.slice(0, i));
    return { moduleId: p.slice(0, i), action: p.slice(i + 1), dept: d.dept, label: d.label };
  });

// ─── persona shortlist: widest grant set per (department, role) ──────────────

const byBucket = new Map();
for (const p of personas) {
  if (!p.isActive || !p.department) continue;
  const k = `${p.department} / ${p.role}`;
  const cur = byBucket.get(k);
  if (!cur || p.counts.held > cur.counts.held) byBucket.set(k, p);
}
const shortlist = [...byBucket.entries()]
  .map(([bucket, p]) => ({
    bucket, email: p.email, name: p.name, profile: p.profile,
    held: p.counts.held, routes: p.counts.pages, visibility: p.visibilityScope,
  }))
  .sort((a, b) => a.bucket.localeCompare(b.bucket));

const out = {
  source: "dev Supabase — users, permission_overrides, access_profiles, routing_rules",
  password: "devpassword123",
  totals: {
    users: users.length,
    activeUsers: users.filter((u) => u.is_active).length,
    usersWithOverrides: overrides.length,
    accessProfiles: profiles.length,
    declaredDoorActionPairs: declaredPairs.length,
    pairsHeldByAtLeastOneUser: heldGlobally.size,
    pairsHeldByNobody: unheldDoors.length,
    distinctStaleGrantKeys: staleKeyCounts.size,
    activeRoutingRules: rules.filter((r) => r.active).length,
  },
  shortlist,
  routingRules: rules,
  reconciliation: {
    pairsHeldByNobody: unheldDoors,
    staleGrantKeys: [...staleKeyCounts.entries()]
      .map(([key, users]) => ({ key, users }))
      .sort((a, b) => b.users - a.users),
  },
  personas,
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "personas.json"), JSON.stringify(out, null, 2));

console.log("Persona / grant map\n");
for (const [k, v] of Object.entries(out.totals)) console.log(`  ${k.padEnd(28)} ${v}`);
console.log("\nShortlist — widest active grant set per department/role");
for (const s of shortlist)
  console.log(
    `  ${s.bucket.padEnd(34)} ${String(s.held).padStart(4)} grants  ${String(s.routes).padStart(3)} routes  ${s.email}`
  );
console.log(`\n→ ${path.relative(ROOT, path.join(OUT, "personas.json"))}`);
