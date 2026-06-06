# Release Runbook — dev → prod (RBAC overhaul: NEU-012 → NEU-020)

**Prepared 2026-06-07.** This is a **major** release: prod is at migration **135**
(`135_consignees_allow_pricing`, June 2). Dev carries **136 → 185** (~50 migrations)
— the entire NEU-012 RBAC consolidation, the record-visibility dial system, all the
zero-loss grant seeds, and the NEU-020 door-scoped initiative. Prod is still on the
*old* permission model; this migrates it wholesale.

> **Do NOT git-merge-and-apply-all.** Apply the migrations in strict order with
> verification checkpoints, against a backed-up prod, because the seeds and the
> user→profile re-assignment were built/verified on **dev's** data and must be
> re-verified on **prod's** data.

Prod ⊆ dev (clean fast-forward; no prod-only migrations to reconcile). All 136→185
exist as files in `src/supabase/migrations/`.

---

## 0. Pre-flight

- [ ] **Announce a maintenance window** (RBAC + RLS changes; brief write disruption possible).
- [ ] **Back up prod** the permission tables before anything:
  ```sql
  create table if not exists _rel_backup_access_profiles    as select * from access_profiles;
  create table if not exists _rel_backup_permission_overrides as select * from permission_overrides;
  create table if not exists _rel_backup_users               as select * from users;
  ```
  (Plus a full project snapshot/PITR checkpoint via the Supabase dashboard.)
- [ ] Confirm prod has the introspection/exec helpers if you plan to use `sync`/scripts (not required for apply).
- [ ] Capture **baseline counts** on prod for sanity (users, access_profiles, a few grant tallies) to compare after.

---

## 1. Apply migrations in order (136 → 185)

Apply each file's SQL to **prod** in this exact order (via MCP `apply_migration` or
`supabase db push` linked to prod). Groups are logical; **order within is strict.**

### Group A — NEU-013 + NEU-012 core (data + RLS)  →  **CHECKPOINT 1 after 167**
```
136 backfill_booking_project_id
137 resolve_hidden_grants_at_write
139 service_aware_baseline_role_default        (no 138 — numbering gap)
140 derive_hidden_grants_at_read
141 bookings_insert_accepts_project_create
142 booking_act_helper
143 bookings_policies_use_act_helper
144 cross_reads_use_act_helper
145 retire_ops_bookings_umbrella
146 stamp_booking_creator
147 stamp_creator_financial_tables
148 customers_select_off_ops_projects
149 retire_ops_projects_umbrella
150 retire_inbox_entity_picker_umbrella
151 users_access_profile_id                    ← user→profile restructuring starts
152 resolve_from_assigned_profile
153 resolver_override_overlay
154 repoint_clean_users_to_shared_profiles     ← reassigns real users to profiles
155 visibility_scope_override_overlay
156 fix_misassigned_clean_users
157 record_visibility_dials_part_a_additive
158 record_visibility_dials_part_b_flip_policies
159 record_visibility_dials_part_c_drop_legacy
160 drop_dead_block_higher_rank_chain
161 seed_phase4_record_visibility_dials
162 phase4_flip_record_visibility_policies
163 phase4b_close_config_and_rls_off_holes
164 phase5a_create_gate_owned_record_inserts
165 phase5b_replace_identity_gates_records
166 phase5b_replace_identity_gates_config
167 rbac_guard_report
```
**⛔ CHECKPOINT 1** — run §2 verification. Critically validate the **user→profile
assignments** (151–156 ran against prod's real users): confirm every active user
resolves to a sensible profile and nobody is orphaned. Do not proceed until clean.

### Group B — the grant seeds (zero-loss preservation)  →  **CHECKPOINT 2 after 181**
```
168 seed_company_settings_knob
169 seed_invoice_write_keys
170 seed_calendar_knob
171 seed_participation_write_keys
172 seed_per_service_booking_doors
172b seed_override_carried_sources
173 seed_pricing_others_door
174 seed_bd_pricing_project_contract_doors
175 seed_project_money_doors_dd12
176 seed_inbox_five_way_dd5
177 seed_doc_in_container_edit_dd_p0
178 seed_p1_journal_export_dd
179 seed_p2_exports_calendar_dd
180 seed_quotation_lens_contract_money_dd
181 seed_phase5_acceptance_fixes
```
**⛔ CHECKPOINT 2** — run §2 zero-loss probes on **prod**. These seeds are
self-discovering (`set X where Y holds`) and additive (never revoke), so they seed
prod's actual holders — but the probes must show **0 loss** on prod's data.

### Group C — RLS reconciliation + dial split  →  **CHECKPOINT 3 after 185**
```
182 rls_phase4_money_door_keys
183 rls_phase4_quotation_inbox_contract_keys
184 split_quotations_contracts_visibility_dial
185 quotations_contract_relationship_gate
```
**⛔ CHECKPOINT 3** — run §2 in full. Spot-check the relationship-gated contract
read (a booking-from-contract loads its rate card; an own-scope BD user's Inquiries→
Completed is scoped).

---

## 2. Verification (run at each checkpoint, against PROD)

**a) RBAC guard (static + DB).** Point `rbac:guard` at prod (prod creds in env) or
run its DB checks via SQL. Static guard must pass; DB guard must report no orphaned
keys.

**b) Zero-loss probe — nobody lost a write they had.** Generalized shape (run per
family; all counts must be 0):
```sql
with eff as (
  select u.id, (coalesce(ap.module_grants,'{}'::jsonb) || coalesce(po.module_grants,'{}'::jsonb)) g
  from users u
  left join permission_overrides po on po.user_id = u.id::text
  left join access_profiles ap on ap.id = u.access_profile_id
  where coalesce(u.status,'active') not in ('deleted','deactivated')
)
select
  -- booking money doors seeded from their twins/OR-union
  count(*) filter (where (g->>'ops_projects_billings_tab:edit')::boolean
                     and not (g->>'bd_projects_billings_tab:edit')::boolean) as bd_proj_bill,
  count(*) filter (where (g->>'inbox:edit')::boolean
                     and not (g->>'inbox:delete')::boolean) as inbox_close,
  count(*) filter (where (g->>'ops_forwarding:edit')::boolean
                     and not (g->>'ops_forwarding_info_tab:edit')::boolean) as fwd_info,
  count(*) filter (where (g->>'bd_projects:edit')::boolean
                     and not (g->>'bd_projects_quotation_tab:edit')::boolean) as bd_quote
  from eff;
```
Extend with the per-batch probes from migrations 174–185 (each migration's header
documents its source→target pairs).

**c) Record-visibility split sanity.**
```sql
select count(*) from access_profiles where visibility_scopes ? 'contracts'; -- = count with 'quotations'
```

**d) RLS smoke via the harness.** `npm run test:e2e` re-pointed at prod (set
`VITE_SUPABASE_URL`/anon to prod in a scratch `.env`, or run against the prod URL
with a prod test account on `devpassword123`-equivalent). Expect: logins succeed,
key pages render, an own-scope user's contract list is scoped.

---

## 3. Edge functions

Same 3 on both (`create-user`, `admin-user-actions`, `send-feedback-email`), but
**prod is on higher versions with different hashes** — they've diverged. Per the
checklist:
- [ ] Diff each `supabase/functions/<name>/index.ts` (repo source of truth) against
  prod's deployed version (`get_edge_function`).
- [ ] **Redeploy any that differ.** (RBAC work didn't touch them; confirm the repo
  source is the intended prod state before redeploying — prod may carry a hotfix
  not in the branch.)

---

## 4. Code release

- [ ] Merge `dev → main`, push.
- [ ] Tag: `git tag stable/2026-06-07 && git push origin stable/2026-06-07`.
- [ ] Confirm the Vercel **production** build is green (the BOM fix is in; build verified locally).

---

## 5. Post-release

- [ ] Re-run §2 verification on prod one final time.
- [ ] Manual spot-checks: Carolina (project Quotation read-only), Rovilyn (Inquiries
  Completed scoped), an accounting writer (can still write billings/invoices), a
  view-only user (no write buttons).
- [ ] Watch logs/`get_advisors` for new RLS errors for the first hours.

---

## 6. Rollback

RLS/policy changes are reversible; the seeds are additive (grants only added). If a
problem appears:
- **Permission data:** restore from the `_rel_backup_*` tables (overwrite
  `access_profiles` / `permission_overrides` / `users` from the backups).
- **Code:** `git checkout main && git reset --hard <prev stable tag> && git push origin main --force` (confirm with Marcus).
- **Full DB:** Supabase PITR to the pre-release checkpoint (last resort).

---

## 7. Accepted / known gaps (ship as-is, scheduled fast-follow)

- **Contract sub-data leak** — `contract_rate_versions` / `contract_activity` /
  contract attachments are readable by any contract-viewer, not yet cascaded to the
  contract's dial. **Pre-existing on prod** (no worse than today). Fast-follow: the
  sub-data visibility cascade pass.
- **First-run overlay on `/bd/projects`** — a `fixed inset-0 backdrop-blur` modal
  intercepts clicks in fresh automation sessions; confirm it's a benign first-login
  modal, not a real interaction blocker.
- **Legacy-key RLS retirement** — Phase 4 broadened RLS to honor door keys
  additively; removing the legacy `acct_financials` et al. from RLS is a deliberate
  post-soak step, not part of this release.
