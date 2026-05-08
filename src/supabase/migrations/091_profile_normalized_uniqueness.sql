-- 091_profile_normalized_uniqueness.sql
-- Enforce normalized duplicate prevention for the flat profiling vocabularies
-- introduced in migrations 089 and 090.

create unique index if not exists profile_industries_value_norm_uidx
  on public.profile_industries ((lower(regexp_replace(btrim(value), '\s+', ' ', 'g'))));

create unique index if not exists profile_lead_sources_value_norm_uidx
  on public.profile_lead_sources ((lower(regexp_replace(btrim(value), '\s+', ' ', 'g'))));

create unique index if not exists profile_carriers_name_norm_uidx
  on public.profile_carriers ((lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))));

create unique index if not exists profile_forwarders_name_norm_uidx
  on public.profile_forwarders ((lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))));
