-- Access-integrity audit (#10): company_settings had RLS enabled with only a
-- SELECT policy (migration 028). The `company_settings:edit` key exists and is
-- seeded (migration 168, mirroring exec_profiling:edit), and the PDF screens'
-- "Save as Company Default" button gates on it — but with no INSERT/UPDATE
-- policy the upsert was silently rejected by RLS. This adds the write policies
-- so the permission the UI already enforces is actually honored at the DB.
--
-- ADDITIVE: only grants writes to holders of company_settings:edit; everyone
-- else is unaffected (and the SELECT policy is untouched).

create policy "company_settings_update" on public.company_settings
  for update to authenticated
  using (current_user_has_module_permission('company_settings', 'edit'))
  with check (current_user_has_module_permission('company_settings', 'edit'));

create policy "company_settings_insert" on public.company_settings
  for insert to authenticated
  with check (current_user_has_module_permission('company_settings', 'edit'));
