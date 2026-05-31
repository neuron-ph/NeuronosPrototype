/**
 * Applies baseline seeds directly to a Supabase project using the service-role
 * key (bypasses RLS). Reads creds from .env.local.
 *
 *   npx vite-node scripts/applyAccessProfileSeeds.ts dev    (default)
 *   npx vite-node scripts/applyAccessProfileSeeds.ts prod
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { buildSeeds } from "../src/supabase/seeds/accessProfileSeedBuilder";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(): Record<string, string> {
  const raw = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return env;
}

async function main() {
  const target = (process.argv[2] || "dev").toLowerCase();
  const env = loadEnv();
  const url = target === "prod" ? env.PROD_SUPABASE_URL : env.VITE_SUPABASE_URL;
  const key = target === "prod" ? env.PROD_SUPABASE_SERVICE_ROLE_KEY : env.DEV_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(`Missing ${target} URL/service-role key in .env.local`);

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const seeds = buildSeeds();

  console.log(`Target: ${target} (${url})`);
  const { error: delErr } = await sb.from("access_profiles").delete().eq("is_baseline", true);
  if (delErr) throw new Error(`delete baselines failed: ${delErr.message}`);

  const rows = seeds.map((s) => ({
    name: s.name,
    description: "Auto-generated baseline seed.",
    target_department: s.department,
    target_role: s.role,
    target_service: s.service,
    module_grants: s.grants,
    visibility_scope: s.visibility,
    visibility_departments: null,
    is_baseline: true,
    is_active: true,
  }));
  const { error: insErr } = await sb.from("access_profiles").insert(rows);
  if (insErr) throw new Error(`insert baselines failed: ${insErr.message}`);

  const { count } = await sb
    .from("access_profiles")
    .select("*", { count: "exact", head: true })
    .eq("is_baseline", true);
  console.log(`Applied ${seeds.length} baseline seeds. Baselines in DB: ${count}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
