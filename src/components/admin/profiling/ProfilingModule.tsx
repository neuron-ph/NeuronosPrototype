import React, { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Shield } from 'lucide-react';
import { profileRegistry } from '../../../config/profiles/profileRegistry';
import { ProfileSection } from './ProfileSection';
import { ProfilingGovernanceTab } from './ProfilingGovernanceTab';

const GOVERNANCE_KEY = 'governance';

type SidebarItem = {
  key: string;
  label: string;
  description: string;
  isGovernance?: boolean;
};

export function ProfilingModule() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const sidebarItems: SidebarItem[] = useMemo(() => {
    const profileSections: SidebarItem[] = Object.entries(profileRegistry)
      // Vendor-managed types (anything with a providerTag) live in /pricing/vendors,
      // not Profiling — they require id-generation and richer fields the Vendors
      // module owns. Excluding them from the sidebar matches the governance rules.
      .filter(([, entry]) => !!entry.admin && !entry.providerTag)
      .map(([key, entry]) => ({
        key,
        label: entry.admin!.pluralLabel,
        description: entry.admin!.description,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [
      ...profileSections,
      { key: GOVERNANCE_KEY, label: 'Governance', description: 'Manual-entry risk and strictness rules.', isGovernance: true },
    ];
  }, []);

  const validKeys = useMemo(() => new Set(sidebarItems.map(s => s.key)), [sidebarItems]);

  const rawTab = searchParams.get('tab');
  const rawSection = searchParams.get('section');
  const urlQuery = searchParams.get('q') ?? '';

  // Legacy redirects
  useEffect(() => {
    if (rawTab === 'assignment_roles') {
      navigate('/admin/users?tab=teams&section=operations', { replace: true });
      return;
    }
    if (rawTab === 'providers' || rawSection === 'providers') {
      const query = urlQuery ? `?q=${encodeURIComponent(urlQuery)}` : '';
      navigate(`/pricing/vendors${query}`, { replace: true });
      return;
    }
    // Vendor-managed profile types live in /pricing/vendors
    if (rawSection && profileRegistry[rawSection]?.providerTag) {
      const query = urlQuery ? `?q=${encodeURIComponent(urlQuery)}` : '';
      navigate(`/pricing/vendors${query}`, { replace: true });
    }
  }, [navigate, rawTab, rawSection, urlQuery]);

  const selected = (rawSection && validKeys.has(rawSection)) ? rawSection : sidebarItems[0]?.key ?? GOVERNANCE_KEY;
  const selectedItem = sidebarItems.find(s => s.key === selected);

  function setSelected(key: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('section', key);
      next.delete('q');
      return next;
    }, { replace: false });
  }

  if (rawTab === 'assignment_roles') return null;

  return (
    <div style={{ backgroundColor: 'var(--theme-bg-surface)', minHeight: '100%' }}>
      <div style={{ padding: '32px 48px 56px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={pageTitleStyle}>Profiling</h1>
          <p style={pageSubtitleStyle}>Define and govern booking dropdowns across Neuron.</p>
        </div>

        <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start' }}>
          <Sidebar
            items={sidebarItems}
            selected={selected}
            onSelect={setSelected}
          />
          <div style={contentStyle}>
            {selectedItem?.isGovernance ? (
              <ProfilingGovernanceTab />
            ) : (
              <ProfileSection key={selected} profileType={selected} initialQuery={urlQuery} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Sidebar({
  items,
  selected,
  onSelect,
}: {
  items: SidebarItem[];
  selected: string;
  onSelect: (key: string) => void;
}) {
  const profileItems = items.filter(i => !i.isGovernance);
  const systemItems = items.filter(i => i.isGovernance);

  return (
    <nav style={sidebarStyle}>
      <div style={sidebarGroupLabelStyle}>Profiles</div>
      {profileItems.map(item => (
        <SidebarButton key={item.key} item={item} active={item.key === selected} onSelect={onSelect} />
      ))}
      {systemItems.length > 0 && (
        <>
          <div style={{ ...sidebarGroupLabelStyle, marginTop: 16 }}>System</div>
          {systemItems.map(item => (
            <SidebarButton key={item.key} item={item} active={item.key === selected} onSelect={onSelect} />
          ))}
        </>
      )}
    </nav>
  );
}

function SidebarButton({
  item,
  active,
  onSelect,
}: {
  item: SidebarItem;
  active: boolean;
  onSelect: (key: string) => void;
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={() => onSelect(item.key)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...sidebarButtonStyle,
        ...(active ? sidebarButtonActiveStyle : hover ? sidebarButtonHoverStyle : {}),
      }}
      title={item.description}
    >
      {item.isGovernance && <Shield size={13} style={{ flexShrink: 0, opacity: 0.7 }} />}
      <span>{item.label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const pageTitleStyle: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: 600,
  color: 'var(--theme-text-primary)',
  margin: 0,
  marginBottom: '6px',
  letterSpacing: '-0.6px',
};

const pageSubtitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '13px',
  color: 'var(--theme-text-muted)',
};

const sidebarStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  width: 196,
  flexShrink: 0,
  position: 'sticky',
  top: 24,
};

const sidebarGroupLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--theme-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.6px',
  padding: '0 10px 6px',
  opacity: 0.7,
};

const sidebarButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  textAlign: 'left',
  padding: '7px 10px',
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  color: 'var(--theme-text-muted)',
  fontSize: 13,
  fontWeight: 450,
  cursor: 'pointer',
  transition: 'background 120ms ease, color 120ms ease',
};

const sidebarButtonHoverStyle: React.CSSProperties = {
  background: 'var(--theme-bg-surface-tint)',
  color: 'var(--theme-text-primary)',
};

const sidebarButtonActiveStyle: React.CSSProperties = {
  background: 'var(--theme-state-selected)',
  color: 'var(--theme-text-primary)',
  fontWeight: 500,
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};
