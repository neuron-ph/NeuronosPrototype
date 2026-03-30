export type ModuleId =
  | "bd_contacts" | "bd_customers" | "bd_tasks" | "bd_activities" | "bd_budget_requests"
  | "pricing_quotations" | "pricing_contracts"
  | "ops_projects" | "ops_bookings"
  | "acct_billings" | "acct_collections" | "acct_expenses" | "acct_evouchers" | "acct_reports"
  | "hr"
  | "exec_activity_log" | "exec_users";

export type ActionId = "view" | "create" | "edit" | "approve" | "delete" | "export";

export const PERM_ACTIONS: ActionId[] = ["view", "create", "edit", "approve", "delete", "export"];

export interface PermModule {
  id: ModuleId;
  label: string;
  group: string;
  dept: string; // owning department
}

export const PERM_MODULES: PermModule[] = [
  { id: "bd_contacts",       label: "Contacts",        group: "Business Development", dept: "Business Development" },
  { id: "bd_customers",      label: "Customers",       group: "Business Development", dept: "Business Development" },
  { id: "bd_tasks",          label: "Tasks",           group: "Business Development", dept: "Business Development" },
  { id: "bd_activities",     label: "Activities",      group: "Business Development", dept: "Business Development" },
  { id: "bd_budget_requests",label: "Budget Requests", group: "Business Development", dept: "Business Development" },
  { id: "pricing_quotations",label: "Quotations",      group: "Pricing",              dept: "Pricing" },
  { id: "pricing_contracts", label: "Contracts",       group: "Pricing",              dept: "Pricing" },
  { id: "ops_projects",      label: "Projects",        group: "Operations",           dept: "Operations" },
  { id: "ops_bookings",      label: "Bookings",        group: "Operations",           dept: "Operations" },
  { id: "acct_billings",     label: "Billings",        group: "Accounting",           dept: "Accounting" },
  { id: "acct_collections",  label: "Collections",     group: "Accounting",           dept: "Accounting" },
  { id: "acct_expenses",     label: "Expenses",        group: "Accounting",           dept: "Accounting" },
  { id: "acct_evouchers",    label: "E-Vouchers",      group: "Accounting",           dept: "Accounting" },
  { id: "acct_reports",      label: "Reports",         group: "Accounting",           dept: "Accounting" },
  { id: "hr",                label: "HR",              group: "HR",                   dept: "HR" },
  { id: "exec_activity_log", label: "Activity Log",    group: "Executive",            dept: "Executive" },
  { id: "exec_users",        label: "User Management", group: "Executive",            dept: "Executive" },
];

// RBAC baseline:
// Executive            → all actions on all modules
// Manager (own dept)   → all actions
// team_leader (own dept) → view, create, edit
// staff (own dept)     → view only
// cross-dept           → no access by default

const ALL_ACTIONS: ActionId[] = ["view", "create", "edit", "approve", "delete", "export"];
const LEADER_ACTIONS: ActionId[] = ["view", "create", "edit"];
const STAFF_ACTIONS: ActionId[] = ["view"];

export function getInheritedPermission(
  role: string,
  department: string,
  moduleId: ModuleId,
  action: ActionId
): boolean {
  const mod = PERM_MODULES.find((m) => m.id === moduleId);
  if (!mod) return false;

  if (department === "Executive") return true;

  const ownDept = mod.dept === department;

  if (!ownDept) return false;

  if (role === "manager")     return ALL_ACTIONS.includes(action);
  if (role === "team_leader") return LEADER_ACTIONS.includes(action);
  if (role === "staff")       return STAFF_ACTIONS.includes(action);

  return false;
}

export function getEffectivePermission(
  role: string,
  department: string,
  moduleId: ModuleId,
  action: ActionId,
  moduleGrants: Record<string, boolean>
): { granted: boolean; isCustom: boolean } {
  const key = `${moduleId}:${action}`;
  if (key in moduleGrants) {
    return { granted: moduleGrants[key], isCustom: true };
  }
  return { granted: getInheritedPermission(role, department, moduleId, action), isCustom: false };
}
