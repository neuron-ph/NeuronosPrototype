import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../../utils/supabase/client";
import { toast } from "sonner@2.0.3";
import { useUser } from "../../../hooks/useUser";
import {
  Plus, ArrowLeft, Save, Trash2, UserCheck, AlertTriangle, BookMarked, Search, X, ChevronUp,
} from "lucide-react";
import { DataTable, type ColumnDef } from "../../common/DataTable";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../ui/alert-dialog";
import { PermissionGrantEditor } from "./PermissionGrantEditor";
import type { AccessProfile, AccessProfileSummary, ModuleGrants } from "./accessProfileTypes";
import { cloneGrants, countGrantOverrides, normalizeProfileName } from "./accessGrantUtils";
import type { ConfigUser } from "../AccessConfiguration";
import { SidePanel } from "../../common/SidePanel";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccessProfilesProps {
  onConfigureAccess: (user: ConfigUser) => void;
  onEditProfile: (profile: Partial<AccessProfile> | null) => void;
}

const DEPARTMENTS = [
  "Business Development", "Pricing", "Operations", "Accounting", "Executive", "HR",
] as const;

const ROLES = [
  { value: "staff",       label: "Staff" },
  { value: "team_leader", label: "Team Leader" },
  { value: "supervisor",  label: "Supervisor" },
  { value: "manager",     label: "Manager" },
  { value: "executive",   label: "Executive" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Apply To User Dialog ──────────────────────────────────────────────────────

interface UserOption {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
}

function ApplyProfileContent({
  profile,
  onClose,
  onApplied,
}: {
  profile: AccessProfileSummary;
  onClose: () => void;
  onApplied: (userId: string) => void;
}) {
  const { user: currentUser } = useUser();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UserOption | null>(null);
  const [applying, setApplying] = useState(false);
  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["users", "active-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("users")
        .select("id, name, email, department, role")
        .eq("is_active", true)
        .order("name");
      return (data ?? []) as UserOption[];
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter(u =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, search]);

  const mismatchWarning = useMemo(() => {
    if (!selected) return null;
    const warnings: string[] = [];
    if (profile.target_department && profile.target_department !== selected.department) {
      warnings.push(`department (profile targets ${profile.target_department}, user is in ${selected.department})`);
    }
    if (profile.target_role && profile.target_role !== selected.role) {
      warnings.push(`role (profile targets ${profile.target_role}, user is ${selected.role})`);
    }
    return warnings.length > 0 ? warnings.join(" and ") : null;
  }, [selected, profile]);

  const handleApply = async () => {
    if (!selected) return;
    setApplying(true);
    const { error } = await supabase.from("permission_overrides").upsert(
      {
        user_id: selected.id,
        scope: "department_wide",
        module_grants: cloneGrants(profile.module_grants),
        applied_profile_id: profile.id,
        granted_by: currentUser?.id ?? null,
        notes: `Applied access profile: ${profile.name}`,
      },
      { onConflict: "user_id" },
    );
    setApplying(false);
    if (error) {
      toast.error("Failed to apply profile");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["permission_overrides"] });
    queryClient.invalidateQueries({ queryKey: ["permission_overrides", "access-summary"] });
    queryClient.invalidateQueries({ queryKey: ["permission_overrides", "module_grants", selected.id] });
    toast.success(`Profile "${profile.name}" applied to ${selected.name}`);
    try {
      await (supabase as any).from("permission_audit_log").insert({
        target_user_id: selected.id,
        changed_by: currentUser?.name || currentUser?.email || "unknown",
        changes: {
          action: "access_profile_applied",
          profile_id: profile.id,
          profile_name: profile.name,
          changed_keys: Object.keys(profile.module_grants),
        },
      });
    } catch { console.warn("[AccessProfiles] audit log failed") }
    onApplied(selected.id);
    onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "16px 24px 12px", flexShrink: 0 }}>
        <p style={{ fontSize: 13, color: "var(--neuron-ink-muted)", margin: "0 0 10px" }}>
          Select a user to apply <strong style={{ color: "var(--neuron-ink-primary)" }}>{profile.name}</strong>.
          This will overwrite their current access overrides.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 10px", height: 34, borderRadius: 8, border: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--neuron-bg-elevated)" }}>
          <Search size={13} style={{ color: "var(--neuron-ink-muted)", flexShrink: 0 }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search users…"
            autoFocus
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, color: "var(--neuron-ink-primary)" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ display: "flex", alignItems: "center", border: "none", background: "none", cursor: "pointer", color: "var(--neuron-ink-muted)", padding: 0 }}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {filtered.slice(0, 30).map(u => (
            <button
              key={u.id}
              onClick={() => setSelected(u)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer", textAlign: "left",
                backgroundColor: selected?.id === u.id ? "color-mix(in oklch, var(--neuron-action-primary) 10%, transparent)" : "transparent",
                transition: "background-color 0.12s",
              }}
              onMouseEnter={e => { if (selected?.id !== u.id) e.currentTarget.style.backgroundColor = "var(--neuron-bg-surface-subtle)"; }}
              onMouseLeave={e => { if (selected?.id !== u.id) e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <div style={{ width: 30, height: 30, borderRadius: "50%", backgroundColor: "var(--neuron-bg-surface-subtle)", border: "1.5px solid var(--neuron-ui-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "var(--neuron-ink-muted)", flexShrink: 0 }}>
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", lineHeight: 1.3 }}>{u.name}</div>
                <div style={{ fontSize: 11, color: "var(--neuron-ink-muted)" }}>{u.department} · {u.role.replaceAll("_", " ")}</div>
              </div>
              {selected?.id === u.id && (
                <div style={{ marginLeft: "auto", width: 16, height: 16, borderRadius: "50%", backgroundColor: "var(--neuron-action-primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: "16px", textAlign: "center", fontSize: 13, color: "var(--neuron-ink-muted)" }}>No users found</div>
          )}
        </div>
      </div>

      {mismatchWarning && (
        <div style={{ margin: "0 24px", padding: "8px 12px", borderRadius: 8, backgroundColor: "var(--theme-status-warning-bg)", border: "1px solid color-mix(in oklch, var(--theme-status-warning-fg) 40%, transparent)", display: "flex", alignItems: "flex-start", gap: 8, flexShrink: 0 }}>
          <AlertTriangle size={13} style={{ color: "var(--theme-status-warning-fg)", flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: "var(--theme-status-warning-fg)" }}>
            Mismatch in {mismatchWarning}. You can still apply the profile.
          </span>
        </div>
      )}

      <div style={{ flexShrink: 0, padding: "12px 24px 20px", borderTop: "1px solid var(--neuron-ui-border)", display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button
          onClick={onClose}
          style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--neuron-ui-border)", background: "transparent", color: "var(--neuron-ink-muted)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
        >
          Cancel
        </button>
        <button
          onClick={handleApply}
          disabled={!selected || applying}
          style={{
            padding: "7px 16px", borderRadius: 8, border: "none",
            background: selected ? "var(--neuron-action-primary)" : "var(--neuron-bg-surface-subtle)",
            color: selected ? "var(--neuron-action-primary-text)" : "var(--neuron-ink-muted)",
            fontSize: 13, fontWeight: 600, cursor: selected && !applying ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", gap: 6, opacity: applying ? 0.7 : 1,
          }}
        >
          <UserCheck size={13} />
          {applying ? "Applying…" : "Apply Profile"}
        </button>
      </div>
    </div>
  );
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

function DeleteProfileContent({
  profile,
  onClose,
  onDeleted,
}: {
  profile: AccessProfileSummary;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { user: currentUser } = useUser();
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.from("access_profiles").delete().eq("id", profile.id);
    if (error) {
      setDeleting(false);
      toast.error("Failed to delete profile");
      return;
    }
    try {
      await (supabase as any).from("permission_audit_log").insert({
        changed_by: currentUser?.name || currentUser?.email || "unknown",
        changes: {
          action: "access_profile_deleted",
          profile_id: profile.id,
          profile_name: profile.name,
        },
      });
    } catch { console.warn("[AccessProfiles] audit log failed") }
    setDeleting(false);
    queryClient.invalidateQueries({ queryKey: ["access_profiles"] });
    queryClient.invalidateQueries({ queryKey: ["permission_overrides", "access-summary"] });
    toast.success(`Profile "${profile.name}" deleted`);
    onDeleted();
    onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, padding: 24 }}>
        <p style={{ fontSize: 13, color: "var(--neuron-ink-muted)", margin: 0, lineHeight: 1.5 }}>
          Are you sure you want to delete <strong style={{ color: "var(--neuron-ink-primary)" }}>{profile.name}</strong>?
        </p>
        <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", margin: "8px 0 0", lineHeight: 1.5 }}>
          Users who had this profile applied will keep their current access rules unchanged. The profile reference will be cleared.
        </p>
      </div>
      <div style={{ flexShrink: 0, padding: "12px 24px 20px", borderTop: "1px solid var(--neuron-ui-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          onClick={onClose}
          style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--neuron-ui-border)", background: "transparent", color: "var(--neuron-ink-muted)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "var(--neuron-semantic-error, #dc2626)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6 }}
        >
          <Trash2 size={13} />
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}

// ─── Profile Editor ───────────────────────────────────────────────────────────

export function ProfileEditor({
  profile,
  onBack,
  onSaved,
}: {
  profile: Partial<AccessProfile> | null;
  onBack: () => void;
  onSaved: () => void;
}) {
  const { user: currentUser } = useUser();
  const queryClient = useQueryClient();
  const isNew = !profile?.id;

  const [name, setName] = useState(profile?.name ?? "");
  const [description, setDescription] = useState(profile?.description ?? "");
  const [targetDepartment, setTargetDepartment] = useState(profile?.target_department ?? "");
  const [targetRole, setTargetRole] = useState(profile?.target_role ?? "");
  const [grants, setGrants] = useState<ModuleGrants>(profile?.module_grants ?? {});
  const [savedGrants, setSavedGrants] = useState<ModuleGrants>(profile?.module_grants ?? {});
  const [savedName, setSavedName] = useState(profile?.name ?? "");
  const [savedDescription, setSavedDescription] = useState(profile?.description ?? "");
  const [savedTargetDepartment, setSavedTargetDepartment] = useState(profile?.target_department ?? "");
  const [savedTargetRole, setSavedTargetRole] = useState(profile?.target_role ?? "");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [metaOpen, setMetaOpen] = useState(isNew);
  const [showBaseline, setShowBaseline] = useState(false);
  const [emptyGrantsWarning, setEmptyGrantsWarning] = useState(false);
  const [confirmExitOpen, setConfirmExitOpen] = useState(false);
  const prevGrantsRef = useRef<ModuleGrants>({});

  const isDirty = useMemo(() => {
    if (name !== savedName) return true;
    if (description !== savedDescription) return true;
    if (targetDepartment !== savedTargetDepartment) return true;
    if (targetRole !== savedTargetRole) return true;
    const gk = Object.keys(grants), sk = Object.keys(savedGrants);
    if (gk.length !== sk.length) return true;
    return gk.some(k => grants[k] !== savedGrants[k]);
  }, [name, savedName, description, savedDescription, targetDepartment, savedTargetDepartment, targetRole, savedTargetRole, grants, savedGrants]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleBack = () => {
    if (!isDirty) { onBack(); return; }
    setConfirmExitOpen(true);
  };

  const handleClearAll = () => {
    prevGrantsRef.current = { ...grants };
    setGrants({});
    toast("Access rules cleared.", {
      action: { label: "Undo", onClick: () => setGrants(prevGrantsRef.current) },
      duration: 5000,
    });
  };

  const canShowBaseline = !!targetRole && !!targetDepartment;
  const grantCount = countGrantOverrides(grants);

  const handleSave = async () => {
    const trimmed = normalizeProfileName(name);
    if (!trimmed) { setNameError("Profile name is required"); return; }
    setNameError("");

    if (Object.keys(grants).length === 0 && !emptyGrantsWarning) {
      setEmptyGrantsWarning(true);
      return;
    }
    setEmptyGrantsWarning(false);

    setSaving(true);

    const now = new Date().toISOString();
    let error: any;

    if (isNew) {
      ({ error } = await supabase.from("access_profiles").insert({
        name: trimmed,
        description: description.trim() || null,
        target_department: targetDepartment || null,
        target_role: targetRole || null,
        module_grants: grants,
        created_by: currentUser?.id ?? null,
        updated_by: currentUser?.id ?? null,
      }));
    } else {
      ({ error } = await supabase.from("access_profiles").update({
        name: trimmed,
        description: description.trim() || null,
        target_department: targetDepartment || null,
        target_role: targetRole || null,
        module_grants: grants,
        updated_by: currentUser?.id ?? null,
        updated_at: now,
      }).eq("id", profile!.id!));
    }

    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        setNameError("A profile with this name already exists");
      } else {
        toast.error("Failed to save profile");
      }
      return;
    }

    // Audit log
    try {
      await (supabase as any).from("permission_audit_log").insert({
        changed_by: currentUser?.name || currentUser?.email || "unknown",
        changes: {
          action: isNew ? "access_profile_created" : "access_profile_updated",
          profile_name: trimmed,
          changed_keys: Object.keys(grants),
        },
      });
    } catch { console.warn("[AccessProfiles] audit log failed") }

    queryClient.invalidateQueries({ queryKey: ["access_profiles"] });
    queryClient.invalidateQueries({ queryKey: ["permission_overrides", "access-summary"] });
    toast.success(isNew ? "Profile created" : "Profile saved");
    setName(trimmed);
    setSavedGrants(grants);
    setSavedName(trimmed);
    setSavedDescription(description);
    setSavedTargetDepartment(targetDepartment);
    setSavedTargetRole(targetRole);
    onSaved();
  };

  return (
    <div>
      {/* Editor top bar — sticky so Save is always reachable while scrolling */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 0", gap: 16, flexWrap: "wrap",
        backgroundColor: "var(--neuron-bg-elevated)",
        borderBottom: "1px solid var(--neuron-ui-border)",
        marginBottom: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <button
            onClick={handleBack}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--neuron-ui-border)", background: "transparent", color: "var(--neuron-ink-muted)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
          >
            <ArrowLeft size={13} /> Back
          </button>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--neuron-ink-primary)", margin: 0 }}>
              {isNew ? "New Profile" : `Edit: ${savedName}`}
            </h2>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isDirty && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--theme-status-warning-fg)", padding: "5px 10px", borderRadius: 8, backgroundColor: "var(--theme-status-warning-bg)" }}>
              <AlertTriangle size={12} /> Unsaved changes
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            style={{
              height: 34, padding: "0 16px", borderRadius: 8,
              background: isDirty ? "var(--neuron-action-primary)" : "var(--neuron-bg-surface-subtle)",
              border: "none",
              color: isDirty ? "var(--neuron-action-primary-text)" : "var(--neuron-ink-muted)",
              fontSize: 13, fontWeight: 600, cursor: isDirty && !saving ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", gap: 6, opacity: saving ? 0.7 : 1,
            }}
          >
            <Save size={13} />
            {saving ? "Saving…" : isNew ? "Create Profile" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Collapsed metadata summary bar */}
      {!metaOpen && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
          marginBottom: 14, borderRadius: 8, border: "1px solid var(--neuron-ui-border)",
          backgroundColor: "var(--neuron-bg-surface-subtle)" }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", flex: 1, minWidth: 0,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {name || "Untitled profile"}
            {targetDepartment && (
              <span style={{ color: "var(--neuron-ink-muted)", fontWeight: 400 }}> · {targetDepartment}</span>
            )}
            {targetRole && (
              <span style={{ color: "var(--neuron-ink-muted)", fontWeight: 400 }}>
                {" / "}{ROLES.find(r => r.value === targetRole)?.label ?? targetRole}
              </span>
            )}
          </span>
          <button onClick={() => setMetaOpen(true)} style={{ fontSize: 12, color: "var(--neuron-action-primary)",
            border: "none", background: "none", cursor: "pointer", flexShrink: 0, padding: "2px 4px" }}>
            Edit details
          </button>
        </div>
      )}

      {/* Profile metadata — collapsible */}
      <div style={{
        display: "grid",
        gridTemplateRows: metaOpen ? "1fr" : "0fr",
        transition: "grid-template-rows 0.24s cubic-bezier(0.16,1,0.3,1)",
        marginBottom: metaOpen ? 0 : 0,
      }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20, padding: "16px 16px 20px", borderRadius: 10, border: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--neuron-bg-surface-subtle)" }}>
            {/* Header row: label + Collapse button */}
            <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Profile Name *
              </label>
              <button
                onClick={() => setMetaOpen(false)}
                style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--neuron-ink-muted)", border: "none", background: "none", cursor: "pointer", padding: "2px 4px" }}
              >
                Collapse <ChevronUp size={12} />
              </button>
            </div>
            {/* Name input */}
            <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 4 }}>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setNameError(""); }}
                placeholder="e.g. BD Manager, Ops Supervisor"
                autoFocus={isNew}
                style={{
                  padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                  border: `1px solid ${nameError ? "var(--neuron-semantic-error, #dc2626)" : "var(--neuron-ui-border)"}`,
                  background: "var(--neuron-bg-elevated)", color: "var(--neuron-ink-primary)", outline: "none",
                }}
              />
              {nameError && <span style={{ fontSize: 11, color: "var(--neuron-semantic-error, #dc2626)" }}>{nameError}</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Description</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional description"
                style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, border: "1px solid var(--neuron-ui-border)", background: "var(--neuron-bg-elevated)", color: "var(--neuron-ink-primary)", outline: "none" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Target Department</label>
              <select
                value={targetDepartment}
                onChange={e => setTargetDepartment(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, border: "1px solid var(--neuron-ui-border)", background: "var(--neuron-bg-elevated)", color: "var(--neuron-ink-primary)", outline: "none" }}
              >
                <option value="">Any department</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Target Role</label>
              <select
                value={targetRole}
                onChange={e => setTargetRole(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, border: "1px solid var(--neuron-ui-border)", background: "var(--neuron-bg-elevated)", color: "var(--neuron-ink-primary)", outline: "none" }}
              >
                <option value="">Any role</option>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Grant count / controls row */}
      <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Access Rules</span>
        {grantCount > 0 && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 8px", borderRadius: 999,
            backgroundColor: "color-mix(in oklch, var(--neuron-action-primary) 12%, transparent)",
            color: "var(--neuron-action-primary)" }}>
            {grantCount} explicit rules
          </span>
        )}
        {canShowBaseline && (
          <button
            onClick={() => setShowBaseline(s => !s)}
            style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6,
              border: showBaseline ? "1.5px solid var(--neuron-action-primary)" : "1px solid var(--neuron-ui-border)",
              backgroundColor: showBaseline ? "color-mix(in oklch, var(--neuron-action-primary) 10%, transparent)" : "transparent",
              color: showBaseline ? "var(--neuron-action-primary)" : "var(--neuron-ink-muted)",
              cursor: "pointer" }}>
            {showBaseline ? "Hide baseline" : `Preview ${ROLES.find(r => r.value === targetRole)?.label} baseline`}
          </button>
        )}
        {emptyGrantsWarning && (
          <span style={{ fontSize: 11, color: "var(--theme-status-warning-fg)", display: "flex", alignItems: "center", gap: 4 }}>
            <AlertTriangle size={11} /> No rules set — click Save again to confirm
          </span>
        )}
        {grantCount > 0 && (
          <button onClick={handleClearAll} style={{ fontSize: 11, color: "var(--neuron-semantic-error, #dc2626)",
            border: "none", background: "none", cursor: "pointer", padding: "2px 0", marginLeft: "auto",
            textDecoration: "underline", textUnderlineOffset: 2, opacity: 0.8 }}>
            Clear all
          </button>
        )}
      </div>

      {/* Grant editor */}
      <PermissionGrantEditor
        grants={grants}
        onChange={(nextGrants) => setGrants(nextGrants)}
        showInheritedBaseline={showBaseline && canShowBaseline}
        baselineRole={targetRole}
        baselineDepartment={targetDepartment}
      />

      {/* Exit confirmation — uses the standard AlertDialog, same as delete confirmations */}
      <AlertDialog open={confirmExitOpen} onOpenChange={setConfirmExitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this profile. Going back will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={onBack}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard & go back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── AccessProfiles (main) ────────────────────────────────────────────────────

export function AccessProfiles({ onConfigureAccess: _onConfigureAccess, onEditProfile }: AccessProfilesProps) {
  const [applyingProfile, setApplyingProfile] = useState<AccessProfileSummary | null>(null);
  const [deletingProfile, setDeletingProfile] = useState<AccessProfileSummary | null>(null);

  const { data: profiles = [], isLoading } = useQuery<AccessProfileSummary[]>({
    queryKey: ["access_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_profiles")
        .select("id, name, description, target_department, target_role, module_grants, updated_at")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as AccessProfileSummary[];
    },
    staleTime: 60_000,
  });

  const columns: ColumnDef<AccessProfileSummary>[] = [
    {
      header: "Profile Name",
      accessorKey: "name",
      cell: (row) => (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--neuron-ink-primary)" }}>{row.name}</div>
          {row.description && (
            <div style={{ fontSize: 11, color: "var(--neuron-ink-muted)", marginTop: 1 }}>{row.description}</div>
          )}
        </div>
      ),
    },
    {
      header: "Target",
      accessorKey: "target_department",
      cell: (row) => {
        if (!row.target_department && !row.target_role) {
          return <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)", fontStyle: "italic" }}>Any</span>;
        }
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {row.target_department && (
              <span style={{ fontSize: 11, fontWeight: 500, padding: "1px 7px", borderRadius: 999, backgroundColor: "var(--neuron-bg-surface-subtle)", color: "var(--neuron-ink-secondary, var(--neuron-ink-muted))", width: "fit-content" }}>
                {row.target_department}
              </span>
            )}
            {row.target_role && (
              <span style={{ fontSize: 11, color: "var(--neuron-ink-muted)" }}>
                {ROLES.find(r => r.value === row.target_role)?.label ?? row.target_role}
              </span>
            )}
          </div>
        );
      },
    },
    {
      header: "Access Rules",
      accessorKey: "module_grants",
      cell: (row) => {
        const count = countGrantOverrides(row.module_grants);
        return (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "1px 8px", borderRadius: 999,
            backgroundColor: count > 0 ? "color-mix(in oklch, var(--neuron-action-primary) 12%, transparent)" : "var(--neuron-bg-surface-subtle)",
            color: count > 0 ? "var(--neuron-action-primary)" : "var(--neuron-ink-muted)",
          }}>
            {count > 0 ? `${count} rules` : "Empty"}
          </span>
        );
      },
    },
    {
      header: "Last Updated",
      accessorKey: "updated_at",
      cell: (row) => <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>{formatDate(row.updated_at)}</span>,
    },
    {
      header: "Actions",
      accessorKey: "id",
      cell: (row) => (
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => onEditProfile(row as unknown as Partial<AccessProfile>)}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--neuron-ui-border)", background: "transparent", fontSize: 12, fontWeight: 500, color: "var(--neuron-ink-muted)", cursor: "pointer" }}
          >
            Edit
          </button>
          <button
            onClick={() => onEditProfile({
              ...row as unknown as Partial<AccessProfile>,
              id: undefined,
              name: `${row.name} (Copy)`,
            })}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--neuron-ui-border)",
              background: "transparent", fontSize: 12, fontWeight: 500, color: "var(--neuron-ink-muted)",
              cursor: "pointer" }}
          >
            Duplicate
          </button>
          <button
            onClick={() => setApplyingProfile(row)}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--neuron-ui-border)", background: "transparent", fontSize: 12, fontWeight: 500, color: "var(--neuron-action-primary)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
          >
            <UserCheck size={12} /> Apply
          </button>
          <button
            onClick={() => setDeletingProfile(row)}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--neuron-ui-border)", background: "transparent", fontSize: 12, fontWeight: 500, color: "var(--neuron-ink-muted)", cursor: "pointer" }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <BookMarked size={16} style={{ color: "var(--neuron-action-primary)" }} />
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--neuron-ink-primary)", margin: 0 }}>Access Profiles</h2>
          </div>
          <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", margin: 0 }}>
            Saved access rule templates. Apply them to users as a one-time snapshot — editing a profile does not affect users who already received it.
          </p>
        </div>
        <button
          onClick={() => onEditProfile(null)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--neuron-action-primary)", color: "var(--neuron-action-primary-text)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          <Plus size={14} /> New Profile
        </button>
      </div>

      {/* Profile list */}
      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse" style={{ height: 60, borderRadius: 8, backgroundColor: "var(--neuron-bg-surface-subtle)" }} />
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", border: "1px dashed var(--neuron-ui-border)", borderRadius: 12 }}>
          <BookMarked size={32} style={{ color: "var(--neuron-ui-border)", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 14, fontWeight: 500, color: "var(--neuron-ink-muted)", margin: "0 0 4px" }}>No access profiles yet</p>
          <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", margin: "0 0 16px" }}>
            Create profiles like "BD Manager" or "Ops Supervisor" to quickly assign access rules to new or promoted users.
          </p>
          <button
            onClick={() => onEditProfile(null)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--neuron-action-primary)", color: "var(--neuron-action-primary-text)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            <Plus size={14} /> Create First Profile
          </button>
        </div>
      ) : (
        <DataTable
          data={profiles}
          columns={columns}
        />
      )}

      <SidePanel
        isOpen={!!applyingProfile}
        onClose={() => setApplyingProfile(null)}
        size="sm"
        title="Apply Profile"
      >
        {applyingProfile && (
          <ApplyProfileContent
            profile={applyingProfile}
            onClose={() => setApplyingProfile(null)}
            onApplied={() => setApplyingProfile(null)}
          />
        )}
      </SidePanel>

      <SidePanel
        isOpen={!!deletingProfile}
        onClose={() => setDeletingProfile(null)}
        size="sm"
        title="Delete Profile"
      >
        {deletingProfile && (
          <DeleteProfileContent
            profile={deletingProfile}
            onClose={() => setDeletingProfile(null)}
            onDeleted={() => setDeletingProfile(null)}
          />
        )}
      </SidePanel>
    </div>
  );
}
