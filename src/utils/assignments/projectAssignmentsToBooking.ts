import type {
  BookingAssignmentInput,
  BookingAssignmentProjection,
} from '../../types/assignments';

/**
 * Per-service mapping of v1 role_keys to the legacy booking columns.
 * The first role_key listed wins when more than one assignment matches.
 *
 *   Brokerage / Forwarding:
 *     team_leader        -> supervisor projection
 *     customs_declarant  -> handler    projection
 *
 *   Trucking / Marine Insurance / Others:
 *     operations_supervisor -> supervisor projection
 *     handler               -> handler    projection
 */
const SUPERVISOR_KEYS_BY_SERVICE: Record<string, string[]> = {
  Brokerage: ['team_leader', 'impex_supervisor'],
  Forwarding: ['team_leader', 'impex_supervisor'],
  Trucking: ['operations_supervisor'],
  'Marine Insurance': ['operations_supervisor'],
  Others: ['operations_supervisor'],
};

const HANDLER_KEYS_BY_SERVICE: Record<string, string[]> = {
  Brokerage: ['customs_declarant'],
  Forwarding: ['customs_declarant'],
  Trucking: ['handler'],
  'Marine Insurance': ['handler'],
  Others: ['handler'],
};

interface ProjectInputs {
  serviceType: string;
  assignments: BookingAssignmentInput[];
  serviceManager: { id: string | null; name: string | null } | null;
  teamPool?: { id: string | null; name: string | null } | null;
}

/**
 * Build the legacy {team,manager,supervisor,handler}_{id,name} projection from
 * a v1 service-manager + booking_assignments set. Used at booking
 * create/update so older screens, dashboards, and reports keep working.
 *
 * Manager always projects from the service-level default manager — never from
 * an assignment row. Manager is no longer a per-booking assignment role.
 */
export function projectAssignmentsToBooking({
  serviceType,
  assignments,
  serviceManager,
  teamPool,
}: ProjectInputs): BookingAssignmentProjection {
  const supKeys = SUPERVISOR_KEYS_BY_SERVICE[serviceType] ?? [];
  const hdlKeys = HANDLER_KEYS_BY_SERVICE[serviceType] ?? [];

  const findFirst = (keys: string[]) => {
    for (const key of keys) {
      const hit = assignments.find((a) => a.role_key === key && !!a.user_id);
      if (hit) return hit;
    }
    return null;
  };

  const supervisor = findFirst(supKeys);
  const handler = findFirst(hdlKeys);

  return {
    team_id: teamPool?.id ?? null,
    team_name: teamPool?.name ?? null,
    manager_id: serviceManager?.id ?? null,
    manager_name: serviceManager?.name ?? null,
    supervisor_id: supervisor?.user_id ?? null,
    supervisor_name: supervisor?.user_name ?? null,
    handler_id: handler?.user_id ?? null,
    handler_name: handler?.user_name ?? null,
  };
}
