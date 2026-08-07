// Finding P1 — the Unbilled Revenue report asked for three columns that do not
// exist, took a 400 from PostgREST, and rendered "No unbilled bookings this
// period" over millions of pesos of uninvoiced work.
//
// This runs the hook's exact three queries as a signed-in user and recomputes
// the total the way the hook does. A 400 here is the bug reappearing.
//
//   node scripts/probeUnbilledRevenue.mjs <url> <anon-key> <email> <password>
import { createClient } from "@supabase/supabase-js";

const [url, key, email, password] = process.argv.slice(2);
if (!url || !key || !email || !password) {
  console.error("usage: probeUnbilledRevenue.mjs <url> <anon-key> <email> <password>");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const auth = await sb.auth.signInWithPassword({ email, password });
if (auth.error) { console.error(`sign-in failed: ${auth.error.message}`); process.exit(1); }

// Whole-history scope, so the figure is comparable to a plain SQL recount.
const FROM = "2000-01-01T00:00:00.000Z";
const TO = "2999-01-01T00:00:00.000Z";

const { data: bookings, error: bookingError } = await sb
  .from("bookings")
  .select("id, booking_number, customer_name, service_type, created_at")
  .neq("status", "Cancelled")
  .gte("created_at", FROM)
  .lte("created_at", TO);
if (bookingError) { console.error("bookings query FAILED:", bookingError.message); process.exit(1); }

const bookingIds = bookings.map((b) => b.id).filter(Boolean);
console.log(`bookings in scope: ${bookingIds.length}`);

const [{ data: billing, error: billingError }, { data: invoices, error: invoiceError }] = await Promise.all([
  sb.from("billing_line_items").select("id, booking_id, amount, status").in("booking_id", bookingIds),
  sb.from("invoices").select("id, booking_id, total_amount, subtotal, status, metadata").in("booking_id", bookingIds),
]);

if (billingError) { console.error("billing_line_items query FAILED:", billingError.message); process.exit(1); }
if (invoiceError) { console.error("invoices query FAILED:", invoiceError.message); process.exit(1); }
console.log(`billing lines: ${billing.length}   invoices: ${invoices.length}`);

// Mirrors isInvoiceFinanciallyActive.
const active = (inv) => {
  if (inv?.metadata?.reversal_of_invoice_id) return false;
  const s = String(inv?.status || "").toLowerCase();
  return !["reversed", "void", "draft", "reversal_draft", "reversal_posted"].includes(s);
};

const charges = new Map();
for (const b of billing) {
  const s = String(b.status || "").toLowerCase();
  if (s === "cancelled" || s === "rejected") continue;
  charges.set(b.booking_id, (charges.get(b.booking_id) || 0) + (Number(b.amount) || 0));
}
const invoiced = new Map();
for (const inv of invoices.filter(active)) {
  invoiced.set(inv.booking_id, (invoiced.get(inv.booking_id) || 0) + (Number(inv.total_amount) || Number(inv.subtotal) || 0));
}

let total = 0, count = 0;
for (const [bid, booked] of charges) {
  const unbilled = Math.max(0, booked - (invoiced.get(bid) || 0));
  if (unbilled > 0) { total += unbilled; count++; }
}

await sb.auth.signOut();
const php = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
console.log(`\nunbilled: ${php.format(total)} across ${count} bookings`);
console.log(total > 0 ? "\nPASS — the report has a subject again" : "\nEMPTY — verify that is genuine and not the bug returning");
