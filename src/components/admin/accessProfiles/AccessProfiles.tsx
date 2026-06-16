import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { supabase } from "../../../utils/supabase/client";
import { toast } from "sonner@2.0.3";
import { useUser } from "../../../hooks/useUser";
import { usePermission } from "../../../context/PermissionProvider";
import {
  Plus, ArrowLeft, Save, Trash2, UserCheck, AlertTriangle, BookMarked, Search, X, ChevronUp, Wand2,
} from "lucide-react";
import { DataTable, type ColumnDef } from "../../common/DataTable";
import { NeuronModal } from "../../ui/NeuronModal";
import type { AccessProfile, AccessProfileSummary, ModuleGrants, VisibilityScope } from "./accessProfileTypes";
import {
  cloneGrants,
  countGrantOverrides,
  normalizeProfileName,
  resolveProfileVisibilityScope,
  resolveCascadedGrants,
} from "./accessGrantUtils";
import type { ConfigUser } from "../AccessConfiguration";
import { SidePanel } from "../../common/SidePanel";
import { PERM_MODULES } from "../permissionsConfig";
import { AccessEditorTabs } from "./AccessEditorTabs";
import { legacyScopeFromMap, type RecordVisibilityMap } from "./recordVisibilityConfig";

// Operations service tags for access profiles. Distinct from the booking
// service-type enum: Marine Insurance is owned by Pricing (not an Operations
// service), and Others — though shared with Pricing — remains an Operations
// service here.
const OPERATIONS_ACCESS_SERVICES = ["Forwarding", "Brokerage", "Trucking", "Others"] as const;

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

function formatRole(role: string): string {
  return ROLES.find(r => r.value === role)?.label
    ?? role.split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
}

// ─── Apply Profile Modal ──────────────────────────────────────────────────────

function ApplyProfileModal({
  profile,
  onClose,
  onApplied,
}: {
  profile: AccessProfileSummary | null;
  onClose: () => void;
  onApplied: (userId: string) => void;
}) {
  const reduced = useReducedMotion();

  const overlayVariants = {
    hidden:  { opacity: 0 },
    visible: { opacity: 1, transition: { duration: reduced ? 0 : 0.18, ease: "easeOut" as const } },
    exit:    { opacity: 0, transition: { duration: reduced ? 0 : 0.14, ease: "easeIn" as const } },
  };
  const cardVariants = {
    hidden:  { opacity: 0, scale: reduced ? 1 : 0.97, y: reduced ? 0 : 10 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visible: { opacity: 1, scale: 1, y: 0, transition: { duration: reduced ? 0 : 0.26, ease: [0.16, 1, 0.3, 1] as any } },
    exit:    { opacity: 0, scale: reduced ? 1 : 0.98, y: reduced ? 0 : 4, transition: { duration: reduced ? 0 : 0.16, ease: "easeIn" as const } },
  };

  useEffect(() => {
    if (!profile) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [profile, onClose]);

  const ruleCount = profile ? countGrantOverrides(profile.module_grants) : 0;

  return createPortal(
    <AnimatePresence>
      {profile && (
        <motion.div
          key="apply-profile-overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px",
            backgroundColor: "rgba(18, 51, 43, 0.38)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
          }}
        >
          <motion.div
            key="apply-profile-card"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="apply-profile-title"
            style={{
              width: "100%",
              maxWidth: "680px",
              height: "min(640px, 90vh)",
              backgroundColor: "var(--theme-bg-surface)",
              border: "1px solid var(--theme-border-default)",
              borderRadius: "12px",
              boxShadow: "0 16px 48px 0 rgba(16, 24, 20, 0.18), 0 2px 8px 0 rgba(16, 24, 20, 0.08)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{
              borderBottom: "1px solid var(--neuron-ui-border)",
              padding: "20px 24px 18px",
              flexShrink: 0,
            }}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2
                    id="apply-profile-title"
                    className="text-[18px] font-semibold text-[var(--neuron-ink-primary)] leading-tight m-0 truncate"
                  >
                    {profile.name}
                  </h2>
                  <p className="m-0 mt-1.5 text-[12px] text-[var(--neuron-ink-muted)]">
                    {[
                      profile.target_department ?? null,
                      profile.target_role ? formatRole(profile.target_role) : null,
                    ].filter(Boolean).join(" · ")}
                    {(profile.target_department || profile.target_role) && ruleCount > 0 && " · "}
                    {ruleCount > 0 && (
                      <span style={{ color: "var(--neuron-action-primary)", fontWeight: 600 }}>
                        {ruleCount} {ruleCount === 1 ? "permission" : "permissions"}
                      </span>
                    )}
                    {!profile.target_department && !profile.target_role && ruleCount === 0 && (
                      <span className="italic">Any department · any role</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="flex items-center justify-center w-7 h-7 rounded-md bg-transparent border-none cursor-pointer text-[var(--neuron-ink-muted)] hover:bg-[var(--neuron-bg-surface-subtle)] transition-colors shrink-0 mt-0.5"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <ApplyProfileContent profile={profile} onClose={onClose} onApplied={onApplied} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ─── Apply To User Dialog ──────────────────────────────────────────────────────

interface UserOption {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  avatar_url: string | null;
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
  const { can } = usePermission();
  // WG-02: applying a profile writes permission_overrides for other users
  const canApplyProfiles = can("admin_access_profiles_tab", "edit");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UserOption[]>([]);
  const [applying, setApplying] = useState(false);
  const queryClient = useQueryClient();

  const { data: users = [], isLoading: usersLoading } = useQuery<UserOption[]>({
    queryKey: ["users", "active-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("users")
        .select("id, name, email, department, role, avatar_url")
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

  const visible = filtered.slice(0, 30);
  const hasMore = filtered.length > 30;

  function hasMismatch(u: UserOption): boolean {
    if (profile.target_department && profile.target_department !== u.department) return true;
    if (profile.target_role && profile.target_role !== u.role) return true;
    return false;
  }

  function getMismatchTooltip(u: UserOption): string | null {
    const parts: string[] = [];
    if (profile.target_department && profile.target_department !== u.department)
      parts.push(`department: ${u.department} vs. ${profile.target_department}`);
    if (profile.target_role && profile.target_role !== u.role)
      parts.push(`role: ${formatRole(u.role)} vs. ${formatRole(profile.target_role)}`);
    return parts.length > 0 ? `Outside target — ${parts.join(", ")}` : null;
  }

  function toggleUser(u: UserOption) {
    setSelected(prev =>
      prev.some(s => s.id === u.id) ? prev.filter(s => s.id !== u.id) : [...prev, u]
    );
  }

  const mismatchCount = useMemo(
    () => selected.filter(u => hasMismatch(u)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, profile],
  );

  const handleApply = async () => {
    if (selected.length === 0) return;
    if (!canApplyProfiles) return; // WG-02 backstop: Apply writes permission_overrides
    setApplying(true);
    let failed = 0;

    // Materialize: an access profile is only a TEMPLATE. Applying it stamps the
    // profile's full, self-contained grant set + dials onto the user's own access
    // config (permission_overrides) — that per-user row is what enforcement reads,
    // so the grants actually take effect regardless of the profile link.
    const fullGrants = resolveCascadedGrants(profile.module_grants ?? {}, PERM_MODULES);
    for (const u of selected) {
      const { error } = await supabase.from("permission_overrides").upsert(
        {
          user_id: u.id,
          scope: profile.visibility_scope ?? "department",
          departments: profile.visibility_scope === "selected_departments"
            ? (profile.visibility_departments ?? [])
            : null,
          module_grants: fullGrants,
          visibility_scopes: profile.visibility_scopes ?? {},
          applied_profile_id: profile.id,
          granted_by: currentUser?.id ?? null,
          notes: `Applied access profile: ${profile.name}`,
        },
        { onConflict: "user_id" },
      );
      if (error) {
        failed++;
        continue;
      }
      // Best-effort: keep users.access_profile_id (the "Based on" label + absent-key
      // fallback) aligned. NOT load-bearing — the materialized grants above are
      // authoritative — and an RLS-blocked update returns 0 rows with no error, so
      // never let it fail the apply.
      await supabase.from("users").update({ access_profile_id: profile.id }).eq("id", u.id);
      queryClient.invalidateQueries({ queryKey: ["permission_overrides", "module_grants", u.id] });
      try {
        await (supabase as any).from("permission_audit_log").insert({
          target_user_id: u.id,
          changed_by: currentUser?.name || currentUser?.email || "unknown",
          changes: {
            action: "access_profile_applied",
            profile_id: profile.id,
            profile_name: profile.name,
            changed_keys: Object.keys(profile.module_grants),
          },
        });
      } catch { console.warn("[AccessProfiles] audit log failed") }
      onApplied(u.id);
    }

    setApplying(false);
    queryClient.invalidateQueries({ queryKey: ["permission_overrides"], refetchType: "all" });
    queryClient.invalidateQueries({ queryKey: ["permission_overrides", "access-summary"], refetchType: "all" });

    const appliedCount = selected.length - failed;
    if (appliedCount === 0) {
      toast.error("Couldn't assign the profile to the selected user(s). Please try again.");
    } else if (failed > 0) {
      toast.warning(`Applied to ${appliedCount} of ${selected.length} users — ${failed} failed`);
    } else {
      const who = selected.length === 1 ? selected[0].name : `${appliedCount} users`;
      toast.success(`"${profile.name}" applied to ${who}`);
    }
    onClose();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-6 pt-5 pb-3 shrink-0">
        <div className="flex items-center gap-2 px-3 h-[36px] rounded-lg border border-[var(--neuron-ui-border)] bg-[var(--neuron-bg-elevated)] focus-within:border-[var(--neuron-action-primary)] transition-colors">
          <Search size={13} className="text-[var(--neuron-ink-muted)] shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            autoFocus
            aria-label="Search users"
            className="flex-1 border-none outline-none bg-transparent text-[13px] text-[var(--neuron-ink-primary)] placeholder:text-[var(--neuron-ink-muted)]"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="flex items-center bg-transparent border-none cursor-pointer text-[var(--neuron-ink-muted)] p-0 hover:text-[var(--neuron-ink-primary)] transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* User list */}
      <div className="flex-1 overflow-y-auto px-6 pt-1 pb-3">
        {usersLoading ? (
          <div className="flex flex-col">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="animate-pulse h-[56px] bg-[var(--neuron-bg-surface-subtle)]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Search size={20} className="text-[var(--neuron-ui-border)]" />
            <p className="text-[13px] text-[var(--neuron-ink-muted)] m-0">
              {search ? `No users match "${search}"` : "No active users found"}
            </p>
          </div>
        ) : (
          <>
            <div
              role="listbox"
              aria-label="Select users"
              aria-multiselectable="true"
              className="flex flex-col"
            >
              {visible.map(u => {
                const isSelected = selected.some(s => s.id === u.id);
                const mismatch = hasMismatch(u);
                const tooltip = getMismatchTooltip(u);
                return (
                  <button
                    key={u.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggleUser(u)}
                    title={tooltip ?? undefined}
                    className={`flex items-center gap-3 w-full px-3 py-3 border-x-0 border-t-0 cursor-pointer text-left transition-colors duration-[120ms] last:border-b-0${!isSelected ? " hover:bg-[var(--neuron-bg-surface-subtle)]" : ""}`}
                    style={{
                      borderBottomWidth: "1px",
                      borderBottomStyle: "solid",
                      borderBottomColor: "var(--neuron-ui-border)",
                      ...(isSelected ? { backgroundColor: "color-mix(in oklch, var(--neuron-action-primary) 8%, transparent)" } : {}),
                    }}
                  >
                    {/* Avatar */}
                    <div
                      aria-hidden="true"
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold shrink-0 overflow-hidden bg-[var(--neuron-bg-elevated)] text-[var(--neuron-ink-muted)] border border-[var(--neuron-ui-border)]"
                    >
                      {u.avatar_url
                        ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                        : u.name.charAt(0).toUpperCase()
                      }
                    </div>

                    {/* Name + dept + role */}
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-[var(--neuron-ink-primary)] leading-snug">{u.name}</div>
                      <div className="text-[11px] text-[var(--neuron-ink-muted)] mt-0.5">
                        {u.department} · {formatRole(u.role)}
                      </div>
                    </div>

                    {/* Mismatch indicator or checkmark */}
                    {mismatch && !isSelected && (
                      <AlertTriangle size={13} className="text-[var(--theme-status-warning-fg)] shrink-0" />
                    )}
                    {isSelected && (
                      <div
                        className="w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: "var(--neuron-action-primary)" }}
                      >
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {hasMore && (
              <p className="text-[11px] text-[var(--neuron-ink-muted)] text-center pt-3">
                Showing first 30 of {filtered.length} — search to narrow results
              </p>
            )}
          </>
        )}
      </div>

      {/* Mismatch warning */}
      {mismatchCount > 0 && (
        <div
          className="mx-6 mb-3 px-3 py-2 rounded-lg bg-[var(--theme-status-warning-bg)] flex items-start gap-2 shrink-0"
          style={{ border: "1px solid color-mix(in oklch, var(--theme-status-warning-fg) 40%, transparent)" }}
        >
          <AlertTriangle size={13} className="text-[var(--theme-status-warning-fg)] shrink-0 mt-px" />
          <span className="text-[12px] text-[var(--theme-status-warning-fg)] leading-snug">
            {mismatchCount === 1
              ? "1 selected user is outside this profile's target department or role — you can still apply."
              : `${mismatchCount} selected users are outside this profile's target — you can still apply.`
            }
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="shrink-0 px-6 pt-3 pb-5 border-t border-[var(--neuron-ui-border)] flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-[var(--neuron-ui-border)] bg-transparent text-[var(--neuron-ink-muted)] text-[13px] font-medium cursor-pointer hover:bg-[var(--neuron-bg-surface-subtle)] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleApply}
          disabled={selected.length === 0 || applying}
          className="px-4 py-2 rounded-lg border-none text-[13px] font-semibold flex items-center gap-1.5 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: selected.length > 0 ? "var(--neuron-action-primary)" : "var(--neuron-bg-surface-subtle)",
            color: selected.length > 0 ? "var(--neuron-action-primary-text)" : "var(--neuron-ink-muted)",
            cursor: selected.length > 0 && !applying ? "pointer" : "not-allowed",
          }}
        >
          <UserCheck size={13} />
          {applying
            ? "Applying…"
            : selected.length > 0
              ? `Apply to ${selected.length} ${selected.length === 1 ? "user" : "users"}`
              : "Apply Profile"
          }
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
  const { can } = usePermission();
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    if (!can("admin_access_profiles_tab", "delete")) return; // WG-02 backstop
    setDeleting(true);
    const { error } = await supabase.from("access_profiles").delete().eq("id", profile.id);
    if (error) {
      setDeleting(false);
      toast.error("Couldn't delete the profile. Please try again.");
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
    queryClient.invalidateQueries({ queryKey: ["access_profiles"], refetchType: "all" });
    queryClient.invalidateQueries({ queryKey: ["permission_overrides", "access-summary"], refetchType: "all" });
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
          People on this profile keep their current access unchanged; they just stop being linked to it.
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
  const { can } = usePermission();
  const queryClient = useQueryClient();
  const isNew = !profile?.id;
  // WG-02 backstop: entry buttons are gated, but the editor is also mounted from
  // UserManagement — the write itself re-checks the matching profile knob.
  const canWriteProfile = isNew
    ? can("admin_access_profiles_tab", "create")
    : can("admin_access_profiles_tab", "edit");

  const [name, setName] = useState(profile?.name ?? "");
  const [description, setDescription] = useState(profile?.description ?? "");
  const [targetDepartment, setTargetDepartment] = useState(profile?.target_department ?? "");
  const [targetRole, setTargetRole] = useState(profile?.target_role ?? "staff");
  const [targetService, setTargetService] = useState(profile?.target_service ?? "");
  const [visibilityScope, setVisibilityScope] = useState<VisibilityScope>(
    resolveProfileVisibilityScope(profile?.visibility_scope ?? null, profile?.target_role ?? "staff"),
  );
  const [visibilityDepartments, setVisibilityDepartments] = useState<string[]>(
    profile?.visibility_departments ?? [],
  );
  const [grants, setGrants] = useState<ModuleGrants>(profile?.module_grants ?? {});
  const [savedGrants, setSavedGrants] = useState<ModuleGrants>(profile?.module_grants ?? {});
  const [visibilityScopes, setVisibilityScopes] = useState<RecordVisibilityMap>(profile?.visibility_scopes ?? {});
  const [savedVisibilityScopes, setSavedVisibilityScopes] = useState<RecordVisibilityMap>(profile?.visibility_scopes ?? {});
  const [savedName, setSavedName] = useState(profile?.name ?? "");
  const [savedDescription, setSavedDescription] = useState(profile?.description ?? "");
  const [savedTargetDepartment, setSavedTargetDepartment] = useState(profile?.target_department ?? "");
  const [savedTargetRole, setSavedTargetRole] = useState(profile?.target_role ?? "staff");
  const [savedTargetService, setSavedTargetService] = useState(profile?.target_service ?? "");
  const [savedVisibilityScope, setSavedVisibilityScope] = useState<VisibilityScope>(
    resolveProfileVisibilityScope(profile?.visibility_scope ?? null, profile?.target_role ?? "staff"),
  );
  const [savedVisibilityDepartments, setSavedVisibilityDepartments] = useState<string[]>(
    profile?.visibility_departments ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [metaOpen, setMetaOpen] = useState(isNew);
  const [showBaseline, setShowBaseline] = useState(false);
  const [confirmExitOpen, setConfirmExitOpen] = useState(false);
  const [confirmAutofillOpen, setConfirmAutofillOpen] = useState(false);
  const [confirmEmptyOpen, setConfirmEmptyOpen] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const prevGrantsRef = useRef<ModuleGrants>({});
  // Blast radius: editing a profile changes live access for everyone assigned
  // to it — surface who that is, and confirm before saving onto them.
  const { data: assignedUsers = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["access_profiles", "assignees", profile?.id ?? "new"],
    enabled: !isNew,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, name")
        .eq("access_profile_id", profile!.id!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const assignedCount = assignedUsers.length;
  const { data: profiles = [] } = useQuery<AccessProfileSummary[]>({
    queryKey: ["access_profiles", "role-default-baselines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_profiles")
        .select("id, name, description, target_department, target_role, target_service, module_grants, visibility_scope, visibility_departments, visibility_scopes, updated_at")
        .eq("is_active", true)
        .eq("is_baseline", true);
      if (error) throw error;
      return (data ?? []) as AccessProfileSummary[];
    },
    staleTime: 60_000,
  });

  const isDirty = useMemo(() => {
    if (name !== savedName) return true;
    if (description !== savedDescription) return true;
    if (targetDepartment !== savedTargetDepartment) return true;
    if (targetRole !== savedTargetRole) return true;
    if (targetService !== savedTargetService) return true;
    if (visibilityScope !== savedVisibilityScope) return true;
    if (visibilityScope === "selected_departments") {
      if (visibilityDepartments.length !== savedVisibilityDepartments.length) return true;
      if (visibilityDepartments.some((department, index) => department !== savedVisibilityDepartments[index])) return true;
    }
    const gk = Object.keys(grants), sk = Object.keys(savedGrants);
    if (gk.length !== sk.length) return true;
    if (gk.some(k => grants[k] !== savedGrants[k])) return true;
    const vk = Object.keys(visibilityScopes), svk = Object.keys(savedVisibilityScopes);
    if (vk.length !== svk.length) return true;
    return vk.some(k => visibilityScopes[k] !== savedVisibilityScopes[k]);
  }, [
    description,
    grants,
    visibilityScopes,
    savedVisibilityScopes,
    name,
    savedDescription,
    savedGrants,
    savedName,
    savedTargetDepartment,
    savedTargetRole,
    savedTargetService,
    savedVisibilityDepartments,
    savedVisibilityScope,
    targetDepartment,
    targetRole,
    targetService,
    visibilityDepartments,
    visibilityScope,
  ]);

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

  const handleDiscard = () => {
    // The exit-confirm dialog was the deliberate second step — leave
    // immediately instead of stranding the admin until a toast expires.
    setConfirmExitOpen(false);
    toast("Changes discarded.");
    onBack();
  };

  const handleClearAll = () => {
    prevGrantsRef.current = { ...grants };
    setGrants({});
    toast("All permissions cleared.", {
      action: { label: "Undo", onClick: () => setGrants(prevGrantsRef.current) },
      duration: 5000,
    });
  };

  // Exact baseline seed for the chosen (department, role, service). Executive is
  // universal (department-agnostic); Operations keys on service; others key on
  // (department, role). Null until a confident match exists — so Operations
  // waits for a service before prefilling.
  const baselineProfile = useMemo(() => {
    if (targetRole === "executive") {
      return profiles.find((p) => p.target_role === "executive") ?? null;
    }
    if (!targetDepartment) return null;
    return profiles.find((p) =>
      p.target_role === targetRole &&
      p.target_department === targetDepartment &&
      (targetDepartment === "Operations" ? p.target_service === (targetService || null) : !p.target_service),
    ) ?? null;
  }, [profiles, targetRole, targetDepartment, targetService]);
  const baselineGrants = useMemo(
    () => cloneGrants(baselineProfile?.module_grants),
    [baselineProfile],
  );
  const canShowBaseline = !!baselineProfile;
  const grantCount = countGrantOverrides(grants);
  // Resolved (cascaded) feature-access grants — drives which record types are
  // reachable, so the Record Visibility tab greys what Feature Access can't open.
  const resolvedGrants = useMemo(
    () => resolveCascadedGrants(grants, PERM_MODULES) as Record<string, boolean>,
    [grants],
  );

  // Deliberate autofill: the admin presses "Autofill from baseline" to copy the
  // matching baseline seed's ticks + visibility into the form. Unlike a reactive
  // prefill, this never overwrites the admin's corrections when they tweak the
  // Role/Department/Service afterward — it only runs when explicitly invoked. If
  // explicit rules already exist, we confirm before overwriting them.
  const applyBaseline = () => {
    if (!baselineProfile) return;
    setGrants(cloneGrants(baselineProfile.module_grants));
    setVisibilityScope(
      resolveProfileVisibilityScope(baselineProfile.visibility_scope, baselineProfile.target_role ?? targetRole),
    );
    setVisibilityScopes({ ...(baselineProfile.visibility_scopes ?? {}) });
    const label = baselineProfile.name.replace(/^Baseline — /, "");
    toast(`Autofilled from "${label}" — adjust as needed.`, { duration: 3500 });
  };
  const handleApplyBaseline = () => {
    if (grantCount > 0) { setConfirmAutofillOpen(true); return; }
    applyBaseline();
  };

  // Validation gates run first; the actual write lives in performSave so the
  // empty-profile and update-N-people confirms can both funnel into it.
  const handleSave = () => {
    const trimmed = normalizeProfileName(name);
    if (!trimmed) { setNameError("Profile name is required"); return; }
    setNameError("");
    if (visibilityScope === "selected_departments" && visibilityDepartments.length === 0) {
      toast.error("Select at least one department for the selected visibility scope.");
      return;
    }
    if (Object.keys(grants).length === 0) { setConfirmEmptyOpen(true); return; }
    if (!isNew && assignedCount > 0) { setConfirmSaveOpen(true); return; }
    void performSave();
  };

  const performSave = async () => {
    if (!canWriteProfile) return; // WG-02 backstop
    const trimmed = normalizeProfileName(name);
    setConfirmEmptyOpen(false);
    setConfirmSaveOpen(false);
    setSaving(true);

    const now = new Date().toISOString();
    // NEU-012 (strict): cascade is a UX convenience — persist the fully RESOLVED
    // (explicit) grant set so what's stored == what the editor showed == what the
    // resolver enforces (which no longer cascades at read). Materializes every
    // parent→child grant into explicit keys.
    const finalGrants = resolveCascadedGrants(grants, PERM_MODULES);
    let error: any;

    if (isNew) {
      ({ error } = await supabase.from("access_profiles").insert({
        name: trimmed,
        description: description.trim() || null,
        target_department: targetDepartment || null,
        target_role: targetRole || null,
        target_service: targetDepartment === "Operations" ? (targetService || null) : null,
        module_grants: finalGrants,
        visibility_scope: legacyScopeFromMap(visibilityScopes),
        visibility_departments: null,
        visibility_scopes: visibilityScopes,
        created_by: currentUser?.id ?? null,
        updated_by: currentUser?.id ?? null,
      }));
    } else {
      ({ error } = await supabase.from("access_profiles").update({
        name: trimmed,
        description: description.trim() || null,
        target_department: targetDepartment || null,
        target_role: targetRole || null,
        target_service: targetDepartment === "Operations" ? (targetService || null) : null,
        module_grants: finalGrants,
        visibility_scope: legacyScopeFromMap(visibilityScopes),
        visibility_departments: null,
        visibility_scopes: visibilityScopes,
        updated_by: currentUser?.id ?? null,
        updated_at: now,
      }).eq("id", profile!.id!));
    }

    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        setNameError("A profile with this name already exists");
      } else {
        toast.error("Couldn't save the profile. Please try again.");
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

    // refetchType: "all" forces inactive queries to refetch too. The profile
    // list is unmounted while this editor is open, so a plain invalidate would
    // only mark it stale — and the global refetchOnMount:false would then serve
    // the pre-edit cache on remount. "all" makes the saved change actually show.
    queryClient.invalidateQueries({ queryKey: ["access_profiles"], refetchType: "all" });
    queryClient.invalidateQueries({ queryKey: ["permission_overrides", "access-summary"], refetchType: "all" });
    // Editing a profile changes the live access of every user linked to it.
    // Refresh the resolved permission grants so those users' sidebar/route/action
    // gates update instead of waiting out the 5-minute staleTime.
    queryClient.invalidateQueries({ queryKey: ["permission_overrides"], refetchType: "all" });
    toast.success(isNew ? "Profile created" : "Profile saved");
    setName(trimmed);
    setSavedGrants(grants);
    setSavedVisibilityScopes(visibilityScopes);
    setSavedName(trimmed);
    setSavedDescription(description);
    setSavedTargetDepartment(targetDepartment);
    setSavedTargetRole(targetRole);
    setSavedTargetService(targetDepartment === "Operations" ? targetService : "");
    setSavedVisibilityScope(visibilityScope);
    setSavedVisibilityDepartments([...visibilityDepartments]);
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
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--neuron-ink-primary)", margin: 0 }}>
              {isNew ? "New Profile" : `Edit: ${savedName}`}
            </h2>
            {!isNew && (
              <span
                title={assignedCount > 0 ? assignedUsers.map(u => u.name).join(", ") : undefined}
                style={{
                  fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap",
                  backgroundColor: assignedCount > 0
                    ? "color-mix(in oklch, var(--neuron-action-primary) 12%, transparent)"
                    : "var(--neuron-bg-surface-subtle)",
                  color: assignedCount > 0 ? "var(--neuron-action-primary)" : "var(--neuron-ink-muted)",
                }}
              >
                {assignedCount > 0
                  ? `Applied to ${assignedCount} ${assignedCount === 1 ? "person" : "people"}`
                  : "Not assigned to anyone yet"}
              </span>
            )}
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
                onChange={e => {
                  const next = e.target.value;
                  setTargetDepartment(next);
                  if (next !== "Operations") setTargetService("");
                }}
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
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {targetDepartment === "Operations" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Target Service</label>
                <select
                  value={targetService}
                  onChange={e => setTargetService(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, border: "1px solid var(--neuron-ui-border)", background: "var(--neuron-bg-elevated)", color: "var(--neuron-ink-primary)", outline: "none" }}
                >
                  <option value="">Any service</option>
                  {OPERATIONS_ACCESS_SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            {canShowBaseline && (
              <div style={{ gridColumn: "1 / -1" }}>
                <button
                  type="button"
                  onClick={handleApplyBaseline}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--neuron-action-primary)",
                    background: "color-mix(in oklch, var(--neuron-action-primary) 10%, transparent)",
                    color: "var(--neuron-action-primary)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <Wand2 size={14} /> Autofill from {ROLES.find(r => r.value === targetRole)?.label} baseline
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <AccessEditorTabs
        grants={grants}
        onGrantsChange={(nextGrants) => setGrants(nextGrants)}
        baselineGrants={baselineGrants}
        showInheritedBaseline={showBaseline && canShowBaseline}
        othersPrimaryGroup={targetDepartment === "Pricing" ? "Pricing" : "Operations"}
        resolvedViewGrants={resolvedGrants}
        visibilityScopes={visibilityScopes}
        onVisibilityChange={setVisibilityScopes}
        featureAccessToolbar={
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Permissions</span>
            {grantCount > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 8px", borderRadius: 999,
                backgroundColor: "color-mix(in oklch, var(--neuron-action-primary) 12%, transparent)",
                color: "var(--neuron-action-primary)" }}>
                {grantCount} permissions set
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
                {showBaseline ? "Hide template" : `Preview ${ROLES.find(r => r.value === targetRole)?.label} template`}
              </button>
            )}
            {grantCount > 0 && (
              <button onClick={handleClearAll} style={{ fontSize: 11, color: "var(--neuron-semantic-error, #dc2626)",
                border: "none", background: "none", cursor: "pointer", padding: "2px 0", marginLeft: "auto",
                textDecoration: "underline", textUnderlineOffset: 2, opacity: 0.8 }}>
                Clear all
              </button>
            )}
          </div>
        }
      />

      {/* Exit confirmation */}
      <NeuronModal
        isOpen={confirmExitOpen}
        onClose={() => setConfirmExitOpen(false)}
        title="Discard changes?"
        description="You have unsaved changes. Going back will discard them permanently."
        confirmLabel="Discard & go back"
        confirmIcon={<ArrowLeft size={15} />}
        onConfirm={handleDiscard}
        variant="danger"
      />

      {/* Autofill overwrite confirmation */}
      <NeuronModal
        isOpen={confirmAutofillOpen}
        onClose={() => setConfirmAutofillOpen(false)}
        title="Overwrite current permissions?"
        description="Autofilling from the template will replace this profile's current permissions and record visibility."
        confirmLabel="Overwrite with template"
        confirmIcon={<Wand2 size={15} />}
        onConfirm={() => { setConfirmAutofillOpen(false); applyBaseline(); }}
        variant="danger"
      />

      {/* Empty-profile confirmation — replaces the old silent click-Save-twice gate */}
      <NeuronModal
        isOpen={confirmEmptyOpen}
        onClose={() => setConfirmEmptyOpen(false)}
        title="This profile grants no access"
        description={
          assignedCount > 0
            ? `${assignedCount} ${assignedCount === 1 ? "person is" : "people are"} on this profile — saving it empty removes their access to everything. Save anyway?`
            : "Anyone assigned to this profile will see nothing in Neuron OS. Save it empty anyway?"
        }
        confirmLabel="Save empty profile"
        confirmIcon={<Save size={15} />}
        onConfirm={() => void performSave()}
        variant="danger"
      />

      {/* Blast-radius confirmation — saving a profile updates live access */}
      <NeuronModal
        isOpen={confirmSaveOpen}
        onClose={() => setConfirmSaveOpen(false)}
        title={`Update access for ${assignedCount} ${assignedCount === 1 ? "person" : "people"}?`}
        description={`Saving applies these changes immediately to everyone on this profile: ${assignedUsers.slice(0, 4).map(u => u.name).join(", ")}${assignedCount > 4 ? ` and ${assignedCount - 4} more` : ""}.`}
        confirmLabel="Save & update access"
        confirmIcon={<Save size={15} />}
        onConfirm={() => void performSave()}
      />
    </div>
  );
}

// ─── AccessProfiles (main) ────────────────────────────────────────────────────

export function AccessProfiles({ onConfigureAccess: _onConfigureAccess, onEditProfile }: AccessProfilesProps) {
  const [applyingProfile, setApplyingProfile] = useState<AccessProfileSummary | null>(null);
  const [deletingProfile, setDeletingProfile] = useState<AccessProfileSummary | null>(null);
  const { can } = usePermission();
  // WG-02: profile CRUD + Apply ran on the tab's view grant alone
  const canCreateProfiles = can("admin_access_profiles_tab", "create");
  const canEditProfiles = can("admin_access_profiles_tab", "edit");
  const canDeleteProfiles = can("admin_access_profiles_tab", "delete");

  const { data: profiles = [], isLoading } = useQuery<AccessProfileSummary[]>({
    queryKey: ["access_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_profiles")
        .select("id, name, description, target_department, target_role, target_service, module_grants, visibility_scope, visibility_departments, visibility_scopes, updated_at")
        .eq("is_active", true)
        .eq("is_baseline", false)
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
                {row.target_department}{row.target_department === "Operations" && row.target_service ? ` · ${row.target_service}` : ""}
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
      header: "Permissions",
      accessorKey: "module_grants",
      cell: (row) => {
        const count = countGrantOverrides(row.module_grants);
        return (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "1px 8px", borderRadius: 999,
            backgroundColor: count > 0 ? "color-mix(in oklch, var(--neuron-action-primary) 12%, transparent)" : "var(--neuron-bg-surface-subtle)",
            color: count > 0 ? "var(--neuron-action-primary)" : "var(--neuron-ink-muted)",
          }}>
            {count > 0 ? `${count} permissions` : "No access yet"}
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
          {canEditProfiles && (
          <button
            onClick={() => onEditProfile(row as unknown as Partial<AccessProfile>)}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--neuron-ui-border)", background: "transparent", fontSize: 12, fontWeight: 500, color: "var(--neuron-ink-muted)", cursor: "pointer" }}
          >
            Edit
          </button>
          )}
          {canCreateProfiles && (
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
          )}
          {canEditProfiles && (
          <button
            onClick={() => setApplyingProfile(row)}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--neuron-ui-border)", background: "transparent", fontSize: 12, fontWeight: 500, color: "var(--neuron-action-primary)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
          >
            <UserCheck size={12} /> Apply
          </button>
          )}
          {canDeleteProfiles && (
          <>
          <div style={{ width: 1, height: 18, backgroundColor: "var(--neuron-ui-border)", margin: "0 2px" }} />
          <button
            onClick={() => setDeletingProfile(row)}
            aria-label={`Delete ${row.name}`}
            title={`Delete ${row.name}`}
            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--neuron-ui-border)", background: "transparent", fontSize: 12, fontWeight: 500, color: "var(--neuron-ink-muted)", cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--neuron-semantic-error, #dc2626)"; e.currentTarget.style.borderColor = "var(--neuron-semantic-error, #dc2626)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--neuron-ink-muted)"; e.currentTarget.style.borderColor = "var(--neuron-ui-border)"; }}
          >
            <Trash2 size={12} />
          </button>
          </>
          )}
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
            Reusable access setups you can assign to staff. Editing a profile updates everyone using it; per-person custom changes stay separate.
          </p>
        </div>
        {canCreateProfiles && (
        <button
          onClick={() => onEditProfile(null)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--neuron-action-primary)", color: "var(--neuron-action-primary-text)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          <Plus size={14} /> New Profile
        </button>
        )}
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
            Create profiles like "BD Manager" or "Ops Supervisor" to quickly set up access for new or promoted staff.
          </p>
          {canCreateProfiles && (
          <button
            onClick={() => onEditProfile(null)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--neuron-action-primary)", color: "var(--neuron-action-primary-text)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            <Plus size={14} /> Create First Profile
          </button>
          )}
        </div>
      ) : (
        <DataTable
          data={profiles}
          columns={columns}
        />
      )}

      <ApplyProfileModal
        profile={applyingProfile}
        onClose={() => setApplyingProfile(null)}
        onApplied={() => setApplyingProfile(null)}
      />

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
