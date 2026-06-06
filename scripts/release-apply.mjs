// Programmatic dev->prod migration applier.
//
//   node --env-file=.env.local scripts/release-apply.mjs <first> <last>
//   e.g.  node --env-file=.env.local scripts/release-apply.mjs 139 167
//
// Applies src/supabase/migrations/<NNN>_*.sql whose numeric prefix is in
// [first, last], ascending, to PROD — exact file bytes, via the service_role-only
// release_exec_sql helper (install scripts/release-helper.sql in the prod SQL
// editor first). Records each in supabase_migrations.schema_migrations (version
// derived from the migration number; ON CONFLICT DO NOTHING) and STOPS on the
// first error.
//
// Run each range EXACTLY ONCE (data migrations like 154 are not idempotent).
// Safety: refuses to run unless PROD_SUPABASE_URL is the known prod ref.

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const PROD_REF = "ubspbukgcxmzegnomlgi";
const URL = process.env.PROD_SUPABASE_URL;
const KEY = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !URL.includes(PROD_REF)) { console.error("Refusing: PROD_SUPABASE_URL is not the prod ref."); process.exit(1); }
if (!KEY) { console.error("Missing PROD_SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const [firstArg, lastArg] = process.argv.slice(2);
const first = parseInt(firstArg, 10), last = parseInt(lastArg, 10);
if (!Number.isFinite(first) || !Number.isFinite(last)) { console.error("Usage: release-apply.mjs <first> <last>"); process.exit(1); }

const prod = createClient(URL, KEY, { auth: { persistSession: false } });
const dir = "src/supabase/migrations";
const quote = (s) => "'" + String(s).replace(/'/g, "''") + "'";

const files = fs.readdirSync(dir)
  .filter(f => /^\d+[a-z]?_.*\.sql$/.test(f))
  .map(f => ({ f, n: parseInt(f.match(/^(\d+)/)[1], 10) }))
  .filter(x => x.n >= first && x.n <= last)
  .sort((a, b) => a.n - b.n || a.f.localeCompare(b.f))
  .map(x => x.f);

if (files.length === 0) { console.error(`No migration files in [${first}, ${last}]`); process.exit(1); }
console.log(`Applying ${files.length} migration(s) to PROD [${first}-${last}]:`);

let applied = 0;
for (const f of files) {
  const name = f.replace(/\.sql$/, "");
  const sql = fs.readFileSync(path.join(dir, f), "utf8");
  // deterministic version from the leading number (e.g. 172b -> 20260607000172)
  const num = f.match(/^(\d+)([a-z]?)/);
  const version = "20260607" + String(num[1]).padStart(5, "0") + (num[2] ? num[2].charCodeAt(0) : 0);

  const { error: applyErr } = await prod.rpc("release_exec_sql", { p_sql: sql });
  if (applyErr) { console.error(`\nFAILED at ${f}:\n${applyErr.message}\n`); process.exit(1); }

  const rec = `insert into supabase_migrations.schema_migrations(version, name) values (${quote(version)}, ${quote(name)}) on conflict (version) do nothing;`;
  const { error: recErr } = await prod.rpc("release_exec_sql", { p_sql: rec });
  if (recErr) { console.error(`\napplied ${f} but FAILED to record: ${recErr.message}`); process.exit(1); }

  applied++;
  console.log(`  ok ${f}`);
}
console.log(`\nDone: ${applied} migration(s) applied + recorded on PROD.`);
