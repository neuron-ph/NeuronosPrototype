// Read-only probe of the PROD project: can we run SQL there, and what's the
// state of the things this release needs? Uses PROD creds from .env.local.
//   node --env-file=.env.local scripts/probeProd.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.PROD_SUPABASE_URL;
const key = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing PROD_SUPABASE_URL / PROD_SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

console.log(`PROD: ${url}`);

// 1. Is there an arbitrary-SQL helper on prod? (clone_exec_sql returns void)
const ping = await sb.rpc("clone_exec_sql", { sql: "select 1" });
console.log("clone_exec_sql present:", ping.error ? `NO (${ping.error.message})` : "YES");

// 2. Does the NEU-030 cascade infra already exist on prod? (probe via the booking helper)
const helper = await sb.rpc("current_user_can_act_on_booking", { p_action: "create" });
console.log("current_user_can_act_on_booking present:", helper.error ? `NO/err (${helper.error.message})` : `YES (returned ${helper.data})`);

// 3. Spot-check a couple of release-relevant objects via PostgREST table reads.
for (const t of ["access_cascade_edges", "currencies"]) {
  const r = await sb.from(t).select("*", { count: "exact", head: true });
  console.log(`table ${t}:`, r.error ? `absent/err (${r.error.message})` : `present (count=${r.count})`);
}
