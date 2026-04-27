import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase/client';

type ServiceOptions = {
  services: string[];
  subServices: string[];
  loading: boolean;
};

const cache = new Map<string, { services: string[]; subServices: string[] }>();

/**
 * Fetches booking service and sub-service options for a given service_type from the DB.
 * Falls back to empty arrays while loading — callers should fall back to static options
 * if needed. Results are cached per service_type for the lifetime of the session.
 */
export function useBookingServiceOptions(serviceType: string): ServiceOptions {
  const [services, setServices] = useState<string[]>(() => cache.get(serviceType)?.services ?? []);
  const [subServices, setSubServices] = useState<string[]>(() => cache.get(serviceType)?.subServices ?? []);
  const [loading, setLoading] = useState(!cache.has(serviceType));

  useEffect(() => {
    if (cache.has(serviceType)) {
      const cached = cache.get(serviceType)!;
      setServices(cached.services);
      setSubServices(cached.subServices);
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([
      supabase.from('booking_service_catalog').select('name').eq('service_type', serviceType).eq('is_active', true).order('sort_order').order('name'),
      supabase.from('booking_subservice_catalog').select('name').eq('service_type', serviceType).eq('is_active', true).order('sort_order').order('name'),
    ]).then(([svc, sub]) => {
      const s = (svc.data ?? []).map(r => r.name);
      const ss = (sub.data ?? []).map(r => r.name);
      cache.set(serviceType, { services: s, subServices: ss });
      setServices(s);
      setSubServices(ss);
      setLoading(false);
    });
  }, [serviceType]);

  return { services, subServices, loading };
}

/** Invalidate the cache for a service type (call after admin edits). */
export function invalidateBookingServiceCache(serviceType?: string) {
  if (serviceType) {
    cache.delete(serviceType);
  } else {
    cache.clear();
  }
}
