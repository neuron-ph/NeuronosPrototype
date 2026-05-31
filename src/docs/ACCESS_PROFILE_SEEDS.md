# Access Profile Seeds — Tracking Doc

> Working doc for authoring the **baseline access profiles** ("seeds") that will
> auto-prefill the Access Profile creator. As you (Marcus) dictate each
> archetype's permissions, we fill in its grant sheet below and mark it DONE.

---

## 1. What this is for

When an admin creates a new Access Profile and picks a **Department + Role**
(and **Service**, if Operations), the creator will **prefill the Record
Visibility + the permission ticks** from the matching seed — so a "Forwarding
Staff" comes pre-ticked one way, a "BD Manager" another, without applying a
saved template first. The admin can still adjust afterward (the door-to-correct).

## 2. Decided approach (plumbing — Claude owns this)

- **Match rule:**
  - `role = executive` → **one universal seed** (all modules, all actions,
    Company-Wide visibility) — ignores department/service. *(Marcus: "executives
    see everything regardless.")*
  - Operations department → match on `(department, role, service)`.
  - All other departments → match on `(department, role)`.
- **Storage:** seeds are rows in `access_profiles`, flagged as baselines
  (`is_baseline = true`, new column) so they drive the prefill but never appear
  in the normal profiles list. Extends the existing `chooseRoleDefaultProfile`
  matcher (`src/components/admin/accessProfiles/accessGrantUtils.ts`) to also key
  on `target_service`.
- **Derived ticks (do NOT author):** booking-detail tabs (`ops_bookings_*`) and
  ops-projects tabs are auto-OR'd from the visible service modules via
  `deriveHiddenModuleGrants` (`src/config/access/accessSchema.ts`). Tick the
  service module; the detail tabs follow.

## 3. The 6 actions

Every module/tab exposes all six. Grant key format: **`{moduleId}:{action}`**.

`view` · `create` · `edit` · `approve` · `delete` · `export`

## 4. Record Visibility options (post-cleanup)

`own` (Own Records) · `team` (Team Wide) · `department` (Department Wide).
*(Company-Wide and Selected-Departments were removed from the picker; the
executive universal seed is the only Company-Wide case and is set in plumbing.)*

## 5. Roles

`staff` · `team_leader` · `supervisor` · `manager` · `executive` (universal).

## 6. Authoring surface — visible modules per department

Only these are ticked by hand (hidden/derived modules omitted).

### Business Development
`bd_contacts` (Contacts) · `bd_customers` (Customers) · `bd_inquiries` (Inquiries) ·
`bd_projects` (Projects) · `bd_contracts` (Contracts) · `bd_tasks` (Tasks) ·
`bd_activities` (Activities) · `bd_budget_requests` (Budget Requests)

### Pricing
`pricing_contacts` (Contacts) · `pricing_customers` (Customers) ·
`pricing_quotations` (Quotations) · `pricing_projects` (Projects) ·
`pricing_contracts` (Contracts) · `pricing_network_partners` (Vendor) ·
`ops_marine_insurance` (Marine Insurance — **relocated from Operations**) ·
`ops_others` (Others — **shared with Operations**)

### Operations  *(service decides which ONE service module is enabled)*
`ops_forwarding` (Forwarding) · `ops_brokerage` (Brokerage) ·
`ops_trucking` (Trucking) · `ops_others` (Others — **shared with Pricing**)
> Marine Insurance moved to Pricing (2026 structural change). `ops_*` keys kept
> as-is to avoid a permission-data migration; the prefix is internal.

### Accounting
`acct_financials` (Finance Overview) · `acct_evouchers` (E-Vouchers) ·
`acct_journal` (General Journal) · `acct_coa` (Chart of Accounts) ·
`acct_projects` (Projects) · `acct_contracts` (Contracts) · `acct_bookings` (Bookings) ·
`acct_customers` (Customers) · `acct_catalog` (Catalog) · `acct_reports` (Reports) ·
`acct_statements` (Financial Statements)

### HR
`hr` (HR)

### Executive
`exec_activity_log` (Activity Log) · `exec_users` (Users) ·
`exec_profiling` (Profiling) · `exec_memos` (Memos)

### Common (cross-cutting — granted to every seed by this fixed rule)
`inbox` (Inbox) · `my_evouchers` (Personal E-Vouchers)

> **Inbox/Personal rules are per-department-family** (not one global rule). Defaults:
>
> **Operations family:**
> - **Staff** → `inbox`: **V C E X** · `my_evouchers`: **V C E D X**. *(img #7.)*
> - **TL / Supervisor / Manager** → **V X only** on both.
>
> **Business Development family:**
> - **Staff** → both `inbox` + `my_evouchers`: **V C E A X** (full except Delete). *(img #13 = Mgr.)*
> - **TL / Supervisor / Manager** → **V X only** on both. *(img #13.)*
>
> **Pricing family** (all four roles, same level):
> - `inbox` → **V C E A X** (no Delete) · `my_evouchers` → **V C E A D X** (full). *(img #18.)*
>
> **Executive** → covered by the universal seed (everything).

---

## 7. Archetype tracker

Status: ⬜ TODO · ✅ DONE · ⏭️ N/A (role doesn't exist for this dept/service)

### Executive (universal)
- ✅ **Executive (any dept)** — all modules, all actions, Company-Wide. *(See §8.)*

### Business Development  *(per pattern + ladder, §8)*
- ✅ BD · Staff
- ✅ BD · Team Leader
- ✅ BD · Supervisor
- ✅ BD · Manager

### Pricing  *(per flat pattern + ladder, §8)*
- ✅ Pricing · Staff
- ✅ Pricing · Team Leader
- ✅ Pricing · Supervisor
- ✅ Pricing · Manager

### Accounting · HR — ⏭️ NOT SEEDED (intentionally deferred)
No baseline seeds for Accounting or HR yet. Profiles for these departments are
created manually until/unless we define their ladders. *(Their modules remain in
§6 for reference.)*

### Operations · Forwarding  *(per ladder, §8)*
- ✅ Forwarding · Staff
- ✅ Forwarding · Team Leader
- ✅ Forwarding · Supervisor
- ✅ Forwarding · Manager

### Operations · Brokerage  *(per ladder, §8)*
- ✅ Brokerage · Staff
- ✅ Brokerage · Team Leader
- ✅ Brokerage · Supervisor
- ✅ Brokerage · Manager

### Operations · Trucking  *(per ladder, §8)*
- ✅ Trucking · Staff
- ✅ Trucking · Team Leader
- ✅ Trucking · Supervisor
- ✅ Trucking · Manager

### ~~Operations · Marine Insurance~~ → DISSOLVED into Pricing
Marine Insurance moved to the **Pricing** department (structural change). It is
no longer an Operations service-keyed archetype — it becomes a *module inside the
Pricing ladder*. The 4 old Ops·Marine seeds are retired here.

### Operations · Others  *(per ladder, §8)*
- ✅ Others · Staff
- ✅ Others · Team Leader
- ✅ Others · Supervisor
- ✅ Others · Manager

---

## 8. Filled grant sheets

> One section per archetype as we define it. Format per module:
> `module_id: V C E A D X` (✓ = granted, · = not). Visibility noted at top.
> Anything not listed = no access.

### ✅ Executive (universal — any department/service)
**Visibility:** Company-Wide.
**Grants:** every module in §6 × all six actions (V C E A D X). Set in plumbing,
not enumerated. Ignores department/service.

---

### Operations — shared patterns

**Ground-ops service pattern** (applied to each enabled service module + its
list tabs, and to the shared booking-detail tabs):

| Surface | V | C | E | A | D | X |
|---|---|---|---|---|---|---|
| service module (`ops_<svc>`) | ✓ | ✓ | ✓ | · | · | ✓ |
| list tabs: All, My, Draft, In Progress, Completed, Archived(`_cancelled_tab`) | ✓ | ✓ | ✓ | · | · | ✓ |
| booking-detail: Info, Billing, Expenses, Comments, Chrono | ✓ | ✓ | ✓ | · | · | ✓ |
| booking-detail: **Invoices, Collections** | · | · | · | · | · | · |

> Booking-detail tabs (`ops_bookings_*`) are **shared** across all services, so
> every enabled service uses the identical booking-detail pattern (no conflict).

**Operations composition rule:** every ops seed = `home service + Others + Inbox
+ Personal`. The home service and Others both use the ground-ops pattern. (If
home service *is* Others, it appears once — no duplicate.)

**Operations role ladder** (applies to all four ops services identically — confirmed):

| Role | Visibility | Service ticks (home + Others) | Inbox / Personal |
|---|---|---|---|
| Staff | Own | V C E X | full: `inbox` V C E X · `my_evouchers` V C E D X |
| Team Leader | Team | V C E X | V X only |
| Supervisor | Team | V C E X | V X only |
| Manager | Dept | V C E **D** X | V X only |

Across all rungs: **Approve off**, **Invoices/Collections off**. Manager's only
service-tick delta is **Delete on**. Non-home services stay off.

---

### ✅ Operations · Brokerage · Staff
**Key:** dept=Operations, role=staff, service=Brokerage. **Visibility:** Own Records.

- **`ops_brokerage`** + tabs (`_all_/_my_/_draft_/_in_progress_/_completed_/_cancelled_tab`) → ground-ops pattern (V C E X)
- **`ops_others`** + same tabs → ground-ops pattern (V C E X)
- **Booking-detail** (`ops_bookings_*`, shared): `info`,`billings`,`expenses`,`comments`,`chrono` → V C E X · `invoices`,`collections` → off
- **`inbox`** + tabs → V C E X  *(staff rule)*
- **`my_evouchers`** + tabs → V C E D X  *(staff rule)*
- Forwarding, Trucking, Marine Insurance → off

---

### ✅ Operations · Brokerage · Team Leader
**Key:** dept=Operations, role=team_leader, service=Brokerage. **Visibility:** Team Wide.

- **Service ticks identical to Brokerage · Staff:** `ops_brokerage` + `ops_others`
  (+ list tabs) on ground-ops pattern (V C E X); booking-detail shared
  `info`/`billings`/`expenses`/`comments`/`chrono` → V C E X, `invoices`/`collections` → off.
- **`inbox`** + tabs → **V X only** *(TL/Sup/Mgr rule)*
- **`my_evouchers`** + tabs → **V X only** *(TL/Sup/Mgr rule)*
- Forwarding, Trucking, Marine Insurance → off
- Only differences vs Staff: visibility (Team vs Own) + Inbox/Personal reduced to View+Export.

---

### ✅ Operations · Brokerage · Supervisor
**Key:** dept=Operations, role=supervisor, service=Brokerage. **Visibility:** Team Wide.

- **Identical to Brokerage · Team Leader** in every respect (same cluster ticks,
  same Team Wide visibility, Inbox/Personal → V X only).

---

### ✅ Operations · Brokerage · Manager
**Key:** dept=Operations, role=manager, service=Brokerage. **Visibility:** Department Wide.

- Same as Supervisor/TL **except**: Department Wide visibility + **Delete added**
  to the operations cluster.
- **Service ticks** (`ops_brokerage`, `ops_others`, + list tabs; booking-detail
  `info`/`billings`/`expenses`/`comments`/`chrono`) → **V C E D X** (Approve off);
  `invoices`/`collections` → off.
- **`inbox`** + tabs → V X only · **`my_evouchers`** + tabs → V X only
  *(unchanged; assumption — Delete not extended here unless told)*
- Forwarding, Trucking, Marine Insurance → off

---

### ✅ Operations · Forwarding · Staff / TL / Supervisor / Manager
**Per the Operations role ladder.** Home service = `ops_forwarding`; cluster =
Forwarding + Others. Brokerage, Trucking, Marine Insurance → off.

### ✅ Operations · Trucking · Staff / TL / Supervisor / Manager
**Per the Operations role ladder.** Home service = `ops_trucking`; cluster =
Trucking + Others. Forwarding, Brokerage, Marine Insurance → off.

### ✅ Operations · Others · Staff / TL / Supervisor / Manager
**Per the Operations role ladder.** Home service = `ops_others`; cluster = Others
only (home is Others, no duplicate). Forwarding, Brokerage, Trucking, Marine → off.

---

### Business Development — shared module pattern + ladder

**Module ticks are IDENTICAL across all 4 BD roles** (Staff/TL/Supervisor/Manager).
Only **visibility** and **Inbox/Personal** vary. Delete on core records stays off
for all — only Executive deletes those.

| Module (+ tabs) | V | C | E | A | D | X |
|---|---|---|---|---|---|---|
| `bd_contacts` + all tabs | ✓ | ✓ | ✓ | · | · | · |
| `bd_customers` + all tabs | ✓ | ✓ | ✓ | · | · | · |
| `bd_inquiries` | ✓ | ✓ | ✓ | · | · | · |
| `bd_projects` + tabs: All, Active, Completed, Info, Quotation, Bookings, Attachments, Comments | ✓ | ✓ | ✓ | · | · | · |
| `bd_projects` tabs: Expenses, Billings, Invoices, Collections | · | · | · | · | · | · |
| `bd_projects` **Financial Overview** | ⚠️ intended OFF — **no permission key exists yet** (see gap) |
| `bd_contracts` + tabs: All, Active, Expiring, Quotation, Rate Card, Bookings, Attachments, Comments, Activity | ✓ | ✓ | · | · | · | ✓ |
| `bd_contracts` tabs: Financial Overview, Billings, Invoices, Collections, Expenses | · | · | · | · | · | · |
| `bd_tasks` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `bd_activities` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `bd_budget_requests` + tabs (All, My Requests) | ✓ | ✓ | ✓ | · | ✓ | ✓ |

> Underlying shared ids: BD Projects tabs = `ops_projects_*`; BD Contracts tabs =
> `pricing_contracts_*` (via `containsModuleIds`).

**BD role ladder:**

| Role | Visibility | Inbox / Personal |
|---|---|---|
| Staff | Own | both **V C E A X** (full except Delete) |
| Team Leader | Team | both **V X** only |
| Supervisor | Team | both **V X** only |
| Manager | Dept | both **V X** only |

- ✅ **BD · Manager** (Dept Wide) · ✅ **BD · Supervisor** (Team) · ✅ **BD · Team
  Leader** (Team) · ✅ **BD · Staff** (Own) — all per the table + ladder above.

> **⚠️ KNOWN GAP — Project Financial Overview not gateable.** The project Dashboard's
> "Financial Overview" (img #14) has no permission tab in `ACCESS_SCHEMA`
> (`OPS_PROJECT_SURFACE_TABS`). To actually hide it per these seeds, add a
> permission tab (e.g. `ops_projects_financial_overview_tab`) mirroring the
> Contracts one, wire it into the project Dashboard gating, then set it OFF in the
> BD seeds. Tracked as follow-up; seeds above assume it once it exists.

---

### Pricing — flat pattern + ladder

Pricing is broad and flat: the same rich access for all four roles, differing
only by **visibility**, **Delete on Pricing modules** (Manager only), and
**Users access** (Manager only).

**Pricing department modules** — `pricing_contacts`, `pricing_customers`,
`pricing_quotations`, `pricing_projects`, `pricing_contracts`,
`pricing_network_partners` (Vendor), **`ops_marine_insurance`**, **`ops_others`**
(+ all their tabs):

| Role | Visibility | Pricing modules (+ all tabs) | Users (`exec_users` + 3 tabs) |
|---|---|---|---|
| Staff | Own | **V C E A X** | — none — |
| Team Leader | Team | **V C E A X** | — none — |
| Supervisor | Team | **V C E A X** | — none — |
| Manager | Dept | **V C E A D X** (+Delete) | **V C** (View + Create) |

> Marine Insurance & Others use the **full flat pattern** here (NOT the ops
> ground-ops pattern): their booking-detail **Invoices + Collections tabs ARE
> ON** under Pricing. The shared `ops_bookings_*` keys are per-profile, so this
> doesn't affect the Operations seeds (those keep Invoices/Collections off).

**Constant across ALL four Pricing roles:**
- **Catalog** (`acct_catalog` + Items/Matrix/All/Billing/Expense) → full **V C E A D X** (yes, incl. Delete — even Staff). *(img #16.)*
- **Inbox** → **V C E A X** · **Personal E-Vouchers** → **V C E A D X**. *(Pricing inbox rule, §6.)*

- ✅ **Pricing · Manager** (Dept) · ✅ **Pricing · Supervisor** (Team) · ✅ **Pricing
  · Team Leader** (Team) · ✅ **Pricing · Staff** (Own) — all per the table above.

---

*(next archetype goes here)*
