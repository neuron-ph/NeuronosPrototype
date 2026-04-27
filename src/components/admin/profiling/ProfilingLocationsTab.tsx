import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Archive, RotateCcw } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { supabase } from '../../../utils/supabase/client';
import { useUser } from '../../../hooks/useUser';
import { DataTable } from '../../common/DataTable';
import type { ColumnDef } from '../../common/DataTable';
import { SidePanel } from '../../common/SidePanel';
import { NeuronModal } from '../../ui/NeuronModal';

type Location = {
  id: string;
  kind: 'port' | 'warehouse';
  name: string;
  code: string | null;
  transport_modes: string[];
  is_active: boolean;
};

const EMPTY_FORM = { kind: 'port' as 'port' | 'warehouse', name: '', code: '', transport_modes: [] as string[] };
const INPUT: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #E5E9F0', borderRadius: 8, fontSize: 13, color: '#12332B', background: '#FFFFFF', outline: 'none' };
const LABEL: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: '#12332B', marginBottom: 6, display: 'block' };
const MODE_OPTIONS = ['sea', 'air', 'land', 'multi'];

export function ProfilingLocationsTab({ initialQuery = '' }: { initialQuery?: string }) {
  const { user } = useUser();
  const [items, setItems] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialQuery);
  const [filterKind, setFilterKind] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Location | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('profile_locations').select('*').order('name');
    if (!showInactive) q = q.eq('is_active', true);
    if (filterKind) q = q.eq('kind', filterKind);
    const { data } = await q;
    setItems(data ?? []);
    setLoading(false);
  }, [showInactive, filterKind]);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.code ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setPanelOpen(true);
  }

  function openEdit(item: Location) {
    setEditing(item);
    setForm({ kind: item.kind, name: item.name, code: item.code ?? '', transport_modes: item.transport_modes ?? [] });
    setPanelOpen(true);
  }

  function toggleMode(mode: string) {
    setForm(f => ({
      ...f,
      transport_modes: f.transport_modes.includes(mode)
        ? f.transport_modes.filter(m => m !== mode)
        : [...f.transport_modes, mode],
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    const payload = { kind: form.kind, name: form.name.trim(), code: form.code.trim() || null, transport_modes: form.transport_modes, updated_by: user?.id ?? null };
    let error: unknown;
    if (editing) {
      ({ error } = await supabase.from('profile_locations').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('profile_locations').insert({ ...payload, created_by: user?.id ?? null }));
    }
    setSaving(false);
    if (error) { toast.error('Save failed'); return; }
    toast.success(editing ? 'Location updated' : 'Location created');
    setPanelOpen(false);
    load();
  }

  async function handleArchive(item: Location, activate: boolean) {
    const { error } = await supabase.from('profile_locations').update({ is_active: activate, updated_by: user?.id ?? null }).eq('id', item.id);
    if (error) { toast.error('Failed'); return; }
    toast.success(activate ? 'Reactivated' : 'Archived');
    setArchiveTarget(null);
    load();
  }

  const columns: ColumnDef<Location>[] = [
    {
      header: 'Name', cell: r => (
        <div>
          <div style={{ fontWeight: 500, color: '#12332B' }}>{r.name}</div>
          {r.code && <div style={{ fontSize: 11, color: '#667085' }}>{r.code}</div>}
        </div>
      ),
    },
    {
      header: 'Kind', cell: r => (
        <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: r.kind === 'port' ? '#EFF6FF' : '#FFF7ED', color: r.kind === 'port' ? '#3B82F6' : '#F59E0B', textTransform: 'capitalize' }}>{r.kind}</span>
      ),
    },
    {
      header: 'Modes', cell: r => (
        <div style={{ display: 'flex', gap: 4 }}>
          {(r.transport_modes ?? []).length === 0
            ? <span style={{ color: '#667085', fontSize: 12 }}>—</span>
            : (r.transport_modes ?? []).map(m => <span key={m} style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, background: '#F3F4F6', color: '#667085' }}>{m}</span>)
          }
        </div>
      ),
    },
    {
      header: 'Status', cell: r => (
        <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4, background: r.is_active ? '#F0FDF4' : '#FEF2F2', color: r.is_active ? '#0F766E' : '#DC2626' }}>{r.is_active ? 'Active' : 'Archived'}</span>
      ),
    },
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search locations…" style={{ ...INPUT, paddingLeft: 32 }} />
        </div>
        <select value={filterKind} onChange={e => setFilterKind(e.target.value)} style={{ ...INPUT, width: 'auto', minWidth: 140 }}>
          <option value="">All types</option>
          <option value="port">Port</option>
          <option value="warehouse">Warehouse</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#667085', cursor: 'pointer' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show archived
        </label>
        <button onClick={openCreate} style={primaryBtn}><Plus size={14} /> New Location</button>
      </div>

      <DataTable data={filtered} columns={columns} isLoading={loading} emptyMessage="No locations found." onRowClick={openEdit} />

      <SidePanel isOpen={panelOpen} onClose={() => setPanelOpen(false)} title={editing ? 'Edit Location' : 'New Location'}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setPanelOpen(false)} style={cancelBtn}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Location'}</button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
          <div>
            <label style={LABEL}>Type</label>
            <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as 'port' | 'warehouse' }))} style={INPUT}>
              <option value="port">Port</option>
              <option value="warehouse">Warehouse</option>
            </select>
          </div>
          <div>
            <label style={LABEL}>Name <span style={{ color: '#DC2626' }}>*</span></label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={INPUT} placeholder="e.g. Port of Manila" />
          </div>
          <div>
            <label style={LABEL}>Code</label>
            <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} style={INPUT} placeholder="e.g. PHMNL" />
          </div>
          <div>
            <label style={LABEL}>Transport Modes</label>
            <div style={{ display: 'flex', gap: 12 }}>
              {MODE_OPTIONS.map(mode => (
                <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#12332B', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.transport_modes.includes(mode)} onChange={() => toggleMode(mode)} style={{ accentColor: '#0F766E' }} />
                  {mode}
                </label>
              ))}
            </div>
          </div>
        </div>
      </SidePanel>

      <NeuronModal isOpen={!!archiveTarget} onClose={() => setArchiveTarget(null)} title="Archive Location"
        message={`Archive "${archiveTarget?.name}"? It will no longer appear in booking lookups.`}
        confirmLabel="Archive" confirmVariant="danger"
        onConfirm={() => archiveTarget && handleArchive(archiveTarget, false)}
      />
    </div>
  );
}

const primaryBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#0F766E', color: '#FFFFFF', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const cancelBtn: React.CSSProperties = { padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E9F0', background: '#FFFFFF', color: '#12332B', fontSize: 13, cursor: 'pointer' };
const actionBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: 6, border: '1px solid #E5E9F0', background: '#FFFFFF', color: '#667085', fontSize: 12, cursor: 'pointer' };
