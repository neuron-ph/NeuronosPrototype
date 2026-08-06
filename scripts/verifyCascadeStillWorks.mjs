// Finding U1, the half that matters — after 276 revokes the table from
// `authenticated`, can an administrator still edit access?
//
// The trigger on permission_overrides calls materialize_grant_cascade(), which
// reads access_cascade_edges. If the function is not SECURITY DEFINER, this
// throws `permission denied for table access_cascade_edges` and access
// administration is dead. This drives the real path, as a real signed-in admin.
//
// Mutates one test user's grants on DEV and restores them from a snapshot taken
// first. Never point this at prod.
//
//   node scripts/verifyCascadeStillWorks.mjs <url> <anon-key> <admin-email> <password>
import { createClient } from "@supabase/supabase-js";

const [url, key, email, password] = process.argv.slice(2);
if (!url || !key || !email || !password) {
  console.error("usage: verifyCascadeStillWorks.mjs <url> <anon-key> <admin-email> <password>");
  process.exit(1);
}

const VICTIM = "user-83960647";                        // testing@neuron.com.ph
const PARENT = "acct_bookings:view";
const CHILDREN = [
  "accounting_bookings_brokerage_tab:view",
  "accounting_bookings_collections_tab:view",
  "accounting_bookings_forwarding_tab:view",
  "accounting_bookings_invoices_tab:view",
  "accounting_bookings_marine_insurance_tab:view",
  "accounting_bookings_others_tab:view",
  "accounting_bookings_trucking_tab:view",
];

const sb = createClient(url, key, { auth: { persistSession: false } });
let failed = false;
const check = (label, ok, detail) => {
  if (!ok) failed = true;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const auth = await sb.auth.signInWithPassword({ email, password });
if (auth.error) { console.error(`sign-in failed: ${auth.error.message}`); process.exit(1); }
console.log(`signed in as ${email}\n`);

// 1. The definer function answers an authenticated caller that has no table grant.
const rpc = await sb.rpc("materialize_grant_cascade", { grants: { [PARENT]: ["view"] } });
check(
  "materialize_grant_cascade() callable by authenticated",
  !rpc.error,
  rpc.error?.message,
);
if (!rpc.error) {
  const missing = CHILDREN.filter((c) => !(c in (rpc.data ?? {})));
  check("  ...and it still materializes all 7 children", missing.length === 0,
        missing.length ? `missing ${missing.join(", ")}` : `${CHILDREN.length}/7 present`);
}

// 2. The real path: an admin edits a user's access and the trigger fires.
const before = await sb.from("permission_overrides").select("module_grants").eq("user_id", VICTIM).single();
if (before.error) { console.error(`could not read victim grants: ${before.error.message}`); process.exit(1); }
const snapshot = before.data.module_grants;
console.log(`\nsnapshot of ${VICTIM}: ${Object.keys(snapshot).length} keys`);

const upd = await sb
  .from("permission_overrides")
  .update({ module_grants: { ...snapshot, [PARENT]: ["view"] } })
  .eq("user_id", VICTIM)
  .select("module_grants")
  .single();
check("admin UPDATE on permission_overrides succeeds", !upd.error, upd.error?.message);

if (!upd.error) {
  const after = upd.data.module_grants;
  const missing = CHILDREN.filter((c) => !(c in after));
  check("  ...and the cascade materialized on write", missing.length === 0,
        missing.length ? `missing ${missing.join(", ")}` : "all 7 children written");
}

// 3. Restore, whatever happened above.
const restore = await sb.from("permission_overrides").update({ module_grants: snapshot }).eq("user_id", VICTIM).select("module_grants").single();
const restoredKeys = Object.keys(restore.data?.module_grants ?? {}).length;
check("restored to snapshot", !restore.error && restoredKeys === Object.keys(snapshot).length,
      restore.error?.message ?? `${restoredKeys} keys`);

await sb.auth.signOut();
console.log(`\n${failed ? "FAILED — access administration is broken" : "PASSED — the hole is shut and admin edits still cascade"}`);
process.exit(failed ? 1 : 0);
