import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../../utils/supabase/client";
import { queryKeys } from "../../lib/queryKeys";
import { useUser } from "../../hooks/useUser";
import { useTeams } from "../../hooks/useTeams";
import { toast } from "sonner@2.0.3";
import {
  ArrowLeft, Loader2, KeyRound, Trash2,
  UserCheck, UserX, UserMinus, Pencil, Shield,
  ChevronDown, ChevronUp, Activity,
} from "lucide-react";
import { Switch } from "../ui/switch";
import { CustomDropdown } from "../bd/CustomDropdown";
import { NeuronModal } from "../ui/NeuronModal";

// ─── Types ────────────────────────────────────────────────────────────────────

type UserStatus = "active" | "inactive" | "suspended";

interface ActivityEntry {
  id: string;
  entity_type: string;
  entity_name: string;
  action_type: string;
  created_at: string;
}

// ─── Lookup tables ─────────────────────────────────────────────────────────────

const ENTITY_DOT: Record<string, string> = {
  booking:        "#6366F1",
  quotation:      "#3B82F6",
  contract:       "#7C3AED",
  project:        "#0F766E",
  evoucher:       "#E87A3D",
  invoice:        "#16A34A",
  collection:     "#059669",
  billing:        "#65A30D",
  expense:        "#DC2626",
  contact:        "#DB2777",
  customer:       "#E11D48",
  task:           "#CA8A04",
  ticket:         "#D97706",
  user:           "#475569",
  team:           "#6B7280",
  journal_entry:  "#0891B2",
  budget_request: "#9333EA",
};

const ENTITY_LABEL: Record<string, string> = {
  booking:        "Booking",
  quotation:      "Quotation",
  contract:       "Contract",
  project:        "Project",
  evoucher:       "E-Voucher",
  invoice:        "Invoice",
  collection:     "Collection",
  billing:        "Billing",
  expense:        "Expense",
  contact:        "Contact",
  customer:       "Customer",
  task:           "Task",
  ticket:         "Ticket",
  user:           "User",
  team:           "Team",
  journal_entry:  "Journal",
  budget_request: "Budget Req.",
};

const ACTION_COLOR: Record<string, string> = {
  created:       "var(--theme-status-success-fg)",
  updated:       "var(--neuron-semantic-info)",
  deleted:       "var(--theme-status-danger-fg)",
  status_change: "var(--theme-status-warning-fg)",
  approved:      "var(--theme-status-success-fg)",
  rejected:      "var(--theme-status-danger-fg)",
  posted:        "var(--theme-action-primary-bg)",
  cancelled:     "var(--neuron-ink-muted)",
  converted:     "var(--neuron-status-accent-fg)",
  assigned:      "var(--neuron-semantic-info)",
  login:         "var(--neuron-ink-muted)",
};

const ACTION_LABEL: Record<string, string> = {
  created:       "Created",
  updated:       "Updated",
  deleted:       "Deleted",
  status_change: "Status changed",
  approved:      "Approved",
  rejected:      "Rejected",
  posted:        "Posted",
  cancelled:     "Cancelled",
  converted:     "Converted",
  assigned:      "Assigned",
  login:         "Logged in",
};

const STATUS_VERB: Record<UserStatus, string> = {
  active:    "activated",
  inactive:  "deactivated",
  suspended: "suspended",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRole(role: string) {
  if (role === "team_leader") return "Team Leader";
  if (role === "manager") return "Manager";
  if (role === "executive") return "Executive";
  return "Staff";
}

function getDeptTokens(dept: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    "Business Development": { bg: "var(--neuron-dept-bd-bg)",         text: "var(--neuron-dept-bd-text)" },
    "Pricing":              { bg: "var(--neuron-dept-pricing-bg)",     text: "var(--neuron-dept-pricing-text)" },
    "Operations":           { bg: "var(--neuron-dept-ops-bg)",         text: "var(--neuron-dept-ops-text)" },
    "Accounting":           { bg: "var(--neuron-dept-accounting-bg)",  text: "var(--neuron-dept-accounting-text)" },
    "HR":                   { bg: "var(--neuron-dept-hr-bg)",          text: "var(--neuron-dept-hr-text)" },
    "Executive":            { bg: "var(--neuron-dept-executive-bg)",   text: "var(--neuron-dept-executive-text)" },
  };
  return map[dept] ?? { bg: "var(--neuron-dept-default-bg)", text: "var(--neuron-dept-default-text)" };
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d === 1) return "Yesterday";
  return new Date(ts).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function formatLastSeen(ts: string | null | undefined): { text: string; online: boolean } | null {
  if (!ts) return null;
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 5) return { text: "Online now", online: true };
  return { text: relativeTime(ts), online: false };
}

const inputStyle: React.CSSProperties = {
  flex: 1, height: 36,
  border: "1px solid var(--neuron-ui-border)",
  borderRadius: 7, padding: "0 12px", fontSize: 13,
  outline: "none",
  backgroundColor: "var(--neuron-bg-elevated)",
  color: "var(--neuron-ink-primary)",
  transition: "border-color 0.12s ease",
};

const sectionLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11, fontWeight: 500,
  letterSpacing: "0.05em", textTransform: "uppercase",
  color: "var(--neuron-ink-muted)",
  marginBottom: 14,
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ActivitySkeletonRow() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--neuron-ui-border)" }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--neuron-ui-border)", flexShrink: 0 }} />
      <div style={{ width: 60, height: 10, borderRadius: 4, background: "var(--neuron-ui-border)" }} />
      <div style={{ flex: 1, height: 10, borderRadius: 4, background: "var(--neuron-ui-border)" }} />
      <div style={{ width: 40, height: 10, borderRadius: 4, background: "var(--neuron-ui-border)", flexShrink: 0 }} />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: currentUser } = useUser();

  const [editing, setEditing]             = useState(false);
  const [editDept, setEditDept]           = useState("");
  const [editRole, setEditRole]           = useState("");
  const [editTeamId, setEditTeamId]       = useState("");
  const [editServiceType, setEditServiceType] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [resetOpen, setResetOpen]         = useState(false);
  const [newPw, setNewPw]                 = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dangerOpen, setDangerOpen]       = useState(false);

  const { teams } = useTeams();

  const { data: accessSummary } = useQuery({
    queryKey: ["permission_overrides", "access-summary", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("permission_overrides")
        .select("module_grants, applied_profile_id, profile:applied_profile_id(name)")
        .eq("user_id", userId!)
        .maybeSingle();
      if (!data) return null;
      const overrideCount = Object.keys(data.module_grants ?? {}).length;
      const profileName = (data as any)?.profile?.name ?? null;
      return { profileName, overrideCount };
    },
    enabled: !!userId,
  });

  const { data: user, isLoading } = useQuery({
    queryKey: ["users", "detail", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, email, name, department, role, team_id, service_type, is_active, status, avatar_url, created_at, phone, last_seen_at, ev_approval_authority, position, teams!users_team_id_fkey(name)")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    placeholderData: () => {
      const list = queryClient.getQueryData<{ id: string; [key: string]: unknown }[]>(queryKeys.users.list());
      return list?.find((u) => u.id === userId) ?? undefined;
    },
  });

  const { data: activityFeed = [], isLoading: activityLoading, isError: activityError } = useQuery({
    queryKey: ["activity_log", "user", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("id, entity_type, entity_name, action_type, created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return (data ?? []) as ActivityEntry[];
    },
    enabled: !!userId,
  });

  const handleStartEdit = () => {
    if (!user) return;
    setEditDept(user.department);
    setEditRole(user.role);
    setEditTeamId(user.team_id || "");
    setEditServiceType((user as any).service_type || "");
    setEditing(true);
  };

  const handleCancelEdit = () => setEditing(false);

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
    setActionLoading(newStatus);
    try {
      await callAdminAction("updateStatus", { userId: user.id, status: newStatus });
      toast.success(`User ${STATUS_VERB[newStatus]}.`);
      queryClient.invalidateQueries({ queryKey: ["users", "detail", userId] });
      queryClient.invalidateQueries({ queryKey: ["users", "list"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setActionLoading(null);
    }
  };

  const handleEvAuthorityToggle = async (value: boolean) => {
    if (!user) return;
    queryClient.setQueryData(["users", "detail", userId], (old: any) =>
      old ? { ...old, ev_approval_authority: value } : old
    );
    const { error } = await supabase
      .from("users")
      .update({ ev_approval_authority: value })
      .eq("id", user.id);
    if (error) {
      toast.error("Failed to update approval authority");
      queryClient.invalidateQueries({ queryKey: ["users", "detail", userId] });
    } else {
      toast.success(value ? "Approval authority granted" : "Approval authority removed");
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
    if (user.department === "Executive") {
      const { count } = await supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("department", "Executive")
        .eq("is_active", true);
      if ((count ?? 0) <= 1) { toast.error("Cannot delete the last active Executive."); return; }
    }
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirmed = async () => {
    setShowDeleteConfirm(false);
    setActionLoading("delete");
    try {
      await callAdminAction("deleteUser", { userId: user!.id });
      toast.success(`${user!.name}'s account deleted.`);
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
        <button type="button" onClick={() => navigate("/admin/users")} style={{ marginTop: 12, color: "var(--theme-action-primary-bg)", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>
          ← Back to Users
        </button>
      </div>
    );
  }

  const status: UserStatus = (((user as any).status as string)?.toLowerCase() as UserStatus) || (user.is_active ? "active" : "inactive");
  const teamName: string | null  = (user as any).teams?.name ?? null;
  const phone: string | null     = (user as any).phone ?? null;
  const lastSeenAt               = (user as any).last_seen_at ?? null;
  const evAuthority: boolean     = (user as any).ev_approval_authority ?? false;
  const position: string | null  = (user as any).position ?? null;
  const lastSeen                 = formatLastSeen(lastSeenAt);
  const deptTokens               = getDeptTokens(user.department);
  const initials                 = (user.name || user.email || "U").charAt(0).toUpperCase();

  const STATUS_COLORS: Record<UserStatus, { bg: string; text: string; border: string }> = {
    active:    { bg: "var(--theme-status-success-bg)",  text: "var(--theme-status-success-fg)",  border: "var(--theme-status-success-border)" },
    inactive:  { bg: "var(--neuron-pill-inactive-bg)",  text: "var(--neuron-pill-inactive-text)", border: "var(--neuron-ui-border)" },
    suspended: { bg: "var(--theme-status-warning-bg)",  text: "var(--theme-status-warning-fg)",  border: "var(--theme-status-warning-border)" },
  };
  const statusChip = STATUS_COLORS[status];

  const STATUS_ACTIONS: { value: UserStatus; icon: React.ElementType; label: string }[] = [
    { value: "active",    icon: UserCheck,  label: "Active" },
    { value: "inactive",  icon: UserX,      label: "Inactive" },
    { value: "suspended", icon: UserMinus,  label: "Suspended" },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--neuron-bg-elevated)" }}>

      {/* ── Nav bar ── */}
      <div style={{ padding: "14px 48px", borderBottom: "1px solid var(--neuron-ui-border)", display: "flex", alignItems: "center", backgroundColor: "var(--neuron-bg-elevated)", flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => navigate("/admin/users")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--neuron-ink-muted)", fontSize: 13, fontWeight: 500, padding: "4px 8px", borderRadius: 6, transition: "color 0.12s ease" }}
          onMouseEnter={e => { e.currentTarget.style.color = "var(--neuron-ink-primary)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--neuron-ink-muted)"; }}
        >
          <ArrowLeft size={14} /> Users
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflow: "auto" }}>

        {/* ── Identity header ── */}
        <div style={{ padding: "32px 48px 28px", borderBottom: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--neuron-bg-elevated)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>

            {/* Avatar */}
            <div
              aria-hidden="true"
              style={{
              width: 60, height: 60, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", overflow: "hidden",
              background: deptTokens.bg, color: deptTokens.text,
            }}>
              {user.avatar_url
                ? <img src={user.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : initials}
            </div>

            {/* Identity details */}
            <div style={{ flex: 1, minWidth: 0 }}>

              {/* Name + status */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5, flexWrap: "wrap" }}>
                <h2 style={{ fontSize: 21, fontWeight: 600, color: "var(--neuron-ink-primary)", margin: 0, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                  {user.name || user.email}
                </h2>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                  background: statusChip.bg, color: statusChip.text, border: `1px solid ${statusChip.border}`,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
              </div>

              {/* Email + phone */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "var(--neuron-ink-muted)" }}>{user.email}</span>
                {phone && <>
                  <span style={{ color: "var(--neuron-ui-border)", fontSize: 13 }}>·</span>
                  <span style={{ fontSize: 13, color: "var(--neuron-ink-muted)" }}>{phone}</span>
                </>}
              </div>

              {/* Meta strip */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {/* Dept badge */}
                <span style={{
                  display: "inline-flex", alignItems: "center",
                  padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                  background: deptTokens.bg, color: deptTokens.text,
                }}>
                  {user.department}
                </span>

                {/* Role badge */}
                <span style={{
                  display: "inline-flex", alignItems: "center",
                  padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                  background: "var(--neuron-pill-inactive-bg)", color: "var(--neuron-ink-secondary)",
                }}>
                  {formatRole(user.role)}
                </span>

                {position && <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>· {position}</span>}
                {teamName && <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>· {teamName}</span>}

                <span style={{ color: "var(--neuron-ui-border)", fontSize: 12 }}>·</span>

                {user.created_at && (
                  <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>
                    Since {new Date(user.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "short" })}
                  </span>
                )}

                {lastSeen && (
                  <span style={{ fontSize: 12, color: lastSeen.online ? "var(--theme-status-success-fg)" : "var(--neuron-ink-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                    {lastSeen.online && (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--theme-status-success-fg)", display: "inline-block" }} />
                    )}
                    {lastSeen.text}
                  </span>
                )}
              </div>
            </div>

            {/* Edit button */}
            {!editing && (
              <button
                type="button"
                onClick={handleStartEdit}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid var(--neuron-ui-border)", background: "transparent", color: "var(--neuron-ink-muted)", fontSize: 13, fontWeight: 500, cursor: "pointer", flexShrink: 0, transition: "all 0.12s ease" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--neuron-state-hover)"; e.currentTarget.style.color = "var(--neuron-ink-primary)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--neuron-ink-muted)"; }}
              >
                <Pencil size={13} /> Edit
              </button>
            )}
          </div>

          {/* Edit form */}
          {editing && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--neuron-ui-border)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20, maxWidth: 440 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", marginBottom: 6 }}>Department</label>
                  <CustomDropdown label="" value={editDept} onChange={setEditDept}
                    options={["Business Development", "Pricing", "Operations", "Accounting", "HR", "Executive"].map(d => ({ value: d, label: d }))} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", marginBottom: 6 }}>Role</label>
                  <CustomDropdown label="" value={editRole} onChange={setEditRole}
                    options={[{ value: "staff", label: "Staff" }, { value: "team_leader", label: "Team Leader" }, { value: "manager", label: "Manager" }]} />
                </div>
                {editDept === "Operations" && <>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", marginBottom: 6 }}>Team</label>
                    <CustomDropdown label="" value={editTeamId} onChange={setEditTeamId}
                      options={[{ value: "", label: "No team" }, ...teams.map(t => ({ value: t.id, label: t.name }))]} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", marginBottom: 6 }}>Service Type</label>
                    <CustomDropdown label="" value={editServiceType} onChange={setEditServiceType}
                      options={[
                        { value: "", label: "No service type" },
                        { value: "Forwarding", label: "Forwarding" },
                        { value: "Brokerage", label: "Brokerage" },
                        { value: "Trucking", label: "Trucking" },
                        { value: "Marine Insurance", label: "Marine Insurance" },
                        { value: "Others", label: "Others" },
                      ]} />
                  </div>
                </>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={handleCancelEdit} style={{ height: 32, padding: "0 14px", borderRadius: 8, border: "1px solid var(--neuron-ui-border)", background: "transparent", color: "var(--neuron-ink-muted)", fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "background 0.12s ease" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--neuron-state-hover)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  Cancel
                </button>
                <button type="button" onClick={handleSaveProfile} disabled={savingProfile} style={{ height: 32, padding: "0 14px", borderRadius: 8, background: "var(--neuron-action-primary)", border: "none", color: "var(--neuron-action-primary-text)", fontSize: 13, fontWeight: 600, cursor: savingProfile ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, opacity: savingProfile ? 0.8 : 1, transition: "background 0.12s ease" }}
                  onMouseEnter={e => { if (!savingProfile) e.currentTarget.style.background = "var(--neuron-action-primary-hover)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--neuron-action-primary)"; }}
                >
                  {savingProfile && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
                  {savingProfile ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Two-column body ── */}
        <div style={{ display: "grid", gridTemplateColumns: "5fr 7fr", gap: 24, padding: "24px 48px 48px", alignItems: "start" }}>

          {/* ── LEFT COLUMN ── */}
          <div style={{ border: "1px solid var(--neuron-ui-border)", borderRadius: 12, overflow: "hidden", backgroundColor: "var(--neuron-bg-elevated)" }}>

            {/* ACCESS & PERMISSIONS */}
            <div style={{ padding: "18px 20px" }}>
              <span style={sectionLabel}>Access &amp; Permissions</span>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {accessSummary?.profileName ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 999, background: "var(--theme-bg-surface-tint)", fontSize: 12, fontWeight: 500, color: "var(--neuron-action-primary)" }}>
                      <Shield size={11} /> {accessSummary.profileName}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)", fontStyle: "italic" }}>Default access</span>
                  )}
                  {(accessSummary?.overrideCount ?? 0) > 0 && (
                    <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>
                      {accessSummary!.overrideCount} override{accessSummary!.overrideCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/admin/users", { state: { configureUser: { id: user.id, name: user.name, email: user.email, department: user.department, role: user.role } } })}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 10px", borderRadius: 7, border: "1px solid var(--neuron-ui-border)", background: "transparent", color: "var(--neuron-action-primary)", fontSize: 12, fontWeight: 500, cursor: "pointer", flexShrink: 0, transition: "background 0.12s ease" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--neuron-brand-green-100)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <Shield size={11} /> Configure
                </button>
              </div>
            </div>

            {/* TEAM — conditional */}
            {teamName && (
              <div style={{ padding: "18px 20px", borderTop: "1px solid var(--neuron-ui-border)" }}>
                <span style={sectionLabel}>Team</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)" }}>{teamName}</span>
              </div>
            )}

            {/* ACCOUNT */}
            <div style={{ padding: "18px 20px", borderTop: "1px solid var(--neuron-ui-border)" }}>
              <span style={sectionLabel}>Account</span>

              {/* Status */}
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", margin: "0 0 8px" }}>Status</p>
                <div style={{ display: "flex", gap: 6 }}>
                  {STATUS_ACTIONS.map(({ value, icon: Icon, label }) => {
                    const isCurrent = status === value;
                    const c = STATUS_COLORS[value];
                    return (
                      <button
                        type="button"
                        key={value}
                        onClick={() => !isCurrent && handleStatusChange(value)}
                        disabled={isCurrent || !!actionLoading}
                        style={{
                          height: 30, padding: "0 11px", borderRadius: 7,
                          fontSize: 12, fontWeight: 500,
                          cursor: isCurrent ? "default" : "pointer",
                          border: isCurrent ? `1px solid ${c.border}` : "1px solid var(--neuron-ui-border)",
                          background: isCurrent ? c.bg : "transparent",
                          color: isCurrent ? c.text : "var(--neuron-ink-muted)",
                          display: "flex", alignItems: "center", gap: 5,
                          opacity: (actionLoading && !isCurrent) ? 0.4 : 1,
                          transition: "all 0.12s ease",
                        }}
                        onMouseEnter={e => { if (!isCurrent && !actionLoading) e.currentTarget.style.background = "var(--neuron-state-hover)"; }}
                        onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = "transparent"; }}
                      >
                        {actionLoading === value
                          ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
                          : <Icon size={12} />}
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* EV Approval Authority */}
              <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", margin: "0 0 2px" }}>E-Voucher Approval</p>
                  <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", margin: 0 }}>Can approve and post e-vouchers</p>
                </div>
                <Switch checked={evAuthority} onCheckedChange={handleEvAuthorityToggle} />
              </div>

              {/* Reset Password */}
              <div>
                <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", margin: "0 0 8px" }}>Security</p>
                <button
                  type="button"
                  onClick={() => setResetOpen(v => !v)}
                  aria-expanded={resetOpen}
                  style={{ height: 30, padding: "0 11px", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid var(--neuron-ui-border)", background: "transparent", color: "var(--neuron-ink-primary)", transition: "background 0.12s ease" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--neuron-state-hover)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <KeyRound size={12} /> Reset Password
                </button>

                <AnimatePresence>
                  {resetOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                      style={{ marginTop: 10, padding: 14, background: "var(--neuron-pill-inactive-bg)", borderRadius: 8, border: "1px solid var(--neuron-ui-border)" }}
                    >
                      <p style={{ fontSize: 12, fontWeight: 500, color: "var(--neuron-ink-primary)", margin: "0 0 8px" }}>New password</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="password"
                          placeholder="Min. 8 characters"
                          value={newPw}
                          onChange={e => setNewPw(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && handleResetPassword()}
                          autoComplete="new-password"
                          minLength={8}
                          maxLength={128}
                          style={inputStyle}
                        />
                        <button
                          type="button"
                          onClick={handleResetPassword}
                          disabled={!!actionLoading}
                          style={{ height: 36, padding: "0 14px", borderRadius: 7, background: "var(--neuron-action-primary)", border: "none", color: "white", fontSize: 12, fontWeight: 600, cursor: actionLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5, transition: "background 0.12s ease" }}
                          onMouseEnter={e => { if (!actionLoading) e.currentTarget.style.background = "var(--neuron-action-primary-hover)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "var(--neuron-action-primary)"; }}
                        >
                          {actionLoading === "resetPassword" && <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />}
                          {actionLoading === "resetPassword" ? "Resetting…" : "Reset"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setResetOpen(false); setNewPw(""); }}
                          style={{ height: 36, padding: "0 10px", borderRadius: 7, border: "1px solid var(--neuron-ui-border)", background: "none", color: "var(--neuron-ink-muted)", fontSize: 12, cursor: "pointer", transition: "background 0.12s ease" }}
                          onMouseEnter={e => { e.currentTarget.style.background = "var(--neuron-state-hover)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* DANGER ZONE — collapsed by default */}
            {user.id !== currentUser?.id && (
              <div style={{ borderTop: "1px solid var(--neuron-ui-border)" }}>
                <button
                  type="button"
                  onClick={() => setDangerOpen(v => !v)}
                  aria-expanded={dangerOpen}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 20px", background: "none", border: "none", cursor: "pointer",
                    color: "var(--theme-status-danger-fg)", fontSize: 11, fontWeight: 600,
                    letterSpacing: "0.05em", textTransform: "uppercase",
                    transition: "background 0.12s ease",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--theme-status-danger-bg)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                >
                  Danger Zone
                  {dangerOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                <AnimatePresence>
                  {dangerOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                      style={{ padding: "0 20px 18px" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", margin: "0 0 3px" }}>Delete Account</p>
                          <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", margin: 0 }}>Permanently removes this account. Cannot be undone.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={!!actionLoading}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: "0 11px", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: actionLoading ? "not-allowed" : "pointer", border: "1px solid var(--theme-status-danger-border)", background: "transparent", color: "var(--theme-status-danger-fg)", flexShrink: 0, opacity: actionLoading ? 0.6 : 1, transition: "background 0.12s ease" }}
                          onMouseEnter={e => { if (!actionLoading) e.currentTarget.style.background = "var(--theme-status-danger-bg)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                        >
                          {actionLoading === "delete" ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={12} />}
                          Delete
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN — RECENT ACTIVITY ── */}
          <div style={{ border: "1px solid var(--neuron-ui-border)", borderRadius: 12, overflow: "hidden", backgroundColor: "var(--neuron-bg-elevated)" }}>

            {/* Header */}
            <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--neuron-ui-border)", display: "flex", alignItems: "center", gap: 8 }}>
              <Activity size={13} style={{ color: "var(--neuron-ink-muted)", flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--neuron-ink-muted)" }}>
                Recent Activity
              </span>
            </div>

            {/* Entries */}
            {activityLoading ? (
              <div>{Array.from({ length: 8 }).map((_, i) => <ActivitySkeletonRow key={i} />)}</div>
            ) : activityError ? (
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "var(--neuron-ink-muted)", margin: 0 }}>Could not load activity. Try refreshing the page.</p>
              </div>
            ) : activityFeed.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "var(--neuron-ink-muted)", margin: 0 }}>No recent activity recorded.</p>
              </div>
            ) : (
              <div>
                {activityFeed.map((entry, i) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 16px",
                      borderBottom: i < activityFeed.length - 1 ? "1px solid var(--neuron-ui-border)" : undefined,
                    }}
                  >
                    {/* Entity type dot */}
                    <div style={{
                      width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                      background: ENTITY_DOT[entry.entity_type] ?? "var(--neuron-ui-muted)",
                    }} />

                    {/* Action */}
                    <span style={{ fontSize: 12, fontWeight: 600, flexShrink: 0, color: ACTION_COLOR[entry.action_type] ?? "var(--neuron-ink-muted)" }}>
                      {ACTION_LABEL[entry.action_type] ?? entry.action_type}
                    </span>

                    {/* Entity type · name */}
                    <span style={{ fontSize: 13, color: "var(--neuron-ink-secondary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ENTITY_LABEL[entry.entity_type] ?? entry.entity_type} · {entry.entity_name}
                    </span>

                    {/* Timestamp */}
                    <span style={{ fontSize: 11, color: "var(--neuron-ink-muted)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                      {relativeTime(entry.created_at)}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Delete confirmation modal ── */}
      <NeuronModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title={`Delete ${user.name}'s account?`}
        description="This permanently removes their account and cannot be undone."
        confirmLabel="Delete Account"
        confirmIcon={<Trash2 size={15} />}
        onConfirm={handleDeleteConfirmed}
        variant="danger"
      />

    </div>
  );
}
