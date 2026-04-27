export type TeamRoleLabel = string;

export type TeamMembershipUser = {
  id: string;
  team_id: string | null;
  team_role?: string | null;
};

export type TeamMembershipUpdatePlan = {
  removals: string[];
  assignments: { userId: string; role: TeamRoleLabel }[];
};

export function isTeamRoleLabel(value: unknown): value is TeamRoleLabel {
  return typeof value === "string" && value.trim().length > 0;
}

export function buildTeamMembershipUpdatePlan({
  teamId,
  currentMembers,
  memberRoles,
}: {
  teamId: string;
  currentMembers: TeamMembershipUser[];
  memberRoles: Record<string, string | null | undefined>;
}): TeamMembershipUpdatePlan {
  const targetIds = new Set(
    Object.entries(memberRoles)
      .filter(([, role]) => isTeamRoleLabel(role))
      .map(([userId]) => userId),
  );

  const removals = currentMembers
    .filter((user) => user.team_id === teamId && !targetIds.has(user.id))
    .map((user) => user.id);

  const assignments = Object.entries(memberRoles).reduce<TeamMembershipUpdatePlan["assignments"]>(
    (acc, [userId, role]) => {
      if (isTeamRoleLabel(role)) {
        acc.push({ userId, role });
      }
      return acc;
    },
    [],
  );

  return { removals, assignments };
}
