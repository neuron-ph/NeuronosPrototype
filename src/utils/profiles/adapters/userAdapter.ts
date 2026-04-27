import { supabase } from '../../supabase/client';
import { toRecord } from '../profileAdapters';
import type { ProfileAdapter, ProfileLookupRecord } from '../profileAdapters';

export const userAdapter: ProfileAdapter = {
  profileType: 'user',

  async search(query, options = {}): Promise<ProfileLookupRecord[]> {
    const { limit = 20 } = options;
    let req = supabase
      .from('users')
      .select('id, name, email, department, is_active')
      .eq('is_active', true)
      .order('name');

    if (query.trim()) {
      req = req.or(`name.ilike.%${query}%,email.ilike.%${query}%`) as typeof req;
    }

    req = req.limit(limit) as typeof req;
    const { data } = await req;
    return (data ?? []).map(r =>
      toRecord(r.id, r.name, 'user', r.is_active, { email: r.email, department: r.department }),
    );
  },

  async fetchById(id): Promise<ProfileLookupRecord | null> {
    const { data } = await supabase
      .from('users')
      .select('id, name, email, department, is_active')
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    return toRecord(data.id, data.name, 'user', data.is_active, { email: data.email, department: data.department });
  },
};
