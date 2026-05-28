import { beforeEach, describe, expect, it, vi } from "vitest";
import { replaceTeamMemberships } from "./teamMemberships";
import { supabase } from "./supabase/client";

vi.mock("./supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const mockedSupabase = vi.mocked(supabase);

describe("replaceTeamMemberships", () => {
  const operations: Array<{ table: string; action: string; payload?: unknown; column?: string; value?: unknown }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    operations.length = 0;

    mockedSupabase.from.mockImplementation((table: string) => {
      if (table === "team_memberships") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async (column: string, value: unknown) => {
              operations.push({ table, action: "select.eq", column, value });
              return {
                data: [
                  { id: "current-membership", team_id: "team-a", user_id: "user-1", is_active: true },
                  { id: "removed-membership", team_id: "team-a", user_id: "user-2", is_active: true },
                ],
                error: null,
              };
            }),
          })),
          update: vi.fn((payload: unknown) => ({
            eq: vi.fn(async (column: string, value: unknown) => {
              operations.push({ table, action: "update.eq", payload, column, value });
              return { error: null };
            }),
            in: vi.fn(async (column: string, value: unknown) => {
              operations.push({ table, action: "update.in", payload, column, value });
              return { error: null };
            }),
          })),
          insert: vi.fn((payload: unknown) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                operations.push({ table, action: "insert.single", payload });
                return { data: { id: "inserted-membership" }, error: null };
              }),
            })),
          })),
        } as any;
      }

      if (table === "team_role_eligibilities") {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(async (column: string, value: unknown) => {
              operations.push({ table, action: "delete.eq", column, value });
              return { error: null };
            }),
          })),
          insert: vi.fn(async (payload: unknown) => {
            operations.push({ table, action: "insert", payload });
            return { error: null };
          }),
        } as any;
      }

      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("updates only the edited team and keeps other active team memberships intact", async () => {
    await replaceTeamMemberships({
      teamId: "team-a",
      memberRoles: {
        "user-1": { roleKey: "handler", roleLabel: "Handler" },
        "user-3": { roleKey: "supervisor", roleLabel: "Supervisor" },
      },
    });

    expect(mockedSupabase.from).not.toHaveBeenCalledWith("users");
    expect(operations).not.toContainEqual(
      expect.objectContaining({
        table: "team_memberships",
        action: "update.eq",
        payload: { is_active: false },
      }),
    );
    expect(operations).toContainEqual({
      table: "team_memberships",
      action: "update.in",
      payload: { is_active: false },
      column: "id",
      value: ["removed-membership"],
    });
  });
});
