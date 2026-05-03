import { supabase } from '../../supabase/client';
import { toRecord } from '../profileAdapters';
import type { ProfileAdapter, ProfileLookupRecord } from '../profileAdapters';

export const serviceProviderAdapter: ProfileAdapter = {
  profileType: 'service_provider',

  async search(query, options = {}): Promise<ProfileLookupRecord[]> {
    const { limit = 20, providerTag, providerScope } = options;
    let req = supabase
      .from('service_providers')
      .select('id, company_name, booking_profile_tags, provider_type, country')
      .order('company_name');

    if (providerTag) {
      req = req.contains('booking_profile_tags', [providerTag]) as typeof req;
    }
    if (providerScope === 'overseas') {
      req = req.eq('provider_type', 'international') as typeof req;
    } else if (providerScope === 'local') {
      req = req.eq('country', 'Philippines') as typeof req;
    }
    if (query.trim()) {
      req = req.ilike('company_name', `%${query}%`) as typeof req;
    }

    req = req.limit(limit) as typeof req;
    const { data } = await req;
    return (data ?? []).map(r =>
      toRecord(r.id, r.company_name, providerTag ?? 'service_provider', true, {
        tags: r.booking_profile_tags,
        provider_type: r.provider_type,
        country: r.country,
      }),
    );
  },

  async fetchById(id): Promise<ProfileLookupRecord | null> {
    const { data } = await supabase
      .from('service_providers')
      .select('id, company_name, booking_profile_tags, provider_type, country')
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    return toRecord(data.id, data.company_name, 'service_provider', true, {
      tags: data.booking_profile_tags,
      provider_type: data.provider_type,
      country: data.country,
    });
  },
};
