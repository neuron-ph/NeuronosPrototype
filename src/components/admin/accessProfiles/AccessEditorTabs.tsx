import { useState, type ReactNode } from "react";
import { ListChecks, Eye } from "lucide-react";
import { PermissionGrantEditor } from "./PermissionGrantEditor";
import { RecordVisibilityEditor } from "./RecordVisibilityEditor";
import type { ModuleGrants } from "./accessProfileTypes";
import type { RecordVisibilityMap } from "./recordVisibilityConfig";

// NEU-012 Contract #6 — shared Feature Access | Record Visibility tab shell.
// Used by BOTH the Access Profile editor (full grants) and the per-user Access
// Configuration screen (override delta). Each host owns its own data wiring and
// state; this component owns only the tab chrome and the two editors' layout so
// the two surfaces stay identical and DRY.

interface AccessEditorTabsProps {
  // ── Feature Access ──
  grants: ModuleGrants;
  onGrantsChange: (next: ModuleGrants) => void;
  baselineGrants: ModuleGrants;
  showInheritedBaseline: boolean;
  othersPrimaryGroup: "Pricing" | "Operations";
  loading?: boolean;
  /** Locks both tabs (grants matrix + visibility dials) for viewers without an edit grant. */
  readOnly?: boolean;
  /** Optional toolbar shown above the matrix (e.g. grant count / baseline preview). */
  featureAccessToolbar?: ReactNode;
  // ── Record Visibility ──
  visibilityScopes: RecordVisibilityMap;
  onVisibilityChange: (next: RecordVisibilityMap) => void;
  /** Resolved (cascaded) view grants — drives which record-type rows are live. */
  resolvedViewGrants: Record<string, boolean>;
}

export function AccessEditorTabs({
  grants,
  onGrantsChange,
  baselineGrants,
  showInheritedBaseline,
  othersPrimaryGroup,
  loading,
  readOnly = false,
  featureAccessToolbar,
  visibilityScopes,
  onVisibilityChange,
  resolvedViewGrants,
}: AccessEditorTabsProps) {
  const [activeTab, setActiveTab] = useState<"access" | "visibility">("access");

  return (
    <div>
      {/* Feature Access | Record Visibility tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid var(--neuron-ui-border)" }}>
        {([
          ["access", "Feature Access", ListChecks] as const,
          ["visibility", "Record Visibility", Eye] as const,
        ]).map(([id, label, Icon]) => {
          const on = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
                border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                color: on ? "var(--neuron-action-primary)" : "var(--neuron-ink-muted)",
                borderBottom: on ? "2px solid var(--neuron-action-primary)" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              <Icon size={14} /> {label}
            </button>
          );
        })}
      </div>

      {activeTab === "access" ? (
        <>
          {featureAccessToolbar}
          <PermissionGrantEditor
            grants={grants}
            onChange={onGrantsChange}
            showInheritedBaseline={showInheritedBaseline}
            baselineGrants={baselineGrants}
            loading={loading}
            disabled={readOnly}
            othersPrimaryGroup={othersPrimaryGroup}
          />
        </>
      ) : (
        <RecordVisibilityEditor
          scopes={visibilityScopes}
          onChange={readOnly ? () => {} : onVisibilityChange}
          resolvedGrants={resolvedViewGrants}
        />
      )}
    </div>
  );
}
