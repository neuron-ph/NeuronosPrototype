import { supabase } from '../../supabase/client';
import { toRecord } from '../profileAdapters';
import type { ProfileAdapter, ProfileLookupRecord } from '../profileAdapters';

// Covers driver and helper. Pass providerTag = 'driver' | 'helper' to scope results.
export const dispatchPeopleAdapter: ProfileAdapter = {
  profileType: 'dispatch_people',

  async search(query, options = {}): Promise<ProfileLookupRecord[]> {
    const { limit = 20, providerTag } = options;
    let req = supabase
      .from('dispatch_people')
      .select('id, name, type, phone, is_active')
      .eq('is_active', true)
      .order('name');

    if (providerTag === 'driver' || providerTag === 'helper') {
      req = req.eq('type', providerTag) as typeof req;
    }
    if (query.trim()) {
      req = req.ilike('name', `%${query}%`) as typeof req;
    }

    const { data } = await req.limit(limit);
    return (data ?? []).map(r =>
      toRecord(r.id, r.name, providerTag ?? r.type, r.is_active, { type: r.type, phone: r.phone }),
    );
  },

  async fetchById(id): Promise<ProfileLookupRecord | null> {
    const { data } = await supabase
      .from('dispatch_people')
      .select('id, name, type, phone, is_active')
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    return toRecord(data.id, data.name, data.type, data.is_active, { type: data.type, phone: data.phone });
  },
};
