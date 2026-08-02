#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Capability inventory — derives "what is currently possible in Neuron OS"
// straight from the source. Re-run it; never hand-maintain the output.
//
//   node scripts/inventory-capabilities.mjs            → writes docs/qa/inventory.json
//   node scripts/inventory-capabilities.mjs --md       → also writes inventory.md
//
// Four axes, each from its own authoritative source:
//   1. surface  — ACCESS_SCHEMA: department → module → tab, + applicable actions
//   2. routes   — App.tsx: path → the GuardedLayout moduleId that gates it
//   3. writes   — every supabase .insert/.update/.upsert/.delete/.rpc call site
//   4. orphans  — reconciliation: doors with no route, routes with no door
// ─────────────────────────────────────────────────────────────────────────────

import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const OUT_DIR = path.join(ROOT, "docs", "qa");

// ─── 1. surface: load the canonical access schema ────────────────────────────
// accessSchema.ts / actionApplicability.ts are TS with type-only imports, so we
// bundle them through esbuild and import the result rather than regex-scraping.

async function loadSurface() {
  const entry = path.join(OUT_DIR, ".surface-entry.ts");
  const bundled = path.join(OUT_DIR, ".surface-bundle.mjs");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    entry,
    `export { ACCESS_SCHEMA, DEPT_LABEL } from "${path
      .join(SRC, "config/access/accessSchema")
      .replace(/\\/g, "/")}";\n` +
      `export { APPLICABLE_ACTIONS } from "${path
        .join(SRC, "config/access/actionApplicability")
        .replace(/\\/g, "/")}";\n`
  );
  await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: bundled,
    logLevel: "silent",
  });
  const mod = await import(pathToFileURL(bundled).href + `?t=${Date.now()}`);
  fs.rmSync(entry, { force: true });
  fs.rmSync(bundled, { force: true });

  const departments = [];
  for (const dept of mod.ACCESS_SCHEMA) {
    departments.push({
      id: dept.id,
      label: dept.label,
      modules: dept.modules.map((m) => ({
        moduleId: m.moduleId,
        label: m.label,
        actions: mod.APPLICABLE_ACTIONS[m.moduleId] ?? [],
        tabs: m.tabs.map((t) => ({
          moduleId: t.moduleId,
          label: t.label,
          actions: mod.APPLICABLE_ACTIONS[t.moduleId] ?? [],
        })),
      })),
    });
  }
  return departments;
}

// ─── 2. routes: App.tsx path → guarding moduleId ─────────────────────────────
// Guards are `<Route element={<GuardedLayout requiredPermission={{ moduleId:
// "x", action: "view" }} />}>` wrapping child <Route path=...>. Nesting is one
// level deep today; the stack handles deeper nesting if that changes.

function parseRoutes() {
  const lines = fs.readFileSync(path.join(SRC, "App.tsx"), "utf8").split(/\r?\n/);
  const routes = [];
  const stack = []; // active guards, innermost last

  lines.forEach((line, i) => {
    const t = line.trim();

    if (t.startsWith("</Route>")) {
      stack.pop();
      return;
    }

    if (t.includes("<GuardedLayout")) {
      const perm = /moduleId:\s*"([^"]+)"\s*,\s*action:\s*"([^"]+)"/.exec(t);
      const pred = /predicateLabel="([^"]+)"/.exec(t);
      stack.push(
        perm
          ? { kind: "permission", moduleId: perm[1], action: perm[2] }
          : { kind: "predicate", label: pred?.[1] ?? "unknown" }
      );
      // Self-closing guard rows (`... />}>`) still open a block — no pop here.
      return;
    }

    const m = /<Route\s+path="([^"]+)"\s+element=\{<([A-Za-z0-9_]+)/.exec(t);
    if (m) {
      const guard = stack[stack.length - 1] ?? null;
      routes.push({
        path: m[1],
        element: m[2],
        line: i + 1,
        guard,
        dynamic: m[1].includes(":"),
        // a path with no :params can be visited directly by the smoke runner
        smokeable: !m[1].includes(":") && !m[1].includes("*"),
      });
      // single-line self-closing <Route ... /> does not open a block
    }
  });

  return routes;
}

// ─── 3. writes: every mutation call site ─────────────────────────────────────

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", "ui"]);

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), acc);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      acc.push(path.join(dir, e.name));
    }
  }
  return acc;
}

function parseWrites() {
  const writes = [];
  const rpcs = [];
  // .from("t") ... .insert(  — allow chained selects/filters in between
  const WRITE_RE =
    /\.from\(\s*["'`]([a-z0-9_]+)["'`]\s*\)([\s\S]{0,300}?)\.(insert|update|upsert|delete)\s*\(/g;
  const RPC_RE = /\.rpc\(\s*["'`]([a-z0-9_]+)["'`]/g;

  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const lineAt = (idx) => text.slice(0, idx).split("\n").length;

    for (const m of text.matchAll(WRITE_RE)) {
      // a `.from(` restarting inside the gap means these aren't the same chain
      if (m[2].includes(".from(")) continue;
      writes.push({ file: rel, line: lineAt(m.index), table: m[1], op: m[3] });
    }
    for (const m of text.matchAll(RPC_RE)) {
      rpcs.push({ file: rel, line: lineAt(m.index), fn: m[1] });
    }
  }
  return { writes, rpcs };
}

// ─── 4. reconcile ────────────────────────────────────────────────────────────

function reconcile(departments, routes) {
  const doors = new Map(); // moduleId → {dept, label, isTab}
  for (const d of departments) {
    for (const m of d.modules) {
      doors.set(m.moduleId, { dept: d.label, label: m.label, isTab: false });
      for (const t of m.tabs)
        doors.set(t.moduleId, { dept: d.label, label: t.label, isTab: true });
    }
  }

  const guardedModuleIds = new Set(
    routes.map((r) => r.guard?.moduleId).filter(Boolean)
  );

  return {
    // pages declared in the access matrix that no route enforces
    doorsWithoutRoute: [...doors.entries()]
      .filter(([id, d]) => !d.isTab && !guardedModuleIds.has(id))
      .map(([id, d]) => ({ moduleId: id, dept: d.dept, label: d.label })),
    // routes reachable with no module gate at all
    ungatedRoutes: routes
      .filter((r) => !r.guard)
      .map((r) => ({ path: r.path, element: r.element, line: r.line })),
    // guards pointing at a moduleId the schema doesn't declare
    guardsWithoutDoor: [...guardedModuleIds]
      .filter((id) => !doors.has(id))
      .map((id) => ({ moduleId: id })),
  };
}

// ─── main ────────────────────────────────────────────────────────────────────

const departments = await loadSurface();
const routes = parseRoutes();
const { writes, rpcs } = parseWrites();
const recon = reconcile(departments, routes);

const moduleCount = departments.reduce((n, d) => n + d.modules.length, 0);
const tabCount = departments.reduce(
  (n, d) => n + d.modules.reduce((k, m) => k + m.tabs.length, 0),
  0
);
const actionCount = departments.reduce(
  (n, d) =>
    n +
    d.modules.reduce(
      (k, m) =>
        k + m.actions.length + m.tabs.reduce((j, t) => j + t.actions.length, 0),
      0
    ),
  0
);

const inventory = {
  generatedFrom: "src/config/access/accessSchema.ts, src/App.tsx, src/**/*.ts(x)",
  totals: {
    departments: departments.length,
    modules: moduleCount,
    tabs: tabCount,
    doorActionPairs: actionCount,
    routes: routes.length,
    smokeableRoutes: routes.filter((r) => r.smokeable).length,
    writeCallSites: writes.length,
    distinctTables: new Set(writes.map((w) => w.table)).size,
    rpcCallSites: rpcs.length,
    distinctRpcs: new Set(rpcs.map((r) => r.fn)).size,
  },
  departments,
  routes,
  writes,
  rpcs,
  reconciliation: recon,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(
  path.join(OUT_DIR, "inventory.json"),
  JSON.stringify(inventory, null, 2)
);

console.log("Capability inventory\n");
for (const [k, v] of Object.entries(inventory.totals)) {
  console.log(`  ${k.padEnd(20)} ${v}`);
}
console.log("\nReconciliation");
console.log(`  doorsWithoutRoute    ${recon.doorsWithoutRoute.length}`);
console.log(`  ungatedRoutes        ${recon.ungatedRoutes.length}`);
console.log(`  guardsWithoutDoor    ${recon.guardsWithoutDoor.length}`);
console.log(`\n→ ${path.relative(ROOT, path.join(OUT_DIR, "inventory.json"))}`);

if (process.argv.includes("--md")) {
  const md = [];
  md.push("# Neuron OS — Capability Inventory\n");
  md.push("_Generated by `scripts/inventory-capabilities.mjs`. Do not edit._\n");
  for (const [k, v] of Object.entries(inventory.totals)) md.push(`- **${k}**: ${v}`);
  for (const d of departments) {
    md.push(`\n## ${d.label}\n`);
    for (const m of d.modules) {
      const route = routes.find((r) => r.guard?.moduleId === m.moduleId);
      md.push(
        `### ${m.label} \`${m.moduleId}\`${route ? ` — \`${route.path}\`` : " — _no route_"}`
      );
      md.push(`actions: ${m.actions.join(", ") || "—"}\n`);
      for (const t of m.tabs)
        md.push(`- ${t.label} \`${t.moduleId}\` — ${t.actions.join(", ") || "—"}`);
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, "inventory.md"), md.join("\n"));
  console.log(`→ ${path.relative(ROOT, path.join(OUT_DIR, "inventory.md"))}`);
}
