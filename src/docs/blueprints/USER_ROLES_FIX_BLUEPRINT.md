# User Roles Architecture — Complete Fix Plan

> **Status**: PHASE 3 FRONTEND COMPLETE — Awaiting Phase 5 step 5 (drop password column) after server JWT middleware confirmation (2026-03-15)
> **Source**: Claude Code architecture analysis, adapted for Figma Make constraints
> **Date**: 2026-03-14

---

## Context

The Neuron OS user role system has drifted across 3 layers (frontend, server, database) and accumulated 6 classes of defects:

1. **Taxonomy fragmentation** — 4 different sets of role/dept values in use simultaneously. Several components silently fail their permission checks because they compare against values that can never match.
2. **Auth layer mismatch** — useUser.tsx already uses Supabase Auth (JWT-based), but the Hono server still validates via a plaintext /auth/login endpoint, and role/dept is passed as client-supplied query params — trivially spoofable.
3. **Server-wide exposure** — Zero auth middleware: all 100+ API endpoints are publicly accessible. Three destructive DELETE endpoints can wipe entire tables with a single unauthenticated curl command.
4. **Unused permission system** — permissions.ts defines actions but is never imported by any component. The EVoucher workflow and Budget Request approval buttons are permanently hidden (compare against "Treasury", "Accountant", "Finance Manager" — none are real role values).
5. **No route guards** — The sidebar hides links but /accounting/transactions is accessible to any authenticated user who types the URL.
6. **Database has no enforcement** — users.department and users.role are free-text TEXT columns. Nothing prevents storing invalid values. Two dead columns (permissions TEXT[] always {}, password TEXT used only by the obsolete custom login) remain.

---

## Canonical Taxonomy (Source of Truth: /hooks/useUser.tsx)

```
department: 'Business Development' | 'Pricing' | 'Operations' | 'Accounting' | 'Executive' | 'HR'
role:       'rep' | 'manager' | 'director'
// Operations sub-fields:
service_type:    'Forwarding' | 'Brokerage' | 'Trucking' | 'Marine Insurance' | 'Others'
operations_role: 'Manager' | 'Supervisor' | 'Handler'
```

Role hierarchy: rep (1) < manager (2) < director (3). Executive department auto-promotes to director privileges everywhere.

---

## Phase 1 — Fix Taxonomy Mismatches (Frontend Only, No DB/Server Changes)

**Status**: ✅ COMPLETE (2026-03-14)

All 6 components below have broken permission logic today. This phase makes them functional for the first time.

### Files to modify:

**`/utils/permissions.ts`**
- Change type `Department = "BD" | "PD" | "Finance" | "Admin"` to use canonical names: `"Business Development" | "Pricing" | "Accounting" | "Executive"`
- All `"BD"` → `"Business Development"`, `"PD"` → `"Pricing"`, `"Finance"` → `"Accounting"`, `"Admin"` → `"Executive"` in every permission map
- Add `role: 'rep' | 'manager' | 'director'` parameter to each function; add `|| role === 'director'` override so directors always pass
- Add `canAccessModule(dept, role, module)` and `hasMinRole(role, minRole)` helpers (see target architecture in USER_ROLE_ARCHITECTURE.md §4.2)

**`/components/accounting/EVoucherDetailView.tsx`** — lines 42-45
- Replace custom roles ("Manager", "Treasury", "Accountant", "Auditor") with canonical checks:
```typescript
const isAcctMgr = dept === 'Accounting' && (role === 'manager' || role === 'director');
const isAcctRep = dept === 'Accounting' && role === 'rep';
const isAcctDir = dept === 'Accounting' && role === 'director';
canApprove  = evoucher.status === 'Under Review' && isAcctMgr;
canDisburse = evoucher.status === 'Approved'     && isAcctMgr;
canRecord   = evoucher.status === 'Disbursed'    && isAcctRep;
canAudit    = evoucher.status === 'Recorded'     && isAcctDir;
```

**`/components/bd/BudgetRequestDetailPanel.tsx`** — lines 40-41
- Replace `role === "Finance Manager" || role === "Accountant"` with:
```typescript
canApprove = (dept === 'Accounting' && (role === 'manager' || role === 'director')) || dept === 'Executive';
```

**`/components/Admin.tsx`**
- Remove local User interface with `role: "Employee" | "President"`
- Import canonical User from useUser.tsx
- Replace role `<select>` options with `rep / manager / director`
- Add department `<select>` with 6 canonical options
- Add conditional `service_type` + `operations_role` fields when department = Operations (same pattern as App.tsx signup form)

**`/components/hr/EmployeesList.tsx`**
- Remove `import { UserRole } from '../Login'` (legacy type)
- Change `userRole: UserRole` prop to `userRole: 'rep' | 'manager' | 'director'`
- Change `userRole === "Admin"` check (line ~390) to `userRole === "director"`
- Update all call sites to pass `effectiveRole` from `useUser()`

**CRM / Pricing components (6 files):**
- `/components/crm/ContactsListWithFilters.tsx`
- `/components/crm/CustomersListWithFilters.tsx`
- `/components/pricing/QuotationsListWithFilters.tsx`
- `/components/pricing/QuotationFileView.tsx`
- `/components/pricing/StatusChangeButton.tsx`
- Change prop type from `"BD" | "PD"` to `'Business Development' | 'Pricing'`
- Change all internal `=== "BD"` checks to `=== "Business Development"`, `=== "PD"` to `=== "Pricing"`
- Update callers in `BusinessDevelopment.tsx` (pass `"Business Development"`) and `Pricing.tsx` (pass real department from `effectiveDepartment`)

---

## Phase 2 — useUsers Hook (Kill Edge Function User Fetches)

**Status**: ✅ COMPLETE (2026-03-14)

Creates one reusable pattern for all user-picker dropdowns. Uses direct Supabase queries (JWT-authenticated) instead of the unauthenticated Edge Function.

### New file: `/hooks/useUsers.ts`

```typescript
interface UseUsersOptions {
  department?: User['department'];
  role?: User['role'];
  service_type?: User['service_type'];
  operations_role?: User['operations_role'];
  enabled?: boolean;
}

export function useUsers(options: UseUsersOptions = {}): {
  users: User[];
  isLoading: boolean;
  error: string | null;
}
```

Internal: `supabase.from('users').select('id,name,email,...').eq('is_active', true)` + conditional filters for each option. Returns an empty array until `enabled !== false`.

### Files that get their fetch blocks replaced:

| File | Current Pattern | Replacement |
|---|---|---|
| `AddCustomerPanel.tsx` | `fetch(\`${API_URL}/users?department=Business Development\`)` | `useUsers({ department: 'Business Development', enabled: isOpen })` |
| `AddContactPanel.tsx` | Same | Same |
| `TeamAssignmentForm.tsx` | 3 sequential fetch calls (manager, supervisor, handler) | 3 parallel hook calls with `service_type` + `operations_role` filters |
| `ActivityLogPage.tsx` | `fetchUsersInDepartment()` inside a callback | `useUsers({ department: departmentFilter, enabled: departmentFilter !== 'all' })` |
| `ContactsListWithFilters.tsx` | manual fetch on mount | `useUsers({ department: 'Business Development' })` |
| `CustomersListWithFilters.tsx` | Same | Same |

Remove all local `BackendUser` interface definitions and `API_URL` constants in these files.

---

## Phase 3 — Server JWT Middleware + Remove Custom Login

**Status**: ✅ FRONTEND COMPLETE (2026-03-15) — All .tsx and .ts files migrated to apiFetch(). Server-side changes cannot be deployed from Figma Make.
**IMPORTANT**: Server-side changes (JWT middleware, removing /auth/login, protecting destructives, CORS restriction) **cannot be deployed from Figma Make**. These changes can be written to the server files for reference/future deployment, but the _deployable_ parts of this phase are frontend-only.

### Frontend changes — ALL COMPLETED:

1. ✅ **`/utils/api.ts`** — Created. Centralizes JWT-forwarding fetch wrapper with anon key fallback. FormData-aware (omits Content-Type for multipart uploads).
2. ✅ **`/hooks/useUser.tsx`** — Fixed `isAuthenticated: !!user && !!session`.
3. ✅ **All hooks migrated** — 12 hook files converted to `apiFetch()`:
   - `useProjectFinancials.ts`, `useBookingRateCard.ts`, `useConsignees.ts`
   - `useContractBillings.ts`, `useContractFinancials.ts`, `useEVoucherSubmit.ts`
   - `useEVouchers.ts`, `useFinancialHealthReport.ts`, `useNetworkPartners.ts`
   - `useProjectsFinancialsMap.ts`, `useReportsData.ts`
   - `useCustomerOptions.ts` (operations/shared)
4. ✅ **Top-level components migrated** — 8 files:
   - `ActivityLogPage.tsx`, `InboxPage.tsx`, `TicketQueuePage.tsx`
   - `DiagnosticsPage.tsx`, `TicketTestingDashboard.tsx`, `Admin.tsx`
   - `BusinessDevelopment.tsx`, `Pricing.tsx`
5. ✅ **`/components/bd/` — ALL 15 files migrated** (2026-03-15):
   - ActivitiesList, ActivityDetailInline, AddActivityPanel, AddContactPanel, AddCustomerPanel
   - AddInquiryPanel, AddTaskPanel, BDReports, BudgetRequestDetailPanel, BudgetRequestList
   - ContactDetail, CreateProjectModal, CustomerDetail, CustomerFinancialsTab, TaskDetailInline, TasksList
6. ✅ **`/components/bd/reports/` — ALL 5 files migrated** (2026-03-15):
   - ReportControlCenter, ReportResults, ReportTemplates, SavedReports, ReportsModule
7. ✅ **`/components/crm/` — ALL 6 files migrated** (2026-03-15):
   - ContactsListWithFilters, ContactsModuleWithBackend, CustomersListWithFilters
   - CompanyAutocomplete, ContactPersonAutocomplete, CustomerAutocomplete
8. ✅ **`/components/accounting/` — ALL 19 files migrated** (2026-03-15):
   - AccountingCustomers, AddRequestForPaymentPanel, AggregateInvoicesPage, AuditingSummary
   - CatalogManagementPage, ChargeExpenseMatrix, CustomerLedgerDetail, ExpensesPage
   - ExpensesPageNew, FinancialsModule, PostToLedgerPanel, BillingsContentNew, CollectionsContentNew
   - billings/BillingDetailsSheet, collections/CollectionDetailsSheet
   - evouchers/EVoucherHistoryTimeline, evouchers/EVoucherWorkflowPanel
   - expenses/ExpenseDetailsSheet, reports/FinancialReports
9. ✅ **`/components/operations/` — ALL 17 files migrated** (2026-03-15):
   - BrokerageBookings, BrokerageBookingDetails, CreateBrokerageBookingPanel
   - MarineInsuranceBookings, MarineInsuranceBookingDetails, CreateMarineInsuranceBookingPanel
   - OthersBookings, OthersBookingDetails, CreateOthersBookingPanel
   - TruckingBookings, TruckingBookingDetails, CreateTruckingBookingPanel
   - OperationsReports
   - forwarding/ForwardingBookings, forwarding/ForwardingBookingDetails, forwarding/CreateForwardingBookingPanel
   - shared/ExpensesTab, shared/CreateExpenseModal
10. ✅ **`/components/pricing/` — ALL 9 files migrated** (2026-03-15):
    - ContractDetailView, CreateBookingsFromProjectModal, PricingReports, QuotationFileView
    - TeamAssignmentForm, VendorDetail, VendorsList
    - quotations/GeneralDetailsSection, quotations/VendorsSection
11. ✅ **`/components/projects/` — ALL 10 files migrated** (2026-03-15):
    - CreateBookingFromProjectModal, CreateBookingFromProjectPanel, ProjectBookingReadOnlyView
    - ProjectBookingsTab, ProjectBillingsTab, ProjectDetail, ProjectExpensesTab, ProjectFinancialsTab
    - ProjectsModule, invoices/InvoiceBuilder
12. ✅ **`/components/ticketing/` — ALL 5 files migrated** (2026-03-15):
    - EntityPickerModal, NewTicketPanel, TicketDetailModal, TicketDetailView, TicketSidebar
13. ✅ **`/components/contracts/` — ALL 2 files migrated** (2026-03-15):
    - ContractsModule, RateCalculationSheet
14. ✅ **`/components/shared/` — ALL 8 files migrated** (2026-03-15):
    - BookingCommentsTab, CommentsTab, ConsigneeInfoBadge, ConsigneePicker, EntityAttachmentsTab
    - billings/BillingCategorySection, billings/AddChargeModal, billings/UnifiedBillingsTab
    - pricing/CatalogItemCombobox
15. ✅ **`/components/transactions/` — 1 file migrated** (2026-03-15):
    - TransactionsModule
16. ✅ **`/utils/` — ALL 5 utility files migrated** (2026-03-15):
    - api.ts (the wrapper itself), projectAutofill.ts, contractAutofill.ts
    - accounting-api.ts, cleanupDuplicates.ts, contractLookup.ts

### Remaining `projectId`/`publicAnonKey` imports (ALL LEGITIMATE):
- `/utils/api.ts` — needs projectId for BASE_URL and publicAnonKey as JWT fallback
- `/utils/supabase/client.ts` — Supabase client initialization
- `/components/SupabaseDebug.tsx` — diagnostic debug tool

### Frontend changes — REMAINING:
_(none — all frontend files migrated)_

### Server changes (reference only — write to files but cannot deploy):

`/supabase/functions/server/index.tsx` changes:

Add JWT middleware (after CORS, before any route):
```typescript
app.use('/make-server-c142e950/*', async (c, next) => {
  const token = c.req.header('Authorization')?.slice(7);
  if (!token) return c.json({ success: false, error: 'Unauthorized' }, 401);

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return c.json({ success: false, error: 'Invalid token' }, 401);

  const { data: profile } = await supabase.from('users')
    .select('id, role, department').eq('auth_id', user.id).maybeSingle();
  if (!profile) return c.json({ success: false, error: 'Profile not found' }, 403);

  c.set('callerId', profile.id);
  c.set('callerRole', profile.role);
  c.set('callerDepartment', profile.department);
  return next();
});
```

Replace query-param identity reads in these handlers:
- `/auth/me` — replace `c.req.query("user_id")` with `c.get('callerId')`
- Ticket filter endpoint — replace `c.req.query("role"/"department"/"user_id")` with context values
- Activity log endpoint — same replacement

Protect destructive endpoints:
```typescript
if (c.get('callerRole') !== 'director') {
  return c.json({ success: false, error: 'Insufficient permissions' }, 403);
}
```
Apply to: `DELETE /auth/clear-users`, `DELETE /seed/clear`, `DELETE /customers/clear`, `DELETE /contacts/clear`, `DELETE /vendors/clear`, `POST /users/seed`.

Remove `POST /auth/login` (lines 89-119).

Restrict CORS:
```typescript
cors({ origin: Deno.env.get('FRONTEND_ORIGIN') || 'http://localhost:5173', ... })
```

---

## Phase 4 — Frontend Route Guards

**Status**: ✅ COMPLETE (2026-03-14)

### New file: `/components/RouteGuard.tsx`

```typescript
interface RouteGuardProps {
  children: ReactNode;
  allowedDepartments?: User['department'][];
  requireMinRole?: User['role'];
}
```

Logic: Executive department always passes. Check `allowedDepartments` contains `effectiveDepartment`. Check role hierarchy using `{ rep: 0, manager: 1, director: 2 }[effectiveRole] >= minLevel`. On failure: call `navigate('/dashboard')` in a `useEffect`.

### Apply in `/App.tsx`:

Wrap route groups using department rules from the existing sidebar logic:
- `/bd/*` → `allowedDepartments: ['Business Development']`
- `/pricing/*` → `allowedDepartments: ['Pricing']`
- `/operations/*` → `allowedDepartments: ['Operations']`
- `/accounting/*` → `allowedDepartments: ['Accounting']`
- `/hr/*` → `allowedDepartments: ['HR']`
- `/activity-log` → `requireMinRole: 'manager'`
- `/ticket-queue` → `requireMinRole: 'manager'`

---

## Phase 5 — Database Cleanup & Enforcement

**Status**: NOT STARTED
**NOTE**: Migration file can be written here but must be run via Supabase SQL Editor.

### New file: `/supabase/migrations/004_role_constraints.sql`

```sql
-- 1. Check for bad data first (run SELECT before ALTER):
SELECT id, email, department, role FROM users
WHERE department NOT IN ('Business Development','Pricing','Operations','Accounting','Executive','HR')
   OR role NOT IN ('rep','manager','director');

-- 2. Add CHECK constraints (preferred over ENUM — easier to ALTER later)
ALTER TABLE users ADD CONSTRAINT users_department_check
  CHECK (department IN ('Business Development','Pricing','Operations','Accounting','Executive','HR'));
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('rep','manager','director'));
ALTER TABLE users ADD CONSTRAINT users_service_type_check
  CHECK (service_type IS NULL OR service_type IN ('Forwarding','Brokerage','Trucking','Marine Insurance','Others'));
ALTER TABLE users ADD CONSTRAINT users_operations_role_check
  CHECK (operations_role IS NULL OR operations_role IN ('Manager','Supervisor','Handler'));

-- 3. Drop unused permissions column
ALTER TABLE users DROP COLUMN IF EXISTS permissions;

-- 4. Fix RLS policies to use canonical roles (remove 'Admin','admin','Manager' from list)
DROP POLICY IF EXISTS "Admins can update any user" ON users;
CREATE POLICY "Admins can update any user" ON users FOR UPDATE TO authenticated
  USING (get_my_role() IN ('manager','director'))
  WITH CHECK (get_my_role() IN ('manager','director'));
-- (same fix for INSERT and DELETE policies)

-- 5. Drop password column — ONLY after Phase 3 JWT middleware is confirmed working:
-- Checklist: [ ] /auth/login removed  [ ] all users have auth_id  [ ] E2E login tested
-- ALTER TABLE users DROP COLUMN IF EXISTS password;
```

---

## Phase 6 — Phase 2 RLS: Scoped Access Policies (Future)

**Status**: NOT STARTED — Do not apply until Phase 3 is deployed and stable.

### New file: `/supabase/migrations/005_phase2_rls.sql`

Key policies:
- `customers` / `contacts` — BD can CRUD; Pricing, Operations, Accounting can SELECT; HR cannot read
- `evouchers` / `invoices` / `journal_entries` — Accounting CRUD; other depts SELECT
- `quotations` — BD creates/reads; Pricing prices/sends; others SELECT
- `activity_log` — directors SELECT all; managers SELECT WHERE `user_department = get_my_department()`; reps SELECT WHERE `user_id = get_my_profile_id()`
- `tickets` — directors SELECT all; managers SELECT WHERE `to_department = get_my_department()`; reps SELECT WHERE `created_by = get_my_profile_id()`

---

## Phase 7 — Dead Code Cleanup (Can Run in Parallel)

**Status**: ✅ PARTIAL — UserRole type decoupled, Login.tsx is fully dead (no external importers remain). Server-side cleanup (KV import, seed passwords) deferred.

`/supabase/functions/server/index.tsx`:
- Remove `import * as kv from "./kv_store_robust.tsx"` (line 5)
- Delete the commented-out legacy KV block (lines ~5090-5219)

`/components/Login.tsx`:
- Remove `export type UserRole = "Operations" | "Accounting" | "HR" | "Admin"` — after Phase 1 fixes EmployeesList.tsx, this type has no callers

`index.tsx` seed endpoint (lines 218+):
- Remove `password: "password123"` from all seed user objects — will cause insert failures once Phase 5 drops the password column

---

## File Change Summary

| File | Phase | Change Type |
|---|---|---|
| `/utils/permissions.ts` | 1 | Rewrite — fix department names, add role param |
| `/components/accounting/EVoucherDetailView.tsx` | 1 | Fix 4 broken role checks |
| `/components/bd/BudgetRequestDetailPanel.tsx` | 1 | Fix approval gate |
| `/components/Admin.tsx` | 1 | Fix roles, add department selector |
| `/components/hr/EmployeesList.tsx` | 1 | Fix Admin→director, remove Login.tsx type |
| `/components/crm/ContactsListWithFilters.tsx` | 1 | Shortcode→canonical dept |
| `/components/crm/CustomersListWithFilters.tsx` | 1 | Same |
| `/components/pricing/QuotationsListWithFilters.tsx` | 1 | Same |
| `/components/pricing/QuotationFileView.tsx` | 1 | Same |
| `/components/pricing/StatusChangeButton.tsx` | 1 | Same |
| `/components/BusinessDevelopment.tsx` | 1 | Update dept prop to canonical |
| `/components/Pricing.tsx` | 1 | Update dept prop to canonical |
| `/hooks/useUsers.ts` | 2 | New file |
| `/components/bd/AddCustomerPanel.tsx` | 2 | Replace fetch with useUsers hook |
| `/components/bd/AddContactPanel.tsx` | 2 | Same |
| `/components/pricing/TeamAssignmentForm.tsx` | 2 | Replace 3 fetches |
| `/components/ActivityLogPage.tsx` | 2 | Replace fetchUsersInDepartment |
| `/components/crm/ContactsListWithFilters.tsx` | 2 | Replace fetch |
| `/components/crm/CustomersListWithFilters.tsx` | 2 | Same |
| `/supabase/functions/server/index.tsx` | 3 | JWT middleware, remove /auth/login, protect destructives, fix CORS |
| `/utils/api.ts` | 3 | New file — JWT-forwarding fetch wrapper |
| `/hooks/useUser.tsx` | 3 | Fix isAuthenticated: !!user && !!session |
| ~40-60 frontend components | 3 | Replace fetch(API_URL, { Authorization: publicAnonKey }) with apiFetch() |
| `/components/RouteGuard.tsx` | 4 | New file |
| `/App.tsx` | 4 | Wrap routes with RouteGuard |
| `/supabase/migrations/004_role_constraints.sql` | 5 | New file — DB constraints |
| `/supabase/migrations/005_phase2_rls.sql` | 6 | New file — scoped RLS |

---

## Verification

After each phase, verify in this order:

**Phase 1**: Open the EVoucher workflow as an Accounting user with role: "manager" → approve button should now appear. Open BudgetRequest as Accounting manager → approve button should appear. Open Admin as director → role dropdown shows rep/manager/director. Check EmployeesList admin actions visible for director.

**Phase 2**: Open AddCustomerPanel → BD users dropdown populates without a network call to the Edge Function (check DevTools → Network tab shows supabase.co/rest/v1/users, not the Edge Function URL).

**Phase 3**: Use DiagnosticsPage.tsx and SupabaseDebug.tsx to verify login still works. Attempt to call DELETE /auth/clear-users with the anon key (no JWT) → should get 401. Attempt with a valid rep JWT → should get 403. Attempt with director JWT → should succeed.

**Phase 4**: Log in as an Accounting user. Navigate to /bd/contacts in the URL bar → should redirect to /dashboard.

**Phase 5**: Run the validation SELECT first. After applying constraints, attempt to create a user with role = "Employee" → should fail with constraint violation.

**Phase 6**: Use `SET LOCAL role = authenticated` + `SET LOCAL request.jwt.claims = ...` in the Supabase SQL editor to test RLS policies before deploying.