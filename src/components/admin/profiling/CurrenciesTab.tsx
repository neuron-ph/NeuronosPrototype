import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { supabase } from '../../../utils/supabase/client';
import { DataTable } from '../../common/DataTable';
import type { ColumnDef } from '../../common/DataTable';
import { SidePanel } from '../../common/SidePanel';
import { FUNCTIONAL_CURRENCY } from '../../../utils/accountingCurrency';

interface CurrencyRow {
  id?: string; // = code; DataTable keys/selects on `id`
  code: string;
  name: string;
  symbol: string | null;
  decimals: number;
  is_active: boolean;
  sort_order: number;
}

const BLANK: CurrencyRow = { code: '', name: '', symbol: '', decimals: 2, is_active: true, sort_order: 100 };

export function CurrenciesTab() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<CurrencyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<CurrencyRow | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('currencies')
      .select('code,name,symbol,decimals,is_active,sort_order')
      .order('sort_order', { ascending: true });
    setRows(((data ?? []) as CurrencyRow[]).map((r) => ({ ...r, id: r.code })));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openNew() { setEditing({ ...BLANK }); setIsNew(true); }
  function openEdit(r: CurrencyRow) { setEditing({ ...r }); setIsNew(false); }
  function closePanel() { setEditing(null); }

  async function toggleActive(r: CurrencyRow) {
    if (r.code === FUNCTIONAL_CURRENCY && r.is_active) {
      toast.error(`${FUNCTIONAL_CURRENCY} is the functional currency and can't be deactivated.`);
      return;
    }
    const { error } = await supabase.from('currencies').update({ is_active: !r.is_active }).eq('code', r.code);
    if (error) { toast.error(error.message); return; }
    toast.success(`${r.code} ${r.is_active ? 'deactivated' : 'activated'}.`);
    qc.invalidateQueries({ queryKey: ['currencies'] });
    load();
  }

  async function save() {
    if (!editing) return;
    const code = editing.code.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) { toast.error('Code must be a 3-letter ISO 4217 code (e.g. SGD).'); return; }
    if (!editing.name.trim()) { toast.error('Name is required.'); return; }

    setSaving(true);
    const payload = {
      code,
      name: editing.name.trim(),
      symbol: editing.symbol?.trim() || null,
      decimals: Number.isFinite(editing.decimals) ? editing.decimals : 2,
      is_active: editing.is_active,
      sort_order: Number.isFinite(editing.sort_order) ? editing.sort_order : 100,
    };

    const { error } = isNew
      ? await supabase.from('currencies').insert(payload)
      : await supabase.from('currencies').update(payload).eq('code', code);
    setSaving(false);

    if (error) {
      toast.error(error.code === '23505' ? `${code} already exists.` : error.message);
      return;
    }
    toast.success(`${code} ${isNew ? 'added' : 'updated'}.`);
    qc.invalidateQueries({ queryKey: ['currencies'] });
    closePanel();
    load();
  }

  const columns: ColumnDef<CurrencyRow>[] = [
    {
      header: 'Code',
      width: '90px',
      cell: r => (
        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 600, fontSize: 13, color: 'var(--theme-text-primary)' }}>
          {r.code}
        </span>
      ),
    },
    { header: 'Name', cell: r => <span style={{ fontSize: 13, color: 'var(--theme-text-primary)' }}>{r.name}</span> },
    { header: 'Symbol', width: '80px', cell: r => <span style={{ fontSize: 14, color: 'var(--theme-text-primary)' }}>{r.symbol || '—'}</span> },
    { header: 'Decimals', align: 'right', width: '90px', cell: r => <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>{r.decimals}</span> },
    { header: 'Order', align: 'right', width: '80px', cell: r => <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>{r.sort_order}</span> },
    {
      header: 'Active',
      width: '90px',
      cell: r => (
        <button onClick={() => toggleActive(r)} style={pillStyle(r.is_active)} title={r.is_active ? 'Click to deactivate' : 'Click to activate'}>
          {r.is_active ? 'Active' : 'Inactive'}
        </button>
      ),
    },
    {
      header: '',
      align: 'right',
      width: '70px',
      cell: r => (
        <button onClick={() => openEdit(r)} style={iconBtnStyle} title="Edit">
          <Pencil size={13} />
        </button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2 style={titleStyle}>Currencies</h2>
          <p style={descStyle}>
            The master list behind every currency dropdown in pricing and accounting. Adding one here makes it
            available everywhere — no code change. {FUNCTIONAL_CURRENCY} is the functional currency and stays active.
          </p>
        </div>
        <button onClick={openNew} style={addBtnStyle}>
          <Plus size={14} /> Add currency
        </button>
      </div>

      <DataTable
        data={rows}
        columns={columns}
        isLoading={loading}
        emptyMessage="No currencies defined."
      />

      <SidePanel
        isOpen={!!editing}
        onClose={closePanel}
        size="sm"
        title={isNew ? 'Add currency' : `Edit ${editing?.code ?? ''}`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: '1px solid var(--theme-border-default)' }}>
            <button onClick={closePanel} style={ghostBtnStyle}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ ...addBtnStyle, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : isNew ? 'Add currency' : 'Save'}
            </button>
          </div>
        }
      >
        {editing && (
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflowY: 'auto' }}>
            <Field label="Code (ISO 4217)">
              <input
                value={editing.code}
                disabled={!isNew}
                maxLength={3}
                onChange={e => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                placeholder="SGD"
                style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', letterSpacing: '1px', opacity: isNew ? 1 : 0.6 }}
              />
            </Field>
            <Field label="Name">
              <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Singapore Dollar" style={inputStyle} />
            </Field>
            <Field label="Symbol">
              <input value={editing.symbol ?? ''} onChange={e => setEditing({ ...editing, symbol: e.target.value })} placeholder="$" style={inputStyle} />
            </Field>
            <div style={{ display: 'flex', gap: 12 }}>
              <Field label="Decimals">
                <input type="number" min={0} max={4} value={editing.decimals}
                  onChange={e => setEditing({ ...editing, decimals: parseInt(e.target.value, 10) })} style={inputStyle} />
              </Field>
              <Field label="Sort order">
                <input type="number" value={editing.sort_order}
                  onChange={e => setEditing({ ...editing, sort_order: parseInt(e.target.value, 10) })} style={inputStyle} />
              </Field>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--theme-text-primary)', cursor: editing.code === FUNCTIONAL_CURRENCY ? 'not-allowed' : 'pointer' }}>
              <input
                type="checkbox"
                checked={editing.is_active}
                disabled={editing.code === FUNCTIONAL_CURRENCY}
                onChange={e => setEditing({ ...editing, is_active: e.target.checked })}
              />
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
