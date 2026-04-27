import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Archive, RotateCcw } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { supabase } from '../../../utils/supabase/client';
import { DataTable } from '../../common/DataTable';
import type { ColumnDef } from '../../common/DataTable';
import { SidePanel } from '../../common/SidePanel';
import { NeuronModal } from '../../ui/NeuronModal';

type Country = { id: string; iso_code: string; name: string; sort_order: number; is_active: boolean };

const EMPTY_FORM = { iso_code: '', name: '', sort_order: 999 };
const INPUT: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #E5E9F0', borderRadius: 8, fontSize: 13, color: '#12332B', background: '#FFFFFF', outline: 'none' };
const LABEL: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: '#12332B', marginBottom: 6, display: 'block' };

export function ProfilingCountriesTab({ initialQuery = '' }: { initialQuery?: string }) {
  const [items, setItems] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialQuery);
  const [showInactive, setShowInactive] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<Country | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Country | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('profile_countries').select('*').order('sort_order').order('name');
    if (!showInactive) q = q.eq('is_active', true);
    const { data } = await q;
    setItems(data ?? []);
    setLoading(false);
  }, [showInactive]);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.iso_code.toLowerCase().includes(search.toLowerCase()),
  );

  function openCreate() { setEditing(null); setForm(EMPTY_FORM); setPanelOpen(true); }
  function openEdit(item: Country) {
    setEditing(item);
    setForm({ iso_code: item.iso_code, name: item.name, sort_order: item.sort_order });
    setPanelOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.iso_code.trim()) { toast.error('ISO code and name are required'); return; }
    setSaving(true);
    const payload = { iso_code: form.iso_code.trim().toUpperCase(), name: form.name.trim(), sort_order: Number(form.sort_order) || 999 };
    let error: unknown;
    if (editing) {
      ({ error } = await supabase.from('profile_countries').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('profile_countries').insert(payload));
    }
    setSaving(false);
    if (error) { toast.error('Save failed — ISO code may already exist'); return; }
    toast.success(editing ? 'Country updated' : 'Country created');
    setPanelOpen(false);
    load();
  }

  async function handleArchive(item: Country, activate: boolean) {
    const { error } = await supabase.from('profile_countries').update({ is_active: activate }).eq('id', item.id);
    if (error) { toast.error('Failed'); return; }
    toast.success(activate ? 'Reactivated' : 'Archived');
    setArchiveTarget(null);
    load();
  }

  const columns: ColumnDef<Country>[] = [
    { header: 'ISO', cell: r => <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#12332B' }}>{r.iso_code}</span> },
    { header: 'Name', cell: r => <span style={{ color: '#12332B' }}>{r.name}</span> },
    { header: 'Priority', cell: r => <span style={{ color: '#667085', fontSize: 13 }}>{r.sort_order < 999 ? `Top ${r.sort_order}` : '—'}</span> },
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
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#667085' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search countries…" style={{ ...INPUT, paddingLeft: 32 }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#667085', cursor: 'pointer' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show archived
        </label>
        <button onClick={openCreate} style={primaryBtn}><Plus size={14} /> New Country</button>
      </div>

      <DataTable data={filtered} columns={columns} isLoading={loading} emptyMessage="No countries found." onRowClick={openEdit} />

      <SidePanel isOpen={panelOpen} onClose={() => setPanelOpen(false)} title={editing ? 'Edit Country' : 'New Country'}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setPanelOpen(false)} style={cancelBtn}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create'}</button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
          <div>
            <label style={LABEL}>ISO Code <span style={{ color: '#DC2626' }}>*</span></label>
            <input value={form.iso_code} onChange={e => setForm(f => ({ ...f, iso_code: e.target.value.toUpperCase().slice(0, 2) }))} style={INPUT} placeholder="e.g. PH" maxLength={2} />
          </div>
          <div>
            <label style={LABEL}>Name <span style={{ color: '#DC2626' }}>*</span></label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={INPUT} placeholder="e.g. Philippines" />
          </div>
          <div>
            <label style={LABEL}>Priority (1 = shown first, 999 = default)</label>
            <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} style={INPUT} min={1} max={999} />
          </div>
        </div>
      </SidePanel>

      <NeuronModal isOpen={!!archiveTarget} onClose={() => setArchiveTarget(null)} title="Archive Country"
        message={`Archive "${archiveTarget?.name}"? It will no longer appear in country lookups.`}
        confirmLabel="Archive" confirmVariant="danger"
        onConfirm={() => archiveTarget && handleArchive(archiveTarget, false)}
      />
    </div>
  );
}

const primaryBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#0F766E', color: '#FFFFFF', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const cancelBtn: React.CSSProperties = { padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E9F0', background: '#FFFFFF', color: '#12332B', fontSize: 13, cursor: 'pointer' };
const actionBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: 6, border: '1px solid #E5E9F0', background: '#FFFFFF', color: '#667085', fontSize: 12, cursor: 'pointer' };
