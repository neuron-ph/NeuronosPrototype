-- NEU-020 mirror fix: give the BD "Inquiries" door its own file-tab family
-- (bd_inquiries_{details,comments,attachments}_tab), mirroring pricing_quotations
-- exactly like Projects/Contracts/Contacts/Customers already do.
--
-- The schema change (accessSchema.ts) adds the three tabs + QUOTATION_MODULE_IDS,
-- and the app now reads the door's own tab knobs (bd_inquiries_*_tab for the BD
-- door, pricing_quotations_*_tab for the Pricing door). For those knobs to
-- materialize on every writer, the grant-cascade edge table (migration 198, the
-- generated source of truth) needs the new bd_inquiries parent→child edges.
--
-- migration 198 is regenerated (so fresh installs are correct); this incremental
-- migration adds the same edges to already-migrated databases and re-materializes
-- existing profiles/overrides so the BD inquiry tabs cascade from the
-- bd_inquiries:view/create/delete grants BD profiles already hold.

-- 1. Add the generated bd_inquiries cascade edges (idempotent) -----------------
insert into public.access_cascade_edges (parent_key, child_key) values
  ('bd_inquiries:create', 'bd_inquiries_attachments_tab:create'),
  ('bd_inquiries:create', 'bd_inquiries_comments_tab:create'),
  ('bd_inquiries:delete', 'bd_inquiries_attachments_tab:delete'),
  ('bd_inquiries:view',   'bd_inquiries_attachments_tab:view'),
  ('bd_inquiries:view',   'bd_inquiries_comments_tab:view'),
  ('bd_inquiries:view',   'bd_inquiries_details_tab:view')
on conflict (parent_key, child_key) do nothing;

-- 2. Re-materialize existing rows so the new child tabs fill in ----------------
--    (explicit child grants, incl. explicit false denials, always win)
update public.access_profiles
   set module_grants = public.materialize_grant_cascade(module_grants)
 where module_grants is not null;

update public.permission_overrides
   set module_grants = public.materialize_grant_cascade(module_grants)
 where module_grants is not null;
