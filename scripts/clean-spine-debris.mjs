#!/usr/bin/env node
// Delete the records the e2e spine (tests/e2e/spine.spec.ts) leaves behind in DEV.
//
// The spine writes a real job through the whole system on every run — quotation,
// project, booking, e-voucher, billing line, invoice, collection — plus the
// tickets, activity rows and notifications those writes fan out. None of it is
// cleaned up by the test, by design: when a run fails you want the wreckage.
// This is how you sweep it once you're done reading it.
//
// Usage:
//   npm run clean:spine            # DRY RUN — prints what it would delete
//   npm run clean:spine -- --apply # actually delete
//
// Required env (.env.local):
//   VITE_SUPABASE_URL             (the dev project)
//   DEV_SUPABASE_SERVICE_ROLE_KEY
//
// DEV ONLY. The script refuses to run against anything that isn't the dev
// project ref, and there is no prod flag to override it.
//
// What counts as debris: every quotation whose name starts with E2E-SPINE, plus
// everything reachable from it — the project it converted into, that project's
// bookings, and the financial records hung off those. Nothing is matched by date
// or by "recently created", so a real record can never be swept by accident.
//
// Deletes children before parents rather than relying on cascades: most of these
// FKs are ON DELETE SET NULL, which would orphan the rows instead of removing
// them. Re-running is safe — each pass deletes whatever is still there.

import { createClient } from '@supabase/supabase-js';

const DEV_URL = process.env.VITE_SUPABASE_URL || process.env.DEV_SUPABASE_URL;
const DEV_KEY = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'oqermaidggvanahumjmj';

const APPLY = process.argv.includes('--apply');
const TAG = 'E2E-SPINE';

for (const [k, v] of Object.entries({ DEV_URL, DEV_KEY })) {
  if (!v) { console.error(`Missing env: ${k}`); process.exit(1); }
}
if (!DEV_URL.includes(DEV_REF)) {
  console.error(`Safety check failed: ${DEV_URL} is not the dev project (${DEV_REF}). Refusing to run.`);
  process.exit(1);
}

const db = createClient(DEV_URL, DEV_KEY, { auth: { persistSession: false } });

const ids = (rows, key = 'id') => [...new Set((rows ?? []).map((r) => r[key]).filter(Boolean))];

async function select(table, columns, build) {
  let q = db.from(table).select(columns);
  q = build ? build(q) : q;
  const { data, error } = await q;
  if (error) throw new Error(`select ${table}: ${error.message}`);
  return data ?? [];
}

// ── Resolve the debris, root-first ──────────────────────────────────────────

console.log(`\nScanning dev for ${TAG} debris…\n`);

const quotations = await select('quotations', 'id, quote_number', (q) =>
  q.like('quotation_name', `${TAG}%`));
const quotationIds = ids(quotations);

const projects = quotationIds.length
  ? await select('projects', 'id, project_number', (q) => q.in('quotation_id', quotationIds))
  : [];
const projectIds = ids(projects);
const projectNumbers = ids(projects, 'project_number');

// A booking reaches back to its project only by FK (there is no project_number
// column on bookings — it lives in details), and the spine also names them with
// the tag. Match on both so a booking can't survive because one link was missed.
const bookingRows = [
  ...(projectIds.length ? await select('bookings', 'id, booking_number', (q) => q.in('project_id', projectIds)) : []),
  ...await select('bookings', 'id, booking_number', (q) => q.like('name', `${TAG}%`)),
];
const bookingIds = ids(bookingRows);

// Financial records carry the project BOTH ways — the FK and the denormalised
// number — and which one is populated depends on the surface that wrote them.
// The spine's invoice, for instance, is booking-linked and project_number-linked
// but has no project_id. Sweep on all of them.
const invoices = [
  ...(bookingIds.length ? await select('invoices', 'id, invoice_number', (q) => q.in('booking_id', bookingIds)) : []),
  ...(projectNumbers.length ? await select('invoices', 'id, invoice_number', (q) => q.in('project_number', projectNumbers)) : []),
  ...(projectIds.length ? await select('invoices', 'id, invoice_number', (q) => q.in('project_id', projectIds)) : []),
];
const invoiceIds = ids(invoices);

// E-vouchers reach the job by their own booking/project columns OR only through
// a line item's booking — the spine's voucher is the second kind (D2 puts the
// booking on the line, not the header).
const evoucherRows = [
  ...(bookingIds.length ? await select('evouchers', 'id, evoucher_number', (q) => q.in('booking_id', bookingIds)) : []),
  ...(projectIds.length ? await select('evouchers', 'id, evoucher_number', (q) => q.in('project_id', projectIds)) : []),
  ...(projectNumbers.length ? await select('evouchers', 'id, evoucher_number', (q) => q.in('project_number', projectNumbers)) : []),
];
const lineItemVouchers = bookingIds.length
  ? await select('evoucher_line_items', 'evoucher_id', (q) => q.in('booking_id', bookingIds))
  : [];
const evoucherIds = [...new Set([...ids(evoucherRows), ...ids(lineItemVouchers, 'evoucher_id')])];

// Every id the fan-out tables (tickets, activity, notifications) could point at.
const allEntityIds = [...quotationIds, ...projectIds, ...bookingIds, ...invoiceIds, ...evoucherIds];

const ticketIds = allEntityIds.length
  ? ids(await select('tickets', 'id', (q) => q.in('linked_record_id', allEntityIds)))
  : [];
const notificationIds = allEntityIds.length
  ? ids(await select('notification_events', 'id', (q) => q.in('entity_id', allEntityIds)))
  : [];

// ── The plan, deepest child first ───────────────────────────────────────────

/** @type {{table: string, col: string, values: string[], extraCols?: string[]}[]} */
const plan = [
  { table: 'ticket_read_receipts', col: 'ticket_id', values: ticketIds },
  { table: 'ticket_messages', col: 'ticket_id', values: ticketIds },
  { table: 'ticket_assignments', col: 'ticket_id', values: ticketIds },
  { table: 'ticket_participants', col: 'ticket_id', values: ticketIds },
  { table: 'ticket_attachments', col: 'ticket_id', values: ticketIds },
  { table: 'tickets', col: 'id', values: ticketIds },

  { table: 'notification_recipients', col: 'event_id', values: notificationIds },
  { table: 'notification_events', col: 'id', values: notificationIds },
  { table: 'activity_log', col: 'entity_id', values: allEntityIds },

  { table: 'collections', col: 'invoice_id', values: invoiceIds },
  { table: 'collections', col: 'booking_id', values: bookingIds },
  { table: 'collections', col: 'project_number', values: projectNumbers },
  { table: 'billing_line_items', col: 'invoice_id', values: invoiceIds },
  { table: 'billing_line_items', col: 'booking_id', values: bookingIds },
  { table: 'billing_line_items', col: 'project_id', values: projectIds },
  { table: 'billing_line_items', col: 'project_number', values: projectNumbers },
  { table: 'invoices', col: 'id', values: invoiceIds },

  { table: 'liquidation_submissions', col: 'evoucher_id', values: evoucherIds },
  { table: 'evoucher_history', col: 'evoucher_id', values: evoucherIds },
  { table: 'evoucher_line_items', col: 'evoucher_id', values: evoucherIds },
  { table: 'transactions', col: 'evoucher_id', values: evoucherIds },
  { table: 'expenses', col: 'evoucher_id', values: evoucherIds },
  { table: 'expenses', col: 'booking_id', values: bookingIds },
  { table: 'evouchers', col: 'id', values: evoucherIds },

  { table: 'booking_assignments', col: 'booking_id', values: bookingIds },
  { table: 'booking_milestones', col: 'booking_id', values: bookingIds },
  { table: 'booking_attachments', col: 'booking_id', values: bookingIds },
  { table: 'booking_comments', col: 'booking_id', values: bookingIds },
  { table: 'contract_bookings', col: 'booking_id', values: bookingIds },
  { table: 'project_bookings', col: 'booking_id', values: bookingIds },
  { table: 'bookings', col: 'id', values: bookingIds },

  { table: 'project_attachments', col: 'project_id', values: projectIds },
  { table: 'project_bookings', col: 'project_id', values: projectIds },
  { table: 'projects', col: 'id', values: projectIds },

  { table: 'quotation_attachments', col: 'quotation_id', values: quotationIds },
  { table: 'quotations', col: 'id', values: quotationIds },
];

// ── Count, then (optionally) delete ─────────────────────────────────────────

async function count(table, col, values) {
  if (values.length === 0) return 0;
  const { count: n, error } = await db
    .from(table).select('*', { count: 'exact', head: true }).in(col, values);
  // A table this dev branch doesn't have is not an error worth stopping for.
  if (error) { console.warn(`  ! ${table}: ${error.message}`); return 0; }
  return n ?? 0;
}

let total = 0;
const rowsToShow = [];
for (const step of plan) {
  const n = await count(step.table, step.col, step.values);
  if (n > 0) { rowsToShow.push([`${step.table} (${step.col})`, n]); total += n; }
}

console.log(`Roots: ${quotations.length} quotations, ${projects.length} projects, ` +
  `${bookingRows.length ? bookingIds.length : 0} bookings, ${invoiceIds.length} invoices, ` +
  `${evoucherIds.length} e-vouchers\n`);

if (total === 0) {
  console.log('Nothing to clean — dev has no spine debris.\n');
  process.exit(0);
}

const width = Math.max(...rowsToShow.map(([label]) => label.length));
for (const [label, n] of rowsToShow) console.log(`  ${label.padEnd(width)}  ${String(n).padStart(5)}`);
console.log(`  ${'TOTAL'.padEnd(width)}  ${String(total).padStart(5)}\n`);

if (!APPLY) {
  console.log('DRY RUN — nothing deleted. Re-run with --apply to delete.\n');
  process.exit(0);
}

console.log('Deleting…\n');
let deleted = 0;
for (const step of plan) {
  if (step.values.length === 0) continue;
  const { error } = await db.from(step.table).delete().in(step.col, step.values);
  if (error) { console.warn(`  ! ${step.table} (${step.col}): ${error.message}`); continue; }
  deleted += 1;
}

// Verify rather than trust: re-count everything the plan claimed to remove.
let left = 0;
for (const step of plan) left += await count(step.table, step.col, step.values);

console.log(left === 0
  ? `\nDone — ${total} rows removed across ${deleted} steps. Dev is clean.\n`
  : `\nDone, but ${left} rows are still present. Re-run, or check the warnings above.\n`);
