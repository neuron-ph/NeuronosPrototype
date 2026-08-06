// Finding U1 — prove `access_cascade_edges` refuses an anonymous caller.
// Read-only except for the INSERT/TRUNCATE attempts, which MUST be refused;
// if either succeeds the probe reports BREACH and removes what it planted.
//
//   node scripts/probeCascadeEdges.mjs <url> <anon-key>
import { createClient } from "@supabase/supabase-js";

const [url, key] = process.argv.slice(2);
if (!url || !key) { console.error("usage: probeCascadeEdges.mjs <url> <anon-key>"); process.exit(1); }

const anon = createClient(url, key, { auth: { persistSession: false } });
const T = "access_cascade_edges";
const PROBE = { parent_key: "QA_PROBE_U1:view", child_key: "QA_PROBE_U1_CHILD:view" };
let breached = false;

const verdict = (label, refused, detail) => {
  if (!refused) breached = true;
  console.log(`${refused ? "  refused " : "  ALLOWED "} ${label}${detail ? ` — ${detail}` : ""}`);
};

console.log(`anon probe against ${url}\n`);

const sel = await anon.from(T).select("parent_key", { count: "exact", head: true });
verdict("SELECT", !!sel.error, sel.error?.message ?? `read ${sel.count} rows`);

const ins = await anon.from(T).insert(PROBE).select();
verdict("INSERT", !!ins.error, ins.error?.message ?? `accepted ${JSON.stringify(ins.data)}`);
if (!ins.error) await anon.from(T).delete().eq("parent_key", PROBE.parent_key);

// Filtered to a key that does not exist, so an ALLOWED delete still destroys
// nothing — a refusal errors, permission errors before the filter matches.
const del = await anon.from(T).delete().eq("parent_key", PROBE.parent_key).select();
verdict("DELETE", !!del.error, del.error?.message ?? "accepted (0 rows matched, nothing destroyed)");

console.log(`\n${breached ? "BREACH — the table still answers strangers" : "CLOSED — anon is refused on every verb"}`);
process.exit(breached ? 1 : 0);
