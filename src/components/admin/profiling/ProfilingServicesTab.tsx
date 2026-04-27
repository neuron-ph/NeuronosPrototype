import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Archive, RotateCcw } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { supabase } from '../../../utils/supabase/client';
import { invalidateBookingServiceCache } from '../../../hooks/useBookingServiceOptions';
import { DataTable } from '../../common/DataTable';
import type { ColumnDef } from '../../common/DataTable';
import { SidePanel } from '../../common/SidePanel';
import { NeuronModal } from '../../ui/NeuronModal';

type ServiceItem = { id: string; service_type: string; name: string; sort_order: number; is_active: boolean };
export type ServiceCatalogKind = 'services' | 'subservices';

const SERVICE_TYPES = ['Brokerage', 'Forwarding', 'Trucking', 'Marine Insurance', 'Others'];
const EMPTY_FORM = { service_type: 'Brokerage', name: '', sort_order: 999 };
const INPUT: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #E5E9F0', borderRadius: 8, fontSize: 13, color: '#12332B', background: '#FFFFFF', outline: 'none' };
const LABEL: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: '#12332B', marginBottom: 6, display: 'block' };

interface Props {
  kind: ServiceCatalogKind;
  initialQuery?: string;
}

/**
 * Shared catalog admin used by both ProfilingServicesTab and ProfilingSubServicesTab.
 * `kind` selects the underlying table.
 */
export function ServiceCatalogAdminTab({ kind, initialQuery = '' }: Props) {
  const table = kind === 'services' ? 'booking_service_catalog' : 'booking_subservice_catalog';
  const singularLabel = kind === 'services' ? 'Service' : 'Sub-Service';

  const [items, setItems] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialQuery);
  const [filterType, setFilterType] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<ServiceItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from(table).select('*').order('service_type').order('sort_order').order('name');
    if (!showInactive) q = q.eq('is_active', true);
    if (filterType) q = q.eq('service_type', filterType);
    const { data } = await q;
    setItems(data ?? []);
    setLoading(false);
  }, [table, showInactive, filterType]);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  function openCreate() { setEditing(null); setForm(EMPTY_FORM); setPanelOpen(true); }
  function openEdit(item: ServiceItem) {
    setEditing(item);
    setForm({ service_type: item.service_type, name: item.name, sort_order: item.sort_order });
    setPanelOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    const payload = { service_type: form.service_type, name: form.name.trim(), sort_order: Number(form.sort_order) || 999 };
    let error: unknown;
    if (editing) {
      ({ error } = await supabase.from(table).update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from(table).insert(payload));
    }
    setSaving(false);
    if (error) { toast.error('Save failed — may be a duplicate name'); return; }
    toast.success(editing ? 'Updated' : 'Created');
    invalidateBookingServiceCache(form.service_type);
    setPanelOpen(false);
    load();
  }

  async function handleArchive(item: ServiceItem, activate: boolean) {
    const { error } = await supabase.from(table).update({ is_active: activate }).eq('id', item.id);
    if (error) { toast.error('Failed'); return; }
    toast.success(activate ? 'Reactivated' : 'Archived');
    invalidateBookingServiceCache(item.service_type);
    setArchiveTarget(null);
    load();
  }

  const columns: ColumnDef<ServiceItem>[] = [
    { header: 'Service Type', cell: r => <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: '#F0FDF4', color: '#0F766E' }}>{r.service_type}</span> },
    { header: 'Name', cell: r => <span style={{ fontWeight: 500, color: '#12332B' }}>{r.name}</span> },
    { header: 'Order', cell: r => <span style={{ color: '#667085', fontSize: 13 }}>{r.sort_order < 999 ? r.sort_order : '—'}</span> },
    { header: 'Status', cell: r => <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: r.is_active ? '#F0FDF4' : '#FEF2F2', color: r.is_active ? '#0F766E' : '#DC2626' }}>{r.is_active ? 'Active' : 'Archived'}</span> },
    {
      header: '', cell: r => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={e => { e.stopPropagation(); openEdit(r); }} style={actionBtn}>Edit</button>
          {r.is_active
            ? <button onClick={e => { e.stopPropagation(); setArchiveTarget(r); }} style={{ ...actionBtn, color: '#DC2626' }}><Archive size={13} /></button>
            : <button onClick={e => { e.stopPropagation(); handleArchive(r, true); }} style={{ ...actionBtn, color: '#0F766E' }}><RotateCcw size={13} /></button>
          }
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#667085' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ ...INPUT, paddingLeft: 32 }} />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...INPUT, width: 'auto', minWidth: 180 }}>
          <option value="">All booking types</option>
          {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#667085', cursor: 'pointer' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show archived
        </label>
        <button onClick={openCreate} style={primaryBtn}><Plus size={14} /> New</button>
      </div>

      <DataTable data={filtered} columns={columns} isLoading={loading} emptyMessage="No items found." onRowClick={openEdit} />

      <SidePanel isOpen={panelOpen} onClose={() => setPanelOpen(false)} title={editing ? `Edit ${singularLabel}` : `New ${singularLabel}`}
        footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button onClick={() => setPanelOpen(false)} style={cancelBtn}>Cancel</button><button onClick={handleSave} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create'}</button></div>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
          <div>
            <label style={LABEL}>Booking Type</label>
            <select value={form.service_type} onChange={e => setForm(f => ({ ...f, service_type: e.target.value }))} style={INPUT}>
              {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL}>Name <span style={{ color: '#DC2626' }}>*</span></label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={INPUT} placeholder={`${singularLabel} name`} />
          </div>
          <div>
            <label style={LABEL}>Sort Order</label>
            <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} style={INPUT} min={1} />
          </div>
        </div>
      </SidePanel>

      <NeuronModal isOpen={!!archiveTarget} onClose={() => setArchiveTarget(null)} title={`Archive ${singularLabel}`}
        message={`Archive "${archiveTarget?.name}"?`} confirmLabel="Archive" confirmVariant="danger"
        onConfirm={() => archiveTarget && handleArchive(archiveTarget, false)}
      />
    </div>
  );
}

export function ProfilingServicesTab({ initialQuery = '' }: { initialQuery?: string }) {
  return <ServiceCatalogAdminTab kind="services" initialQuery={initialQuery} />;
}

const primaryBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#0F766E', color: '#FFFFFF', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const cancelBtn: React.CSSProperties = { padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E9F0', background: '#FFFFFF', color: '#12332B', fontSize: 13, cursor: 'pointer' };
const actionBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: 6, border: '1px solid #E5E9F0', background: '#FFFFFF', color: '#667085', fontSize: 12, cursor: 'pointer' };
