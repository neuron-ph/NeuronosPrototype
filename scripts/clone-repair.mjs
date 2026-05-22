#!/usr/bin/env node
// Repair pass for the prod -> dev clone.
// Fixes the 8 tables that failed on the first run:
//   - users (PK collision with auth-trigger stubs) -> upsert
//   - activity_log / contacts / notification_counters / notification_recipients
//     / permission_overrides (FK to users) -> retry after users upsert
//   - journal_entries <-> evouchers cycle -> two-pass (insert with FK fields
//     nulled, then back-fill)
//   - billing_line_items (prod uq violation on billable_expense source) ->
//     insert row-by-row, skip dup-key errors
//
// Usage:  node --env-file=.env.local scripts/clone-repair.mjs

import { createClient } from '@supabase/supabase-js';

const PROD_URL = process.env.PROD_SUPABASE_URL;
const PROD_KEY = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;
const DEV_URL  = process.env.VITE_SUPABASE_URL || process.env.DEV_SUPABASE_URL;
const DEV_KEY  = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY;
for (const [k, v] of Object.entries({ PROD_URL, PROD_KEY, DEV_URL, DEV_KEY })) {
  if (!v) { console.error(`Missing env: ${k}`); process.exit(1); }
}
if (!PROD_URL.includes('ubspbukgcxmzegnomlgi')) { console.error('safety: not prod URL'); process.exit(1); }
if (!DEV_URL.includes('oqermaidggvanahumjmj'))  { console.error('safety: not dev URL'); process.exit(1); }

const prod = createClient(PROD_URL, PROD_KEY, { auth: { persistSession: false } });
const dev  = createClient(DEV_URL,  DEV_KEY,  { auth: { persistSession: false } });

async function fetchAll(client, table) {
  const out = [];
  let from = 0; const page = 1000;
  while (true) {
    const { data, error } = await client.from(table).select('*').range(from, from + page - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return out;
}

async function upsertAll(table, rows, conflict = 'id') {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 500) {
    const slice = rows.slice(i, i + 500);
    const { error } = await dev.from(table).upsert(slice, { onConflict: conflict });
    if (error) throw new Error(`upsert ${table}: ${error.message}`);
  }
}

async function insertAll(table, rows) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 500) {
    const slice = rows.slice(i, i + 500);
    const { error } = await dev.from(table).insert(slice);
    if (error) throw new Error(`insert ${table}: ${error.message}`);
  }
}

async function insertOneByOneTolerant(table, rows, tolerateCodes = ['23505']) {
  let ok = 0, skipped = 0;
  for (const row of rows) {
    const { error } = await dev.from(table).insert(row);
    if (error) {
      const code = error.code || (error.details && error.details.code);
      if (tolerateCodes.includes(code) || /duplicate key/i.test(error.message)) { skipped += 1; continue; }
      throw new Error(`insert ${table}: ${error.message}`);
    }
    ok += 1;
  }
  return { ok, skipped };
}

async function step(label, fn) {
  process.stdout.write(`${label.padEnd(50)} `);
  try { const r = await fn(); console.log(r ?? 'ok'); return r; }
  catch (e) { console.log('FAILED'); console.error(`  ${e.message}`); throw e; }
}

async function main() {
  console.log(`Dev:  ${DEV_URL}\nProd: ${PROD_URL}\n`);

  // ---- 1. users: upsert ----
  await step('users (upsert)', async () => {
    const rows = await fetchAll(prod, 'users');
    await upsertAll('users', rows, 'id');
    return `${rows.length} rows`;
  });

  // ---- 2. retry FK-dependent tables that failed in pass 1 ----
  for (const t of ['activity_log','contacts','notification_counters','notification_recipients','permission_overrides']) {
    await step(`${t} (insert)`, async () => {
      const rows = await fetchAll(prod, t);
      await insertAll(t, rows);
      return `${rows.length} rows`;
    });
  }

  // ---- 3. journal_entries <-> evouchers cycle (two-pass) ----
  // Insert journal_entries with evoucher_id nulled, evouchers with the two
  // self-cycle FKs nulled, then UPDATE to fill them in.
  await step('journal_entries (pass 1: evoucher_id=null)', async () => {
    const rows = await fetchAll(prod, 'journal_entries');
    const stripped = rows.map(r => ({ ...r, evoucher_id: null }));
    await insertAll('journal_entries', stripped);
    return `${rows.length} rows`;
  });

  // evouchers were already inserted on pass 1 — re-check, top up if missing.
  await step('evouchers (top-up if missing)', async () => {
    const prodEv = await fetchAll(prod, 'evouchers');
    const devEv = await fetchAll(dev, 'evouchers');
    const devIds = new Set(devEv.map(r => r.id));
    const missing = prodEv.filter(r => !devIds.has(r.id))
      .map(r => ({ ...r, closing_journal_entry_id: null, draft_transaction_id: null }));
    if (missing.length) await insertAll('evouchers', missing);
    return `${missing.length} inserted, ${devEv.length} already present`;
  });

  await step('journal_entries (pass 2: back-fill evoucher_id)', async () => {
    const rows = await fetchAll(prod, 'journal_entries');
    let updated = 0;
    for (const r of rows) {
      if (!r.evoucher_id) continue;
      const { error } = await dev.from('journal_entries').update({ evoucher_id: r.evoucher_id }).eq('id', r.id);
      if (error) throw new Error(`update journal_entries ${r.id}: ${error.message}`);
      updated += 1;
    }
    return `${updated} updated`;
  });

  await step('evouchers (pass 2: back-fill closing_journal_entry_id, draft_transaction_id)', async () => {
    const rows = await fetchAll(prod, 'evouchers');
    let updated = 0;
    for (const r of rows) {
      const patch = {};
      if (r.closing_journal_entry_id) patch.closing_journal_entry_id = r.closing_journal_entry_id;
      if (r.draft_transaction_id)     patch.draft_transaction_id     = r.draft_transaction_id;
      if (!Object.keys(patch).length) continue;
      const { error } = await dev.from('evouchers').update(patch).eq('id', r.id);
      if (error) throw new Error(`update evouchers ${r.id}: ${error.message}`);
      updated += 1;
    }
    return `${updated} updated`;
  });

  // ---- 4. billing_line_items: insert row-by-row, tolerate uq violations ----
  await step('billing_line_items (row-by-row, tolerate uq)', async () => {
    const rows = await fetchAll(prod, 'billing_line_items');
    const { ok, skipped } = await insertOneByOneTolerant('billing_line_items', rows);
    return `${ok} inserted, ${skipped} skipped (uq_bli_billable_expense_source)`;
  });

  // ---- 5. sanity counts ----
  console.log('\n--- Sanity counts ---');
  const tables = ['users','contacts','activity_log','journal_entries','evouchers','billing_line_items','notification_events','notification_counters','permission_overrides'];
  for (const t of tables) {
    const { count: prodCount } = await prod.from(t).select('*', { count: 'exact', head: true });
    const { count: devCount }  = await dev.from(t).select('*', { count: 'exact', head: true });
    const match = prodCount === devCount ? 'OK' : 'DIFF';
    console.log(`  ${t.padEnd(24)} dev=${String(devCount).padStart(5)}  prod=${String(prodCount).padStart(5)}  ${match}`);
  }
  console.log('\nDone.');
}

main().catch(err => { console.error('\nFATAL:', err); process.exit(1); });
