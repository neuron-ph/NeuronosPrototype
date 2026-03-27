import { useState, useCallback, useEffect } from "react";
import { Plus, Users } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { DataTable, ColumnDef } from "../common/DataTable";
import { CreateUserPanel } from "./CreateUserPanel";
import { EditUserPanel } from "./EditUserPanel";

type UserRow = {
  id: string;
  email: string;
  name: string;
  department: string;
  role: string;
  team_id: string | null;
  is_active: boolean;
  avatar_url?: string | null;
  teams: { name: string } | null;
};

const DEPT_BADGE: Record<string, { bg: string; text: string }> = {
  "Business Development": { bg: "var(--neuron-dept-bd-bg)",         text: "var(--neuron-dept-bd-text)" },
  "Pricing":             { bg: "var(--neuron-dept-pricing-bg)",     text: "var(--neuron-dept-pricing-text)" },
  "Operations":          { bg: "var(--neuron-dept-ops-bg)",         text: "var(--neuron-dept-ops-text)" },
  "Accounting":          { bg: "var(--neuron-dept-accounting-bg)",  text: "var(--neuron-dept-accounting-text)" },
  "HR":                  { bg: "var(--neuron-dept-hr-bg)",          text: "var(--neuron-dept-hr-text)" },
  "Executive":           { bg: "var(--neuron-dept-executive-bg)",   text: "var(--neuron-dept-executive-text)" },
};

function DeptBadge({ dept }: { dept: string }) {
  const colors = DEPT_BADGE[dept] || { bg: "var(--neuron-dept-default-bg)", text: "var(--neuron-dept-default-text)" };
  return (
    <span
      style={{
        borderRadius: "999px",
        padding: "2px 10px",
        fontSize: "12px",
        fontWeight: 500,
        backgroundColor: colors.bg,
        color: colors.text,
      }}
    >
      {dept}
    </span>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: active ? "var(--neuron-toggle-active-bg)" : "var(--neuron-toggle-inactive-bg)",
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: "13px", color: active ? "var(--neuron-toggle-active-text)" : "var(--neuron-ink-muted)" }}>
        {active ? "Active" : "Inactive"}
      </span>
    </div>
  );
}

function AvatarCell({ user }: { user: UserRow }) {
  const initials = (user.name || user.email || "U").charAt(0).toUpperCase();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "50%",
          backgroundColor: "var(--neuron-brand-green-100)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--neuron-action-primary)" }}>{initials}</span>
        )}
      </div>
      <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--neuron-ink-primary)" }}>{user.name || user.email}</span>
    </div>
  );
}

function formatRole(role: string): string {
  if (role === "team_leader") return "Team Leader";
  if (role === "manager") return "Manager";
  if (role === "staff") return "Staff";
  return role;
}

export function UserManagement() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("id, email, name, department, role, team_id, is_active, avatar_url, teams(name)")
      .order("name", { ascending: true });
    if (!error && data) {
      setUsers(data as UserRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const columns: ColumnDef<UserRow>[] = [
    {
      header: "Name",
      width: "220px",
      cell: (u) => <AvatarCell user={u} />,
    },
    {
      header: "Email",
      width: "200px",
      cell: (u) => <span style={{ fontSize: "13px", color: "var(--neuron-ink-muted)" }}>{u.email}</span>,
    },
    {
      header: "Department",
      width: "150px",
      cell: (u) => <DeptBadge dept={u.department} />,
    },
    {
      header: "Role",
      width: "100px",
      cell: (u) => <span style={{ fontSize: "13px", color: "var(--neuron-ink-muted)" }}>{formatRole(u.role)}</span>,
    },
    {
      header: "Team",
      width: "140px",
      cell: (u) => (
        <span style={{ fontSize: "13px", color: "var(--neuron-ink-muted)" }}>
          {u.teams?.name || "—"}
        </span>
      ),
    },
    {
      header: "Status",
      width: "80px",
      cell: (u) => <StatusDot active={u.is_active} />,
    },
  ];

  const emptyMessage = (
    <div style={{ textAlign: "center", padding: "64px 0" }}>
      <Users size={40} style={{ color: "var(--neuron-ui-muted)", margin: "0 auto 16px" }} />
      <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--neuron-ink-primary)", marginBottom: "4px" }}>
        No team members yet
      </p>
      <p style={{ fontSize: "13px", color: "var(--neuron-ink-muted)", marginBottom: "20px" }}>
        Create an account to add someone to your workspace.
      </p>
      <button
        onClick={() => setShowCreate(true)}
        style={{
          height: "40px",
          padding: "0 20px",
          borderRadius: "8px",
          background: "var(--neuron-bg-elevated)",
          border: "1px solid var(--neuron-action-primary)",
          color: "var(--neuron-action-primary)",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <Plus size={16} />
        Create Account
      </button>
    </div>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--neuron-bg-elevated)" }}>
      {/* Page Header */}
      <div style={{ padding: "32px 48px", borderBottom: "1px solid var(--neuron-ui-border)" }}>
        <h1 style={{ fontSize: "32px", fontWeight: 600, color: "var(--neuron-ink-primary)", letterSpacing: "-1.2px", marginBottom: "4px" }}>
          User Management
        </h1>
        <p style={{ fontSize: "14px", color: "var(--neuron-ink-muted)" }}>
          Manage workspace accounts and access permissions
        </p>
      </div>

      {/* Table Header Row */}
      <div
        style={{
          padding: "24px 48px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <p style={{ fontSize: "20px", fontWeight: 600, color: "var(--neuron-ink-primary)" }}>
          Members{" "}
          <span style={{ fontWeight: 400, color: "var(--neuron-ink-muted)" }}>({users.length})</span>
        </p>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            height: "40px",
            padding: "0 16px",
            borderRadius: "8px",
            background: "var(--neuron-action-primary)",
            border: "none",
            color: "var(--neuron-action-primary-text)",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--neuron-action-primary-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--neuron-action-primary)"; }}
        >
          <Plus size={16} />
          Create Account
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 48px 32px" }}>
        <DataTable<UserRow>
          data={users}
          columns={columns}
          isLoading={loading}
          emptyMessage={emptyMessage}
          onRowClick={(u) => setEditUser(u)}
        />
      </div>

      {/* Panels */}
      {showCreate && (
        <CreateUserPanel
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchUsers(); }}
        />
      )}

      {editUser && (
        <EditUserPanel
          isOpen={!!editUser}
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); fetchUsers(); }}
        />
      )}
    </div>
  );
}
