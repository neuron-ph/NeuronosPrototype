import { supabase } from '../../supabase/client';
import { toRecord } from '../profileAdapters';
import type { ProfileAdapter, ProfileLookupRecord } from '../profileAdapters';

// Covers consignee, shipper, consignee_or_shipper.
// Pass providerTag = 'consignee' | 'shipper' | 'consignee_or_shipper' to scope results.
export const tradePartyAdapter: ProfileAdapter = {
  profileType: 'trade_party',

  async search(query, options = {}): Promise<ProfileLookupRecord[]> {
    const { limit = 20, providerTag } = options;
    let req = supabase
      .from('trade_parties')
      .select('id, name, role_scope, is_active')
      .eq('is_active', true)
      .order('name');

    if (providerTag === 'consignee') {
      req = req.in('role_scope', ['consignee', 'both']) as typeof req;
    } else if (providerTag === 'shipper') {
      req = req.in('role_scope', ['shipper', 'both']) as typeof req;
    }
    // consignee_or_shipper or undefined → no role_scope filter (return all)

    if (query.trim()) {
      req = req.ilike('name', `%${query}%`) as typeof req;
    }

    const { data } = await req.limit(limit);
    return (data ?? []).map(r =>
      toRecord(r.id, r.name, providerTag ?? 'trade_party', r.is_active, { role_scope: r.role_scope }),
    );
  },

  async fetchById(id): Promise<ProfileLookupRecord | null> {
    const { data } = await supabase
      .from('trade_parties')
      .select('id, name, role_scope, is_active')
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    return toRecord(data.id, data.name, 'trade_party', data.is_active, { role_scope: data.role_scope });
  },
};
