// ─────────────────────────────────────────────────────────────────────────────
// Permission engine types and runtime permission helpers.
//
// STRUCTURE (PERM_MODULES) IS DERIVED — DO NOT HAND-AUTHOR IT.
// The visible hierarchy comes from `src/config/access/accessSchema.ts`.
// This file only owns: ModuleId / ActionId unions, action presets, and the
// inherited-baseline / effective-permission functions.
// ─────────────────────────────────────────────────────────────────────────────

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
  | "pricing_contacts_activities_tab" | "pricing_contacts_tasks_tab" | "pricing_contacts_inquiries_tab"
  | "pricing_contacts_attachments_tab" | "pricing_contacts_comments_tab" | "pricing_contacts_teams_tab"
  | "pricing_customers_contacts_tab" | "pricing_customers_activities_tab" | "pricing_customers_tasks_tab"
  | "pricing_customers_inquiries_tab" | "pricing_customers_projects_tab" | "pricing_customers_contracts_tab"
  | "pricing_customers_comments_tab" | "pricing_customers_attachments_tab" | "pricing_customers_teams_tab"
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
  | "acct_projects_all_tab" | "acct_projects_active_tab" | "acct_projects_completed_tab"
  | "acct_projects_info_tab" | "acct_projects_quotation_tab" | "acct_projects_bookings_tab"
  | "acct_projects_expenses_tab" | "acct_projects_billings_tab" | "acct_projects_invoices_tab"
  | "acct_projects_collections_tab" | "acct_projects_attachments_tab" | "acct_projects_comments_tab"
  | "acct_contracts_all_tab" | "acct_contracts_active_tab" | "acct_contracts_expiring_tab"
  | "acct_contracts_financial_overview_tab" | "acct_contracts_quotation_tab" | "acct_contracts_rate_card_tab"
  | "acct_contracts_bookings_tab" | "acct_contracts_billings_tab" | "acct_contracts_invoices_tab"
  | "acct_contracts_collections_tab" | "acct_contracts_expenses_tab" | "acct_contracts_attachments_tab"
  | "acct_contracts_comments_tab" | "acct_contracts_activity_tab"
  // ─── HR ──────────────────────────────────────────────────────────────────────
  | "hr"
  // ─── Executive / Admin ────────────────────────────────────────────────────────
  | "exec_activity_log" | "exec_users" | "exec_profiling" | "exec_memos"
  | "admin_users_tab" | "admin_teams_tab" | "admin_access_profiles_tab"
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
  /** Structural parent module — set for tab nodes. Undefined for top-level rows. */
  parentId?: ModuleId;
}

// ─── PERM_MODULES — derived from canonical schema ────────────────────────────
//
// Order is preserved: department order → module order → tabs after their parent.
// Tabs carry parentId pointing at their containing module.

import { ACCESS_SCHEMA } from "../../config/access/accessSchema";

export const PERM_MODULES: PermModule[] = (() => {
  const out: PermModule[] = [];
  for (const dept of ACCESS_SCHEMA) {
    for (const mod of dept.modules) {
      out.push({
        id: mod.moduleId,
        label: mod.label,
        group: dept.label,
        dept: dept.label,
      });
      for (const t of mod.tabs) {
        out.push({
          id: t.moduleId,
          // Legacy "↳ "-prefixed label is kept for the read-only PermissionsMatrix
          // table, which renders flat. Hierarchy is NEVER inferred from this
          // prefix anywhere — `parentId` is the structural source of truth.
          label: `↳ ${t.label}`,
          group: dept.label,
          dept: dept.label,
          parentId: mod.moduleId,
        });
      }
    }
  }
  return out;
})();

// ─── Baseline role constants ─────────────────────────────────────────────────

// getInheritedPermission and getEffectivePermission have been retired.
// Access Configuration is now the source of truth — all access decisions go
// through PermissionProvider's `can(...)` (frontend) or
// public.current_user_has_module_permission(...) (DB). Do not reintroduce
// role/department-derived baselines.
