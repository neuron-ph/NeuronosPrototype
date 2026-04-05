import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../utils/supabase/client";
import { queryKeys } from "../../lib/queryKeys";
import { useUser } from "../../hooks/useUser";
import { useTeams } from "../../hooks/useTeams";
import { toast } from "sonner@2.0.3";
import {
  ArrowLeft, Loader2, KeyRound, Trash2,
  UserCheck, UserX, UserMinus, Pencil,
} from "lucide-react";
import { CustomDropdown } from "../bd/CustomDropdown";
import { getOpsDisplayLabel } from "../../utils/roleLabels";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRole(role: string) {
  if (role === "team_leader") return "Team Leader";
  if (role === "manager") return "Manager";
  return "Staff";
}

type UserStatus = "active" | "inactive" | "suspended";

const STATUS_CONFIG: Record<UserStatus, { bg: string; text: string; dot: string; label: string }> = {
  active:    { bg: "var(--theme-status-success-bg)", text: "#166534", dot: "var(--theme-status-success-fg)",  label: "Active" },
  inactive:  { bg: "var(--neuron-pill-inactive-bg)", text: "var(--theme-text-muted)", dot: "var(--neuron-ui-muted)",  label: "Inactive" },
  suspended: { bg: "var(--theme-status-warning-bg)", text: "var(--theme-status-warning-fg)", dot: "var(--theme-status-warning-fg)",  label: "Suspended" },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status as UserStatus] ?? STATUS_CONFIG.inactive;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 999, background: c.bg, fontSize: 12, fontWeight: 500, color: c.text }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
      {c.label}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1, height: 36,
  border: "1px solid var(--neuron-ui-border)",
  borderRadius: 8, padding: "0 12px", fontSize: 13,
  outline: "none", backgroundColor: "var(--neuron-bg-elevated)",
  color: "var(--neuron-ink-primary)",
};

// ─── Main page ────────────────────────────────────────────────────────────────

export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: currentUser } = useUser();

  const [editing, setEditing]       = useState(false);
  const [editDept, setEditDept]     = useState("");
  const [editRole, setEditRole]     = useState("");
  const [editTeamId, setEditTeamId] = useState("");
  const [editServiceType, setEditServiceType] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [resetOpen, setResetOpen]   = useState(false);
  const [newPw, setNewPw]           = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { teams } = useTeams();

  const { data: user, isLoading } = useQuery({
    queryKey: ["users", "detail", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, email, name, department, role, team_id, service_type, is_active, status, avatar_url, created_at, teams!users_team_id_fkey(name)")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    // Seed from list cache so page renders instantly on SPA navigation
    placeholderData: () => {
      const list = queryClient.getQueryData<{ id: string; [key: string]: unknown }[]>(queryKeys.users.list());
      return list?.find((u) => u.id === userId) ?? undefined;
    },
  });

  const handleStartEdit = () => {
    if (!user) return;
    setEditDept(user.department);
    setEditRole(user.role);
    setEditTeamId(user.team_id || "");
    setEditServiceType(user.service_type || "");
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({
          department: editDept,
          role: editRole,
          team_id: editTeamId || null,
          service_type: editDept === "Operations" ? (editServiceType || null) : null,
        })
        .eq("id", user.id);
      if (error) throw new Error(error.message);
      toast.success("User updated");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["users", "detail", userId] });
      queryClient.invalidateQueries({ queryKey: ["users", "list"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save changes");
    } finally {
      setSavingProfile(false);
    }
  };

  const callAdminAction = async (action: string, params: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("admin-user-actions", {
      body: { action, ...params },
    });
    if (error) throw new Error(error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  };

  const handleStatusChange = async (newStatus: UserStatus) => {
    if (!user) return;
    const verb = { active: "activate", inactive: "deactivate", suspended: "suspend" }[newStatus];
    if (!confirm(`${verb.charAt(0).toUpperCase() + verb.slice(1)} ${user.name}?`)) return;
    setActionLoading(newStatus);
    try {
      await callAdminAction("updateStatus", { userId: user.id, status: newStatus });
      toast.success(`User ${verb}d.`);
      queryClient.invalidateQueries({ queryKey: ["users", "detail", userId] });
      queryClient.invalidateQueries({ queryKey: ["users", "list"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetPassword = async () => {
    if (!newPw.trim()) { toast.error("Enter a new password"); return; }
    if (newPw.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setActionLoading("resetPassword");
    try {
      await callAdminAction("resetPassword", { userId: user!.id, newPassword: newPw });
      toast.success("Password reset successfully.");
      setResetOpen(false);
      setNewPw("");
    } catch (err: any) {
      toast.error(err.message || "Failed to reset password");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    if (user.id === currentUser?.id) { toast.error("You cannot delete your own account."); return; }
    // Safeguard: don't delete last executive
    if (user.department === "Executive") {
      const { count } = await supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("department", "Executive")
        .eq("is_active", true);
      if ((count ?? 0) <= 1) { toast.error("Cannot delete the last active Executive."); return; }
    }
    if (!confirm(`Permanently delete ${user.name}'s account? This cannot be undone.`)) return;
    setActionLoading("delete");
    try {
      await callAdminAction("deleteUser", { userId: user.id });
      toast.success(`${user.name}'s account deleted.`);
      navigate("/admin/users");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete account");
    } finally {
      setActionLoading(null);
    }
  };

  // ── Loading / not found ──

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "var(--neuron-ink-muted)" }} />
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: "64px 48px", textAlign: "center" }}>
        <p style={{ fontSize: 14, color: "var(--neuron-ink-muted)" }}>User not found.</p>
        <button onClick={() => navigate("/admin/users")} style={{ marginTop: 12, color: "var(--theme-action-primary-bg)", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>
          ← Back to Users
        </button>
      </div>
    );
  }

  const status: UserStatus = ((user as any).status as UserStatus) || (user.is_active ? "active" : "inactive");
  const teamName: string | null = (user as any).teams?.name ?? null;
  const initials = (user.name || user.email || "U").charAt(0).toUpperCase();

  const STATUS_ACTIONS: { value: UserStatus; icon: React.ElementType; label: string }[] = [
    { value: "active",    icon: UserCheck,  label: "Active" },
    { value: "inactive",  icon: UserX,      label: "Inactive" },
    { value: "suspended", icon: UserMinus,  label: "Suspended" },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--neuron-bg-elevated)" }}>

      {/* Top bar */}
      <div style={{ padding: "16px 48px", borderBottom: "1px solid var(--neuron-ui-border)", display: "flex", alignItems: "center", flexShrink: 0 }}>
        <button
          onClick={() => navigate("/admin/users")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--neuron-ink-muted)", fontSize: 13, fontWeight: 500, padding: 0 }}
        >
          <ArrowLeft size={15} /> Users
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: "auto", padding: "32px 48px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Profile card ── */}
        <div style={{ background: "var(--neuron-bg-elevated)", border: "1px solid var(--neuron-ui-border)", borderRadius: 12, padding: 24 }}>

          {/* View mode header — always visible */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: editing ? 20 : 0 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--theme-status-success-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18, fontWeight: 600, color: "var(--theme-action-primary-bg)", overflow: "hidden" }}>
              {user.avatar_url
                ? <img src={user.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : initials}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--neuron-ink-primary)", margin: 0 }}>{user.name}</h2>
                <StatusBadge status={status} />
              </div>
              <p style={{ fontSize: 13, color: "var(--neuron-ink-muted)", margin: "0 0 10px" }}>{user.email}</p>
              {!editing && (
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  {[
                    ["Department", user.department],
                    ["Role", formatRole(user.role)],
                    ...(teamName ? [["Team", teamName]] : []),
                    ...(user.service_type ? [["Service Type", user.service_type]] : []),
                    ...(user.department === "Operations" ? [["Ops Role", getOpsDisplayLabel(user.role)]] : []),
                    ...(user.created_at ? [["Member since", new Date(user.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })]] : []),
                  ].map(([label, value]) => (
                    <span key={label} style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>
                      <span style={{ fontWeight: 500, color: "var(--neuron-ink-primary)" }}>{label}:</span> {value}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {!editing && (
              <button
                onClick={handleStartEdit}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid var(--neuron-ui-border)", background: "transparent", color: "var(--neuron-ink-muted)", fontSize: 13, fontWeight: 500, cursor: "pointer", flexShrink: 0 }}
              >
                <Pencil size={13} /> Edit
              </button>
            )}
          </div>

          {/* Edit mode form */}
          {editing && (
            <div style={{ borderTop: "1px solid var(--neuron-ui-border)", paddingTop: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", marginBottom: 6 }}>Department</label>
                  <CustomDropdown
                    label=""
                    value={editDept}
                    onChange={setEditDept}
                    options={["Business Development", "Pricing", "Operations", "Accounting", "HR", "Executive"].map(d => ({ value: d, label: d }))}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", marginBottom: 6 }}>Role</label>
                  <CustomDropdown
                    label=""
                    value={editRole}
                    onChange={setEditRole}
                    options={[
                      { value: "staff", label: "Staff" },
                      { value: "team_leader", label: "Team Leader" },
                      { value: "manager", label: "Manager" },
                    ]}
                  />
                </div>
                {editDept === "Operations" && (
                  <>
                    <div>
                      <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", marginBottom: 6 }}>Team</label>
                      <CustomDropdown
                        label=""
                        value={editTeamId}
                        onChange={setEditTeamId}
                        options={[{ value: "", label: "No team" }, ...teams.map(t => ({ value: t.id, label: t.name }))]}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", marginBottom: 6 }}>Service Type</label>
                      <CustomDropdown
                        label=""
                        value={editServiceType}
                        onChange={setEditServiceType}
                        options={[
                          { value: "", label: "No service type" },
                          { value: "Forwarding", label: "Forwarding" },
                          { value: "Brokerage", label: "Brokerage" },
                          { value: "Trucking", label: "Trucking" },
                          { value: "Marine Insurance", label: "Marine Insurance" },
                          { value: "Others", label: "Others" },
                        ]}
                      />
                    </div>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={handleCancelEdit}
                  style={{ height: 32, padding: "0 14px", borderRadius: 8, border: "1px solid var(--neuron-ui-border)", background: "transparent", color: "var(--neuron-ink-muted)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  style={{ height: 32, padding: "0 14px", borderRadius: 8, background: "var(--neuron-action-primary)", border: "none", color: "var(--neuron-action-primary-text)", fontSize: 13, fontWeight: 600, cursor: savingProfile ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, opacity: savingProfile ? 0.8 : 1 }}
                >
                  {savingProfile && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
                  {savingProfile ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Permissions ── (hidden until feature is ready) */}

        {/* ── Account actions ── */}
        <div style={{ background: "var(--neuron-bg-elevated)", border: "1px solid var(--neuron-ui-border)", borderRadius: 12, padding: 24 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--neuron-ink-muted)", marginBottom: 16, marginTop: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>Account</h3>

          {/* Status toggle */}
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", marginBottom: 8 }}>Status</p>
            <div style={{ display: "flex", gap: 8 }}>
              {STATUS_ACTIONS.map(({ value, icon: Icon, label }) => {
                const isCurrent = status === value;
                return (
                  <button
                    key={value}
                    onClick={() => !isCurrent && handleStatusChange(value)}
                    disabled={isCurrent || !!actionLoading}
                    style={{
                      height: 34, padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                      cursor: isCurrent ? "default" : "pointer",
                      border: isCurrent ? "1px solid var(--theme-action-primary-bg)" : "1px solid var(--neuron-ui-border)",
                      background: isCurrent ? "var(--theme-status-success-bg)" : "var(--neuron-bg-elevated)",
                      color: isCurrent ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-muted)",
                      display: "flex", alignItems: "center", gap: 6,
                      opacity: (actionLoading && !isCurrent) ? 0.5 : 1,
                    }}
                  >
                    {actionLoading === value
                      ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                      : <Icon size={14} />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Security */}
          <div style={{ borderTop: "1px solid var(--neuron-ui-border)", paddingTop: 20 }}>
            <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", marginBottom: 8 }}>Security</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => setResetOpen(v => !v)}
                style={{ height: 34, padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--neuron-ui-border)", background: "var(--neuron-bg-elevated)", color: "var(--neuron-ink-primary)" }}
              >
                <KeyRound size={14} /> Reset Password
              </button>
              {user.id !== currentUser?.id && (
                <button
                  onClick={handleDelete}
                  disabled={!!actionLoading}
                  style={{ height: 34, padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--theme-status-danger-border)", background: "var(--neuron-bg-elevated)", color: "var(--theme-status-danger-fg)", opacity: actionLoading ? 0.6 : 1 }}
                >
                  {actionLoading === "delete" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={14} />}
                  Delete Account
                </button>
              )}
            </div>

            {resetOpen && (
              <div style={{ marginTop: 14, padding: 16, background: "var(--neuron-pill-inactive-bg)", borderRadius: 8, border: "1px solid var(--neuron-ui-border)" }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", marginBottom: 8 }}>Set new password</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="password"
                    placeholder="Min. 8 characters"
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleResetPassword()}
                    style={inputStyle}
                  />
                  <button
                    onClick={handleResetPassword}
                    disabled={!!actionLoading}
                    style={{ height: 36, padding: "0 16px", borderRadius: 8, background: "var(--theme-action-primary-bg)", border: "none", color: "white", fontSize: 13, fontWeight: 600, cursor: actionLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    {actionLoading === "resetPassword" ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : null}
                    {actionLoading === "resetPassword" ? "Resetting…" : "Reset"}
                  </button>
                  <button
                    onClick={() => { setResetOpen(false); setNewPw(""); }}
                    style={{ height: 36, padding: "0 12px", borderRadius: 8, border: "1px solid var(--neuron-ui-border)", background: "none", color: "var(--neuron-ink-muted)", fontSize: 13, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
