import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { supabase } from '../../../utils/supabase/client';
import { DataTable } from '../../common/DataTable';
import type { ColumnDef } from '../../common/DataTable';
import { SidePanel } from '../../common/SidePanel';

interface CreditTermRow {
  id?: string;
  label: string;
  net_days: number;
  is_active: boolean;
  sort_order: number;
}

const BLANK: CreditTermRow = { label: '', net_days: 0, is_active: true, sort_order: 100 };

export function CreditTermsTab() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<CreditTermRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<CreditTermRow | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('credit_terms')
      .select('id,label,net_days,is_active,sort_order')
      .order('sort_order', { ascending: true });
    setRows((data ?? []) as CreditTermRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openNew() { setEditing({ ...BLANK }); setIsNew(true); }
  function openEdit(r: CreditTermRow) { setEditing({ ...r }); setIsNew(false); }
  function closePanel() { setEditing(null); }

  async function toggleActive(r: CreditTermRow) {
    const { error } = await supabase.from('credit_terms').update({ is_active: !r.is_active }).eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${r.label} ${r.is_active ? 'deactivated' : 'activated'}.`);
    qc.invalidateQueries({ queryKey: ['credit_terms'] });
    load();
  }

  async function save() {
    if (!editing) return;
    const label = editing.label.trim();
    if (!label) { toast.error('Label is required (e.g. NET 15).'); return; }
    const netDays = Number.isFinite(editing.net_days) ? Math.max(0, editing.net_days) : 0;

    setSaving(true);
    const payload = {
      label,
      net_days: netDays,
      is_active: editing.is_active,
      sort_order: Number.isFinite(editing.sort_order) ? editing.sort_order : 100,
    };
    const { error } = isNew
      ? await supabase.from('credit_terms').insert(payload)
      : await supabase.from('credit_terms').update(payload).eq('id', editing.id);
    setSaving(false);

    if (error) {
      toast.error(error.code === '23505' ? `"${label}" already exists.` : error.message);
      return;
    }
    toast.success(`${label} ${isNew ? 'added' : 'updated'}.`);
    qc.invalidateQueries({ queryKey: ['credit_terms'] });
    closePanel();
    load();
  }

  const columns: ColumnDef<CreditTermRow>[] = [
    { header: 'Term', cell: r => <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--theme-text-primary)' }}>{r.label}</span> },
    { header: 'Net days', align: 'right', width: '100px', cell: r => <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>{r.net_days}</span> },
    { header: 'Order', align: 'right', width: '80px', cell: r => <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>{r.sort_order}</span> },
    {
      header: 'Active', width: '90px',
      cell: r => (
        <button onClick={() => toggleActive(r)} style={pillStyle(r.is_active)} title={r.is_active ? 'Click to deactivate' : 'Click to activate'}>
          {r.is_active ? 'Active' : 'Inactive'}
        </button>
      ),
    },
    {
      header: '', align: 'right', width: '70px',
      cell: r => <button onClick={() => openEdit(r)} style={iconBtnStyle} title="Edit"><Pencil size={13} /></button>,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2 style={titleStyle}>Credit Terms</h2>
          <p style={descStyle}>
            The payment terms shown in the invoice Credit Terms dropdown. <strong>Net days</strong> is added to the
            invoice date to compute the due date (Due on receipt / COD = 0).
          </p>
        </div>
        <button onClick={openNew} style={addBtnStyle}><Plus size={14} /> Add term</button>
      </div>

      <DataTable data={rows} columns={columns} isLoading={loading} emptyMessage="No credit terms defined." />

      <SidePanel
        isOpen={!!editing}
        onClose={closePanel}
        size="sm"
        title={isNew ? 'Add credit term' : `Edit ${editing?.label ?? ''}`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: '1px solid var(--theme-border-default)' }}>
            <button onClick={closePanel} style={ghostBtnStyle}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ ...addBtnStyle, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : isNew ? 'Add term' : 'Save'}
            </button>
          </div>
        }
      >
        {editing && (
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Label">
              <input value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} placeholder="NET 15" style={inputStyle} />
            </Field>
            <div style={{ display: 'flex', gap: 12 }}>
              <Field label="Net days">
                <input type="number" min={0} value={editing.net_days}
                  onChange={e => setEditing({ ...editing, net_days: parseInt(e.target.value, 10) })} style={inputStyle} />
              </Field>
              <Field label="Sort order">
                <input type="number" value={editing.sort_order}
                  onChange={e => setEditing({ ...editing, sort_order: parseInt(e.target.value, 10) })} style={inputStyle} />
              </Field>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--theme-text-primary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
              Active (shown in dropdowns)
            </label>
          </div>
        )}
      </SidePanel>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--theme-text-muted)' }}>{label}</label>
      {children}
    </div>
  );
}

const titleStyle: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: 'var(--theme-text-primary)', margin: 0, letterSpacing: '-0.2px' };
const descStyle: React.CSSProperties = { fontSize: 13, color: 'var(--theme-text-muted)', margin: '4px 0 0', maxWidth: '60ch' };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--theme-border-default)',
  background: 'var(--theme-bg-surface)', color: 'var(--theme-text-primary)', fontSize: 13, outline: 'none',
};
const addBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, border: 'none',
  background: 'var(--theme-action-primary-bg)', color: 'var(--theme-action-primary-fg, #fff)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
const ghostBtnStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 6, border: '1px solid var(--theme-border-default)',
  background: 'var(--theme-bg-surface)', color: 'var(--theme-text-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
const iconBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6,
  border: '1px solid var(--theme-border-default)', background: 'var(--theme-bg-surface)', color: 'var(--theme-text-muted)', cursor: 'pointer',
};
function pillStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 999, cursor: 'pointer', border: 'none',
    background: active ? 'var(--theme-status-success-bg)' : 'var(--theme-bg-surface-tint)',
    color: active ? 'var(--theme-status-success-fg)' : 'var(--theme-text-muted)',
  };
}
