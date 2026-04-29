import { supabase } from '../../supabase/client';
import { toRecord } from '../profileAdapters';
import type { ProfileAdapter, ProfileLookupRecord } from '../profileAdapters';

export const customerAdapter: ProfileAdapter = {
  profileType: 'customer',

  async search(query, options = {}): Promise<ProfileLookupRecord[]> {
    const { limit = 20 } = options;
    let req = supabase
      .from('customers')
      .select('id, name, status')
      .order('name');

    if (query.trim()) {
      req = req.ilike('name', `%${query}%`) as typeof req;
    }

    req = req.limit(limit) as typeof req;
    const { data } = await req;
    return (data ?? []).map(r => toRecord(r.id, r.name, 'customer', true));
  },

  async fetchById(id): Promise<ProfileLookupRecord | null> {
    const { data } = await supabase
      .from('customers')
      .select('id, name, status')
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    return toRecord(data.id, data.name, 'customer', data.status === 'Active');
  },
};
