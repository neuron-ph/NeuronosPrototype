import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, Search, X } from 'lucide-react';
import type { ProfileSelectionValue, ProfileLookupRecord } from '../../../types/profiles';
import { profileRegistry } from '../../../config/profiles/profileRegistry';
import { getAdapterForType } from '../../../utils/profiles/adapterRegistry';
import { usePermission } from '../../../context/PermissionProvider';

// ==================== TYPES ====================

interface Props {
  profileType: string;
  /** Currently selected items. Each may be a ProfileSelectionValue or legacy plain string. */
  value: Array<ProfileSelectionValue | string> | null | undefined;
  onChange: (next: ProfileSelectionValue[]) => void;
  disabled?: boolean;
  placeholder?: string;
  error?: boolean;
  portalZIndex?: number;
  /** Optional service-type scope for catalog adapters (booking service_type). */
  serviceTypeFilter?: string;
  /** Quick-create handler — must return a linked ProfileSelectionValue or null. */
  onQuickCreate?: (name: string, profileType: string) => Promise<ProfileSelectionValue | null>;
}

// ==================== HELPERS ====================

function normalizeValues(
  raw: Array<ProfileSelectionValue | string> | null | undefined,
  profileType: string,
): ProfileSelectionValue[] {
  if (!raw) return [];
  return raw.map(v => {
    if (typeof v === 'string') return { id: null, label: v, profileType, source: 'manual' as const };
    return v;
  });
}

// ==================== STYLES ====================

const DROPDOWN_STYLE: React.CSSProperties = {
  position: 'fixed',
  background: 'var(--theme-bg-surface)',
  border: '1px solid var(--theme-border-default)',
  borderRadius: 8,
  boxShadow: 'var(--elevation-2)',
  overflow: 'hidden',
  minWidth: 240,
  maxWidth: 480,
};

// ==================== COMPONENT ====================

export function ProfileMultiLookupCombobox({
  profileType,
  value,
  onChange,
  disabled = false,
  placeholder,
  error = false,
  serviceTypeFilter,
  onQuickCreate,
  portalZIndex = 9999,
}: Props) {
  const { can } = usePermission();
  const selected = normalizeValues(value, profileType);

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
  const canQuickCreate = !!onQuickCreate
    && (registryEntry?.quickCreateAllowed ?? false)
    && can('exec_profiling', 'create');
  // Memoize: getAdapterForType returns a fresh object literal every call.
  // Without this, doSearch gets a new identity every render and the debounced
  // search effect re-fires constantly, flickering loading/results and
  // re-positioning the dropdown.
  const adapterInfo = useMemo(() => getAdapterForType(profileType), [profileType]);

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
        serviceType: serviceTypeFilter,
        limit: 30,
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
  }, [adapterInfo, serviceTypeFilter]);

  function openDropdown() {
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
    // Focus the search input after the portal mounts
    setTimeout(() => inputRef.current?.focus(), 0);
  }

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

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function isSelected(record: ProfileLookupRecord): boolean {
    return selected.some(s => (s.id && s.id === record.id) || s.label === record.label);
  }

  function handleToggle(record: ProfileLookupRecord) {
    if (isSelected(record)) {
      onChange(selected.filter(s => !((s.id && s.id === record.id) || s.label === record.label)));
    } else {
      onChange([...selected, { id: record.id, label: record.label, profileType, source: 'linked' }]);
    }
  }

  function handleRemove(item: ProfileSelectionValue) {
    onChange(selected.filter(s => !((s.id && s.id === item.id) || s.label === item.label)));
  }

  async function handleQuickCreate() {
    if (!onQuickCreate || !query.trim()) return;
    const created = await onQuickCreate(query.trim(), profileType);
    if (created) {
      onChange([...selected, created]);
      setQuery('');
      doSearch('');
    }
  }

  function handleAddManual() {
    if (!query.trim()) return;
    const trimmed = query.trim();
    if (selected.some(s => s.label === trimmed)) return;
    onChange([...selected, { id: null, label: trimmed, profileType, source: 'manual' }]);
    setQuery('');
  }

  const hasSelection = selected.length > 0;
  const queryHasMatch = results.some(r => r.label.toLowerCase() === query.trim().toLowerCase());
  const queryAlreadyManual = selected.some(s => s.label.toLowerCase() === query.trim().toLowerCase());

  // Read-only / disabled view
  if (disabled) {
    return (
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6,
        padding: '8px 12px', borderRadius: 8,
        border: '1px solid var(--theme-border-default)',
        background: 'var(--theme-bg-page)',
        minHeight: 38,
        alignItems: 'center',
      }}>
        {!hasSelection && <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>—</span>}
        {selected.map((s, i) => (
          <span key={`${s.id ?? s.label}-${i}`} style={chipStyle(s.source === 'linked', false)}>
            {s.label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={openDropdown}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          minHeight: 38,
          borderRadius: 8,
          background: 'var(--theme-bg-surface)',
          border: `1px solid ${error ? 'var(--theme-status-danger-fg)' : 'var(--theme-border-default)'}`,
          cursor: 'text',
        }}
      >
        <Search size={13} style={{ color: 'var(--theme-text-muted)', flexShrink: 0 }} />
        {selected.map((s, i) => (
          <span key={`${s.id ?? s.label}-${i}`} style={chipStyle(s.source === 'linked', true)}>
            {s.label}
            <button
              type="button"
              onMouseDown={e => { e.stopPropagation(); handleRemove(s); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'var(--theme-text-muted)' }}
              aria-label={`Remove ${s.label}`}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {!hasSelection && (
          <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>
            {placeholder ?? `Search ${profileType.replace(/_/g, ' ')}…`}
          </span>
        )}
      </div>

      {open && createPortal(
        <div ref={dropdownRef} style={dropdownStyle}>
          <div style={{ padding: '8px 10px 6px', borderBottom: '1px solid var(--theme-border-default)' }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') setOpen(false);
                if (e.key === 'Enter' && results.length > 0 && !isSelected(results[0])) {
                  e.preventDefault();
                  handleToggle(results[0]);
                }
              }}
              placeholder={`Search ${profileType.replace(/_/g, ' ')}…`}
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

          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {loading && results.length === 0 && <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--theme-text-muted)' }}>Searching…</div>}
            {!loading && results.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--theme-text-muted)' }}>
                {query.trim() ? 'No matches found.' : `No ${profileType.replace(/_/g, ' ')} records yet.`}
              </div>
            )}
            {results.map(record => {
              const checked = isSelected(record);
              return (
                <div
                  key={record.id}
                  onMouseDown={() => handleToggle(record)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 12px',
                    fontSize: 13,
                    color: 'var(--theme-text-primary)',
                    cursor: 'pointer',
                    background: checked ? 'var(--theme-status-success-bg)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLDivElement).style.background = 'var(--theme-state-hover)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = checked ? 'var(--theme-status-success-bg)' : 'transparent'; }}
                >
                  {checked ? <Check size={13} style={{ color: 'var(--theme-action-primary-bg)', flexShrink: 0 }} /> : <div style={{ width: 13, flexShrink: 0 }} />}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.label}</span>
                  {record.status === 'archived' && <span style={{ fontSize: 10, color: 'var(--theme-text-muted)' }}>archived</span>}
                </div>
              );
            })}
          </div>

          {canQuickCreate && query.trim() && !queryHasMatch && !queryAlreadyManual && (
            <div style={{ borderTop: '1px solid var(--theme-border-default)', padding: '6px 10px' }}>
              <button
                type="button"
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

          {isCombo && !canQuickCreate && query.trim() && !queryHasMatch && !queryAlreadyManual && (
            <div style={{ borderTop: '1px solid var(--theme-border-default)', padding: '6px 10px' }}>
              <button
                type="button"
                onMouseDown={handleAddManual}
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

function chipStyle(linked: boolean, removable: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: removable ? '2px 4px 2px 8px' : '2px 8px',
    fontSize: 12,
    backgroundColor: linked ? 'var(--theme-status-success-bg)' : 'var(--theme-bg-page)',
    border: `1px solid ${linked ? 'var(--theme-status-success-border)' : 'var(--theme-border-default)'}`,
    borderRadius: 4,
    color: linked ? 'var(--theme-action-primary-bg)' : 'var(--theme-text-primary)',
    fontWeight: 500,
  };
}
