# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Summary

**Neuron OS** — a desktop web app for asset-light freight forwarding SMEs in the Philippines. Manages the full business lifecycle: sales → quotations → contracts → operations bookings → accounting (billings, expenses, invoices, collections) → HR → executive reporting.

Development is now fully local with Claude Code. No Figma Make. No Edge Functions. All data access goes through the Supabase JS client directly.

## Commands

```bash
npm run dev      # Start Vite dev server
npm run build    # Build for production
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript |
| Styling | Tailwind CSS v4.0 — **no `tailwind.config.js`**, config is in `/src/styles/globals.css` |
| UI Library | shadcn/ui (Radix UI) in `/src/components/ui/` |
| Icons | `lucide-react` (20px standard, 16px small, 24px headers) |
| Routing | `react-router` (NOT `react-router-dom`) |
| State | React hooks only — no Redux/Zustand |
| Backend | Supabase — Postgres + Auth + RLS (direct client, no Edge Functions) |
| Charts | Recharts |
| Toasts | `sonner@2.0.3` |
| Animations | `motion/react` |

## Key Import Patterns

```tsx
// All data operations — use this, never apiFetch or API_URL
import { supabase } from "../utils/supabase/client";

// User/auth context
import { useUser } from "../hooks/useUser";

// User picker dropdowns
import { useUsers } from "../hooks/useUsers";

// Toasts (version number is REQUIRED)
import { toast } from "sonner@2.0.3";

// Routing
import { useNavigate, useParams } from "react-router";
```

## Data Fetching Patterns

```tsx
// Fetch list
const { data, error } = await supabase.from('customers').select('*');

// Fetch with joins
const { data, error } = await supabase
  .from('bookings')
  .select('*, projects(project_number), customers(name)')
  .eq('project_id', projectId);

// Fetch single row
const { data } = await supabase.from('quotations').select('*').eq('id', id).maybeSingle();

// Tables with JSONB details column — merge details into the row
const merged = { ...data?.details, ...data };

// Create
const { data, error } = await supabase.from('customers').insert(payload).select().single();

// Update
const { data, error } = await supabase.from('customers').update(payload).eq('id', id);

// Delete
const { error } = await supabase.from('customers').delete().eq('id', id);
```

## Canonical Taxonomy

```
department:      'Business Development' | 'Pricing' | 'Operations' | 'Accounting' | 'Executive' | 'HR'
role:            'rep' | 'manager' | 'director'
service_type:    'Forwarding' | 'Brokerage' | 'Trucking' | 'Marine Insurance' | 'Others'  (Operations only)
operations_role: 'Manager' | 'Supervisor' | 'Handler'  (Operations only)
```

Role hierarchy: rep (0) < manager (1) < director (2). Executive department auto-promotes to director privileges.

## Development Workflow

This project is **blueprint-driven**:
1. Read the relevant blueprint in `/src/docs/blueprints/` before any feature work
2. Create/update a blueprint with a phased plan
3. Wait for explicit "Go Ahead" before writing code
4. Implement one phase at a time, update the blueprint after each phase

## Protected Files (NEVER modify)

- `/src/components/figma/ImageWithFallback.tsx`
- `/src/utils/supabase/info.tsx`

## Critical Patterns

**CustomDropdown** (`/src/components/bd/CustomDropdown.tsx`): Uses `createPortal` to `document.body`, `position: fixed`, `zIndex: 9999`, scroll-repositioning (not closing). Never change this pattern.

**Unified tab components** — shared across Projects, Contracts, Bookings, and Aggregate views. Always reuse, never recreate:
- `UnifiedBillingsTab` — `/src/components/shared/billings/`
- `UnifiedExpensesTab` — `/src/components/accounting/`
- `UnifiedInvoicesTab` — `/src/components/shared/invoices/`
- `UnifiedCollectionsTab` — `/src/components/shared/collections/`

**Quotations vs Contracts**: Same `quotations` table, distinguished by `quotation_type: "spot" | "contract"`.

**Billing Items vs Invoices**: `billing_items` are line-item atoms; `billings` with `invoice_number` are invoice documents.

**DataTable**: Use `/src/components/common/DataTable.tsx` for all tables, not custom-built tables.

**Route Guards**: `/src/components/RouteGuard.tsx` wraps routes in `App.tsx` by department/role. Always use this for protected routes.

**JSONB details columns**: Tables like `quotations`, `projects`, `bookings`, `evouchers` store overflow fields in a `details` JSONB column. Always merge: `{ ...data?.details, ...data }`.

## Stale Context Files — Read With Caution

These files in `/src/context/` predate the Supabase migration and contain outdated information:

| File | What's stale |
|---|---|
| `ARCHITECTURE_AND_PATTERNS.md` | References KV store prefixes and Edge Function routes — all dead |
| `CURRENT_STATE.md` | Pre-auth snapshot from March 3 — completely obsolete |
| `HANDOFF_CURRENT_SITUATION.md` | Says "all data fetches 404" — that's fixed |
| `HANDOFF_KNOWN_BUGS.md` | Lists permissions.ts, Admin.tsx, EmployeesList bugs — all fixed |
| `HANDOFF_MIGRATION_GUIDE.md` | Describes how to do the migration — it's already done |

Still-valid context files:
- `MODULE_MAP.md` — module inventory, still accurate
- `WORKING_CONVENTIONS.md` — code style and DRY rules, still applies
- `PROJECT_OVERVIEW.md` — high-level domain overview, still useful

Authoritative post-migration doc:
- `/src/docs/handoff/Claude_Instructions_Handoff.md`

## Pending (Requires Manual Action in Supabase Dashboard)

These SQL migrations are written and ready but must be applied manually in the Supabase SQL Editor:
- `/src/supabase/migrations/004_role_constraints.sql` — canonical dept/role CHECK constraints
- `/src/supabase/migrations/005_rls_policies.sql` — full RLS enforcement
- `ALTER TABLE users DROP COLUMN IF EXISTS password;`

The dead Edge Function directory `/src/supabase/functions/server/` should also be deleted from the repo.

## Things to Avoid

- Don't use `apiFetch`, `fetchWithRetry`, or `API_URL` — migration to `supabase.from()` is complete
- Don't call or deploy Edge Functions — the path is direct Supabase client queries
- Don't use `react-router-dom` — use `react-router`
- Don't use `react-resizable` — use `re-resizable`
- Don't import sonner without version — must be `"sonner@2.0.3"`
- Don't add shadows where borders are expected (Neuron design system)
- Don't duplicate Unified tab component UI — always reuse with props
- Don't leak `SUPABASE_SERVICE_ROLE_KEY` to the frontend
- Don't create a `tailwind.config.js` — Tailwind v4 uses `@theme inline` in `globals.css`
- Don't create mock data when real Supabase tables exist

## Design Tokens

Colors: `#12332B` (primary text/ink), `#0F766E` (teal actions), `#667085` (muted text), `#E5E9F0` (borders), `#F9FAFB` (subtle backgrounds), `#FFFFFF` (elevated), `#F7FAF8` (page bg)

Font sizes: `text-[13px]` body, `text-[14px]` labels, `text-[32px]` page titles

Currency: `Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })`
