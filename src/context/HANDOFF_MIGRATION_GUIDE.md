# Handoff: Edge Function → Direct Supabase Migration Guide

> **Context**: All ~50+ frontend files that call the Edge Function need to be migrated to use the direct Supabase client at `/utils/supabase/client.ts`. The Edge Function `make-server-c142e950` does NOT exist on the current Supabase project (`ubspbukgcxmzegnomlgi`), so every fetch call 404s.

---

## The Pattern

### Before (Broken)
```typescript
import { projectId, publicAnonKey } from "../../utils/supabase/info";
const API_URL = `https://${projectId}.supabase.co/functions/v1/make-server-c142e950`;

// Fetch
const response = await fetch(`${API_URL}/customers`, {
  headers: { Authorization: `Bearer ${publicAnonKey}` },
});
const data = await response.json();
if (data.success) { /* use data.data */ }

// Create
const response = await fetch(`${API_URL}/customers`, {
  method: "POST",
  headers: { Authorization: `Bearer ${publicAnonKey}`, "Content-Type": "application/json" },
  body: JSON.stringify(customerData),
});

// Update
const response = await fetch(`${API_URL}/customers/${id}`, {
  method: "PUT",
  headers: { Authorization: `Bearer ${publicAnonKey}`, "Content-Type": "application/json" },
  body: JSON.stringify(updatedData),
});

// Delete
const response = await fetch(`${API_URL}/customers/${id}`, {
  method: "DELETE",
  headers: { Authorization: `Bearer ${publicAnonKey}` },
});
```

### After (Working)
```typescript
import { supabase } from "../../utils/supabase/client";

// Fetch all
const { data, error } = await supabase.from('customers').select('*');

// Fetch one
const { data, error } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();

// Fetch with filters
const { data, error } = await supabase.from('customers')
  .select('*')
  .eq('status', 'Active')
  .order('created_at', { ascending: false });

// Fetch with joins (foreign key relations)
const { data, error } = await supabase.from('bookings')
  .select('*, projects(*), customers(name)')
  .eq('project_id', projectId);

// Create
const { data, error } = await supabase.from('customers').insert(customerData).select().single();

// Update
const { data, error } = await supabase.from('customers').update(updatedData).eq('id', id).select().single();

// Delete
const { error } = await supabase.from('customers').delete().eq('id', id);

// Upsert (insert or update)
const { data, error } = await supabase.from('customers').upsert(data).select().single();
```

### Key Differences
1. **No `Authorization` header needed** — the Supabase client uses the session JWT automatically
2. **No `data.success` wrapper** — Supabase returns `{ data, error }` directly
3. **RLS is enforced** — the client respects row-level security (currently permissive for authenticated users)
4. **Joins are free** — use `.select('*, related_table(column)')` for FK joins
5. **Import `supabase` from `/utils/supabase/client`**, not `projectId`/`publicAnonKey` from `info.tsx`

---

## Table Name Mapping (Edge Function Route → Supabase Table)

| Edge Function Route | Supabase Table | Notes |
|---|---|---|
| `/users` | `users` | |
| `/customers` | `customers` | |
| `/contacts` | `contacts` | |
| `/consignees` | `consignees` | |
| `/client-handler-preferences` | `client_handler_preferences` | |
| `/tasks` | `tasks` | |
| `/activities` | `crm_activities` | Note: different name! |
| `/budget-requests` | `budget_requests` | |
| `/vendors` | `service_providers` | Note: different name! |
| `/partners` | `service_providers` | Same table as vendors |
| `/quotations` | `quotations` | Has `details` JSONB overflow column |
| `/contracts/*` | `quotations` WHERE `quotation_type='contract'` | Contracts are quotations |
| `/contract-activity` | `contract_activity` | |
| `/contract-attachments` | `contract_attachments` | |
| `/projects` | `projects` | Has `details` JSONB overflow column |
| `/project-attachments` | `project_attachments` | |
| `/bookings` | `bookings` | Has `details` JSONB overflow column |
| `/project-bookings` | `project_bookings` | Junction table |
| `/evouchers` | `evouchers` | Has `details` JSONB overflow column |
| `/evouchers/:id/history` | `evoucher_history` | |
| `/evouchers/:id/submit` | UPDATE `evouchers` SET status + INSERT `evoucher_history` | Multi-step |
| `/evouchers/:id/approve` | UPDATE `evouchers` + INSERT `evoucher_history` | Multi-step |
| `/evouchers/:id/reject` | UPDATE `evouchers` + INSERT `evoucher_history` | Multi-step |
| `/evouchers/:id/post-to-ledger` | UPDATE `evouchers` + INSERT `journal_entries` + INSERT `evoucher_history` | Complex |
| `/evouchers/:id/cancel` | UPDATE `evouchers` + INSERT `evoucher_history` | Multi-step |
| `/accounting/billings` | `billing_line_items` | |
| `/accounting/expenses` | `expenses` | |
| `/accounting/invoices` | `invoices` | |
| `/accounting/collections` | `collections` | |
| `/accounts` | `accounts` | Chart of Accounts |
| `/journal-entries` | `journal_entries` | |
| `/transactions` | `transactions` | |
| `/catalog/items` | `catalog_items` | |
| `/catalog/categories` | `catalog_categories` | |
| `/tickets` | `tickets` | |
| `/ticket-types` | `ticket_types` | |
| `/comments` | `comments` | |
| `/activity-log` | `activity_log` | |
| `/saved-reports` | `saved_reports` | |

---

## JSONB `details` Overflow Pattern

Several tables (quotations, projects, bookings, evouchers) have a `details` JSONB column that stores overflow fields from the KV era. The server's `getXxxMerged()` helpers flatten `details` into the top level for API responses. When querying directly:

```typescript
// The server did this automatically — you need to do it manually:
const { data } = await supabase.from('quotations').select('*').eq('id', id).maybeSingle();
if (data) {
  // Merge details into top-level
  const merged = { ...data.details, ...data };
  delete merged.details;
  // Now `merged` has all fields at top level, matching the old API response shape
}
```

**Helper function to create:**
```typescript
// /utils/supabase/mergeDetails.ts
export function mergeDetails<T extends { details?: Record<string, any> }>(row: T): Omit<T, 'details'> & Record<string, any> {
  if (!row) return row;
  const { details, ...rest } = row;
  return { ...details, ...rest };
}
```

---

## Files to Migrate (Complete List)

### Priority 1: Core Data (Unblocks Most Modules)

| File | Routes Used | Table(s) |
|---|---|---|
| `/components/BusinessDevelopment.tsx` | `/customers`, `/contacts`, `/quotations`, `/tasks`, `/activities`, `/budget-requests` | customers, contacts, quotations, tasks, crm_activities, budget_requests |
| `/components/Pricing.tsx` | `/customers`, `/contacts`, `/quotations` | customers, contacts, quotations |
| `/components/crm/ContactsListWithFilters.tsx` | `/contacts`, `/users` | contacts, users |
| `/components/crm/CustomersListWithFilters.tsx` | `/customers`, `/users` | customers, users |
| `/components/crm/ContactsModuleWithBackend.tsx` | `/contacts` | contacts |
| `/components/crm/ContactDetailView.tsx` | `/contacts/:id` | contacts |
| `/components/bd/AddContactPanel.tsx` | POST `/contacts`, `/users`, `/customers` | contacts, users, customers |
| `/components/bd/AddCustomerPanel.tsx` | POST `/customers`, `/users` | customers, users |
| `/components/bd/CustomerDetail.tsx` | `/customers/:id`, `/contacts`, `/quotations` | customers, contacts, quotations |
| `/components/bd/ContactDetail.tsx` | `/contacts/:id`, `/activities`, `/tasks` | contacts, crm_activities, tasks |
| `/components/bd/TasksList.tsx` | `/tasks` | tasks |
| `/components/bd/ActivitiesList.tsx` | `/activities` | crm_activities |
| `/components/bd/AddTaskPanel.tsx` | POST `/tasks`, `/users` | tasks, users |
| `/components/bd/AddActivityPanel.tsx` | POST `/activities` | crm_activities |
| `/components/bd/BudgetRequestList.tsx` | `/budget-requests` | budget_requests |
| `/components/bd/BudgetRequestDetailPanel.tsx` | `/budget-requests/:id` | budget_requests |

### Priority 2: Projects & Operations (Core Workflow)

| File | Routes Used | Table(s) |
|---|---|---|
| `/hooks/useProjectFinancials.ts` | `/projects/:id`, `/accounting/billings`, `/accounting/expenses`, `/accounting/invoices`, `/accounting/collections` | projects, billing_line_items, expenses, invoices, collections |
| `/hooks/useContractFinancials.ts` | Same pattern for contracts | quotations, billing_line_items, expenses, invoices, collections |
| `/hooks/useContractBillings.ts` | `/accounting/billings?contract_id=` | billing_line_items |
| `/hooks/useConsignees.ts` | `/consignees` | consignees |
| `/hooks/useBookingRateCard.ts` | `/bookings/:id` | bookings |
| `/hooks/useProjectsFinancialsMap.ts` | Batch financial queries | Multiple |
| `/utils/contractLookup.ts` | `/quotations?customer_id=&quotation_type=contract` | quotations |
| `/utils/contractAutofill.ts` | `/contracts/:id/link-booking` | contract_bookings |
| `/utils/projectAutofill.ts` | `/projects/by-number/:num`, `/projects/:id/link-booking` | projects, project_bookings |
| `/components/operations/shared/useCustomerOptions.ts` | `/customers` | customers |
| `/components/pricing/TeamAssignmentForm.tsx` | `/users?department=Operations&service_type=X` | users |

### Priority 3: Accounting & Financial

| File | Routes Used | Table(s) |
|---|---|---|
| `/hooks/useEVouchers.ts` | `/evouchers` | evouchers |
| `/hooks/useEVoucherSubmit.ts` | POST `/evouchers` | evouchers |
| `/hooks/useFinancialHealthReport.ts` | `/reports/financial-health` | Multiple (aggregate query) |
| `/hooks/useReportsData.ts` | Various report endpoints | Multiple |
| `/utils/accounting-api.ts` | Various accounting endpoints | Multiple |
| `/components/accounting/FinancialsModule.tsx` | `/accounting/billings`, `/accounting/expenses`, etc. | Multiple |
| `/components/accounting/EVouchersContent.tsx` | `/evouchers` | evouchers |
| `/components/accounting/evouchers/EVoucherWorkflowPanel.tsx` | `/evouchers/:id/submit|approve|reject|post-to-ledger|cancel` | evouchers, evoucher_history, journal_entries |
| `/components/accounting/evouchers/EVoucherHistoryTimeline.tsx` | `/evouchers/:id/history` | evoucher_history |
| `/components/accounting/CatalogManagementPage.tsx` | `/catalog/items`, `/catalog/categories` | catalog_items, catalog_categories |
| `/components/accounting/PostToLedgerPanel.tsx` | `/accounts`, `/evouchers/:id/post-to-ledger` | accounts, evouchers, journal_entries |
| `/components/accounting/reports/FinancialReports.tsx` | `/reports/*` | Multiple |
| `/components/accounting/AccountingCustomers.tsx` | `/customers` | customers |
| `/components/accounting/CustomerLedgerDetail.tsx` | Various | Multiple |
| `/components/accounting/BillingsContentNew.tsx` | `/evouchers` | evouchers |
| `/components/accounting/CollectionsContentNew.tsx` | `/evouchers` | evouchers |
| `/components/accounting/ExpensesPageNew.tsx` | `/accounting/expenses` | expenses |
| `/components/accounting/AggregateInvoicesPage.tsx` | `/accounting/invoices` | invoices |
| `/components/accounting/ChargeExpenseMatrix.tsx` | `/reports/charge-expense-matrix` | Multiple |
| `/components/accounting/AuditingSummary.tsx` | `/reports/auditing-summary` | Multiple |
| `/components/accounting/billings/BillingDetailsSheet.tsx` | `/accounting/billings/:id` | billing_line_items |
| `/components/accounting/collections/CollectionDetailsSheet.tsx` | `/accounting/collections/:id` | collections |
| `/components/accounting/expenses/ExpenseDetailsSheet.tsx` | `/evouchers/:id` | evouchers |
| `/components/accounting/AddRequestForPaymentPanel.tsx` | POST `/evouchers` | evouchers |

### Priority 4: Support & Admin

| File | Routes Used | Table(s) |
|---|---|---|
| `/components/Admin.tsx` | `/users`, `/settings`, `/counters` | users, settings, counters |
| `/components/InboxPage.tsx` | `/tickets?user_id=&role=&department=` | tickets |
| `/components/TicketQueuePage.tsx` | `/tickets?user_id=&role=&department=` | tickets |
| `/components/TicketTestingDashboard.tsx` | `/tickets`, `/ticket-types`, `/users` | tickets, ticket_types, users |
| `/components/ticketing/TicketDetailModal.tsx` | `/tickets/:id/activity` | activity_log |
| `/components/ActivityLogPage.tsx` | `/activity-log` | activity_log |
| `/components/DiagnosticsPage.tsx` | Various health checks | Multiple |
| `/components/bd/BDReports.tsx` | `/reports/*` | Multiple |
| `/hooks/useNetworkPartners.ts` | `/partners` | service_providers |

### Already Migrated (Do NOT Touch)

| File | Status |
|---|---|
| `/hooks/useUser.tsx` | DONE — uses `supabase.from('users')` directly |

---

## Recommended Approach: Shared Hooks

Instead of rewriting each component individually, create shared hooks:

```typescript
// /hooks/useSupabaseData.ts — generic data fetching hook
import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase/client';

export function useSupabaseQuery<T>(
  table: string,
  options?: {
    select?: string;
    filters?: Record<string, any>;
    order?: { column: string; ascending?: boolean };
    enabled?: boolean;
  }
) {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = async () => {
    setIsLoading(true);
    let query = supabase.from(table).select(options?.select || '*');
    
    if (options?.filters) {
      Object.entries(options.filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });
    }
    
    if (options?.order) {
      query = query.order(options.order.column, { ascending: options.order.ascending ?? false });
    }

    const { data: result, error: err } = await query;
    
    if (err) {
      setError(err.message);
    } else {
      setData((result || []) as T[]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (options?.enabled !== false) fetch();
  }, [table, JSON.stringify(options?.filters)]);

  return { data, isLoading, error, refresh: fetch };
}
```

Then per-entity hooks:
```typescript
// /hooks/useCustomers.ts
export function useCustomers(filters?: { owner_id?: string; status?: string }) {
  return useSupabaseQuery<Customer>('customers', { filters });
}

// /hooks/useContacts.ts  
export function useContacts(filters?: { customer_id?: string }) {
  return useSupabaseQuery<Contact>('contacts', { filters });
}

// /hooks/useUsers.ts (for user pickers/dropdowns)
export function useUsers(filters?: { department?: string; service_type?: string; operations_role?: string }) {
  return useSupabaseQuery<User>('users', { 
    filters: { ...filters, is_active: true },
    select: 'id, name, email, avatar, department, role, service_type, operations_role'
  });
}
```

---

## Complex Endpoints (Multi-Step Operations)

Some Edge Function endpoints do multiple things. These need careful translation:

### EVoucher Workflow (submit/approve/reject/post/cancel)

The Edge Function did:
1. Update evoucher status
2. Insert evoucher_history record
3. (For post-to-ledger) Insert journal_entry records

Direct Supabase equivalent:
```typescript
// Submit evoucher
const submitEvoucher = async (evoucherId: string, user: User) => {
  // Step 1: Update status
  const { error: updateError } = await supabase
    .from('evouchers')
    .update({ status: 'Submitted', updated_at: new Date().toISOString() })
    .eq('id', evoucherId);
    
  if (updateError) throw updateError;
  
  // Step 2: Insert history
  const { error: historyError } = await supabase
    .from('evoucher_history')
    .insert({
      id: `eh-${Date.now()}`,
      evoucher_id: evoucherId,
      action: 'submitted',
      status: 'Submitted',
      user_id: user.id,
      user_name: user.name,
      user_role: user.department,
      created_at: new Date().toISOString(),
    });
    
  if (historyError) throw historyError;
};
```

### Project/Contract Link Booking

```typescript
// Link booking to project
const linkBookingToProject = async (projectId: string, bookingId: string) => {
  await supabase.from('project_bookings').insert({
    project_id: projectId,
    booking_id: bookingId,
  });
};
```

### Report Aggregation Queries

Complex reports (financial health, charge-expense matrix) did server-side aggregation. With direct queries, you can either:
1. Use Supabase's `.select()` with joins and do client-side aggregation
2. Create Postgres views or RPC functions for complex aggregations
3. Use multiple parallel queries and merge client-side

---

## Testing Checklist

After migrating each file:
1. Verify data loads (no 404s, no empty states)
2. Verify CRUD operations (create, update, delete)
3. Verify filters/search still work
4. Verify data shape matches what the component expects (especially `details` JSONB merge)
5. Verify no stale `projectId`/`publicAnonKey` imports remain (unless used elsewhere)
