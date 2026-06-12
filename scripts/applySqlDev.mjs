// Applies a .sql file to the DEV Supabase project via the dev-only
// public.clone_exec_sql(sql) helper. Reads creds from .env.local.
//   node --env-file=.env.local scripts/applySqlDev.mjs <path-to.sql>
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL || process.env.DEV_SUPABASE_URL;
const key = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY;
const file = process.argv[2];
if (!url || !key) { console.error("Missing dev URL / DEV_SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
if (!file) { console.error("Usage: applySqlDev.mjs <file.sql>"); process.exit(1); }

const sql = readFileSync(file, "utf8");
const sb = createClient(url, key, { auth: { persistSession: false } });
const { error } = await sb.rpc("clone_exec_sql", { sql });
if (error) { console.error("FAILED:", error.message); process.exit(1); }
console.log(`Applied OK (${url}): ${file}`);
