import { supabase } from '../../supabase/client';
import { toRecord } from '../profileAdapters';
import type { ProfileAdapter, ProfileLookupRecord } from '../profileAdapters';

// Covers port and warehouse (kind = 'port' | 'warehouse')
export const locationAdapter: ProfileAdapter = {
  profileType: 'profile_location',

  async search(query, options = {}): Promise<ProfileLookupRecord[]> {
    const { limit = 20, providerTag } = options;
    // providerTag is 'port' or 'warehouse'
    let req = supabase
      .from('profile_locations')
      .select('id, kind, name, code, is_active')
      .eq('is_active', true)
      .order('name');

    if (providerTag === 'port' || providerTag === 'warehouse') {
      req = req.eq('kind', providerTag) as typeof req;
    }
    if (query.trim()) {
      req = req.or(`name.ilike.%${query}%,code.ilike.%${query}%`) as typeof req;
    }

    req = req.limit(limit) as typeof req;
    const { data } = await req;
    return (data ?? []).map(r => {
      const label = r.code ? `${r.name} (${r.code})` : r.name;
      return toRecord(r.id, label, providerTag ?? r.kind, r.is_active, { kind: r.kind, code: r.code });
    });
  },

  async fetchById(id): Promise<ProfileLookupRecord | null> {
    const { data } = await supabase
      .from('profile_locations')
      .select('id, kind, name, code, is_active')
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    const label = data.code ? `${data.name} (${data.code})` : data.name;
    return toRecord(data.id, label, data.kind, data.is_active, { kind: data.kind, code: data.code });
  },
};
