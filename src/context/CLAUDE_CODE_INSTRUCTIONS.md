# Instructions for Claude Code

## First Steps When Starting a Session

1. **Read the handoff files first** (in this order):
   - `/context/HANDOFF_CURRENT_SITUATION.md` — what's working, what's broken, priorities
   - `/context/HANDOFF_KNOWN_BUGS.md` — every known bug with exact file locations
   - `/context/HANDOFF_MIGRATION_GUIDE.md` — how to migrate Edge Function calls to direct Supabase
2. **Then read these for architecture context**:
   - `/context/PROJECT_OVERVIEW.md` — what Neuron OS is, tech stack, design system
   - `/context/MODULE_MAP.md` — all modules and their key files
   - `/context/ARCHITECTURE_AND_PATTERNS.md` — patterns and conventions (NOTE: backend section is stale — ignore KV store references, the database is now relational)
   - `/docs/USER_ROLE_ARCHITECTURE.md` — full role/department dependency map with taxonomy conflicts
3. If the user mentions a feature or blueprint, read the relevant file in `/docs/blueprints/` before doing anything
4. If the user asks you to modify a file listed in "Files That Require Re-Reading" (see `WORKING_CONVENTIONS.md`), **always read it first**

## Critical Context (March 2026)

### Database is Relational (Not KV)
The old context files reference a KV store. That's DEAD. The database is now 35 relational tables with:
- Schema: `/supabase/migrations/001_full_schema.sql`, `002_schema_adjustments.sql`, `003_supabase_auth.sql`
- Direct client: `/utils/supabase/client.ts` (`import { supabase } from '../utils/supabase/client'`)
- RLS policies: Phase 1 permissive (authenticated = full access)

### Auth is Real (Not Mock)
The old context files say "mock login." That's DEAD. Auth is now real Supabase Auth:
- `supabase.auth.signUp()` / `signInWithPassword()` in `/hooks/useUser.tsx`
- Auto-profile trigger creates `users` row on signup
- Sessions persist via JWT with auto-refresh

### Edge Function is Dead
The Edge Function `make-server-c142e950` does NOT exist on the current Supabase project. ALL ~50+ frontend fetch calls 404. The migration path is to replace each with `supabase.from('table').select()` calls. See `/context/HANDOFF_MIGRATION_GUIDE.md`.

### User Role Taxonomy is Broken
Multiple parts of the codebase use different strings for the same concepts:
- `permissions.ts`: `"BD"`, `"PD"`, `"Finance"` (WRONG)
- `Admin.tsx`: `"Employee"`, `"President"` (WRONG)
- Canonical values: departments = `'Business Development' | 'Pricing' | 'Operations' | 'Accounting' | 'Executive' | 'HR'`, roles = `'rep' | 'manager' | 'director'`
- Full analysis: `/docs/USER_ROLE_ARCHITECTURE.md`

## Development Workflow

This project uses a **blueprint-driven** process:

1. **Discuss** the feature with the user
2. **Create or update** a blueprint in `/docs/blueprints/` with phased implementation plan
3. **Wait for "Go Ahead"** before writing any code
4. **Implement** one phase at a time
5. **Update the blueprint** after each phase with completion status and notes
6. **Summarize** what was done and suggest next steps

## Technical Environment

### This is a Figma Make project
- Frontend files are transpiled by the Figma Make environment
- **Cannot deploy Edge Functions** — only frontend code is deployable
- Tailwind v4.0 (no `tailwind.config.js` — config in `/styles/globals.css`)
- The server code in `/supabase/functions/server/` is REFERENCE ONLY

### Key Import Patterns
```tsx
// Direct Supabase client (USE THIS for all data operations)
import { supabase } from "./utils/supabase/client";

// Toasts
import { toast } from "sonner@2.0.3";

// Routing (NOT react-router-dom)
import { BrowserRouter, Routes, Route, useNavigate } from "react-router";

// App mode
import { useAppMode } from "./config/appMode";

// User context
import { useUser } from "./hooks/useUser";
```

### Data Fetching Pattern (New — Direct Supabase)
```tsx
import { supabase } from "../utils/supabase/client";

// Fetch
const { data, error } = await supabase.from('customers').select('*');

// Fetch with joins
const { data, error } = await supabase.from('bookings')
  .select('*, projects(project_number), customers(name)')
  .eq('project_id', projectId);

// Create
const { data, error } = await supabase.from('customers').insert(payload).select().single();

// Update
const { data, error } = await supabase.from('customers').update(payload).eq('id', id);

// Delete
const { error } = await supabase.from('customers').delete().eq('id', id);
```

### JSONB Details Merge
Tables with overflow columns (quotations, projects, bookings, evouchers) store extra fields in a `details` JSONB column. When reading, merge it:
```tsx
const { data } = await supabase.from('quotations').select('*').eq('id', id).maybeSingle();
const merged = { ...data?.details, ...data };
```

## Critical Patterns to Preserve

1. **CustomDropdown portal pattern** — uses `createPortal` to `document.body`, `position: fixed`, `zIndex: 9999`. Don't change this.
2. **Unified tab components** — `UnifiedBillingsTab`, `UnifiedExpensesTab`, `UnifiedInvoicesTab`, `UnifiedCollectionsTab` are shared across many views.
3. **Quotation/Contract duality** — quotations and contracts share the same table (`quotations`). Distinguished by `quotation_type: "contract"`.
4. **Service type from booking prefix** — `ContractDetailView.tsx` infers service type from booking ID prefix (FWD-, BRK-, TRK-, MI-, OTH-).
5. **Neuron design system** — stroke-based borders (not shadows), green palette, Inter font, 13px body text.

## Protected Files (NEVER modify)

- `/components/figma/ImageWithFallback.tsx`
- `/supabase/functions/server/kv_store.tsx`
- `/utils/supabase/info.tsx`

## Things to Avoid

- Don't try to deploy or call the Edge Function — it doesn't exist on this project
- Don't create a new Edge Function — the path is direct Supabase client queries
- Don't use `react-router-dom` — use `react-router`
- Don't use `react-resizable` — use `re-resizable`
- Don't import sonner without version — must be `import { toast } from "sonner@2.0.3"`
- Don't add shadows where borders are expected (Neuron design system preference)
- Don't duplicate Unified tab component UI — always reuse them with props
- Don't leak `SUPABASE_SERVICE_ROLE_KEY` to the frontend
