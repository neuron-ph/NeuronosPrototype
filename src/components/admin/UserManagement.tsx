import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { supabase } from "../../utils/supabase/client";
import { queryKeys } from "../../lib/queryKeys";
import { useUser } from "../../hooks/useUser";
import { logCreation, logDeletion, logActivity } from "../../utils/activityLog";
import { toast } from "sonner@2.0.3";
import {
  Plus, Users, Shield, UsersRound,
  ChevronDown, ChevronRight, Edit, Trash2, Search, X,
} from "lucide-react";
import { DataTable, ColumnDef } from "../common/DataTable";
import { CreateUserPanel } from "./CreateUserPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { PermissionsMatrix } from "./PermissionsMatrix";
import type { UserRow } from "./EditUserPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

type Department = "Business Development" | "Pricing" | "Operations" | "Accounting" | "Executive" | "HR";
type Role = "staff" | "team_leader" | "manager";
type UserStatus = "active" | "inactive" | "suspended";

interface Team {
  id: string;
  name: string;
  department: string;
  leader_id: string | null;
}

interface TeamWithMembers extends Team {
  members: { id: string; name: string; role: Role; email: string }[];
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
  user?: { name: string; email: string; department: string; role: Role };
  grantor?: { name: string } | null;
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
  manager:     { bg: "var(--neuron-status-accent-bg)", text: "var(--neuron-status-accent-fg)" },
  team_leader: { bg: "var(--theme-status-warning-bg)", text: "var(--theme-status-warning-fg)" },
  staff:       { bg: "var(--neuron-bg-surface-subtle)", text: "var(--theme-text-secondary)" },
};

const STATUS_BADGE: Record<UserStatus, { bg: string; text: string; dot: string }> = {
  active:    { bg: "var(--theme-status-success-bg)", text: "#166534", dot: "var(--theme-status-success-fg)" },
  inactive:  { bg: "var(--neuron-pill-inactive-bg)", text: "var(--theme-text-muted)", dot: "var(--neuron-ui-muted)" },
  suspended: { bg: "var(--theme-status-warning-bg)", text: "var(--theme-status-warning-fg)", dot: "var(--theme-status-warning-fg)" },
};

const SCOPE_LABELS: Record<OverrideScope, { label: string; description: string; bg: string; text: string }> = {
  full:             { label: "Full Access",        description: "Sees everything across all departments.", bg: "var(--neuron-status-accent-bg)", text: "var(--neuron-status-accent-fg)" },
  department_wide:  { label: "Department Wide",    description: "Sees all records in their own department.", bg: "var(--theme-status-warning-bg)", text: "var(--theme-status-warning-fg)" },
  cross_department: { label: "Cross Department",   description: "Sees records in selected departments.", bg: "var(--neuron-semantic-info-bg)", text: "#3730A3" },
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
  if (role === "team_leader") return "Team Leader";
  if (role === "manager") return "Manager";
  return "Staff";
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
  filters, onChange, overrideUserIds,
}: {
  filters: FiltersState;
  onChange: (f: FiltersState) => void;
  overrideUserIds: Set<string>;
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
          style={{ width: "100%", height: 34, paddingLeft: 32, paddingRight: 10, border: "1px solid var(--neuron-ui-border)", borderRadius: 8, fontSize: 13, outline: "none", backgroundColor: "var(--neuron-bg-elevated)", color: "var(--neuron-ink-primary)", boxSizing: "border-box" }}
        />
      </div>

      {/* Dept */}
      <select
        value={filters.dept}
        onChange={e => onChange({ ...filters, dept: e.target.value })}
        style={{ height: 34, padding: "0 10px", border: "1px solid var(--neuron-ui-border)", borderRadius: 8, fontSize: 13, outline: "none", backgroundColor: "var(--neuron-bg-elevated)", color: filters.dept ? "var(--neuron-ink-primary)" : "var(--neuron-ink-muted)", cursor: "pointer" }}
      >
        <option value="">All Departments</option>
        {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
      </select>

      {/* Role */}
      <select
        value={filters.role}
        onChange={e => onChange({ ...filters, role: e.target.value })}
        style={{ height: 34, padding: "0 10px", border: "1px solid var(--neuron-ui-border)", borderRadius: 8, fontSize: 13, outline: "none", backgroundColor: "var(--neuron-bg-elevated)", color: filters.role ? "var(--neuron-ink-primary)" : "var(--neuron-ink-muted)", cursor: "pointer" }}
      >
        <option value="">All Roles</option>
        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>

      {/* Status */}
      <select
        value={filters.status}
        onChange={e => onChange({ ...filters, status: e.target.value })}
        style={{ height: 34, padding: "0 10px", border: "1px solid var(--neuron-ui-border)", borderRadius: 8, fontSize: 13, outline: "none", backgroundColor: "var(--neuron-bg-elevated)", color: filters.status ? "var(--neuron-ink-primary)" : "var(--neuron-ink-muted)", cursor: "pointer" }}
      >
        <option value="">All Statuses</option>
        {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>

      {/* Overrides toggle */}
      <select
        value={filters.overrides}
        onChange={e => onChange({ ...filters, overrides: e.target.value as FiltersState["overrides"] })}
        style={{ height: 34, padding: "0 10px", border: "1px solid var(--neuron-ui-border)", borderRadius: 8, fontSize: 13, outline: "none", backgroundColor: "var(--neuron-bg-elevated)", color: filters.overrides !== "all" ? "var(--neuron-ink-primary)" : "var(--neuron-ink-muted)", cursor: "pointer" }}
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

function UsersTab({ onCountUpdate }: { onCountUpdate: (count: number) => void }) {
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
        .select("id, email, name, department, role, team_id, is_active, status, avatar_url, teams!users_team_id_fkey(name)")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as (UserRow & { status?: UserStatus; teams?: { name: string } | null })[];
    },
  });

  // Update parent with user count
  useEffect(() => {
    onCountUpdate(users.length);
  }, [users.length, onCountUpdate]);

  // DEBUG: surface query errors
  if (isError) console.error("[UsersTab] query error:", JSON.stringify(queryError, Object.getOwnPropertyNames(queryError ?? {})));

  const { data: overrideUserIds = new Set<string>() } = useQuery({
    queryKey: ["permission_overrides", "user-ids"],
    queryFn: async () => {
      const { data } = await supabase
        .from("permission_overrides")
        .select("user_id");
      return new Set((data ?? []).map((r: any) => r.user_id as string));
    },
    staleTime: 30 * 1000,
  });

  const filtered = useMemo(() => {
    return users.filter(u => {
      const q = filters.search.toLowerCase();
      if (q && !u.name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false;
      if (filters.dept && u.department !== filters.dept) return false;
      if (filters.role && u.role !== filters.role) return false;
      const uStatus = u.status || (u.is_active ? "active" : "inactive");
      if (filters.status && uStatus !== filters.status) return false;
      if (filters.overrides === "yes" && !overrideUserIds.has(u.id!)) return false;
      if (filters.overrides === "no" && overrideUserIds.has(u.id!)) return false;
      return true;
    });
  }, [users, filters, overrideUserIds]);

  const columns: ColumnDef<UserRow & { status?: UserStatus; teams?: { name: string } | null }>[] = [
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
      header: "Status",
      width: "110px",
      cell: (u) => <StatusBadge status={u.status || (u.is_active ? "active" : "inactive")} />,
    },
    {
      header: "Access",
      width: "100px",
      cell: (u) => {
        const hasOverride = overrideUserIds.has(u.id!);
        return hasOverride
          ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--neuron-status-accent-fg)", background: "var(--neuron-status-accent-bg)", padding: "2px 8px", borderRadius: 999 }}>
              <Shield size={11} /> Custom
            </span>
          )
          : <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>Default</span>;
      },
    },
  ];

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

      <FilterBar filters={filters} onChange={setFilters} overrideUserIds={overrideUserIds} />

      <DataTable
        data={filtered}
        columns={columns}
        isLoading={isLoading}
        emptyMessage={emptyMessage}
        onRowClick={(u) => navigate(`/admin/users/${u.id}`)}
      />

      {showCreate && (
        <CreateUserPanel isOpen={showCreate} onClose={() => setShowCreate(false)} onCreated={() => setShowCreate(false)} />
      )}
    </>
  );
}

// ─── Teams Tab ────────────────────────────────────────────────────────────────

function EditTeamDialog({ team, onClose, onSaved }: { team: Team | null; onClose: () => void; onSaved: () => void }) {
  const [newName, setNewName]       = useState(team?.name ?? "");
  const [newDept, setNewDept]       = useState<Department>((team?.department as Department) ?? "Business Development");
  const [newLeaderId, setNewLeaderId] = useState(team?.leader_id ?? "");
  const [saving, setSaving]         = useState(false);

  const { data: allUsers = [] } = useQuery({
    queryKey: ["users", "active-list"],
    queryFn: async () => {
      const { data } = await supabase.from("users").select("id, name, department").eq("is_active", true).order("name");
      return (data ?? []) as { id: string; name: string; department: string }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const deptUsers = allUsers.filter(u => u.department === newDept);

  const handleSave = async () => {
    if (!team || !newName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("teams").update({ name: newName.trim(), department: newDept, leader_id: newLeaderId || null }).eq("id", team.id);
    setSaving(false);
    if (error) { toast.error("Failed to update team."); return; }
    toast.success("Team updated.");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent style={{ maxWidth: 440 }}>
        <DialogHeader>
          <DialogTitle style={{ fontSize: 18, color: "var(--theme-text-primary)" }}>Edit Team</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label style={{ fontSize: 13, marginBottom: 6, display: "block" }}>Team Name</Label>
            <Input value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label style={{ fontSize: 13, marginBottom: 6, display: "block" }}>Department</Label>
            <Select value={newDept} onValueChange={v => { setNewDept(v as Department); setNewLeaderId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label style={{ fontSize: 13, marginBottom: 6, display: "block" }}>Team Leader</Label>
            <Select value={newLeaderId} onValueChange={setNewLeaderId}>
              <SelectTrigger><SelectValue placeholder="No leader assigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">No leader</SelectItem>
                {deptUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[var(--theme-action-primary-bg)] hover:bg-[var(--theme-action-primary-border)] text-white">
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TeamsTab({ onCountUpdate }: { onCountUpdate: (count: number) => void }) {
  const queryClient = useQueryClient();
  const { user: currentUser } = useUser();
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [creating, setCreating]     = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [newName, setNewName]       = useState("");
  const [newDept, setNewDept]       = useState<Department>("Business Development");
  const [newLeaderId, setNewLeaderId] = useState("");
  const [saving, setSaving]         = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: teams = [], refetch: fetchTeams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("id, name, department, leader_id").order("department").order("name");
      return (data ?? []) as Team[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["users", "active-list"],
    queryFn: async () => {
      const { data } = await supabase.from("users").select("id, name, role, department, email, team_id").eq("is_active", true).order("name");
      return (data ?? []) as { id: string; name: string; role: Role; department: string; email: string; team_id: string | null }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const teamsWithMembers: TeamWithMembers[] = teams.map(t => ({
    ...t,
    members: allUsers.filter(u => u.team_id === t.id).map(u => ({ id: u.id, name: u.name, role: u.role, email: u.email })),
  }));

  // Update parent with teams count
  useEffect(() => {
    onCountUpdate(teams.length);
  }, [teams.length, onCountUpdate]);

  const byDept = DEPARTMENTS.reduce<Record<string, TeamWithMembers[]>>((acc, dept) => {
    acc[dept] = teamsWithMembers.filter(t => t.department === dept);
    return acc;
  }, {});

  const deptUsersFor = (dept: Department) => allUsers.filter(u => u.department === dept);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Team name is required."); return; }
    setSaving(true);
    const { data: newTeam, error } = await supabase.from("teams").insert({ name: newName.trim(), department: newDept, leader_id: newLeaderId || null }).select().single();
    setSaving(false);
    if (error) { toast.error("Failed to create team."); return; }
    const actor = { id: currentUser?.id ?? "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" };
    logCreation("team", newTeam.id, newTeam.name ?? newTeam.id, actor);
    toast.success(`Team "${newName}" created.`);
    setCreating(false);
    setNewName(""); setNewDept("Business Development"); setNewLeaderId("");
    fetchTeams();
  };

  const handleDelete = async (teamId: string, teamName: string) => {
    if (!confirm(`Delete team "${teamName}"? Members will be unassigned.`)) return;
    setDeletingId(teamId);
    await supabase.from("users").update({ team_id: null }).eq("team_id", teamId);
    const { error } = await supabase.from("teams").delete().eq("id", teamId);
    setDeletingId(null);
    if (error) { toast.error("Failed to delete team."); return; }
    const actor = { id: currentUser?.id ?? "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" };
    logDeletion("team", teamId, teamName, actor);
    toast.success(`Team "${teamName}" deleted.`);
    fetchTeams();
    queryClient.invalidateQueries({ queryKey: queryKeys.users.list() });
  };

  const totalTeams = teams.length;
  const totalMembers = allUsers.filter(u => u.team_id !== null).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div>
          <p style={{ fontSize: 18, fontWeight: 600, color: "var(--neuron-ink-primary)", marginBottom: 2 }}>
            Teams{" "}
            <span style={{ fontWeight: 400, color: "var(--neuron-ink-muted)", fontSize: 15 }}>({totalTeams})</span>
          </p>
          <p style={{ fontSize: 13, color: "var(--neuron-ink-muted)" }}>{totalMembers} assigned member{totalMembers !== 1 ? "s" : ""} across all teams</p>
        </div>
        <button
          onClick={() => { setCreating(true); setNewName(""); setNewDept("Business Development"); setNewLeaderId(""); }}
          style={{ height: 36, padding: "0 14px", borderRadius: 8, background: "var(--neuron-action-primary)", border: "none", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
        >
          <Plus size={14} /> New Team
        </button>
      </div>

      {/* Department sections */}
      {DEPARTMENTS.map(dept => {
        const deptTeams = byDept[dept] ?? [];
        const colors = DEPT_BADGE[dept] ?? { bg: "var(--neuron-pill-inactive-bg)", text: "var(--theme-text-secondary)" };
        return (
          <div key={dept} style={{ border: "1px solid var(--neuron-ui-border)", borderRadius: 10, overflow: "hidden", background: "var(--neuron-bg-elevated)" }}>
            {/* Dept header */}
            <div style={{ padding: "12px 20px", display: "flex", alignItems: "center", gap: 8, borderBottom: deptTeams.length > 0 ? "1px solid var(--neuron-ui-border)" : "none" }}>
              <span style={{ display: "inline-flex", padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 500, backgroundColor: colors.bg, color: colors.text }}>
                {dept}
              </span>
              <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>
                {deptTeams.length} {deptTeams.length === 1 ? "team" : "teams"}
              </span>
            </div>

            {deptTeams.length === 0
              ? <div style={{ padding: "12px 20px", fontSize: 13, color: "var(--neuron-ink-muted)" }}>No teams yet.</div>
              : deptTeams.map((team, idx) => {
                const isExpanded = expanded === team.id;
                const leader = allUsers.find(u => u.id === team.leader_id);
                return (
                  <div key={team.id} style={{ borderTop: idx > 0 ? "1px solid var(--neuron-ui-border)" : undefined }}>
                    <div
                      style={{ padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                      onClick={() => setExpanded(isExpanded ? null : team.id)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isExpanded ? <ChevronDown size={13} style={{ color: "var(--neuron-ink-muted)" }} /> : <ChevronRight size={13} style={{ color: "var(--neuron-ink-muted)" }} />}
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--neuron-ink-primary)" }}>{team.name}</span>
                        <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>{team.members.length} member{team.members.length !== 1 ? "s" : ""}</span>
                        {leader && (
                          <span style={{ fontSize: 11, color: "var(--theme-action-primary-bg)", background: "var(--theme-status-success-bg)", padding: "1px 8px", borderRadius: 999 }}>
                            {leader.name}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 2 }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setEditingTeam(team)} style={{ padding: 6, background: "transparent", border: "none", cursor: "pointer", color: "var(--neuron-ink-muted)", borderRadius: 6 }} title="Edit">
                          <Edit size={13} />
                        </button>
                        <button onClick={() => handleDelete(team.id, team.name)} disabled={deletingId === team.id} style={{ padding: 6, background: "transparent", border: "none", cursor: "pointer", color: "var(--theme-status-danger-fg)", borderRadius: 6 }} title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div style={{ padding: "0 20px 14px 42px" }}>
                        {team.members.length === 0
                          ? <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>No members assigned yet.</p>
                          : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {team.members.map(m => {
                                const rc = ROLE_COLORS[m.role] ?? ROLE_COLORS.staff;
                                return (
                                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: "var(--neuron-bg-page)", borderRadius: 7 }}>
                                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", flex: 1 }}>{m.name}</span>
                                    <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>{m.email}</span>
                                    <span style={{ fontSize: 11, fontWeight: 500, padding: "1px 7px", borderRadius: 999, backgroundColor: rc.bg, color: rc.text }}>
                                      {ROLES.find(r => r.value === m.role)?.label ?? m.role}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        );
      })}

      {/* Create Team Dialog */}
      {creating && (
        <Dialog open onOpenChange={() => setCreating(false)}>
          <DialogContent style={{ maxWidth: 440 }}>
            <DialogHeader>
              <DialogTitle style={{ fontSize: 18, color: "var(--theme-text-primary)" }}>Create New Team</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label style={{ fontSize: 13, marginBottom: 6, display: "block" }}>Team Name</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g., North Luzon BD Team" autoFocus />
              </div>
              <div>
                <Label style={{ fontSize: 13, marginBottom: 6, display: "block" }}>Department</Label>
                <Select value={newDept} onValueChange={v => { setNewDept(v as Department); setNewLeaderId(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label style={{ fontSize: 13, marginBottom: 6, display: "block" }}>Team Leader <span style={{ color: "var(--theme-text-muted)", fontWeight: 400 }}>(optional)</span></Label>
                <Select value={newLeaderId} onValueChange={setNewLeaderId}>
                  <SelectTrigger><SelectValue placeholder="Assign later" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No leader yet</SelectItem>
                    {deptUsersFor(newDept).map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Button variant="outline" onClick={() => setCreating(false)} disabled={saving}>Cancel</Button>
                <Button onClick={handleCreate} disabled={saving} className="bg-[var(--theme-action-primary-bg)] hover:bg-[var(--theme-action-primary-border)] text-white">
                  {saving ? "Creating…" : "Create Team"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {editingTeam && (
        <EditTeamDialog team={editingTeam} onClose={() => setEditingTeam(null)} onSaved={() => { setEditingTeam(null); fetchTeams(); }} />
      )}
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
  const [revokingId, setRevokingId] = useState<string | null>(null);
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
        .select("*, user:user_id(name, email, department, role), grantor:granted_by(name)")
        .order("created_at", { ascending: false });
      return (data ?? []) as PermissionOverride[];
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
    queryClient.invalidateQueries({ queryKey: ["permission_overrides", "user-ids"] });
  };

  const handleRevoke = async (ov: PermissionOverride) => {
    if (!confirm(`Revoke override for ${ov.user?.name ?? "this user"}?`)) return;
    setRevokingId(ov.id);
    const { error } = await supabase.from("permission_overrides").delete().eq("id", ov.id);
    setRevokingId(null);
    if (error) { toast.error("Failed to revoke override."); return; }
    toast.success("Override revoked.");
    queryClient.invalidateQueries({ queryKey: ["permission_overrides"] });
    queryClient.invalidateQueries({ queryKey: ["permission_overrides", "user-ids"] });
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
          style={{ height: 36, padding: "0 14px", borderRadius: 8, background: "var(--neuron-action-primary)", border: "none", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", marginLeft: 16 }}
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
          style={{ width: "100%", height: 34, paddingLeft: 32, paddingRight: 10, border: "1px solid var(--neuron-ui-border)", borderRadius: 8, fontSize: 13, outline: "none", backgroundColor: "var(--neuron-bg-elevated)", color: "var(--neuron-ink-primary)", boxSizing: "border-box" }}
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
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 999, backgroundColor: scopeMeta.bg, color: scopeMeta.text, display: "inline-flex", width: "fit-content" }}>
                    {scopeMeta.label}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>
                    {ov.scope === "cross_department" && ov.departments?.length ? ov.departments.join(", ") : "—"}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>{ov.grantor?.name ?? "—"}</span>
                  <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>{ov.notes ?? "—"}</span>
                  <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => ov.user && setMatrixUser({ id: ov.user_id, name: ov.user.name, role: ov.user.role, department: ov.user.department })}
                      style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--neuron-ui-border)", background: "none", color: "var(--neuron-ink-muted)", fontSize: 11, cursor: "pointer" }}
                      title="View permissions"
                    >
                      <Shield size={12} />
                    </button>
                    <button
                      onClick={() => handleRevoke(ov)}
                      disabled={revokingId === ov.id}
                      style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--theme-status-danger-border)", background: "none", color: "var(--theme-status-danger-fg)", fontSize: 11, cursor: revokingId === ov.id ? "not-allowed" : "pointer" }}
                    >
                      {revokingId === ov.id ? "…" : "Revoke"}
                    </button>
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

type Tab = "users" | "teams" | "overrides";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "users",    label: "Users",            icon: Users },
  { id: "teams",    label: "Teams",            icon: UsersRound },
  { id: "overrides", label: "Access Overrides", icon: Shield },
];

// ─── Tab counts context ────────────────────────────────────────────────────────

interface TabCounts {
  users: number;
  teams: number;
  overrides: number;
}

// ─── Root export ──────────────────────────────────────────────────────────────

export function UserManagement() {
  const [activeTab, setActiveTab] = useState<Tab>("users");
  const [tabCounts, setTabCounts] = useState<TabCounts>({ users: 0, teams: 0, overrides: 0 });
  const handleUsersCount = useCallback((count: number) => setTabCounts(prev => ({ ...prev, users: count })), []);
  const handleTeamsCount = useCallback((count: number) => setTabCounts(prev => ({ ...prev, teams: count })), []);
  const handleOverridesCount = useCallback((count: number) => setTabCounts(prev => ({ ...prev, overrides: count })), []);

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

        {/* Tab nav — Quotations style with underline and badges */}
        <div style={{
          display: "flex",
          gap: "24px"
        }}>
          {TABS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            const count = tabCounts[id as keyof TabCounts];
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 4px",
                  background: "none",
                  border: "none",
                  borderBottom: isActive ? "2px solid var(--neuron-action-primary)" : "2px solid transparent",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: isActive ? "var(--neuron-action-primary)" : "var(--neuron-ink-secondary)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  marginBottom: 0
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = "var(--neuron-ink-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = "var(--neuron-ink-secondary)";
                  }
                }}
              >
                <Icon size={16} />
                {label}
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
                    color: isActive ? "var(--neuron-action-primary)" : "var(--neuron-ink-muted)"
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "auto", padding: "28px 48px" }}>
        {activeTab === "users"    && <UsersTab onCountUpdate={handleUsersCount} />}
        {activeTab === "teams"    && <TeamsTab onCountUpdate={handleTeamsCount} />}
        {activeTab === "overrides" && <AccessOverridesTab onCountUpdate={handleOverridesCount} />}
      </div>
    </div>
  );
}
