import { useEffect, useState } from 'react';
import { Building2, Globe, MapPin, Package, Users } from 'lucide-react';
import { supabase } from '../../../utils/supabase/client';

type Counts = {
  trade_parties: number;
  service_providers: number;
  profile_locations: number;
  profile_countries: number;
};

export function ProfilingOverviewTab() {
  const [counts, setCounts] = useState<Counts>({ trade_parties: 0, service_providers: 0, profile_locations: 0, profile_countries: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [parties, providers, locations, countries] = await Promise.all([
        supabase.from('trade_parties').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('service_providers').select('id', { count: 'exact', head: true }),
        supabase.from('profile_locations').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('profile_countries').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ]);
      setCounts({
        trade_parties: parties.count ?? 0,
        service_providers: providers.count ?? 0,
        profile_locations: locations.count ?? 0,
        profile_countries: countries.count ?? 0,
      });
      setLoading(false);
    }
    load();
  }, []);

  const cards = [
    { label: 'Trade Parties', value: counts.trade_parties, icon: Users, color: '#0F766E', desc: 'Consignees and shippers' },
    { label: 'Service Providers', value: counts.service_providers, icon: Building2, color: '#6366F1', desc: 'Carriers, agents, and vendors' },
    { label: 'Locations', value: counts.profile_locations, icon: MapPin, color: '#F59E0B', desc: 'Ports and warehouses' },
    { label: 'Countries', value: counts.profile_countries, icon: Globe, color: '#10B981', desc: 'Active country records' },
  ];

  return (
    <div style={{ padding: '24px 0' }}>
      <p style={{ fontSize: 13, color: '#667085', marginBottom: 24 }}>
        Profiling is the shared master-data layer for booking lookups. Manage entities here to keep booking forms accurate and reusable.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {cards.map(card => (
          <div key={card.label} style={{
            background: '#FFFFFF',
            border: '1px solid #E5E9F0',
            borderRadius: 10,
            padding: '20px 24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `${card.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <card.icon size={18} style={{ color: card.color }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#12332B' }}>{card.label}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 600, color: '#12332B', marginBottom: 4 }}>
              {loading ? '—' : card.value.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: '#667085' }}>{card.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, background: '#F7FAF8', borderRadius: 10, padding: '20px 24px', border: '1px solid #E5E9F0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Package size={15} style={{ color: '#0F766E' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#12332B' }}>How Profiling Works</span>
        </div>
        <div style={{ fontSize: 13, color: '#667085', lineHeight: 1.7 }}>
          <p style={{ margin: '0 0 8px' }}>
            When a booking is saved with a linked profile, the system records both the display label (snapshot) and the live profile ID. This means historical bookings always show the original name even if the profile is later renamed or archived.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: '#12332B' }}>Combo fields</strong> (e.g. carriers, consignees) allow manual entry during onboarding. <strong style={{ color: '#12332B' }}>Strict fields</strong> (e.g. customer, country) require a live profile selection.
          </p>
        </div>
      </div>
    </div>
  );
}
