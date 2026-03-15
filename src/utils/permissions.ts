/**
 * ROLE-BASED ACCESS CONTROL (RBAC)
 * Defines permissions for different user departments and roles in the Neuron OS workflow.
 * 
 * Canonical values (source of truth: /hooks/useUser.tsx):
 *   department: 'Business Development' | 'Pricing' | 'Operations' | 'Accounting' | 'Executive' | 'HR'
 *   role:       'rep' | 'manager' | 'director'
 */

export type Department = "Business Development" | "Pricing" | "Operations" | "Accounting" | "Executive" | "HR";
export type Role = "rep" | "manager" | "director";

export type QuotationAction = 
  | "create_inquiry"
  | "edit_inquiry"
  | "submit_to_pricing"
  | "price_quotation"
  | "send_to_client"
  | "mark_accepted"
  | "mark_rejected"
  | "create_project"
  | "request_revision"
  | "cancel_quotation";

export type ProjectAction =
  | "view_project"
  | "edit_project"
  | "generate_invoice"
  | "assign_operations";

export type BookingAction =
  | "create_booking"
  | "edit_booking"
  | "view_booking"
  | "create_billing"
  | "create_expense";

/**
 * Role hierarchy: rep (0) < manager (1) < director (2)
 */
const ROLE_LEVEL: Record<Role, number> = {
  rep: 0,
  manager: 1,
  director: 2,
};

/**
 * Check if a user's role meets or exceeds a minimum role level.
 */
export function hasMinRole(userRole: Role, minRole: Role): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[minRole];
}

/**
 * Check if a user can access a given module.
 * Executive department always has access to everything.
 */
export function canAccessModule(
  userDepartment: Department,
  userRole: Role,
  module: "bd" | "pricing" | "operations" | "accounting" | "hr" | "admin" | "activity-log" | "ticket-queue"
): boolean {
  // Executive always passes
  if (userDepartment === "Executive") return true;
  // Directors always pass
  if (userRole === "director") return true;

  const moduleAccess: Record<string, { departments: Department[]; minRole?: Role }> = {
    bd: { departments: ["Business Development"] },
    pricing: { departments: ["Pricing"] },
    operations: { departments: ["Operations"] },
    accounting: { departments: ["Accounting"] },
    hr: { departments: ["HR"] },
    admin: { departments: [], minRole: "director" },
    "activity-log": { departments: ["Business Development", "Pricing", "Operations", "Accounting", "HR"], minRole: "manager" },
    "ticket-queue": { departments: ["Business Development", "Pricing", "Operations", "Accounting", "HR"], minRole: "manager" },
  };

  const access = moduleAccess[module];
  if (!access) return false;

  const deptAllowed = access.departments.includes(userDepartment);
  const roleAllowed = access.minRole ? hasMinRole(userRole, access.minRole) : true;

  return deptAllowed && roleAllowed;
}

/**
 * Check if user can perform a quotation action
 */
export function canPerformQuotationAction(
  action: QuotationAction,
  userDepartment: Department,
  userRole?: Role
): boolean {
  // Directors and Executive always pass
  if (userRole === "director" || userDepartment === "Executive") return true;

  const permissions: Record<QuotationAction, Department[]> = {
    create_inquiry: ["Business Development"],
    edit_inquiry: ["Business Development"],
    submit_to_pricing: ["Business Development"],
    price_quotation: ["Pricing"],
    send_to_client: ["Business Development"],
    mark_accepted: ["Business Development"],
    mark_rejected: ["Business Development"],
    create_project: ["Business Development", "Pricing"],
    request_revision: ["Business Development"],
    cancel_quotation: ["Business Development"]
  };

  return permissions[action]?.includes(userDepartment) || false;
}

/**
 * Check if user can perform a project action
 */
export function canPerformProjectAction(
  action: ProjectAction,
  userDepartment: Department,
  userRole?: Role
): boolean {
  // Directors and Executive always pass
  if (userRole === "director" || userDepartment === "Executive") return true;

  const permissions: Record<ProjectAction, Department[]> = {
    view_project: ["Business Development", "Pricing", "Operations", "Accounting"],
    edit_project: ["Business Development", "Pricing"],
    generate_invoice: ["Business Development", "Accounting"],
    assign_operations: ["Business Development", "Pricing", "Operations"]
  };

  return permissions[action]?.includes(userDepartment) || false;
}

/**
 * Check if user can perform a booking action
 */
export function canPerformBookingAction(
  action: BookingAction,
  userDepartment: Department,
  userRole?: Role
): boolean {
  // Directors and Executive always pass
  if (userRole === "director" || userDepartment === "Executive") return true;

  const permissions: Record<BookingAction, Department[]> = {
    create_booking: ["Pricing", "Operations"],
    edit_booking: ["Pricing", "Operations"],
    view_booking: ["Business Development", "Pricing", "Operations", "Accounting"],
    create_billing: ["Operations", "Accounting"],
    create_expense: ["Operations", "Accounting"]
  };

  return permissions[action]?.includes(userDepartment) || false;
}

/**
 * Get human-readable action name
 */
export function getActionName(action: QuotationAction | ProjectAction | BookingAction): string {
  const names: Record<string, string> = {
    create_inquiry: "Create Inquiry",
    edit_inquiry: "Edit Inquiry",
    submit_to_pricing: "Submit to Pricing",
    price_quotation: "Price Quotation",
    send_to_client: "Send to Client",
    mark_accepted: "Mark as Accepted",
    mark_rejected: "Mark as Rejected",
    create_project: "Create Project",
    request_revision: "Request Revision",
    cancel_quotation: "Cancel Quotation",
    view_project: "View Project",
    edit_project: "Edit Project",
    generate_invoice: "Generate Invoice",
    assign_operations: "Assign to Operations",
    create_booking: "Create Booking",
    edit_booking: "Edit Booking",
    view_booking: "View Booking",
    create_billing: "Create Billing",
    create_expense: "Create Expense"
  };

  return names[action] || action;
}

/**
 * Permission error message
 */
export function getPermissionErrorMessage(
  action: string,
  userDepartment: Department
): string {
  return `Your department (${userDepartment}) does not have permission to perform this action: ${getActionName(action as any)}`;
}
