import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, EyeOff, Search, X } from "lucide-react";
import {
  PERM_MODULES, PERM_ACTIONS,
  getInheritedPermission,
  type ModuleId, type ActionId,
} from "../permissionsConfig";
import type { ModuleGrants } from "./accessProfileTypes";
import { BLOCK_HIGHER_RANK_VISIBILITY_GRANT } from "../../../lib/rbacGrantKeys";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PermissionGrantEditorProps {
  grants: ModuleGrants;
  onChange: (nextGrants: ModuleGrants, metadata: { manual: boolean }) => void;
  baselineRole?: string;
  baselineDepartment?: string;
  /** When true, toggles show the inherited baseline and the dirty-dot indicator */
  showInheritedBaseline?: boolean;
  /** Shows skeleton loading state */
  loading?: boolean;
  disabled?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<ActionId, string> = {
  view:    "View",
  create:  "Create",
  edit:    "Edit",
  approve: "Approve",
  delete:  "Delete",
  export:  "Export",
};

const GROUP_ORDER = [
  "Business Development",
  "Pricing",
  "Operations",
  "Accounting",
  "HR",
  "Executive",
  "Inbox",
  "Personal",
];

export const GRID_COLS = "1fr 68px 68px 68px 72px 68px 68px";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Segment = { parent: typeof PERM_MODULES[0]; children: typeof PERM_MODULES };

function buildSegments(modules: typeof PERM_MODULES): Segment[] {
  const result: Segment[] = [];
  let current: Segment | null = null;
  for (const mod of modules) {
    if (mod.label.startsWith("↳")) {
      current?.children.push(mod);
    } else {
      if (current) result.push(current);
      current = { parent: mod, children: [] };
    }
  }
  if (current) result.push(current);
  return result;
}

// ─── PermToggle ───────────────────────────────────────────────────────────────

function PermToggle({
  granted,
  inherited,
  onChange,
  needsConfirm = false,
}: {
  granted: boolean;
  inherited?: boolean;  // if undefined, no dirty-dot indicator
  onChange: (next: boolean) => void;
  needsConfirm?: boolean;
}) {
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const isDirty = inherited !== undefined && granted !== inherited;

  if (pendingConfirm) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: "var(--theme-status-warning-fg)", lineHeight: 1, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Confirm?
        </span>
        <div style={{ display: "flex", gap: 3 }}>
          <button
            onClick={() => { onChange(true); setPendingConfirm(false); }}
            style={{
              width: 26, height: 18, borderRadius: 4, border: "none", fontSize: 10, fontWeight: 700,
              backgroundColor: "var(--neuron-action-primary)", color: "#fff",
              cursor: "pointer",
            }}
          >
            Yes
          </button>
          <button
            onClick={() => setPendingConfirm(false)}
            style={{
              width: 26, height: 18, borderRadius: 4,
              border: "1px solid var(--neuron-ui-border)", fontSize: 10, fontWeight: 600,
              backgroundColor: "transparent", color: "var(--neuron-ink-muted)",
              cursor: "pointer",
            }}
          >
            No
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <button
        onClick={() => {
          if (needsConfirm && !granted) {
            setPendingConfirm(true);
            return;
          }
          onChange(!granted);
        }}
        aria-pressed={granted}
        style={{
          width: 36, height: 20, borderRadius: 10,
          border: granted ? "none" : "1.5px solid var(--neuron-ui-border)",
          backgroundColor: granted ? "var(--neuron-action-primary)" : "transparent",
          cursor: "pointer", position: "relative",
          transition: "background-color 0.15s cubic-bezier(0.16,1,0.3,1), border-color 0.15s",
          flexShrink: 0,
        }}
      >
        <span style={{
          position: "absolute",
          top: granted ? 2 : 1.5,
          left: granted ? 18 : 1.5,
          width: 16, height: 16, borderRadius: "50%",
          backgroundColor: granted ? "#fff" : "var(--neuron-ui-border)",
          transition: "left 0.15s cubic-bezier(0.16,1,0.3,1)",
          boxShadow: granted ? "0 1px 3px rgba(0,0,0,0.18)" : "none",
        }} />
      </button>
      <div style={{
        width: 5, height: 5, borderRadius: "50%",
        backgroundColor: isDirty ? "var(--neuron-action-primary)" : "transparent",
        transition: "background-color 0.15s",
        flexShrink: 0,
      }} />
    </div>
  );
}

function RbacRuleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      aria-label="Block higher-rank visibility"
      style={{
        flexShrink: 0,
        width: 44,
        height: 24,
        borderRadius: 12,
        border: "none",
        backgroundColor: checked ? "var(--neuron-action-primary)" : "var(--neuron-ui-border)",
        cursor: disabled ? "not-allowed" : "pointer",
        position: "relative",
        transition: "background-color 0.18s cubic-bezier(0.16,1,0.3,1)",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: "50%",
          backgroundColor: "#fff",
          transition: "left 0.18s cubic-bezier(0.16,1,0.3,1)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

// ─── SkeletonLoader ───────────────────────────────────────────────────────────

function SkeletonLoader() {
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 0" }}>
      <div className="animate-pulse" style={{ height: 36, borderRadius: 8, backgroundColor: "var(--neuron-bg-surface-subtle)", marginBottom: 12 }} />
      <div style={{ height: 32, borderRadius: 8, backgroundColor: "var(--neuron-bg-surface-subtle)", marginBottom: 8 }} />
      {[1, 2, 3].map(i => (
        <div key={i} style={{ border: "1px solid var(--neuron-ui-border)", borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
          <div style={{ height: 46, padding: "0 20px", display: "flex", alignItems: "center", gap: 10, backgroundColor: "var(--neuron-bg-elevated)" }}>
            <div className="animate-pulse" style={{ width: 110 + i * 20, height: 13, borderRadius: 4, backgroundColor: "var(--neuron-bg-surface-subtle)" }} />
          </div>
          {i === 1 && (
            <div style={{ borderTop: "1px solid var(--neuron-ui-border)" }}>
              {[1, 2, 3, 4].map(j => (
                <div key={j} style={{ display: "grid", gridTemplateColumns: GRID_COLS, padding: "10px 20px", alignItems: "center", borderTop: j > 1 ? "1px solid color-mix(in oklch, var(--neuron-ui-border) 55%, transparent)" : undefined }}>
                  <div className="animate-pulse" style={{ height: 12, width: 60 + j * 18, borderRadius: 3, backgroundColor: "var(--neuron-bg-surface-subtle)" }} />
                  {PERM_ACTIONS.map(a => (
                    <div key={a} style={{ display: "flex", justifyContent: "center" }}>
                      <div className="animate-pulse" style={{ width: 36, height: 20, borderRadius: 10, backgroundColor: "var(--neuron-bg-surface-subtle)" }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── ModuleRow ────────────────────────────────────────────────────────────────

function ModuleRow({
  mod,
  baselineRole,
  baselineDepartment,
  showInheritedBaseline,
  grants,
  onToggle,
  highlighted,
  highlightedCellKeys,
}: {
  mod: typeof PERM_MODULES[0];
  baselineRole: string;
  baselineDepartment: string;
  showInheritedBaseline: boolean;
  grants: ModuleGrants;
  onToggle: (moduleId: ModuleId, action: ActionId, next: boolean) => void;
  highlighted?: boolean;
  highlightedCellKeys: Set<string>;
}) {
  const applicable = new Set(mod.applicableActions ?? PERM_ACTIONS);
  const displayLabel = mod.label.replace(/^↳\s*/, "");

  return (
    <div style={{
      display: "grid", gridTemplateColumns: GRID_COLS,
      padding: "4px 20px 4px 34px", alignItems: "center",
      backgroundColor: highlighted
        ? "color-mix(in oklch, var(--neuron-action-primary) 7%, var(--neuron-bg-elevated))"
        : "var(--neuron-bg-surface-subtle)",
      borderTop: "1px solid color-mix(in oklch, var(--neuron-ui-border) 45%, transparent)",
      transition: "background-color 0.15s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 12, minWidth: 0 }}>
        {/* L-shaped tree connector */}
        <div style={{
          flexShrink: 0,
          width: 10,
          height: 18,
          borderLeft: "1.5px solid color-mix(in oklch, var(--neuron-ui-border) 70%, transparent)",
          borderBottom: "1.5px solid color-mix(in oklch, var(--neuron-ui-border) 70%, transparent)",
          borderBottomLeftRadius: 2,
          marginBottom: -2,
          alignSelf: "flex-end",
        }} />
        <span style={{
          fontSize: 12, color: "var(--neuron-ink-secondary, var(--neuron-ink-muted))", fontWeight: 400,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {displayLabel}
        </span>
      </div>
      {PERM_ACTIONS.map(action => {
        const cellKey = `${mod.id}:${action}`;
        const isCellHighlighted = highlightedCellKeys.has(cellKey);
        if (!applicable.has(action)) {
          return (
            <div key={action} style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 28, cursor: "not-allowed" }} title="This action doesn't apply to this module">
              <span style={{ fontSize: 12, color: "var(--neuron-ui-muted)", opacity: 0.3, userSelect: "none" }}>—</span>
            </div>
          );
        }
        const inherited = showInheritedBaseline
          ? getInheritedPermission(baselineRole, baselineDepartment, mod.id, action)
          : undefined;
        const granted = cellKey in grants ? grants[cellKey] : (inherited ?? false);
        return (
          <div key={action} style={{
            display: "flex", justifyContent: "center", alignItems: "center", height: 28,
            backgroundColor: isCellHighlighted ? "color-mix(in oklch, var(--neuron-action-primary) 14%, transparent)" : undefined,
            borderRadius: isCellHighlighted ? 6 : undefined,
            transition: "background-color 0.15s",
          }}>
            <PermToggle
              granted={granted}
              inherited={inherited}
              onChange={(next) => onToggle(mod.id as ModuleId, action, next)}
              needsConfirm={action === "approve" && !granted}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── GroupAccordion ───────────────────────────────────────────────────────────

function GroupAccordion({
  group, modules, baselineRole, baselineDepartment, showInheritedBaseline,
  grants, onToggle, defaultOpen, searchQuery, matchedIds, highlightedCellKeys, activeActionFilter,
}: {
  group: string;
  modules: typeof PERM_MODULES;
  baselineRole: string;
  baselineDepartment: string;
  showInheritedBaseline: boolean;
  grants: ModuleGrants;
  onToggle: (moduleId: ModuleId, action: ActionId, next: boolean) => void;
  defaultOpen: boolean;
  searchQuery: string;
  matchedIds: Set<string>;
  highlightedCellKeys: Set<string>;
  activeActionFilter: ActionId | null;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const segments = useMemo(() => buildSegments(modules), [modules]);
  const searching = searchQuery.trim().length > 0;

  const filteredSegments = useMemo(() => {
    if (!searching) return segments;
    return segments.filter(seg =>
      matchedIds.has(seg.parent.id) || seg.children.some(c => matchedIds.has(c.id))
    );
  }, [segments, searching, matchedIds]);

  const hasHighlightedCells = useMemo(() => {
    if (highlightedCellKeys.size === 0) return false;
    return modules.some(mod => {
      const applicable = mod.applicableActions ?? PERM_ACTIONS;
      return applicable.some(a => highlightedCellKeys.has(`${mod.id}:${a}`));
    });
  }, [modules, highlightedCellKeys]);

  const effectiveOpen = searching
    ? filteredSegments.length > 0
    : (activeActionFilter && hasHighlightedCells)
      ? true
      : isOpen;

  const toggleChildren = (id: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const segmentsWithChildren = useMemo(() => segments.filter(s => s.children.length > 0), [segments]);
  const allTabsExpanded = useMemo(
    () => segmentsWithChildren.length > 0 && segmentsWithChildren.every(s => expandedParents.has(s.parent.id)),
    [segmentsWithChildren, expandedParents]
  );

  const toggleAllTabs = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedParents(allTabsExpanded ? new Set() : new Set(segmentsWithChildren.map(s => s.parent.id)));
  };

  const overrideCount = useMemo(() => {
    return modules.reduce((count, mod) => {
      const applicable = mod.applicableActions ?? PERM_ACTIONS;
      return count + applicable.filter(action => `${mod.id}:${action}` in grants).length;
    }, 0);
  }, [modules, grants]);

  return (
    <div style={{ border: "1px solid var(--neuron-ui-border)", borderRadius: 10, overflow: "hidden" }}>

      {/* Group header */}
      <div
        onClick={() => !searching && !activeActionFilter && setIsOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 20px", height: 46,
          background: "var(--neuron-bg-elevated)",
          cursor: (searching || activeActionFilter) ? "default" : "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--neuron-ink-primary)", letterSpacing: "0.01em" }}>{group}</span>
          {overrideCount > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 999,
              backgroundColor: "color-mix(in oklch, var(--neuron-action-primary) 12%, transparent)",
              color: "var(--neuron-action-primary)",
            }}>
              {overrideCount} {overrideCount === 1 ? "override" : "overrides"}
            </span>
          )}
          {searching && filteredSegments.length > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 500, padding: "1px 7px", borderRadius: 999,
              backgroundColor: "var(--neuron-bg-surface-subtle)", color: "var(--neuron-ink-muted)",
            }}>
              {filteredSegments.length} match{filteredSegments.length !== 1 ? "es" : ""}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {segmentsWithChildren.length > 0 && effectiveOpen && !searching && (
            <button
              onClick={toggleAllTabs}
              style={{
                fontSize: 11, fontWeight: 500, color: "var(--neuron-ink-muted)",
                padding: "3px 8px", borderRadius: 6, border: "1px solid var(--neuron-ui-border)",
                background: "transparent", cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {allTabsExpanded ? "Collapse tabs" : "Expand tabs"}
            </button>
          )}
          {!searching && !activeActionFilter && (
            <ChevronDown size={15} style={{
              color: "var(--neuron-ink-muted)",
              transform: effectiveOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.24s cubic-bezier(0.16,1,0.3,1)", flexShrink: 0,
            }} />
          )}
        </div>
      </div>

      {/* Animated group body */}
      <div style={{
        display: "grid",
        gridTemplateRows: effectiveOpen ? "1fr" : "0fr",
        transition: (searching || activeActionFilter) ? "none" : "grid-template-rows 0.28s cubic-bezier(0.16,1,0.3,1)",
      }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{ borderTop: "1px solid var(--neuron-ui-border)" }}>
            {filteredSegments.map((seg, si) => {
              const hasChildren = seg.children.length > 0;
              const childrenMatchSearch = searching && seg.children.some(c => matchedIds.has(c.id));
              const childrenHaveHighlight = activeActionFilter !== null && seg.children.some(c => {
                const applicable = c.applicableActions ?? PERM_ACTIONS;
                return applicable.some(a => highlightedCellKeys.has(`${c.id}:${a}`));
              });
              const childrenOpen = childrenMatchSearch || childrenHaveHighlight || expandedParents.has(seg.parent.id);
              const parentHighlighted = searching && matchedIds.has(seg.parent.id);
              const visibleChildren = searching ? seg.children.filter(c => matchedIds.has(c.id)) : seg.children;

              return (
                <div key={seg.parent.id} style={{ borderTop: si > 0 ? "1px solid var(--neuron-ui-border)" : undefined }}>
                  {/* Parent row */}
                  <div style={{
                    display: "grid", gridTemplateColumns: GRID_COLS,
                    padding: "10px 20px", alignItems: "center",
                    backgroundColor: parentHighlighted
                      ? "color-mix(in oklch, var(--neuron-action-primary) 7%, var(--neuron-bg-elevated))"
                      : "var(--neuron-bg-elevated)",
                    transition: "background-color 0.15s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", paddingRight: 12, minWidth: 0 }}>
                      <button
                        onClick={() => hasChildren && toggleChildren(seg.parent.id)}
                        disabled={!hasChildren}
                        style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: hasChildren ? "pointer" : "default", padding: 0, textAlign: "left" }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>
                          {seg.parent.label}
                        </span>
                        {hasChildren && !searching && (
                          <ChevronRight size={12} style={{
                            color: childrenOpen ? "var(--neuron-action-primary)" : "var(--neuron-ui-border)",
                            transform: childrenOpen ? "rotate(90deg)" : "rotate(0deg)",
                            transition: "transform 0.18s cubic-bezier(0.16,1,0.3,1), color 0.14s", flexShrink: 0,
                          }} />
                        )}
                        {hasChildren && searching && visibleChildren.length > 0 && (
                          <span style={{ fontSize: 11, color: "var(--neuron-ink-muted)", padding: "1px 6px", borderRadius: 4, backgroundColor: "var(--neuron-bg-surface-subtle)", flexShrink: 0 }}>
                            {visibleChildren.length} tab{visibleChildren.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Parent action cells */}
                    {(() => {
                      const applicable = new Set(seg.parent.applicableActions ?? PERM_ACTIONS);
                      return PERM_ACTIONS.map(action => {
                        const cellKey = `${seg.parent.id}:${action}`;
                        const isCellHighlighted = highlightedCellKeys.has(cellKey);
                        if (!applicable.has(action)) {
                          return (
                            <div key={action} style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 38, cursor: "not-allowed" }} title="This action doesn't apply to this module">
                              <span style={{ fontSize: 12, color: "var(--neuron-ui-muted)", opacity: 0.6, userSelect: "none" }}>—</span>
                            </div>
                          );
                        }
                        const inherited = showInheritedBaseline
                          ? getInheritedPermission(baselineRole, baselineDepartment, seg.parent.id, action)
                          : undefined;
                        const granted = cellKey in grants ? grants[cellKey] : (inherited ?? false);
                        return (
                          <div key={action} style={{
                            display: "flex", justifyContent: "center", alignItems: "center", height: 38,
                            backgroundColor: isCellHighlighted ? "color-mix(in oklch, var(--neuron-action-primary) 14%, transparent)" : undefined,
                            borderRadius: isCellHighlighted ? 6 : undefined,
                            transition: "background-color 0.15s",
                          }}>
                            <PermToggle
                              granted={granted}
                              inherited={inherited}
                              onChange={(next) => onToggle(seg.parent.id as ModuleId, action, next)}
                              needsConfirm={action === "approve" && !granted}
                            />
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {/* Tab children */}
                  {hasChildren && visibleChildren.length > 0 && (
                    <div style={{
                      display: "grid",
                      gridTemplateRows: (searching || childrenOpen) ? "1fr" : "0fr",
                      transition: (searching || activeActionFilter) ? "none" : "grid-template-rows 0.22s cubic-bezier(0.16,1,0.3,1)",
                    }}>
                      <div style={{ overflow: "hidden" }}>
                        {visibleChildren.map(child => (
                          <ModuleRow
                            key={child.id}
                            mod={child}
                            baselineRole={baselineRole}
                            baselineDepartment={baselineDepartment}
                            showInheritedBaseline={showInheritedBaseline}
                            grants={grants}
                            onToggle={onToggle}
                            highlighted={searching && matchedIds.has(child.id)}
                            highlightedCellKeys={highlightedCellKeys}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PermissionGrantEditor ────────────────────────────────────────────────────

export function PermissionGrantEditor({
  grants,
  onChange,
  baselineRole = "",
  baselineDepartment = "",
  showInheritedBaseline = false,
  loading = false,
  disabled = false,
}: PermissionGrantEditorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeActionFilter, setActiveActionFilter] = useState<ActionId | null>(null);
  const blockHigherRankVisibility = grants[BLOCK_HIGHER_RANK_VISIBILITY_GRANT] === true;

  const grouped = useMemo(() => {
    const map = new Map<string, typeof PERM_MODULES>();
    for (const group of GROUP_ORDER) map.set(group, []);
    for (const mod of PERM_MODULES) {
      const arr = map.get(mod.group);
      if (arr) arr.push(mod);
      else map.set(mod.group, [mod]);
    }
    return Array.from(map.entries()).filter(([, mods]) => mods.length > 0);
  }, []);

  const matchedIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    const ids = new Set<string>();
    for (const mod of PERM_MODULES) {
      const label = mod.label.replace(/^↳\s*/, "").toLowerCase();
      if (label.includes(q)) ids.add(mod.id);
    }
    return ids;
  }, [searchQuery]);

  const highlightedCellKeys = useMemo(() => {
    if (!activeActionFilter) return new Set<string>();
    const keys = new Set<string>();
    for (const key of Object.keys(grants)) {
      if (key.endsWith(`:${activeActionFilter}`)) keys.add(key);
    }
    return keys;
  }, [activeActionFilter, grants]);

  const handleToggle = (moduleId: ModuleId, action: ActionId, next: boolean) => {
    if (disabled) return;
    const key = `${moduleId}:${action}`;
    const newGrants = { ...grants };

    if (showInheritedBaseline && baselineRole && baselineDepartment) {
      const inherited = getInheritedPermission(baselineRole, baselineDepartment, moduleId, action);
      if (next === inherited) {
        delete newGrants[key];
      } else {
        newGrants[key] = next;
      }
    } else {
      // Profile mode: remove key instead of storing explicit false
      if (!next) {
        delete newGrants[key];
      } else {
        newGrants[key] = true;
      }
    }

    onChange(newGrants, { manual: true });
  };

  const handleHigherRankRuleChange = (next: boolean) => {
    if (disabled) return;
    const newGrants = { ...grants };
    if (next) {
      newGrants[BLOCK_HIGHER_RANK_VISIBILITY_GRANT] = true;
    } else {
      delete newGrants[BLOCK_HIGHER_RANK_VISIBILITY_GRANT];
    }
    onChange(newGrants, { manual: true });
  };

  if (loading) return <SkeletonLoader />;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      {/* Data visibility rules */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 18,
          padding: "14px 16px",
          marginBottom: 12,
          border: "1px solid var(--neuron-ui-border)",
          borderRadius: 8,
          backgroundColor: "var(--neuron-bg-elevated)",
        }}
      >
        <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "color-mix(in oklch, var(--neuron-action-primary) 10%, transparent)",
              color: "var(--neuron-action-primary)",
              flexShrink: 0,
            }}
          >
            <EyeOff size={15} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 650, color: "var(--neuron-ink-primary)", marginBottom: 3 }}>
              Block higher-rank visibility
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.45, color: "var(--neuron-ink-muted)", maxWidth: 660 }}>
              {showInheritedBaseline
                ? "This user cannot see records owned by a higher-rank user unless directly assigned."
                : "Members using this profile cannot see records owned by a higher-rank user unless directly assigned."}
            </div>
          </div>
        </div>
        <RbacRuleSwitch
          checked={blockHigherRankVisibility}
          onChange={handleHigherRankRuleChange}
          disabled={disabled}
        />
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "0 12px", height: 36, borderRadius: 8,
            border: "1px solid var(--neuron-ui-border)",
            backgroundColor: "var(--neuron-bg-elevated)",
            transition: "border-color 0.15s",
          }}
          onFocusCapture={e => (e.currentTarget.style.borderColor = "var(--neuron-action-primary)")}
          onBlurCapture={e => (e.currentTarget.style.borderColor = "var(--neuron-ui-border)")}
        >
          <Search size={14} style={{ color: "var(--neuron-ink-muted)", flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filter modules and tabs…"
            disabled={disabled}
            style={{
              flex: 1, border: "none", outline: "none",
              background: "transparent", fontSize: 13,
              color: "var(--neuron-ink-primary)", minWidth: 0,
            }}
          />
          {searchQuery && matchedIds.size === 0 && (
            <span style={{ fontSize: 11, color: "var(--neuron-ink-muted)", flexShrink: 0, whiteSpace: "nowrap" }}>No matches</span>
          )}
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 18, height: 18, borderRadius: "50%",
                border: "none", background: "var(--neuron-bg-surface-subtle)",
                cursor: "pointer", flexShrink: 0, color: "var(--neuron-ink-muted)",
              }}
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Action-chip faceting */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>
          Highlight overrides:
        </span>
        {PERM_ACTIONS.map(action => {
          const isActive = activeActionFilter === action;
          const count = Object.keys(grants).filter(k => k.endsWith(`:${action}`)).length;
          return (
            <button
              key={action}
              onClick={() => setActiveActionFilter(isActive ? null : action)}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "3px 9px", borderRadius: 6,
                border: isActive ? "1.5px solid var(--neuron-action-primary)" : "1px solid var(--neuron-ui-border)",
                backgroundColor: isActive ? "color-mix(in oklch, var(--neuron-action-primary) 10%, transparent)" : "transparent",
                color: isActive ? "var(--neuron-action-primary)" : "var(--neuron-ink-muted)",
                fontSize: 11, fontWeight: isActive ? 600 : 500,
                cursor: "pointer", transition: "all 0.14s",
                opacity: count === 0 ? 0.45 : 1,
              }}
            >
              {ACTION_LABELS[action]}
              {count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  width: 16, height: 16, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: isActive ? "var(--neuron-action-primary)" : "var(--neuron-bg-surface-subtle)",
                  color: isActive ? "#fff" : "var(--neuron-ink-muted)", flexShrink: 0,
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
        {activeActionFilter && (
          <button
            onClick={() => setActiveActionFilter(null)}
            style={{
              display: "flex", alignItems: "center", gap: 3,
              padding: "3px 8px", borderRadius: 6, border: "none", background: "none",
              color: "var(--neuron-ink-muted)", fontSize: 11, cursor: "pointer",
            }}
          >
            <X size={10} /> Clear
          </button>
        )}
      </div>

      {/* Sticky column header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--neuron-bg-elevated)", marginBottom: 8 }}>
        <div style={{
          display: "grid", gridTemplateColumns: GRID_COLS,
          padding: "0 20px", height: 32, alignItems: "center",
          backgroundColor: "var(--neuron-bg-surface-subtle)",
          border: "1px solid var(--neuron-ui-border)", borderRadius: 8,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
            Module / Tab
          </span>
          {PERM_ACTIONS.map(action => (
            <span key={action} style={{
              fontSize: 10, fontWeight: 700,
              color: activeActionFilter === action ? "var(--neuron-action-primary)" : "var(--neuron-ink-muted)",
              textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "center",
              transition: "color 0.14s",
            }}>
              {ACTION_LABELS[action]}
            </span>
          ))}
        </div>
      </div>

      {/* Group accordions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {grouped.map(([group, modules], gi) => (
          <GroupAccordion
            key={group}
            group={group}
            modules={modules}
            baselineRole={baselineRole}
            baselineDepartment={baselineDepartment}
            showInheritedBaseline={showInheritedBaseline}
            grants={grants}
            onToggle={handleToggle}
            defaultOpen={gi === 0}
            searchQuery={searchQuery}
            matchedIds={matchedIds}
            highlightedCellKeys={highlightedCellKeys}
            activeActionFilter={activeActionFilter}
          />
        ))}
      </div>
    </div>
  );
}
