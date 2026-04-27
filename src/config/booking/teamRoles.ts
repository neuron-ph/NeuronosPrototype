/**
 * Team role labels for booking team assignment.
 *
 * Today every service uses the same generic Manager / Supervisor / Handler
 * trio. The client docs hint at service-specific operational role names
 * (e.g. coordinator, dispatcher, handler) that we may adopt later.
 *
 * TODO(team-roles): replace this with a service-aware lookup once the
 * client confirms the per-service role taxonomy. This file is the single
 * landing point for that refactor — no other component should hard-code
 * 'Manager' / 'Supervisor' / 'Handler' strings.
 */

export type TeamRoleKey = 'manager' | 'supervisor' | 'handler';

const GENERIC_LABELS: Record<TeamRoleKey, string> = {
  manager: 'Manager',
  supervisor: 'Supervisor',
  handler: 'Handler',
};

export function getTeamRoleLabel(role: TeamRoleKey, _serviceType?: string): string {
  return GENERIC_LABELS[role];
}
