import { supabase } from '../../supabase/client';
import { toRecord } from '../profileAdapters';
import type { ProfileAdapter, ProfileLookupRecord } from '../profileAdapters';

export const vehicleAdapter: ProfileAdapter = {
  profileType: 'vehicle',

  async search(query, options = {}): Promise<ProfileLookupRecord[]> {
    const { limit = 20 } = options;
    let req = supabase
      .from('vehicles')
      .select('id, plate_number, vehicle_type, is_active')
      .eq('is_active', true)
      .order('plate_number');

    if (query.trim()) {
      req = req.or(`plate_number.ilike.%${query}%,vehicle_type.ilike.%${query}%`) as typeof req;
    }

    const { data } = await req.limit(limit);
    return (data ?? []).map(r => {
      const label = r.vehicle_type ? `${r.plate_number} — ${r.vehicle_type}` : r.plate_number;
      return toRecord(r.id, label, 'vehicle', r.is_active, { plate_number: r.plate_number, vehicle_type: r.vehicle_type });
    });
  },

  async fetchById(id): Promise<ProfileLookupRecord | null> {
    const { data } = await supabase
      .from('vehicles')
      .select('id, plate_number, vehicle_type, is_active')
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    const label = data.vehicle_type ? `${data.plate_number} — ${data.vehicle_type}` : data.plate_number;
    return toRecord(data.id, label, 'vehicle', data.is_active, { plate_number: data.plate_number, vehicle_type: data.vehicle_type });
  },
};
