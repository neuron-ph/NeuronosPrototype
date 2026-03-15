╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ User Roles Architecture — Complete Fix Plan                                                                                                                                                                                                 Context                                                                                                                                                                                                                                     The Neuron OS user role system has drifted across 3 layers (frontend, server, database) and accumulated 6 classes of   defects:                                                                                                                                                                                                                                   1. Taxonomy fragmentation — 4 different sets of role/dept values in use simultaneously. Several components silently   fail their permission checks because they compare against values that can never match.                                2. Auth layer mismatch — useUser.tsx already uses Supabase Auth (JWT-based), but the Hono server still validates via   a plaintext /auth/login endpoint, and role/dept is passed as client-supplied query params — trivially spoofable.     3. Server-wide exposure — Zero auth middleware: all 100+ API endpoints are publicly accessible. Three destructive     DELETE endpoints can wipe entire tables with a single unauthenticated curl command.                                   4. Unused permission system — permissions.ts defines actions but is never imported by any component. The EVoucher     workflow and Budget Request approval buttons are permanently hidden (compare against "Treasury", "Accountant",       
 "Finance Manager" — none are real role values).
 5. No route guards — The sidebar hides links but /accounting/transactions is accessible to any authenticated user    
 who types the URL.
 6. Database has no enforcement — users.department and users.role are free-text TEXT columns. Nothing prevents        
 storing invalid values. Two dead columns (permissions TEXT[] always {}, password TEXT used only by the obsolete      
 custom login) remain.

 ---
 Canonical Taxonomy (Source of Truth: src/hooks/useUser.tsx)

 department: 'Business Development' | 'Pricing' | 'Operations' | 'Accounting' | 'Executive' | 'HR'
 role:       'rep' | 'manager' | 'director'
 // Operations sub-fields:
 service_type:    'Forwarding' | 'Brokerage' | 'Trucking' | 'Marine Insurance' | 'Others'
 operations_role: 'Manager' | 'Supervisor' | 'Handler'

 Role hierarchy: rep (1) < manager (2) < director (3). Executive department auto-promotes to director privileges      
 everywhere.

 ---
 Phase 1 — Fix Taxonomy Mismatches (Frontend Only, No DB/Server Changes)

 All 6 components below have broken permission logic today. This phase makes them functional for the first time.      

 Files to modify:

 src/utils/permissions.ts
 - Change type Department = "BD" | "PD" | "Finance" | "Admin" to use canonical names: "Business Development" |        
 "Pricing" | "Accounting" | "Executive"
 - All "BD" → "Business Development", "PD" → "Pricing", "Finance" → "Accounting", "Admin" → "Executive" in every      
 permission map
 - Add role: 'rep' | 'manager' | 'director' parameter to each function; add || role === 'director' override so        
 directors always pass
 - Add canAccessModule(dept, role, module) and hasMinRole(role, minRole) helpers (see target architecture in
 USER_ROLE_ARCHITECTURE.md §4.2)

 src/components/accounting/EVoucherDetailView.tsx — lines 42-45
 - Replace custom roles ("Manager", "Treasury", "Accountant", "Auditor") with canonical checks:
 const isAcctMgr = dept === 'Accounting' && (role === 'manager' || role === 'director');
 const isAcctRep = dept === 'Accounting' && role === 'rep';
 const isAcctDir = dept === 'Accounting' && role === 'director';
 canApprove  = evoucher.status === 'Under Review' && isAcctMgr;
 canDisburse = evoucher.status === 'Approved'     && isAcctMgr;
 canRecord   = evoucher.status === 'Disbursed'    && isAcctRep;
 canAudit    = evoucher.status === 'Recorded'     && isAcctDir;

 src/components/bd/BudgetRequestDetailPanel.tsx — lines 40-41
 - Replace role === "Finance Manager" || role === "Accountant" with:
 canApprove = (dept === 'Accounting' && (role === 'manager' || role === 'director')) || dept === 'Executive';

 src/components/Admin.tsx
 - Remove local User interface with role: "Employee" | "President"
 - Import canonical User from useUser.tsx
 - Replace role <select> options with rep / manager / director
 - Add department <select> with 6 canonical options
 - Add conditional service_type + operations_role fields when department = Operations (same pattern as App.tsx signup 
  form)

 src/components/hr/EmployeesList.tsx
 - Remove import { UserRole } from '../Login' (legacy type)
 - Change userRole: UserRole prop to userRole: 'rep' | 'manager' | 'director'
 - Change userRole === "Admin" check (line ~390) to userRole === "director"
 - Update all call sites to pass effectiveRole from useUser()

 src/components/crm/ContactsListWithFilters.tsx + CustomersListWithFilters.tsx + pricing variants
 (QuotationFileView.tsx, QuotationsListWithFilters.tsx, StatusChangeButton.tsx)
 - Change prop type from "BD" | "PD" to 'Business Development' | 'Pricing'
 - Change all internal === "BD" checks to === "Business Development", === "PD" to === "Pricing"
 - Update callers in BusinessDevelopment.tsx (pass "Business Development") and Pricing.tsx (pass real department from 
  effectiveDepartment)

 ---
 Phase 2 — useUsers Hook (Kill Edge Function User Fetches)

 Creates one reusable pattern for all user-picker dropdowns. Uses direct Supabase queries (JWT-authenticated) instead 
  of the unauthenticated Edge Function.

 New file: src/hooks/useUsers.ts

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

 Internal: supabase.from('users').select('id,name,email,...').eq('is_active', true) + conditional filters for each    
 option. Returns an empty array until enabled !== false.

 Files that get their fetch blocks replaced:

 ┌──────────────────────────────┬────────────────────────────────────────────────┬───────────────────────────────┐    
 │             File             │                Current Pattern                 │          Replacement          │    
 ├──────────────────────────────┼────────────────────────────────────────────────┼───────────────────────────────┤    
 │                              │ fetch(\${API_URL}/users?department=Business    │ useUsers({ department:        │    
 │ AddCustomerPanel.tsx         │ Development`)`                                 │ 'Business Development',       │    
 │                              │                                                │ enabled: isOpen })            │    
 ├──────────────────────────────┼────────────────────────────────────────────────┼───────────────────────────────┤    
 │ AddContactPanel.tsx          │ Same                                           │ Same                          │    
 ├──────────────────────────────┼────────────────────────────────────────────────┼───────────────────────────────┤    
 │                              │ 3 sequential fetch calls (manager, supervisor, │ 3 parallel hook calls with    │    
 │ TeamAssignmentForm.tsx       │  handler)                                      │ service_type +                │    
 │                              │                                                │ operations_role filters       │    
 ├──────────────────────────────┼────────────────────────────────────────────────┼───────────────────────────────┤    
 │                              │                                                │ useUsers({ department:        │    
 │ ActivityLogPage.tsx          │ fetchUsersInDepartment() inside a callback     │ departmentFilter, enabled:    │    
 │                              │                                                │ departmentFilter !== 'all' }) │    
 ├──────────────────────────────┼────────────────────────────────────────────────┼───────────────────────────────┤    
 │ ContactsListWithFilters.tsx  │ manual fetch on mount                          │ useUsers({ department:        │    
 │                              │                                                │ 'Business Development' })     │    
 ├──────────────────────────────┼────────────────────────────────────────────────┼───────────────────────────────┤    
 │ CustomersListWithFilters.tsx │ Same                                           │ Same                          │    
 └──────────────────────────────┴────────────────────────────────────────────────┴───────────────────────────────┘    

 Remove all local BackendUser interface definitions and API_URL constants in these files.

 ---
 Phase 3 — Server JWT Middleware + Remove Custom Login

 Closes the critical identity gap: the server verifies WHO is calling rather than trusting client-supplied params.    

 supabase/functions/server/index.tsx changes:

 Add JWT middleware (after CORS, before any route):
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

 supabase.auth.getUser(jwt) works with the service role client by passing the JWT string directly — no second env     
 variable needed.

 Replace query-param identity reads in these handlers:
 - /auth/me — replace c.req.query("user_id") with c.get('callerId')
 - Ticket filter endpoint — replace c.req.query("role"/"department"/"user_id") with context values
 - Activity log endpoint — same replacement
 - Grep for all other instances: c.req.query("role") and c.req.query("department")

 Note: Query params used for data filtering (e.g., ?department=Operations on GET /users) are not identity claims and  
 are kept as-is.

 Protect destructive endpoints (add role guard at top of each):
 if (c.get('callerRole') !== 'director') {
   return c.json({ success: false, error: 'Insufficient permissions' }, 403);
 }
 Apply to: DELETE /auth/clear-users, DELETE /seed/clear, DELETE /customers/clear, DELETE /contacts/clear, DELETE      
 /vendors/clear, POST /users/seed.

 Remove POST /auth/login (lines 89-119) — frontend already uses supabase.auth.signInWithPassword() exclusively.       
 Confirm no frontend file calls /auth/login (grep shows zero hits), then delete the handler.

 Restrict CORS:
 cors({ origin: Deno.env.get('FRONTEND_ORIGIN') || 'http://localhost:5173', ... })

 New file: src/utils/api.ts

 Centralizes the JWT-forwarding fetch wrapper:
 export async function apiFetch(path: string, options: RequestInit = {}) {
   const { data: { session } } = await supabase.auth.getSession();
   return fetch(`${BASE_URL}${path}`, {
     ...options,
     headers: {
       'Content-Type': 'application/json',
       'Authorization': `Bearer ${session?.access_token ?? ''}`,
       ...options.headers,
     },
   });
 }

 Replace all fetch(\${API_URL}/...`, { headers: { Authorization: `Bearer ${publicAnonKey}` }})calls in the frontend   
 withapiFetch('/...')`. This is widespread — approximately 40-60 call sites across components. Do it in batches by    
 module.

 Fix isAuthenticated in src/hooks/useUser.tsx

 Change line 373: isAuthenticated: !!user → isAuthenticated: !!user && !!session

 This prevents users with expired JWTs from appearing authenticated (cached localStorage user without live session).  

 ---
 Phase 4 — Frontend Route Guards

 Prevents URL-bar access to restricted modules.

 New file: src/components/RouteGuard.tsx

 interface RouteGuardProps {
   children: ReactNode;
   allowedDepartments?: User['department'][];
   requireMinRole?: User['role'];
 }

 Logic: Executive department always passes. Check allowedDepartments contains effectiveDepartment. Check role
 hierarchy using { rep: 0, manager: 1, director: 2 }[effectiveRole] >= minLevel. On failure: call
 navigate('/dashboard') in a useEffect.

 Apply in src/App.tsx

 Wrap route groups using department rules from the existing sidebar logic:
 - /bd/* → allowedDepartments: ['Business Development']
 - /pricing/* → allowedDepartments: ['Pricing']
 - /operations/* → allowedDepartments: ['Operations']
 - /accounting/* → allowedDepartments: ['Accounting']
 - /hr/* → allowedDepartments: ['HR']
 - /activity-log → requireMinRole: 'manager'
 - /ticket-queue → requireMinRole: 'manager'

 ---
 Phase 5 — Database Cleanup & Enforcement

 New file: src/supabase/migrations/004_role_constraints.sql

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

 ---
 Phase 6 — Phase 2 RLS: Scoped Access Policies (Future)

 New file: src/supabase/migrations/005_phase2_rls.sql

 Do not apply until Phase 3 is deployed and stable. RLS only affects frontend direct-Supabase queries; the server's   
 service-role key bypasses it until Phase 7.

 Key policies:
 - customers / contacts — BD can CRUD; Pricing, Operations, Accounting can SELECT; HR cannot read
 - evouchers / invoices / journal_entries — Accounting CRUD; other depts SELECT
 - quotations — BD creates/reads; Pricing prices/sends; others SELECT
 - activity_log — directors SELECT all; managers SELECT WHERE user_department = get_my_department(); reps SELECT      
 WHERE user_id = get_my_profile_id()
 - tickets — directors SELECT all; managers SELECT WHERE to_department = get_my_department(); reps SELECT WHERE       
 created_by = get_my_profile_id()

 ---
 Phase 7 — Dead Code Cleanup (Can Run in Parallel)

 supabase/functions/server/index.tsx:
 - Remove import * as kv from "./kv_store_robust.tsx" (line 5)
 - Delete the commented-out legacy KV block (lines ~5090-5219)

 src/components/Login.tsx:
 - Remove export type UserRole = "Operations" | "Accounting" | "HR" | "Admin" — after Phase 1 fixes
 EmployeesList.tsx, this type has no callers

 index.tsx seed endpoint (lines 218+):
 - Remove password: "password123" from all seed user objects — will cause insert failures once Phase 5 drops the      
 password column

 ---
 File Change Summary

 ┌──────────────────────────────────────────────────────┬───────┬─────────────────────────────────────────────────┐   
 │                         File                         │ Phase │                   Change Type                   │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/utils/permissions.ts                             │ 1     │ Rewrite — fix department names, add role param  │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/components/accounting/EVoucherDetailView.tsx     │ 1     │ Fix 4 broken role checks                        │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/components/bd/BudgetRequestDetailPanel.tsx       │ 1     │ Fix approval gate                               │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/components/Admin.tsx                             │ 1     │ Fix roles, add department selector              │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/components/hr/EmployeesList.tsx                  │ 1     │ Fix Admin→director, remove Login.tsx type       │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/components/crm/ContactsListWithFilters.tsx       │ 1     │ Shortcode→canonical dept                        │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/components/crm/CustomersListWithFilters.tsx      │ 1     │ Same                                            │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/components/pricing/QuotationsListWithFilters.tsx │ 1     │ Same                                            │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/components/pricing/QuotationFileView.tsx         │ 1     │ Same                                            │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/components/pricing/StatusChangeButton.tsx        │ 1     │ Same                                            │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/components/BusinessDevelopment.tsx               │ 1     │ Update dept prop to canonical                   │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/components/Pricing.tsx                           │ 1     │ Update dept prop to canonical                   │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/hooks/useUsers.ts                                │ 2     │ New file                                        │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/components/accounting/AddCustomerPanel.tsx       │ 2     │ Replace fetch with useUsers hook                │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/components/bd/AddContactPanel.tsx                │ 2     │ Same                                            │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/components/pricing/TeamAssignmentForm.tsx        │ 2     │ Replace 3 fetches                               │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/components/ActivityLogPage.tsx                   │ 2     │ Replace fetchUsersInDepartment                  │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/components/crm/ContactsListWithFilters.tsx       │ 2     │ Replace fetch                                   │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/components/crm/CustomersListWithFilters.tsx      │ 2     │ Same                                            │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ supabase/functions/server/index.tsx                  │ 3     │ JWT middleware, remove /auth/login, protect     │   
 │                                                      │       │ destructives, fix CORS                          │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/utils/api.ts                                     │ 3     │ New file — JWT-forwarding fetch wrapper         │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/hooks/useUser.tsx                                │ 3     │ Fix isAuthenticated: !!user && !!session        │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ ~40-60 frontend components                           │ 3     │ Replace fetch(API_URL, { Authorization:         │   
 │                                                      │       │ publicAnonKey }) with apiFetch()                │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/components/RouteGuard.tsx                        │ 4     │ New file                                        │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/App.tsx                                          │ 4     │ Wrap routes with RouteGuard                     │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/supabase/migrations/004_role_constraints.sql     │ 5     │ New file — DB constraints                       │   
 ├──────────────────────────────────────────────────────┼───────┼─────────────────────────────────────────────────┤   
 │ src/supabase/migrations/005_phase2_rls.sql           │ 6     │ New file — scoped RLS                           │   
 └──────────────────────────────────────────────────────┴───────┴─────────────────────────────────────────────────┘   

 ---
 Verification

 After each phase, verify in this order:

 Phase 1: Open the EVoucher workflow as an Accounting user with role: "manager" → approve button should now appear.   
 Open BudgetRequest as Accounting manager → approve button should appear. Open Admin as director → role dropdown      
 shows rep/manager/director. Check EmployeesList admin actions visible for director.

 Phase 2: Open AddCustomerPanel → BD users dropdown populates without a network call to the Edge Function (check      
 DevTools → Network tab shows supabase.co/rest/v1/users, not the Edge Function URL).

 Phase 3: Use DiagnosticsPage.tsx and SupabaseDebug.tsx to verify login still works. Attempt to call DELETE
 /auth/clear-users with the anon key (no JWT) → should get 401. Attempt with a valid rep JWT → should get 403.        
 Attempt with director JWT → should succeed.

 Phase 4: Log in as an Accounting user. Navigate to /bd/contacts in the URL bar → should redirect to /dashboard.      

 Phase 5: Run the validation SELECT first. After applying constraints, attempt to create a user with role =
 "Employee" → should fail with constraint violation.

 Phase 6: Use SET LOCAL role = authenticated + SET LOCAL request.jwt.claims = ... in the Supabase SQL editor to test  
 RLS policies before deploying.