import { supabase } from '../../supabase/client';
import { toRecord } from '../profileAdapters';
import type { ProfileAdapter, ProfileLookupRecord } from '../profileAdapters';

export const countryAdapter: ProfileAdapter = {
  profileType: 'country',

  async search(query, options = {}): Promise<ProfileLookupRecord[]> {
    const { limit = 30 } = options;
    let req = supabase
      .from('profile_countries')
      .select('id, iso_code, name, is_active')
      .eq('is_active', true)
      .order('sort_order')
      .order('name');

    if (query.trim()) {
      req = req.or(`name.ilike.%${query}%,iso_code.ilike.%${query}%`) as typeof req;
    }

    req = req.limit(limit) as typeof req;
    const { data } = await req;
    return (data ?? []).map(r =>
      toRecord(r.id, r.name, 'country', r.is_active, { iso_code: r.iso_code }),
    );
  },

  async fetchById(id): Promise<ProfileLookupRecord | null> {
    const { data } = await supabase
      .from('profile_countries')
      .select('id, iso_code, name, is_active')
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    return toRecord(data.id, data.name, 'country', data.is_active, { iso_code: data.iso_code });
  },
};
