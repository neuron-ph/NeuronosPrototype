import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Search } from 'lucide-react';
import { supabase } from '../../../utils/supabase/client';
import { ProfilingPartiesTab } from './ProfilingPartiesTab';
import { ProfilingLocationsTab } from './ProfilingLocationsTab';
import { ProfilingCountriesTab } from './ProfilingCountriesTab';
import { ProfilingDispatchTab } from './ProfilingDispatchTab';
import { ProfilingGovernanceTab } from './ProfilingGovernanceTab';

export type ProfilingSection =
  | 'parties'
  | 'locations'
  | 'countries'
  | 'dispatch-people'
  | 'vehicles'
  | 'governance';

type LegacyProfilingTab =
  | 'overview'
  | 'parties'
  | 'locations'
  | 'countries'
  | 'dispatch'
  | 'governance';

type SummaryCounts = {
  parties: number;
  locations: number;
  countries: number;
  people: number;
  vehicles: number;
  manualEntries: number;
};

type ManualUsageRow = { booking_count: number };

const VALID_SECTIONS = new Set<ProfilingSection>([
  'parties',
  'locations',
  'countries',
  'dispatch-people',
  'vehicles',
  'governance',
]);

const LEGACY_TAB_TO_SECTION: Record<LegacyProfilingTab, ProfilingSection | null> = {
  overview: null,
  parties: 'parties',
  locations: 'locations',
  countries: 'countries',
  dispatch: 'dispatch-people',
  governance: 'governance',
};

export const PROFILE_TYPE_TO_SECTION: Record<string, ProfilingSection> = {
  consignee: 'parties',
  shipper: 'parties',
  consignee_or_shipper: 'parties',
  port: 'locations',
  warehouse: 'locations',
  country: 'countries',
  driver: 'dispatch-people',
  helper: 'dispatch-people',
  vehicle: 'vehicles',
};

const SECTION_META: Array<{
  id: ProfilingSection;
  label: string;
  description: string;
  countLabel: (summary: SummaryCounts) => string;
}> = [
  {
    id: 'parties',
    label: 'Trade Parties',
    description: 'Consignees and shippers used in booking dropdowns.',
    countLabel: summary => `${summary.parties.toLocaleString()} active records`,
  },
  {
    id: 'locations',
    label: 'Locations',
    description: 'Ports and warehouses with lookup transport metadata.',
    countLabel: summary => `${summary.locations.toLocaleString()} active locations`,
  },
  {
    id: 'countries',
    label: 'Countries',
    description: 'Country records, priority order, and active availability.',
    countLabel: summary => `${summary.countries.toLocaleString()} active countries`,
  },
  {
    id: 'dispatch-people',
    label: 'Dispatch People',
    description: 'Drivers and helpers available to dispatch dropdowns.',
    countLabel: summary => `${summary.people.toLocaleString()} active people`,
  },
  {
    id: 'vehicles',
    label: 'Vehicles',
    description: 'Vehicle records and capacity references for dispatch.',
    countLabel: summary => `${summary.vehicles.toLocaleString()} active vehicles`,
  },
  {
    id: 'governance',
    label: 'Governance',
    description: 'Manual-entry risk, strictness rules, and cleanup signals.',
    countLabel: summary => `${summary.manualEntries.toLocaleString()} manual values in circulation`,
  },
];

export function ProfilingModule() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState<SummaryCounts>({
    parties: 0,
    locations: 0,
    countries: 0,
    people: 0,
    vehicles: 0,
    manualEntries: 0,
  });

  const rawTab = searchParams.get('tab');
  const rawSection = searchParams.get('section');
  const urlQuery = searchParams.get('q') ?? '';
  const selectedSection: ProfilingSection | null = VALID_SECTIONS.has(rawSection as ProfilingSection)
    ? (rawSection as ProfilingSection)
    : null;
  const queryTargetSection = selectedSection ?? 'parties';

  useEffect(() => {
    if (rawTab === 'assignment_roles') {
      navigate('/admin/users?tab=teams&section=operations', { replace: true });
      return;
    }
    if (rawTab === 'providers' || rawSection === 'providers') {
      const query = urlQuery ? `?q=${encodeURIComponent(urlQuery)}` : '';
      navigate(`/pricing/vendors${query}`, { replace: true });
    }
  }, [navigate, rawTab, rawSection, urlQuery]);

  useEffect(() => {
    if (!rawTab || rawTab === 'assignment_roles' || selectedSection) return;

    const mapped = LEGACY_TAB_TO_SECTION[rawTab as LegacyProfilingTab];
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('tab');
      if (mapped) next.set('section', mapped);
      return next;
    }, { replace: true });
  }, [rawTab, selectedSection, setSearchParams]);

  useEffect(() => {
    async function loadSummary() {
      const [parties, locations, countries, people, vehicles, manual] = await Promise.all([
        supabase.from('trade_parties').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('profile_locations').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('profile_countries').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('dispatch_people').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.rpc('get_manual_profile_usage'),
      ]);

      const manualRows = ((manual.data ?? []) as ManualUsageRow[]).filter(row => row.booking_count > 0);

      setSummary({
        parties: parties.count ?? 0,
        locations: locations.count ?? 0,
        countries: countries.count ?? 0,
        people: people.count ?? 0,
        vehicles: vehicles.count ?? 0,
        manualEntries: manualRows.length,
      });
    }

    loadSummary();
  }, []);

  useEffect(() => {
    if (!selectedSection) return;

    const timer = window.setTimeout(() => {
      const element = document.getElementById(`profiling-${selectedSection}`);
      if (!element) return;
      const top = element.getBoundingClientRect().top + window.scrollY - 124;
      window.scrollTo({ top, behavior: 'smooth' });
    }, 60);

    return () => window.clearTimeout(timer);
  }, [selectedSection]);

  function setFocusedSection(section: ProfilingSection) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('section', section);
      return next;
    }, { replace: false });
  }

  function setToolbarQuery(value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('section', queryTargetSection);
      if (value.trim()) next.set('q', value);
      else next.delete('q');
      return next;
    }, { replace: false });
  }

  function clearToolbarState() {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('section');
      next.delete('q');
      return next;
    }, { replace: false });
  }

  if (rawTab === 'assignment_roles') {
    return null;
  }

  return (
    <div style={{ backgroundColor: 'var(--theme-bg-surface)' }}>
      <div style={{ padding: '32px 48px 48px' }}>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h1 style={pageTitleStyle}>Profiling</h1>
            <p style={pageSubtitleStyle}>Define and govern booking dropdowns across Neuron.</p>
          </div>

          <div style={toolbarCardStyle}>
            <div style={toolbarRowStyle}>
              <div style={{ position: 'relative', flex: '1 1 340px', minWidth: 240 }}>
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: 10,
                    transform: 'translateY(-50%)',
                    color: 'var(--theme-text-muted)',
                  }}
                />
                <input
                  value={urlQuery}
                  onChange={e => setToolbarQuery(e.target.value)}
                  placeholder={`Search ${SECTION_META.find(section => section.id === queryTargetSection)?.label.toLowerCase() ?? 'profiles'}...`}
                  style={{ ...inputStyle, width: '100%', paddingLeft: 32 }}
                />
              </div>

              <select
                value={queryTargetSection}
                onChange={e => setFocusedSection(e.target.value as ProfilingSection)}
                style={{ ...selectStyle, width: 220, minWidth: 180 }}
              >
                {SECTION_META.map(section => (
                  <option key={section.id} value={section.id}>
                    {section.label}
                  </option>
                ))}
              </select>

              <button onClick={clearToolbarState} style={quietButtonStyle}>
                Clear
              </button>
            </div>

            <div style={toolbarJumpRowStyle}>
              {SECTION_META.map(section => {
                const active = selectedSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setFocusedSection(section.id)}
                    style={{
                      ...chipButtonStyle,
                      ...(active
                        ? {
                            backgroundColor: 'var(--theme-bg-surface-tint)',
                            borderColor: 'var(--theme-action-primary-bg)',
                            color: 'var(--theme-action-primary-bg)',
                          }
                        : {}),
                    }}
                  >
                    {section.label}
                  </button>
                );
              })}
            </div>
          </div>

          {SECTION_META.map(section => (
            <ProfilingWorkspaceSection
              key={section.id}
              id={section.id}
              label={section.label}
              description={section.description}
              countLabel={section.countLabel(summary)}
            >
              {section.id === 'parties' && (
                <ProfilingPartiesTab initialQuery={queryTargetSection === 'parties' ? urlQuery : ''} />
              )}
              {section.id === 'locations' && (
                <ProfilingLocationsTab initialQuery={queryTargetSection === 'locations' ? urlQuery : ''} />
              )}
              {section.id === 'countries' && (
                <ProfilingCountriesTab initialQuery={queryTargetSection === 'countries' ? urlQuery : ''} />
              )}
              {section.id === 'dispatch-people' && (
                <ProfilingDispatchTab
                  initialQuery={queryTargetSection === 'dispatch-people' ? urlQuery : ''}
                  initialSubTab="people"
                  lockedSubTab="people"
                />
              )}
              {section.id === 'vehicles' && (
                <ProfilingDispatchTab
                  initialQuery={queryTargetSection === 'vehicles' ? urlQuery : ''}
                  initialSubTab="vehicles"
                  lockedSubTab="vehicles"
                />
              )}
              {section.id === 'governance' && <ProfilingGovernanceTab />}
            </ProfilingWorkspaceSection>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfilingWorkspaceSection({
  id,
  label,
  description,
  countLabel,
  children,
}: {
  id: ProfilingSection;
  label: string;
  description: string;
  countLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div id={`profiling-${id}`} style={{ scrollMarginTop: 124 }}>
      <p style={sectionTitleStyle}>{label}</p>
      <div style={sectionCardStyle}>
        <div
          style={{
            padding: '14px 0',
            borderBottom: '1px solid var(--theme-border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 500, color: 'var(--theme-text-primary)' }}>
              {label}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '12px', lineHeight: '16px', color: 'var(--theme-text-muted)' }}>
              {description}
            </p>
          </div>
          <span style={countBadgeStyle}>{countLabel}</span>
        </div>
        <div style={{ padding: '16px 0 4px' }}>{children}</div>
      </div>
    </div>
  );
}

const pageTitleStyle: React.CSSProperties = {
  fontSize: '32px',
  fontWeight: 600,
  color: 'var(--theme-text-primary)',
  margin: 0,
  marginBottom: '4px',
  letterSpacing: '-1.2px',
};

const pageSubtitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '14px',
  color: 'var(--theme-text-muted)',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--theme-text-primary)',
  margin: '0 0 8px',
};

const sectionCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--theme-bg-surface)',
  border: '1px solid var(--theme-border-default)',
  borderRadius: '12px',
  padding: '0 20px',
};

const toolbarCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--theme-bg-surface)',
  border: '1px solid var(--theme-border-default)',
  borderRadius: '12px',
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const toolbarRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
};

const toolbarJumpRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  paddingTop: 12,
  borderTop: '1px solid var(--theme-border-subtle)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '36px',
  border: '1px solid var(--theme-border-default)',
  borderRadius: '8px',
  padding: '0 12px',
  fontSize: '13px',
  color: 'var(--theme-text-primary)',
  backgroundColor: 'var(--theme-bg-surface)',
  outline: 'none',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none',
  paddingRight: '28px',
  backgroundImage:
    `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23667085' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 8px center',
};

const quietButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  height: '32px',
  padding: '0 12px',
  borderRadius: '8px',
  border: '1px solid var(--theme-border-default)',
  backgroundColor: 'transparent',
  color: 'var(--theme-text-secondary)',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
};

const chipButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '32px',
  padding: '0 12px',
  borderRadius: '999px',
  border: '1px solid var(--theme-border-default)',
  backgroundColor: 'transparent',
  color: 'var(--theme-text-secondary)',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
};

const countBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '24px',
  padding: '0 9px',
  borderRadius: '999px',
  border: '1px solid var(--theme-border-default)',
  color: 'var(--theme-text-secondary)',
  fontSize: '12px',
  fontWeight: 500,
  whiteSpace: 'nowrap',
};
