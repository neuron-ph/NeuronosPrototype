import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../utils/supabase/client";
import { toast } from "sonner@2.0.3";
import { Loader2, Check, Minus } from "lucide-react";
import {
  PERM_MODULES,
  PERM_ACTIONS,
  getEffectivePermission,
  type ModuleId,
  type ActionId,
} from "./permissionsConfig";

export interface PermissionsMatrixProps {
  userId: string;
  userRole: string;
  userDepartment: string;
  readonly?: boolean;
  onSaved?: () => void;
}

const GROUPS = Array.from(new Set(PERM_MODULES.map((m) => m.group)));

const ACTION_LABELS: Record<ActionId, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  approve: "Approve",
  delete: "Delete",
  export: "Export",
};

function PermCell({
  granted,
  isCustom,
  readonly,
  onToggle,
}: {
  granted: boolean;
  isCustom: boolean;
  readonly: boolean;
  onToggle?: () => void;
}) {
  const iconEl = granted ? (
    <Check size={14} color="#0F766E" strokeWidth={2.5} />
  ) : (
    <Minus size={14} color="#667085" strokeWidth={2} />
  );

  const inner = isCustom ? (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: "#F0FDF9",
        border: "1px solid #D1FAE5",
      }}
    >
      {iconEl}
    </span>
  ) : (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 20,
        height: 20,
      }}
    >
      {iconEl}
    </span>
  );

  if (readonly) {
    return (
      <td
        style={{
          width: 40,
          textAlign: "center",
          padding: "6px 0",
          borderRight: "1px solid var(--neuron-ui-border)",
        }}
      >
        {inner}
      </td>
    );
  }

  return (
    <td
      style={{
        width: 40,
        textAlign: "center",
        padding: "6px 0",
        borderRight: "1px solid var(--neuron-ui-border)",
      }}
    >
      <button
        onClick={onToggle}
        title={granted ? "Revoke" : "Grant"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 4,
          border: "none",
          background: "transparent",
          cursor: "pointer",
        }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.background = "#F3F4F6")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLButtonElement).style.background = "transparent")
        }
      >
        {inner}
      </button>
    </td>
  );
}

export function PermissionsMatrix({
  userId,
  userRole,
  userDepartment,
  readonly = false,
  onSaved,
}: PermissionsMatrixProps) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [pendingGrants, setPendingGrants] = useState<Record<string, boolean> | null>(null);

  const { data: dbRow, isLoading } = useQuery({
    queryKey: ["permission_overrides", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permission_overrides")
        .select("module_grants")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const grants: Record<string, boolean> =
    pendingGrants ?? (dbRow?.module_grants as Record<string, boolean> | null) ?? {};

  function toggleCell(moduleId: ModuleId, action: ActionId) {
    if (readonly) return;
    const key = `${moduleId}:${action}`;
    const current = getEffectivePermission(userRole, userDepartment, moduleId, action, grants);
    setPendingGrants((prev) => ({ ...(prev ?? grants), [key]: !current.granted }));
  }

  async function handleSave() {
    if (!pendingGrants) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("permission_overrides")
        .upsert({ user_id: userId, module_grants: pendingGrants }, { onConflict: "user_id" });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["permission_overrides", userId] });
      setPendingGrants(null);
      toast.success("Permissions saved.");
      onSaved?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save permissions.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("permission_overrides")
        .upsert({ user_id: userId, module_grants: {} }, { onConflict: "user_id" });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["permission_overrides", userId] });
      setPendingGrants(null);
      toast.success("Permissions reset to defaults.");
      onSaved?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reset permissions.");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 120, color: "var(--neuron-ink-muted)" }}>
        <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  const isDirty = pendingGrants !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ border: "1px solid var(--neuron-ui-border)", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 160 }} />
            {PERM_ACTIONS.map((a) => <col key={a} style={{ width: 40 }} />)}
          </colgroup>
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1px solid var(--neuron-ui-border)" }}>
              <th style={{ textAlign: "left", padding: "6px 12px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--neuron-ink-muted)", borderRight: "1px solid var(--neuron-ui-border)" }}>
                Module
              </th>
              {PERM_ACTIONS.map((action) => (
                <th key={action} style={{ textAlign: "center", padding: "6px 4px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--neuron-ink-muted)", borderRight: "1px solid var(--neuron-ui-border)" }}>
                  {ACTION_LABELS[action]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((group) => {
              const groupModules = PERM_MODULES.filter((m) => m.group === group);
              return (
                <>
                  <tr key={`group-${group}`} style={{ background: "#F9FAFB", borderTop: "1px solid var(--neuron-ui-border)" }}>
                    <td colSpan={PERM_ACTIONS.length + 1} style={{ padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "var(--neuron-ink-primary)", letterSpacing: "0.01em" }}>
                      {group}
                    </td>
                  </tr>
                  {groupModules.map((mod) => (
                    <tr
                      key={mod.id}
                      style={{ background: "var(--neuron-bg-elevated, #fff)", borderTop: "1px solid var(--neuron-ui-border)" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = "#F9FAFB")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = "var(--neuron-bg-elevated, #fff)")}
                    >
                      <td style={{ padding: "6px 12px", fontSize: 13, color: "var(--neuron-ink-primary)", borderRight: "1px solid var(--neuron-ui-border)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {mod.label}
                      </td>
                      {PERM_ACTIONS.map((action) => {
                        const { granted, isCustom } = getEffectivePermission(
                          userRole, userDepartment, mod.id as ModuleId, action, grants
                        );
                        return (
                          <PermCell
                            key={action}
                            granted={granted}
                            isCustom={isCustom}
                            readonly={readonly}
                            onToggle={() => toggleCell(mod.id as ModuleId, action)}
                          />
                        );
                      })}
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {!readonly && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 6, border: "none",
              background: isDirty && !saving ? "#0F766E" : "#E5E9F0",
              color: isDirty && !saving ? "#fff" : "#667085",
              fontSize: 13, fontWeight: 500,
              cursor: isDirty && !saving ? "pointer" : "not-allowed",
            }}
          >
            {saving && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
            Save Changes
          </button>
          <button
            onClick={handleReset}
            disabled={saving}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 6,
              border: "1px solid var(--neuron-ui-border)",
              background: "transparent", color: "var(--neuron-ink-muted)",
              fontSize: 13, fontWeight: 500,
              cursor: saving ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => !saving && ((e.currentTarget as HTMLButtonElement).style.background = "#F9FAFB")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "transparent")}
          >
            Reset to Defaults
          </button>
        </div>
      )}
    </div>
  );
}
