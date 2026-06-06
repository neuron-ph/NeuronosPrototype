-- NEU-019 Phase 3 seeding (D5: mirror current reality).
-- Comments posting, attachment upload, task/activity edit+delete, booking
-- comments, and inbox compose/status were all ungated — any viewer could do
-- them. The new write keys are seeded from each surface's view holders so
-- day one changes nothing; the win is revocability. Exceptions:
--   * attachments :delete is NOT seeded — the legacy delete keys already
--     carry the tighter original intent (10–11 holders), and the new
--     quotation attachments tab starts with delete granted to nobody.
--   * quotation comments/attachments seed from BOTH lens audiences
--     (pricing_quotations:view and bd_inquiries:view), since BD reaches
--     quotation comments through the inquiries lens.

do $$
declare
  pair record;
  grant_patch jsonb;
begin
  for pair in
    select * from (values
      -- comments: view → create
      ('bd_contacts_comments_tab:view',       array['bd_contacts_comments_tab:create']),
      ('bd_customers_comments_tab:view',      array['bd_customers_comments_tab:create']),
      ('pricing_contacts_comments_tab:view',  array['pricing_contacts_comments_tab:create']),
      ('pricing_customers_comments_tab:view', array['pricing_customers_comments_tab:create']),
      ('pricing_contracts_comments_tab:view', array['pricing_contracts_comments_tab:create']),
      ('acct_contracts_comments_tab:view',    array['acct_contracts_comments_tab:create']),
      ('ops_projects_comments_tab:view',      array['ops_projects_comments_tab:create']),
      ('acct_projects_comments_tab:view',     array['acct_projects_comments_tab:create']),
      -- attachments: view → create (delete intentionally NOT seeded)
      ('bd_contacts_attachments_tab:view',       array['bd_contacts_attachments_tab:create']),
      ('bd_customers_attachments_tab:view',      array['bd_customers_attachments_tab:create']),
      ('pricing_contacts_attachments_tab:view',  array['pricing_contacts_attachments_tab:create']),
      ('pricing_customers_attachments_tab:view', array['pricing_customers_attachments_tab:create']),
      ('pricing_contracts_attachments_tab:view', array['pricing_contracts_attachments_tab:create']),
      ('acct_contracts_attachments_tab:view',    array['acct_contracts_attachments_tab:create']),
      ('ops_projects_attachments_tab:view',      array['ops_projects_attachments_tab:create']),
      ('acct_projects_attachments_tab:view',     array['acct_projects_attachments_tab:create']),
      -- tasks / activities: view → edit + delete (any viewer could before)
      ('bd_contacts_tasks_tab:view',       array['bd_contacts_tasks_tab:edit','bd_contacts_tasks_tab:delete']),
      ('bd_customers_tasks_tab:view',      array['bd_customers_tasks_tab:edit','bd_customers_tasks_tab:delete']),
      ('pricing_contacts_tasks_tab:view',  array['pricing_contacts_tasks_tab:edit','pricing_contacts_tasks_tab:delete']),
      ('pricing_customers_tasks_tab:view', array['pricing_customers_tasks_tab:edit','pricing_customers_tasks_tab:delete']),
      ('bd_contacts_activities_tab:view',       array['bd_contacts_activities_tab:edit','bd_contacts_activities_tab:delete']),
      ('bd_customers_activities_tab:view',      array['bd_customers_activities_tab:edit','bd_customers_activities_tab:delete']),
      ('pricing_contacts_activities_tab:view',  array['pricing_contacts_activities_tab:edit','pricing_contacts_activities_tab:delete']),
      ('pricing_customers_activities_tab:view', array['pricing_customers_activities_tab:edit','pricing_customers_activities_tab:delete']),
      -- inbox (D1): view → create + edit, identity checks remain AND'd in code
      ('inbox:view', array['inbox:create','inbox:edit'])
    ) as t(src, targets)
  loop
    select jsonb_object_agg(k, true) into grant_patch from unnest(pair.targets) k;

    update access_profiles
    set module_grants = module_grants || grant_patch, updated_at = now()
    where (module_grants ->> pair.src)::boolean is true;

    update permission_overrides po
    set module_grants = po.module_grants || grant_patch, updated_at = now()
    from users u
    where po.user_id = u.id::text and u.access_profile_id is null
      and (po.module_grants ->> pair.src)::boolean is true;
  end loop;
end $$;

-- Quotation comments/attachments: both lens audiences (BD reads quotation
-- comments via the inquiries lens, so tab-view-only seeding would lock BD out)
update access_profiles
set module_grants = module_grants || '{
      "pricing_quotations_comments_tab:create": true,
      "pricing_quotations_attachments_tab:view": true,
      "pricing_quotations_attachments_tab:create": true
    }'::jsonb,
    updated_at = now()
where (module_grants ->> 'pricing_quotations_comments_tab:view')::boolean is true
   or (module_grants ->> 'pricing_quotations:view')::boolean is true
   or (module_grants ->> 'bd_inquiries:view')::boolean is true;

update permission_overrides po
set module_grants = po.module_grants || '{
      "pricing_quotations_comments_tab:create": true,
      "pricing_quotations_attachments_tab:view": true,
      "pricing_quotations_attachments_tab:create": true
    }'::jsonb,
    updated_at = now()
from users u
where po.user_id = u.id::text and u.access_profile_id is null
  and ((po.module_grants ->> 'pricing_quotations_comments_tab:view')::boolean is true
    or (po.module_grants ->> 'pricing_quotations:view')::boolean is true
    or (po.module_grants ->> 'bd_inquiries:view')::boolean is true);

-- Booking comments: every profile that can view any booking surface kept the
-- (previously unguarded) Comments tab — mirror that as view+create
update access_profiles
set module_grants = module_grants || '{
      "ops_bookings_comments_tab:view": true,
      "ops_bookings_comments_tab:create": true
    }'::jsonb,
    updated_at = now()
where (module_grants ->> 'ops_forwarding:view')::boolean is true
   or (module_grants ->> 'ops_brokerage:view')::boolean is true
   or (module_grants ->> 'ops_trucking:view')::boolean is true
   or (module_grants ->> 'ops_marine_insurance:view')::boolean is true
   or (module_grants ->> 'ops_others:view')::boolean is true
   or (module_grants ->> 'ops_projects:view')::boolean is true;

update permission_overrides po
set module_grants = po.module_grants || '{
      "ops_bookings_comments_tab:view": true,
      "ops_bookings_comments_tab:create": true
    }'::jsonb,
    updated_at = now()
from users u
where po.user_id = u.id::text and u.access_profile_id is null
  and ((po.module_grants ->> 'ops_forwarding:view')::boolean is true
    or (po.module_grants ->> 'ops_brokerage:view')::boolean is true
    or (po.module_grants ->> 'ops_trucking:view')::boolean is true
    or (po.module_grants ->> 'ops_marine_insurance:view')::boolean is true
    or (po.module_grants ->> 'ops_others:view')::boolean is true
    or (po.module_grants ->> 'ops_projects:view')::boolean is true);
