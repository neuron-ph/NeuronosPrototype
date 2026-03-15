# Handoff: Known Bugs & Inconsistencies

> Every known issue with exact file locations and fix instructions.
> Severity: CRITICAL (blocks features), HIGH (wrong behavior), MEDIUM (cosmetic/confusing), LOW (technical debt).

---

## CRITICAL: All Data Fetches 404

**What**: Every frontend component that calls the Edge Function gets a 404.
**Why**: The Edge Function `make-server-c142e950` exists on project `effhfendfrmgnuqgvehr` but NOT on the current project `ubspbukgcxmzegnomlgi`.
**Impact**: All modules show empty states — BD, Pricing, Operations, Accounting, Projects, Contracts, Tickets, Reports.
**Files affected**: ~53 files (see `/context/HANDOFF_MIGRATION_GUIDE.md` for full list)
**Fix**: Migrate each file from `fetch(API_URL/...)` to `supabase.from('table').select(...)`.

---

## CRITICAL: `permissions.ts` Uses Wrong Department Codes

**File**: `/utils/permissions.ts`
**What**: Uses `"BD"`, `"PD"`, `"Finance"`, `"Admin"` as Department type values.
**Actual values**: `"Business Development"`, `"Pricing"`, `"Accounting"`, `"Executive"` (from `useUser.tsx`).
**Impact**: Every call to `canPerformQuotationAction()`, `canPerformProjectAction()`, `canPerformBookingAction()` silently returns `false` because the department string never matches.
**Fix**:
```typescript
// Change the type from:
export type Department = "BD" | "PD" | "Operations" | "Finance" | "Admin";

// To:
export type Department = "Business Development" | "Pricing" | "Operations" | "Accounting" | "Executive" | "HR";

// Update all permission records:
create_inquiry: ["BD"]           →  create_inquiry: ["Business Development"]
price_quotation: ["PD"]          →  price_quotation: ["Pricing"]
generate_invoice: ["BD", "Finance", "Admin"]  →  generate_invoice: ["Business Development", "Accounting", "Executive"]
// etc.
```

**Note**: The CRM components (`ContactsListWithFilters`, `CustomersListWithFilters`) use a separate `"BD" | "PD"` prop that is manually mapped by the parent components (`BusinessDevelopment.tsx` hardcodes `"BD"`, `Pricing.tsx` hardcodes `"PD"`). This works but should eventually use the canonical type.

---

## HIGH: `Admin.tsx` Uses Wrong Role Values

**File**: `/components/Admin.tsx`
**Lines**: ~494-506, ~544-548
**What**: The "Add New User" dialog offers `"Employee"` and `"President"` as role options. Role badges color-code based on `user.role === "President"`.
**Actual values**: `"rep"`, `"manager"`, `"director"` (from schema and `useUser.tsx`).
**Impact**: New users created via Admin panel get invalid role values. Role badges show wrong colors.
**Fix**:
```typescript
// Replace role options:
<SelectItem value="Employee">Employee</SelectItem>
<SelectItem value="President">President</SelectItem>

// With:
<SelectItem value="rep">Rep</SelectItem>
<SelectItem value="manager">Manager</SelectItem>
<SelectItem value="director">Director</SelectItem>

// Also add department selector (currently missing entirely)
// And fix badge styling to use the correct values
```

---

## HIGH: `Admin.tsx` Missing Department Selector

**File**: `/components/Admin.tsx`
**What**: The "Add New User" dialog has Name, Email, Role — but NO department field.
**Impact**: Users created via Admin panel have no department set, breaking sidebar navigation and permission checks.
**Fix**: Add a department `<Select>` with the 6 canonical options, and pass it to the user creation call.

---

## HIGH: `EmployeesList.tsx` Checks Wrong Role Value

**File**: `/components/hr/EmployeesList.tsx`
**Line**: ~390
**What**: `const isAdmin = userRole === "Admin";` — checks for `"Admin"` which is not a valid role value.
**Impact**: Admin-only actions (dropdown menu on employee rows) are never visible.
**Fix**: Change to `const isAdmin = userRole === "director" || userRole === "manager";` (or use the permissions system).

---

## HIGH: No Seed Data in Relational Tables

**What**: The 35 relational tables are empty. Seed data was loaded via the Edge Function's `/users/seed`, `/partners/seed`, etc. endpoints, which are now unreachable.
**Impact**: Even once fetch calls are migrated, modules will show empty states because there's no data.
**Fix options**:
1. Run seed SQL directly in Supabase SQL Editor (adapt from `/supabase/functions/server/seed_data.tsx`)
2. Create data via the app's UI after migrating the relevant create/insert calls
3. Write a temporary seeding script that uses direct Supabase client

---

## MEDIUM: EVoucher Workflow Uses `user.department` as "user_role"

**File**: `/components/accounting/evouchers/EVoucherWorkflowPanel.tsx`
**Lines**: ~52, 99, 146, 194, 244
**What**: When recording evoucher history, uses `user_role: user.department` (e.g., `"Accounting"`) instead of the actual role (e.g., `"manager"`).
**Impact**: Audit trail shows department as role — confusing but not blocking.
**Fix**: Change `user_role: user.department` to `user_role: user.role` or add both fields.

---

## MEDIUM: `ActivityLogPage.tsx` Executive Auto-Promotion Duplicated

**Files**: `/components/ActivityLogPage.tsx` (line 35), `/components/TicketQueuePage.tsx` (line 23)
**What**: Both files have identical logic: `const actualRole = effectiveDepartment === "Executive" ? "director" : effectiveRole;`
**Impact**: Works correctly but is duplicated logic that should be centralized.
**Fix**: Move to `useUser.tsx` as a computed value, or into a shared utility.

---

## MEDIUM: `NeuronSidebar.tsx` Activity Log Check is Redundant

**File**: `/components/NeuronSidebar.tsx`
**Line**: ~232
**What**: `if (isManager || currentUser?.role === "director")` — `isManager` already includes directors (line 132: `const isManager = effectiveRole === 'manager' || effectiveRole === 'director'`).
**Impact**: No functional bug, just confusing redundant code.
**Fix**: Simplify to `if (isManager)`.

---

## MEDIUM: `LoginPage` Still References `projectId` in Debug

**File**: `/App.tsx`
**Line**: ~80
**What**: `setDebugInfo(\`Calling signUp for ${email} against project ${projectId}...\`);` — references `projectId` which is imported but only used for this debug message.
**Impact**: No functional bug, but leaves an unnecessary import.
**Fix**: Remove the `projectId` import and simplify the debug message, or keep it as-is (harmless).

---

## MEDIUM: `useUser.tsx` Fallback Temp Profile on Signup

**File**: `/hooks/useUser.tsx`
**Lines**: ~293-305
**What**: If `fetchUserProfile()` returns null after signup (trigger hasn't fired yet), a temp `User` object is created with `id: 'user-' + data.user?.id?.substring(0, 8)`. This matches the trigger's ID generation (`'user-' || substr(NEW.id::text, 1, 8)`) — but if the trigger is slow, the app briefly uses this temp object, then the `onAuthStateChange` listener fires and fetches the real profile.
**Impact**: Brief flash of temp profile data. No lasting bug.
**Fix**: Increase the delay from 1000ms, or add a retry loop for `fetchUserProfile()`.

---

## LOW: Stale Context Files

**Files**: `/context/CURRENT_STATE.md`, `/context/ARCHITECTURE_AND_PATTERNS.md`, `/context/CLAUDE_CODE_INSTRUCTIONS.md`
**What**: These reference the KV store era, mock auth, and Edge Function patterns that are no longer accurate.
**Impact**: New AI sessions may get confused by contradictory instructions.
**Fix**: Either delete these files or add a deprecation notice pointing to the new `HANDOFF_*.md` files. Key outdated claims:
- "Database: KV store" → now 35 relational tables
- "Mock login, any email/password works" → now real Supabase Auth
- "Don't create new SQL tables or migration files — use the KV store" → now the KV store is dead, relational is the only path
- "No DDL/migration files" → migrations 001-003 exist and are critical
- Server import patterns → Edge Function is dead, use direct client

---

## LOW: `useNeuronCache.tsx` Not Used for Supabase Queries

**File**: `/hooks/useNeuronCache.tsx`
**What**: Client-side caching layer that was built for the Edge Function fetch pattern. It wraps `fetch()` calls.
**Impact**: When migrating to direct Supabase queries, this cache layer isn't used. Could lead to more round-trips than necessary.
**Fix**: Either adapt the cache layer to wrap Supabase queries, or build caching into the shared hooks (e.g., `useSupabaseQuery` with `staleTime`). Not urgent — Supabase client has its own connection pooling.

---

## LOW: `fetchWithRetry.ts` Not Applicable to Direct Queries

**File**: `/utils/fetchWithRetry.ts`
**What**: Retry wrapper for `fetch()` calls with exponential backoff. Used by some components.
**Impact**: Won't work with Supabase client queries (different API surface).
**Fix**: Not needed — the Supabase client handles retries at the connection level. Components can add their own retry logic if needed.

---

## Summary Table

| # | Severity | Description | Files |
|---|---|---|---|
| 1 | CRITICAL | All Edge Function fetch calls 404 | ~53 files |
| 2 | CRITICAL | `permissions.ts` wrong department codes | `permissions.ts` |
| 3 | HIGH | `Admin.tsx` wrong role values | `Admin.tsx` |
| 4 | HIGH | `Admin.tsx` missing department selector | `Admin.tsx` |
| 5 | HIGH | `EmployeesList.tsx` wrong role check | `EmployeesList.tsx` |
| 6 | HIGH | No seed data in tables | Supabase project |
| 7 | MEDIUM | EVoucher uses department as role | `EVoucherWorkflowPanel.tsx` |
| 8 | MEDIUM | Executive auto-promotion duplicated | `ActivityLogPage.tsx`, `TicketQueuePage.tsx` |
| 9 | MEDIUM | Sidebar redundant role check | `NeuronSidebar.tsx` |
| 10 | MEDIUM | Debug message references projectId | `App.tsx` |
| 11 | MEDIUM | Temp profile on slow trigger | `useUser.tsx` |
| 12 | LOW | Stale context files | `/context/*.md` |
| 13 | LOW | Cache layer not adapted | `useNeuronCache.tsx` |
| 14 | LOW | fetchWithRetry not applicable | `fetchWithRetry.ts` |
