import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Database } from 'lucide-react';
import { ProfilingOverviewTab } from './ProfilingOverviewTab';
import { ProfilingPartiesTab } from './ProfilingPartiesTab';
import { ProfilingProvidersTab } from './ProfilingProvidersTab';
import { ProfilingLocationsTab } from './ProfilingLocationsTab';
import { ProfilingCountriesTab } from './ProfilingCountriesTab';
import { ProfilingDispatchTab } from './ProfilingDispatchTab';
import { ProfilingServicesTab } from './ProfilingServicesTab';
import { ProfilingSubServicesTab } from './ProfilingSubServicesTab';
import { ProfilingGovernanceTab } from './ProfilingGovernanceTab';
export type ProfilingTab =
  | 'overview'
  | 'parties'
  | 'providers'
  | 'locations'
  | 'countries'
  | 'dispatch'
  | 'services'
  | 'subservices'
  | 'governance';

const TABS: { id: ProfilingTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'parties', label: 'Parties' },
  { id: 'providers', label: 'Providers' },
  { id: 'locations', label: 'Locations' },
  { id: 'countries', label: 'Countries' },
  { id: 'dispatch', label: 'Dispatch' },
  { id: 'services', label: 'Services' },
  { id: 'subservices', label: 'Sub-Services' },
  { id: 'governance', label: 'Governance' },
];

const VALID_TABS = new Set(TABS.map(t => t.id));

/**
 * Maps a profileType string to the ProfilingModule tab that manages it.
 * Used by Governance deep links and any consumer that needs to navigate
 * to the correct admin tab for a given entity type.
 */
export const PROFILE_TYPE_TO_TAB: Record<string, ProfilingTab> = {
  consignee: 'parties',
  shipper: 'parties',
  consignee_or_shipper: 'parties',
  carrier: 'providers',
  agent: 'providers',
  consolidator: 'providers',
  forwarder: 'providers',
  shipping_line: 'providers',
  trucking_company: 'providers',
  insurer: 'providers',
  port: 'locations',
  warehouse: 'locations',
  country: 'countries',
  driver: 'dispatch',
  helper: 'dispatch',
  vehicle: 'dispatch',
};

export function ProfilingModule() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') ?? 'overview';
  const activeTab: ProfilingTab = VALID_TABS.has(rawTab as ProfilingTab)
    ? (rawTab as ProfilingTab)
    : 'overview';
  const urlQuery = searchParams.get('q') ?? '';

  useEffect(() => {
    if (rawTab === 'assignment_roles') {
      navigate('/admin/users?tab=teams&section=operations', { replace: true });
    }
  }, [navigate, rawTab]);

  function setTab(tab: ProfilingTab) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      next.delete('q');
      return next;
    }, { replace: false });
  }

  if (rawTab === 'assignment_roles') {
    return null;
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Database size={20} style={{ color: '#0F766E' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#12332B', margin: 0 }}>Profiling</h1>
          <p style={{ fontSize: 13, color: '#667085', margin: 0 }}>Master data for booking lookups</p>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #E5E9F0', marginBottom: 24 }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? '#0F766E' : '#667085',
                background: 'none',
                border: 'none',
                borderBottom: active ? '2px solid #0F766E' : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: -1,
                transition: 'color 0.15s',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content — pass initialQuery so tabs can seed their search box from ?q= */}
      {activeTab === 'overview' && <ProfilingOverviewTab />}
      {activeTab === 'parties' && <ProfilingPartiesTab initialQuery={urlQuery} />}
      {activeTab === 'providers' && <ProfilingProvidersTab initialQuery={urlQuery} />}
      {activeTab === 'locations' && <ProfilingLocationsTab initialQuery={urlQuery} />}
      {activeTab === 'countries' && <ProfilingCountriesTab initialQuery={urlQuery} />}
      {activeTab === 'dispatch' && <ProfilingDispatchTab initialQuery={urlQuery} />}
      {activeTab === 'services' && <ProfilingServicesTab initialQuery={urlQuery} />}
      {activeTab === 'subservices' && <ProfilingSubServicesTab initialQuery={urlQuery} />}
      {activeTab === 'governance' && <ProfilingGovernanceTab />}
    </div>
  );
}
