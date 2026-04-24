import type {
  TeamProfileAssignment,
  ResolvedTeamProfile,
  UpsertCustomerTeamProfileInput,
} from "../types/bd";
import type { TeamAssignment } from "../components/pricing/TeamAssignmentForm";

// ─── Operations ──────────────────────────────────────────────────────────────

export function operationsAssignmentToProfileInput(
  assignment: TeamAssignment,
  customerId: string,
  serviceType: string
): UpsertCustomerTeamProfileInput {
  const assignments: TeamProfileAssignment[] = [];
  assignments.push({
    role_key: "manager",
    role_label: "Manager",
    user_id: assignment.manager.id,
    user_name: assignment.manager.name,
  });
  if (assignment.supervisor) {
    assignments.push({
      role_key: "supervisor",
      role_label: "Supervisor",
      user_id: assignment.supervisor.id,
      user_name: assignment.supervisor.name,
    });
  }
  if (assignment.handler) {
    assignments.push({
      role_key: "handler",
      role_label: "Handler",
      user_id: assignment.handler.id,
      user_name: assignment.handler.name,
    });
  }
  return {
    customer_id: customerId,
    department: "Operations",
    service_type: serviceType,
    team_id: assignment.team.id,
    team_name: assignment.team.name,
    assignments,
  };
}

export function profileToOperationsFields(profile: ResolvedTeamProfile): {
  team_id: string | null;
  team_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
  supervisor_id: string | null;
  supervisor_name: string | null;
  handler_id: string | null;
  handler_name: string | null;
} {
  const find = (key: string) => profile.assignments.find((a) => a.role_key === key);
  const mgr = find("manager");
  const sv = find("supervisor");
  const hd = find("handler");
  return {
    team_id: profile.team_id ?? null,
    team_name: profile.team_name ?? null,
    manager_id: mgr?.user_id ?? null,
    manager_name: mgr?.user_name ?? null,
    supervisor_id: sv?.user_id ?? null,
    supervisor_name: sv?.user_name ?? null,
    handler_id: hd?.user_id ?? null,
    handler_name: hd?.user_name ?? null,
  };
}

// ─── Generic department ───────────────────────────────────────────────────────

export function assignmentsToProjectTeamFields(assignments: TeamProfileAssignment[]): {
  manager_id?: string | null;
  manager_name?: string | null;
  supervisor_id?: string | null;
  supervisor_name?: string | null;
  handler_id?: string | null;
  handler_name?: string | null;
} {
  const find = (key: string) => assignments.find((a) => a.role_key === key);
  const mgr = find("manager");
  const sv = find("supervisor");
  const hd = find("handler");
  return {
    manager_id: mgr?.user_id ?? null,
    manager_name: mgr?.user_name ?? null,
    supervisor_id: sv?.user_id ?? null,
    supervisor_name: sv?.user_name ?? null,
    handler_id: hd?.user_id ?? null,
    handler_name: hd?.user_name ?? null,
  };
}

export function assignmentsToPricingAssignee(assignments: TeamProfileAssignment[]): string | null {
  const match =
    assignments.find((a) => a.role_key === "pricing_analyst") ?? assignments[0];
  return match?.user_id ?? null;
}

export function generateRoleKey(roleLabel: string): string {
  return roleLabel.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}
