// One-off: copy access_cascade_edges from DEV -> PROD via the table API.
// Both connections use service-role keys from .env.local. Idempotent (upsert).
//   node --env-file=.env.local scripts/copyEdgesToProd.mjs
import { createClient } from "@supabase/supabase-js";

const dev = createClient(
  process.env.VITE_SUPABASE_URL || process.env.DEV_SUPABASE_URL,
  process.env.DEV_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const prod = createClient(
  process.env.PROD_SUPABASE_URL,
  process.env.PROD_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: edges, error: readErr } = await dev
  .from("access_cascade_edges")
  .select("parent_key, child_key");
if (readErr) { console.error("DEV read failed:", readErr.message); process.exit(1); }
console.log(`DEV edges read: ${edges.length}`);

// chunked upsert into prod
const CHUNK = 500;
for (let i = 0; i < edges.length; i += CHUNK) {
  const slice = edges.slice(i, i + CHUNK);
  const { error } = await prod
    .from("access_cascade_edges")
    .upsert(slice, { onConflict: "parent_key,child_key" });
  if (error) { console.error(`PROD upsert failed @${i}:`, error.message); process.exit(1); }
}

const { count } = await prod
  .from("access_cascade_edges")
  .select("*", { count: "exact", head: true });
console.log(`PROD edges now: ${count} (expected ${edges.length})`);
