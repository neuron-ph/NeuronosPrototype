import { supabase } from '../supabase/client';

export interface EligibleUser {
  id:   string;
  name: string;
}

export interface TeamOption {
  id:           string;
  name:         string;
  service_type: string | null;
}

/** All non-Operations teams for a department, sorted by name. */
export async function fetchDeptTeams(department: string): Promise<TeamOption[]> {
  const { data } = await supabase
    .from('teams')
    .select('id, name, service_type')
    .eq('department', department)
    .order('name');
  return (data ?? []) as TeamOption[];
}

/**
 * Users eligible for a specific role in a team.
 * Reads team_memberships + team_role_eligibilities.
 */
export async function fetchEligibleUsersForRole(
  teamId: string,
  roleKey: string,
): Promise<EligibleUser[]> {
  const { data } = await supabase
    .from('team_memberships')
    .select('user_id, users!inner(id, name), team_role_eligibilities!inner(role_key)')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .eq('team_role_eligibilities.role_key', roleKey);

  const seen = new Set<string>();
  const result: EligibleUser[] = [];
  for (const row of (data ?? []) as unknown as Array<{ users: { id: string; name: string } }>) {
    if (!seen.has(row.users.id)) {
      seen.add(row.users.id);
      result.push({ id: row.users.id, name: row.users.name });
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * All eligible users per role_key for a team.
 * Returns a map of roleKey → EligibleUser[].
 */
export async function fetchEligibleUsersByRole(
  teamId: string,
): Promise<Record<string, EligibleUser[]>> {
  const { data } = await supabase
    .from('team_memberships')
    .select('user_id, users!inner(id, name), team_role_eligibilities(role_key)')
    .eq('team_id', teamId)
    .eq('is_active', true);

  const byRole = new Map<string, Map<string, EligibleUser>>();
  for (const row of (data ?? []) as unknown as Array<{
    users: { id: string; name: string };
    team_role_eligibilities?: Array<{ role_key: string }> | null;
  }>) {
    const u = { id: row.users.id, name: row.users.name };
    for (const e of row.team_role_eligibilities ?? []) {
      if (!byRole.has(e.role_key)) byRole.set(e.role_key, new Map());
      byRole.get(e.role_key)!.set(u.id, u);
    }
  }

  return Object.fromEntries(
    Array.from(byRole.entries()).map(([rk, um]) => [
      rk,
      Array.from(um.values()).sort((a, b) => a.name.localeCompare(b.name)),
    ]),
  );
}
