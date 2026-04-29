import { supabase } from "./supabase/client";

export interface TeamMemberRoleInput {
  roleKey: string;
  roleLabel: string;
}

// Each user in the map may carry a single role or multiple roles.
export type TeamMemberRoleMap = Record<
  string,
  TeamMemberRoleInput | TeamMemberRoleInput[] | string | string[] | null | undefined
>;

interface TeamMembershipRow {
  id: string;
  team_id: string;
  user_id: string;
  is_active: boolean;
}

interface TeamRoleEligibilityRow {
  role_key: string;
  role_label: string;
  sort_order: number | null;
}

function normalizeSingle(
  value: TeamMemberRoleInput | string,
): TeamMemberRoleInput | null {
  if (typeof value === "string") {
    const roleLabel = value.trim();
    if (!roleLabel) return null;
    return {
      roleKey: roleLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
      roleLabel,
    };
  }
  const roleKey = value.roleKey.trim();
  const roleLabel = value.roleLabel.trim();
  if (!roleKey || !roleLabel) return null;
  return { roleKey, roleLabel };
}

function normalizeRoleInputs(
  value: TeamMemberRoleInput | TeamMemberRoleInput[] | string | string[] | null | undefined,
): TeamMemberRoleInput[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return (value as Array<TeamMemberRoleInput | string>)
      .map((v) => normalizeSingle(v))
      .filter((v): v is TeamMemberRoleInput => v !== null);
  }
  const single = normalizeSingle(value as TeamMemberRoleInput | string);
  return single ? [single] : [];
}

async function syncLegacyUserTeamProjection(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;

  const uniqueUserIds = Array.from(new Set(userIds));
  const { data, error } = await supabase
    .from("team_memberships")
    .select(`
      user_id,
      team_id,
      updated_at,
      team_role_eligibilities(role_key, role_label, sort_order)
    `)
    .eq("is_active", true)
    .in("user_id", uniqueUserIds);

  if (error) throw error;

  const membershipByUser = new Map<
    string,
    { teamId: string | null; teamRole: string | null; updatedAt: string }
  >();

  for (const row of (data ?? []) as Array<{
    user_id: string;
    team_id: string;
    updated_at: string;
    team_role_eligibilities?: TeamRoleEligibilityRow[] | null;
  }>) {
    const sortedRoles = [...(row.team_role_eligibilities ?? [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
    const projected = {
      teamId: row.team_id,
      teamRole: sortedRoles[0]?.role_label ?? null,
      updatedAt: row.updated_at,
    };
    const existing = membershipByUser.get(row.user_id);
    if (!existing || existing.updatedAt < projected.updatedAt) {
      membershipByUser.set(row.user_id, projected);
    }
  }

  for (const userId of uniqueUserIds) {
    const projection = membershipByUser.get(userId);
    const { error: userError } = await supabase
      .from("users")
      .update({
        team_id: projection?.teamId ?? null,
        team_role: projection?.teamRole ?? null,
      })
      .eq("id", userId);
    if (userError) throw userError;
  }
}

export async function replaceTeamMemberships(params: {
  teamId: string;
  memberRoles: TeamMemberRoleMap;
}): Promise<void> {
  // Normalize every entry to an array of roles; skip users with no valid roles
  const targetEntries = Object.entries(params.memberRoles)
    .map(([userId, value]) => [userId, normalizeRoleInputs(value)] as const)
    .filter((entry): entry is readonly [string, TeamMemberRoleInput[]] => entry[1].length > 0);

  const targetUserIds = targetEntries.map(([userId]) => userId);

  const [{ data: currentRows, error: currentError }, { data: teamRows, error: teamError }] =
    await Promise.all([
      supabase
        .from("team_memberships")
        .select("id, team_id, user_id, is_active")
        .eq("team_id", params.teamId),
      targetUserIds.length > 0
        ? supabase
            .from("team_memberships")
            .select("id, team_id, user_id, is_active")
            .eq("is_active", true)
            .in("user_id", targetUserIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (currentError) throw currentError;
  if (teamError) throw teamError;

  const currentMemberships = (currentRows ?? []) as TeamMembershipRow[];
  const targetMemberships = (teamRows ?? []) as TeamMembershipRow[];
  const currentByUser = new Map(currentMemberships.map((row) => [row.user_id, row]));
  const activeByUser = new Map(targetMemberships.map((row) => [row.user_id, row]));

  // Deactivate members being removed
  const removals = currentMemberships
    .filter((row) => row.is_active && !targetUserIds.includes(row.user_id))
    .map((row) => row.id);

  if (removals.length > 0) {
    const { error: deactivateError } = await supabase
      .from("team_memberships")
      .update({ is_active: false })
      .in("id", removals);
    if (deactivateError) throw deactivateError;
  }

  for (const [userId, roles] of targetEntries) {
    // Move user off another active team if needed
    const existingActive = activeByUser.get(userId);
    if (existingActive && existingActive.team_id !== params.teamId) {
      const { error: deactivateOtherError } = await supabase
        .from("team_memberships")
        .update({ is_active: false })
        .eq("id", existingActive.id);
      if (deactivateOtherError) throw deactivateOtherError;
    }

    // Upsert membership row
    let membershipId = currentByUser.get(userId)?.id ?? null;
    if (membershipId) {
      const { error: reactivateError } = await supabase
        .from("team_memberships")
        .update({ is_active: true })
        .eq("id", membershipId);
      if (reactivateError) throw reactivateError;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("team_memberships")
        .insert({ team_id: params.teamId, user_id: userId, is_active: true })
        .select("id")
        .single();
      if (insertError) throw insertError;
      membershipId = inserted.id;
    }

    // Replace all eligibility rows for this membership
    const { error: clearRoleError } = await supabase
      .from("team_role_eligibilities")
      .delete()
      .eq("team_membership_id", membershipId);
    if (clearRoleError) throw clearRoleError;

    for (const [sortIndex, role] of roles.entries()) {
      const { error: insertRoleError } = await supabase
        .from("team_role_eligibilities")
        .insert({
          team_membership_id: membershipId,
          role_key: role.roleKey,
          role_label: role.roleLabel,
          sort_order: sortIndex,
        });
      if (insertRoleError) throw insertRoleError;
    }
  }

  const affectedUsers = [
    ...currentMemberships.map((row) => row.user_id),
    ...targetUserIds,
  ];
  await syncLegacyUserTeamProjection(affectedUsers);
}

export async function clearTeamMemberships(teamId: string): Promise<void> {
  const { data, error } = await supabase
    .from("team_memberships")
    .select("id, user_id")
    .eq("team_id", teamId)
    .eq("is_active", true);

  if (error) throw error;

  const rows = data ?? [];
  if (rows.length > 0) {
    const membershipIds = rows.map((row) => row.id);
    const userIds = rows.map((row) => row.user_id);

    const { error: deactivateError } = await supabase
      .from("team_memberships")
      .update({ is_active: false })
      .in("id", membershipIds);
    if (deactivateError) throw deactivateError;

    await syncLegacyUserTeamProjection(userIds);
  }
}

export interface TeamMembershipRosterEntry {
  teamId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userDepartment: string;
  userRole: string;
  avatarUrl?: string | null;
  roleKey: string | null;
  roleLabel: string | null;
  roles: Array<{ roleKey: string; roleLabel: string }>; // all eligibilities, sorted
}

export async function listActiveTeamMemberships(): Promise<TeamMembershipRosterEntry[]> {
  const { data, error } = await supabase
    .from("team_memberships")
    .select(`
      team_id,
      user_id,
      users!inner(id, name, email, department, role, avatar_url),
      team_role_eligibilities(role_key, role_label, sort_order)
    `)
    .eq("is_active", true);

  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    team_id: string;
    user_id: string;
    users: { id: string; name: string; email: string; department: string; role: string; avatar_url?: string | null };
    team_role_eligibilities?: TeamRoleEligibilityRow[] | null;
  }>).map((row) => {
    const sortedRoles = [...(row.team_role_eligibilities ?? [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
    const primaryRole = sortedRoles[0];
    return {
      teamId:         row.team_id,
      userId:         row.user_id,
      userName:       row.users.name,
      userEmail:      row.users.email,
      userDepartment: row.users.department,
      userRole:       row.users.role,
      avatarUrl:      row.users.avatar_url ?? null,
      roleKey:        primaryRole?.role_key ?? null,
      roleLabel:      primaryRole?.role_label ?? null,
      roles:          sortedRoles.map((r) => ({ roleKey: r.role_key, roleLabel: r.role_label })),
    };
  });
}
