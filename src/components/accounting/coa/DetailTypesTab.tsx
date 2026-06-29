import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Check, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { supabase } from '../../../utils/supabase/client';
import { CASH_FLOW_ACTIVITIES, activityLabel, type CashFlowActivity } from '../../../utils/accountingDetailTypes';

interface Row {
  name: string;
  account_types: string[];
  activity: CashFlowActivity;
  statement_section: string;
  sort_order: number;
  is_active: boolean;
}

const ACCOUNT_TYPE_OPTIONS = ['asset', 'liability', 'equity', 'income', 'expense'];
const NAME_MAX = 60;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function deriveSection(accountType: string, activity: CashFlowActivity): string {
  if (accountType === 'asset') return activity === 'Investing' ? 'Non-Current Assets' : 'Current Assets';
  if (accountType === 'liability') return activity === 'Financing' ? 'Non-Current Liabilities' : 'Current Liabilities';
  if (accountType === 'equity') return 'Equity';
  if (accountType === 'income') return 'Other Income';
  return 'Operating Expenses';
}

function defaultTypeFor(activity: CashFlowActivity): string {
  return activity === 'Financing' ? 'liability' : 'asset';
}

// Collapse a stored account_types array (which may carry synonyms like
// income/revenue) to a single canonical option for the dropdown.
function primaryType(types: string[]): string {
  for (const t of types) {
    if (t === 'revenue') return 'income';
    if (t === 'cost') return 'expense';
    if (ACCOUNT_TYPE_OPTIONS.includes(t)) return t;
  }
  return 'asset';
}

interface Draft {
  mode: 'add' | 'edit';
  activity: CashFlowActivity;
  origName: string;
  name: string;
  accountType: string;
  statement_section: string;
  sort_order: number;
}

export function DetailTypesTab() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('account_detail_types')
      .select('name,account_types,activity,statement_section,sort_order,is_active')
      .order('sort_order', { ascending: true });
    if (error) { setLoadError(error.message); setRows([]); }
    else { setRows((data ?? []) as Row[]); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function startAdd(activity: CashFlowActivity) {
    setDraft({ mode: 'add', activity, origName: '', name: '', accountType: defaultTypeFor(activity), statement_section: '', sort_order: 300 });
  }
  function startEdit(r: Row) {
    setDraft({ mode: 'edit', activity: r.activity, origName: r.name, name: r.name, accountType: primaryType(r.account_types), statement_section: r.statement_section, sort_order: r.sort_order });
  }
  function cancel() { setDraft(null); }

  async function save() {
    if (!draft || saving) return; // guard against double-submit (button + Enter)
    const name = draft.name.trim();
    if (!name) { toast.error('Give the detail type a name first.'); return; }

    setSaving(true);
    const payload = {
      name,
      account_types: [draft.accountType],
      activity: draft.activity,
      statement_section: draft.mode === 'add' ? deriveSection(draft.accountType, draft.activity) : draft.statement_section,
      sort_order: draft.sort_order ?? 300,
      is_active: true,
    };
    const { error } = draft.mode === 'add'
      ? await supabase.from('account_detail_types').insert(payload)
      : await supabase.from('account_detail_types').update(payload).eq('name', draft.origName);
    setSaving(false);

    if (error) { toast.error(error.code === '23505' ? `"${name}" already exists.` : error.message); return; }
    toast.success(`${name} ${draft.mode === 'add' ? 'added' : 'updated'}.`);
    qc.invalidateQueries({ queryKey: ['account_detail_types'] });
    setDraft(null);
    load();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <p style={descStyle}>Sets which cash-flow activity each account feeds.</p>

      {loading ? (
        <div style={{ padding: 24, fontSize: 13, color: 'var(--theme-text-muted)' }}>Loading detail types…</div>
      ) : loadError ? (
        <div style={errorBoxStyle} role="alert">
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--theme-status-danger-fg)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--theme-text-primary)' }}>Couldn't load detail types.</div>
            <div style={{ fontSize: 12, color: 'var(--theme-text-muted)', marginTop: 2 }}>{loadError}</div>
          </div>
          <button onClick={load} style={ghostBtnStyle}>Try again</button>
        </div>
      ) : (
        CASH_FLOW_ACTIVITIES.map((activity) => {
          const items = rows.filter(r => r.activity === activity);
          const addingHere = draft?.mode === 'add' && draft.activity === activity;
          return (
            <section key={activity} style={{ marginTop: 18 }}>
              <div style={sectionHeaderStyle}>
                <span style={sectionTitleStyle}>{activityLabel(activity)}</span>
                <button onClick={() => startAdd(activity)} style={addInlineBtnStyle} aria-label={`Add a detail type to ${activityLabel(activity)}`}>
                  <Plus size={13} /> Add
                </button>
              </div>

              <div style={{ border: '1px solid var(--theme-border-default)', borderRadius: 8, overflow: 'hidden' }}>
                {items.length === 0 && !addingHere && (
                  <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--theme-text-muted)', fontStyle: 'italic' }}>
                    None yet.
                  </div>
                )}

                {items.map((r, i) =>
                  draft?.mode === 'edit' && draft.origName === r.name ? (
                    <EditorRow key={r.name} topBorder={i > 0} draft={draft} setDraft={setDraft} onSave={save} onCancel={cancel} saving={saving} />
                  ) : (
                    <div
                      key={r.name}
                      className="transition-colors hover:bg-[var(--theme-bg-surface-subtle)]"
                      style={{ ...rowStyle, borderTop: i > 0 ? '1px solid var(--theme-border-default)' : 'none' }}
                    >
                      <span style={nameCellStyle}>{r.name}</span>
                      <span style={typeCellStyle}>{cap(primaryType(r.account_types))}</span>
                      <button onClick={() => startEdit(r)} style={iconBtnStyle} aria-label={`Edit ${r.name}`}><Pencil size={13} /></button>
                    </div>
                  )
                )}

                {addingHere && (
                  <EditorRow topBorder={items.length > 0} draft={draft!} setDraft={setDraft} onSave={save} onCancel={cancel} saving={saving} />
                )}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function EditorRow({
  draft, setDraft, onSave, onCancel, saving, topBorder,
}: {
  draft: Draft; setDraft: (d: Draft) => void;
  onSave: () => void; onCancel: () => void; saving: boolean; topBorder: boolean;
}) {
  return (
    <div style={{ ...rowStyle, background: 'var(--theme-bg-surface-subtle)', borderTop: topBorder ? '1px solid var(--theme-border-default)' : 'none' }}>
      <input
        autoFocus={draft.mode === 'add'}
        value={draft.name}
        disabled={draft.mode === 'edit'}
        maxLength={NAME_MAX}
        onChange={e => setDraft({ ...draft, name: e.target.value })}
        placeholder="Detail type name"
        aria-label="Detail type name"
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSave(); } if (e.key === 'Escape') onCancel(); }}
        className="focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/40"
        style={{ flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--theme-border-default)', background: 'var(--theme-bg-surface)', color: 'var(--theme-text-primary)', fontSize: 13, opacity: draft.mode === 'edit' ? 0.6 : 1 }}
      />
      <select
        value={draft.accountType}
        onChange={e => setDraft({ ...draft, accountType: e.target.value })}
        aria-label="Account type"
        className="focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/40"
        style={{ width: 150, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--theme-border-default)', background: 'var(--theme-bg-surface)', color: 'var(--theme-text-primary)', fontSize: 13 }}
      >
        {ACCOUNT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{cap(t)}</option>)}
      </select>
      <button onClick={onSave} disabled={saving} style={{ ...iconBtnStyle, color: 'var(--theme-status-success-fg)', borderColor: 'var(--theme-status-success-fg)', opacity: saving ? 0.5 : 1, cursor: saving ? 'default' : 'pointer' }} aria-label="Save detail type"><Check size={14} /></button>
      <button onClick={onCancel} style={iconBtnStyle} aria-label="Cancel"><X size={14} /></button>
    </div>
  );
}

const descStyle: React.CSSProperties = { fontSize: 13, color: 'var(--theme-text-muted)', margin: 0 };
const sectionHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px 8px' };
const sectionTitleStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--theme-text-secondary)' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' };
const nameCellStyle: React.CSSProperties = { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: 'var(--theme-text-primary)', overflowWrap: 'anywhere' };
const typeCellStyle: React.CSSProperties = { width: 110, flexShrink: 0, fontSize: 12, color: 'var(--theme-text-muted)' };
const errorBoxStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 10, margin: '18px 0', padding: '14px 16px', borderRadius: 8,
  border: '1px solid var(--theme-border-default)', background: 'var(--theme-status-danger-bg)',
};
const addInlineBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6,
  border: '1px solid var(--theme-border-default)', background: 'var(--theme-bg-surface)', color: 'var(--theme-text-secondary)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
};
const ghostBtnStyle: React.CSSProperties = {
  padding: '7px 12px', borderRadius: 6, border: '1px solid var(--theme-border-default)', whiteSpace: 'nowrap',
  background: 'var(--theme-bg-surface)', color: 'var(--theme-text-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
const iconBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, flexShrink: 0,
  border: '1px solid var(--theme-border-default)', background: 'var(--theme-bg-surface)', color: 'var(--theme-text-muted)', cursor: 'pointer',
};
