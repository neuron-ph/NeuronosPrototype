import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../../utils/supabase/client";
import { queryKeys } from "../../lib/queryKeys";
import { useUser } from "../../hooks/useUser";
import { logCreation, logDeletion, logActivity } from "../../utils/activityLog";
import { toast } from "sonner@2.0.3";
import {
  Plus, Users, Shield, UsersRound, BookMarked,
  ChevronRight, Edit, Trash2, Search, X,
} from "lucide-react";
import { DataTable, ColumnDef } from "../common/DataTable";
import { CreateUserPanel } from "./CreateUserPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "../ui/select";
import { PermissionsMatrix } from "./PermissionsMatrix";
import { AccessConfiguration, type ConfigUser } from "./AccessConfiguration";
import { AccessProfiles, ProfileEditor } from "./accessProfiles/AccessProfiles";
import type { AccessProfile } from "./accessProfiles/accessProfileTypes";
import type { UserRow } from "./userFormShared";
import { buildTeamMembershipUpdatePlan } from "./teamMembership";
import { usePermission } from "../../context/PermissionProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type Department = "Business Development" | "Pricing" | "Operations" | "Accounting" | "Executive" | "HR";
type Role = "staff" | "team_leader" | "supervisor" | "manager" | "executive";
type UserStatus = "active" | "inactive" | "suspended";

interface Team {
  id: string;
  name: string;
  department: string;
  leader_id: string | null;
}

interface TeamWithMembers extends Team {
  members: { id: string; name: string; role: Role; email: string; avatar_url?: string | null }[];
}

type OverrideScope = "department_wide" | "cross_department" | "full";

interface PermissionOverride {
  id: string;
  user_id: string;
  scope: OverrideScope;
  departments: string[] | null;
  granted_by: string | null;
  notes: string | null;
  created_at: string;
  module_grants?: Record<string, boolean>;
  applied_profile_id?: string | null;
  user?: { name: string; email: string; department: string; role: Role };
  grantor?: { name: string } | null;
  profile?: { id: string; name: string } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPARTMENTS: Department[] = [
  "Business Development", "Pricing", "Operations", "Accounting", "Executive", "HR",
];
const ROLES: { value: Role; label: string }[] = [
  { value: "staff",       label: "Staff" },
  { value: "team_leader", label: "Team Leader" },
  { value: "manager",     label: "Manager" },
];
const STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: "active",    label: "Active" },
  { value: "inactive",  label: "Inactive" },
  { value: "suspended", label: "Suspended" },
];

const DEPT_BADGE: Record<string, { bg: string; text: string }> = {
  "Business Development": { bg: "var(--neuron-dept-bd-bg)",        text: "var(--neuron-dept-bd-text)" },
  Pricing:               { bg: "var(--neuron-dept-pricing-bg)",    text: "var(--neuron-dept-pricing-text)" },
  Operations:            { bg: "var(--neuron-dept-ops-bg)",        text: "var(--neuron-dept-ops-text)" },
  Accounting:            { bg: "var(--neuron-dept-accounting-bg)", text: "var(--neuron-dept-accounting-text)" },
  HR:                    { bg: "var(--neuron-dept-hr-bg)",         text: "var(--neuron-dept-hr-text)" },
  Executive:             { bg: "var(--neuron-dept-executive-bg)",  text: "var(--neuron-dept-executive-text)" },
};

const ROLE_COLORS: Record<Role, { bg: string; text: string }> = {
  executive:   { bg: "var(--neuron-semantic-danger-bg)",  text: "var(--neuron-semantic-danger)" },
  manager:     { bg: "var(--neuron-status-accent-bg)",    text: "var(--neuron-status-accent-fg)" },
  supervisor:  { bg: "var(--neuron-semantic-info-bg)",    text: "var(--neuron-semantic-info)" },
  team_leader: { bg: "var(--theme-status-warning-bg)",    text: "var(--theme-status-warning-fg)" },
  staff:       { bg: "var(--neuron-bg-surface-subtle)",   text: "var(--theme-text-secondary)" },
};

const TEAM_ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  "Team Leader":    { bg: "var(--neuron-semantic-info-bg)",   text: "var(--neuron-semantic-info)" },
  "Supervisor":     { bg: "var(--theme-status-warning-bg)",   text: "var(--theme-status-warning-fg)" },
  "Representative": { bg: "var(--neuron-bg-surface-subtle)",  text: "var(--theme-text-secondary)" },
};

const STATUS_BADGE: Record<UserStatus, { bg: string; text: string; dot: string }> = {
  active:    { bg: "var(--theme-status-success-bg)", text: "var(--theme-status-success-fg)", dot: "var(--theme-status-success-fg)" },
  inactive:  { bg: "var(--neuron-pill-inactive-bg)", text: "var(--theme-text-muted)", dot: "var(--neuron-ui-muted)" },
  suspended: { bg: "var(--theme-status-warning-bg)", text: "var(--theme-status-warning-fg)", dot: "var(--theme-status-warning-fg)" },
};

const SCOPE_LABELS: Record<OverrideScope, { label: string; description: string; bg: string; text: string }> = {
  full:             { label: "Full Access",        description: "Sees everything across all departments.", bg: "var(--neuron-status-accent-bg)", text: "var(--neuron-status-accent-fg)" },
  department_wide:  { label: "Department Wide",    description: "Sees all records in their own department.", bg: "var(--theme-status-warning-bg)", text: "var(--theme-status-warning-fg)" },
  cross_department: { label: "Cross Department",   description: "Sees records in selected departments.", bg: "var(--neuron-semantic-info-bg)", text: "var(--neuron-semantic-info)" },
};

// ─── Shared cell components ───────────────────────────────────────────────────

function DeptBadge({ dept }: { dept: string }) {
  const c = DEPT_BADGE[dept] ?? { bg: "var(--neuron-pill-inactive-bg)", text: "var(--theme-text-secondary)" };
  return (
    <span style={{ borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 500, backgroundColor: c.bg, color: c.text }}>
      {dept}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_BADGE[status as UserStatus] ?? STATUS_BADGE.inactive;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 500, backgroundColor: c.bg, color: c.text }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
      {(status ?? "inactive").charAt(0).toUpperCase() + (status ?? "inactive").slice(1)}
    </span>
  );
}

function AvatarCell({ user }: { user: UserRow }) {
  const initials = (user.name || user.email || "U").charAt(0).toUpperCase();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: "var(--theme-status-success-bg)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
        {user.avatar_url
          ? <img src={user.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 11, fontWeight: 600, color: "var(--theme-action-primary-bg)" }}>{initials}</span>}
      </div>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", margin: 0 }}>{user.name || user.email}</p>
        <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", margin: 0 }}>{user.email}</p>
      </div>
    </div>
  );
}

function formatRole(role: string) {
  const labels: Record<string, string> = {
    executive: "Executive",
    manager: "Manager",
    supervisor: "Supervisor",
    team_leader: "Team Leader",
    staff: "Staff",
  };
  return labels[role] ?? "Staff";
}

// ─── Custom checkbox ──────────────────────────────────────────────────────────

function MemberCheckbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={e => { e.stopPropagation(); onChange(); }}
      style={{
        width: 16,
        height: 16,
        borderRadius: 4,
        border: checked ? "none" : "1.5px solid var(--neuron-ui-border)",
        backgroundColor: checked ? "var(--neuron-action-primary)" : "transparent",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        padding: 0,
        transition: "background-color 0.12s cubic-bezier(0.16,1,0.3,1), border-color 0.12s cubic-bezier(0.16,1,0.3,1)",
        outline: "none",
      }}
      onMouseEnter={e => { if (!checked) e.currentTarget.style.borderColor = "var(--neuron-action-primary)"; }}
      onMouseLeave={e => { if (!checked) e.currentTarget.style.borderColor = "var(--neuron-ui-border)"; }}
    >
      {checked && (
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
          <path d="M1 3.5L3.5 6L8 1" stroke="var(--neuron-action-primary-text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

interface FiltersState {
  search: string;
  dept: string;
  role: string;
  status: string;
  overrides: "all" | "yes" | "no";
}

function FilterBar({
  filters, onChange,
}: {
  filters: FiltersState;
  onChange: (f: FiltersState) => void;
}) {
  const hasActive = filters.search || filters.dept || filters.role || filters.status || filters.overrides !== "all";
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
      {/* Search */}
      <div style={{ position: "relative", minWidth: 220 }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--neuron-ink-muted)", pointerEvents: "none" }} />
        <input
          value={filters.search}
          onChange={e => onChange({ ...filters, search: e.target.value })}
          placeholder="Search name or email…"
          style={{ width: "100%", height: 34, paddingLeft: 32, paddingRight: 10, border: "1px solid var(--neuron-ui-border)", borderRadius: 8, fontSize: 13, outline: "none", backgroundColor: "var(--neuron-bg-elevated)", color: "var(--neuron-ink-primary)", boxSizing: "border-box", transition: "border-color 0.12s cubic-bezier(0.16,1,0.3,1)" }}
          onFocus={e => { e.currentTarget.style.borderColor = "var(--neuron-action-primary)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "var(--neuron-ui-border)"; }}
        />
      </div>

      {/* Dept */}
      <select
        value={filters.dept}
        onChange={e => onChange({ ...filters, dept: e.target.value })}
        style={{ height: 34, padding: "0 10px", border: "1px solid var(--neuron-ui-border)", borderRadius: 8, fontSize: 13, outline: "none", backgroundColor: "var(--neuron-bg-elevated)", color: filters.dept ? "var(--neuron-ink-primary)" : "var(--neuron-ink-muted)", cursor: "pointer", transition: "border-color 0.12s cubic-bezier(0.16,1,0.3,1)" }}
        onFocus={e => { e.currentTarget.style.borderColor = "var(--neuron-action-primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--neuron-action-primary) 15%, transparent)"; }}
        onBlur={e => { e.currentTarget.style.borderColor = "var(--neuron-ui-border)"; e.currentTarget.style.boxShadow = "none"; }}
      >
        <option value="">All Departments</option>
        {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
      </select>

      {/* Role */}
      <select
        value={filters.role}
        onChange={e => onChange({ ...filters, role: e.target.value })}
        style={{ height: 34, padding: "0 10px", border: "1px solid var(--neuron-ui-border)", borderRadius: 8, fontSize: 13, outline: "none", backgroundColor: "var(--neuron-bg-elevated)", color: filters.role ? "var(--neuron-ink-primary)" : "var(--neuron-ink-muted)", cursor: "pointer", transition: "border-color 0.12s cubic-bezier(0.16,1,0.3,1)" }}
        onFocus={e => { e.currentTarget.style.borderColor = "var(--neuron-action-primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--neuron-action-primary) 15%, transparent)"; }}
        onBlur={e => { e.currentTarget.style.borderColor = "var(--neuron-ui-border)"; e.currentTarget.style.boxShadow = "none"; }}
      >
        <option value="">All Roles</option>
        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>

      {/* Status */}
      <select
        value={filters.status}
        onChange={e => onChange({ ...filters, status: e.target.value })}
        style={{ height: 34, padding: "0 10px", border: "1px solid var(--neuron-ui-border)", borderRadius: 8, fontSize: 13, outline: "none", backgroundColor: "var(--neuron-bg-elevated)", color: filters.status ? "var(--neuron-ink-primary)" : "var(--neuron-ink-muted)", cursor: "pointer", transition: "border-color 0.12s cubic-bezier(0.16,1,0.3,1)" }}
        onFocus={e => { e.currentTarget.style.borderColor = "var(--neuron-action-primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--neuron-action-primary) 15%, transparent)"; }}
        onBlur={e => { e.currentTarget.style.borderColor = "var(--neuron-ui-border)"; e.currentTarget.style.boxShadow = "none"; }}
      >
        <option value="">All Statuses</option>
        {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>

      {/* Overrides toggle */}
      <select
        value={filters.overrides}
        onChange={e => onChange({ ...filters, overrides: e.target.value as FiltersState["overrides"] })}
        style={{ height: 34, padding: "0 10px", border: "1px solid var(--neuron-ui-border)", borderRadius: 8, fontSize: 13, outline: "none", backgroundColor: "var(--neuron-bg-elevated)", color: filters.overrides !== "all" ? "var(--neuron-ink-primary)" : "var(--neuron-ink-muted)", cursor: "pointer", transition: "border-color 0.12s cubic-bezier(0.16,1,0.3,1)" }}
        onFocus={e => { e.currentTarget.style.borderColor = "var(--neuron-action-primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--neuron-action-primary) 15%, transparent)"; }}
        onBlur={e => { e.currentTarget.style.borderColor = "var(--neuron-ui-border)"; e.currentTarget.style.boxShadow = "none"; }}
      >
        <option value="all">All Users</option>
        <option value="yes">Has Overrides</option>
        <option value="no">No Overrides</option>
      </select>

      {/* Clear */}
      {hasActive && (
        <button
          onClick={() => onChange({ search: "", dept: "", role: "", status: "", overrides: "all" })}
          style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid var(--neuron-ui-border)", background: "none", color: "var(--neuron-ink-muted)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
        >
          <X size={12} /> Clear
        </button>
      )}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab({
  onCountUpdate,
  onConfigureAccess,
}: {
  onCountUpdate: (count: number) => void;
  onConfigureAccess: (user: ConfigUser) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [filters, setFilters] = useState<FiltersState>({ search: "", dept: "", role: "", status: "", overrides: "all" });

  useEffect(() => {
    const channel = supabase
      .channel("users-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.users.list() });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: users = [], isLoading, isError, error: queryError } = useQuery({
    queryKey: queryKeys.users.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, email, name, department, role, team_role, team_id, is_active, status, avatar_url, teams!users_team_id_fkey(name)")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as (UserRow & { status?: UserStatus; teams?: { name: string } | null })[];
    },
  });

  // Update parent with user count
  useEffect(() => {
    onCountUpdate(users.length);
  }, [users.length, onCountUpdate]);

  const { data: accessSummaries = [] } = useQuery({
    queryKey: ["permission_overrides", "access-summary"],
    queryFn: async () => {
      const { data } = await supabase
        .from("permission_overrides")
        .select("user_id, module_grants, applied_profile_id, profile:applied_profile_id(id, name)");
      return (data ?? []) as unknown as Array<{ user_id: string; module_grants: Record<string, boolean> | null; applied_profile_id: string | null; profile?: { id: string; name: string } | null }>;
    },
    staleTime: 30 * 1000,
  });

  const accessSummaryByUserId = useMemo(
    () => new Map(accessSummaries.map(s => [s.user_id, s])),
    [accessSummaries]
  );

  const filtered = useMemo(() => {
    return users.filter(u => {
      const q = filters.search.toLowerCase();
      if (q && !u.name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false;
      if (filters.dept && u.department !== filters.dept) return false;
      if (filters.role && u.role !== filters.role) return false;
      const uStatus = u.status || (u.is_active ? "active" : "inactive");
      if (filters.status && uStatus !== filters.status) return false;
      if (filters.overrides === "yes" && !accessSummaryByUserId.has(u.id!)) return false;
      if (filters.overrides === "no" && accessSummaryByUserId.has(u.id!)) return false;
      return true;
    });
  }, [users, filters, accessSummaryByUserId]);

  const columns = useMemo<ColumnDef<UserRow & { status?: UserStatus; teams?: { name: string } | null }>[]>(() => [
    {
      header: "Name",
      width: "240px",
      cell: (u) => <AvatarCell user={u} />,
    },
    {
      header: "Department",
      width: "160px",
      cell: (u) => <DeptBadge dept={u.department} />,
    },
    {
      header: "Team",
      width: "140px",
      cell: (u) => <span style={{ fontSize: 13, color: "var(--neuron-ink-muted)" }}>{u.teams?.name || "—"}</span>,
    },
    {
      header: "Role",
      width: "110px",
      cell: (u) => {
        const rc = ROLE_COLORS[u.role as Role] ?? ROLE_COLORS.staff;
        return (
          <span style={{ fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: 999, backgroundColor: rc.bg, color: rc.text }}>
            {formatRole(u.role)}
          </span>
        );
      },
    },
    {
      header: "Team Role",
      width: "130px",
      cell: (u) => {
        const tr = (u as UserRow & { team_role?: string | null }).team_role;
        if (!tr) return <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>—</span>;
        const tc = TEAM_ROLE_COLORS[tr] ?? { bg: "var(--neuron-bg-surface-subtle)", text: "var(--theme-text-secondary)" };
        return (
          <span style={{ fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: 999, backgroundColor: tc.bg, color: tc.text }}>
            {tr}
          </span>
        );
      },
    },
    {
      header: "Status",
      width: "110px",
      cell: (u) => <StatusBadge status={u.status || (u.is_active ? "active" : "inactive")} />,
    },
    {
      header: "Access",
      width: "140px",
      cell: (u) => {
        const summary = accessSummaryByUserId.get(u.id!);
        const hasGrants = summary && Object.keys(summary.module_grants ?? {}).length > 0;
        const profileName = summary?.profile?.name ?? null;
        let accessBadge: React.ReactNode;
        if (!summary || !hasGrants) {
          accessBadge = <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>Default</span>;
        } else if (profileName) {
          accessBadge = (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--neuron-action-primary)", background: "color-mix(in oklch, var(--neuron-action-primary) 12%, transparent)", padding: "2px 8px", borderRadius: 999, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <BookMarked size={11} /> {profileName}
            </span>
          );
        } else {
          accessBadge = (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--neuron-status-accent-fg)", background: "var(--neuron-status-accent-bg)", padding: "2px 8px", borderRadius: 999 }}>
              <Shield size={11} /> Custom
            </span>
          );
        }
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {accessBadge}
            <button
              onClick={e => {
                e.stopPropagation();
                onConfigureAccess({ id: u.id!, name: u.name ?? "", email: u.email ?? "", department: u.department ?? "", role: u.role ?? "staff" });
              }}
              title="Configure access"
              style={{
                padding: "3px 8px", borderRadius: 6, border: "1px solid var(--neuron-ui-border)",
                background: "none", cursor: "pointer", fontSize: 12,
                color: "var(--neuron-ink-muted)", display: "flex", alignItems: "center", gap: 4,
                transition: "color 0.1s, border-color 0.1s",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--neuron-action-primary)"; e.currentTarget.style.borderColor = "var(--neuron-action-primary)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--neuron-ink-muted)"; e.currentTarget.style.borderColor = "var(--neuron-ui-border)"; }}
            >
              <Shield size={11} /> Edit
            </button>
          </div>
        );
      },
    },
  ], [accessSummaryByUserId]);

  if (isError) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center" }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: "var(--theme-status-danger-fg)", marginBottom: 6 }}>Failed to load users</p>
        <p style={{ fontSize: 13, color: "var(--neuron-ink-muted)" }}>Check your connection and try refreshing the page.</p>
      </div>
    );
  }

  const emptyMessage = (
    <div style={{ textAlign: "center", padding: "64px 0" }}>
      <Users size={36} style={{ color: "var(--neuron-ui-muted)", margin: "0 auto 16px" }} />
      <p style={{ fontSize: 14, fontWeight: 500, color: "var(--neuron-ink-primary)", marginBottom: 4 }}>No members yet</p>
      <p style={{ fontSize: 13, color: "var(--neuron-ink-muted)", marginBottom: 20 }}>Create an account to add someone to your workspace.</p>
      <button
        onClick={() => setShowCreate(true)}
        style={{ height: 38, padding: "0 18px", borderRadius: 8, background: "var(--neuron-bg-elevated)", border: "1px solid var(--neuron-action-primary)", color: "var(--neuron-action-primary)", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        <Plus size={15} /> Create Account
      </button>
    </div>
  );

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <p style={{ fontSize: 18, fontWeight: 600, color: "var(--neuron-ink-primary)" }}>
          Members{" "}
          <span style={{ fontWeight: 400, color: "var(--neuron-ink-muted)", fontSize: 15 }}>
            ({filtered.length}{filtered.length !== users.length ? ` of ${users.length}` : ""})
          </span>
        </p>
        <button
          onClick={() => setShowCreate(true)}
          style={{ height: 36, padding: "0 14px", borderRadius: 8, background: "var(--neuron-action-primary)", border: "none", color: "var(--neuron-action-primary-text)", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--neuron-action-primary-hover)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--neuron-action-primary)"; }}
        >
          <Plus size={15} /> Create Account
        </button>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      <DataTable
        data={filtered}
        columns={columns}
        isLoading={isLoading}
        emptyMessage={emptyMessage}
        onRowClick={(u) => navigate(`/admin/users/${u.id}`)}
      />

      {showCreate && (
        <CreateUserPanel
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={(newUser) => {
            // Optimistically insert the new user into the list immediately
            queryClient.setQueryData<(UserRow & { status?: UserStatus; teams?: { name: string } | null })[]>(
              queryKeys.users.list(),
              (old = []) => {
                const fresh = {
                  ...newUser,
                  is_active: (newUser as any).status !== "inactive",
                  teams: null,
                } as UserRow & { status?: UserStatus; teams?: null };
                return [...old, fresh].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
              }
            );
            // Also refetch in background to get server-canonical data
            queryClient.invalidateQueries({ queryKey: queryKeys.users.list() });
            setShowCreate(false);
          }}
        />
      )}
    </>
  );
}

// ─── Teams Tab ────────────────────────────────────────────────────────────────

function InlineTeamCreateRow({
  dept,
  users,
  onSaved,
  onCancel,
}: {
  dept: Department;
  users: { id: string; name: string }[];
  onSaved: (teamId: string) => void;
  onCancel: () => void;
}) {
  const { user: currentUser } = useUser();
  const [name, setName]             = useState("");
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>({});
  const [saving, setSaving]         = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Team name is required."); return; }
    setSaving(true);
    const { data: newTeam, error } = await supabase
      .from("teams")
      .insert({ name: name.trim(), department: dept, leader_id: null })
      .select()
      .single();
    if (error) {
      setSaving(false);
      toast.error(`Failed to create team: ${error.message}`);
      return;
    }

    const memberEntries = Object.entries(memberRoles).filter(([, r]) => r);
    for (const [userId, role] of memberEntries) {
      const { error: memberError } = await supabase
        .from("users")
        .update({ team_id: newTeam.id, team_role: role })
        .eq("id", userId);

      if (memberError) {
        await supabase.from("teams").delete().eq("id", newTeam.id);
        setSaving(false);
        toast.error(`Team member assignment failed: ${memberError.message}`);
        return;
      }
    }
    const actor = { id: currentUser?.id ?? "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" };
    logCreation("team", newTeam.id, newTeam.name ?? newTeam.id, actor);
    toast.success(`Team "${name.trim()}" created.`);
    setSaving(false);
    onSaved(newTeam.id);
  };

  const assignedIds = Object.keys(memberRoles).filter(id => memberRoles[id]);
  const availableToAdd = users.filter(u => !assignedIds.includes(u.id));

  const addMember = (userId: string) => {
    setMemberRoles(prev => ({ ...prev, [userId]: "Representative" }));
  };

  const removeMember = (userId: string) => {
    setMemberRoles(prev => { const next = { ...prev }; delete next[userId]; return next; });
  };

  return (
    <div style={{ padding: "14px 20px", borderTop: "1px solid var(--neuron-ui-border)", background: "var(--neuron-bg-page)", display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <Label style={{ fontSize: 12, marginBottom: 4, display: "block", color: "var(--neuron-ink-muted)" }}>Team Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., North Luzon BD Team" autoFocus style={{ height: 34, fontSize: 13 }} />
      </div>
      <div>
        <Label style={{ fontSize: 12, marginBottom: 4, display: "block", color: "var(--neuron-ink-muted)" }}>Members</Label>
        <div style={{ border: "1px solid var(--neuron-ui-border)", borderRadius: 8, overflow: "hidden" }}>
          {assignedIds.length === 0 && (
            <p style={{ padding: "10px 14px", fontSize: 13, color: "var(--neuron-ink-muted)" }}>No members added yet.</p>
          )}
          {assignedIds.map((uid, idx) => {
            const u = users.find(x => x.id === uid);
            if (!u) return null;
            return (
              <div key={uid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: idx > 0 ? "1px solid var(--neuron-ui-border)" : undefined }}>
                <span style={{ fontSize: 13, color: "var(--neuron-ink-primary)", flex: 1 }}>{u.name}</span>
                <Select value={memberRoles[uid]} onValueChange={v => setMemberRoles(prev => ({ ...prev, [uid]: v }))}>
                  <SelectTrigger style={{ height: 28, fontSize: 12, width: 148 }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Team Leader">Team Leader</SelectItem>
                    <SelectItem value="Supervisor">Supervisor</SelectItem>
                    <SelectItem value="Representative">Representative</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  onClick={() => removeMember(uid)}
                  style={{ padding: 4, background: "none", border: "none", cursor: "pointer", color: "var(--neuron-ink-muted)", display: "flex", alignItems: "center", borderRadius: 4, flexShrink: 0 }}
                  title="Remove from team"
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
          {availableToAdd.length > 0 && (
            <div style={{ padding: "8px 14px", borderTop: assignedIds.length > 0 ? "1px solid var(--neuron-ui-border)" : undefined, background: "var(--neuron-bg-page)" }}>
              <Select value="" onValueChange={addMember}>
                <SelectTrigger style={{ height: 28, fontSize: 12, color: "var(--neuron-ink-muted)" }}>
                  <SelectValue placeholder="Add a member…" />
                </SelectTrigger>
                <SelectContent>
                  {availableToAdd.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={onCancel} disabled={saving} style={{ height: 32, fontSize: 13 }}>Cancel</Button>
        <Button onClick={handleCreate} disabled={saving} style={{ height: 32, fontSize: 13, background: "var(--neuron-action-primary)", color: "var(--neuron-action-primary-text)", border: "none" }}>
          {saving ? "Creating…" : "Create Team"}
        </Button>
      </div>
    </div>
  );
}

function InlineTeamEditRow({
  team,
  users,
  onSaved,
  onCancel,
}: {
  team: Team;
  users: { id: string; name: string; department: string; team_id: string | null; team_role?: string | null }[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName]               = useState(team.name);
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>({});
  const [saving, setSaving]           = useState(false);

  const deptUsers = users.filter(u => u.department === team.department);

  // Init member roles from current DB state
  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const u of users) {
      if (u.team_id === team.id) {
        initial[u.id] = u.team_role ?? "Representative";
      }
    }
    setMemberRoles(initial);
  }, [team.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Team name is required."); return; }
    setSaving(true);
    const { error } = await supabase.from("teams").update({ name: name.trim() }).eq("id", team.id);
    if (error) {
      setSaving(false);
      toast.error(`Failed to update team: ${error.message}`);
      return;
    }

    const plan = buildTeamMembershipUpdatePlan({
      teamId: team.id,
      currentMembers: users,
      memberRoles,
    });

    for (const userId of plan.removals) {
      const { error: removeError } = await supabase
        .from("users")
        .update({ team_id: null, team_role: null })
        .eq("id", userId);

      if (removeError) {
        setSaving(false);
        toast.error(`Failed to remove team member: ${removeError.message}`);
        return;
      }
    }

    for (const { userId, role } of plan.assignments) {
      const { error: assignError } = await supabase
        .from("users")
        .update({ team_id: team.id, team_role: role })
        .eq("id", userId);

      if (assignError) {
        setSaving(false);
        toast.error(`Failed to save team member: ${assignError.message}`);
        return;
      }
    }

    setSaving(false);
    toast.success("Team updated.");
    onSaved();
  };

  const assignedIds = Object.keys(memberRoles).filter(id => memberRoles[id]);
  const availableToAdd = deptUsers.filter(u => !assignedIds.includes(u.id));

  const addMember = (userId: string) => {
    setMemberRoles(prev => ({ ...prev, [userId]: "Representative" }));
  };

  const removeMember = (userId: string) => {
    setMemberRoles(prev => { const next = { ...prev }; delete next[userId]; return next; });
  };

  return (
    <div style={{ padding: "14px 20px", borderTop: "1px solid var(--neuron-ui-border)", background: "var(--neuron-bg-page)", display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <Label style={{ fontSize: 12, marginBottom: 4, display: "block", color: "var(--neuron-ink-muted)" }}>Team Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} autoFocus style={{ height: 34, fontSize: 13 }} />
      </div>
      <div>
        <Label style={{ fontSize: 12, marginBottom: 4, display: "block", color: "var(--neuron-ink-muted)" }}>Members</Label>
        <div style={{ border: "1px solid var(--neuron-ui-border)", borderRadius: 8, overflow: "hidden" }}>
          {assignedIds.length === 0 && (
            <p style={{ padding: "10px 14px", fontSize: 13, color: "var(--neuron-ink-muted)" }}>No members assigned yet.</p>
          )}
          {assignedIds.map((uid, idx) => {
            const u = deptUsers.find(x => x.id === uid);
            if (!u) return null;
            return (
              <div key={uid} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: idx > 0 ? "1px solid var(--neuron-ui-border)" : undefined }}>
                <span style={{ fontSize: 13, color: "var(--neuron-ink-primary)", flex: 1 }}>{u.name}</span>
                <Select value={memberRoles[uid]} onValueChange={v => setMemberRoles(prev => ({ ...prev, [uid]: v }))}>
                  <SelectTrigger style={{ height: 28, fontSize: 12, width: 148 }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Team Leader">Team Leader</SelectItem>
                    <SelectItem value="Supervisor">Supervisor</SelectItem>
                    <SelectItem value="Representative">Representative</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  onClick={() => removeMember(uid)}
                  style={{ padding: 4, background: "none", border: "none", cursor: "pointer", color: "var(--neuron-ink-muted)", display: "flex", alignItems: "center", borderRadius: 4, flexShrink: 0 }}
                  title="Remove from team"
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
          {availableToAdd.length > 0 && (
            <div style={{ padding: "8px 14px", borderTop: assignedIds.length > 0 ? "1px solid var(--neuron-ui-border)" : undefined, background: "var(--neuron-bg-page)" }}>
              <Select value="" onValueChange={addMember}>
                <SelectTrigger style={{ height: 28, fontSize: 12, color: "var(--neuron-ink-muted)" }}>
                  <SelectValue placeholder="Add a member…" />
                </SelectTrigger>
                <SelectContent>
                  {availableToAdd.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={onCancel} disabled={saving} style={{ height: 32, fontSize: 13 }}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving} style={{ height: 32, fontSize: 13, background: "var(--neuron-action-primary)", color: "var(--neuron-action-primary-text)", border: "none" }}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

function TeamsTab({ onCountUpdate }: { onCountUpdate: (count: number) => void }) {
  const queryClient = useQueryClient();
  const { user: currentUser } = useUser();
  const [expanded, setExpanded]           = useState<string | null>(null);
  const [creatingInDept, setCreatingInDept]   = useState<string | null>(null);
  const [editingTeamId, setEditingTeamId]     = useState<string | null>(null);
  const [deletingId, setDeletingId]           = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: teams = [], refetch: fetchTeams } = useQuery({
    queryKey: queryKeys.teams.list(),
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("id, name, department, leader_id").order("department").order("name");
      return (data ?? []) as Team[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: allUsers = [], refetch: fetchActiveUsers } = useQuery({
    queryKey: ["users", "active-list"],
    queryFn: async () => {
      const { data } = await supabase.from("users").select("id, name, role, department, email, team_id, team_role, avatar_url").eq("is_active", true).order("name");
      return (data ?? []) as { id: string; name: string; role: Role; department: string; email: string; team_id: string | null; team_role?: string | null; avatar_url?: string | null }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const teamsWithMembers = useMemo<TeamWithMembers[]>(() => teams.map(t => ({
    ...t,
    members: allUsers.filter(u => u.team_id === t.id).map(u => ({ id: u.id, name: u.name, role: u.role, email: u.email, avatar_url: u.avatar_url })),
  })), [teams, allUsers]);

  // Update parent with teams count
  useEffect(() => {
    onCountUpdate(teams.length);
  }, [teams.length, onCountUpdate]);

  const byDept = useMemo(() => DEPARTMENTS.reduce<Record<string, TeamWithMembers[]>>((acc, dept) => {
    acc[dept] = teamsWithMembers.filter(t => t.department === dept);
    return acc;
  }, {}), [teamsWithMembers]);

  const deptUsersFor = useCallback((dept: Department) => allUsers.filter(u => u.department === dept), [allUsers]);

  const refreshTeamsData = useCallback(async () => {
    await Promise.all([
      fetchTeams(),
      fetchActiveUsers(),
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.all() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all() }),
    ]);
  }, [fetchActiveUsers, fetchTeams, queryClient]);

  const handleDeleteConfirmed = async (teamId: string, teamName: string) => {
    setConfirmDeleteId(null);
    setDeletingId(teamId);
    const { error: memberError } = await supabase.from("users").update({ team_id: null, team_role: null }).eq("team_id", teamId);
    if (memberError) {
      setDeletingId(null);
      toast.error(`Failed to clear team members: ${memberError.message}`);
      return;
    }
    const { error } = await supabase.from("teams").delete().eq("id", teamId);
    setDeletingId(null);
    if (error) { toast.error("Failed to delete team."); return; }
    const actor = { id: currentUser?.id ?? "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" };
    logDeletion("team", teamId, teamName, actor);
    toast.success(`Team "${teamName}" deleted.`);
    void refreshTeamsData();
  };

  const totalTeams = teams.length;
  const totalMembers = allUsers.filter(u => u.team_id !== null).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 18, fontWeight: 600, color: "var(--neuron-ink-primary)", marginBottom: 2 }}>
            Teams{" "}
            <span style={{ fontWeight: 400, color: "var(--neuron-ink-muted)", fontSize: 15 }}>({totalTeams})</span>
          </p>
          <p style={{ fontSize: 13, color: "var(--neuron-ink-muted)" }}>
            {totalMembers} assigned member{totalMembers !== 1 ? "s" : ""} across all teams
          </p>
        </div>
      </div>

      {/* Department sections */}
      {DEPARTMENTS.map(dept => {
        const deptTeams = byDept[dept] ?? [];
        const colors = DEPT_BADGE[dept] ?? { bg: "var(--neuron-pill-inactive-bg)", text: "var(--theme-text-secondary)" };
        return (
          <div key={dept} style={{ border: "1px solid var(--neuron-ui-border)", borderRadius: 12, overflow: "hidden", background: "var(--neuron-bg-elevated)" }}>
            {/* Dept header */}
            <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--neuron-ui-border)", background: "var(--neuron-bg-page)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-flex", padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 500, backgroundColor: colors.bg, color: colors.text }}>
                  {dept}
                </span>
                <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>
                  {deptTeams.length} {deptTeams.length === 1 ? "team" : "teams"}
                </span>
              </div>
              <button
                onClick={() => setCreatingInDept(dept)}
                style={{ fontSize: 12, fontWeight: 500, color: "var(--neuron-action-primary)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4 }}
              >
                <Plus size={12} /> Add Team
              </button>
            </div>

            {/* Teams list */}
            {deptTeams.length === 0 && creatingInDept !== dept && (
              <div style={{ padding: "20px", fontSize: 13, color: "var(--neuron-ink-muted)", textAlign: "center" }}>No teams yet.</div>
            )}

            {deptTeams.map((team, idx) => {
              const isEditing = editingTeamId === team.id;
              const isExpanded = expanded === team.id && !isEditing;
              const leader = allUsers.find(u => u.id === team.leader_id);
              return (
                <div key={team.id} style={{ borderTop: idx > 0 || deptTeams.length > 0 ? "1px solid var(--neuron-ui-border)" : undefined }}>
                  {isEditing ? (
                    <motion.div
                      key={`edit-${team.id}`}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <InlineTeamEditRow
                        team={team}
                        users={allUsers}
                        onSaved={() => { setEditingTeamId(null); void refreshTeamsData(); }}
                        onCancel={() => setEditingTeamId(null)}
                      />
                    </motion.div>
                  ) : (
                    <>
                      {/* Team header row */}
                      <button
                        aria-expanded={isExpanded}
                        aria-controls={`team-members-${team.id}`}
                        onClick={() => setExpanded(isExpanded ? null : team.id)}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--neuron-bg-page)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = ""; }}
                        style={{
                          width: "100%",
                          padding: "11px 20px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          cursor: "pointer",
                          background: "none",
                          border: "none",
                          textAlign: "left",
                          transition: "background-color 0.12s cubic-bezier(0.16,1,0.3,1)",
                        }}

                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <motion.div
                            animate={{ rotate: isExpanded ? 90 : 0 }}
                            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                            style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
                          >
                            <ChevronRight size={13} style={{ color: "var(--neuron-ink-muted)" }} />
                          </motion.div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--neuron-ink-primary)" }}>{team.name}</span>
                          <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>
                            {team.members.length} {team.members.length === 1 ? "member" : "members"}
                          </span>
                          {leader && (
                            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--theme-action-primary-bg)", background: "var(--theme-status-success-bg)", padding: "2px 8px", borderRadius: 999 }}>
                              {leader.name}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 2 }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => { setEditingTeamId(team.id); setExpanded(null); }}
                            aria-label={`Edit ${team.name}`}
                            style={{ padding: "8px 10px", background: "transparent", border: "none", cursor: "pointer", color: "var(--neuron-ink-muted)", borderRadius: 6, display: "flex", alignItems: "center" }}
                            title="Edit team"
                          >
                            <Edit size={13} />
                          </button>
                          <AnimatePresence mode="wait" initial={false}>
                            {confirmDeleteId === team.id ? (
                              <motion.div
                                key="confirm"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
                                style={{ display: "flex", alignItems: "center", gap: 4 }}
                              >
                                <button
                                  onClick={() => handleDeleteConfirmed(team.id, team.name)}
                                  disabled={deletingId === team.id}
                                  style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--theme-status-danger-fg)", background: "var(--theme-status-danger-bg, #fef2f2)", color: "var(--theme-status-danger-fg)", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                                >
                                  {deletingId === team.id ? "Deleting…" : "Delete"}
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--neuron-ui-border)", background: "none", color: "var(--neuron-ink-muted)", fontSize: 11, cursor: "pointer" }}
                                  aria-label="Cancel delete"
                                >
                                  Cancel
                                </button>
                              </motion.div>
                            ) : (
                              <motion.button
                                key="icon"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
                                onClick={() => setConfirmDeleteId(team.id)}
                                disabled={deletingId === team.id}
                                aria-label={`Delete ${team.name}`}
                                title="Delete team"
                                style={{ padding: "8px 10px", background: "transparent", border: "none", cursor: "pointer", color: "var(--theme-status-danger-fg)", borderRadius: 6, display: "flex", alignItems: "center" }}
                              >
                                <Trash2 size={13} />
                              </motion.button>
                            )}
                          </AnimatePresence>
                        </div>
                      </button>

                      {/* Expanded member table */}
                      <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          key="members"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                          style={{ overflow: "hidden" }}
                        >
                        <div id={`team-members-${team.id}`} style={{ borderTop: "1px solid var(--neuron-ui-border)" }}>
                          {/* Table header */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", padding: "8px 20px 8px 44px", background: "var(--neuron-bg-page)" }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Name</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Role</span>
                          </div>
                          {/* Member rows */}
                          {team.members.length === 0 ? (
                            <div style={{ padding: "16px 20px 16px 44px", fontSize: 13, color: "var(--neuron-ink-muted)" }}>No members assigned yet.</div>
                          ) : (
                            team.members.map((m, mIdx) => {
                              const rc = ROLE_COLORS[m.role] ?? ROLE_COLORS.staff;
                              const isLeader = m.id === team.leader_id;
                              const initial = (m.name || m.email || "?").charAt(0).toUpperCase();
                              return (
                                <div
                                  key={m.id}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 140px",
                                    padding: "10px 20px 10px 44px",
                                    alignItems: "center",
                                    borderTop: mIdx > 0 ? "1px solid var(--neuron-ui-border)" : undefined,
                                    background: "var(--neuron-bg-elevated)",
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    {/* Avatar */}
                                    <div style={{
                                      width: 32, height: 32, borderRadius: "50%",
                                      backgroundColor: isLeader ? "var(--theme-status-success-bg)" : "var(--neuron-bg-surface-subtle)",
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                      flexShrink: 0, border: "1px solid var(--neuron-ui-border)",
                                      overflow: "hidden",
                                    }}>
                                      {m.avatar_url
                                        ? <img src={m.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                        : <span style={{ fontSize: 12, fontWeight: 600, color: isLeader ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-muted)" }}>{initial}</span>
                                      }
                                    </div>
                                    {/* Name + email */}
                                    <div>
                                      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", margin: 0, lineHeight: 1.3 }}>{m.name}</p>
                                      <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", margin: 0, lineHeight: 1.3 }}>{m.email}</p>
                                    </div>
                                  </div>
                                  {/* Role badge */}
                                  <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 999, backgroundColor: rc.bg, color: rc.text, justifySelf: "start" }}>
                                    {ROLES.find(r => r.value === m.role)?.label ?? m.role}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                        </motion.div>
                      )}
                      </AnimatePresence>
                    </>
                  )}
                </div>
              );
            })}

            {/* Inline create row (per dept) */}
            <AnimatePresence>
            {creatingInDept === dept && (
              <motion.div
                key={`create-${dept}`}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                style={{ overflow: "hidden", borderTop: deptTeams.length > 0 ? "1px solid var(--neuron-ui-border)" : undefined }}
              >
                <InlineTeamCreateRow
                  dept={dept as Department}
                  users={deptUsersFor(dept as Department)}
                  onSaved={() => { setCreatingInDept(null); void refreshTeamsData(); }}
                  onCancel={() => setCreatingInDept(null)}
                />
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

// ─── Access Overrides Tab ─────────────────────────────────────────────────────

function AccessOverridesTab({ onCountUpdate }: { onCountUpdate: (count: number) => void }) {
  const queryClient = useQueryClient();
  const { user: currentUser } = useUser();
  const [search, setSearch]     = useState("");
  const [adding, setAdding]     = useState(false);
  const [saving, setSaving]     = useState(false);
  const [revokingId, setRevokingId]       = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [matrixUser, setMatrixUser] = useState<{ id: string; name: string; role: string; department: string } | null>(null);

  const [formUserId, setFormUserId]   = useState("");
  const [formScope, setFormScope]     = useState<OverrideScope>("department_wide");
  const [formDepts, setFormDepts]     = useState<string[]>([]);
  const [formNotes, setFormNotes]     = useState("");

  const { data: overrides = [], isFetching } = useQuery({
    queryKey: ["permission_overrides"],
    queryFn: async () => {
      const { data } = await supabase
        .from("permission_overrides")
        .select("*, user:user_id(name, email, department, role), grantor:granted_by(name), profile:applied_profile_id(id, name)")
        .order("created_at", { ascending: false });
      return (data ?? []) as unknown as PermissionOverride[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["users", "active-list"],
    queryFn: async () => {
      const { data } = await supabase.from("users").select("id, name, email, department, role").eq("is_active", true).order("name");
      return (data ?? []) as { id: string; name: string; email: string; department: string; role: Role }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Update parent with overrides count
  useEffect(() => {
    onCountUpdate(overrides.length);
  }, [overrides.length, onCountUpdate]);

  const filteredOverrides = useMemo(() => {
    if (!search.trim()) return overrides;
    const q = search.toLowerCase();
    return overrides.filter(ov =>
      ov.user?.name?.toLowerCase().includes(q) || ov.user?.email?.toLowerCase().includes(q)
    );
  }, [overrides, search]);

  const handleAdd = async () => {
    if (!formUserId) { toast.error("Select a user."); return; }
    if (formScope === "cross_department" && formDepts.length === 0) { toast.error("Select at least one department."); return; }
    setSaving(true);
    const payload = {
      user_id: formUserId,
      scope: formScope,
      departments: formScope === "cross_department" ? formDepts : null,
      granted_by: currentUser?.id ?? null,
      notes: formNotes.trim() || null,
      applied_profile_id: null,
    };
    const { error } = await supabase.from("permission_overrides").upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) { toast.error("Failed to save override."); return; }
    const targetUser = allUsers.find(u => u.id === formUserId);
    const actor = { id: currentUser?.id ?? "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" };
    logActivity("user", formUserId, targetUser?.name ?? formUserId, "updated", actor, { description: "Permissions updated" });
    toast.success("Access override saved.");
    setAdding(false);
    setFormUserId(""); setFormScope("department_wide"); setFormDepts([]); setFormNotes("");
    queryClient.invalidateQueries({ queryKey: ["permission_overrides"] });
    queryClient.invalidateQueries({ queryKey: ["permission_overrides", "access-summary"] });
  };

  const handleRevokeConfirmed = async (ov: PermissionOverride) => {
    setConfirmRevokeId(null);
    setRevokingId(ov.id);
    const { error } = await supabase.from("permission_overrides").delete().eq("id", ov.id);
    setRevokingId(null);
    if (error) { toast.error("Failed to revoke override."); return; }
    toast.success("Override revoked.");
    queryClient.invalidateQueries({ queryKey: ["permission_overrides"] });
    queryClient.invalidateQueries({ queryKey: ["permission_overrides", "access-summary"] });
  };

  const toggleDept = (dept: string) =>
    setFormDepts(prev => prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]);

  const existingOverrideUserIds = new Set(overrides.map(o => o.user_id));
  const eligibleUsers = allUsers.filter(u => !existingOverrideUserIds.has(u.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 18, fontWeight: 600, color: "var(--neuron-ink-primary)", marginBottom: 2 }}>
            Access Overrides{" "}
            <span style={{ fontWeight: 400, color: "var(--neuron-ink-muted)", fontSize: 15 }}>({overrides.length})</span>
          </p>
          <p style={{ fontSize: 13, color: "var(--neuron-ink-muted)" }}>
            Grant elevated data visibility or custom module permissions. Click a user to view and edit their permission matrix.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          style={{ height: 36, padding: "0 14px", borderRadius: 8, background: "var(--neuron-action-primary)", border: "none", color: "var(--neuron-action-primary-text)", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", marginLeft: 16 }}
        >
          <Plus size={14} /> Grant Override
        </button>
      </div>

      {/* Search */}
      <div style={{ position: "relative", maxWidth: 300 }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--neuron-ink-muted)", pointerEvents: "none" }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          style={{ width: "100%", height: 34, paddingLeft: 32, paddingRight: 10, border: "1px solid var(--neuron-ui-border)", borderRadius: 8, fontSize: 13, outline: "none", backgroundColor: "var(--neuron-bg-elevated)", color: "var(--neuron-ink-primary)", boxSizing: "border-box", transition: "border-color 0.12s cubic-bezier(0.16,1,0.3,1)" }}
          onFocus={e => { e.currentTarget.style.borderColor = "var(--neuron-action-primary)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "var(--neuron-ui-border)"; }}
        />
      </div>

      {/* Overrides list */}
      <div style={{ border: "1px solid var(--neuron-ui-border)", borderRadius: 10, overflow: "hidden", background: "var(--neuron-bg-elevated)" }}>
        {isFetching && overrides.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--neuron-ink-muted)", fontSize: 14 }}>Loading…</div>
        ) : filteredOverrides.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <Shield size={28} style={{ color: "var(--theme-border-default)", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 14, color: "var(--neuron-ink-muted)" }}>
              {search ? "No overrides match your search." : "No access overrides configured."}
            </p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.5fr 1.5fr 1fr auto", gap: 0, padding: "10px 20px", background: "var(--neuron-pill-inactive-bg)", borderBottom: "1px solid var(--neuron-ui-border)" }}>
              {["User", "Scope", "Departments", "Granted By", "Notes", ""].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 500, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
              ))}
            </div>
            {filteredOverrides.map((ov, idx) => {
              const scopeMeta = SCOPE_LABELS[ov.scope];
              return (
                <div
                  key={ov.id}
                  style={{
                    display: "grid", gridTemplateColumns: "2fr 1fr 1.5fr 1.5fr 1fr auto", gap: 0,
                    padding: "14px 20px", alignItems: "center",
                    borderTop: idx > 0 ? "1px solid var(--neuron-ui-border)" : "none",
                    cursor: "pointer",
                  }}
                  onClick={() => ov.user && setMatrixUser({ id: ov.user_id, name: ov.user.name, role: ov.user.role, department: ov.user.department })}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--neuron-pill-inactive-bg)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}
                >
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", margin: 0 }}>{ov.user?.name ?? ov.user_id}</p>
                    <p style={{ fontSize: 11, color: "var(--neuron-ink-muted)", margin: 0 }}>{ov.user?.email}</p>
                    {ov.profile?.name && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 3, fontSize: 10, fontWeight: 500, color: "var(--neuron-action-primary)", background: "color-mix(in srgb, var(--neuron-action-primary) 10%, transparent)", padding: "2px 6px", borderRadius: 999 }}>
                        <BookMarked size={10} /> {ov.profile.name}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 999, backgroundColor: scopeMeta.bg, color: scopeMeta.text, display: "inline-flex", width: "fit-content" }}>
                    {scopeMeta.label}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>
                    {ov.scope === "cross_department" && ov.departments?.length ? ov.departments.join(", ") : "—"}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>{ov.grantor?.name ?? "—"}</span>
                  <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>{ov.notes ?? "—"}</span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => ov.user && setMatrixUser({ id: ov.user_id, name: ov.user.name, role: ov.user.role, department: ov.user.department })}
                      style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--neuron-ui-border)", background: "none", color: "var(--neuron-ink-muted)", fontSize: 11, cursor: "pointer" }}
                      title="View permissions"
                    >
                      <Shield size={12} />
                    </button>
                    <AnimatePresence mode="wait" initial={false}>
                      {confirmRevokeId === ov.id ? (
                        <motion.div
                          key="confirm"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
                          style={{ display: "flex", alignItems: "center", gap: 4 }}
                        >
                          <button
                            onClick={() => handleRevokeConfirmed(ov)}
                            disabled={revokingId === ov.id}
                            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--theme-status-danger-fg)", background: "var(--theme-status-danger-bg, #fef2f2)", color: "var(--theme-status-danger-fg)", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                          >
                            {revokingId === ov.id ? "Revoking…" : "Confirm Revoke"}
                          </button>
                          <button
                            onClick={() => setConfirmRevokeId(null)}
                            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--neuron-ui-border)", background: "none", color: "var(--neuron-ink-muted)", fontSize: 11, cursor: "pointer" }}
                          >
                            Cancel
                          </button>
                        </motion.div>
                      ) : (
                        <motion.button
                          key="revoke"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
                          onClick={() => setConfirmRevokeId(ov.id)}
                          disabled={revokingId === ov.id}
                          style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--theme-status-danger-border)", background: "none", color: "var(--theme-status-danger-fg)", fontSize: 11, cursor: "pointer" }}
                        >
                          Revoke
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Permissions matrix dialog */}
      {matrixUser && (
        <Dialog open onOpenChange={() => setMatrixUser(null)}>
          <DialogContent style={{ maxWidth: 900, maxHeight: "90vh", overflow: "auto" }}>
            <DialogHeader>
              <DialogTitle style={{ fontSize: 16, color: "var(--neuron-ink-primary)" }}>
                {matrixUser.name} — Permissions
              </DialogTitle>
            </DialogHeader>
            <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", marginTop: 2, marginBottom: 16 }}>
              {matrixUser.department} · {formatRole(matrixUser.role)}
            </p>
            <PermissionsMatrix
              userId={matrixUser.id}
              userRole={matrixUser.role}
              userDepartment={matrixUser.department}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ["permission_overrides"] });
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Add Override Dialog */}
      {adding && (
        <Dialog open onOpenChange={() => setAdding(false)}>
          <DialogContent style={{ maxWidth: 480 }}>
            <DialogHeader>
              <DialogTitle style={{ fontSize: 18, color: "var(--theme-text-primary)" }}>Grant Access Override</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label style={{ fontSize: 13, marginBottom: 6, display: "block" }}>User</Label>
                <Select value={formUserId} onValueChange={setFormUserId}>
                  <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                  <SelectContent>
                    {eligibleUsers.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} <span style={{ color: "var(--theme-text-muted)" }}>· {u.department} · {ROLES.find(r => r.value === u.role)?.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label style={{ fontSize: 13, marginBottom: 6, display: "block" }}>Scope</Label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(Object.entries(SCOPE_LABELS) as [OverrideScope, typeof SCOPE_LABELS[OverrideScope]][]).map(([key, val]) => (
                    <button
                      key={key}
                      onClick={() => setFormScope(key)}
                      style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", border: `1px solid ${formScope === key ? "var(--theme-action-primary-bg)" : "var(--theme-border-default)"}`, borderRadius: 10, background: formScope === key ? "var(--theme-status-success-bg)" : "var(--theme-bg-surface)", cursor: "pointer", textAlign: "left" }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, backgroundColor: val.bg, color: val.text, whiteSpace: "nowrap", marginTop: 1 }}>{val.label}</span>
                      <span style={{ fontSize: 12, color: "var(--theme-text-muted)" }}>{val.description}</span>
                    </button>
                  ))}
                </div>
              </div>
              {formScope === "cross_department" && (
                <div>
                  <Label style={{ fontSize: 13, marginBottom: 6, display: "block" }}>Visible Departments</Label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {DEPARTMENTS.map(d => (
                      <button
                        key={d}
                        onClick={() => toggleDept(d)}
                        style={{ padding: "3px 12px", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer", border: `1px solid ${formDepts.includes(d) ? "var(--theme-action-primary-bg)" : "var(--theme-border-default)"}`, background: formDepts.includes(d) ? "var(--theme-status-success-bg)" : "var(--theme-bg-surface)", color: formDepts.includes(d) ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)" }}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <Label style={{ fontSize: 13, marginBottom: 6, display: "block" }}>Notes <span style={{ color: "var(--theme-text-muted)", fontWeight: 400 }}>(optional)</span></Label>
                <Input value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Reason for override…" />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Button variant="outline" onClick={() => setAdding(false)} disabled={saving}>Cancel</Button>
                <Button onClick={handleAdd} disabled={saving} className="bg-[var(--theme-action-primary-bg)] hover:bg-[var(--theme-action-primary-border)] text-white">
                  {saving ? "Saving…" : "Grant Override"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Tab navigation ───────────────────────────────────────────────────────────

type Tab = "users" | "teams" | "overrides" | "profiles";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "users",    label: "Users",            icon: Users },
  { id: "teams",    label: "Teams",            icon: UsersRound },
  { id: "overrides", label: "Access Overrides", icon: Shield },
  { id: "profiles",  label: "Access Profiles",  icon: BookMarked },
];

// ─── Tab counts context ────────────────────────────────────────────────────────

interface TabCounts {
  users: number;
  teams: number;
  overrides: number;
  profiles: number;
}

// ─── Root export ──────────────────────────────────────────────────────────────

export function UserManagement() {
  const { can } = usePermission();
  const location = useLocation();
  const canViewUsersTab          = can("admin_users_tab", "view");
  const canViewTeamsTab          = can("admin_teams_tab", "view");
  const canViewOverridesTab      = can("admin_overrides_tab", "view");
  const canViewAccessProfilesTab = can("admin_access_profiles_tab", "view");

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (canViewUsersTab)          return "users";
    if (canViewTeamsTab)          return "teams";
    if (canViewOverridesTab)      return "overrides";
    if (canViewAccessProfilesTab) return "profiles";
    return "users";
  });
  const [tabCounts, setTabCounts] = useState<TabCounts>({ users: 0, teams: 0, overrides: 0, profiles: 0 });
  const [configuringUser, setConfiguringUser] = useState<ConfigUser | null>(
    (location.state as any)?.configureUser ?? null
  );
  const [editingProfile, setEditingProfile] = useState<Partial<AccessProfile> | null | undefined>(undefined);
  const handleUsersCount = useCallback((count: number) => setTabCounts(prev => ({ ...prev, users: count })), []);
  const handleTeamsCount = useCallback((count: number) => setTabCounts(prev => ({ ...prev, teams: count })), []);
  const handleOverridesCount = useCallback((count: number) => setTabCounts(prev => ({ ...prev, overrides: count })), []);

  if (configuringUser) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="access-config"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          style={{ height: "100%" }}
        >
          <AccessConfiguration
            user={configuringUser}
            onBack={() => setConfiguringUser(null)}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  if (editingProfile !== undefined) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="profile-editor"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          style={{ height: "100%", overflowY: "auto", backgroundColor: "var(--neuron-bg-elevated)", padding: "0 48px 48px" }}
        >
          <ProfileEditor
            profile={editingProfile}
            onBack={() => setEditingProfile(undefined)}
            onSaved={() => setEditingProfile(undefined)}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--neuron-bg-elevated)" }}>
      {/* Page Header */}
      <div style={{ padding: "32px 48px 24px 48px", borderBottom: "1px solid var(--neuron-ui-border)" }}>
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: 32, fontWeight: 600, color: "var(--neuron-ink-primary)", letterSpacing: "-1.2px", marginBottom: 4 }}>
            Users
          </h1>
          <p style={{ fontSize: 14, color: "var(--neuron-ink-muted)", margin: 0 }}>
            Manage workspace accounts, teams, and access permissions
          </p>
        </div>

        {/* Tab nav — sliding underline via layoutId */}
        <div style={{ display: "flex", gap: "24px" }}>
          {TABS.filter(({ id }) =>
            (id === "users"     && canViewUsersTab)          ||
            (id === "teams"     && canViewTeamsTab)          ||
            (id === "overrides" && canViewOverridesTab)      ||
            (id === "profiles"  && canViewAccessProfilesTab)
          ).map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            const count = tabCounts[id as keyof TabCounts];
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 4px 14px",
                  background: "none",
                  border: "none",
                  borderBottom: "2px solid transparent",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: isActive ? "var(--neuron-action-primary)" : "var(--neuron-ink-secondary)",
                  cursor: "pointer",
                  transition: "color 0.15s cubic-bezier(0.16,1,0.3,1)",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = "var(--neuron-ink-primary)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = "var(--neuron-ink-secondary)";
                }}
              >
                <Icon size={16} />
                {label}
                {id !== "profiles" && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      backgroundColor: isActive ? "var(--theme-bg-surface-tint)" : "var(--neuron-pill-inactive-bg)",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: isActive ? "var(--neuron-action-primary)" : "var(--neuron-ink-muted)",
                      transition: "background-color 0.15s cubic-bezier(0.16,1,0.3,1), color 0.15s cubic-bezier(0.16,1,0.3,1)",
                    }}
                  >
                    {count}
                  </span>
                )}
                {isActive && (
                  <motion.div
                    layoutId="tab-underline"
                    style={{
                      position: "absolute",
                      bottom: -2,
                      left: 0,
                      right: 0,
                      height: 2,
                      backgroundColor: "var(--neuron-action-primary)",
                      borderRadius: "1px 1px 0 0",
                    }}
                    transition={{ type: "spring", stiffness: 480, damping: 38 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content — fades on switch */}
      <div style={{ flex: 1, overflow: "auto", padding: "28px 48px" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeTab === "users"     && canViewUsersTab          && <UsersTab onCountUpdate={handleUsersCount} onConfigureAccess={setConfiguringUser} />}
            {activeTab === "teams"     && canViewTeamsTab          && <TeamsTab onCountUpdate={handleTeamsCount} />}
            {activeTab === "overrides" && canViewOverridesTab      && <AccessOverridesTab onCountUpdate={handleOverridesCount} />}
            {activeTab === "profiles"  && canViewAccessProfilesTab && <AccessProfiles onConfigureAccess={setConfiguringUser} onEditProfile={setEditingProfile} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
