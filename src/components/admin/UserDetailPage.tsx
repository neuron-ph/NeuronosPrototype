import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { toast } from "sonner@2.0.3";
import {
  ArrowLeft, Loader2, Edit2, Shield, KeyRound, Trash2,
  UserCheck, UserX, UserMinus,
} from "lucide-react";
import { PermissionsMatrix } from "./PermissionsMatrix";
import { EditUserPanel, type UserRow } from "./EditUserPanel";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRole(role: string) {
  if (role === "team_leader") return "Team Leader";
  if (role === "manager") return "Manager";
  return "Staff";
}

type UserStatus = "active" | "inactive" | "suspended";

const STATUS_CONFIG: Record<UserStatus, { bg: string; text: string; dot: string; label: string }> = {
  active:    { bg: "#DCFCE7", text: "#166534", dot: "#22C55E",  label: "Active" },
  inactive:  { bg: "#F3F4F6", text: "#6B7280", dot: "#9CA3AF",  label: "Inactive" },
  suspended: { bg: "#FEF3C7", text: "#92400E", dot: "#F59E0B",  label: "Suspended" },
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

  const [editOpen, setEditOpen]     = useState(false);
  const [editPerms, setEditPerms]   = useState(false);
  const [resetOpen, setResetOpen]   = useState(false);
  const [newPw, setNewPw]           = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data: user, isLoading } = useQuery({
    queryKey: ["users", "detail", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, email, name, department, role, team_id, is_active, status, avatar_url, created_at, teams!users_team_id_fkey(name)")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

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
        <button onClick={() => navigate("/admin/users")} style={{ marginTop: 12, color: "#0F766E", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>
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
      <div style={{ padding: "16px 48px", borderBottom: "1px solid var(--neuron-ui-border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <button
          onClick={() => navigate("/admin/users")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--neuron-ink-muted)", fontSize: 13, fontWeight: 500, padding: 0 }}
        >
          <ArrowLeft size={15} /> Users
        </button>
        <button
          onClick={() => setEditOpen(true)}
          style={{ height: 34, padding: "0 14px", borderRadius: 8, background: "var(--neuron-bg-elevated)", border: "1px solid var(--neuron-ui-border)", color: "var(--neuron-ink-primary)", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
        >
          <Edit2 size={13} /> Edit User
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: "auto", padding: "32px 48px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Profile card ── */}
        <div style={{ background: "var(--neuron-bg-elevated)", border: "1px solid var(--neuron-ui-border)", borderRadius: 12, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18, fontWeight: 600, color: "#0F766E", overflow: "hidden" }}>
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
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                {[
                  ["Department", user.department],
                  ["Role", formatRole(user.role)],
                  ...(teamName ? [["Team", teamName]] : []),
                  ["Member since", new Date(user.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })],
                ].map(([label, value]) => (
                  <span key={label} style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>
                    <span style={{ fontWeight: 500, color: "var(--neuron-ink-primary)" }}>{label}:</span> {value}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Permissions ── */}
        <div style={{ background: "var(--neuron-bg-elevated)", border: "1px solid var(--neuron-ui-border)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--neuron-ui-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Shield size={15} style={{ color: "var(--neuron-ink-muted)" }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--neuron-ink-primary)" }}>Permissions</span>
            </div>
            <button
              onClick={() => setEditPerms(v => !v)}
              style={{ height: 30, padding: "0 12px", borderRadius: 6, border: "1px solid var(--neuron-ui-border)", background: editPerms ? "#F0FDF9" : "var(--neuron-bg-elevated)", color: editPerms ? "#0F766E" : "var(--neuron-ink-muted)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
            >
              {editPerms ? "Done Editing" : "Edit Permissions"}
            </button>
          </div>
          <div style={{ padding: "20px 24px" }}>
            <PermissionsMatrix
              userId={user.id}
              userRole={user.role}
              userDepartment={user.department}
              readonly={!editPerms}
              onSaved={() => setEditPerms(false)}
            />
          </div>
        </div>

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
                      border: isCurrent ? "1px solid #0F766E" : "1px solid var(--neuron-ui-border)",
                      background: isCurrent ? "#F0FDF9" : "var(--neuron-bg-elevated)",
                      color: isCurrent ? "#0F766E" : "var(--neuron-ink-muted)",
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
                  style={{ height: 34, padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, border: "1px solid #FCA5A5", background: "var(--neuron-bg-elevated)", color: "#DC2626", opacity: actionLoading ? 0.6 : 1 }}
                >
                  {actionLoading === "delete" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={14} />}
                  Delete Account
                </button>
              )}
            </div>

            {resetOpen && (
              <div style={{ marginTop: 14, padding: 16, background: "#F9FAFB", borderRadius: 8, border: "1px solid var(--neuron-ui-border)" }}>
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
                    style={{ height: 36, padding: "0 16px", borderRadius: 8, background: "#0F766E", border: "none", color: "white", fontSize: 13, fontWeight: 600, cursor: actionLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}
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

      {/* Edit panel */}
      {editOpen && (
        <EditUserPanel
          isOpen={editOpen}
          user={user as unknown as UserRow}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            queryClient.invalidateQueries({ queryKey: ["users", "detail", userId] });
            queryClient.invalidateQueries({ queryKey: ["users", "list"] });
          }}
        />
      )}
    </div>
  );
}
