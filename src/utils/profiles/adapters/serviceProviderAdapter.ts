import { supabase } from '../../supabase/client';
import { toRecord } from '../profileAdapters';
import type { ProfileAdapter, ProfileLookupRecord } from '../profileAdapters';

export const serviceProviderAdapter: ProfileAdapter = {
  profileType: 'service_provider',

  async search(query, options = {}): Promise<ProfileLookupRecord[]> {
    const { limit = 20, providerTag } = options;
    let req = supabase
      .from('service_providers')
      .select('id, company_name, booking_profile_tags')
      .order('company_name');

    if (providerTag) {
      req = req.contains('booking_profile_tags', [providerTag]) as typeof req;
    }
    if (query.trim()) {
      req = req.ilike('company_name', `%${query}%`) as typeof req;
    }

    req = req.limit(limit) as typeof req;
    const { data } = await req;
    return (data ?? []).map(r =>
      toRecord(r.id, r.company_name, providerTag ?? 'service_provider', true, { tags: r.booking_profile_tags }),
    );
  },

  async fetchById(id): Promise<ProfileLookupRecord | null> {
    const { data } = await supabase
      .from('service_providers')
      .select('id, company_name, booking_profile_tags')
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    return toRecord(data.id, data.company_name, 'service_provider', true, { tags: data.booking_profile_tags });
  },
};
