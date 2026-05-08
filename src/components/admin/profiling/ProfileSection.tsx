import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, Archive, RotateCcw, Check, X, Pencil } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { supabase } from '../../../utils/supabase/client';
import { useUser } from '../../../hooks/useUser';
import { DataTable } from '../../common/DataTable';
import type { ColumnDef } from '../../common/DataTable';
import { NeuronModal } from '../../ui/NeuronModal';
import { profileRegistry } from '../../../config/profiles/profileRegistry';
import { ENUM_SEEDS } from '../../../hooks/useEnumOptions';

type Row = Record<string, unknown> & { id: string; is_active?: boolean; __isAdd?: boolean };
type LoadIssue = { kind: 'missing_table' | 'error'; message: string } | null;

const ADD_ROW_ID = '__add__';

const SOURCES_WITH_AUDIT_USERS = new Set([
  'trade_parties',
  'profile_locations',
  'dispatch_people',
  'vehicles',
]);

/**
 * Each profile type has a single inline-add field — typically `name`, but
 * service_providers use `company_name` and vehicles use `plate_number`.
 */
function primaryKeyFor(profileType: string): string {
  return profileRegistry[profileType]?.admin?.formFields[0]?.key ?? 'name';
}

function fallbackSeedRows(profileType: string): Row[] | null {
  if (!(profileType in ENUM_SEEDS)) return null;
  const seededValues = ENUM_SEEDS[profileType as keyof typeof ENUM_SEEDS];
  return seededValues.map((value, index) => ({
    id: `seed:${profileType}:${value}`,
    value,
    label: null,
    sort_order: (index + 1) * 10,
    is_active: true,
  }));
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined) {
  const message = (error?.message ?? '').toLowerCase();
  return error?.code === '42P01'
    || message.includes('does not exist')
    || message.includes('could not find the table')
    || message.includes('relation')
    || message.includes('schema cache');
}

export function ProfileSection({
  profileType,
  initialQuery = '',
}: {
  profileType: string;
  initialQuery?: string;
}) {
  const { user } = useUser();
  const entry = profileRegistry[profileType];
  const admin = entry?.admin;

  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialQuery);
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<Row | null>(null);
  const [loadIssue, setLoadIssue] = useState<LoadIssue>(null);

  useEffect(() => {
    setSearch(initialQuery);
  }, [initialQuery]);

  // Reset add state when switching sections
  useEffect(() => {
    setAdding(false);
    setNewValue('');
    setEditingId(null);
    setEditingValue('');
    setLoadIssue(null);
  }, [profileType]);

  const primaryKey = useMemo(() => primaryKeyFor(profileType), [profileType]);

  const load = useCallback(async () => {
    if (!entry || !admin) return;
    setLoading(true);
    setLoadIssue(null);
    let q = supabase.from(entry.source).select('*');

    if (admin.filter) {
      for (const [col, val] of Object.entries(admin.filter)) {
        if (Array.isArray(val)) {
          q = q.in(col, val as never[]);
        } else {
          q = q.eq(col, val as never);
        }
      }
    }
    if (admin.arrayContainsFilter) {
      for (const [col, val] of Object.entries(admin.arrayContainsFilter)) {
        q = q.contains(col, [val]);
      }
    }

    const tableHasIsActive = entry.source !== 'service_providers';
    if (tableHasIsActive && !showInactive) {
      q = q.eq('is_active', true);
    }

    const order = admin.orderBy ?? { column: primaryKey, ascending: true };
    q = q.order(order.column, { ascending: order.ascending ?? true });

    const { data, error } = await q;
    if (error) {
      const fallbackRows = fallbackSeedRows(profileType);
      if (isMissingTableError(error) && (fallbackRows || entry.source === 'profile_carriers' || entry.source === 'profile_forwarders')) {
        setItems(fallbackRows ?? []);
        setLoadIssue({
          kind: 'missing_table',
          message: `The source table "${entry.source}" is not available in this environment yet. Apply the matching Supabase migration to enable live editing here.`,
        });
      } else {
        toast.error(`Failed to load ${admin.pluralLabel.toLowerCase()}`);
        setItems([]);
        setLoadIssue({ kind: 'error', message: error.message });
      }
    } else {
      setItems((data ?? []) as Row[]);
    }
    setLoading(false);
  }, [entry, admin, showInactive, primaryKey, profileType]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!entry || !admin) return [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(item => {
      for (const f of entry.searchFields) {
        const v = item[f];
        if (typeof v === 'string' && v.toLowerCase().includes(q)) return true;
        if (Array.isArray(v) && v.some(x => typeof x === 'string' && x.toLowerCase().includes(q))) return true;
      }
      return false;
    });
  }, [items, search, entry, admin]);

  if (!entry || !admin) {
    return (
      <div style={{ padding: 24, color: 'var(--theme-text-muted)', fontSize: 13 }}>
        No admin configuration for profile type "{profileType}".
      </div>
    );
  }

  function startAdd() {
    if (readOnlyFallback) {
      toast.error('Apply the required Supabase migration before editing this section.');
      return;
    }
    // Cancel any in-progress edit
    setEditingId(null);
    setEditingValue('');
    setNewValue('');
    setAdding(true);
  }

  function cancelAdd() {
    setAdding(false);
    setNewValue('');
  }

  async function handleCreate() {
    if (!entry || !admin || readOnlyFallback) return;
    const value = newValue.trim();
    if (!value) {
      cancelAdd();
      return;
    }
    setCreating(true);
    const tracksAudit = SOURCES_WITH_AUDIT_USERS.has(entry.source);
    const insertPayload: Record<string, unknown> = {
      ...(admin.insertDefaults ?? {}),
      [primaryKey]: value,
    };
    if (tracksAudit) {
      insertPayload.created_by = user?.id ?? null;
      insertPayload.updated_by = user?.id ?? null;
    }
    const { error } = await supabase.from(entry.source).insert(insertPayload);
    setCreating(false);
    if (error) {
      toast.error(`Create failed: ${error.message}`);
      return;
    }
    toast.success(`${admin.label} created`);
    setAdding(false);
    setNewValue('');
    load();
  }

  function startEdit(item: Row) {
    if (readOnlyFallback) {
      toast.error('Apply the required Supabase migration before editing this section.');
      return;
    }
    if (adding) cancelAdd();
    setEditingId(item.id);
    setEditingValue(String(item[primaryKey] ?? ''));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingValue('');
  }

  async function commitEdit(item: Row) {
    if (!entry || readOnlyFallback) return;
    const value = editingValue.trim();
    if (!value) {
      cancelEdit();
      return;
    }
    if (value === String(item[primaryKey] ?? '')) {
      cancelEdit();
      return;
    }
    const update: Record<string, unknown> = { [primaryKey]: value };
    if (SOURCES_WITH_AUDIT_USERS.has(entry.source)) update.updated_by = user?.id ?? null;
    const { error } = await supabase.from(entry.source).update(update).eq('id', item.id);
    if (error) { toast.error('Save failed'); return; }
    cancelEdit();
    load();
  }

  async function handleArchive(item: Row, activate: boolean) {
    if (!entry || !admin || readOnlyFallback) return;
    const update: Record<string, unknown> = { is_active: activate };
    if (SOURCES_WITH_AUDIT_USERS.has(entry.source)) update.updated_by = user?.id ?? null;
    const { error } = await supabase.from(entry.source).update(update).eq('id', item.id);
    if (error) { toast.error('Failed to update'); return; }
    toast.success(activate ? `${admin.label} reactivated` : `${admin.label} archived`);
    setArchiveTarget(null);
    load();
  }

  const supportsArchive = entry.source !== 'service_providers';
  const inputLabel = admin.formFields[0]?.label ?? admin.label;
  const readOnlyFallback = loadIssue?.kind === 'missing_table';

  // Prepend the synthetic add-row when in add mode
  const tableData: Row[] = useMemo(() => {
    if (!adding) return filtered;
    const addRow: Row = { id: ADD_ROW_ID, __isAdd: true };
    return [addRow, ...filtered];
  }, [adding, filtered]);

  const columns: ColumnDef<Row>[] = useMemo(() => {
    const cols: ColumnDef<Row>[] = [
      {
        header: admin.formFields[0]?.label ?? 'Name',
        cell: row => {
          if (row.__isAdd) {
            return (
              <input
                autoFocus
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleCreate(); }
                  if (e.key === 'Escape') { e.preventDefault(); cancelAdd(); }
                }}
                placeholder={`New ${inputLabel.toLowerCase()}`}
                disabled={creating}
                style={inlineEditInput}
              />
            );
          }
          if (editingId === row.id) {
            return (
              <input
                autoFocus
                value={editingValue}
                onChange={e => setEditingValue(e.target.value)}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitEdit(row); }
                  if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                }}
                onBlur={() => commitEdit(row)}
                style={inlineEditInput}
              />
            );
          }
          const archived = row.is_active === false;
          return (
            <span style={{
              fontWeight: 450,
              color: archived ? 'var(--theme-text-muted)' : 'var(--theme-text-primary)',
              fontSize: 13,
              textDecoration: archived ? 'line-through' : 'none',
              textDecorationColor: 'var(--theme-text-muted)',
            }}>
              {String(row[primaryKey] ?? '')}
            </span>
          );
        },
      },
    ];

    if (supportsArchive && showInactive) {
      cols.push({
        header: 'Status',
        width: '100px',
        cell: r => {
          if (r.__isAdd) return null;
          return (
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.2px',
              padding: '2px 7px',
              borderRadius: 3,
              background: r.is_active === false
                ? 'var(--theme-bg-surface-tint)'
                : 'var(--theme-status-success-bg)',
              color: r.is_active === false
                ? 'var(--theme-text-muted)'
                : 'var(--theme-status-success-fg)',
            }}>
              {r.is_active === false ? 'Archived' : 'Active'}
            </span>
          );
        },
      });
    }

    cols.push({
      header: '',
      width: '110px',
      align: 'right',
      cell: r => {
        if (r.__isAdd) {
          return (
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              <IconButton
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); handleCreate(); }}
                color="var(--theme-action-primary-bg)"
                title="Save (Enter)"
              >
                <Check size={14} />
              </IconButton>
              <IconButton
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); cancelAdd(); }}
                title="Cancel (Esc)"
              >
                <X size={14} />
              </IconButton>
            </div>
          );
        }
        return (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            {readOnlyFallback ? null : (
              editingId === r.id ? (
                <>
                  <IconButton
                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); commitEdit(r); }}
                    color="var(--theme-action-primary-bg)"
                    title="Save"
                  >
                    <Check size={14} />
                  </IconButton>
                  <IconButton
                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); cancelEdit(); }}
                    title="Cancel"
                  >
                    <X size={14} />
                  </IconButton>
                </>
              ) : (
                <>
                  <IconButton onClick={e => { e.stopPropagation(); startEdit(r); }} title="Edit">
                    <Pencil size={13} />
                  </IconButton>
                  {r.is_active === false ? (
                    <IconButton
                      onClick={e => { e.stopPropagation(); handleArchive(r, true); }}
                      color="var(--theme-action-primary-bg)"
                      title="Reactivate"
                    >
                      <RotateCcw size={13} />
                    </IconButton>
                  ) : (
                    supportsArchive && (
                      <IconButton
                        onClick={e => { e.stopPropagation(); setArchiveTarget(r); }}
                        title="Archive"
                      >
                        <Archive size={13} />
                      </IconButton>
                    )
                  )}
                </>
              )
            )}
          </div>
        );
      },
    });

    return cols;
  }, [admin, editingId, editingValue, primaryKey, showInactive, supportsArchive, adding, newValue, creating, inputLabel, readOnlyFallback]);

  return (
    <div>
      {/* Section description (sidebar already labels the section) */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={sectionTitleStyle}>{admin.pluralLabel}</h2>
        {admin.description && (
          <p style={sectionDescStyle}>{admin.description}</p>
        )}
        {loadIssue && (
          <div style={loadIssue.kind === 'missing_table' ? migrationCalloutStyle : errorCalloutStyle}>
            {loadIssue.message}
          </div>
        )}
      </div>

      {/* Toolbar — search + archived toggle + count + New button */}
      <div style={toolbarStyle}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={13} style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--theme-text-muted)',
          }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${admin.pluralLabel.toLowerCase()}`}
            style={searchInputStyle}
          />
        </div>
        {supportsArchive && (
          <label style={archivedToggleStyle}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
              style={{ accentColor: 'var(--theme-action-primary-bg)' }}
            />
            Show archived
          </label>
        )}
        <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>
          {!loading && `${filtered.length} ${filtered.length === 1 ? admin.label.toLowerCase() : admin.pluralLabel.toLowerCase()}`}
        </span>
        <button
          onClick={startAdd}
          disabled={adding || readOnlyFallback}
          style={{
            ...newBtnStyle,
            opacity: adding || readOnlyFallback ? 0.5 : 1,
            cursor: adding || readOnlyFallback ? 'default' : 'pointer',
          }}
        >
          <Plus size={13} />
          New {admin.label.toLowerCase()}
        </button>
      </div>

      <DataTable
        data={tableData}
        columns={columns}
        isLoading={loading}
        renderTableOnEmpty={adding}
        emptyMessage={`No ${admin.pluralLabel.toLowerCase()} yet. Click "New ${admin.label.toLowerCase()}" to add one.`}
      />

      <NeuronModal
        isOpen={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        title={`Archive ${admin.label}`}
        message={`Archive "${archiveTarget ? String(archiveTarget[primaryKey] ?? '') : ''}"? It will no longer appear in lookups, but historical references are unaffected.`}
        confirmLabel="Archive"
        confirmVariant="danger"
        onConfirm={() => archiveTarget && handleArchive(archiveTarget, false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--theme-text-primary)',
  margin: 0,
  letterSpacing: '-0.2px',
};

const sectionDescStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--theme-text-muted)',
  margin: '4px 0 0',
  maxWidth: '60ch',
};

const migrationCalloutStyle: React.CSSProperties = {
  marginTop: 12,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--theme-status-warning-fg)',
  background: 'var(--theme-status-warning-bg)',
  color: 'var(--theme-text-primary)',
  fontSize: 12,
  lineHeight: 1.5,
  maxWidth: '72ch',
};

const errorCalloutStyle: React.CSSProperties = {
  marginTop: 12,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--theme-status-danger-fg)',
  background: 'var(--theme-status-danger-bg)',
  color: 'var(--theme-text-primary)',
  fontSize: 12,
  lineHeight: 1.5,
  maxWidth: '72ch',
};

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  margin: '0 0 14px',
};

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  height: 32,
  border: '1px solid var(--theme-border-default)',
  borderRadius: 6,
  padding: '0 10px 0 30px',
  fontSize: 13,
  color: 'var(--theme-text-primary)',
  background: 'var(--theme-bg-surface)',
  outline: 'none',
  boxSizing: 'border-box',
};

const archivedToggleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: 'var(--theme-text-muted)',
  cursor: 'pointer',
  userSelect: 'none',
};

const newBtnStyle: React.CSSProperties = {
  marginLeft: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 32,
  padding: '0 12px',
  borderRadius: 6,
  border: 'none',
  background: 'var(--theme-action-primary-bg)',
  color: 'var(--theme-action-primary-text)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const inlineEditInput: React.CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  border: '1px solid var(--theme-action-primary-bg)',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 450,
  color: 'var(--theme-text-primary)',
  background: 'var(--theme-bg-surface)',
  outline: 'none',
  boxShadow: '0 0 0 3px var(--theme-state-selected)',
};

function IconButton({
  children,
  color,
  title,
  onClick,
  onMouseDown,
}: {
  children: React.ReactNode;
  color?: string;
  title?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  onMouseDown?: React.MouseEventHandler<HTMLButtonElement>;
}) {
  const [hover, setHover] = useState(false);
  const baseColor = color ?? 'var(--theme-text-muted)';
  return (
    <button
      type="button"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      onMouseDown={onMouseDown}
      title={title}
      aria-label={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        borderRadius: 5,
        border: 'none',
        background: hover ? 'var(--theme-bg-surface-tint)' : 'transparent',
        color: baseColor,
        cursor: 'pointer',
        transition: 'background 120ms ease',
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}
