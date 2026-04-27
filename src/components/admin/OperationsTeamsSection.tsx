import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Edit,
  Edit2,
  Plus,
  Save,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { supabase } from "../../utils/supabase/client";
import { queryKeys } from "../../lib/queryKeys";
import { normalizeRoleKey } from "../../utils/assignments/normalizeRoleKey";
import { logCreation, logDeletion } from "../../utils/activityLog";
import type { OperationalService, ServiceAssignmentRole } from "../../types/assignments";
import {
  clearTeamMemberships,
  replaceTeamMemberships,
  type TeamMemberRoleInput,
} from "../../utils/teamMemberships";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Checkbox } from "../ui/checkbox";

const NO_MANAGER_VALUE = "__none__";

const OPS_ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  executive:   { bg: "var(--neuron-semantic-danger-bg)",  text: "var(--neuron-semantic-danger)" },
  manager:     { bg: "var(--neuron-status-accent-bg)",    text: "var(--neuron-status-accent-fg)" },
  supervisor:  { bg: "var(--neuron-semantic-info-bg)",    text: "var(--neuron-semantic-info)" },
  team_leader: { bg: "var(--theme-status-warning-bg)",    text: "var(--theme-status-warning-fg)" },
  staff:       { bg: "var(--neuron-bg-surface-subtle)",   text: "var(--theme-text-secondary)" },
};

const OPS_ROLE_LABELS: Record<string, string> = {
  executive:   "Executive",
  manager:     "Manager",
  supervisor:  "Supervisor",
  team_leader: "Team Leader",
  staff:       "Staff",
};

interface OperationsTeam {
  id: string;
  name: string;
  department: string;
  leader_id: string | null;
  service_type: string | null;
}

interface OperationsUser {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  team_id: string | null;
  team_role?: string | null;
  avatar_url?: string | null;
}

interface OperationsTeamWithMembers extends OperationsTeam {
  members: {
    id: string;
    name: string;
    email: string;
    role: string;
    team_role?: string | null;
    avatar_url?: string | null;
  }[];
}

interface OperationsTeamsSectionProps {
  teams: OperationsTeamWithMembers[];
  users: OperationsUser[];
  currentUser?: { id?: string; name?: string; department?: string; role?: string } | null;
  onRefresh: () => Promise<void>;
}

export function OperationsTeamsSection({
  teams,
  users,
  currentUser,
  onRefresh,
}: OperationsTeamsSectionProps) {
  const queryClient = useQueryClient();
  const [expandedServiceType, setExpandedServiceType] = useState<string | null>(null);

  const canEditServiceConfig =
    currentUser?.department === "Executive" || currentUser?.role === "executive";

  const { data: services = [], isLoading: servicesLoading } = useQuery<OperationalService[]>({
    queryKey: queryKeys.assignments.services(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operational_services")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as OperationalService[];
    },
  });

  const { data: rolesByService = {} } = useQuery<Record<string, ServiceAssignmentRole[]>>({
    queryKey: queryKeys.assignments.rolesForService("__all__"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_assignment_roles")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      const grouped: Record<string, ServiceAssignmentRole[]> = {};
      for (const role of (data ?? []) as ServiceAssignmentRole[]) {
        (grouped[role.service_type] ??= []).push(role);
      }
      return grouped;
    },
  });

  const managers = useMemo(
    () =>
      users
        .filter((user) => user.department === "Operations")
        .map((user) => ({ id: user.id, name: user.name })),
    [users],
  );

  const totalMembers = teams.reduce((sum, team) => sum + team.members.length, 0);

  const refreshAssignmentConfig = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments.all() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.all() }),
    ]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--neuron-ui-border)",
          background: "var(--neuron-bg-page)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              display: "inline-flex",
              padding: "2px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              backgroundColor: "var(--neuron-dept-ops-bg)",
              color: "var(--neuron-dept-ops-text)",
            }}
          >
            Operations
          </span>
          <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>
            {teams.length} team{teams.length !== 1 ? "s" : ""} · {totalMembers} assigned member
            {totalMembers !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {servicesLoading ? (
        <div style={{ padding: "20px", fontSize: 13, color: "var(--neuron-ink-muted)", textAlign: "center" }}>
          Loading services…
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {services.map((service, idx) => (
            <OperationsServiceRow
              key={service.id}
              service={service}
              roles={rolesByService[service.service_type] ?? []}
              managers={managers}
              canEditServiceConfig={canEditServiceConfig}
              teamPools={teams.filter(
                (team) =>
                  team.service_type === service.service_type ||
                  (!team.service_type && service.service_type === "Others"),
              )}
              users={users.filter((user) => user.department === "Operations")}
              currentUser={currentUser}
              isExpanded={expandedServiceType === service.service_type}
              isFirst={idx === 0}
              onToggle={() =>
                setExpandedServiceType(
                  expandedServiceType === service.service_type ? null : service.service_type,
                )
              }
              onChanged={refreshAssignmentConfig}
              onRefreshTeams={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface OperationsServiceRowProps {
  service: OperationalService;
  roles: ServiceAssignmentRole[];
  managers: { id: string; name: string }[];
  canEditServiceConfig: boolean;
  teamPools: OperationsTeamWithMembers[];
  users: OperationsUser[];
  currentUser?: { id?: string; name?: string; department?: string } | null;
  isExpanded: boolean;
  isFirst: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
  onRefreshTeams: () => Promise<void>;
}

function OperationsServiceRow({
  service,
  roles,
  managers,
  canEditServiceConfig,
  teamPools,
  users,
  currentUser,
  isExpanded,
  isFirst,
  onToggle,
  onChanged,
  onRefreshTeams,
}: OperationsServiceRowProps) {
  const [isEditingManager, setIsEditingManager] = useState(false);
  const [pendingManagerId, setPendingManagerId] = useState(service.default_manager_id ?? "");
  const [savingManager, setSavingManager] = useState(false);
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [newRoleRequired, setNewRoleRequired] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [confirmDeactivateRoleId, setConfirmDeactivateRoleId] = useState<string | null>(null);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [creatingTeamPool, setCreatingTeamPool] = useState(false);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);
  const [confirmDeleteTeamId, setConfirmDeleteTeamId] = useState<string | null>(null);

  useEffect(() => {
    setPendingManagerId(service.default_manager_id ?? "");
  }, [service.default_manager_id]);

  const activeRoles = useMemo(
    () => roles.filter((role) => role.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [roles],
  );
  const serviceRoleOptions = useMemo(
    () =>
      activeRoles.map((role) => ({
        roleKey: role.role_key,
        roleLabel: role.role_label,
      })),
    [activeRoles],
  );
  const usedKeys = useMemo(() => new Set(activeRoles.map((role) => role.role_key)), [activeRoles]);

  const bodyId = `ops-service-body-${service.id}`;

  const handleSaveManager = async () => {
    setSavingManager(true);
    const manager = managers.find((option) => option.id === pendingManagerId);
    const { error } = await supabase
      .from("operational_services")
      .update({
        default_manager_id: pendingManagerId || null,
        default_manager_name: manager?.name ?? null,
      })
      .eq("id", service.id);
    setSavingManager(false);
    if (error) {
      toast.error("Failed to update service manager");
      return;
    }
    toast.success("Service manager updated");
    setIsEditingManager(false);
    await onChanged();
  };

  const handleAddRole = async () => {
    if (!newRoleLabel.trim()) {
      toast.error("Enter a role label");
      return;
    }
    const roleKey = normalizeRoleKey(newRoleLabel);
    if (usedKeys.has(roleKey)) {
      toast.error("That role already exists for this service");
      return;
    }
    const sortOrder =
      activeRoles.length === 0 ? 10 : Math.max(...activeRoles.map((role) => role.sort_order)) + 10;
    setSavingRole(true);
    const { error } = await supabase.from("service_assignment_roles").insert({
      service_type: service.service_type,
      role_key: roleKey,
      role_label: newRoleLabel.trim(),
      required: newRoleRequired,
      allow_multiple: false,
      sort_order: sortOrder,
      is_active: true,
    });
    setSavingRole(false);
    if (error) {
      toast.error(`Failed to add role: ${error.message}`);
      return;
    }
    toast.success("Role added");
    setNewRoleLabel("");
    setNewRoleRequired(false);
    setIsAddingRole(false);
    await onChanged();
  };

  const handleSaveRole = async (id: string, patch: Partial<ServiceAssignmentRole>) => {
    const { error } = await supabase.from("service_assignment_roles").update(patch).eq("id", id);
    if (error) {
      toast.error(`Failed to update role: ${error.message}`);
      return;
    }
    toast.success("Role updated");
    setEditingRoleId(null);
    await onChanged();
  };

  const handleMoveRole = async (id: string, direction: -1 | 1) => {
    const index = activeRoles.findIndex((role) => role.id === id);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= activeRoles.length) return;
    const current = activeRoles[index];
    const target = activeRoles[swapIndex];
    await supabase.from("service_assignment_roles").update({ sort_order: target.sort_order }).eq("id", current.id);
    await supabase.from("service_assignment_roles").update({ sort_order: current.sort_order }).eq("id", target.id);
    await onChanged();
  };

  const handleDeactivateRole = async () => {
    if (!confirmDeactivateRoleId) return;
    const { error } = await supabase
      .from("service_assignment_roles")
      .update({ is_active: false })
      .eq("id", confirmDeactivateRoleId);
    if (error) {
      toast.error("Failed to deactivate role");
      return;
    }
    toast.success("Role deactivated");
    setConfirmDeactivateRoleId(null);
    await onChanged();
  };

  const handleDeleteTeamConfirmed = async (teamId: string, teamName: string) => {
    setConfirmDeleteTeamId(null);
    setDeletingTeamId(teamId);
    try {
      await clearTeamMemberships(teamId);
    } catch (memberError) {
      setDeletingTeamId(null);
      toast.error(
        `Failed to clear team members: ${
          memberError instanceof Error ? memberError.message : "Unknown error"
        }`,
      );
      return;
    }
    const { error } = await supabase.from("teams").delete().eq("id", teamId);
    setDeletingTeamId(null);
    if (error) {
      toast.error("Failed to delete team.");
      return;
    }
    logDeletion("team", teamId, teamName, {
      id: currentUser?.id ?? "",
      name: currentUser?.name ?? "",
      department: currentUser?.department ?? "",
    });
    toast.success(`Team "${teamName}" deleted.`);
    await onRefreshTeams();
  };

  return (
    <div style={{ borderTop: isFirst ? undefined : "1px solid var(--neuron-ui-border)" }}>
      {/* Accordion header row */}
      <button
        aria-expanded={isExpanded}
        aria-controls={bodyId}
        onClick={onToggle}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--neuron-bg-page)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
        style={{
          width: "100%",
          padding: "11px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          transition: "background-color 0.12s cubic-bezier(0.16,1,0.3,1)",
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1, overflow: "hidden" }}>
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
          >
            <ChevronRight size={13} style={{ color: "var(--neuron-ink-muted)" }} />
          </motion.div>
          <Users size={14} style={{ color: "var(--theme-action-primary-bg)", flexShrink: 0 }} />
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--neuron-ink-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flexShrink: 1,
            }}
          >
            {service.label}
          </span>
          <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)", flexShrink: 0 }}>
            {activeRoles.length} role{activeRoles.length !== 1 ? "s" : ""}
          </span>
          {service.default_manager_name ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "var(--theme-action-primary-bg)",
                background: "var(--theme-status-success-bg)",
                padding: "2px 8px",
                borderRadius: 999,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 160,
                flexShrink: 1,
              }}
            >
              {service.default_manager_name}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)", fontStyle: "italic", flexShrink: 0 }}>
              No manager
            </span>
          )}
        </div>
      </button>

      {/* Expandable body */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            id={bodyId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: "hidden", borderTop: "1px solid var(--neuron-ui-border)" }}
          >
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Service Manager */}
              <div style={{ background: "var(--theme-bg-page)", borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Service Manager
                  </span>
                  {canEditServiceConfig && !isEditingManager && (
                    <button
                      onClick={() => setIsEditingManager(true)}
                      style={{ background: "none", border: "none", color: "var(--theme-action-primary-bg)", fontSize: 12, cursor: "pointer" }}
                    >
                      <Edit2 size={12} style={{ display: "inline", marginRight: 4 }} />
                      edit
                    </button>
                  )}
                </div>
                {isEditingManager ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Select
                      value={pendingManagerId || NO_MANAGER_VALUE}
                      onValueChange={(value) =>
                        setPendingManagerId(value === NO_MANAGER_VALUE ? "" : value)
                      }
                    >
                      <SelectTrigger style={{ height: 34, fontSize: 13 }}>
                        <SelectValue placeholder="Select manager" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_MANAGER_VALUE}>No manager</SelectItem>
                        {managers.map((manager) => (
                          <SelectItem key={manager.id} value={manager.id}>
                            {manager.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      onClick={handleSaveManager}
                      disabled={savingManager}
                      aria-label="Save manager"
                      style={{ padding: 6, borderRadius: 6, border: "none", background: "var(--theme-action-primary-bg)", color: "white", cursor: savingManager ? "not-allowed" : "pointer", opacity: savingManager ? 0.6 : 1, flexShrink: 0 }}
                    >
                      <Save size={14} />
                    </button>
                    <button
                      onClick={() => setIsEditingManager(false)}
                      disabled={savingManager}
                      aria-label="Cancel editing manager"
                      style={{ padding: 6, borderRadius: 6, border: "1px solid var(--neuron-ui-border)", background: "none", color: "var(--theme-text-muted)", cursor: "pointer", flexShrink: 0 }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: 14, color: service.default_manager_name ? "var(--neuron-ink-primary)" : "var(--theme-text-muted)" }}>
                    {service.default_manager_name ?? "No service manager set"}
                  </div>
                )}
              </div>

              {/* Assignment Roles */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Assignment Roles
                  </span>
                  {canEditServiceConfig && !isAddingRole && (
                    <button
                      onClick={() => setIsAddingRole(true)}
                      style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--theme-action-primary-bg)", fontSize: 12, cursor: "pointer" }}
                    >
                      <Plus size={12} />
                      add role
                    </button>
                  )}
                </div>

                {isAddingRole && (
                  <div style={{ border: "1px dashed var(--neuron-ui-border)", borderRadius: 8, padding: 12, marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    <Input
                      value={newRoleLabel}
                      onChange={(event) => setNewRoleLabel(event.target.value)}
                      placeholder="Role label (e.g. Customs Declarant)"
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddRole(); }}
                    />
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--theme-text-secondary)" }}>
                      <Checkbox checked={newRoleRequired} onCheckedChange={(checked) => setNewRoleRequired(checked === true)} />
                      Required
                    </label>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <Button variant="outline" disabled={savingRole} onClick={() => {
                        setIsAddingRole(false);
                        setNewRoleLabel("");
                        setNewRoleRequired(false);
                      }}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddRole} disabled={savingRole}>
                        {savingRole ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {activeRoles.length === 0 && !isAddingRole && (
                    <p style={{ fontSize: 12, fontStyle: "italic", color: "var(--theme-text-muted)", margin: 0 }}>
                      No roles configured.
                    </p>
                  )}
                  {activeRoles.map((role, index) => (
                    <ServiceRoleRow
                      key={role.id}
                      role={role}
                      canEdit={canEditServiceConfig}
                      isEditing={editingRoleId === role.id}
                      isFirst={index === 0}
                      isLast={index === activeRoles.length - 1}
                      onStartEdit={() => setEditingRoleId(role.id)}
                      onCancelEdit={() => setEditingRoleId(null)}
                      onSave={(patch) => handleSaveRole(role.id, patch)}
                      onMoveUp={() => handleMoveRole(role.id, -1)}
                      onMoveDown={() => handleMoveRole(role.id, 1)}
                      onDeactivate={() => setConfirmDeactivateRoleId(role.id)}
                    />
                  ))}
                </div>
              </div>

              {/* Teams */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Teams
                  </span>
                  <button
                    onClick={() => setCreatingTeamPool((current) => !current)}
                    style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--theme-action-primary-bg)", fontSize: 12, cursor: "pointer" }}
                  >
                    <Plus size={12} />
                    add team
                  </button>
                </div>

                {creatingTeamPool && (
                  <div style={{ marginBottom: 10 }}>
              <OperationsTeamPoolCreateRow
                service={service}
                users={users}
                roleOptions={serviceRoleOptions}
                currentUser={currentUser}
                onSaved={async () => {
                  setCreatingTeamPool(false);
                        await onRefreshTeams();
                      }}
                      onCancel={() => setCreatingTeamPool(false)}
                    />
                  </div>
                )}

                {teamPools.length === 0 && !creatingTeamPool && (
                  <div style={{ padding: "14px 12px", border: "1px dashed var(--neuron-ui-border)", borderRadius: 8, fontSize: 12, color: "var(--theme-text-muted)" }}>
                    No teams yet for {service.label}.
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {teamPools.map((team) => {
                    const isTeamExpanded = expandedTeamId === team.id && editingTeamId !== team.id;
                    const isEditing = editingTeamId === team.id;
                    return (
                      <div key={team.id} style={{ border: "1px solid var(--neuron-ui-border)", borderRadius: 8, overflow: "hidden" }}>
                        {isEditing ? (
                    <OperationsTeamPoolEditRow
                      team={team}
                      serviceLabel={service.label}
                      users={users}
                      roleOptions={serviceRoleOptions}
                      onSaved={async () => {
                        setEditingTeamId(null);
                        await onRefreshTeams();
                            }}
                            onCancel={() => setEditingTeamId(null)}
                          />
                        ) : (
                          <>
                            <button
                              aria-expanded={isTeamExpanded}
                              aria-controls={`ops-team-members-${team.id}`}
                              onClick={() => setExpandedTeamId(isTeamExpanded ? null : team.id)}
                              style={{
                                width: "100%",
                                padding: "11px 12px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                background: "var(--theme-bg-page)",
                                border: "none",
                                cursor: "pointer",
                                textAlign: "left",
                                minWidth: 0,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, overflow: "hidden" }}>
                                <motion.div
                                  animate={{ rotate: isTeamExpanded ? 90 : 0 }}
                                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                                  style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
                                >
                                  <ChevronRight size={13} style={{ color: "var(--neuron-ink-muted)" }} />
                                </motion.div>
                                <span
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: "var(--neuron-ink-primary)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {team.name}
                                </span>
                                <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)", flexShrink: 0 }}>
                                  {team.members.length} member{team.members.length !== 1 ? "s" : ""}
                                </span>
                              </div>
                              <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={(event) => event.stopPropagation()}>
                                <button
                                  onClick={() => {
                                    setEditingTeamId(team.id);
                                    setExpandedTeamId(null);
                                  }}
                                  aria-label={`Edit team ${team.name}`}
                                  title="Edit team"
                                  style={{ padding: "8px 10px", background: "transparent", border: "none", cursor: "pointer", color: "var(--neuron-ink-muted)", borderRadius: 6 }}
                                >
                                  <Edit size={13} />
                                </button>
                                {confirmDeleteTeamId === team.id ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <button
                                      onClick={() => handleDeleteTeamConfirmed(team.id, team.name)}
                                      disabled={deletingTeamId === team.id}
                                      style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--theme-status-danger-fg)", background: "var(--theme-status-danger-bg, #fef2f2)", color: "var(--theme-status-danger-fg)", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                                    >
                                      {deletingTeamId === team.id ? "Deleting…" : "Delete"}
                                    </button>
                                    <button
                                      onClick={() => setConfirmDeleteTeamId(null)}
                                      aria-label="Cancel delete"
                                      style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--neuron-ui-border)", background: "none", color: "var(--neuron-ink-muted)", fontSize: 11, cursor: "pointer" }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setConfirmDeleteTeamId(team.id)}
                                    aria-label={`Delete team ${team.name}`}
                                    title="Delete team"
                                    style={{ padding: "8px 10px", background: "transparent", border: "none", cursor: "pointer", color: "var(--theme-status-danger-fg)", borderRadius: 6 }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </button>

                            <AnimatePresence initial={false}>
                              {isTeamExpanded && (
                                <motion.div
                                  id={`ops-team-members-${team.id}`}
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                                  style={{ overflow: "hidden", borderTop: "1px solid var(--neuron-ui-border)" }}
                                >
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", padding: "8px 16px 8px 44px", background: "var(--neuron-bg-page)" }}>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Name</span>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--neuron-ink-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Role</span>
                                  </div>
                                  {team.members.length === 0 ? (
                                    <div style={{ padding: "16px 16px 16px 44px", fontSize: 13, color: "var(--neuron-ink-muted)" }}>
                                      No members assigned yet.
                                    </div>
                                  ) : (
                                    team.members.map((member, mIdx) => {
                                          const initial = (member.name || member.email || "?").charAt(0).toUpperCase();
                                          const roleChipLabel = member.team_role ?? OPS_ROLE_LABELS[member.role] ?? member.role;
                                          return (
                                            <div
                                          key={member.id}
                                          style={{
                                            display: "grid",
                                            gridTemplateColumns: "1fr 140px",
                                            padding: "10px 16px 10px 16px",
                                            alignItems: "center",
                                            borderTop: mIdx > 0 ? "1px solid var(--neuron-ui-border)" : undefined,
                                            background: "var(--neuron-bg-elevated)",
                                          }}
                                        >
                                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                            <div style={{
                                              width: 32, height: 32, borderRadius: "50%",
                                              backgroundColor: "var(--neuron-bg-surface-subtle)",
                                              display: "flex", alignItems: "center", justifyContent: "center",
                                              flexShrink: 0, border: "1px solid var(--neuron-ui-border)",
                                              overflow: "hidden",
                                            }}>
                                              {member.avatar_url
                                                ? <img src={member.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                                : <span style={{ fontSize: 12, fontWeight: 600, color: "var(--neuron-ink-muted)" }}>{initial}</span>
                                              }
                                            </div>
                                            <div style={{ minWidth: 0 }}>
                                              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", margin: 0, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.name}</p>
                                              <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", margin: 0, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.email}</p>
                                            </div>
                                          </div>
                                          <span
                                            style={{
                                              fontSize: 11,
                                              fontWeight: 500,
                                              padding: "2px 8px",
                                              borderRadius: 999,
                                              backgroundColor: member.team_role
                                                ? "rgba(15, 118, 110, 0.08)"
                                                : (OPS_ROLE_COLORS[member.role] ?? OPS_ROLE_COLORS.staff).bg,
                                              color: member.team_role
                                                ? "var(--theme-action-primary-bg)"
                                                : (OPS_ROLE_COLORS[member.role] ?? OPS_ROLE_COLORS.staff).text,
                                              justifySelf: "start",
                                            }}
                                          >
                                            {roleChipLabel}
                                          </span>
                                        </div>
                                      );
                                    })
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDeactivateRoleId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 50,
            }}
          >
            <div style={{ width: 420, background: "var(--theme-bg-surface)", borderRadius: 12, padding: 20, border: "1px solid var(--neuron-ui-border)" }}>
              <h4 style={{ margin: "0 0 6px", fontSize: 16, color: "var(--neuron-ink-primary)" }}>Deactivate role?</h4>
              <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--theme-text-muted)" }}>
                Existing bookings still display this role. New bookings will no longer allow assigning to it.
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Button variant="outline" onClick={() => setConfirmDeactivateRoleId(null)}>Cancel</Button>
                <Button onClick={handleDeactivateRole}>Deactivate</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ServiceRoleRow({
  role,
  canEdit,
  isEditing,
  isFirst,
  isLast,
  onStartEdit,
  onCancelEdit,
  onSave,
  onMoveUp,
  onMoveDown,
  onDeactivate,
}: {
  role: ServiceAssignmentRole;
  canEdit: boolean;
  isEditing: boolean;
  isFirst: boolean;
  isLast: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: Partial<ServiceAssignmentRole>) => Promise<void>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDeactivate: () => void;
}) {
  const [label, setLabel] = useState(role.role_label);
  const [required, setRequired] = useState(role.required);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLabel(role.role_label);
    setRequired(role.required);
  }, [role.role_label, role.required, isEditing]);

  const handleSave = async () => {
    setSaving(true);
    await onSave({ role_label: label.trim(), required });
    setSaving(false);
  };

  if (isEditing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: "1px solid var(--theme-action-primary-bg)", borderRadius: 8 }}>
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onCancelEdit(); }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--theme-text-secondary)", flexShrink: 0 }}>
          <Checkbox checked={required} onCheckedChange={(checked) => setRequired(checked === true)} />
          required
        </label>
        <button
          onClick={handleSave}
          disabled={saving}
          aria-label="Save role"
          style={{ padding: 6, borderRadius: 6, border: "none", background: "var(--theme-action-primary-bg)", color: "white", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1, flexShrink: 0 }}
        >
          <Save size={12} />
        </button>
        <button
          onClick={onCancelEdit}
          disabled={saving}
          aria-label="Cancel editing role"
          style={{ padding: 6, borderRadius: 6, border: "1px solid var(--neuron-ui-border)", background: "none", color: "var(--theme-text-muted)", cursor: "pointer", flexShrink: 0 }}
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, background: "var(--theme-bg-page)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--neuron-ink-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {role.role_label}
          </span>
          {role.required && (
            <span style={{ fontSize: 10, color: "var(--theme-action-primary-bg)", background: "rgba(15, 118, 110, 0.08)", borderRadius: 999, padding: "2px 8px", flexShrink: 0 }}>
              required
            </span>
          )}
        </div>
      </div>
      {canEdit && (
        <>
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            aria-label="Move role up"
            style={{ padding: 6, border: "none", background: "none", color: "var(--theme-text-muted)", cursor: "pointer", opacity: isFirst ? 0.35 : 1, flexShrink: 0 }}
          >
            <ArrowUp size={12} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            aria-label="Move role down"
            style={{ padding: 6, border: "none", background: "none", color: "var(--theme-text-muted)", cursor: "pointer", opacity: isLast ? 0.35 : 1, flexShrink: 0 }}
          >
            <ArrowDown size={12} />
          </button>
          <button
            onClick={onStartEdit}
            aria-label={`Edit role ${role.role_label}`}
            style={{ padding: 6, border: "none", background: "none", color: "var(--theme-text-muted)", cursor: "pointer", flexShrink: 0 }}
          >
            <Edit2 size={12} />
          </button>
          <button
            onClick={onDeactivate}
            aria-label={`Deactivate role ${role.role_label}`}
            style={{ padding: 6, border: "none", background: "none", color: "var(--theme-text-muted)", cursor: "pointer", flexShrink: 0 }}
          >
            <Trash2 size={12} />
          </button>
        </>
      )}
    </div>
  );
}

function OperationsTeamPoolCreateRow({
  service,
  users,
  roleOptions,
  currentUser,
  onSaved,
  onCancel,
}: {
  service: OperationalService;
  users: OperationsUser[];
  roleOptions: TeamMemberRoleInput[];
  currentUser?: { id?: string; name?: string; department?: string } | null;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const assignedIds = Object.keys(memberRoles).filter((id) => memberRoles[id]);
  const availableToAdd = users.filter((user) => !assignedIds.includes(user.id));

  const addMember = (userId: string) => {
    const defaultRole = roleOptions[0];
    if (!defaultRole) {
      toast.error("Define assignment roles for this service before adding team members.");
      return;
    }
    setMemberRoles((prev) => ({ ...prev, [userId]: defaultRole.roleLabel }));
  };

  const removeMember = (userId: string) => {
    setMemberRoles((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Team name is required.");
      return;
    }
    setSaving(true);
    const { data: newTeam, error } = await supabase
      .from("teams")
      .insert({
        name: name.trim(),
        department: "Operations",
        leader_id: null,
        service_type: service.service_type,
      })
      .select()
      .single();
    if (error) {
      setSaving(false);
      toast.error(`Failed to create team: ${error.message}`);
      return;
    }

    try {
      await replaceTeamMemberships({
        teamId: newTeam.id,
        memberRoles: Object.fromEntries(
          Object.entries(memberRoles).map(([userId, roleLabel]) => [
            userId,
            roleOptions.find((role) => role.roleLabel === roleLabel) ?? null,
          ]),
        ),
      });
    } catch (memberError) {
      await supabase.from("teams").delete().eq("id", newTeam.id);
      setSaving(false);
      toast.error(
        `Team member assignment failed: ${
          memberError instanceof Error ? memberError.message : "Unknown error"
        }`,
      );
      return;
    }

    logCreation("team", newTeam.id, newTeam.name ?? newTeam.id, {
      id: currentUser?.id ?? "",
      name: currentUser?.name ?? "",
      department: currentUser?.department ?? "",
    });
    toast.success(`Team "${name.trim()}" created.`);
    setSaving(false);
    await onSaved();
  };

  return (
    <div style={{ padding: "14px 16px", border: "1px solid var(--neuron-ui-border)", borderRadius: 8, background: "var(--theme-bg-page)", display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <Label style={{ fontSize: 12, marginBottom: 4, display: "block", color: "var(--neuron-ink-muted)" }}>Service</Label>
        <Input value={service.label} readOnly style={{ height: 34, fontSize: 13, opacity: 0.8 }} />
      </div>
      <div>
        <Label style={{ fontSize: 12, marginBottom: 4, display: "block", color: "var(--neuron-ink-muted)" }}>Team Name</Label>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={`e.g., ${service.label} Team A`}
          autoFocus
          style={{ height: 34, fontSize: 13 }}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
        />
      </div>
      <MemberRosterEditor
        users={users}
        roleOptions={roleOptions}
        assignedIds={assignedIds}
        memberRoles={memberRoles}
        availableToAdd={availableToAdd}
        onAddMember={addMember}
        onRemoveMember={removeMember}
        onRoleChange={(userId, role) => setMemberRoles((prev) => ({ ...prev, [userId]: role }))}
      />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={handleCreate} disabled={saving}>{saving ? "Creating…" : "Create Team"}</Button>
      </div>
    </div>
  );
}

function OperationsTeamPoolEditRow({
  team,
  serviceLabel,
  users,
  roleOptions,
  onSaved,
  onCancel,
}: {
  team: OperationsTeamWithMembers;
  serviceLabel: string;
  users: OperationsUser[];
  roleOptions: TeamMemberRoleInput[];
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(team.name);
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const member of team.members) {
      initial[member.id] = member.team_role ?? roleOptions[0]?.roleLabel ?? "Representative";
    }
    setMemberRoles(initial);
  }, [roleOptions, team.id, team.members]);

  const assignedIds = Object.keys(memberRoles).filter((id) => memberRoles[id]);
  const availableToAdd = users.filter((user) => !assignedIds.includes(user.id));

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Team name is required.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("teams")
      .update({ name: name.trim() })
      .eq("id", team.id);
    if (error) {
      setSaving(false);
      toast.error(`Failed to update team: ${error.message}`);
      return;
    }

    try {
      await replaceTeamMemberships({
        teamId: team.id,
        memberRoles: Object.fromEntries(
          Object.entries(memberRoles).map(([userId, roleLabel]) => [
            userId,
            roleOptions.find((role) => role.roleLabel === roleLabel) ?? null,
          ]),
        ),
      });
    } catch (assignError) {
      setSaving(false);
      toast.error(
        `Failed to save team member: ${
          assignError instanceof Error ? assignError.message : "Unknown error"
        }`,
      );
      return;
    }

    setSaving(false);
    toast.success("Team updated.");
    await onSaved();
  };

  return (
    <div style={{ padding: "14px 16px", background: "var(--theme-bg-page)", display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <Label style={{ fontSize: 12, marginBottom: 4, display: "block", color: "var(--neuron-ink-muted)" }}>Service</Label>
        <Input value={serviceLabel} readOnly style={{ height: 34, fontSize: 13, opacity: 0.8 }} />
      </div>
      <div>
        <Label style={{ fontSize: 12, marginBottom: 4, display: "block", color: "var(--neuron-ink-muted)" }}>Team Name</Label>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
          style={{ height: 34, fontSize: 13 }}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        />
      </div>
      <MemberRosterEditor
        users={users}
        roleOptions={[
          ...roleOptions,
          ...Object.values(memberRoles)
            .filter(Boolean)
            .filter((roleLabel) => !roleOptions.some((role) => role.roleLabel === roleLabel))
            .map((roleLabel) => ({
              roleKey: normalizeRoleKey(roleLabel),
              roleLabel,
            })),
        ]}
        assignedIds={assignedIds}
        memberRoles={memberRoles}
        availableToAdd={availableToAdd}
        onAddMember={(userId) => {
          const defaultRole = roleOptions[0];
          if (!defaultRole) {
            toast.error("Define assignment roles for this service before adding team members.");
            return;
          }
          setMemberRoles((prev) => ({ ...prev, [userId]: defaultRole.roleLabel }));
        }}
        onRemoveMember={(userId) =>
          setMemberRoles((prev) => {
            const next = { ...prev };
            delete next[userId];
            return next;
          })
        }
        onRoleChange={(userId, role) => setMemberRoles((prev) => ({ ...prev, [userId]: role }))}
      />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
      </div>
    </div>
  );
}

function MemberRosterEditor({
  users,
  roleOptions,
  assignedIds,
  memberRoles,
  availableToAdd,
  onAddMember,
  onRemoveMember,
  onRoleChange,
}: {
  users: OperationsUser[];
  roleOptions: TeamMemberRoleInput[];
  assignedIds: string[];
  memberRoles: Record<string, string>;
  availableToAdd: OperationsUser[];
  onAddMember: (userId: string) => void;
  onRemoveMember: (userId: string) => void;
  onRoleChange: (userId: string, role: string) => void;
}) {
  const canAssignRoles = roleOptions.length > 0;

  return (
    <div>
      <Label style={{ fontSize: 12, marginBottom: 4, display: "block", color: "var(--neuron-ink-muted)" }}>Members</Label>
      {!canAssignRoles && (
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--theme-text-muted)" }}>
          Add assignment roles above before assigning members to this team pool.
        </p>
      )}
      <div style={{ border: "1px solid var(--neuron-ui-border)", borderRadius: 8, overflow: "hidden" }}>
        {assignedIds.length === 0 && (
          <p style={{ padding: "10px 14px", fontSize: 13, color: "var(--neuron-ink-muted)", margin: 0 }}>No members added yet.</p>
        )}
        {assignedIds.map((userId, index) => {
          const user = users.find((entry) => entry.id === userId);
          if (!user) return null;
          return (
            <div key={userId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: index > 0 ? "1px solid var(--neuron-ui-border)" : undefined, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--neuron-ink-primary)",
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user.name}
              </span>
                <Select value={memberRoles[userId]} onValueChange={(value) => onRoleChange(userId, value)}>
                  <SelectTrigger style={{ height: 28, fontSize: 12, width: 148, flexShrink: 0 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((role) => (
                    <SelectItem key={role.roleKey} value={role.roleLabel}>
                      {role.roleLabel}
                    </SelectItem>
                  ))}
                  </SelectContent>
              </Select>
              <button
                onClick={() => onRemoveMember(userId)}
                aria-label={`Remove ${user.name} from team`}
                style={{ padding: 4, background: "none", border: "none", cursor: "pointer", color: "var(--neuron-ink-muted)", display: "flex", alignItems: "center", borderRadius: 4, flexShrink: 0 }}
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
        {availableToAdd.length > 0 && (
          <div style={{ padding: "8px 14px", borderTop: assignedIds.length > 0 ? "1px solid var(--neuron-ui-border)" : undefined, background: "var(--neuron-bg-page)" }}>
            <Select value="" onValueChange={onAddMember} disabled={!canAssignRoles}>
              <SelectTrigger style={{ height: 28, fontSize: 12, color: "var(--neuron-ink-muted)" }}>
                <SelectValue placeholder={canAssignRoles ? "Add a member…" : "Add roles first"} />
              </SelectTrigger>
              <SelectContent>
                {availableToAdd.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
