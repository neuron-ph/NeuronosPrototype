// Finding M1 — do the rows written BEFORE the fix still open?
//
// ~424 existing rows hold a full public URL, and there is no backfill. This
// walks every table that stores one, runs each value through the same
// path-extraction the app uses, signs it, and fetches the bytes. A row that
// cannot be opened is a document the product has silently lost.
//
// Note the stored URLs carry the PROD project ref even on dev (dev is a clone),
// which is exactly why extraction must ignore the host.
//
//   node scripts/probeLegacyAttachmentUrls.mjs <url> <anon-key> <email> <password> [--all]
import { createClient } from "@supabase/supabase-js";

const [url, key, email, password] = process.argv.slice(2);
const ALL = process.argv.includes("--all");
if (!url || !key || !email || !password) {
  console.error("usage: probeLegacyAttachmentUrls.mjs <url> <anon-key> <email> <password> [--all]");
  process.exit(1);
}

const BUCKET = "attachments";
// Flat text columns: one stored URL per row.
const TABLES = [
  ["booking_attachments", "file_url"],
  ["contact_attachments", "file_url"],
  ["contract_attachments", "file_url"],
  ["customer_attachments", "file_url"],
  ["project_attachments", "file_url"],
  ["quotation_attachments", "file_url"],
];

// JSONB columns: an array of attachment objects per row. The key differs by
// table — comments use file_url, the CRM/e-voucher shape uses url.
const JSONB_TABLES = [
  ["booking_comments", "attachments", "file_url"],
  ["comments", "attachments", "file_url"],
  ["budget_requests", "attachments", "url"],
  ["crm_activities", "attachments", "url"],
  ["evouchers", "attachments", "url"],
  ["tasks", "attachments", "url"],
];

// Mirrors src/utils/attachmentUrl.ts — kept in step deliberately; if this drifts
// the probe stops proving anything about the app.
function toStoragePath(stored) {
  if (!stored) return null;
  const value = String(stored).trim();
  if (!value) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const at = value.indexOf(marker);
  if (at !== -1) return decodeURIComponent(value.slice(at + marker.length));
  const signedMarker = `/storage/v1/object/sign/${BUCKET}/`;
  const signedAt = value.indexOf(signedMarker);
  if (signedAt !== -1) return decodeURIComponent(value.slice(signedAt + signedMarker.length).split("?")[0]);
  if (/^https?:\/\//i.test(value)) return null;
  return value.replace(/^\/+/, "");
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const auth = await sb.auth.signInWithPassword({ email, password });
if (auth.error) { console.error(`sign-in failed: ${auth.error.message}`); process.exit(1); }
console.log(`signed in as ${email}\n`);

let checked = 0, ok = 0;
const failures = [];

for (const [table, column] of TABLES) {
  const q = sb.from(table).select(`${column}`).not(column, "is", null);
  const { data, error } = ALL ? await q : await q.limit(5);
  if (error) { console.log(`  ${table}: unreadable — ${error.message}`); continue; }

  let tableOk = 0;
  for (const row of data ?? []) {
    const stored = row[column];
    const path = toStoragePath(stored);
    checked++;
    if (!path) { failures.push([table, stored, "unparseable"]); continue; }

    const signed = await sb.storage.from(BUCKET).createSignedUrl(path, 60);
    if (signed.error || !signed.data?.signedUrl) {
      failures.push([table, path, signed.error?.message ?? "no signed URL"]);
      continue;
    }
    const res = await fetch(signed.data.signedUrl);
    if (!res.ok) { failures.push([table, path, `HTTP ${res.status}`]); continue; }
    ok++; tableOk++;
  }
  console.log(`  ${table}: ${tableOk}/${data?.length ?? 0} legacy rows open`);
}

for (const [table, column, urlKey] of JSONB_TABLES) {
  const q = sb.from(table).select(column).not(column, "is", null);
  const { data, error } = ALL ? await q : await q.limit(20);
  if (error) { console.log(`  ${table}: unreadable — ${error.message}`); continue; }

  const stored = (data ?? [])
    .flatMap((row) => (Array.isArray(row[column]) ? row[column] : []))
    .map((att) => att?.[urlKey])
    .filter(Boolean);

  let tableOk = 0;
  for (const value of stored) {
    const path = toStoragePath(value);
    checked++;
    if (!path) { failures.push([table, value, "unparseable"]); continue; }

    const signed = await sb.storage.from(BUCKET).createSignedUrl(path, 60);
    if (signed.error || !signed.data?.signedUrl) {
      failures.push([table, path, signed.error?.message ?? "no signed URL"]);
      continue;
    }
    const res = await fetch(signed.data.signedUrl);
    if (!res.ok) { failures.push([table, path, `HTTP ${res.status}`]); continue; }
    ok++; tableOk++;
  }
  console.log(`  ${table}.${column}: ${tableOk}/${stored.length} legacy attachments open`);
}

await sb.auth.signOut();

console.log(`\n${ok}/${checked} legacy attachments resolved and served bytes`);
if (failures.length) {
  console.log(`\n${failures.length} could not be opened:`);
  for (const [table, value, why] of failures.slice(0, 20)) console.log(`  ${table}  ${why}  ${value}`);
}
process.exit(failures.length ? 1 : 0);
