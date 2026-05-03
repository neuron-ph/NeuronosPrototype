import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, Search, X } from 'lucide-react';
import type { ProfileSelectionValue, ProfileLookupRecord } from '../../../types/profiles';
import { profileRegistry } from '../../../config/profiles/profileRegistry';
import { getAdapterForType } from '../../../utils/profiles/adapterRegistry';
import { useUser } from '../../../hooks/useUser';

// ==================== TYPES ====================

interface ProfileLookupComboboxProps {
  profileType: string;
  value: ProfileSelectionValue | string | null | undefined;
  onChange: (value: ProfileSelectionValue) => void;
  disabled?: boolean;
  placeholder?: string;
  error?: boolean;
  onQuickCreate?: (name: string, profileType: string) => Promise<ProfileSelectionValue | null>;
  portalZIndex?: number;
}

// ==================== HELPERS ====================

function toSelection(v: ProfileSelectionValue | string | null | undefined, profileType: string): ProfileSelectionValue {
  if (!v) return { id: null, label: '', profileType, source: 'manual' };
  if (typeof v === 'string') return { id: null, label: v, profileType, source: 'manual' };
  return v;
}

// ==================== INPUT STYLE (matches BookingFieldRenderer) ====================

const INPUT_STYLE = {
  background: 'var(--theme-bg-surface)',
  border: '1px solid var(--theme-border-default)',
  color: 'var(--theme-text-primary)',
  outline: 'none',
};

const DROPDOWN_STYLE: React.CSSProperties = {
  position: 'fixed',
  background: 'var(--theme-bg-surface)',
  border: '1px solid var(--theme-border-default)',
  borderRadius: 8,
  boxShadow: 'var(--elevation-2)',
  overflow: 'hidden',
  minWidth: 240,
  maxWidth: 420,
};

// ==================== COMPONENT ====================

export function ProfileLookupCombobox({
  profileType,
  value,
  onChange,
  disabled = false,
  placeholder,
  error = false,
  onQuickCreate,
  portalZIndex = 9999,
}: ProfileLookupComboboxProps) {
  const { user } = useUser();
  const selection = toSelection(value, profileType);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileLookupRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>(DROPDOWN_STYLE);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextDebouncedSearchRef = useRef(false);
  const searchRequestIdRef = useRef(0);

  const registryEntry = profileRegistry[profileType];
  const isCombo = registryEntry?.strictness === 'combo';
  const canQuickCreate = !!onQuickCreate && (registryEntry?.quickCreateAllowed ?? false) && isPrivileged(user);

  // ---- adapter lookup ----
  // Memoize: getAdapterForType returns a fresh object literal every call.
  // Without this, doSearch (and downstream effects) get a new identity every
  // render, which re-schedules debounced searches and causes the dropdown to
  // flicker as loading/results.length thrash.
  const adapterInfo = useMemo(() => getAdapterForType(profileType), [profileType]);

  // ---- position dropdown ----
  const positionDropdown = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const gap = 4;
    const spaceBelow = viewportH - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const measuredHeight = dropdownRef.current?.offsetHeight ?? 0;
    const shouldOpenUpward = measuredHeight > 0
      ? spaceBelow < measuredHeight && spaceAbove > spaceBelow
      : spaceBelow < 120 && spaceAbove > spaceBelow;
    const top = shouldOpenUpward
      ? Math.max(gap, rect.top - Math.max(measuredHeight, 0) - gap)
      : rect.bottom + gap;
    setDropdownStyle({
      ...DROPDOWN_STYLE,
      zIndex: portalZIndex,
      top,
      left: rect.left,
      width: rect.width,
    });
  }, [portalZIndex]);

  // ---- search ----
  const doSearch = useCallback(async (q: string) => {
    if (!adapterInfo) {
      setResults([]);
      return;
    }
    const requestId = ++searchRequestIdRef.current;
    setLoading(true);
    try {
      const res = await adapterInfo.adapter.search(q, {
        providerTag: adapterInfo.providerTag,
        providerScope: adapterInfo.providerScope,
        limit: 20,
      });
      if (requestId === searchRequestIdRef.current) {
        setResults(res);
      }
    } catch {
      if (requestId === searchRequestIdRef.current) {
        setResults([]);
      }
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [adapterInfo]);

  // ---- open dropdown ----
  const openDropdown = useCallback(() => {
    if (disabled) return;
    if (open) {
      inputRef.current?.focus();
      return;
    }
    positionDropdown();
    setOpen(true);
    setQuery('');
    skipNextDebouncedSearchRef.current = true;
    doSearch('');
  }, [disabled, open, positionDropdown, doSearch]);

  // ---- debounced query search ----
  useEffect(() => {
    if (!open) return;
    positionDropdown();
    const rafId = window.requestAnimationFrame(positionDropdown);
    return () => window.cancelAnimationFrame(rafId);
  }, [open, loading, results.length, positionDropdown]);

  useEffect(() => {
    if (!open) return;
    if (skipNextDebouncedSearchRef.current) {
      skipNextDebouncedSearchRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 180);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open, doSearch]);

  // ---- reposition on scroll ----
  useEffect(() => {
    if (!open) return;
    const handler = () => positionDropdown();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open, positionDropdown]);

  // ---- close on outside click ----
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      handleClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleClose() {
    setOpen(false);
    // In combo mode: if user typed something and didn't select, save as manual
    if (isCombo && query.trim() && !results.find(r => r.label === query.trim())) {
      onChange({ id: null, label: query.trim(), profileType, source: 'manual' });
    }
  }

  function handleSelect(record: ProfileLookupRecord) {
    onChange({ id: record.id, label: record.label, profileType, source: 'linked' });
    setOpen(false);
    setQuery('');
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange({ id: null, label: '', profileType, source: 'manual' });
  }

  async function handleQuickCreate() {
    if (!onQuickCreate || !query.trim()) return;
    const created = await onQuickCreate(query.trim(), profileType);
    if (created) {
      onChange(created);
      setOpen(false);
      setQuery('');
    }
  }

  const displayLabel = selection.label;
  const hasValue = displayLabel.trim().length > 0;
  const isLinked = selection.source === 'linked' && !!selection.id;

  // In read-only mode show as plain text with optional linked badge
  if (disabled) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '9px 12px', borderRadius: 8,
        border: '1px solid var(--theme-border-default)',
        background: 'var(--theme-bg-page)',
        fontSize: 13,
        color: hasValue ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)',
        minHeight: 38,
      }}>
        <span style={{ flex: 1 }}>{hasValue ? displayLabel : '—'}</span>
        {isLinked && (
          <span style={{ fontSize: 10, background: 'var(--theme-status-success-bg)', color: 'var(--theme-action-primary-bg)', borderRadius: 4, padding: '1px 5px', fontWeight: 500, flexShrink: 0 }}>
            linked
          </span>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger */}
      <div
        onClick={openDropdown}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 10px',
          height: 38,
          borderRadius: 8,
          cursor: disabled ? 'default' : 'pointer',
          userSelect: 'none',
          ...INPUT_STYLE,
          border: `1px solid ${error ? 'var(--theme-status-danger-fg)' : 'var(--theme-border-default)'}`,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <Search size={13} style={{ color: 'var(--theme-text-muted)', flexShrink: 0 }} />
        <span
          style={{
            flex: 1,
            fontSize: 13,
            color: hasValue ? 'var(--theme-text-primary)' : 'var(--theme-text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {hasValue ? displayLabel : (placeholder ?? `Search ${profileType}…`)}
        </span>
        {isLinked && (
          <span style={{
            fontSize: 10,
            background: 'var(--theme-status-success-bg)',
            color: 'var(--theme-action-primary-bg)',
            borderRadius: 4,
            padding: '1px 5px',
            fontWeight: 500,
            flexShrink: 0,
          }}>
            linked
          </span>
        )}
        {hasValue && !disabled && (
          <X
            size={13}
            style={{ color: 'var(--theme-text-muted)', flexShrink: 0, cursor: 'pointer' }}
            onMouseDown={handleClear}
          />
        )}
      </div>

      {/* Dropdown portal */}
      {open && createPortal(
        <div ref={dropdownRef} style={dropdownStyle}>
          {/* Search input */}
          <div style={{ padding: '8px 10px 6px', borderBottom: '1px solid var(--theme-border-default)' }}>
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') handleClose();
                if (e.key === 'Enter' && results.length > 0) handleSelect(results[0]);
              }}
              placeholder={`Search ${profileType}…`}
              style={{
                width: '100%',
                border: '1px solid var(--theme-border-default)',
                borderRadius: 6,
                padding: '5px 9px',
                fontSize: 13,
                color: 'var(--theme-text-primary)',
                outline: 'none',
                background: 'var(--theme-bg-page)',
              }}
            />
          </div>

          {/* Results */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {loading && results.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--theme-text-muted)' }}>Searching…</div>
            )}
            {!loading && results.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--theme-text-muted)' }}>
                {query.trim() ? 'No matches found.' : `No ${profileType} records yet.`}
              </div>
            )}
            {results.map(record => {
              const selected = selection.id === record.id;
              return (
                <div
                  key={record.id}
                  onMouseDown={() => handleSelect(record)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 12px',
                    fontSize: 13,
                    color: 'var(--theme-text-primary)',
                    cursor: 'pointer',
                    background: selected ? 'var(--theme-status-success-bg)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.background = 'var(--theme-state-hover)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = selected ? 'var(--theme-status-success-bg)' : 'transparent'; }}
                >
                  {selected && <Check size={13} style={{ color: 'var(--theme-action-primary-bg)', flexShrink: 0 }} />}
                  {!selected && <div style={{ width: 13, flexShrink: 0 }} />}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {record.label}
                  </span>
                  {record.status === 'archived' && (
                    <span style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>archived</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick-create */}
          {canQuickCreate && query.trim() && !results.find(r => r.label.toLowerCase() === query.trim().toLowerCase()) && (
            <div style={{ borderTop: '1px solid var(--theme-border-default)', padding: '6px 10px' }}>
              <button
                onMouseDown={handleQuickCreate}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: '1px dashed var(--theme-action-primary-bg)',
                  background: 'transparent',
                  color: 'var(--theme-action-primary-bg)',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                <Plus size={13} />
                Create "{query.trim()}"
              </button>
            </div>
          )}

          {/* Combo mode: save as manual */}
          {isCombo && query.trim() && !results.find(r => r.label.toLowerCase() === query.trim().toLowerCase()) && (
            <div style={{ borderTop: '1px solid var(--theme-border-default)', padding: '6px 10px' }}>
              <button
                onMouseDown={() => {
                  onChange({ id: null, label: query.trim(), profileType, source: 'manual' });
                  setOpen(false);
                  setQuery('');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--theme-text-muted)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Use "{query.trim()}" as manual entry
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ---- privilege check ----
function isPrivileged(user: ReturnType<typeof useUser>['user']): boolean {
  if (!user) return false;
  const dept = user.department ?? '';
  const role = (user.role ?? '').toLowerCase();
  if (dept === 'Executive') return true;
  if (role === 'manager' || role === 'director' || role === 'tl') return true;
  return false;
}
