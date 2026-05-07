// ─────────────────────────────────────────────────────────────────────────────
// Canonical Access / Navigation Schema
// ─────────────────────────────────────────────────────────────────────────────
//
// This is the single source of truth for:
//   1. Sidebar visible structure (NeuronSidebar.tsx)
//   2. Access Configuration permission matrix (PermissionGrantEditor.tsx)
//   3. PERM_MODULES derivation (permissionsConfig.ts)
//
// Hierarchy is explicit: Department → Module → Tabs.
// Order matters: arrays are rendered in declaration order.
// Labels are presentation-only — never parsed for hierarchy.
//
// Adding a sidebar entry? Add it here and the sidebar + access matrix follow.

import type { ModuleId } from "../../components/admin/permissionsConfig";

// ─── Department identifiers ──────────────────────────────────────────────────

export type AccessDepartmentId =
  | "business-development"
  | "pricing"
  | "operations"
  | "accounting"
  | "hr"
  | "executive"
  | "inbox"
  | "personal";

// Display labels used in PERM_MODULES.group / .dept and in the sidebar
export const DEPT_LABEL: Record<AccessDepartmentId, string> = {
  "business-development": "Business Development",
  "pricing":              "Pricing",
  "operations":           "Operations",
  "accounting":           "Accounting",
  "hr":                   "HR",
  "executive":            "Executive",
  "inbox":                "Inbox",
  "personal":             "Personal",
};

// Sidebar Page id type — must align with NeuronSidebar's Page union
export type SidebarPageId = string;

// ─── Schema node types ───────────────────────────────────────────────────────

export interface AccessTabNode {
  kind: "tab";
  id: string;
  /** Permission moduleId for this tab. Must exist in ModuleId union. */
  moduleId: ModuleId;
  /** Display label (clean, no ↳ prefix). */
  label: string;
}

export interface AccessModuleNode {
  kind: "module";
  id: string;
  /** Permission moduleId for the parent row. */
  moduleId: ModuleId;
  label: string;
  /** Sidebar page id, when this module is a sidebar entry. */
  pageId?: SidebarPageId;
  /**
   * Whether this module is rendered as a top-level row in the Access
   * Configuration matrix. Defaults to `true`. Set to `false` for internal
   * pseudo-modules whose moduleIds must remain in the runtime permission
   * registry but should NOT appear as peers of real sidebar modules in the
   * admin-facing matrix. Strict rule: every visible top-level row must
   * correspond to a real sidebar module (i.e. have a `pageId`).
   */
  visibleInAccessMatrix?: boolean;
  tabs: AccessTabNode[];
}

export interface AccessDepartmentNode {
  id: AccessDepartmentId;
  label: string;
  modules: AccessModuleNode[];
}

// Tab factory — every node exposes all 6 actions in the matrix; per-module
// applicability is no longer encoded in the schema. The Access Configuration
// matrix is the sole control surface for which actions a role may perform.

const tab = (moduleId: ModuleId, label: string): AccessTabNode =>
  ({ kind: "tab", id: moduleId, moduleId, label });

// ─── Schema ──────────────────────────────────────────────────────────────────

export const ACCESS_SCHEMA: AccessDepartmentNode[] = [

  // ─── Business Development ──────────────────────────────────────────────────
  {
    id: "business-development",
    label: DEPT_LABEL["business-development"],
    modules: [
      {
        kind: "module", id: "bd_contacts", moduleId: "bd_contacts",
        label: "Contacts", pageId: "bd-contacts",
        tabs: [
          tab("bd_contacts_activities_tab",  "Activities"),
          tab("bd_contacts_tasks_tab",       "Tasks"),
          tab("bd_contacts_inquiries_tab",   "Inquiries"),
          tab("bd_contacts_attachments_tab", "Attachments"),
          tab("bd_contacts_comments_tab",    "Comments"),
          tab("bd_contacts_teams_tab",       "Teams"),
        ],
      },
      {
        kind: "module", id: "bd_customers", moduleId: "bd_customers",
        label: "Customers", pageId: "bd-customers",
        tabs: [
          tab("bd_customers_contacts_tab",    "Contacts"),
          tab("bd_customers_activities_tab",  "Activities"),
          tab("bd_customers_tasks_tab",       "Tasks"),
          tab("bd_customers_inquiries_tab",   "Inquiries"),
          tab("bd_customers_comments_tab",    "Comments"),
          tab("bd_customers_attachments_tab", "Attachments"),
          tab("bd_customers_projects_tab",    "Projects"),
          tab("bd_customers_contracts_tab",   "Contracts"),
          tab("bd_customers_teams_tab",       "Teams"),
        ],
      },
      { kind: "module", id: "bd_inquiries", moduleId: "bd_inquiries", label: "Inquiries", pageId: "bd-inquiries", tabs: [] },
      { kind: "module", id: "bd_projects",  moduleId: "bd_projects",  label: "Projects",  pageId: "bd-projects",  tabs: [] },
      { kind: "module", id: "bd_contracts", moduleId: "bd_contracts", label: "Contracts", pageId: "bd-contracts",  tabs: [] },
      { kind: "module", id: "bd_tasks",      moduleId: "bd_tasks",      label: "Tasks",      pageId: "bd-tasks", tabs: [] },
      { kind: "module", id: "bd_activities", moduleId: "bd_activities", label: "Activities", pageId: "bd-activities", tabs: [] },
      {
        kind: "module", id: "bd_budget_requests", moduleId: "bd_budget_requests",
        label: "Budget Requests", pageId: "bd-budget-requests",
        tabs: [
          tab("bd_budget_requests_all_tab",         "All"),
          tab("bd_budget_requests_my_requests_tab", "My Requests"),
        ],
      },
    ],
  },

  // ─── Pricing ────────────────────────────────────────────────────────────────
  {
    id: "pricing",
    label: DEPT_LABEL.pricing,
    modules: [
      {
        kind: "module", id: "pricing_contacts", moduleId: "pricing_contacts",
        label: "Contacts", pageId: "pricing-contacts",
        tabs: [
          tab("pricing_contacts_activities_tab",  "Activities"),
          tab("pricing_contacts_tasks_tab",       "Tasks"),
          tab("pricing_contacts_inquiries_tab",   "Inquiries"),
          tab("pricing_contacts_attachments_tab", "Attachments"),
          tab("pricing_contacts_comments_tab",    "Comments"),
          tab("pricing_contacts_teams_tab",       "Teams"),
        ],
      },
      {
        kind: "module", id: "pricing_customers", moduleId: "pricing_customers",
        label: "Customers", pageId: "pricing-customers",
        tabs: [
          tab("pricing_customers_contacts_tab",    "Contacts"),
          tab("pricing_customers_activities_tab",  "Activities"),
          tab("pricing_customers_tasks_tab",       "Tasks"),
          tab("pricing_customers_inquiries_tab",   "Inquiries"),
          tab("pricing_customers_comments_tab",    "Comments"),
          tab("pricing_customers_attachments_tab", "Attachments"),
          tab("pricing_customers_projects_tab",    "Projects"),
          tab("pricing_customers_contracts_tab",   "Contracts"),
          tab("pricing_customers_teams_tab",       "Teams"),
        ],
      },
      {
        kind: "module", id: "pricing_quotations", moduleId: "pricing_quotations",
        label: "Quotations", pageId: "pricing-quotations",
        tabs: [
          tab("pricing_quotations_details_tab",  "Details"),
          tab("pricing_quotations_comments_tab", "Comments"),
        ],
      },
      { kind: "module", id: "pricing_projects", moduleId: "pricing_projects", label: "Projects", pageId: "pricing-projects", tabs: [] },
      {
        kind: "module", id: "pricing_contracts", moduleId: "pricing_contracts",
        label: "Contracts", pageId: "pricing-contracts",
        tabs: [
          tab("pricing_contracts_all_tab",      "All"),
          tab("pricing_contracts_active_tab",   "Active"),
          tab("pricing_contracts_expiring_tab", "Expiring"),
          tab("pricing_contracts_financial_overview_tab", "Financial Overview"),
          tab("pricing_contracts_quotation_tab",          "Quotation"),
          tab("pricing_contracts_rate_card_tab",          "Rate Card"),
          tab("pricing_contracts_bookings_tab",           "Bookings"),
          tab("pricing_contracts_billings_tab",           "Billings"),
          tab("pricing_contracts_invoices_tab",           "Invoices"),
          tab("pricing_contracts_collections_tab",        "Collections"),
          tab("pricing_contracts_expenses_tab",           "Expenses"),
          tab("pricing_contracts_attachments_tab",        "Attachments"),
          tab("pricing_contracts_comments_tab",           "Comments"),
          tab("pricing_contracts_activity_tab",           "Activity"),
        ],
      },
      {
        kind: "module", id: "pricing_network_partners", moduleId: "pricing_network_partners",
        label: "Vendor", pageId: "pricing-vendors",
        tabs: [
          tab("pricing_network_partners_international_tab", "International"),
          tab("pricing_network_partners_co_loader_tab",     "Co-Loader"),
          tab("pricing_network_partners_all_in_tab",        "All-In"),
        ],
      },
    ],
  },

  // ─── Operations ─────────────────────────────────────────────────────────────
  {
    id: "operations",
    label: DEPT_LABEL.operations,
    modules: [
      {
        kind: "module", id: "ops_forwarding", moduleId: "ops_forwarding",
        label: "Forwarding", pageId: "ops-forwarding",
        tabs: [
          tab("ops_forwarding_all_tab",         "All"),
          tab("ops_forwarding_my_tab",          "My"),
          tab("ops_forwarding_draft_tab",       "Draft"),
          tab("ops_forwarding_in_progress_tab", "In Progress"),
          tab("ops_forwarding_completed_tab",   "Completed"),
        ],
      },
      {
        kind: "module", id: "ops_brokerage", moduleId: "ops_brokerage",
        label: "Brokerage", pageId: "ops-brokerage",
        tabs: [
          tab("ops_brokerage_all_tab",         "All"),
          tab("ops_brokerage_my_tab",          "My"),
          tab("ops_brokerage_draft_tab",       "Draft"),
          tab("ops_brokerage_in_progress_tab", "In Progress"),
          tab("ops_brokerage_completed_tab",   "Completed"),
        ],
      },
      {
        kind: "module", id: "ops_trucking", moduleId: "ops_trucking",
        label: "Trucking", pageId: "ops-trucking",
        tabs: [
          tab("ops_trucking_all_tab",         "All"),
          tab("ops_trucking_my_tab",          "My"),
          tab("ops_trucking_draft_tab",       "Draft"),
          tab("ops_trucking_in_progress_tab", "In Progress"),
          tab("ops_trucking_completed_tab",   "Completed"),
        ],
      },
      {
        kind: "module", id: "ops_marine_insurance", moduleId: "ops_marine_insurance",
        label: "Marine Insurance", pageId: "ops-marine-insurance",
        tabs: [
          tab("ops_marine_insurance_all_tab",         "All"),
          tab("ops_marine_insurance_my_tab",          "My"),
          tab("ops_marine_insurance_draft_tab",       "Draft"),
          tab("ops_marine_insurance_in_progress_tab", "In Progress"),
          tab("ops_marine_insurance_completed_tab",   "Completed"),
        ],
      },
      {
        kind: "module", id: "ops_others", moduleId: "ops_others",
        label: "Others", pageId: "ops-others",
        tabs: [
          tab("ops_others_all_tab",         "All"),
          tab("ops_others_my_tab",          "My"),
          tab("ops_others_draft_tab",       "Draft"),
          tab("ops_others_in_progress_tab", "In Progress"),
          tab("ops_others_completed_tab",   "Completed"),
        ],
      },
      {
        // Booking Detail — internal pseudo-module (booking-detail tabs).
        // Not a real sidebar entry: booking-detail is reached from any of the
        // five service modules above. Hidden from the Access Configuration
        // matrix so it doesn't masquerade as a sidebar module; runtime
        // permission ids remain in PERM_MODULES for the engine.
        kind: "module", id: "ops_bookings", moduleId: "ops_bookings",
        label: "Booking Detail",
        visibleInAccessMatrix: false,
        tabs: [
          tab("ops_bookings_info_tab",     "Info"),
          tab("ops_bookings_billings_tab", "Billing"),
          tab("ops_bookings_expenses_tab", "Expenses"),
          tab("ops_bookings_comments_tab", "Comments"),
        ],
      },
      {
        // Operations Projects — internal (not a sidebar entry; project view
        // is reached via project links). Carries project tabs + invoice
        // builder tabs nested under it. Hidden from the Access Configuration
        // matrix; runtime permission ids remain in PERM_MODULES.
        kind: "module", id: "ops_projects", moduleId: "ops_projects",
        label: "Projects",
        visibleInAccessMatrix: false,
        tabs: [
          tab("ops_projects_all_tab",        "All"),
          tab("ops_projects_active_tab",     "Active"),
          tab("ops_projects_completed_tab",  "Completed"),
          tab("ops_projects_info_tab",       "Info"),
          tab("ops_projects_quotation_tab",  "Quotation"),
          tab("ops_projects_bookings_tab",   "Bookings"),
          tab("ops_projects_expenses_tab",   "Expenses"),
          tab("ops_projects_billings_tab",   "Billings"),
          tab("ops_projects_invoices_tab",   "Invoices"),
          tab("ops_projects_collections_tab","Collections"),
          tab("ops_projects_attachments_tab","Attachments"),
          tab("ops_projects_comments_tab",   "Comments"),
          tab("ops_invoices_items_tab",      "Builder · Items"),
          tab("ops_invoices_details_tab",    "Builder · Details"),
          tab("ops_invoices_legal_tab",      "Builder · Legal"),
          tab("ops_invoices_settings_tab",   "Builder · Settings"),
        ],
      },
    ],
  },

  // ─── Accounting ─────────────────────────────────────────────────────────────
  {
    id: "accounting",
    label: DEPT_LABEL.accounting,
    modules: [
      {
        kind: "module", id: "acct_financials", moduleId: "acct_financials",
        label: "Finance Overview", pageId: "acct-financials",
        tabs: [
          tab("accounting_financials_dashboard_tab",   "Dashboard"),
          tab("accounting_financials_billings_tab",    "Billings"),
          tab("accounting_financials_invoices_tab",    "Invoices"),
          tab("accounting_financials_collections_tab", "Collections"),
          tab("accounting_financials_expenses_tab",    "Expenses"),
        ],
      },
      {
        kind: "module", id: "acct_evouchers", moduleId: "acct_evouchers",
        label: "E-Vouchers", pageId: "acct-evouchers",
        tabs: [
          tab("accounting_evouchers_pending_disburse_tab",     "Pending Disbursement"),
          tab("accounting_evouchers_waiting_on_rep_tab",       "Waiting on Rep"),
          tab("accounting_evouchers_pending_verification_tab", "Pending Verification"),
          tab("accounting_evouchers_archive_tab",              "Archive"),
        ],
      },
      {
        kind: "module", id: "acct_journal", moduleId: "acct_journal",
        label: "General Journal", pageId: "acct-journal",
        tabs: [
          tab("accounting_journal_all_sources_tab", "All Sources"),
          tab("accounting_journal_evoucher_tab",    "E-Voucher"),
          tab("accounting_journal_invoice_tab",     "Invoice"),
          tab("accounting_journal_collection_tab",  "Collection"),
          tab("accounting_journal_manual_tab",      "Manual"),
        ],
      },
      {
        kind: "module", id: "acct_coa", moduleId: "acct_coa",
        label: "Chart of Accounts", pageId: "acct-coa",
        tabs: [
          tab("accounting_coa_all_tab",              "All"),
          tab("accounting_coa_balance_sheet_tab",    "Balance Sheet"),
          tab("accounting_coa_income_statement_tab", "Income Statement"),
        ],
      },
      {
        kind: "module", id: "acct_projects", moduleId: "acct_projects",
        label: "Projects", pageId: "acct-projects",
        tabs: [
          tab("acct_projects_all_tab",        "All"),
          tab("acct_projects_active_tab",     "Active"),
          tab("acct_projects_completed_tab",  "Completed"),
          tab("acct_projects_info_tab",       "Info"),
          tab("acct_projects_quotation_tab",  "Quotation"),
          tab("acct_projects_bookings_tab",   "Bookings"),
          tab("acct_projects_expenses_tab",   "Expenses"),
          tab("acct_projects_billings_tab",   "Billings"),
          tab("acct_projects_invoices_tab",   "Invoices"),
          tab("acct_projects_collections_tab","Collections"),
          tab("acct_projects_attachments_tab","Attachments"),
          tab("acct_projects_comments_tab",   "Comments"),
        ],
      },
      {
        kind: "module", id: "acct_contracts", moduleId: "acct_contracts",
        label: "Contracts", pageId: "acct-contracts",
        tabs: [
          tab("acct_contracts_all_tab",      "All"),
          tab("acct_contracts_active_tab",   "Active"),
          tab("acct_contracts_expiring_tab", "Expiring"),
          tab("acct_contracts_financial_overview_tab", "Financial Overview"),
          tab("acct_contracts_quotation_tab",          "Quotation"),
          tab("acct_contracts_rate_card_tab",          "Rate Card"),
          tab("acct_contracts_bookings_tab",           "Bookings"),
          tab("acct_contracts_billings_tab",           "Billings"),
          tab("acct_contracts_invoices_tab",           "Invoices"),
          tab("acct_contracts_collections_tab",        "Collections"),
          tab("acct_contracts_expenses_tab",           "Expenses"),
          tab("acct_contracts_attachments_tab",        "Attachments"),
          tab("acct_contracts_comments_tab",           "Comments"),
          tab("acct_contracts_activity_tab",           "Activity"),
        ],
      },
      {
        kind: "module", id: "acct_bookings", moduleId: "acct_bookings",
        label: "Bookings", pageId: "acct-bookings",
        tabs: [
          tab("accounting_bookings_forwarding_tab",       "Forwarding"),
          tab("accounting_bookings_brokerage_tab",        "Brokerage"),
          tab("accounting_bookings_trucking_tab",         "Trucking"),
          tab("accounting_bookings_marine_insurance_tab", "Marine Insurance"),
          tab("accounting_bookings_others_tab",           "Others"),
        ],
      },
      {
        kind: "module", id: "acct_customers", moduleId: "acct_customers",
        label: "Customers", pageId: "acct-customers",
        tabs: [
          tab("accounting_customer_ledger_overview_tab",    "Overview"),
          tab("accounting_customer_ledger_projects_tab",    "Projects"),
          tab("accounting_customer_ledger_billings_tab",    "Billings"),
          tab("accounting_customer_ledger_collections_tab", "Collections"),
          tab("accounting_customer_ledger_expenses_tab",    "Expenses"),
        ],
      },
      {
        kind: "module", id: "acct_catalog", moduleId: "acct_catalog",
        label: "Catalog", pageId: "acct-catalog",
        tabs: [
          tab("accounting_catalog_items_tab",   "Items"),
          tab("accounting_catalog_matrix_tab",  "Matrix"),
          tab("accounting_catalog_all_tab",     "All"),
          tab("accounting_catalog_billing_tab", "Billing"),
          tab("accounting_catalog_expense_tab", "Expense"),
        ],
      },
      { kind: "module", id: "acct_reports", moduleId: "acct_reports", label: "Reports", pageId: "acct-reports", tabs: [] },
      {
        kind: "module", id: "acct_statements", moduleId: "acct_statements",
        label: "Financial Statements", pageId: "acct-statements",
        tabs: [
          tab("accounting_financial_statements_income_statement_tab", "Income Statement"),
          tab("accounting_financial_statements_balance_sheet_tab",    "Balance Sheet"),
          tab("accounting_financial_statements_cash_flow_tab",        "Cash Flow"),
        ],
      },
    ],
  },

  // ─── HR ─────────────────────────────────────────────────────────────────────
  {
    id: "hr",
    label: DEPT_LABEL.hr,
    modules: [
      { kind: "module", id: "hr", moduleId: "hr", label: "HR", pageId: "hr", tabs: [] },
    ],
  },

  // ─── Executive ──────────────────────────────────────────────────────────────
  {
    id: "executive",
    label: DEPT_LABEL.executive,
    modules: [
      { kind: "module", id: "exec_activity_log", moduleId: "exec_activity_log", label: "Activity Log", pageId: "activity-log", tabs: [] },
      {
        kind: "module", id: "exec_users", moduleId: "exec_users",
        label: "Users", pageId: "admin-users",
        tabs: [
          tab("admin_users_tab",            "Users"),
          tab("admin_teams_tab",            "Teams"),
          tab("admin_access_profiles_tab",  "Access Profiles"),
          // Note: admin_overrides_tab intentionally removed — not part of
          // the active Users screen tab model.
        ],
      },
      { kind: "module", id: "exec_profiling", moduleId: "exec_profiling", label: "Profiling", pageId: "admin-profiling", tabs: [] },
    ],
  },

  // ─── Inbox ──────────────────────────────────────────────────────────────────
  {
    id: "inbox",
    label: DEPT_LABEL.inbox,
    modules: [
      {
        kind: "module", id: "inbox", moduleId: "inbox",
        label: "Inbox", pageId: "inbox",
        tabs: [
          tab("inbox_inbox_tab",  "Inbox"),
          tab("inbox_queue_tab",  "Queue"),
          tab("inbox_sent_tab",   "Sent"),
          tab("inbox_drafts_tab", "Drafts"),
        ],
      },
      {
        // Entity Picker — internal pseudo-module representing entity types in
        // the inbox compose flow. Not a sidebar entry. Hidden from the Access
        // Configuration matrix; runtime permission ids remain in PERM_MODULES.
        kind: "module", id: "inbox_entity_picker", moduleId: "inbox_entity_picker",
        label: "Entity Picker",
        visibleInAccessMatrix: false,
        tabs: [
          tab("inbox_entity_inquiry_tab",        "Inquiry"),
          tab("inbox_entity_quotation_tab",      "Quotation"),
          tab("inbox_entity_contract_tab",       "Contract"),
          tab("inbox_entity_booking_tab",        "Booking"),
          tab("inbox_entity_project_tab",        "Project"),
          tab("inbox_entity_invoice_tab",        "Invoice"),
          tab("inbox_entity_collection_tab",     "Collection"),
          tab("inbox_entity_expense_tab",        "Expense"),
          tab("inbox_entity_customer_tab",       "Customer"),
          tab("inbox_entity_contact_tab",        "Contact"),
          tab("inbox_entity_vendor_tab",         "Vendor"),
          tab("inbox_entity_budget_request_tab", "Budget Request"),
        ],
      },
    ],
  },

  // ─── Personal ───────────────────────────────────────────────────────────────
  {
    id: "personal",
    label: DEPT_LABEL.personal,
    modules: [
      {
        kind: "module", id: "my_evouchers", moduleId: "my_evouchers",
        label: "E-Vouchers", pageId: "my-evouchers",
        tabs: [
          tab("my_evouchers_all_tab",     "All"),
          tab("my_evouchers_draft_tab",   "Draft"),
          tab("my_evouchers_pending_tab", "Pending"),
          tab("my_evouchers_active_tab",  "Active"),
          tab("my_evouchers_done_tab",    "Done"),
        ],
      },
    ],
  },
];

// ─── Derived helpers ─────────────────────────────────────────────────────────

export const ACCESS_DEPARTMENT_ORDER: AccessDepartmentId[] =
  ACCESS_SCHEMA.map(d => d.id);

/** All module nodes flattened in canonical order. */
export const ALL_MODULE_NODES: AccessModuleNode[] =
  ACCESS_SCHEMA.flatMap(d => d.modules);

/** moduleId → module node */
export const ACCESS_NODE_BY_MODULE_ID: Record<string, AccessModuleNode> =
  Object.fromEntries(ALL_MODULE_NODES.map(m => [m.moduleId, m]));

/** moduleId → tab node (for tabs). */
export const ACCESS_TAB_BY_MODULE_ID: Record<string, AccessTabNode> =
  Object.fromEntries(
    ALL_MODULE_NODES.flatMap(m => m.tabs.map(t => [t.moduleId, t] as const)),
  );

/** Sidebar pageId → module node (for sidebar gating). */
export const ACCESS_MODULE_BY_PAGE: Record<string, AccessModuleNode> =
  Object.fromEntries(
    ALL_MODULE_NODES
      .filter(m => !!m.pageId)
      .map(m => [m.pageId as string, m]),
  );

/** moduleId → owning department label (for getInheritedPermission compat). */
export const MODULE_DEPT_LABEL: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const dept of ACCESS_SCHEMA) {
    for (const m of dept.modules) {
      out[m.moduleId] = dept.label;
      for (const t of m.tabs) out[t.moduleId] = dept.label;
    }
  }
  return out;
})();

export function getAccessDepartmentNodes(): AccessDepartmentNode[] {
  return ACCESS_SCHEMA;
}

export function getSidebarModulesForDepartment(
  deptLabel: string,
): AccessModuleNode[] {
  const dept = ACCESS_SCHEMA.find(d => d.label === deptLabel);
  if (!dept) return [];
  return dept.modules.filter(m => !!m.pageId);
}

/**
 * Modules to render in the Access Configuration matrix for a department.
 * A module is visible iff `visibleInAccessMatrix !== false`. This is the
 * sole rendering source for `PermissionGrantEditor`; pseudo-modules whose
 * runtime moduleIds must remain registered (booking-detail tabs, ops
 * project pseudo, inbox entity picker) opt out via `visibleInAccessMatrix:
 * false` and are excluded here without losing their PERM_MODULES entries.
 */
export function getVisibleAccessMatrixModules(
  dept: AccessDepartmentNode,
): AccessModuleNode[] {
  return dept.modules.filter(m => m.visibleInAccessMatrix !== false);
}

/** Departments paired with their visible matrix modules — convenience for renderers. */
export function getVisibleAccessMatrixDepartments(): Array<{
  dept: AccessDepartmentNode;
  modules: AccessModuleNode[];
}> {
  return ACCESS_SCHEMA.map(dept => ({
    dept,
    modules: getVisibleAccessMatrixModules(dept),
  })).filter(entry => entry.modules.length > 0);
}

export function getAccessModuleByModuleId(
  moduleId: string,
): AccessModuleNode | undefined {
  return ACCESS_NODE_BY_MODULE_ID[moduleId];
}

// ─── Dept-scoped moduleId families ───────────────────────────────────────────
//
// Some detail/list components are reused across departments (e.g. Pricing
// reuses BD's ContactDetail; Accounting reuses Operations' ProjectsList).
// These maps let the component resolve which dept's moduleId family to consult,
// keyed by an explicit `dept` prop. Hierarchy and naming live here, never
// inferred at the call site.

export type ContactDept  = "bd" | "pricing";
export type CustomerDept = "bd" | "pricing";
export type ProjectDept  = "ops" | "accounting";
export type ContractDept = "pricing" | "accounting";

export interface ContactModuleIds {
  root: ModuleId;
  activities: ModuleId;
  tasks: ModuleId;
  inquiries: ModuleId;
  attachments: ModuleId;
  comments: ModuleId;
  teams: ModuleId;
}

export interface CustomerModuleIds {
  root: ModuleId;
  contacts: ModuleId;
  activities: ModuleId;
  tasks: ModuleId;
  inquiries: ModuleId;
  projects: ModuleId;
  contracts: ModuleId;
  comments: ModuleId;
  attachments: ModuleId;
  teams: ModuleId;
}

export interface ProjectModuleIds {
  root: ModuleId;
  all: ModuleId;
  active: ModuleId;
  completed: ModuleId;
  info: ModuleId;
  quotation: ModuleId;
  bookings: ModuleId;
  expenses: ModuleId;
  billings: ModuleId;
  invoices: ModuleId;
  collections: ModuleId;
  attachments: ModuleId;
  comments: ModuleId;
}

export interface ContractModuleIds {
  root: ModuleId;
  all: ModuleId;
  active: ModuleId;
  expiring: ModuleId;
  financialOverview: ModuleId;
  quotation: ModuleId;
  rateCard: ModuleId;
  bookings: ModuleId;
  billings: ModuleId;
  invoices: ModuleId;
  collections: ModuleId;
  expenses: ModuleId;
  attachments: ModuleId;
  comments: ModuleId;
  activity: ModuleId;
}

export const CONTACT_MODULE_IDS: Record<ContactDept, ContactModuleIds> = {
  bd: {
    root:        "bd_contacts",
    activities:  "bd_contacts_activities_tab",
    tasks:       "bd_contacts_tasks_tab",
    inquiries:   "bd_contacts_inquiries_tab",
    attachments: "bd_contacts_attachments_tab",
    comments:    "bd_contacts_comments_tab",
    teams:       "bd_contacts_teams_tab",
  },
  pricing: {
    root:        "pricing_contacts",
    activities:  "pricing_contacts_activities_tab",
    tasks:       "pricing_contacts_tasks_tab",
    inquiries:   "pricing_contacts_inquiries_tab",
    attachments: "pricing_contacts_attachments_tab",
    comments:    "pricing_contacts_comments_tab",
    teams:       "pricing_contacts_teams_tab",
  },
};

export const CUSTOMER_MODULE_IDS: Record<CustomerDept, CustomerModuleIds> = {
  bd: {
    root:        "bd_customers",
    contacts:    "bd_customers_contacts_tab",
    activities:  "bd_customers_activities_tab",
    tasks:       "bd_customers_tasks_tab",
    inquiries:   "bd_customers_inquiries_tab",
    projects:    "bd_customers_projects_tab",
    contracts:   "bd_customers_contracts_tab",
    comments:    "bd_customers_comments_tab",
    attachments: "bd_customers_attachments_tab",
    teams:       "bd_customers_teams_tab",
  },
  pricing: {
    root:        "pricing_customers",
    contacts:    "pricing_customers_contacts_tab",
    activities:  "pricing_customers_activities_tab",
    tasks:       "pricing_customers_tasks_tab",
    inquiries:   "pricing_customers_inquiries_tab",
    projects:    "pricing_customers_projects_tab",
    contracts:   "pricing_customers_contracts_tab",
    comments:    "pricing_customers_comments_tab",
    attachments: "pricing_customers_attachments_tab",
    teams:       "pricing_customers_teams_tab",
  },
};

export const PROJECT_MODULE_IDS: Record<ProjectDept, ProjectModuleIds> = {
  ops: {
    root:        "ops_projects",
    all:         "ops_projects_all_tab",
    active:      "ops_projects_active_tab",
    completed:   "ops_projects_completed_tab",
    info:        "ops_projects_info_tab",
    quotation:   "ops_projects_quotation_tab",
    bookings:    "ops_projects_bookings_tab",
    expenses:    "ops_projects_expenses_tab",
    billings:    "ops_projects_billings_tab",
    invoices:    "ops_projects_invoices_tab",
    collections: "ops_projects_collections_tab",
    attachments: "ops_projects_attachments_tab",
    comments:    "ops_projects_comments_tab",
  },
  accounting: {
    root:        "acct_projects",
    all:         "acct_projects_all_tab",
    active:      "acct_projects_active_tab",
    completed:   "acct_projects_completed_tab",
    info:        "acct_projects_info_tab",
    quotation:   "acct_projects_quotation_tab",
    bookings:    "acct_projects_bookings_tab",
    expenses:    "acct_projects_expenses_tab",
    billings:    "acct_projects_billings_tab",
    invoices:    "acct_projects_invoices_tab",
    collections: "acct_projects_collections_tab",
    attachments: "acct_projects_attachments_tab",
    comments:    "acct_projects_comments_tab",
  },
};

export const CONTRACT_MODULE_IDS: Record<ContractDept, ContractModuleIds> = {
  pricing: {
    root:               "pricing_contracts",
    all:                "pricing_contracts_all_tab",
    active:             "pricing_contracts_active_tab",
    expiring:           "pricing_contracts_expiring_tab",
    financialOverview:  "pricing_contracts_financial_overview_tab",
    quotation:          "pricing_contracts_quotation_tab",
    rateCard:           "pricing_contracts_rate_card_tab",
    bookings:           "pricing_contracts_bookings_tab",
    billings:           "pricing_contracts_billings_tab",
    invoices:           "pricing_contracts_invoices_tab",
    collections:        "pricing_contracts_collections_tab",
    expenses:           "pricing_contracts_expenses_tab",
    attachments:        "pricing_contracts_attachments_tab",
    comments:           "pricing_contracts_comments_tab",
    activity:           "pricing_contracts_activity_tab",
  },
  accounting: {
    root:               "acct_contracts",
    all:                "acct_contracts_all_tab",
    active:             "acct_contracts_active_tab",
    expiring:           "acct_contracts_expiring_tab",
    financialOverview:  "acct_contracts_financial_overview_tab",
    quotation:          "acct_contracts_quotation_tab",
    rateCard:           "acct_contracts_rate_card_tab",
    bookings:           "acct_contracts_bookings_tab",
    billings:           "acct_contracts_billings_tab",
    invoices:           "acct_contracts_invoices_tab",
    collections:        "acct_contracts_collections_tab",
    expenses:           "acct_contracts_expenses_tab",
    attachments:        "acct_contracts_attachments_tab",
    comments:           "acct_contracts_comments_tab",
    activity:           "acct_contracts_activity_tab",
  },
};
