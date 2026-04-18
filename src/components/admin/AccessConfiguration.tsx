import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../../utils/supabase/client";
import { toast } from "sonner@2.0.3";
import { ArrowLeft, Save, AlertTriangle, ChevronDown, ChevronRight, Search, X, RotateCcw } from "lucide-react";
import {
  PERM_MODULES, PERM_ACTIONS,
  getInheritedPermission,
  type ModuleId, type ActionId,
} from "./permissionsConfig";
import { useUser } from "../../hooks/useUser";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConfigUser {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
}

interface AccessConfigurationProps {
  user: ConfigUser;
  onBack: () => void;
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

const ROLE_LABELS: Record<string, string> = {
  staff:       "Staff",
  team_leader: "Team Leader",
  supervisor:  "Supervisor",
  manager:     "Manager",
  executive:   "Executive",
};

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  // Executive is the highest trust tier — use premium ink, not danger red
  executive:   { bg: "color-mix(in oklch, var(--neuron-ink-primary) 12%, transparent)", text: "var(--neuron-ink-primary)" },
  manager:     { bg: "var(--neuron-status-accent-bg)",    text: "var(--neuron-status-accent-fg)" },
  supervisor:  { bg: "var(--neuron-semantic-info-bg)",    text: "var(--neuron-semantic-info)" },
  team_leader: { bg: "var(--theme-status-warning-bg)",    text: "var(--theme-status-warning-fg)" },
  staff:       { bg: "var(--neuron-bg-surface-subtle)",   text: "var(--theme-text-secondary)" },
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

const GRID_COLS = "1fr 68px 68px 68px 72px 68px 68px";

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

function formatRelativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ─── PermToggle ───────────────────────────────────────────────────────────────
// Visual states:
//   granted (baseline or override): full teal fill + white thumb
//   not granted: empty border + grey thumb
//   dirty dot below toggle: indicates this cell differs from role baseline
//
// needsConfirm: when true and enabling, requires a two-step confirmation (used for Approve action)

function PermToggle({
  granted,
  inherited,
  onChange,
  needsConfirm = false,
}: {
  granted: boolean;
  inherited: boolean;
  onChange: (next: boolean) => void;
  needsConfirm?: boolean;
}) {
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const isDirty = granted !== inherited;  // true = override exists

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
          width: 36,
          height: 20,
          borderRadius: 10,
          border: granted ? "none" : "1.5px solid var(--neuron-ui-border)",
          backgroundColor: granted ? "var(--neuron-action-primary)" : "transparent",
          cursor: "pointer",
          position: "relative",
          transition: "background-color 0.15s cubic-bezier(0.16,1,0.3,1), border-color 0.15s",
          flexShrink: 0,
        }}
      >
        <span style={{
          position: "absolute",
          top: granted ? 2 : 1.5,
          left: granted ? 18 : 1.5,
          width: 16,
          height: 16,
          borderRadius: "50%",
          backgroundColor: granted ? "#fff" : "var(--neuron-ui-border)",
          transition: "left 0.15s cubic-bezier(0.16,1,0.3,1)",
          boxShadow: granted ? "0 1px 3px rgba(0,0,0,0.18)" : "none",
        }} />
      </button>
      {/* Dirty dot: visible only when override exists */}
      <div style={{
        width: 5,
        height: 5,
        borderRadius: "50%",
        backgroundColor: isDirty ? "var(--neuron-action-primary)" : "transparent",
        transition: "background-color 0.15s",
        flexShrink: 0,
      }} />
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function SkeletonLoader() {
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 0" }}>
      {/* Heading skeleton */}
      <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="animate-pulse" style={{ width: 180, height: 16, borderRadius: 4, backgroundColor: "var(--neuron-bg-surface-subtle)" }} />
        <div className="animate-pulse" style={{ width: 300, height: 12, borderRadius: 4, backgroundColor: "var(--neuron-bg-surface-subtle)" }} />
      </div>
      {/* Search skeleton */}
      <div className="animate-pulse" style={{ height: 36, borderRadius: 8, backgroundColor: "var(--neuron-bg-surface-subtle)", marginBottom: 12 }} />
      {/* Column header skeleton */}
      <div style={{ height: 32, borderRadius: 8, backgroundColor: "var(--neuron-bg-surface-subtle)", marginBottom: 8 }} />
      {/* Accordion skeletons */}
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

// ─── ModuleRow (tab children only) ────────────────────────────────────────────

function ModuleRow({
  mod,
  userRole,
  userDept,
  overrides,
  onToggle,
  highlighted,
  highlightedCellKeys,
}: {
  mod: typeof PERM_MODULES[0];
  userRole: string;
  userDept: string;
  overrides: Record<string, boolean>;
  onToggle: (moduleId: ModuleId, action: ActionId, next: boolean) => void;
  highlighted?: boolean;
  highlightedCellKeys: Set<string>;
}) {
  const applicable = new Set(mod.applicableActions ?? PERM_ACTIONS);
  const displayLabel = mod.label.replace(/^↳\s*/, "");

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: GRID_COLS,
      padding: "5px 20px 5px 44px",
      alignItems: "center",
      backgroundColor: highlighted
        ? "color-mix(in oklch, var(--neuron-action-primary) 7%, var(--neuron-bg-elevated))"
        : "var(--neuron-bg-surface-subtle)",
      borderTop: "1px solid color-mix(in oklch, var(--neuron-ui-border) 30%, transparent)",
      transition: "background-color 0.15s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingRight: 12, minWidth: 0 }}>
        <span style={{ fontSize: 9, color: "var(--neuron-action-primary)", opacity: 0.5, flexShrink: 0, lineHeight: 1, marginTop: 1 }}>
          ╰
        </span>
        <span style={{
          fontSize: 12,
          color: "var(--neuron-ink-secondary, var(--neuron-ink-muted))",
          fontWeight: 400,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {displayLabel}
        </span>
      </div>
      {PERM_ACTIONS.map(action => {
        const cellKey = `${mod.id}:${action}`;
        const isCellHighlighted = highlightedCellKeys.has(cellKey);
        if (!applicable.has(action)) {
          return (
            <div
              key={action}
              style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 28, cursor: "not-allowed" }}
              title="This action doesn't apply to this module"
            >
              <span style={{ fontSize: 12, color: "var(--neuron-ui-muted)", opacity: 0.3, userSelect: "none" }}>—</span>
            </div>
          );
        }
        const inherited = getInheritedPermission(userRole, userDept, mod.id, action);
        const granted = cellKey in overrides ? overrides[cellKey] : inherited;
        return (
          <div
            key={action}
            style={{
              display: "flex", justifyContent: "center", alignItems: "center", height: 28,
              backgroundColor: isCellHighlighted ? "color-mix(in oklch, var(--neuron-action-primary) 14%, transparent)" : undefined,
              borderRadius: isCellHighlighted ? 6 : undefined,
              transition: "background-color 0.15s",
            }}
          >
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
  group,
  modules,
  userRole,
  userDept,
  overrides,
  onToggle,
  defaultOpen,
  searchQuery,
  matchedIds,
  highlightedCellKeys,
  activeActionFilter,
}: {
  group: string;
  modules: typeof PERM_MODULES;
  userRole: string;
  userDept: string;
  overrides: Record<string, boolean>;
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

  const segmentsWithChildren = useMemo(
    () => segments.filter(s => s.children.length > 0),
    [segments]
  );

  const allTabsExpanded = useMemo(
    () => segmentsWithChildren.length > 0 && segmentsWithChildren.every(s => expandedParents.has(s.parent.id)),
    [segmentsWithChildren, expandedParents]
  );

  const toggleAllTabs = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (allTabsExpanded) {
      setExpandedParents(new Set());
    } else {
      setExpandedParents(new Set(segmentsWithChildren.map(s => s.parent.id)));
    }
  };

  const overrideCount = useMemo(() => {
    return modules.reduce((count, mod) => {
      const applicable = mod.applicableActions ?? PERM_ACTIONS;
      return count + applicable.filter(action => `${mod.id}:${action}` in overrides).length;
    }, 0);
  }, [modules, overrides]);

  return (
    <div style={{ border: "1px solid var(--neuron-ui-border)", borderRadius: 10, overflow: "hidden" }}>

      {/* Group header */}
      <div
        onClick={() => !searching && !activeActionFilter && setIsOpen(o => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          height: 46,
          background: "var(--neuron-bg-elevated)",
          cursor: (searching || activeActionFilter) ? "default" : "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--neuron-ink-primary)", letterSpacing: "0.01em" }}>
            {group}
          </span>
          {overrideCount > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 600,
              padding: "1px 7px", borderRadius: 999,
              backgroundColor: "color-mix(in oklch, var(--neuron-action-primary) 12%, transparent)",
              color: "var(--neuron-action-primary)",
            }}>
              {overrideCount} {overrideCount === 1 ? "override" : "overrides"}
            </span>
          )}
          {searching && filteredSegments.length > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 500,
              padding: "1px 7px", borderRadius: 999,
              backgroundColor: "var(--neuron-bg-surface-subtle)",
              color: "var(--neuron-ink-muted)",
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
                fontSize: 11, fontWeight: 500,
                color: "var(--neuron-ink-muted)",
                padding: "3px 8px", borderRadius: 6,
                border: "1px solid var(--neuron-ui-border)",
                background: "transparent", cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {allTabsExpanded ? "Collapse tabs" : "Expand tabs"}
            </button>
          )}
          {!searching && !activeActionFilter && (
            <ChevronDown
              size={15}
              style={{
                color: "var(--neuron-ink-muted)",
                transform: effectiveOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.24s cubic-bezier(0.16,1,0.3,1)",
                flexShrink: 0,
              }}
            />
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

              const visibleChildren = searching
                ? seg.children.filter(c => matchedIds.has(c.id))
                : seg.children;

              return (
                <div
                  key={seg.parent.id}
                  style={{ borderTop: si > 0 ? "1px solid var(--neuron-ui-border)" : undefined }}
                >
                  {/* Parent row */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: GRID_COLS,
                    padding: "10px 20px",
                    alignItems: "center",
                    backgroundColor: parentHighlighted
                      ? "color-mix(in oklch, var(--neuron-action-primary) 7%, var(--neuron-bg-elevated))"
                      : "var(--neuron-bg-elevated)",
                    transition: "background-color 0.15s",
                  }}>
                    {/* Label column: clicking expands tab children */}
                    <div style={{ display: "flex", alignItems: "center", paddingRight: 12, minWidth: 0 }}>
                      <button
                        onClick={() => hasChildren && toggleChildren(seg.parent.id)}
                        disabled={!hasChildren}
                        style={{
                          flex: 1, minWidth: 0,
                          display: "flex", alignItems: "center", gap: 6,
                          background: "none", border: "none",
                          cursor: hasChildren ? "pointer" : "default",
                          padding: 0, textAlign: "left",
                        }}
                      >
                        <span style={{
                          fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          flex: 1, minWidth: 0,
                        }}>
                          {seg.parent.label}
                        </span>
                        {hasChildren && !searching && (
                          <ChevronRight
                            size={12}
                            style={{
                              color: childrenOpen ? "var(--neuron-action-primary)" : "var(--neuron-ui-border)",
                              transform: childrenOpen ? "rotate(90deg)" : "rotate(0deg)",
                              transition: "transform 0.18s cubic-bezier(0.16,1,0.3,1), color 0.14s",
                              flexShrink: 0,
                            }}
                          />
                        )}
                        {hasChildren && searching && visibleChildren.length > 0 && (
                          <span style={{
                            fontSize: 11, color: "var(--neuron-ink-muted)",
                            padding: "1px 6px", borderRadius: 4,
                            backgroundColor: "var(--neuron-bg-surface-subtle)",
                            flexShrink: 0,
                          }}>
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
                            <div
                              key={action}
                              style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 38, cursor: "not-allowed" }}
                              title="This action doesn't apply to this module"
                            >
                              <span style={{ fontSize: 12, color: "var(--neuron-ui-muted)", opacity: 0.6, userSelect: "none" }}>—</span>
                            </div>
                          );
                        }
                        const inherited = getInheritedPermission(userRole, userDept, seg.parent.id, action);
                        const granted = cellKey in overrides ? overrides[cellKey] : inherited;
                        return (
                          <div
                            key={action}
                            style={{
                              display: "flex", justifyContent: "center", alignItems: "center", height: 38,
                              backgroundColor: isCellHighlighted ? "color-mix(in oklch, var(--neuron-action-primary) 14%, transparent)" : undefined,
                              borderRadius: isCellHighlighted ? 6 : undefined,
                              transition: "background-color 0.15s",
                            }}
                          >
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

                  {/* Tab children — collapsible */}
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
                            userRole={userRole}
                            userDept={userDept}
                            overrides={overrides}
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

// ─── AccessConfiguration ──────────────────────────────────────────────────────

export function AccessConfiguration({ user, onBack }: AccessConfigurationProps) {
  const { user: currentAdmin } = useUser();

  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [savedOverrides, setSavedOverrides] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeActionFilter, setActiveActionFilter] = useState<ActionId | null>(null);
  const [lastSaved, setLastSaved] = useState<{ by: string; at: Date } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("permission_overrides")
        .select("module_grants")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) {
        const grants = (data?.module_grants ?? {}) as Record<string, boolean>;
        setOverrides(grants);
        setSavedOverrides(grants);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user.id]);

  const isDirty = useMemo(() => {
    const ok = Object.keys(overrides);
    const sk = Object.keys(savedOverrides);
    if (ok.length !== sk.length) return true;
    return ok.some(k => overrides[k] !== savedOverrides[k]);
  }, [overrides, savedOverrides]);

  const handleToggle = (moduleId: ModuleId, action: ActionId, next: boolean) => {
    const key = `${moduleId}:${action}`;
    const inherited = getInheritedPermission(user.role, user.department, moduleId, action);
    setOverrides(prev => {
      const updated = { ...prev };
      if (next === inherited) {
        delete updated[key];
      } else {
        updated[key] = next;
      }
      return updated;
    });
  };

  const handleReset = () => {
    setOverrides({ ...savedOverrides });
  };

  const handleSave = async () => {
    setSaving(true);
    const { data: existing } = await supabase
      .from("permission_overrides")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    let error: any;
    if (existing) {
      ({ error } = await supabase
        .from("permission_overrides")
        .update({ module_grants: overrides })
        .eq("user_id", user.id));
    } else {
      ({ error } = await supabase
        .from("permission_overrides")
        .insert({ user_id: user.id, scope: "department_wide", module_grants: overrides }));
    }

    setSaving(false);
    if (error) {
      toast.error("Failed to save permissions");
      return;
    }

    const saved = { ...overrides };
    setSavedOverrides(saved);
    setLastSaved({ by: currentAdmin?.name || "you", at: new Date() });
    toast.success("Permissions saved");

    // Fire-and-forget audit log — requires permission_audit_log table to exist
    // SQL: CREATE TABLE permission_audit_log (id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    //   target_user_id uuid, changed_by text, changed_at timestamptz DEFAULT now(), changes jsonb);
    try {
      const added = Object.keys(overrides).filter(k => !(k in savedOverrides) || overrides[k] !== savedOverrides[k]);
      const removed = Object.keys(savedOverrides).filter(k => !(k in overrides));
      await (supabase as any).from("permission_audit_log").insert({
        target_user_id: user.id,
        changed_by: currentAdmin?.name || currentAdmin?.email || "unknown",
        changes: { added, removed },
      });
    } catch {
      // silent — table may not exist yet
    }
  };

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

  // Cells that should be highlighted by the action chip filter
  const highlightedCellKeys = useMemo(() => {
    if (!activeActionFilter) return new Set<string>();
    const keys = new Set<string>();
    for (const key of Object.keys(overrides)) {
      if (key.endsWith(`:${activeActionFilter}`)) keys.add(key);
    }
    return keys;
  }, [activeActionFilter, overrides]);

  const rc = ROLE_COLORS[user.role] ?? ROLE_COLORS.staff;
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--neuron-bg-elevated)" }}>

      {/* Top bar */}
      <div style={{
        padding: "16px 40px",
        borderBottom: "1px solid var(--neuron-ui-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        gap: 16,
        backgroundColor: "var(--neuron-bg-elevated)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
          <button
            onClick={onBack}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 12px", borderRadius: 8,
              border: "1px solid var(--neuron-ui-border)",
              background: "transparent",
              color: "var(--neuron-ink-muted)",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
              transition: "color 0.12s, border-color 0.12s",
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = "var(--neuron-ink-primary)";
              e.currentTarget.style.borderColor = "var(--neuron-ink-muted)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = "var(--neuron-ink-muted)";
              e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
            }}
          >
            <ArrowLeft size={13} /> Back
          </button>

          <div style={{ width: 1, height: 24, backgroundColor: "var(--neuron-ui-border)", flexShrink: 0 }} />

          {/* User identity */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              backgroundColor: "var(--neuron-bg-surface-subtle)",
              border: "1.5px solid var(--neuron-ui-border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 600, color: "var(--neuron-ink-muted)",
              flexShrink: 0,
            }}>
              {(user.name || user.email || "?").charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--neuron-ink-primary)", margin: 0, lineHeight: 1.25 }}>
                {user.name}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>{user.department}</span>
                <span style={{ fontSize: 11, color: "var(--neuron-ui-border)" }}>·</span>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  padding: "1px 7px", borderRadius: 999,
                  backgroundColor: rc.bg, color: rc.text,
                  flexShrink: 0,
                }}>
                  {roleLabel}
                </span>
                {lastSaved && (
                  <>
                    <span style={{ fontSize: 11, color: "var(--neuron-ui-border)" }}>·</span>
                    <span style={{ fontSize: 11, color: "var(--neuron-ink-muted)" }}>
                      Saved by {lastSaved.by} {formatRelativeTime(lastSaved.at)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <AnimatePresence>
            {isDirty && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <div style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontSize: 12, color: "var(--theme-status-warning-fg)",
                  padding: "5px 10px", borderRadius: 8,
                  backgroundColor: "var(--theme-status-warning-bg)",
                }}>
                  <AlertTriangle size={12} />
                  Unsaved changes
                </div>
                <button
                  onClick={handleReset}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 10px", borderRadius: 8,
                    border: "1px solid var(--neuron-ui-border)",
                    background: "transparent",
                    color: "var(--neuron-ink-muted)",
                    fontSize: 12, fontWeight: 500, cursor: "pointer",
                  }}
                  title="Discard all unsaved changes"
                >
                  <RotateCcw size={11} />
                  Reset
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            style={{
              height: 34, padding: "0 16px", borderRadius: 8,
              background: isDirty ? "var(--neuron-action-primary)" : "var(--neuron-bg-surface-subtle)",
              border: "none",
              color: isDirty ? "var(--neuron-action-primary-text)" : "var(--neuron-ink-muted)",
              fontSize: 13, fontWeight: 600,
              cursor: isDirty && !saving ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", gap: 6,
              transition: "background-color 0.15s, color 0.15s",
              opacity: saving ? 0.7 : 1,
            }}
            onMouseEnter={e => { if (isDirty && !saving) e.currentTarget.style.background = "var(--neuron-action-primary-hover)"; }}
            onMouseLeave={e => { if (isDirty && !saving) e.currentTarget.style.background = "var(--neuron-action-primary)"; }}
          >
            <Save size={13} />
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 40px 48px" }}>
        {loading ? (
          <SkeletonLoader />
        ) : (
          <div style={{ maxWidth: 1080, margin: "0 auto" }}>

            {/* Page heading */}
            <div style={{ padding: "24px 0 20px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--neuron-ink-primary)", letterSpacing: "-0.3px", margin: 0, marginBottom: 3 }}>
                  Access Configuration
                </h2>
                <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", margin: 0 }}>
                  Module permissions for <strong style={{ fontWeight: 600, color: "var(--neuron-ink-secondary, var(--neuron-ink-primary))" }}>{user.name}</strong>.
                  A teal dot beneath a toggle means it differs from the role baseline.
                </p>
              </div>

              {/* Compact legend */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                {[
                  {
                    indicator: (
                      <div style={{ position: "relative", width: 36, height: 20, borderRadius: 10, backgroundColor: "var(--neuron-action-primary)" }}>
                        <span style={{ position: "absolute", top: 2, left: 18, width: 16, height: 16, borderRadius: "50%", backgroundColor: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.18)" }} />
                      </div>
                    ),
                    label: "Enabled",
                  },
                  {
                    indicator: (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        <div style={{ position: "relative", width: 36, height: 20, borderRadius: 10, backgroundColor: "var(--neuron-action-primary)" }}>
                          <span style={{ position: "absolute", top: 2, left: 18, width: 16, height: 16, borderRadius: "50%", backgroundColor: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.18)" }} />
                        </div>
                        <div style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "var(--neuron-action-primary)" }} />
                      </div>
                    ),
                    label: "Override",
                  },
                  {
                    indicator: (
                      <div style={{ position: "relative", width: 36, height: 20, borderRadius: 10, backgroundColor: "transparent", border: "1.5px solid var(--neuron-ui-border)" }}>
                        <span style={{ position: "absolute", top: 1.5, left: 1.5, width: 16, height: 16, borderRadius: "50%", backgroundColor: "var(--neuron-ui-border)" }} />
                      </div>
                    ),
                    label: "Disabled",
                  },
                  {
                    indicator: <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)", opacity: 0.4, minWidth: 36, textAlign: "center" as const, cursor: "not-allowed" }}>—</span>,
                    label: "N/A",
                  },
                ].map(({ indicator, label }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {indicator}
                    <span style={{ fontSize: 11, color: "var(--neuron-ink-muted)" }}>{label}</span>
                  </div>
                ))}
              </div>
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
                  style={{
                    flex: 1, border: "none", outline: "none",
                    background: "transparent", fontSize: 13,
                    color: "var(--neuron-ink-primary)", minWidth: 0,
                  }}
                />
                {searchQuery && matchedIds.size === 0 && (
                  <span style={{ fontSize: 11, color: "var(--neuron-ink-muted)", flexShrink: 0, whiteSpace: "nowrap" }}>
                    No matches
                  </span>
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

            {/* Action-chip faceting: shows which rows have overrides for a given action */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>
                Highlight overrides:
              </span>
              {PERM_ACTIONS.map(action => {
                const isActive = activeActionFilter === action;
                // Count overrides for this action across all modules
                const count = Object.keys(overrides).filter(k => k.endsWith(`:${action}`)).length;
                return (
                  <button
                    key={action}
                    onClick={() => setActiveActionFilter(isActive ? null : action)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "3px 9px", borderRadius: 6,
                      border: isActive
                        ? "1.5px solid var(--neuron-action-primary)"
                        : "1px solid var(--neuron-ui-border)",
                      backgroundColor: isActive
                        ? "color-mix(in oklch, var(--neuron-action-primary) 10%, transparent)"
                        : "transparent",
                      color: isActive ? "var(--neuron-action-primary)" : "var(--neuron-ink-muted)",
                      fontSize: 11, fontWeight: isActive ? 600 : 500,
                      cursor: "pointer",
                      transition: "all 0.14s",
                      opacity: count === 0 ? 0.45 : 1,
                    }}
                  >
                    {ACTION_LABELS[action]}
                    {count > 0 && (
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        width: 16, height: 16, borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        backgroundColor: isActive
                          ? "var(--neuron-action-primary)"
                          : "var(--neuron-bg-surface-subtle)",
                        color: isActive ? "#fff" : "var(--neuron-ink-muted)",
                        flexShrink: 0,
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
                    padding: "3px 8px", borderRadius: 6,
                    border: "none", background: "none",
                    color: "var(--neuron-ink-muted)", fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  <X size={10} /> Clear
                </button>
              )}
            </div>

            {/* Sticky column header */}
            <div style={{
              position: "sticky", top: 0, zIndex: 10,
              backgroundColor: "var(--neuron-bg-elevated)",
              marginBottom: 8,
            }}>
              <div style={{
                display: "grid", gridTemplateColumns: GRID_COLS,
                padding: "0 20px", height: 32, alignItems: "center",
                backgroundColor: "var(--neuron-bg-surface-subtle)",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: 8,
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  Module / Tab
                </span>
                {PERM_ACTIONS.map(action => (
                  <span
                    key={action}
                    style={{
                      fontSize: 10, fontWeight: 700,
                      color: activeActionFilter === action ? "var(--neuron-action-primary)" : "var(--neuron-ink-muted)",
                      textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "center",
                      transition: "color 0.14s",
                    }}
                  >
                    {ACTION_LABELS[action]}
                  </span>
                ))}
              </div>
            </div>

            {/* Accordions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {grouped.map(([group, modules], gi) => (
                <GroupAccordion
                  key={group}
                  group={group}
                  modules={modules}
                  userRole={user.role}
                  userDept={user.department}
                  overrides={overrides}
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
        )}
      </div>
    </div>
  );
}
