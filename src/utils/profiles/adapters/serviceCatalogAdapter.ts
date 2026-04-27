import { supabase } from '../../supabase/client';
import { toRecord } from '../profileAdapters';
import type { ProfileAdapter, ProfileLookupRecord } from '../profileAdapters';

/**
 * Factory: returns an adapter that reads from the given catalog table
 * (booking_service_catalog or booking_subservice_catalog), filtered by
 * the booking's service_type when supplied.
 */
function makeCatalogAdapter(
  table: 'booking_service_catalog' | 'booking_subservice_catalog',
  profileType: 'service_catalog' | 'sub_service_catalog',
): ProfileAdapter {
  return {
    profileType,

    async search(query, options = {}): Promise<ProfileLookupRecord[]> {
      const { limit = 50, serviceType } = options;
      let req = supabase
        .from(table)
        .select('id, service_type, name, sort_order, is_active')
        .eq('is_active', true)
        .order('sort_order')
        .order('name');

      if (serviceType) {
        req = req.eq('service_type', serviceType) as typeof req;
      }
      if (query.trim()) {
        req = req.ilike('name', `%${query}%`) as typeof req;
      }

      req = req.limit(limit) as typeof req;
      const { data } = await req;
      return (data ?? []).map(r =>
        toRecord(r.id, r.name, profileType, r.is_active, { service_type: r.service_type }),
      );
    },

    async fetchById(id): Promise<ProfileLookupRecord | null> {
      const { data } = await supabase
        .from(table)
        .select('id, service_type, name, is_active')
        .eq('id', id)
        .maybeSingle();
      if (!data) return null;
      return toRecord(data.id, data.name, profileType, data.is_active, { service_type: data.service_type });
    },
  };
}

export const serviceCatalogAdapter = makeCatalogAdapter('booking_service_catalog', 'service_catalog');
export const subServiceCatalogAdapter = makeCatalogAdapter('booking_subservice_catalog', 'sub_service_catalog');
