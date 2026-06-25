-- Backfill the new per-service booking "Attachments" tab grants into existing
-- users' matrices so they don't have to be ticked one-by-one.
--
-- IMPORTANT (RBAC doctrine): permission_overrides.module_grants IS the king —
-- the Access Configuration matrix reads it verbatim. This migration writes that
-- matrix DIRECTLY. It does NOT touch access_cascade_edges / materialize_grant_cascade
-- (those are UX conveniences, not the source of truth).
--
-- Rule: a user gets ops_<svc>_attachments_tab:{view,create,delete} mirroring their
-- existing ops_<svc>:{view,create,delete} — i.e. "has that service's bookings
-- enabled". Mirrors explicit denials too (root:create=false -> attachments:create=false).
-- Any attachments grant the admin already set by hand is PRESERVED (existing wins).

WITH svc(prefix) AS (
  VALUES ('ops_forwarding'),('ops_brokerage'),('ops_trucking'),
         ('ops_marine_insurance'),('ops_others'),('pricing_others')
),
desired AS (
  SELECT po.user_id, jsonb_object_agg(kv.k, kv.v) AS new_grants
  FROM permission_overrides po
  CROSS JOIN svc
  CROSS JOIN LATERAL (
    VALUES
      (svc.prefix || '_attachments_tab:view',   po.module_grants -> (svc.prefix || ':view')),
      (svc.prefix || '_attachments_tab:create', po.module_grants -> (svc.prefix || ':create')),
      (svc.prefix || '_attachments_tab:delete', po.module_grants -> (svc.prefix || ':delete'))
  ) AS kv(k, v)
  WHERE po.module_grants -> (svc.prefix || ':view') = 'true'::jsonb  -- service bookings enabled
    AND kv.v IS NOT NULL
  GROUP BY po.user_id
)
UPDATE permission_overrides po
SET module_grants = d.new_grants || po.module_grants  -- existing explicit grants win
FROM desired d
WHERE d.user_id = po.user_id;
