export type AdminUsersAction =
  | "view"
  | "create"
  | "edit"
  | "approve"
  | "delete"
  | "export";

export type AdminUsersTab = "users" | "teams" | "profiles";

export const ADMIN_USERS_PARENT_MODULE_ID = "exec_users" as const;

export const ADMIN_USERS_TAB_MODULE_IDS = {
  users: "admin_users_tab",
  teams: "admin_teams_tab",
  profiles: "admin_access_profiles_tab",
} as const;

type AdminUsersModuleId =
  | typeof ADMIN_USERS_PARENT_MODULE_ID
  | (typeof ADMIN_USERS_TAB_MODULE_IDS)[AdminUsersTab];

export type AdminUsersPermissionCheck = (
  moduleId: AdminUsersModuleId,
  action: AdminUsersAction,
) => boolean;

export function canViewAdminUsersTab(
  check: AdminUsersPermissionCheck,
  tab: AdminUsersTab,
): boolean {
  return (
    check(ADMIN_USERS_PARENT_MODULE_ID, "view") ||
    check(ADMIN_USERS_TAB_MODULE_IDS[tab], "view")
  );
}

export function canCreateAdminUsers(
  check: AdminUsersPermissionCheck,
): boolean {
  return (
    check(ADMIN_USERS_PARENT_MODULE_ID, "create") ||
    check(ADMIN_USERS_TAB_MODULE_IDS.users, "create")
  );
}

export function hasAdminUsersGrant(
  moduleGrants: Record<string, boolean> | null | undefined,
  action: AdminUsersAction,
  tab: AdminUsersTab,
): boolean {
  if (!moduleGrants) return false;

  return (
    moduleGrants[`${ADMIN_USERS_PARENT_MODULE_ID}:${action}`] === true ||
    moduleGrants[`${ADMIN_USERS_TAB_MODULE_IDS[tab]}:${action}`] === true
  );
}
