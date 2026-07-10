import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { supabase } from '../../../utils/supabase/client';
import { DataTable } from '../../common/DataTable';
import type { ColumnDef } from '../../common/DataTable';
import { SidePanel } from '../../common/SidePanel';

interface BankAccountRow {
  id?: string;
  label: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  currency: string | null;
  is_active: boolean;
  sort_order: number;
}

const BLANK: BankAccountRow = {
  label: '', bank_name: '', account_name: '', account_number: '', currency: '', is_active: true, sort_order: 100,
};

export function BankAccountsTab() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<BankAccountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<BankAccountRow | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('bank_accounts')
      .select('id,label,bank_name,account_name,account_number,currency,is_active,sort_order')
      .order('sort_order', { ascending: true });
    setRows((data ?? []) as BankAccountRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openNew() { setEditing({ ...BLANK }); setIsNew(true); }
  function openEdit(r: BankAccountRow) { setEditing({ ...r }); setIsNew(false); }
  function closePanel() { setEditing(null); }

  async function toggleActive(r: BankAccountRow) {
    const { error } = await supabase.from('bank_accounts').update({ is_active: !r.is_active }).eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${r.label} ${r.is_active ? 'deactivated' : 'activated'}.`);
    qc.invalidateQueries({ queryKey: ['bank_accounts'] });
    load();
  }

  async function save() {
    if (!editing) return;
    const label = editing.label.trim();
    if (!label) { toast.error('Label is required (e.g. BDO PHP Main).'); return; }
    if (!editing.bank_name.trim()) { toast.error('Bank name is required.'); return; }
    if (!editing.account_number.trim()) { toast.error('Account number is required.'); return; }

    setSaving(true);
    const payload = {
      label,
      bank_name: editing.bank_name.trim(),
      account_name: editing.account_name.trim(),
      account_number: editing.account_number.trim(),
      currency: editing.currency?.trim().toUpperCase() || null,
      is_active: editing.is_active,
      sort_order: Number.isFinite(editing.sort_order) ? editing.sort_order : 100,
    };
    const { error } = isNew
      ? await supabase.from('bank_accounts').insert(payload)
      : await supabase.from('bank_accounts').update(payload).eq('id', editing.id);
    setSaving(false);

    if (error) { toast.error(error.message); return; }
    toast.success(`${label} ${isNew ? 'added' : 'updated'}.`);
    qc.invalidateQueries({ queryKey: ['bank_accounts'] });
    closePanel();
    load();
  }

  const columns: ColumnDef<BankAccountRow>[] = [
    { header: 'Label', cell: r => <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--theme-text-primary)' }}>{r.label}</span> },
    { header: 'Bank', cell: r => <span style={{ fontSize: 13, color: 'var(--theme-text-primary)' }}>{r.bank_name}</span> },
    { header: 'Account No.', cell: r => <span style={{ fontSize: 13, fontFamily: 'ui-monospace, monospace', color: 'var(--theme-text-muted)' }}>{r.account_number}</span> },
    { header: 'Cur', width: '70px', cell: r => <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>{r.currency || '—'}</span> },
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
          <h2 style={titleStyle}>Bank Accounts</h2>
          <p style={descStyle}>
            Payable bank accounts selectable when printing an invoice. Tag an account with a currency (PHP/USD) to
            have it suggested for matching-currency invoices.
          </p>
        </div>
        <button onClick={openNew} style={addBtnStyle}><Plus size={14} /> Add account</button>
      </div>

      <DataTable data={rows} columns={columns} isLoading={loading} emptyMessage="No bank accounts defined." />

      <SidePanel
        isOpen={!!editing}
        onClose={closePanel}
        size="sm"
        title={isNew ? 'Add bank account' : `Edit ${editing?.label ?? ''}`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: '1px solid var(--theme-border-default)' }}>
            <button onClick={closePanel} style={ghostBtnStyle}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ ...addBtnStyle, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : isNew ? 'Add account' : 'Save'}
            </button>
          </div>
        }
      >
        {editing && (
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Label / nickname">
              <input value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} placeholder="BDO PHP Main" style={inputStyle} />
            </Field>
            <Field label="Bank">
              <input value={editing.bank_name} onChange={e => setEditing({ ...editing, bank_name: e.target.value })} placeholder="BDO Unibank" style={inputStyle} />
            </Field>
            <Field label="Account name">
              <input value={editing.account_name} onChange={e => setEditing({ ...editing, account_name: e.target.value })} placeholder="A Plus Falcons Freight Inc." style={inputStyle} />
            </Field>
            <Field label="Account number">
              <input value={editing.account_number} onChange={e => setEditing({ ...editing, account_number: e.target.value })} placeholder="0000-0000-0000" style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace' }} />
            </Field>
            <div style={{ display: 'flex', gap: 12 }}>
              <Field label="Currency (optional)">
                <input value={editing.currency ?? ''} maxLength={3} onChange={e => setEditing({ ...editing, currency: e.target.value.toUpperCase() })} placeholder="PHP" style={{ ...inputStyle, letterSpacing: '1px' }} />
              </Field>
              <Field label="Sort order">
                <input type="number" value={editing.sort_order} onChange={e => setEditing({ ...editing, sort_order: parseInt(e.target.value, 10) })} style={inputStyle} />
              </Field>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--theme-text-primary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
              Active (selectable on invoices)
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
