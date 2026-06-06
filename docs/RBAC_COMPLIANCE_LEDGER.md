# RBAC Compliance Ledger — NEU-012 burn-down list

**Companion to** [`RBAC_PRINCIPLE_IMPLEMENTATION_PLAN.md`](./RBAC_PRINCIPLE_IMPLEMENTATION_PLAN.md). This is the living checklist we burn down. Each row is a slice: bring it onto the grant model, verify UI↔DB agree for a granted **and** a non-granted user, check it off.

**Audit date:** 2026-06-04 · **Source:** live read-only queries of prod (`ubspbukgcxmzegnomlgi`) + dev (`oqermaidggvanahumjmj`).
**Status key:** ☐ todo · ◑ in progress · ☑ done (dev) · ✅ done (prod)

---

## Headline numbers (DB side)

| Bucket | Count | Meaning |
|---|---|---|
| **A. Grant model** ✅ | ~17 | Obeys the principle today |
| **B. Grant + leftover legacy** | ~20 | Works, but a redundant legacy policy OR's in — cleanup |
| **C. Legacy only** ❌ | ~27 | Decides by executive/manager/department — violates principle |
| **D. Wide open (policy = true)** ⚠️ | ~14 | Any authenticated user; no permission check |
| **E. RLS DISABLED entirely** 🔴 | 8 | No row security at all — most exposed |

Two findings beyond the original plan: **bucket E** (RLS switched off, not just permissive) and the **duplicate-profile data landmine** (below) — both are new from this audit.

---

## 🔴 Bucket E — RLS disabled entirely (highest priority)

These tables have `rowsecurity = OFF`. Policies don't even apply; any authenticated client can read/write freely. Both prod and dev unless noted.

| Table | Notes | Slice |
|---|---|---|
| `ticket_assignments` | support-ticket system, fully open | ☐ |
| `ticket_attachments` | " | ☐ |
| `ticket_messages` | " — message bodies open | ☐ |
| `ticket_participants` | " | ☐ |
| `ticket_read_receipts` | " | ☐ |
| `memos` | open | ☐ |
| `feedback` | open | ☐ |
| `exchange_rates` | open (low stakes — reference data, but writes should be gated) | ☐ |
| `__backup_quotations_pre_107` | **prod only** — leftover backup table; recommend DROP, not secure | ☐ |

> These need RLS **enabled** first, then a grant policy. Enabling RLS with no policy = deny-all, which can break features — so each is: enable RLS + add grant policy + verify, as one slice.

---

## ⚠️ Bucket D — Wide open to authenticated/public (no enforcement)

`using(true)` / `with check(true)` for `authenticated` or `public`. Priority order = exposure.

| Table | Open to | Stakes | Proposed module:action | Slice |
|---|---|---|---|---|
| `projects` | authenticated, full | **central object** | `ops_projects` / `bd_projects` / `pricing_projects` / `acct_projects` (lens per dept) + scope | ☐ |
| `project_bookings` | authenticated, full | project↔booking link | follows `projects` / `bookings` | ☐ |
| `transactions` | authenticated, full | financial ledger | `acct_*` (journal/coa) + scope | ☐ |
| `accounts` | authenticated, full | chart of accounts | `acct_coa` | ☐ |
| `catalog_items` | authenticated, full | catalog (data rules untouched) | `acct_catalog` (view broad, write gated) | ☐ |
| `catalog_categories` | authenticated, full | " | `acct_catalog` | ☐ |
| `contract_rate_versions` | **public**, full | rate cards | `pricing_contracts` / `acct_contracts` | ☐ |
| `journal_entries` | **dev only** wide-open (prod = legacy) | financial | `acct_journal` | ☐ |
| `category_templates` | authenticated (all 4 cmds) | pricing templates | `acct_catalog` / `pricing_*` | ☐ |
| `project_attachments` | authenticated, full | documents | follows `projects` | ☐ |
| `contact_attachments` | authenticated, full | documents | follows `contacts` | ☐ |
| `customer_attachments` | authenticated, full | documents | follows `customers` | ☐ |
| `saved_reports` | authenticated, full | reports | `acct_reports` / owner | ☐ |
| `settings` / `counters` | authenticated, full | infra/config | low stakes — likely read-broad, write-gated | ☐ |

> **Lockout risk:** turning these on denies anyone whose profile lacks the key. Each slice must first confirm current users' profiles actually grant it (coverage check) — fail loud in dev, never silently in prod.

---

## ❌ Bucket C — Legacy model (decides by executive/manager/department)

Functionally protected but by *identity*, not grant. Convert to grant model. (Prod; dev matches except where noted.)

contract_bookings · contract_activity · contract_attachments · budget_requests · comments · consignees · crm_activities · journal_entries *(prod)* · calendar_events · tickets · users · operational_services · org_settings · team_memberships · team_role_eligibilities · booking_assignments · assignment_profiles · assignment_profile_items · department_assignment_roles · service_assignment_roles · booking_service_catalog · booking_subservice_catalog · evoucher_history · activity_log · profile_insurers · profile_permits · profile_consolidators · profile_trucking_companies

> Some of these (team/assignment/service-role config, users) are admin-managed and may legitimately stay executive-gated — but that should be **expressed as a grant** (`exec_users`, `admin_*`), not a hardcoded `is_executive()`. Triage each in Phase 2.

---

## 🧹 Bucket B — Grant model + leftover legacy policy (cleanup)

These have a working grant policy **and** a redundant legacy `is_executive()`/manager `ALL` policy that OR's in (extra bypass, messy, can mask intent). Drop the legacy policy after confirming the grant policy covers the needed cases.

evouchers · profile_brokerage_types · profile_cargo_natures · profile_cargo_types · profile_container_types · profile_cpe_codes · profile_credit_terms · profile_customs_entries · profile_customs_entry_procedures · profile_examinations · profile_incoterms · profile_industries · profile_lead_sources · profile_modes · profile_movements · profile_package_types · profile_preferential_treatments · profile_selectivity_colors · profile_service_statuses · profile_truck_types

---

## ✅ Bucket A — Already compliant (grant model, no legacy)

No action except the resolver fix (Phase 1) flowing through. billing_line_items · bookings *(INSERT gap — Phase 1 / NEU-006)* · collections · contacts · customers · dispatch_people · expenses · invoices · quotations · tasks · trade_parties · vehicles · profile_carriers · profile_countries · profile_forwarders · profile_locations · service_providers

---

## 🧨 Data-layer landmine — duplicate active profiles (NEW, severe)

The resolver's role-default fallback consults **exactly one** profile per `(target_role, target_department)` — `updated_at DESC LIMIT 1`. Where multiple active profiles share that key, all but the newest are **silently ignored**. Live counts:

| dept · role | # active profiles | consequence |
|---|---|---|
| Operations · staff | **8** | per-service baselines (Forwarding/Brokerage/Trucking/Others) + custom roles (CUSTOMS DECLARANT, IMPORT DOC OFFICER ×2, LOGISTICS OFFICER) all collide — only newest is the role-default |
| Operations · team_leader | 6 (prod) / 5 (dev) | same collision |
| Operations · supervisor | 4 | same |
| Operations · manager | 4 | same |
| BD · manager / staff | 2 each | Baseline vs named profile collide |
| Pricing · manager / staff | 2 each | " |

**Why it matters:** `(department, role)` is **not a unique enough key for Operations** — service_type is the missing dimension. The per-service Operations baselines cannot coexist as role-defaults; the resolver picks one at random (newest). This means a user *without* an explicitly assigned profile gets an effectively random grant set.

**Mitigation today:** users with an explicit `applied_profile_id` (assigned profile) are fine — that path takes precedence over the role-default. The fragility is in the *fallback*. **Decision needed (Phase 1):** either (a) key role-defaults on `(dept, role, service)`, or (b) require every user to carry an explicit assigned profile and treat a missing one as fail-closed (not a random fallback).

---

## prod ↔ dev divergence

Near-identical on the grant/legacy classification. Known diffs:
- `journal_entries`: prod = legacy (4 policies); **dev = wide-open (1 ALL policy)**.
- Duplicate-profile counts differ slightly (Ops team_leader 6 vs 5).
- `__backup_quotations_pre_107`: prod only.

Full table-by-table policy-body diff still TODO before any "passed on dev → safe on prod" claim.

---

## App-side gates — triage complete (workflow `wf_4dd49d9a-b1a`)

**42 files · 146 sites → 46 permission-gates (convert) · 99 lens-routing (keep) · 1 unclear.** The 2-to-1 keep ratio confirms most `department ===` usage is legitimate lens-routing. The 46 gates collapse into **7 clusters**:

### Cluster 1 — E-Voucher workflow (~20 gates) — BIGGEST, = open Decision #2
All via `permissions.ts` `canPerformEVAction` / `canDeleteEVoucher` (pure role+dept, no `can()`):
- `EVoucherWorkflowPanel.tsx` — 9 (approve_tl, reject_tl, approve_ceo, reject_ceo, disburse, post_gl, unlock_posted, close_liquidation)
- `DisburseEVoucherPage.tsx` — 6 (approve_accounting/disburse + feeders + route guard)
- `MyEVouchersPage.tsx` — 4 (approval queue + dept-scope toggle)
- `AddRequestForPaymentPanel.tsx` — 1 (delete EV)
> The workflow *state* (status===pending_x) is legitimate and stays; only the *who* (role/dept) converts. **This is the hybrid decision: workflow gates the order, grant gates the who.** Likely needs new `acct_evouchers` action keys (approve / approve_ceo / disburse / post_gl / unlock_posted). ☐

### Cluster 2 — Booking-create (2 gates) — = NEU-006 / Phase 1 slice
- `ProjectBookingsTab.tsx:137,288` — `canPerformBookingAction("create_booking", dept)` → `can('ops_<service>','create')`. ☐

### Cluster 3 — Quotation status transitions (~11 gates, but ~3 logical) — `StatusChangeButton.tsx`
All derive from 3 flags: `isElevatedRole` (role===manager/executive bypass), `canActAsBD` (dept===BD), `canActAsPricing` (dept===Pricing) → `can('bd_inquiries','update')` / `can('pricing_quotations','update')`. Convert the 3 flags; the 8 per-status uses follow. ☐

### Cluster 4 — Owner / assignment gates (~7 gates) — needs an `assign` action?
- `ContactDetail.tsx:131,942` `canAssignOwner` → `can('bd_contacts','assign'|'edit')`
- `CustomerDetail.tsx:88` `canAssignOwner` → `can('bd_customers','edit')`
- `AddTaskPanel.tsx:23,27,270` + `TasksList.tsx:30` `canAssignToOthers` → `can('bd_tasks','assign')`
> **Schema question:** is there an `assign` action, or do we fold into `edit`? Decide before converting. ☐

### Cluster 5 — Admin-config edit gates (3 gates)
- `UserManagement.tsx:1119` `canEditRoleConfig` → `can('admin_users','edit')`
- `ServicesAndRolesPage.tsx:37` `isExec` → `can('admin_services_roles','update')` (module may not exist yet)
- `Settings.tsx:521` `canEditWorkspace` → `can('workspace_settings','update')` (module may not exist yet)
> These are exec-gated today; that's *fine as intent* but must be expressed as a grant, not `=== "Executive"`. ☐

### Cluster 6 — Sidebar exec/role bypass (3 gates) — `NeuronSidebar.tsx:357,438,440`
`isExecutive` shortcut + role-level (`ROLE_LEVEL`) gate on accounting `minRole` items → `can('accounting_financials','view')`. Removing collapses the whole `minRole`/`ROLE_LEVEL` machinery. ☐

### Cluster 7 — Role-based list self-scoping (3 gates) — *data-scope, not feature*
- `QuotationsListWithFilters.tsx:463,490` (`role==='staff'` → see only own inquiries)
- `EmployeesList.tsx:389` (`role==='manager'` → may suspend employee) → `can('hr_employees','update')`
> The quotation ones are really **data-scope** (own vs all) and belong in `visibility_scope`/RLS, not a feature gate. Triage with the scope work. ☐

### Unclear (1) — `UserDetailPage.tsx:354`
"Can't delete the last Executive" — a legitimate data-integrity invariant on the *target* user, not an identity gate on the actor. **Keep** (consider moving to RLS/edge later); but note user-delete itself isn't `can()`-gated anywhere in that file — flag for review.

### Retire when clusters done
`src/utils/permissions.ts` — once Clusters 1, 2, 3 land, all live call sites are gone → delete the dead functions (rip-and-replace). ☐

---

## Suggested burn-down order

1. **Phase 1 foundation** — resolver fix + duplicate-profile decision + bookings INSERT (NEU-006).
2. **Bucket E** — enable RLS on the 8 unprotected tables (ticket system first); drop the backup table.
3. **Bucket D** — `projects` → `project_bookings` → `transactions`/`accounts` → catalog → rate versions → attachments.
4. **Bucket C** — convert legacy tables (triage admin-config ones to explicit exec/admin grants).
5. **Bucket B** — drop redundant legacy policies.
6. **App gates** — convert permission-gates (from workflow), retire `permissions.ts`.
7. **Phase 4** — regression guard.
