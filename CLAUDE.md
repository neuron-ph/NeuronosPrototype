# CLAUDE.md

**Neuron OS** — desktop web app for asset-light freight forwarding SMEs in the Philippines. Sales → quotations → contracts → operations → accounting → HR → executive reporting.

## Branch & Deployment

| Branch | Vercel | Supabase |
|---|---|---|
| `dev` | Preview | `oqermaidggvanahumjmj` (dev) |
| `main` | Production | `ubspbukgcxmzegnomlgi` (prod) |

- Always develop on `dev`. Never commit directly to `main`.

### "Release dev to prod" — Full Checklist

When Marcus says **"Release dev to prod"**, do ALL of these in order:

1. **Edge Functions** — compare every function in `supabase/functions/` against prod (via MCP). Redeploy any that differ.
2. **SQL migrations** — check `supabase/migrations/` for files not yet applied to prod. Surface them to Marcus before applying.
3. **Merge `dev → main`** and push.
4. **Tag the release** — `git tag stable/YYYY-MM-DD && git push origin stable/YYYY-MM-DD`.

Never do just the git merge alone — Edge Functions and DB schema don't move with git.

Rollback: `git checkout main && git reset --hard stable/YYYY-MM-DD && git push origin main --force` (confirm with Marcus first).

## Tech Stack

React 18 + TS, Tailwind v4 (config in `/src/styles/globals.css`, no `tailwind.config.js`), shadcn/ui, `react-router` (NOT `react-router-dom`), Supabase (direct client), Recharts, `sonner@2.0.3`, `motion/react`, `lucide-react`.

## Key Imports

```tsx
import { supabase } from "../utils/supabase/client";  // never apiFetch / API_URL
import { useUser } from "../hooks/useUser";
import { toast } from "sonner@2.0.3";  // version is REQUIRED
import { useNavigate, useParams } from "react-router";
```

JSONB `details` columns (quotations, projects, bookings, evouchers): always merge `{ ...data?.details, ...data }`.

## Edge Function Rules

Default to `supabase.from()`. Edge Functions only for server-side privileges (admin auth ops requiring `SUPABASE_SERVICE_ROLE_KEY`).

1. **Never edit Edge Functions in the Supabase dashboard.** Edit `supabase/functions/<name>/index.ts` locally, deploy via MCP/CLI.
2. **Use `verify_jwt: false` + manual auth inside the function.** Read Authorization header, decode JWT manually (`atob(jwt.split(".")[1])`), verify with admin client.
3. **Deploy to prod immediately after dev changes** — don't leave versions out of sync.

## Catalog Architecture (non-negotiable)

- No revenue line-item form may use free-text outside Billing Catalog (`side="revenue"`)
- No expense line-item form may use free-text outside Expense Catalog (`side="expense"`)
- No `billing_line_items` insert may omit `catalog_item_id`
- No `evoucher_line_items` insert may omit `catalog_item_id`
- Every catalog write must include `catalog_snapshot` from `buildCatalogSnapshot()` (`src/utils/catalogSnapshot.ts`)
- Categories come from `catalog_categories` table — never hardcode
- Usage counts via `get_catalog_usage_counts()` RPC — never manual

Components: `CatalogItemCombobox` (`src/components/shared/pricing/`), `CategoryDropdown` (`src/components/pricing/quotations/`).

## Critical Patterns

- **CustomDropdown** (`src/components/bd/CustomDropdown.tsx`) — `createPortal` to body, `position: fixed`, `zIndex: 9999`, scroll-reposition (don't close). Never change.
- **Unified tab components** — always reuse, never recreate: `UnifiedBillingsTab`, `UnifiedExpensesTab`, `UnifiedInvoicesTab`, `UnifiedCollectionsTab`.
- **Quotations vs Contracts**: same `quotations` table, `quotation_type: "spot" | "contract"`.
- **DataTable**: use `src/components/common/DataTable.tsx`, not custom tables.
- **RouteGuard**: use `src/components/RouteGuard.tsx` for protected routes.

## Protected Files (NEVER modify)

- `/src/components/figma/ImageWithFallback.tsx`
- `/src/utils/supabase/info.tsx`

## Things to Avoid

- `apiFetch`, `fetchWithRetry`, `API_URL` (migration complete)
- `react-router-dom` (use `react-router`), `react-resizable` (use `re-resizable`)
- `sonner` without version pin
- `tailwind.config.js` (Tailwind v4 uses `@theme inline` in `globals.css`)
- Mock data when real Supabase tables exist
- Leaking `SUPABASE_SERVICE_ROLE_KEY` to frontend
- `ChargeTypeCombobox` / `chargeTypeRegistry` (replaced by `CatalogItemCombobox`)

## Design Tokens

Colors: `#12332B` ink, `#0F766E` teal, `#667085` muted, `#E5E9F0` borders, `#F9FAFB` subtle bg, `#F7FAF8` page bg.
Font sizes: `text-[13px]` body, `text-[14px]` labels, `text-[32px]` titles.
Currency: `Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })`.

## Workflow

1. Wait for explicit "Go Ahead" before writing code.
2. Check `AGENT_COORDINATION.md` when Marcus says "check the board."
3. Use `dora` first for code search (`dora symbol`, `dora refs`, `dora file`, `dora docs search`).

## Karpathy Coding Principles

### 1. Think Before Coding
Don't assume. State assumptions; ask if uncertain. Present multiple interpretations rather than picking silently. Push back when a simpler approach exists.

### 2. Simplicity First
Minimum code that solves the problem. No speculative features, single-use abstractions, unrequested flexibility, or error handling for impossible scenarios. If 200 lines could be 50, rewrite.

### 3. Surgical Changes
Touch only what you must. Don't "improve" adjacent code or refactor things that aren't broken. Match existing style. Remove orphans YOUR changes created; don't delete pre-existing dead code unless asked. Every changed line should trace to the user's request.

### 4. Goal-Driven Execution
Transform tasks into verifiable goals ("Fix the bug" → "Write a test that reproduces it, then make it pass"). For multi-step work, state a brief numbered plan with verification per step.
