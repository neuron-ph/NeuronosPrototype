#!/usr/bin/env node
// Sync prod -> dev: makes dev a verbatim 1:1 mirror of prod (data + storage
// files), then forces every cloned login's password to devpassword123 so you
// can reproduce prod-reported bugs against real customer / role / financial
// data. Preserves Marcus's own dev login across the wipe.
//
// Usage:
//   npm run sync:dev                 # full mirror (data + storage)
//   npm run sync:dev -- --no-storage # data only (skip bucket files)
//   npm run sync:dev -- --strict     # abort if prod has tables/cols dev lacks
//
// Required env (.env.local):
//   PROD_SUPABASE_URL=https://ubspbukgcxmzegnomlgi.supabase.co
//   PROD_SUPABASE_SERVICE_ROLE_KEY=...
//   DEV_SUPABASE_SERVICE_ROLE_KEY=...
//   (VITE_SUPABASE_URL is already the dev URL)
// Optional:
//   PRESERVE_EMAIL=nanaymo224469@gmail.com   # whose dev login to keep
//
// One-time DB setup (security-definer helpers, install on BOTH projects):
//   public.clone_exec_sql(sql text)   -- dev only, runs TRUNCATE/setval
//   public.clone_introspect()         -- dev + prod, returns live schema as json
//
// Self-discovering: the table list, FK graph, primary keys and columns are read
// live from prod each run (clone_introspect), so new tables/columns are picked
// up automatically with no edits here. Cycles are broken generically by nulling
// nullable back-edge FK columns on insert and back-filling them afterward.

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
const PRESERVE_EMAIL = (process.env.PRESERVE_EMAIL || 'nanaymo224469@gmail.com').toLowerCase();
const CHUNK = 500;
const PAGE = 1000;
const NO_STORAGE = process.argv.includes('--no-storage');
const STRICT = process.argv.includes('--strict');

const prod = createClient(PROD_URL, PROD_KEY, { auth: { persistSession: false } });
const dev  = createClient(DEV_URL,  DEV_KEY,  { auth: { persistSession: false } });

// ---------- helpers ----------

async function devSql(sql) {
  const { error } = await dev.rpc('clone_exec_sql', { sql });
  if (error) throw new Error(`devSql failed: ${error.message}\nSQL: ${sql.slice(0, 200)}`);
}

async function introspect(client, label) {
  const { data, error } = await client.rpc('clone_introspect');
  if (error) {
    console.error(`\nMissing helper public.clone_introspect() on ${label}. Install it with:`);
    console.error(`  (see header of this file / scripts docs — security-definer json introspection)`);
    throw new Error(`clone_introspect() missing on ${label}: ${error.message}`);
  }
  return data;
}

async function fetchAll(client, table, columns = '*') {
  const out = [];
  let from = 0;
  while (true) {
    const { data, error } = await client.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

// Topo sort (dependencies first). Records the back-edges it skips to break
// cycles, so callers know which FK columns to defer.
function buildOrder(tables, fks) {
  const tableSet = new Set(tables);
  const deps = new Map(tables.map(t => [t, new Set()]));
  for (const f of fks) {
    if (f.src !== f.dst && tableSet.has(f.src) && tableSet.has(f.dst)) deps.get(f.src).add(f.dst);
  }
  const order = [], visited = new Set(), stack = new Set();
  const backEdges = new Set(); // "src->dst"
  function visit(n) {
    if (visited.has(n)) return;
    stack.add(n);
    for (const d of deps.get(n) || []) {
      if (stack.has(d)) { backEdges.add(`${n}->${d}`); continue; }
      visit(d);
    }
    stack.delete(n);
    visited.add(n);
    order.push(n);
  }
  for (const t of tables) visit(t);
  return { order, backEdges };
}

// ---------- clone steps ----------

async function snapshotSelf() {
  console.log(`Snapshotting self (${PRESERVE_EMAIL})...`);
  const { data: list, error } = await dev.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const me = list.users.find(u => (u.email || '').toLowerCase() === PRESERVE_EMAIL);
  if (!me) { console.log(`  no dev auth user matches ${PRESERVE_EMAIL} — nothing to preserve`); return null; }
  const { data: pubRow, error: e2 } = await dev.from('users').select('*').eq('auth_id', me.id).maybeSingle();
  if (e2) throw new Error(`failed to read self public.users row: ${e2.message}`);
  console.log(`  auth.users id=${me.id} public.users id=${pubRow?.id ?? '(none)'}`);
  return { authUser: me, publicRow: pubRow };
}

async function restoreSelf(snapshot) {
  if (!snapshot || !snapshot.publicRow) { console.log('No self public.users row to restore.'); return; }
  console.log(`Restoring self public.users row (auth_id=${snapshot.authUser.id})...`);
  const row = { ...snapshot.publicRow };
  const { data: authIdClash } = await dev.from('users').select('id').eq('auth_id', row.auth_id).maybeSingle();
  if (authIdClash) { console.log(`  auth_id already present (row ${authIdClash.id}) — skipping restore`); return; }
  const { data: idClash } = await dev.from('users').select('id').eq('id', row.id).maybeSingle();
  if (idClash) {
    row.id = `usr_${snapshot.authUser.id.slice(0, 8)}_self`;
    console.log(`  id collided with a prod row — re-IDing to ${row.id}`);
  }
  const { error } = await dev.from('users').insert(row);
  if (error) throw new Error(`failed to restore self public.users row: ${error.message}`);
  console.log('  restored.');
}

async function truncateDev(tablesReverseOrder) {
  const quoted = tablesReverseOrder.map(t => `public."${t}"`).join(', ');
  console.log(`Truncating ${tablesReverseOrder.length} dev tables...`);
  await devSql(`truncate table ${quoted} restart identity cascade`);
}

// Insert rows; on a chunk error fall back to row-by-row tolerating duplicate
// keys (handles dev-only unique constraints stricter than prod).
async function insertRows(table, rows) {
  let inserted = 0, skipped = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await dev.from(table).insert(slice);
    if (!error) { inserted += slice.length; continue; }
    for (const row of slice) {
      const { error: e2 } = await dev.from(table).insert(row);
      if (!e2) { inserted += 1; continue; }
      const code = e2.code || (e2.details && e2.details.code);
      if (code === '23505' || /duplicate key/i.test(e2.message)) { skipped += 1; continue; }
      throw new Error(`insert into ${table} failed: ${e2.message}`);
    }
  }
  return { inserted, skipped };
}

async function copyTable(table, allowedCols, nullCols) {
  let rows;
  try { rows = await fetchAll(prod, table); }
  catch (e) { return { table, count: 0, skipped: true, note: e.message }; }
  if (!rows.length) return { table, count: 0 };

  const nullSet = new Set(nullCols);
  const prepared = rows.map(r => {
    const out = {};
    for (const k of Object.keys(r)) {
      if (!allowedCols.has(k)) continue;       // drop prod-only columns dev lacks
      out[k] = nullSet.has(k) ? null : r[k];   // null deferred back-edge FKs
    }
    return out;
  });
  const { inserted, skipped } = await insertRows(table, prepared);
  return { table, count: inserted, dupSkipped: skipped };
}

// After all tables load, re-fill the FK columns we nulled to break cycles.
async function backfillDeferred(deferred, pkMap) {
  if (!deferred.length) return;
  console.log('\nBack-filling deferred cycle columns...');
  for (const { table, cols } of deferred) {
    const pk = pkMap.get(table) || ['id'];
    const rows = await fetchAll(prod, table, [...pk, ...cols].join(','));
    let updated = 0;
    for (const r of rows) {
      const patch = {};
      for (const c of cols) if (r[c] != null) patch[c] = r[c];
      if (!Object.keys(patch).length) continue;
      const match = Object.fromEntries(pk.map(k => [k, r[k]]));
      const { error } = await dev.from(table).update(patch).match(match);
      if (error) throw new Error(`backfill ${table} (${cols.join(',')}): ${error.message}`);
      updated += 1;
    }
    console.log(`  ${table.padEnd(28)} ${cols.join(',')} -> ${updated} rows`);
  }
}

async function cloneAuthUsers() {
  console.log('\nCloning auth users (real emails, password = devpassword123)...');
  const { data: prodList, error: e1 } = await prod.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (e1) throw e1;
  const { data: devList, error: e2 } = await dev.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (e2) throw e2;
  const devIds = new Set(devList.users.map(u => u.id));
  const devEmails = new Set(devList.users.map(u => (u.email || '').toLowerCase()).filter(Boolean));
  console.log(`  ${prodList.users.length} prod users, ${devList.users.length} existing dev users preserved`);

  let created = 0, skipped = 0;
  for (const u of prodList.users) {
    if (devIds.has(u.id) || (u.email && devEmails.has(u.email.toLowerCase()))) { skipped += 1; continue; }
    // public.users already holds this user's row (copied above). The auth
    // trigger's INSERT ... ON CONFLICT (auth_id) DO NOTHING no-ops against it.
    const { error } = await dev.auth.admin.createUser({
      id: u.id,
      email: u.email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { ...(u.user_metadata || {}), cloned_from_prod: true },
    });
    if (error) { console.error(`  failed ${u.id} (${u.email}): ${error.message}`); throw error; }
    created += 1;
    if (created % 25 === 0) console.log(`  ${created}/${prodList.users.length - skipped}`);
  }
  console.log(`  created ${created}, skipped ${skipped} (already in dev)`);
}

async function resetSequences(tables) {
  console.log('\nResetting sequences...');
  for (const t of tables) {
    const sql = `
      do $$ declare seq text; begin
        select pg_get_serial_sequence('public.${t}', 'id') into seq;
        if seq is not null then
          execute format('select setval(%L, coalesce((select max(id) from public.%I), 1))', seq, '${t}');
        end if;
      exception when others then null; end $$;`;
    try { await devSql(sql); } catch { /* tables without integer id */ }
  }
}

// ---------- storage ----------

async function listAllObjects(client, bucket, prefix = '') {
  const out = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client.storage.from(bucket)
      .list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    if (!data.length) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) out.push(...await listAllObjects(client, bucket, path)); // folder
      else out.push(path);
    }
    if (data.length < 100) break;
    offset += 100;
  }
  return out;
}

async function syncStorage() {
  console.log('\nSyncing storage buckets...');
  const { data: buckets, error } = await prod.storage.listBuckets();
  if (error) throw error;
  const { data: devBuckets } = await dev.storage.listBuckets();
  const devNames = new Set((devBuckets || []).map(b => b.name));

  for (const b of buckets) {
    if (!devNames.has(b.name)) {
      const { error: ce } = await dev.storage.createBucket(b.name, { public: b.public });
      if (ce) { console.error(`  ${b.name}: cannot create bucket: ${ce.message}`); continue; }
    }
    let paths;
    try { paths = await listAllObjects(prod, b.name); }
    catch (e) { console.error(`  ${b.name}: list failed: ${e.message}`); continue; }
    let ok = 0, fail = 0;
    for (const p of paths) {
      const { data: blob, error: de } = await prod.storage.from(b.name).download(p);
      if (de) { fail += 1; continue; }
      const { error: ue } = await dev.storage.from(b.name)
        .upload(p, blob, { upsert: true, contentType: blob.type || undefined });
      if (ue) { fail += 1; } else ok += 1;
    }
    console.log(`  ${b.name.padEnd(16)} ${ok} files copied${fail ? `, ${fail} failed` : ''}`);
  }
}

// ---------- main ----------

async function main() {
  console.log(`Dev:  ${DEV_URL}`);
  console.log(`Prod: ${PROD_URL}\n`);

  const { error: pingErr } = await dev.rpc('clone_exec_sql', { sql: 'select 1' });
  if (pingErr) {
    console.error(`Dev helper public.clone_exec_sql missing. Install with:`);
    console.error(`  create or replace function public.clone_exec_sql(sql text)`);
    console.error(`  returns void language plpgsql security definer as $$ begin execute sql; end $$;`);
    process.exit(1);
  }

  const prodSchema = await introspect(prod, 'prod');
  const devSchema  = await introspect(dev, 'dev');

  // Build lookups from prod (source of truth for what data exists).
  const devTables = new Set(devSchema.tables);
  const devCols = new Set(devSchema.columns.map(c => `${c.tbl}.${c.col}`));
  const tables = prodSchema.tables.filter(t => devTables.has(t)); // only copy tables dev has
  const allowedColsByTable = new Map();
  for (const t of tables) allowedColsByTable.set(t, new Set());
  for (const c of prodSchema.columns) {
    if (allowedColsByTable.has(c.tbl) && devCols.has(`${c.tbl}.${c.col}`)) allowedColsByTable.get(c.tbl).add(c.col);
  }
  const pkMap = new Map();
  for (const t of tables) pkMap.set(t, []);
  for (const p of [...prodSchema.pks].sort((a, b) => a.pos - b.pos)) {
    if (pkMap.has(p.tbl)) pkMap.get(p.tbl).push(p.col);
  }

  // Schema-diff guard (the "catch each other up" safety valve).
  const missingTables = prodSchema.tables.filter(t => !devTables.has(t));
  const missingCols = prodSchema.columns
    .filter(c => devTables.has(c.tbl) && !devCols.has(`${c.tbl}.${c.col}`))
    .map(c => `${c.tbl}.${c.col}`);
  if (missingTables.length || missingCols.length) {
    console.log('\n⚠  Schema drift — present in PROD but missing in DEV (not copied):');
    if (missingTables.length) console.log(`   tables:  ${missingTables.join(', ')}`);
    if (missingCols.length)  console.log(`   columns: ${missingCols.join(', ')}`);
    console.log('   Dev usually leads, so run pending dev migrations or release dev->prod.\n');
    if (STRICT) { console.error('Aborting (--strict).'); process.exit(1); }
  }

  const { order, backEdges } = buildOrder(tables, prodSchema.fks);
  console.log(`Schema: ${tables.length} tables, ${prodSchema.fks.length} FKs, ${backEdges.size} cycle edge(s)`);

  // Map each table to the nullable FK columns we must defer (back-edges).
  const deferCols = new Map();
  for (const f of prodSchema.fks) {
    if (!backEdges.has(`${f.src}->${f.dst}`)) continue;
    if (!f.nullable) { console.log(`  ⚠ non-nullable cycle edge ${f.src}.${f.col}->${f.dst} — cannot defer`); continue; }
    if (!deferCols.has(f.src)) deferCols.set(f.src, new Set());
    deferCols.get(f.src).add(f.col);
  }

  const snapshot = await snapshotSelf();

  await truncateDev([...order].reverse());

  console.log('\nCopying tables (dependencies first)...');
  const results = [];
  for (const t of order) {
    process.stdout.write(`  ${t.padEnd(34)} `);
    try {
      const r = await copyTable(t, allowedColsByTable.get(t), [...(deferCols.get(t) || [])]);
      const extra = r.skipped ? '  (skipped)' : (r.dupSkipped ? `  (${r.dupSkipped} dup-skipped)` : '');
      console.log(`${String(r.count).padStart(5)}${extra}`);
      results.push(r);
    } catch (e) {
      console.log('FAILED'); console.error(`    ${e.message}`);
      results.push({ table: t, count: 0, error: e.message });
    }
  }

  const deferred = [...deferCols.entries()].map(([table, cols]) => ({ table, cols: [...cols] }));
  await backfillDeferred(deferred, pkMap);

  await cloneAuthUsers();
  await restoreSelf(snapshot);
  await resetSequences(order);

  if (!NO_STORAGE) await syncStorage();
  else console.log('\nSkipping storage (--no-storage).');

  console.log('\n--- Summary ---');
  const ok = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);
  console.log(`Cloned ${ok.length}/${results.length} tables, ${ok.reduce((s, r) => s + r.count, 0)} rows total`);
  if (failed.length) {
    console.log(`Failed: ${failed.length}`);
    for (const f of failed) console.log(`  - ${f.table}: ${f.error}`);
  }
  console.log(`\nDone. Dev now mirrors prod. Sign in with any prod email / ${TEST_PASSWORD},`);
  console.log(`or keep using your existing dev login (${PRESERVE_EMAIL}).`);
}

main().catch(err => { console.error('\nFATAL:', err); process.exit(1); });
