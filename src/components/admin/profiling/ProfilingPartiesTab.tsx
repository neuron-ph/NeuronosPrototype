import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Archive, RotateCcw } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { supabase } from '../../../utils/supabase/client';
import { useUser } from '../../../hooks/useUser';
import { DataTable } from '../../common/DataTable';
import type { ColumnDef } from '../../common/DataTable';
import { SidePanel } from '../../common/SidePanel';
import { NeuronModal } from '../../ui/NeuronModal';

type TradeParty = {
  id: string;
  name: string;
  role_scope: 'consignee' | 'shipper' | 'both';
  address: string | null;
  tin: string | null;
  contact_person: string | null;
  contact_number: string | null;
  is_active: boolean;
  created_at: string;
};

const EMPTY_FORM = { name: '', role_scope: 'consignee' as TradeParty['role_scope'], address: '', tin: '', contact_person: '', contact_number: '' };

const INPUT = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #E5E9F0',
  borderRadius: 8,
  fontSize: 13,
  color: '#12332B',
  background: '#FFFFFF',
  outline: 'none',
} as React.CSSProperties;

const LABEL = { fontSize: 13, fontWeight: 500, color: '#12332B', marginBottom: 6, display: 'block' } as React.CSSProperties;

export function ProfilingPartiesTab({ initialQuery = '' }: { initialQuery?: string }) {
  const { user } = useUser();
  const [items, setItems] = useState<TradeParty[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialQuery);
  const [showInactive, setShowInactive] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<TradeParty | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<TradeParty | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('trade_parties').select('*').order('name');
    if (!showInactive) q = q.eq('is_active', true);
    const { data } = await q;
    setItems(data ?? []);
    setLoading(false);
  }, [showInactive]);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setPanelOpen(true);
  }

  function openEdit(item: TradeParty) {
    setEditing(item);
    setForm({
      name: item.name,
      role_scope: item.role_scope,
      address: item.address ?? '',
      tin: item.tin ?? '',
      contact_person: item.contact_person ?? '',
      contact_number: item.contact_number ?? '',
    });
    setPanelOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      role_scope: form.role_scope,
      address: form.address.trim() || null,
      tin: form.tin.trim() || null,
      contact_person: form.contact_person.trim() || null,
      contact_number: form.contact_number.trim() || null,
      updated_by: user?.id ?? null,
    };
    let error: unknown;
    if (editing) {
      ({ error } = await supabase.from('trade_parties').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('trade_parties').insert({ ...payload, created_by: user?.id ?? null }));
    }
    setSaving(false);
    if (error) { toast.error('Save failed'); return; }
    toast.success(editing ? 'Party updated' : 'Party created');
    setPanelOpen(false);
    load();
  }

  async function handleArchive(item: TradeParty, activate: boolean) {
    const { error } = await supabase.from('trade_parties').update({ is_active: activate, updated_by: user?.id ?? null }).eq('id', item.id);
    if (error) { toast.error('Failed to update'); return; }
    toast.success(activate ? 'Party reactivated' : 'Party archived');
    setArchiveTarget(null);
    load();
  }

  const columns: ColumnDef<TradeParty>[] = [
    { header: 'Name', cell: r => <span style={{ fontWeight: 500, color: '#12332B' }}>{r.name}</span> },
    {
      header: 'Role Scope', cell: r => (
        <span style={{
          fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4,
          background: r.role_scope === 'both' ? '#F0FDF4' : '#F9FAFB',
          color: r.role_scope === 'both' ? '#0F766E' : '#667085',
          textTransform: 'capitalize',
        }}>{r.role_scope === 'consignee_or_shipper' ? 'both' : r.role_scope}</span>
      ),
    },
    { header: 'TIN', cell: r => <span style={{ color: '#667085', fontSize: 13 }}>{r.tin ?? '—'}</span> },
    { header: 'Contact Person', cell: r => <span style={{ color: '#667085', fontSize: 13 }}>{r.contact_person ?? '—'}</span> },
    {
      header: 'Status', cell: r => (
        <span style={{
          fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4,
          background: r.is_active ? '#F0FDF4' : '#FEF2F2',
          color: r.is_active ? '#0F766E' : '#DC2626',
        }}>{r.is_active ? 'Active' : 'Archived'}</span>
      ),
    },
    {
      header: '',
      cell: r => (
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
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#667085' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search trade parties…" style={{ ...INPUT, paddingLeft: 32 }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#667085', cursor: 'pointer' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show archived
        </label>
        <button onClick={openCreate} style={primaryBtn}>
          <Plus size={14} /> New Party
        </button>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        isLoading={loading}
        emptyMessage="No trade parties found. Create one to get started."
        onRowClick={openEdit}
      />

      <SidePanel isOpen={panelOpen} onClose={() => setPanelOpen(false)} title={editing ? 'Edit Trade Party' : 'New Trade Party'}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setPanelOpen(false)} style={cancelBtn}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Party'}</button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
          <div>
            <label style={LABEL}>Name <span style={{ color: '#DC2626' }}>*</span></label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={INPUT} placeholder="e.g. ABC Imports Inc." />
          </div>
          <div>
            <label style={LABEL}>Role Scope</label>
            <select value={form.role_scope} onChange={e => setForm(f => ({ ...f, role_scope: e.target.value as TradeParty['role_scope'] }))} style={INPUT}>
              <option value="consignee">Consignee</option>
              <option value="shipper">Shipper</option>
              <option value="both">Both (Consignee & Shipper)</option>
            </select>
          </div>
          <div>
            <label style={LABEL}>Address</label>
            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} style={INPUT} placeholder="Business address" />
          </div>
          <div>
            <label style={LABEL}>TIN</label>
            <input value={form.tin} onChange={e => setForm(f => ({ ...f, tin: e.target.value }))} style={INPUT} placeholder="Tax identification number" />
          </div>
          <div>
            <label style={LABEL}>Contact Person</label>
            <input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} style={INPUT} placeholder="Full name" />
          </div>
          <div>
            <label style={LABEL}>Contact Number</label>
            <input value={form.contact_number} onChange={e => setForm(f => ({ ...f, contact_number: e.target.value }))} style={INPUT} placeholder="+63 9XX XXX XXXX" />
          </div>
        </div>
      </SidePanel>

      <NeuronModal
        isOpen={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        title="Archive Trade Party"
        message={`Archive "${archiveTarget?.name}"? It will no longer appear in booking lookups but historical bookings will not be affected.`}
        confirmLabel="Archive"
        confirmVariant="danger"
        onConfirm={() => archiveTarget && handleArchive(archiveTarget, false)}
      />
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '7px 14px', borderRadius: 8, border: 'none',
  background: '#0F766E', color: '#FFFFFF', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};

const cancelBtn: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E9F0',
  background: '#FFFFFF', color: '#12332B', fontSize: 13, cursor: 'pointer',
};

const actionBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center',
  padding: '4px 8px', borderRadius: 6, border: '1px solid #E5E9F0',
  background: '#FFFFFF', color: '#667085', fontSize: 12, cursor: 'pointer',
};
