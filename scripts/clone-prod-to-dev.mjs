#!/usr/bin/env node
// Clone prod -> dev (verbatim, no anonymization). Preserves Marcus's
// own dev login (PRESERVE_EMAIL) across the wipe so he can keep using dev.
//
// Usage:
//   node --env-file=.env.local scripts/clone-prod-to-dev.mjs
//
// Required env (in .env.local):
//   PROD_SUPABASE_URL=https://ubspbukgcxmzegnomlgi.supabase.co
//   PROD_SUPABASE_SERVICE_ROLE_KEY=...
//   DEV_SUPABASE_SERVICE_ROLE_KEY=...
//   (VITE_SUPABASE_URL is already the dev URL)
//
// Optional env:
//   PRESERVE_EMAIL=nanaymo224469@gmail.com   # whose dev user to keep
//
// One-time setup (already installed on dev via MCP):
//   create or replace function public.clone_exec_sql(sql text)
//   returns void language plpgsql security definer as $$ begin execute sql; end $$;
//
// What it does:
//   1. Snapshots the PRESERVE_EMAIL dev public.users row (auth.users is
//      already protected — we never delete dev auth users).
//   2. Topo-sorts public tables by FK dependencies (graph embedded below).
//   3. Truncates all dev public tables.
//   4. Copies prod auth.users into dev via admin API, preserving prod IDs.
//      Password set to devpassword123 for every cloned user.
//   5. Copies each prod public table into dev verbatim.
//   6. Restores the preserved public.users row (re-IDed if it collides).
//   7. Resets serial sequences and prints sanity counts.

import { createClient } from '@supabase/supabase-js';

const PROD_URL = process.env.PROD_SUPABASE_URL;
const PROD_KEY = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;
const DEV_URL  = process.env.VITE_SUPABASE_URL || process.env.DEV_SUPABASE_URL;
const DEV_KEY  = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY;

for (const [k, v] of Object.entries({ PROD_URL, PROD_KEY, DEV_URL, DEV_KEY })) {
  if (!v) { console.error(`Missing env: ${k}`); process.exit(1); }
}
if (!PROD_URL.includes('ubspbukgcxmzegnomlgi')) {
  console.error(`Safety check: PROD_SUPABASE_URL doesn't look like prod`); process.exit(1);
}
if (!DEV_URL.includes('oqermaidggvanahumjmj')) {
  console.error(`Safety check: dev URL doesn't look like dev (${DEV_URL})`); process.exit(1);
}

const TEST_PASSWORD = 'devpassword123';
const PRESERVE_EMAIL = process.env.PRESERVE_EMAIL || 'nanaymo224469@gmail.com';
const CHUNK = 500;

const prod = createClient(PROD_URL, PROD_KEY, { auth: { persistSession: false } });
const dev  = createClient(DEV_URL,  DEV_KEY,  { auth: { persistSession: false } });

// ---------- embedded schema graph (from prod information_schema, May 2026) ----------

const TABLES = [
  'access_profiles','accounts','activity_log','assignment_profile_items','assignment_profiles',
  'billing_line_items','booking_assignments','booking_comments','booking_service_catalog',
  'booking_subservice_catalog','bookings','budget_requests','calendar_event_participants',
  'calendar_event_reminders','calendar_events','catalog_categories','catalog_items',
  'collections','comments','company_settings','consignees','contact_attachments','contacts',
  'contract_activity','contract_attachments','contract_bookings','counters','crm_activities',
  'customer_attachments','customers','department_assignment_roles','dispatch_people',
  'evoucher_history','evoucher_line_items','evouchers','exchange_rates','expenses','feedback',
  'financial_statement_filings','invoices','journal_entries','liquidation_submissions','memos',
  'notification_counters','notification_events','notification_recipients','operational_services',
  'org_settings','permission_overrides','profile_brokerage_types','profile_cargo_natures',
  'profile_cargo_types','profile_carriers','profile_consolidators','profile_container_types',
  'profile_countries','profile_cpe_codes','profile_credit_terms','profile_customs_entries',
  'profile_customs_entry_procedures','profile_examinations','profile_forwarders',
  'profile_incoterms','profile_industries','profile_insurers','profile_lead_sources',
  'profile_locations','profile_modes','profile_movements','profile_package_types',
  'profile_permits','profile_preferential_treatments','profile_selectivity_colors',
  'profile_service_statuses','profile_shipping_lines','profile_truck_types',
  'profile_trucking_companies','project_attachments','project_bookings','projects','quotations',
  'saved_reports','service_assignment_roles','service_providers','settings','tasks',
  'team_memberships','team_role_eligibilities','teams','ticket_assignments','ticket_attachments',
  'ticket_messages','ticket_participants','ticket_read_receipts','tickets','todos','trade_parties',
  'transactions','users','vehicles',
];

// FK edges: src depends on dst.
const FK_EDGES = [
  ['budget_requests','customers'],['customers','users'],['contacts','customers'],
  ['contacts','users'],['consignees','customers'],['tasks','contacts'],['tasks','customers'],
  ['tasks','users'],['crm_activities','contacts'],['crm_activities','customers'],
  ['crm_activities','tasks'],['crm_activities','users'],['budget_requests','users'],
  ['catalog_items','catalog_categories'],['quotations','customers'],['quotations','contacts'],
  ['quotations','consignees'],['quotations','users'],['contract_bookings','quotations'],
  ['contract_activity','quotations'],['contract_activity','users'],['contract_attachments','quotations'],
  ['contract_attachments','users'],['projects','quotations'],['projects','customers'],
  ['projects','consignees'],['projects','users'],['budget_requests','projects'],
  ['bookings','projects'],['bookings','quotations'],['bookings','customers'],
  ['bookings','consignees'],['bookings','users'],['contract_bookings','bookings'],
  ['project_bookings','projects'],['project_bookings','bookings'],['project_attachments','projects'],
  ['project_attachments','users'],['evouchers','bookings'],['evouchers','projects'],
  ['evouchers','quotations'],['evouchers','customers'],['evouchers','service_providers'],
  ['evouchers','users'],['evoucher_history','evouchers'],['evoucher_history','users'],
  ['invoices','bookings'],['invoices','projects'],['invoices','customers'],['invoices','evouchers'],
  ['invoices','users'],['billing_line_items','invoices'],['billing_line_items','bookings'],
  ['billing_line_items','projects'],['billing_line_items','evouchers'],
  ['billing_line_items','catalog_items'],['collections','bookings'],['collections','projects'],
  ['collections','customers'],['collections','invoices'],['collections','evouchers'],
  ['collections','users'],['expenses','bookings'],['expenses','projects'],['expenses','evouchers'],
  ['expenses','catalog_items'],['expenses','users'],['journal_entries','evouchers'],
  ['journal_entries','invoices'],['journal_entries','collections'],['journal_entries','bookings'],
  ['journal_entries','users'],['evouchers','journal_entries'],['transactions','accounts'],
  ['transactions','journal_entries'],['transactions','evouchers'],['transactions','users'],
  ['evouchers','transactions'],['invoices','journal_entries'],['collections','journal_entries'],
  ['comments','users'],['activity_log','users'],['saved_reports','users'],['exchange_rates','users'],
  ['evouchers','catalog_items'],['tickets','users'],['ticket_read_receipts','users'],
  ['ticket_read_receipts','ticket_messages'],['ticket_participants','tickets'],
  ['ticket_participants','users'],['ticket_assignments','tickets'],['ticket_assignments','users'],
  ['ticket_messages','tickets'],['ticket_messages','users'],['ticket_attachments','tickets'],
  ['ticket_attachments','ticket_messages'],['ticket_attachments','users'],
  ['ticket_read_receipts','tickets'],['operational_services','users'],['teams','users'],
  ['permission_overrides','users'],['users','teams'],['customer_attachments','customers'],
  ['calendar_events','users'],['contact_attachments','contacts'],
  ['calendar_event_participants','calendar_events'],['calendar_event_participants','users'],
  ['calendar_event_reminders','calendar_events'],['notification_events','users'],
  ['notification_recipients','notification_events'],['notification_recipients','users'],
  ['notification_counters','users'],['liquidation_submissions','evouchers'],
  ['liquidation_submissions','users'],['feedback','users'],['evoucher_line_items','evouchers'],
  ['evoucher_line_items','catalog_items'],['access_profiles','users'],
  ['permission_overrides','access_profiles'],['financial_statement_filings','users'],
  ['memos','users'],['trade_parties','customers'],['trade_parties','users'],
  ['profile_locations','users'],['dispatch_people','users'],['vehicles','users'],
  ['booking_assignments','bookings'],['booking_assignments','users'],
  ['team_memberships','teams'],['team_memberships','users'],
  ['team_role_eligibilities','team_memberships'],['assignment_profiles','customers'],
  ['assignment_profiles','teams'],['assignment_profiles','users'],
  ['assignment_profile_items','assignment_profiles'],['assignment_profile_items','users'],
];

// Topo sort: dependencies first. Breaks cycles arbitrarily (users<->teams).
function topoSort() {
  const edges = new Map(TABLES.map(t => [t, new Set()]));
  for (const [src, dst] of FK_EDGES) {
    if (src !== dst && edges.has(src) && edges.has(dst)) edges.get(src).add(dst);
  }
  const sorted = [], visited = new Set(), visiting = new Set();
  function visit(n) {
    if (visited.has(n) || visiting.has(n)) return;
    visiting.add(n);
    for (const d of edges.get(n) || []) visit(d);
    visiting.delete(n);
    visited.add(n);
    sorted.push(n);
  }
  for (const n of TABLES) visit(n);
  return sorted;
}

// ---------- helpers ----------

async function devSql(sql) {
  const { error } = await dev.rpc('clone_exec_sql', { sql });
  if (error) throw new Error(`devSql failed: ${error.message}\nSQL: ${sql.slice(0, 200)}`);
}

// ---------- clone steps ----------

async function truncateDev(tablesReverseOrder) {
  const quoted = tablesReverseOrder.map(t => `public."${t}"`).join(', ');
  console.log(`Truncating ${tablesReverseOrder.length} dev tables...`);
  await devSql(`truncate table ${quoted} restart identity cascade`);
}

async function cloneAuthUsers() {
  console.log('Listing prod auth users...');
  const { data: prodList, error: e1 } = await prod.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (e1) throw e1;
  const prodUsers = prodList.users;
  console.log(`  found ${prodUsers.length} prod users`);

  // Existing dev auth users are LEFT IN PLACE. We only add prod ones.
  const { data: devList, error: e2 } = await dev.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (e2) throw e2;
  const devIds = new Set(devList.users.map(u => u.id));
  const devEmails = new Set(devList.users.map(u => (u.email || '').toLowerCase()).filter(Boolean));
  console.log(`  ${devList.users.length} existing dev users will be preserved`);

  console.log(`Adding prod users to dev (real emails, password = ${TEST_PASSWORD})...`);
  let created = 0, skipped = 0;
  for (const u of prodUsers) {
    if (devIds.has(u.id) || (u.email && devEmails.has(u.email.toLowerCase()))) {
      skipped += 1;
      continue;
    }
    const { error } = await dev.auth.admin.createUser({
      id: u.id,
      email: u.email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { ...(u.user_metadata || {}), cloned_from_prod: true },
    });
    if (error) {
      console.error(`  failed ${u.id} (${u.email}): ${error.message}`);
      throw error;
    }
    created += 1;
    if (created % 10 === 0) console.log(`  ${created}/${prodUsers.length - skipped}`);
  }
  console.log(`  created ${created}, skipped ${skipped} (already existed)`);
}

async function snapshotSelf() {
  console.log(`Snapshotting self (${PRESERVE_EMAIL})...`);
  const { data: list, error } = await dev.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const me = list.users.find(u => (u.email || '').toLowerCase() === PRESERVE_EMAIL.toLowerCase());
  if (!me) {
    console.log(`  no dev auth user matches ${PRESERVE_EMAIL} — nothing to preserve`);
    return null;
  }
  const { data: pubRow, error: e2 } = await dev.from('users').select('*').eq('auth_id', me.id).maybeSingle();
  if (e2) throw new Error(`failed to read self public.users row: ${e2.message}`);
  console.log(`  auth.users id=${me.id} public.users id=${pubRow?.id ?? '(none)'}`);
  return { authUser: me, publicRow: pubRow };
}

async function restoreSelf(snapshot) {
  if (!snapshot || !snapshot.publicRow) {
    console.log('No self public.users row to restore.');
    return;
  }
  console.log(`Restoring self public.users row (auth_id=${snapshot.authUser.id})...`);
  let row = { ...snapshot.publicRow };

  // If the prod clone landed a row with the same id, regenerate ours.
  const { data: idClash } = await dev.from('users').select('id').eq('id', row.id).maybeSingle();
  if (idClash) {
    const fresh = `usr_${snapshot.authUser.id.slice(0, 8)}_self`;
    console.log(`  id ${row.id} already exists from prod clone — re-IDing to ${fresh}`);
    row.id = fresh;
  }
  const { data: authIdClash } = await dev.from('users').select('id').eq('auth_id', row.auth_id).maybeSingle();
  if (authIdClash) {
    console.log(`  auth_id already linked to public.users row ${authIdClash.id} — leaving prod row in place, skipping restore`);
    return;
  }
  const { error } = await dev.from('users').insert(row);
  if (error) throw new Error(`failed to restore self public.users row: ${error.message}`);
  console.log('  restored.');
}

async function cloneTable(table) {
  let from = 0;
  const pageSize = 1000;
  const rows = [];
  while (true) {
    const { data, error } = await prod.from(table).select('*').range(from, from + pageSize - 1);
    if (error) {
      console.warn(`  skip ${table}: ${error.message}`);
      return { table, count: 0, skipped: true };
    }
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  if (!rows.length) return { table, count: 0 };

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await dev.from(table).insert(slice);
    if (error) throw new Error(`insert into ${table} failed: ${error.message}`);
  }
  return { table, count: rows.length };
}

async function resetSequences(tables) {
  console.log('Resetting sequences...');
  for (const t of tables) {
    const sql = `
      do $$
      declare seq text;
      begin
        select pg_get_serial_sequence('public.${t}', 'id') into seq;
        if seq is not null then
          execute format('select setval(%L, coalesce((select max(id) from public.%I), 1))', seq, '${t}');
        end if;
      exception when others then null;
      end $$;
    `;
    try { await devSql(sql); } catch { /* tables without integer id */ }
  }
}

// ---------- main ----------

async function main() {
  console.log(`Dev:  ${DEV_URL}`);
  console.log(`Prod: ${PROD_URL}\n`);

  // sanity ping on dev helper
  const { error: pingErr } = await dev.rpc('clone_exec_sql', { sql: 'select 1' });
  if (pingErr) {
    console.error(`Dev helper public.clone_exec_sql missing. Install with:\n`);
    console.error(`  create or replace function public.clone_exec_sql(sql text)`);
    console.error(`  returns void language plpgsql security definer as $$ begin execute sql; end $$;`);
    process.exit(1);
  }

  const order = topoSort();
  console.log(`Topo order: ${order.length} tables`);

  const snapshot = await snapshotSelf();

  // Truncate in reverse-dependency order (CASCADE handles cycles).
  await truncateDev([...order].reverse());

  await cloneAuthUsers();

  console.log('\nCloning public tables (dependencies first)...');
  const results = [];
  for (const t of order) {
    process.stdout.write(`  ${t.padEnd(36)} `);
    try {
      const r = await cloneTable(t);
      console.log(`${String(r.count).padStart(5)}${r.skipped ? '  (skipped)' : ''}`);
      results.push(r);
    } catch (e) {
      console.log('FAILED');
      console.error(`    ${e.message}`);
      results.push({ table: t, count: 0, error: e.message });
    }
  }

  await restoreSelf(snapshot);

  await resetSequences(order);

  console.log('\n--- Summary ---');
  const ok = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);
  console.log(`Cloned ${ok.length}/${results.length} tables, ${ok.reduce((s, r) => s + r.count, 0)} rows total`);
  if (failed.length) {
    console.log(`Failed: ${failed.length}`);
    for (const f of failed) console.log(`  - ${f.table}: ${f.error}`);
  }
  console.log(`\nDone. Sign in with any cloned prod email / ${TEST_PASSWORD},`);
  console.log(`or keep using your existing dev login (${PRESERVE_EMAIL}).`);
  console.log(`When finished testing, drop the helper:`);
  console.log(`  drop function public.clone_exec_sql(text);`);
}

main().catch(err => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
