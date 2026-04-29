export type ModuleId =
  // ─── Business Development ────────────────────────────────────────────────────
  | "bd_contacts" | "bd_customers" | "bd_inquiries" | "bd_projects" | "bd_contracts"
  | "bd_tasks" | "bd_activities" | "bd_budget_requests"
  | "bd_contacts_activities_tab" | "bd_contacts_tasks_tab" | "bd_contacts_inquiries_tab"
  | "bd_contacts_attachments_tab" | "bd_contacts_comments_tab"
  | "bd_customers_contacts_tab" | "bd_customers_activities_tab" | "bd_customers_tasks_tab"
  | "bd_customers_inquiries_tab" | "bd_customers_comments_tab" | "bd_customers_attachments_tab"
  | "bd_customers_projects_tab" | "bd_customers_contracts_tab"
  | "bd_customers_teams_tab"
  | "bd_contacts_teams_tab"
  | "bd_budget_requests_all_tab" | "bd_budget_requests_my_requests_tab"
  // ─── Pricing ─────────────────────────────────────────────────────────────────
  | "pricing_contacts" | "pricing_customers" | "pricing_projects"
  | "pricing_quotations" | "pricing_contracts" | "pricing_network_partners"
  | "pricing_quotations_details_tab" | "pricing_quotations_comments_tab"
  | "pricing_contracts_all_tab" | "pricing_contracts_active_tab" | "pricing_contracts_expiring_tab"
  | "pricing_contracts_financial_overview_tab" | "pricing_contracts_quotation_tab" | "pricing_contracts_rate_card_tab"
  | "pricing_contracts_bookings_tab" | "pricing_contracts_billings_tab"
  | "pricing_contracts_invoices_tab" | "pricing_contracts_collections_tab"
  | "pricing_contracts_expenses_tab" | "pricing_contracts_attachments_tab"
  | "pricing_contracts_comments_tab" | "pricing_contracts_activity_tab"
  | "pricing_network_partners_international_tab" | "pricing_network_partners_co_loader_tab"
  | "pricing_network_partners_all_in_tab"
  // ─── Operations ──────────────────────────────────────────────────────────────
  | "ops_forwarding" | "ops_brokerage" | "ops_trucking" | "ops_marine_insurance" | "ops_others"
  | "ops_bookings" | "ops_projects"
  | "ops_forwarding_all_tab" | "ops_forwarding_my_tab" | "ops_forwarding_draft_tab"
  | "ops_forwarding_in_progress_tab" | "ops_forwarding_completed_tab"
  | "ops_brokerage_all_tab" | "ops_brokerage_my_tab" | "ops_brokerage_draft_tab"
  | "ops_brokerage_in_progress_tab" | "ops_brokerage_completed_tab"
  | "ops_trucking_all_tab" | "ops_trucking_my_tab" | "ops_trucking_draft_tab"
  | "ops_trucking_in_progress_tab" | "ops_trucking_completed_tab"
  | "ops_marine_insurance_all_tab" | "ops_marine_insurance_my_tab" | "ops_marine_insurance_draft_tab"
  | "ops_marine_insurance_in_progress_tab" | "ops_marine_insurance_completed_tab"
  | "ops_others_all_tab" | "ops_others_my_tab" | "ops_others_draft_tab"
  | "ops_others_in_progress_tab" | "ops_others_completed_tab"
  | "ops_bookings_info_tab" | "ops_bookings_billings_tab"
  | "ops_bookings_expenses_tab" | "ops_bookings_comments_tab"
  | "ops_projects_all_tab" | "ops_projects_active_tab" | "ops_projects_completed_tab"
  | "ops_projects_info_tab" | "ops_projects_bookings_tab"
  | "ops_projects_quotation_tab" | "ops_projects_expenses_tab" | "ops_projects_billings_tab"
  | "ops_projects_invoices_tab" | "ops_projects_collections_tab"
  | "ops_projects_attachments_tab" | "ops_projects_comments_tab"
  | "ops_invoices_items_tab" | "ops_invoices_details_tab"
  | "ops_invoices_legal_tab" | "ops_invoices_settings_tab"
  // ─── Accounting ──────────────────────────────────────────────────────────────
  | "acct_evouchers" | "acct_reports"
  | "acct_financials" | "acct_coa" | "acct_projects" | "acct_contracts" | "acct_bookings" | "acct_customers"
  | "acct_catalog" | "acct_statements" | "acct_journal"
  | "accounting_evouchers_pending_disburse_tab" | "accounting_evouchers_waiting_on_rep_tab"
  | "accounting_evouchers_pending_verification_tab" | "accounting_evouchers_archive_tab"
  | "accounting_financials_dashboard_tab" | "accounting_financials_billings_tab"
  | "accounting_financials_invoices_tab" | "accounting_financials_collections_tab"
  | "accounting_financials_expenses_tab"
  | "accounting_bookings_forwarding_tab" | "accounting_bookings_brokerage_tab"
  | "accounting_bookings_trucking_tab" | "accounting_bookings_marine_insurance_tab"
  | "accounting_bookings_others_tab"
  | "accounting_coa_all_tab" | "accounting_coa_balance_sheet_tab" | "accounting_coa_income_statement_tab"
  | "accounting_customer_ledger_overview_tab" | "accounting_customer_ledger_projects_tab"
  | "accounting_customer_ledger_billings_tab" | "accounting_customer_ledger_collections_tab"
  | "accounting_customer_ledger_expenses_tab"
  | "accounting_catalog_items_tab" | "accounting_catalog_matrix_tab"
  | "accounting_catalog_all_tab" | "accounting_catalog_billing_tab" | "accounting_catalog_expense_tab"
  | "accounting_financial_statements_income_statement_tab"
  | "accounting_financial_statements_balance_sheet_tab"
  | "accounting_financial_statements_cash_flow_tab"
  | "accounting_journal_all_sources_tab" | "accounting_journal_evoucher_tab"
  | "accounting_journal_invoice_tab" | "accounting_journal_collection_tab"
  | "accounting_journal_manual_tab"
  // ─── HR ──────────────────────────────────────────────────────────────────────
  | "hr"
  // ─── Executive / Admin ────────────────────────────────────────────────────────
  | "exec_activity_log" | "exec_users" | "exec_profiling"
  | "admin_users_tab" | "admin_teams_tab" | "admin_overrides_tab" | "admin_access_profiles_tab"
  // ─── Inbox ───────────────────────────────────────────────────────────────────
  | "inbox" | "inbox_entity_picker"
  | "inbox_inbox_tab" | "inbox_queue_tab" | "inbox_sent_tab" | "inbox_drafts_tab"
  | "inbox_entity_inquiry_tab" | "inbox_entity_quotation_tab" | "inbox_entity_contract_tab"
  | "inbox_entity_booking_tab" | "inbox_entity_project_tab" | "inbox_entity_invoice_tab"
  | "inbox_entity_collection_tab" | "inbox_entity_expense_tab" | "inbox_entity_customer_tab"
  | "inbox_entity_contact_tab" | "inbox_entity_vendor_tab" | "inbox_entity_budget_request_tab"
  // ─── Personal ────────────────────────────────────────────────────────────────
  | "my_evouchers"
  | "my_evouchers_all_tab" | "my_evouchers_draft_tab" | "my_evouchers_pending_tab"
  | "my_evouchers_active_tab" | "my_evouchers_done_tab";

export type ActionId = "view" | "create" | "edit" | "approve" | "delete" | "export";

export const PERM_ACTIONS: ActionId[] = ["view", "create", "edit", "approve", "delete", "export"];

export interface PermModule {
  id: ModuleId;
  label: string;
  group: string;
  dept: string;
  /** Actions that are meaningful for this module. Omit = all 6 apply. */
  applicableActions?: ActionId[];
}

const A = {
  all:        ["view", "create", "edit", "approve", "delete", "export"] as ActionId[],
  noExport:   ["view", "create", "edit", "approve", "delete"] as ActionId[],
  noApprove:  ["view", "create", "edit", "delete", "export"] as ActionId[],
  listOnly:   ["view", "create", "edit", "delete"] as ActionId[],
  logStyle:   ["view", "create", "delete"] as ActionId[],
  tabInfo:    ["view", "edit"] as ActionId[],
  tabCreate:  ["view", "create"] as ActionId[],
  viewExport: ["view", "export"] as ActionId[],
  viewOnly:   ["view"] as ActionId[],
};

const BD  = "Business Development";
const PRC = "Pricing";
const OPS = "Operations";
const ACT = "Accounting";
const EXC = "Executive";
const INB = "Inbox";
const PER = "Personal";

export const PERM_MODULES: PermModule[] = [

  // ─── Business Development ─────────────────────────────────────────────────────
  { id: "bd_contacts",  label: "Contacts",  group: BD, dept: BD, applicableActions: A.noApprove },
  { id: "bd_contacts_activities_tab",  label: "↳ Activities",  group: BD, dept: BD, applicableActions: A.viewOnly },
  { id: "bd_contacts_tasks_tab",       label: "↳ Tasks",       group: BD, dept: BD, applicableActions: A.viewOnly },
  { id: "bd_contacts_inquiries_tab",   label: "↳ Inquiries",   group: BD, dept: BD, applicableActions: A.viewOnly },
  { id: "bd_contacts_attachments_tab", label: "↳ Attachments", group: BD, dept: BD, applicableActions: A.viewOnly },
  { id: "bd_contacts_comments_tab",    label: "↳ Comments",    group: BD, dept: BD, applicableActions: A.viewOnly },

  { id: "bd_customers", label: "Customers", group: BD, dept: BD, applicableActions: A.noApprove },
  { id: "bd_customers_contacts_tab",    label: "↳ Contacts",    group: BD, dept: BD, applicableActions: A.viewOnly },
  { id: "bd_customers_activities_tab",  label: "↳ Activities",  group: BD, dept: BD, applicableActions: A.viewOnly },
  { id: "bd_customers_tasks_tab",       label: "↳ Tasks",       group: BD, dept: BD, applicableActions: A.viewOnly },
  { id: "bd_customers_inquiries_tab",   label: "↳ Inquiries",   group: BD, dept: BD, applicableActions: A.viewOnly },
  { id: "bd_customers_comments_tab",    label: "↳ Comments",    group: BD, dept: BD, applicableActions: A.viewOnly },
  { id: "bd_customers_attachments_tab", label: "↳ Attachments", group: BD, dept: BD, applicableActions: A.viewOnly },
  { id: "bd_customers_projects_tab",    label: "↳ Projects",    group: BD, dept: BD, applicableActions: A.viewOnly },
  { id: "bd_customers_contracts_tab",   label: "↳ Contracts",   group: BD, dept: BD, applicableActions: A.viewOnly },
  { id: "bd_customers_teams_tab",       label: "↳ Teams",       group: BD, dept: BD, applicableActions: A.tabInfo },
  { id: "bd_contacts_teams_tab",        label: "↳ Teams",       group: BD, dept: BD, applicableActions: A.tabInfo },

  { id: "bd_inquiries", label: "Inquiries", group: BD, dept: BD, applicableActions: A.noApprove },
  { id: "bd_projects",  label: "Projects",  group: BD, dept: BD, applicableActions: A.viewOnly },
  { id: "bd_contracts", label: "Contracts", group: BD, dept: BD, applicableActions: A.viewOnly },

  { id: "bd_tasks",      label: "Tasks",      group: BD, dept: BD, applicableActions: A.listOnly },
  { id: "bd_activities", label: "Activities", group: BD, dept: BD, applicableActions: A.logStyle },

  { id: "bd_budget_requests", label: "Budget Requests", group: BD, dept: BD, applicableActions: A.noExport },
  { id: "bd_budget_requests_all_tab",         label: "↳ All",         group: BD, dept: BD, applicableActions: A.viewOnly },
  { id: "bd_budget_requests_my_requests_tab", label: "↳ My Requests", group: BD, dept: BD, applicableActions: A.viewOnly },

  // ─── Pricing ──────────────────────────────────────────────────────────────────
  { id: "pricing_contacts",  label: "Contacts",  group: PRC, dept: PRC, applicableActions: A.viewOnly },
  { id: "pricing_customers", label: "Customers", group: PRC, dept: PRC, applicableActions: A.viewOnly },

  { id: "pricing_quotations", label: "Quotations", group: PRC, dept: PRC, applicableActions: A.all },
  { id: "pricing_quotations_details_tab",  label: "↳ Details",  group: PRC, dept: PRC, applicableActions: A.viewOnly },
  { id: "pricing_quotations_comments_tab", label: "↳ Comments", group: PRC, dept: PRC, applicableActions: A.viewOnly },

  { id: "pricing_projects", label: "Projects", group: PRC, dept: PRC, applicableActions: A.viewOnly },

  { id: "pricing_contracts", label: "Contracts", group: PRC, dept: PRC, applicableActions: A.all },
  { id: "pricing_contracts_all_tab",      label: "↳ All",      group: PRC, dept: PRC, applicableActions: A.viewOnly },
  { id: "pricing_contracts_active_tab",   label: "↳ Active",   group: PRC, dept: PRC, applicableActions: A.viewOnly },
  { id: "pricing_contracts_expiring_tab", label: "↳ Expiring", group: PRC, dept: PRC, applicableActions: A.viewOnly },
  { id: "pricing_contracts_financial_overview_tab", label: "↳ Financial Overview", group: PRC, dept: PRC, applicableActions: A.viewOnly },
  { id: "pricing_contracts_quotation_tab",          label: "↳ Quotation",          group: PRC, dept: PRC, applicableActions: A.viewOnly },
  { id: "pricing_contracts_rate_card_tab",          label: "↳ Rate Card",          group: PRC, dept: PRC, applicableActions: A.tabInfo },
  { id: "pricing_contracts_bookings_tab",           label: "↳ Bookings",           group: PRC, dept: PRC, applicableActions: A.viewOnly },
  { id: "pricing_contracts_billings_tab",           label: "↳ Billings",           group: PRC, dept: PRC, applicableActions: A.viewOnly },
  { id: "pricing_contracts_invoices_tab",           label: "↳ Invoices",           group: PRC, dept: PRC, applicableActions: A.viewOnly },
  { id: "pricing_contracts_collections_tab",        label: "↳ Collections",        group: PRC, dept: PRC, applicableActions: A.viewOnly },
  { id: "pricing_contracts_expenses_tab",           label: "↳ Expenses",           group: PRC, dept: PRC, applicableActions: A.viewOnly },
  { id: "pricing_contracts_attachments_tab",        label: "↳ Attachments",        group: PRC, dept: PRC, applicableActions: A.viewOnly },
  { id: "pricing_contracts_comments_tab",           label: "↳ Comments",           group: PRC, dept: PRC, applicableActions: A.viewOnly },
  { id: "pricing_contracts_activity_tab",           label: "↳ Activity",           group: PRC, dept: PRC, applicableActions: A.viewOnly },

  { id: "pricing_network_partners", label: "Vendor", group: PRC, dept: PRC, applicableActions: A.viewOnly },
  { id: "pricing_network_partners_international_tab", label: "↳ International", group: PRC, dept: PRC, applicableActions: A.viewOnly },
  { id: "pricing_network_partners_co_loader_tab",     label: "↳ Co-Loader",     group: PRC, dept: PRC, applicableActions: A.viewOnly },
  { id: "pricing_network_partners_all_in_tab",        label: "↳ All-In",        group: PRC, dept: PRC, applicableActions: A.viewOnly },

  // ─── Operations ───────────────────────────────────────────────────────────────
  { id: "ops_forwarding", label: "Forwarding", group: OPS, dept: OPS, applicableActions: A.listOnly },
  { id: "ops_forwarding_all_tab",         label: "↳ All",         group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_forwarding_my_tab",          label: "↳ My",          group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_forwarding_draft_tab",       label: "↳ Draft",       group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_forwarding_in_progress_tab", label: "↳ In Progress", group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_forwarding_completed_tab",   label: "↳ Completed",   group: OPS, dept: OPS, applicableActions: A.viewOnly },

  { id: "ops_brokerage", label: "Brokerage", group: OPS, dept: OPS, applicableActions: A.listOnly },
  { id: "ops_brokerage_all_tab",         label: "↳ All",         group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_brokerage_my_tab",          label: "↳ My",          group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_brokerage_draft_tab",       label: "↳ Draft",       group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_brokerage_in_progress_tab", label: "↳ In Progress", group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_brokerage_completed_tab",   label: "↳ Completed",   group: OPS, dept: OPS, applicableActions: A.viewOnly },

  { id: "ops_trucking", label: "Trucking", group: OPS, dept: OPS, applicableActions: A.listOnly },
  { id: "ops_trucking_all_tab",         label: "↳ All",         group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_trucking_my_tab",          label: "↳ My",          group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_trucking_draft_tab",       label: "↳ Draft",       group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_trucking_in_progress_tab", label: "↳ In Progress", group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_trucking_completed_tab",   label: "↳ Completed",   group: OPS, dept: OPS, applicableActions: A.viewOnly },

  { id: "ops_marine_insurance", label: "Marine Insurance", group: OPS, dept: OPS, applicableActions: A.listOnly },
  { id: "ops_marine_insurance_all_tab",         label: "↳ All",         group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_marine_insurance_my_tab",          label: "↳ My",          group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_marine_insurance_draft_tab",       label: "↳ Draft",       group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_marine_insurance_in_progress_tab", label: "↳ In Progress", group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_marine_insurance_completed_tab",   label: "↳ Completed",   group: OPS, dept: OPS, applicableActions: A.viewOnly },

  { id: "ops_others", label: "Others", group: OPS, dept: OPS, applicableActions: A.listOnly },
  { id: "ops_others_all_tab",         label: "↳ All",         group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_others_my_tab",          label: "↳ My",          group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_others_draft_tab",       label: "↳ Draft",       group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_others_in_progress_tab", label: "↳ In Progress", group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_others_completed_tab",   label: "↳ Completed",   group: OPS, dept: OPS, applicableActions: A.viewOnly },

  { id: "ops_bookings", label: "Booking Detail", group: OPS, dept: OPS, applicableActions: A.listOnly },
  { id: "ops_bookings_info_tab",     label: "↳ Info",     group: OPS, dept: OPS, applicableActions: A.tabInfo },
  { id: "ops_bookings_billings_tab", label: "↳ Billing",  group: OPS, dept: OPS, applicableActions: A.noExport },
  { id: "ops_bookings_expenses_tab", label: "↳ Expenses", group: OPS, dept: OPS, applicableActions: A.listOnly },
  { id: "ops_bookings_comments_tab", label: "↳ Comments", group: OPS, dept: OPS, applicableActions: A.logStyle },

  { id: "ops_projects", label: "Projects", group: OPS, dept: OPS, applicableActions: A.listOnly },
  { id: "ops_projects_all_tab",       label: "↳ All",       group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_projects_active_tab",    label: "↳ Active",    group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_projects_completed_tab", label: "↳ Completed", group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_projects_info_tab",        label: "↳ Info",        group: OPS, dept: OPS, applicableActions: A.tabInfo },
  { id: "ops_projects_quotation_tab",   label: "↳ Quotation",   group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_projects_bookings_tab",    label: "↳ Bookings",    group: OPS, dept: OPS, applicableActions: A.tabCreate },
  { id: "ops_projects_expenses_tab",    label: "↳ Expenses",    group: OPS, dept: OPS, applicableActions: A.listOnly },
  { id: "ops_projects_billings_tab",    label: "↳ Billings",    group: OPS, dept: OPS, applicableActions: A.noExport },
  { id: "ops_projects_invoices_tab",    label: "↳ Invoices",    group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_projects_collections_tab", label: "↳ Collections", group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_projects_attachments_tab", label: "↳ Attachments", group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_projects_comments_tab",    label: "↳ Comments",    group: OPS, dept: OPS, applicableActions: A.logStyle },
  { id: "ops_invoices_items_tab",    label: "↳ Builder · Items",    group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_invoices_details_tab",  label: "↳ Builder · Details",  group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_invoices_legal_tab",    label: "↳ Builder · Legal",    group: OPS, dept: OPS, applicableActions: A.viewOnly },
  { id: "ops_invoices_settings_tab", label: "↳ Builder · Settings", group: OPS, dept: OPS, applicableActions: A.viewOnly },

  // ─── Accounting — sidebar-mapped modules (top-level, in sidebar order) ───────
  { id: "acct_financials", label: "Finance Overview", group: ACT, dept: ACT, applicableActions: A.viewExport },
  { id: "accounting_financials_dashboard_tab",   label: "↳ Dashboard",   group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_financials_billings_tab",    label: "↳ Billings",    group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_financials_invoices_tab",    label: "↳ Invoices",    group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_financials_collections_tab", label: "↳ Collections", group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_financials_expenses_tab",    label: "↳ Expenses",    group: ACT, dept: ACT, applicableActions: A.viewOnly },

  { id: "acct_evouchers", label: "E-Vouchers", group: ACT, dept: ACT, applicableActions: A.all },
  { id: "accounting_evouchers_pending_disburse_tab",    label: "↳ Pending Disbursement", group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_evouchers_waiting_on_rep_tab",      label: "↳ Waiting on Rep",       group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_evouchers_pending_verification_tab",label: "↳ Pending Verification", group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_evouchers_archive_tab",             label: "↳ Archive",              group: ACT, dept: ACT, applicableActions: A.viewOnly },

  { id: "acct_journal", label: "General Journal", group: ACT, dept: ACT, applicableActions: A.viewExport },
  { id: "accounting_journal_all_sources_tab", label: "↳ All Sources", group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_journal_evoucher_tab",    label: "↳ E-Voucher",   group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_journal_invoice_tab",     label: "↳ Invoice",     group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_journal_collection_tab",  label: "↳ Collection",  group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_journal_manual_tab",      label: "↳ Manual",      group: ACT, dept: ACT, applicableActions: A.viewOnly },

  { id: "acct_coa", label: "Chart of Accounts", group: ACT, dept: ACT, applicableActions: A.listOnly },
  { id: "accounting_coa_all_tab",              label: "↳ All",              group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_coa_balance_sheet_tab",    label: "↳ Balance Sheet",    group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_coa_income_statement_tab", label: "↳ Income Statement", group: ACT, dept: ACT, applicableActions: A.viewOnly },

  { id: "acct_projects",  label: "Projects",  group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "acct_contracts", label: "Contracts", group: ACT, dept: ACT, applicableActions: A.viewOnly },

  { id: "acct_bookings", label: "Bookings", group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_bookings_forwarding_tab",      label: "↳ Forwarding",       group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_bookings_brokerage_tab",       label: "↳ Brokerage",        group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_bookings_trucking_tab",        label: "↳ Trucking",         group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_bookings_marine_insurance_tab",label: "↳ Marine Insurance", group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_bookings_others_tab",          label: "↳ Others",           group: ACT, dept: ACT, applicableActions: A.viewOnly },

  { id: "acct_customers", label: "Customers", group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_customer_ledger_overview_tab",    label: "↳ Overview",    group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_customer_ledger_projects_tab",    label: "↳ Projects",    group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_customer_ledger_billings_tab",    label: "↳ Billings",    group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_customer_ledger_collections_tab", label: "↳ Collections", group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_customer_ledger_expenses_tab",    label: "↳ Expenses",    group: ACT, dept: ACT, applicableActions: A.viewOnly },

  { id: "acct_catalog", label: "Catalog", group: ACT, dept: ACT, applicableActions: A.listOnly },
  { id: "accounting_catalog_items_tab",   label: "↳ Items",   group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_catalog_matrix_tab",  label: "↳ Matrix",  group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_catalog_all_tab",     label: "↳ All",     group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_catalog_billing_tab", label: "↳ Billing", group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_catalog_expense_tab", label: "↳ Expense", group: ACT, dept: ACT, applicableActions: A.viewOnly },

  { id: "acct_reports", label: "Reports", group: ACT, dept: ACT, applicableActions: A.viewExport },

  { id: "acct_statements", label: "Financial Statements", group: ACT, dept: ACT, applicableActions: A.viewExport },
  { id: "accounting_financial_statements_income_statement_tab", label: "↳ Income Statement", group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_financial_statements_balance_sheet_tab",    label: "↳ Balance Sheet",    group: ACT, dept: ACT, applicableActions: A.viewOnly },
  { id: "accounting_financial_statements_cash_flow_tab",        label: "↳ Cash Flow",        group: ACT, dept: ACT, applicableActions: A.viewOnly },


  // ─── HR ──────────────────────────────────────────────────────────────────────
  { id: "hr", label: "HR", group: "HR", dept: "HR", applicableActions: A.listOnly },

  // ─── Executive / Admin ────────────────────────────────────────────────────────
  { id: "exec_activity_log", label: "Activity Log",    group: EXC, dept: EXC, applicableActions: A.viewExport },
  { id: "exec_users",        label: "User Management", group: EXC, dept: EXC, applicableActions: A.listOnly },
  { id: "exec_profiling",    label: "Profiling",        group: EXC, dept: EXC, applicableActions: A.listOnly },
  { id: "admin_users_tab",     label: "↳ Users",            group: EXC, dept: EXC, applicableActions: A.viewOnly },
  { id: "admin_teams_tab",     label: "↳ Teams",            group: EXC, dept: EXC, applicableActions: A.viewOnly },
  { id: "admin_overrides_tab", label: "↳ Access Overrides", group: EXC, dept: EXC, applicableActions: A.viewOnly },
  { id: "admin_access_profiles_tab", label: "↳ Access Profiles",   group: EXC, dept: EXC, applicableActions: A.viewOnly },

  // ─── Inbox ───────────────────────────────────────────────────────────────────
  { id: "inbox", label: "Inbox", group: INB, dept: INB, applicableActions: A.viewOnly },
  { id: "inbox_inbox_tab",  label: "↳ Inbox",  group: INB, dept: INB, applicableActions: A.viewOnly },
  { id: "inbox_queue_tab",  label: "↳ Queue",  group: INB, dept: INB, applicableActions: A.viewOnly },
  { id: "inbox_sent_tab",   label: "↳ Sent",   group: INB, dept: INB, applicableActions: A.viewOnly },
  { id: "inbox_drafts_tab", label: "↳ Drafts", group: INB, dept: INB, applicableActions: A.viewOnly },

  { id: "inbox_entity_picker", label: "Entity Picker", group: INB, dept: INB, applicableActions: A.viewOnly },
  { id: "inbox_entity_inquiry_tab",       label: "↳ Inquiry",        group: INB, dept: INB, applicableActions: A.viewOnly },
  { id: "inbox_entity_quotation_tab",     label: "↳ Quotation",      group: INB, dept: INB, applicableActions: A.viewOnly },
  { id: "inbox_entity_contract_tab",      label: "↳ Contract",       group: INB, dept: INB, applicableActions: A.viewOnly },
  { id: "inbox_entity_booking_tab",       label: "↳ Booking",        group: INB, dept: INB, applicableActions: A.viewOnly },
  { id: "inbox_entity_project_tab",       label: "↳ Project",        group: INB, dept: INB, applicableActions: A.viewOnly },
  { id: "inbox_entity_invoice_tab",       label: "↳ Invoice",        group: INB, dept: INB, applicableActions: A.viewOnly },
  { id: "inbox_entity_collection_tab",    label: "↳ Collection",     group: INB, dept: INB, applicableActions: A.viewOnly },
  { id: "inbox_entity_expense_tab",       label: "↳ Expense",        group: INB, dept: INB, applicableActions: A.viewOnly },
  { id: "inbox_entity_customer_tab",      label: "↳ Customer",       group: INB, dept: INB, applicableActions: A.viewOnly },
  { id: "inbox_entity_contact_tab",       label: "↳ Contact",        group: INB, dept: INB, applicableActions: A.viewOnly },
  { id: "inbox_entity_vendor_tab",        label: "↳ Vendor",         group: INB, dept: INB, applicableActions: A.viewOnly },
  { id: "inbox_entity_budget_request_tab",label: "↳ Budget Request", group: INB, dept: INB, applicableActions: A.viewOnly },

  // ─── Personal ────────────────────────────────────────────────────────────────
  { id: "my_evouchers", label: "My E-Vouchers", group: "Personal", dept: PER, applicableActions: A.listOnly },
  { id: "my_evouchers_all_tab",     label: "↳ All",     group: "Personal", dept: PER, applicableActions: A.viewOnly },
  { id: "my_evouchers_draft_tab",   label: "↳ Draft",   group: "Personal", dept: PER, applicableActions: A.viewOnly },
  { id: "my_evouchers_pending_tab", label: "↳ Pending", group: "Personal", dept: PER, applicableActions: A.viewOnly },
  { id: "my_evouchers_active_tab",  label: "↳ Active",  group: "Personal", dept: PER, applicableActions: A.viewOnly },
  { id: "my_evouchers_done_tab",    label: "↳ Done",    group: "Personal", dept: PER, applicableActions: A.viewOnly },
];

// ─── Baseline role constants ─────────────────────────────────────────────────

const ALL_ACTIONS: ActionId[]        = ["view", "create", "edit", "approve", "delete", "export"];
const MANAGER_ACTIONS: ActionId[]    = ["view", "create", "edit", "approve", "delete", "export"];
const SUPERVISOR_ACTIONS: ActionId[] = ["view", "create", "edit", "approve"];
const LEADER_ACTIONS: ActionId[]     = ["view", "create", "edit"];
const STAFF_ACTIONS: ActionId[]      = ["view"];

export function getInheritedPermission(
  role: string,
  department: string,
  moduleId: ModuleId,
  action: ActionId
): boolean {
  const mod = PERM_MODULES.find((m) => m.id === moduleId);
  if (!mod) return false;

  // Executive dept or executive role → full access
  if (department === "Executive" || role === "executive") return true;

  // Inbox and personal tabs: all authenticated users can view
  if (mod.dept === INB || mod.dept === PER) {
    return action === "view";
  }

  const ownDept = mod.dept === department;
  if (!ownDept) return false;

  // ─── Tab-specific baseline rules ─────────────────────────────────────────────

  // Booking billings tab: supervisor+ can view; manager+ for mutations
  if (moduleId === "ops_bookings_billings_tab") {
    if (action === "view") return role === "supervisor" || role === "manager";
    return role === "manager";
  }

  // Project billings tab: same rule as booking billings
  if (moduleId === "ops_projects_billings_tab") {
    if (action === "view") return role === "supervisor" || role === "manager";
    return false;
  }

  // ─── Standard role checks ─────────────────────────────────────────────────────
  if (role === "manager")     return MANAGER_ACTIONS.includes(action);
  if (role === "supervisor")  return SUPERVISOR_ACTIONS.includes(action);
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
