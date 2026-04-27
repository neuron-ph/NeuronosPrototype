import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Tag } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { supabase } from '../../../utils/supabase/client';
import { DataTable } from '../../common/DataTable';
import type { ColumnDef } from '../../common/DataTable';
import { SidePanel } from '../../common/SidePanel';

type Provider = {
  id: string;
  company_name: string;
  provider_type: string;
  booking_profile_tags: string[];
  country: string | null;
  contact_person: string | null;
  contact_email: string | null;
};

const ALL_TAGS = ['carrier', 'agent', 'consolidator', 'forwarder', 'shipping_line', 'trucking_company', 'insurer'];

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid #E5E9F0',
  borderRadius: 8, fontSize: 13, color: '#12332B', background: '#FFFFFF', outline: 'none',
};
const LABEL: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: '#12332B', marginBottom: 6, display: 'block' };

export function ProfilingProvidersTab({ initialQuery = '' }: { initialQuery?: string }) {
  const [items, setItems] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialQuery);
  const [filterTag, setFilterTag] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('service_providers').select('id, company_name, provider_type, booking_profile_tags, country, contact_person, contact_email').order('company_name');
    if (filterTag) q = q.contains('booking_profile_tags', [filterTag]);
    const { data } = await q;
    setItems(data ?? []);
    setLoading(false);
  }, [filterTag]);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(i => i.company_name.toLowerCase().includes(search.toLowerCase()));

  function openEdit(item: Provider) {
    setEditing(item);
    setTags(item.booking_profile_tags ?? []);
    setPanelOpen(true);
  }

  function toggleTag(tag: string) {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase.from('service_providers').update({ booking_profile_tags: tags }).eq('id', editing.id);
    setSaving(false);
    if (error) { toast.error('Save failed'); return; }
    toast.success('Booking tags updated');
    setPanelOpen(false);
    load();
  }

  const columns: ColumnDef<Provider>[] = [
    { header: 'Company Name', cell: r => <span style={{ fontWeight: 500, color: '#12332B' }}>{r.company_name}</span> },
    { header: 'Provider Type', cell: r => <span style={{ color: '#667085', fontSize: 13 }}>{r.provider_type}</span> },
    {
      header: 'Booking Tags',
      cell: r => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(r.booking_profile_tags ?? []).length === 0
            ? <span style={{ color: '#667085', fontSize: 12 }}>—</span>
            : (r.booking_profile_tags ?? []).map(t => (
              <span key={t} style={{ fontSize: 11, fontWeight: 500, padding: '2px 6px', borderRadius: 4, background: '#EFF6FF', color: '#3B82F6' }}>{t}</span>
            ))
          }
        </div>
      ),
    },
    { header: 'Country', cell: r => <span style={{ color: '#667085', fontSize: 13 }}>{r.country ?? '—'}</span> },
    { header: '', cell: r => <button onClick={e => { e.stopPropagation(); openEdit(r); }} style={actionBtn}>Edit Tags</button> },
  ];

  return (
    <div>
      <p style={{ fontSize: 13, color: '#667085', marginBottom: 16 }}>
        Assign booking profile tags to service providers so they appear in the correct booking lookup fields (carrier, agent, etc.).
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#667085' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search providers…" style={{ ...INPUT, paddingLeft: 32 }} />
        </div>
        <select value={filterTag} onChange={e => setFilterTag(e.target.value)} style={{ ...INPUT, width: 'auto', minWidth: 160 }}>
          <option value="">All booking tags</option>
          {ALL_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        isLoading={loading}
        emptyMessage="No providers found."
        onRowClick={openEdit}
      />

      <SidePanel isOpen={panelOpen} onClose={() => setPanelOpen(false)} title="Edit Booking Tags"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setPanelOpen(false)} style={cancelBtn}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : 'Save Tags'}</button>
          </div>
        }
      >
        {editing && (
          <div style={{ padding: '4px 0' }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#12332B', marginBottom: 4 }}>{editing.company_name}</div>
              <div style={{ fontSize: 13, color: '#667085' }}>Provider Type: {editing.provider_type}</div>
            </div>
            <label style={LABEL}>
              <Tag size={13} style={{ display: 'inline', marginRight: 6 }} />
              Booking Profile Tags
            </label>
            <p style={{ fontSize: 12, color: '#667085', marginBottom: 12 }}>
              Check all booking lookup types this provider should appear in.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ALL_TAGS.map(tag => (
                <label key={tag} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: '#12332B' }}>
                  <input type="checkbox" checked={tags.includes(tag)} onChange={() => toggleTag(tag)} style={{ accentColor: '#0F766E' }} />
                  <span style={{ fontWeight: tags.includes(tag) ? 500 : 400 }}>{tag}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </SidePanel>
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
  padding: '4px 10px', borderRadius: 6, border: '1px solid #E5E9F0',
  background: '#FFFFFF', color: '#667085', fontSize: 12, cursor: 'pointer',
};
