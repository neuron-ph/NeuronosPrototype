#!/usr/bin/env node
// Export the CRM directory (customers, contacts, consignees, industry taxonomy)
// from the dev Supabase project to CSV files under analysis/crm-intelligence/.
// Read-only. Run after `npm run sync:dev` so dev mirrors prod.
//
// Usage:  node --env-file=.env.local scripts/export-crm-directory.mjs
//
// Required env (.env.local):
//   VITE_SUPABASE_URL                 # dev URL
//   DEV_SUPABASE_SERVICE_ROLE_KEY     # dev service role

import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const URL = process.env.VITE_SUPABASE_URL || process.env.DEV_SUPABASE_URL;
const KEY = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL / DEV_SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const db = createClient(URL, KEY, { auth: { persistSession: false } });
const OUT = resolve('analysis/crm-intelligence');
mkdirSync(OUT, { recursive: true });

async function fetchAll(table, columns, order) {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select(columns).order(order).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

function toCsv(rows, headers) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/\r?\n/g, ' ').trim();
    return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(','));
  return lines.join('\n') + '\n';
}

function write(name, rows, headers) {
  writeFileSync(resolve(OUT, name), toCsv(rows, headers));
  console.log(`  ${name.padEnd(28)} ${rows.length} rows`);
}

const run = async () => {
  console.log(`Exporting CRM directory from ${URL}\n`);

  const customers = await fetchAll('customers',
    'id,name,industry,client_type,status,status_detail,lifecycle_stage,registered_address,credit_terms,payment_terms,lead_source,owner_id,confidential,created_at',
    'name');
  const contacts = await fetchAll('contacts',
    'id,name,first_name,last_name,title,email,phone,customer_id,is_primary,lifecycle_stage,lead_status,owner_id,confidential,created_at',
    'name');
  const consignees = await fetchAll('consignees',
    'id,customer_id,name,address,tin,contact_person,email,phone,created_at',
    'name');
  const industries = await fetchAll('profile_industries', 'value,label,sort_order,is_active', 'sort_order');

  // enrich customers with relationship + activity counts
  const bookings = await fetchAll('bookings', 'customer_id', 'customer_id');
  const quotations = await fetchAll('quotations', 'customer_id', 'customer_id');
  const tally = (arr) => arr.reduce((m, r) => (r.customer_id && m.set(r.customer_id, (m.get(r.customer_id) || 0) + 1), m), new Map());
  const bk = tally(bookings), qt = tally(quotations);
  const consigneeCount = tally(consignees), contactCount = tally(contacts);
  for (const c of customers) {
    c.contacts = contactCount.get(c.id) || 0;
    c.consignees = consigneeCount.get(c.id) || 0;
    c.bookings = bk.get(c.id) || 0;
    c.quotations = qt.get(c.id) || 0;
  }

  // resolve consignee.customer_id -> customer name for readability
  const nameById = new Map(customers.map((c) => [c.id, c.name]));
  for (const cn of consignees) cn.customer_name = nameById.get(cn.customer_id) || '';
  for (const ct of contacts) ct.customer_name = nameById.get(ct.customer_id) || '';

  console.log('Writing CSVs to analysis/crm-intelligence/');
  write('customers.csv', customers,
    ['id', 'name', 'industry', 'client_type', 'status', 'lifecycle_stage', 'lead_source', 'registered_address', 'contacts', 'consignees', 'bookings', 'quotations', 'confidential', 'created_at']);
  write('contacts.csv', contacts,
    ['id', 'name', 'title', 'email', 'phone', 'customer_id', 'customer_name', 'is_primary', 'lifecycle_stage', 'lead_status', 'created_at']);
  write('consignees.csv', consignees,
    ['id', 'name', 'customer_id', 'customer_name', 'address', 'tin', 'contact_person', 'email', 'phone', 'created_at']);
  write('industry_taxonomy.csv', industries, ['value', 'label', 'sort_order', 'is_active']);

  console.log('\nDone.');
};

run().catch((e) => { console.error(e); process.exit(1); });
