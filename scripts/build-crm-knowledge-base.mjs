#!/usr/bin/env node
// Build a portable CRM knowledge base from the dev Supabase mirror.
// Output: analysis/crm-knowledge-base/  (markdown dossiers + CSVs + one xlsx)
// Designed to be dropped into ChatGPT for deep research on customers, contacts,
// consignees and the connections between them. Read-only. Run after sync:dev.
//
// Usage:  node --env-file=.env.local scripts/build-crm-knowledge-base.mjs
//
// Required env (.env.local): VITE_SUPABASE_URL, DEV_SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';

const URL = process.env.VITE_SUPABASE_URL || process.env.DEV_SUPABASE_URL;
const KEY = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL / DEV_SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const db = createClient(URL, KEY, { auth: { persistSession: false } });
const ROOT = resolve('analysis/crm-knowledge-base');
const DATA = resolve(ROOT, 'data');
const LINK = resolve(ROOT, 'linkage');
const DOSS = resolve(ROOT, 'dossiers');
for (const d of [ROOT, DATA, LINK, DOSS]) mkdirSync(d, { recursive: true });

// ---------- helpers ----------
const FREE_EMAIL = new Set(['gmail.com', 'yahoo.com', 'yahoo.com.ph', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'gmail.com.ph', 'ymail.com']);

async function fetchAll(table, columns) {
  const rows = []; const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}
const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[.,]+$/, '').trim();
const slug = (s) => (s || 'unknown').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const domainOf = (email) => { const m = (email || '').toLowerCase().match(/@([^@\s]+)$/); return m ? m[1] : ''; };
const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0);
const peso = (v) => '₱' + num(v).toLocaleString('en-PH', { maximumFractionDigits: 0 });

const csvEsc = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/\r?\n/g, ' ').trim();
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows, headers) =>
  [headers.join(','), ...rows.map((r) => headers.map((h) => csvEsc(r[h])).join(','))].join('\n') + '\n';
const writeCsv = (dir, name, rows, headers) => {
  writeFileSync(resolve(dir, name), toCsv(rows, headers));
  console.log(`  ${name.padEnd(30)} ${rows.length} rows`);
};
const mdCell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim() || '—';
const mdTable = (headers, rows) => {
  if (!rows.length) return '_none_\n';
  const head = `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`).join('\n');
  return head + '\n' + body + '\n';
};

// ---------- fetch ----------
const run = async () => {
  console.log(`Building CRM knowledge base from ${URL}\n`);

  const customers = await fetchAll('customers',
    'id,name,industry,client_type,status,status_detail,lifecycle_stage,registered_address,credit_terms,payment_terms,lead_source,owner_id,notes,confidential,created_at');
  const contacts = await fetchAll('contacts',
    'id,name,first_name,last_name,title,email,phone,customer_id,is_primary,lifecycle_stage,lead_status,notes,confidential,created_at');
  const consignees = await fetchAll('consignees',
    'id,customer_id,name,address,tin,contact_person,email,phone,created_at');
  const industries = await fetchAll('profile_industries', 'value,label,sort_order,is_active');
  const bookingsRaw = await fetchAll('bookings',
    'id,booking_number,name,service_type,mode,movement_type,status,containers,total_revenue,total_cost,customer_id,customer_name,consignee_id,created_at,details');
  const quotationsRaw = await fetchAll('quotations',
    'id,quotation_number,quote_number,quotation_type,quotation_name,status,customer_id,customer_name,contact_id,contact_name,consignee_id,services,total_selling,total_buying,currency,validity_date,converted_at,created_at');

  const nameById = new Map(customers.map((c) => [c.id, c.name]));

  // ---------- flatten bookings (lift shipment intel out of details jsonb) ----------
  const D = (b, k) => { const v = b.details?.[k]; return typeof v === 'string' ? v.trim() : (v ?? ''); };
  const bookings = bookingsRaw.map((b) => ({
    id: b.id,
    booking_number: b.booking_number,
    name: b.name,
    customer_id: b.customer_id,
    customer_name: b.customer_name || nameById.get(b.customer_id) || '',
    consignee_id: b.consignee_id,
    consignee: D(b, 'consignee'),
    shipper: D(b, 'shipper'),
    service_type: b.service_type,
    mode: b.mode || D(b, 'mode'),
    movement_type: b.movement_type,
    status: b.status,
    country_of_origin: D(b, 'country_of_origin'),
    country_of_destination: D(b, 'country_of_destination'),
    pol_aol: D(b, 'pol_aol'),
    pod_aod: D(b, 'pod_aod'),
    commodity: D(b, 'description_of_goods') || D(b, 'commodity_description'),
    cargo_type: D(b, 'cargo_type'),
    incoterms: D(b, 'incoterms'),
    containers: b.containers,
    gross_weight: D(b, 'gross_weight'),
    carrier: D(b, 'carrier'),
    vessel: D(b, 'vessel'),
    forwarder: D(b, 'forwarder'),
    overseas_agent: D(b, 'overseas_agent'),
    local_agent: D(b, 'local_agent'),
    trucking_name: D(b, 'trucking_name'),
    total_revenue: num(b.total_revenue),
    total_cost: num(b.total_cost),
    created_at: b.created_at,
  }));

  const quotations = quotationsRaw.map((q) => ({
    id: q.id,
    quotation_number: q.quotation_number || q.quote_number,
    quotation_type: q.quotation_type,
    quotation_name: q.quotation_name,
    customer_id: q.customer_id,
    customer_name: q.customer_name || nameById.get(q.customer_id) || '',
    contact_name: q.contact_name,
    consignee_id: q.consignee_id,
    services: Array.isArray(q.services) ? q.services.join('; ') : '',
    status: q.status,
    total_selling: num(q.total_selling),
    total_buying: num(q.total_buying),
    currency: q.currency,
    validity_date: q.validity_date,
    converted_at: q.converted_at,
    created_at: q.created_at,
  }));

  // ---------- indexes ----------
  const byCust = (arr) => { const m = new Map(); for (const r of arr) { const k = r.customer_id; if (!k) continue; (m.get(k) || m.set(k, []).get(k)).push(r); } return m; };
  const custContacts = byCust(contacts);
  const custConsignees = byCust(consignees);
  const custBookings = byCust(bookings);
  const custQuotes = byCust(quotations);

  // ---------- enrich customers ----------
  for (const c of customers) {
    const bk = custBookings.get(c.id) || [], qt = custQuotes.get(c.id) || [];
    c._contacts = (custContacts.get(c.id) || []).length;
    c._consignees = (custConsignees.get(c.id) || []).length;
    c._bookings = bk.length;
    c._quotations = qt.length;
    c._revenue = bk.reduce((s, b) => s + b.total_revenue, 0);
    c._quoted = qt.reduce((s, q) => s + q.total_selling, 0);
    c._is_forwarder = /freight|forwarder|logistic|express|cargo|xpress/i.test(c.name) || /FREIGHT FORWARDER/i.test(c.industry || '');
    const dates = [...bk, ...qt].map((x) => x.created_at).filter(Boolean).sort();
    c._last_activity = dates.length ? dates[dates.length - 1].slice(0, 10) : '';
    c._active = c._bookings > 0 || c._quotations > 0;
  }

  // ---------- LINKAGE: shared consignees (which consignee serves >1 client) ----------
  const consByNorm = new Map();
  for (const cn of consignees) {
    const k = norm(cn.name); if (!k) continue;
    const e = consByNorm.get(k) || { name: cn.name, customers: new Set(), addresses: new Set() };
    if (cn.customer_id) e.customers.add(nameById.get(cn.customer_id) || cn.customer_id);
    if (cn.address) e.addresses.add(cn.address);
    consByNorm.set(k, e);
  }
  const sharedConsignees = [...consByNorm.values()]
    .filter((e) => e.customers.size > 1)
    .map((e) => ({ consignee_name: e.name, num_customers: e.customers.size, customers: [...e.customers].join(' | '), addresses: [...e.addresses].join(' | ') }))
    .sort((a, b) => b.num_customers - a.num_customers);

  // ---------- LINKAGE: shared email domains ----------
  const domainMap = new Map();
  const addDomain = (email, kind, name, cust) => {
    const d = domainOf(email); if (!d) return;
    const e = domainMap.get(d) || { domain: d, free: FREE_EMAIL.has(d), customers: new Set(), entities: new Set() };
    if (cust) e.customers.add(cust);
    e.entities.add(`${kind}:${name}`);
    domainMap.set(d, e);
  };
  for (const ct of contacts) addDomain(ct.email, 'contact', ct.name, nameById.get(ct.customer_id) || '');
  for (const cn of consignees) addDomain(cn.email, 'consignee', cn.name, nameById.get(cn.customer_id) || '');
  const sharedDomains = [...domainMap.values()]
    .map((e) => ({ domain: e.domain, free_email: e.free, num_customers: e.customers.size, num_entities: e.entities.size, customers: [...e.customers].filter(Boolean).join(' | ') }))
    .filter((e) => e.num_entities > 1)
    .sort((a, b) => b.num_customers - a.num_customers || b.num_entities - a.num_entities);

  // ---------- LINKAGE: duplicate customers ----------
  const custByNorm = new Map();
  for (const c of customers) { const k = norm(c.name); (custByNorm.get(k) || custByNorm.set(k, []).get(k)).push(c); }
  const duplicateCustomers = [...custByNorm.entries()]
    .filter(([, arr]) => arr.length > 1)
    .map(([k, arr]) => ({ normalized_name: k, records: arr.length, ids: arr.map((c) => c.id).join(' | '), industries: [...new Set(arr.map((c) => c.industry).filter(Boolean))].join(' | '), total_bookings: arr.reduce((s, c) => s + c._bookings, 0), total_quotations: arr.reduce((s, c) => s + c._quotations, 0) }))
    .sort((a, b) => b.records - a.records);

  // ---------- LINKAGE: shipment parties (network edges from bookings) ----------
  const partyRoles = [['shipper', 'Shipper'], ['consignee', 'Consignee'], ['carrier', 'Carrier'], ['forwarder', 'Forwarder'], ['overseas_agent', 'Overseas Agent'], ['local_agent', 'Local Agent'], ['trucking_name', 'Trucker']];
  const shipmentParties = [];
  for (const b of bookings) {
    for (const [field, role] of partyRoles) {
      const v = b[field]; if (v && v.toUpperCase() !== 'TBA' && v.toUpperCase() !== 'N/A') shipmentParties.push({ booking_number: b.booking_number, customer_name: b.customer_name, role, party_name: v });
    }
  }

  // ---------- write data/ ----------
  console.log('data/');
  for (const c of customers) { c.contacts = c._contacts; c.consignees = c._consignees; c.bookings = c._bookings; c.quotations = c._quotations; c.total_revenue = c._revenue; c.total_quoted = c._quoted; }
  writeCsv(DATA, 'customers.csv', customers, ['id', 'name', 'industry', 'client_type', 'status', 'lifecycle_stage', 'lead_source', 'registered_address', 'contacts', 'consignees', 'bookings', 'quotations', 'total_revenue', 'total_quoted', 'confidential', 'created_at']);
  for (const ct of contacts) ct.customer_name = nameById.get(ct.customer_id) || '';
  for (const ct of contacts) ct.email_domain = domainOf(ct.email);
  writeCsv(DATA, 'contacts.csv', contacts, ['id', 'name', 'title', 'email', 'email_domain', 'phone', 'customer_id', 'customer_name', 'is_primary', 'lifecycle_stage', 'lead_status', 'created_at']);
  for (const cn of consignees) cn.customer_name = nameById.get(cn.customer_id) || '';
  writeCsv(DATA, 'consignees.csv', consignees, ['id', 'name', 'customer_id', 'customer_name', 'address', 'tin', 'contact_person', 'email', 'phone', 'created_at']);
  writeCsv(DATA, 'bookings.csv', bookings, ['booking_number', 'name', 'customer_name', 'status', 'service_type', 'mode', 'movement_type', 'shipper', 'consignee', 'country_of_origin', 'country_of_destination', 'pol_aol', 'pod_aod', 'commodity', 'cargo_type', 'incoterms', 'containers', 'gross_weight', 'carrier', 'vessel', 'forwarder', 'overseas_agent', 'local_agent', 'trucking_name', 'total_revenue', 'total_cost', 'created_at']);
  writeCsv(DATA, 'quotations.csv', quotations, ['quotation_number', 'quotation_type', 'quotation_name', 'customer_name', 'contact_name', 'services', 'status', 'total_selling', 'total_buying', 'currency', 'validity_date', 'converted_at', 'created_at']);
  writeCsv(DATA, 'industry_taxonomy.csv', industries.sort((a, b) => a.sort_order - b.sort_order), ['value', 'label', 'sort_order', 'is_active']);

  // ---------- write linkage/ ----------
  console.log('linkage/');
  const c2cons = consignees.filter((cn) => cn.customer_id).map((cn) => ({ customer_name: cn.customer_name, consignee_name: cn.name, consignee_address: cn.address, contact_person: cn.contact_person, consignee_id: cn.id, customer_id: cn.customer_id }));
  writeCsv(LINK, 'customer_to_consignees.csv', c2cons, ['customer_name', 'consignee_name', 'consignee_address', 'contact_person', 'customer_id', 'consignee_id']);
  const c2cont = contacts.filter((ct) => ct.customer_id).map((ct) => ({ customer_name: ct.customer_name, contact_name: ct.name, title: ct.title, email: ct.email, phone: ct.phone, is_primary: ct.is_primary, customer_id: ct.customer_id }));
  writeCsv(LINK, 'customer_to_contacts.csv', c2cont, ['customer_name', 'contact_name', 'title', 'email', 'phone', 'is_primary', 'customer_id']);
  writeCsv(LINK, 'shared_consignees.csv', sharedConsignees, ['consignee_name', 'num_customers', 'customers', 'addresses']);
  writeCsv(LINK, 'shared_email_domains.csv', sharedDomains, ['domain', 'free_email', 'num_customers', 'num_entities', 'customers']);
  writeCsv(LINK, 'duplicate_customers.csv', duplicateCustomers, ['normalized_name', 'records', 'ids', 'industries', 'total_bookings', 'total_quotations']);
  writeCsv(LINK, 'shipment_parties.csv', shipmentParties, ['booking_number', 'customer_name', 'role', 'party_name']);
  const activity = customers.map((c) => ({ customer_name: c.name, status: c.status, industry: c.industry, client_type: c.client_type, is_forwarder: c._is_forwarder, contacts: c._contacts, consignees: c._consignees, bookings: c._bookings, quotations: c._quotations, total_revenue: c._revenue, total_quoted: c._quoted, last_activity: c._last_activity, active: c._active }))
    .sort((a, b) => (b.bookings + b.quotations) - (a.bookings + a.quotations));
  writeCsv(LINK, 'customer_activity.csv', activity, ['customer_name', 'status', 'industry', 'client_type', 'is_forwarder', 'contacts', 'consignees', 'bookings', 'quotations', 'total_revenue', 'total_quoted', 'last_activity', 'active']);

  // ---------- write dossiers/ ----------
  const usedSlugs = new Map();
  let dossierCount = 0;
  for (const c of customers) {
    let s = slug(c.name);
    if (usedSlugs.has(s)) s = `${s}-${c.id.slice(-4)}`;
    usedSlugs.set(s, true);
    const myContacts = (custContacts.get(c.id) || []);
    const myCons = (custConsignees.get(c.id) || []);
    const myBk = (custBookings.get(c.id) || []).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const myQt = (custQuotes.get(c.id) || []).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    // connections: which of my consignees are shared with other customers
    const sharedForMe = myCons.map((cn) => consByNorm.get(norm(cn.name))).filter((e) => e && e.customers.size > 1)
      .map((e) => `**${e.name}** → also: ${[...e.customers].filter((x) => x !== c.name).join(', ')}`);
    const dupNote = duplicateCustomers.find((d) => d.normalized_name === norm(c.name));

    const lines = [];
    lines.push(`# ${c.name}`, '');
    lines.push(`> Customer dossier · generated from Neuron OS · _research-ready_`, '');
    lines.push('## Profile', '');
    lines.push(mdTable(['Field', 'Value'], [
      ['Industry', c.industry], ['Client type', c.client_type], ['Status', c.status],
      ['Lifecycle', c.lifecycle_stage], ['Lead source', c.lead_source],
      ['Registered address', c.registered_address], ['Is forwarder (inferred)', c._is_forwarder ? 'YES — co-load channel' : 'no'],
      ['Created', (c.created_at || '').slice(0, 10)], ['Last activity', c._last_activity || '—'],
    ]));
    if (c.notes) lines.push('', `**Notes:** ${c.notes}`);
    lines.push('', '## Activity summary', '');
    lines.push(mdTable(['Metric', 'Value'], [
      ['Contacts', c._contacts], ['Consignees', c._consignees],
      ['Bookings', c._bookings], ['Quotations', c._quotations],
      ['Booked revenue', peso(c._revenue)], ['Quoted value', peso(c._quoted)],
    ]));
    lines.push('', '## Contacts', '');
    lines.push(mdTable(['Name', 'Title', 'Email', 'Phone'], myContacts.map((p) => [p.name, p.title, p.email, p.phone])));
    lines.push('', `## Consignees (${myCons.length})`, '');
    lines.push(mdTable(['Consignee', 'Address', 'Contact person'], myCons.map((p) => [p.name, p.address, p.contact_person])));
    lines.push('', `## Recent bookings (${myBk.length})`, '');
    lines.push(mdTable(['Booking #', 'Status', 'Mode', 'Shipper', 'Lane (POL→POD)', 'Commodity', 'Revenue'],
      myBk.slice(0, 25).map((b) => [b.booking_number, b.status, b.mode, b.shipper, `${b.pol_aol || b.country_of_origin || '?'} → ${b.pod_aod || b.country_of_destination || '?'}`, b.commodity, peso(b.total_revenue)])));
    lines.push('', `## Quotations (${myQt.length})`, '');
    lines.push(mdTable(['Quote #', 'Type', 'Status', 'Services', 'Selling'],
      myQt.slice(0, 25).map((q) => [q.quotation_number, q.quotation_type, q.status, q.services, peso(q.total_selling)])));
    lines.push('', '## Connections & flags', '');
    if (sharedForMe.length) { lines.push('**Shared consignees (also served for other customers):**', ''); sharedForMe.forEach((x) => lines.push(`- ${x}`)); lines.push(''); }
    if (dupNote) lines.push(`- ⚠ **Possible duplicate record** — "${c.name}" appears in ${dupNote.records} customer rows (ids: ${dupNote.ids}). Consider merging.`);
    if (myCons.some((cn) => !cn.tin)) lines.push(`- ⚠ ${myCons.filter((cn) => !cn.tin).length}/${myCons.length} consignees missing TIN.`);
    if (!myContacts.length) lines.push('- ⚠ No named contact on this account.');
    if (!c._active) lines.push('- ⚠ No bookings or quotations on record (dormant).');
    lines.push('', '---', `_Research prompt: "Research ${c.name} — its business, ownership, trade lanes, and how it connects to the consignees and parties listed above."_`, '');
    writeFileSync(resolve(DOSS, `${s}.md`), lines.join('\n'));
    dossierCount++;
  }
  console.log(`dossiers/  ${dossierCount} customer files`);

  // ---------- xlsx workbook ----------
  const wb = XLSX.utils.book_new();
  const addSheet = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
  addSheet('Customers', activity);
  addSheet('Contacts', contacts.map((c) => ({ name: c.name, title: c.title, email: c.email, phone: c.phone, customer: c.customer_name, is_primary: c.is_primary })));
  addSheet('Consignees', consignees.map((c) => ({ name: c.name, customer: c.customer_name, address: c.address, tin: c.tin, contact_person: c.contact_person, email: c.email, phone: c.phone })));
  addSheet('Bookings', bookings.map(({ id, customer_id, consignee_id, ...rest }) => rest));
  addSheet('Quotations', quotations.map(({ id, customer_id, consignee_id, ...rest }) => rest));
  addSheet('Shared Consignees', sharedConsignees);
  addSheet('Shipment Parties', shipmentParties);
  addSheet('Shared Email Domains', sharedDomains);
  addSheet('Duplicate Customers', duplicateCustomers);
  addSheet('Industry Taxonomy', industries);
  XLSX.writeFile(wb, resolve(ROOT, 'crm-knowledge-base.xlsx'));
  console.log('crm-knowledge-base.xlsx  (10 sheets)');

  // ---------- overview + readme ----------
  const activeCount = customers.filter((c) => c._active).length;
  const fwd = customers.filter((c) => c._is_forwarder).length;
  const overview = `# CRM Knowledge Base — Overview

Generated from the Neuron OS dev mirror (verbatim copy of prod).

## Counts
- Customers: **${customers.length}**  (${activeCount} with activity, ${customers.length - activeCount} dormant)
- Contacts: **${contacts.length}**
- Consignees: **${consignees.length}**
- Bookings: **${bookings.length}**  ·  Quotations: **${quotations.length}**
- Inferred forwarder/co-load accounts: **${fwd}**

## Connection signals to research
- **Shared consignees:** ${sharedConsignees.length} consignee names serve more than one customer (see linkage/shared_consignees.csv) — candidates for direct relationships.
- **Shipment parties:** ${shipmentParties.length} party edges (shipper/carrier/forwarder/agent/trucker) extracted from bookings — the network beyond the CRM (see linkage/shipment_parties.csv).
- **Shared email domains:** ${sharedDomains.length} domains link multiple entities (linkage/shared_email_domains.csv).
- **Duplicate customers:** ${duplicateCustomers.length} merge candidates (linkage/duplicate_customers.csv).

## How to use with ChatGPT
1. For one company: upload its file from \`dossiers/\` and ask it to research the company + the parties/consignees listed.
2. For network questions: upload the \`linkage/\` CSVs (esp. shared_consignees, shipment_parties) and ask "who are the hubs / who connects to whom."
3. For a full load: upload \`crm-knowledge-base.xlsx\` (every table as a tab).
`;
  writeFileSync(resolve(ROOT, '00_overview.md'), overview);
  writeFileSync(resolve(ROOT, 'README.md'), `# CRM Knowledge Base

Portable, ChatGPT-ready export of every customer, contact, consignee and the connections between them — pulled live from the Neuron OS dev mirror. **Contains real customer data — keep local (gitignored).**

\`\`\`
00_overview.md                 book-level summary + how-to
crm-knowledge-base.xlsx        all tables in one workbook (10 tabs)
data/                          flat tables (one row per entity)
linkage/                       derived "how they connect" views
dossiers/                      one markdown brief per customer (research-ready)
\`\`\`

Regenerate after any \`npm run sync:dev\`:
\`\`\`
node --env-file=.env.local scripts/build-crm-knowledge-base.mjs
\`\`\`
`);
  console.log('\n00_overview.md + README.md written');
  console.log('\nDone →', ROOT);
};

run().catch((e) => { console.error(e); process.exit(1); });
