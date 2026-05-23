-- Backfill contract POL/POD allowed-list arrays from any historical
-- single-value pol_aol/pod_aod stored on a contract's per-service details.
-- Idempotent: only writes when the target array is missing or empty.
--
-- Forward shape:
--   quotations.details.contract_general_details.port_of_loading: string[]
--   quotations.details.contract_general_details.port_of_entry:   string[]

UPDATE quotations q
SET details = jsonb_set(
  jsonb_set(
    COALESCE(details, '{}'::jsonb),
    '{contract_general_details}',
    COALESCE(details->'contract_general_details', '{}'::jsonb),
    true
  ),
  '{contract_general_details,port_of_loading}',
  to_jsonb(ARRAY(
    SELECT DISTINCT jsonb_extract_path_text(sm, 'service_details', 'pol_aol')
    FROM jsonb_array_elements(COALESCE(q.services_metadata, '[]'::jsonb)) AS sm
    WHERE jsonb_extract_path_text(sm, 'service_details', 'pol_aol') IS NOT NULL
      AND jsonb_extract_path_text(sm, 'service_details', 'pol_aol') <> ''
  )),
  true
)
WHERE q.quotation_type = 'contract'
  AND (
    q.details->'contract_general_details'->'port_of_loading' IS NULL
    OR jsonb_array_length(COALESCE(q.details->'contract_general_details'->'port_of_loading', '[]'::jsonb)) = 0
  )
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(q.services_metadata, '[]'::jsonb)) AS sm
    WHERE jsonb_extract_path_text(sm, 'service_details', 'pol_aol') IS NOT NULL
      AND jsonb_extract_path_text(sm, 'service_details', 'pol_aol') <> ''
  );

UPDATE quotations q
SET details = jsonb_set(
  jsonb_set(
    COALESCE(details, '{}'::jsonb),
    '{contract_general_details}',
    COALESCE(details->'contract_general_details', '{}'::jsonb),
    true
  ),
  '{contract_general_details,port_of_entry}',
  to_jsonb(ARRAY(
    SELECT DISTINCT jsonb_extract_path_text(sm, 'service_details', 'pod_aod')
    FROM jsonb_array_elements(COALESCE(q.services_metadata, '[]'::jsonb)) AS sm
    WHERE jsonb_extract_path_text(sm, 'service_details', 'pod_aod') IS NOT NULL
      AND jsonb_extract_path_text(sm, 'service_details', 'pod_aod') <> ''
  )),
  true
)
WHERE q.quotation_type = 'contract'
  AND (
    q.details->'contract_general_details'->'port_of_entry' IS NULL
    OR jsonb_array_length(COALESCE(q.details->'contract_general_details'->'port_of_entry', '[]'::jsonb)) = 0
  )
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(q.services_metadata, '[]'::jsonb)) AS sm
    WHERE jsonb_extract_path_text(sm, 'service_details', 'pod_aod') IS NOT NULL
      AND jsonb_extract_path_text(sm, 'service_details', 'pod_aod') <> ''
  );
