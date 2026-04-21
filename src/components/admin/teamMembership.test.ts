import { describe, expect, it } from "vitest";

import { buildTeamMembershipUpdatePlan } from "./teamMembership";

describe("buildTeamMembershipUpdatePlan", () => {
  it("only removes users no longer in the team and assigns selected members", () => {
    const plan = buildTeamMembershipUpdatePlan({
      teamId: "team-1",
      currentMembers: [
        { id: "kept", team_id: "team-1", team_role: "Representative" },
        { id: "removed", team_id: "team-1", team_role: "Supervisor" },
        { id: "other-team", team_id: "team-2", team_role: "Representative" },
      ],
      memberRoles: {
        kept: "Team Leader",
        added: "Representative",
      },
    });

    expect(plan.removals).toEqual(["removed"]);
    expect(plan.assignments).toEqual([
      { userId: "kept", role: "Team Leader" },
      { userId: "added", role: "Representative" },
    ]);
  });
});
