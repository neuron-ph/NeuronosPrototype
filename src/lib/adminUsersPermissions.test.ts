import { describe, expect, it } from "vitest";

import {
  canCreateAdminUsers,
  canViewAdminUsersTab,
  hasAdminUsersGrant,
} from "./adminUsersPermissions";

describe("adminUsersPermissions", () => {
  it("treats parent Users-module view grants as tab access", () => {
    const grants = new Set(["exec_users:view"]);
    const can = (moduleId: string, action: string) =>
      grants.has(`${moduleId}:${action}`);

    expect(canViewAdminUsersTab(can, "users")).toBe(true);
    expect(canViewAdminUsersTab(can, "teams")).toBe(true);
    expect(canViewAdminUsersTab(can, "profiles")).toBe(true);
  });

  it("allows user creation from either parent or tab create grants", () => {
    const parentCan = (moduleId: string, action: string) =>
      moduleId === "exec_users" && action === "create";
    const tabCan = (moduleId: string, action: string) =>
      moduleId === "admin_users_tab" && action === "create";

    expect(canCreateAdminUsers(parentCan)).toBe(true);
    expect(canCreateAdminUsers(tabCan)).toBe(true);
  });

  it("reads create grants from parent or child module_grants keys", () => {
    expect(
      hasAdminUsersGrant({ "exec_users:create": true }, "create", "users"),
    ).toBe(true);
    expect(
      hasAdminUsersGrant(
        { "admin_access_profiles_tab:view": true },
        "view",
        "profiles",
      ),
    ).toBe(true);
    expect(hasAdminUsersGrant({}, "create", "users")).toBe(false);
  });
});
