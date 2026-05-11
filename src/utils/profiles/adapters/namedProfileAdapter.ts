import { supabase } from '../../supabase/client';
import { toRecord } from '../profileAdapters';
import type { ProfileAdapter, ProfileLookupRecord } from '../profileAdapters';
import type { ProfileRegistryEntry } from '../../../types/profiles';

export function createNamedProfileAdapter(
  source: Extract<
    ProfileRegistryEntry['source'],
    | 'profile_carriers'
    | 'profile_forwarders'
    | 'profile_shipping_lines'
    | 'profile_trucking_companies'
    | 'profile_consolidators'
    | 'profile_insurers'
  >,
  profileType: string,
): ProfileAdapter {
  return {
    profileType,

    async search(query, options = {}): Promise<ProfileLookupRecord[]> {
      const { limit = 20 } = options;
      let req = supabase
        .from(source)
        .select('id, name, is_active')
        .eq('is_active', true)
        .order('sort_order')
        .order('name');

      if (query.trim()) {
        req = req.ilike('name', `%${query}%`) as typeof req;
      }

      req = req.limit(limit) as typeof req;
      const { data } = await req;
      return (data ?? []).map(r => toRecord(r.id, r.name, profileType, r.is_active !== false));
    },

    async fetchById(id): Promise<ProfileLookupRecord | null> {
      const { data } = await supabase
        .from(source)
        .select('id, name, is_active')
        .eq('id', id)
        .maybeSingle();
      if (!data) return null;
      return toRecord(data.id, data.name, profileType, data.is_active !== false);
    },
  };
}
