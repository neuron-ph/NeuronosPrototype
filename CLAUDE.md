# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Summary

**Neuron OS** — a desktop web app for asset-light freight forwarding SMEs in the Philippines. Manages the full business lifecycle: sales → quotations → contracts → operations bookings → accounting (billings, expenses, invoices, collections) → HR → executive reporting.

Development is now fully local with Claude Code. No Figma Make. All data access goes through the Supabase JS client directly. Edge Functions are reserved for operations that cannot be done from the frontend client (see below).

## Branch & Deployment Workflow

| Branch | Vercel Environment | Supabase |
|---|---|---|
| `dev` | Preview deployment | `oqermaidggvanahumjmj` (dev/staging) |
| `main` | Production deployment | `ubspbukgcxmzegnomlgi` (prod) |

- **Always develop and commit on `dev`** — pushing to `dev` triggers a Vercel preview build against the dev Supabase
- **Never commit directly to `main`** — it is production
- **To release to prod**: merge `dev → main` and push — always confirm with Marcus before doing this
- Vercel env vars are scoped per environment: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set to the dev instance for Preview, and the prod instance for Production

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
| Backend | Supabase — Postgres + Auth + RLS (direct client; Edge Functions only when necessary) |
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

1. Wait for explicit "Go Ahead" before writing code
2. Check `AGENT_COORDINATION.md` in the project root when Marcus says "check the board." Claim tasks before starting them, update when done, and leave messages for Claude if needed.

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

## Context Navigation — Use Dora First

Before reading any file, use dora to navigate without burning tokens:

```bash
dora symbol useUser              # find symbol definition + exact location
dora refs CustomDropdown         # see all 60 import sites before touching it
dora file src/App.tsx            # see all 33 deps — know what's safe to change
dora docs search "billing"       # search doc content without reading files
dora query "SELECT ..."          # custom SQL against the code index
```

Still-valid context files in `/src/context/`:
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

## Edge Functions — Use Only When Necessary

Default to `supabase.from()` for all data operations. Only reach for an Edge Function when the operation **requires server-side privileges** that cannot be done from the frontend client. Approved use cases:

- **Admin auth operations** — creating users with a set password (`auth.admin.createUser`), deleting auth accounts, etc. These require the `SUPABASE_SERVICE_ROLE_KEY`, which must never be exposed to the frontend.

Do not write a new Edge Function for anything achievable with the Supabase JS client and RLS.

## Things to Avoid

- Don't use `apiFetch`, `fetchWithRetry`, or `API_URL` — migration to `supabase.from()` is complete
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
