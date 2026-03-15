# Handoff: Current Situation (March 14, 2026)

> **This supersedes `/context/CURRENT_STATE.md`** which is stale (written March 3, pre-auth).
> Read this FIRST before doing anything.

---

## TL;DR

Neuron OS is a ~250-file React freight forwarding app. The backend was fully rewired from KV store to a 35-table relational Supabase schema (all 13 phases DONE). Real Supabase Auth is wired up (migration 003). But **the Edge Function `make-server-c142e950` only exists on the OLD Supabase project** (`effhfendfrmgnuqgvehr`), NOT the current one (`ubspbukgcxmzegnomlgi`). This means **~50+ frontend fetch calls are broken** — they 404 because the function doesn't exist on the active project. We cannot deploy Edge Functions from Figma Make.

The fix path is to **migrate all frontend fetch calls to direct Supabase client queries** (`supabase.from('table').select()`), bypassing the Edge Function entirely. Two calls have already been migrated (`fetchUserProfile` and `signup` in `useUser.tsx`). The remaining ~50+ are the main body of work.

---

## What's Actually Working Right Now

### Auth Flow
- **Supabase Auth signup/login**: Real `supabase.auth.signUp()` and `signInWithPassword()` — working
- **Auto-profile trigger**: `handle_new_auth_user()` fires on signup, creates a `users` row — working
- **Profile fetch**: `fetchUserProfile()` in `useUser.tsx` uses `supabase.from('users').select('*').eq('auth_id', uid)` — working
- **Signup with role**: Department/role/service_type/operations_role are written to the users row after signup — working
- **Session persistence**: Supabase Auth handles JWT refresh automatically — working
- **Dev role override**: `EmployeeProfile.tsx` lets you switch department/role for testing — working

### Schema
- **35 relational tables** with proper FKs, indexes, and constraints (migrations 001 + 002)
- **RLS policies**: Phase 1 permissive (authenticated = full access for all tables, except users table which has role-scoped UPDATE/DELETE)
- **Helper functions**: `get_my_profile_id()`, `get_my_role()`, `get_my_department()` — all working
- **Auth bridge**: `users.auth_id UUID` column links to `auth.users.id`

### Frontend Shell
- Sidebar navigation (department-gated) — working
- Routing (~50 routes) — working
- Login/signup page with department+role selection — working
- Layout, theming, design system — all working

---

## What's Broken

### The Big One: All Edge Function Calls (~50+ Files)

Every frontend component that fetches data does so via:
```typescript
const API_URL = `https://${projectId}.supabase.co/functions/v1/make-server-c142e950`;
const response = await fetch(`${API_URL}/customers`, { headers: { Authorization: `Bearer ${publicAnonKey}` } });
```

This returns **404** because the function doesn't exist on project `ubspbukgcxmzegnomlgi`.

**Impact**: Every module is broken — BD, Pricing, Operations, Accounting, Projects, Contracts, Tickets, Activity Log, Admin, Reports. Nothing loads. The app authenticates fine but shows empty states or loading spinners everywhere.

**Fix**: See `/context/HANDOFF_MIGRATION_GUIDE.md` for the full migration plan.

### Role/Department Taxonomy Mismatches

Detailed in `/docs/USER_ROLE_ARCHITECTURE.md`. Summary:
- `permissions.ts` uses `"BD"/"PD"/"Finance"` but real values are `"Business Development"/"Pricing"/"Accounting"` — **permission checks silently fail**
- `Admin.tsx` uses `"Employee"/"President"` roles but schema has `"rep"/"manager"/"director"` — **admin panel broken**
- `EmployeesList.tsx` checks `userRole === "Admin"` — **never matches**

### Seed Data Not Loaded

The seed endpoints (`/users/seed`, `/partners/seed`, etc.) existed on the Edge Function. Since it's gone, there's no seed data in the relational tables. Options:
1. Run seed SQL directly in Supabase SQL Editor
2. Migrate the seed_data.tsx file's insert logic to a one-off script
3. Create seed data manually via the app's UI (once the fetch calls are migrated)

---

## Supabase Project Details

| Key | Value |
|---|---|
| **Project ID** | `ubspbukgcxmzegnomlgi` |
| **URL** | `https://ubspbukgcxmzegnomlgi.supabase.co` |
| **Anon Key** | In `/utils/supabase/info.tsx` |
| **Direct Client** | `/utils/supabase/client.ts` — `createClient(url, anonKey)` |
| **Migrations Applied** | 001 (schema), 002 (adjustments), 003 (auth + RLS) |
| **Old Project (dead)** | `effhfendfrmgnuqgvehr` — had the Edge Function, no longer active |

---

## File Organization (Key Directories)

```
/App.tsx                          — Entry point, ~1200 lines (routing + login page)
/hooks/useUser.tsx                — Auth context (RECENTLY REWRITTEN — direct Supabase)
/utils/supabase/client.ts         — Direct Supabase client (USE THIS for all queries)
/utils/supabase/info.tsx          — Project ID + anon key (PROTECTED, don't edit)
/utils/permissions.ts             — RBAC checks (BROKEN taxonomy — needs fix)
/constants/                       — Needs roles.ts (canonical department/role values)
/supabase/migrations/             — 001, 002, 003 SQL files
/supabase/functions/server/       — Edge Function code (REFERENCE ONLY — cannot deploy)
/docs/USER_ROLE_ARCHITECTURE.md   — Full role dependency analysis
/docs/blueprints/RELATIONAL_REWIRE_BLUEPRINT.md — Server-side migration (DONE)
```

---

## Priority Order for Unblocking

1. **Create `/constants/roles.ts`** — canonical types so all code agrees on department/role values
2. **Create shared `useSupabaseQuery` or per-entity hooks** — replace Edge Function fetches with `supabase.from().select()`
3. **Migrate CRM fetches first** (customers, contacts, users) — unblocks BD and Pricing modules
4. **Fix `permissions.ts`** — use canonical department names
5. **Fix `Admin.tsx`** — use canonical role values + add department selector
6. **Migrate remaining modules** incrementally (Operations, Accounting, Tickets, Reports)

---

## What NOT to Do

- **Don't try to deploy the Edge Function** — Figma Make can't deploy to Supabase Edge Functions
- **Don't create a new Edge Function** — the migration path is direct client queries
- **Don't modify `/utils/supabase/info.tsx`** — it's auto-generated and protected
- **Don't modify `/supabase/functions/server/kv_store.tsx`** — protected reference file
- **Don't use `react-router-dom`** — use `react-router` (different package in this env)
- **Don't use `react-resizable`** — use `re-resizable`
- **Don't import sonner without version** — must be `import { toast } from "sonner@2.0.3"`
