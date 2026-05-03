import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, RefreshCw, ArrowRight } from 'lucide-react';
import { supabase } from '../../../utils/supabase/client';
import { DataTable } from '../../common/DataTable';
import type { ColumnDef } from '../../common/DataTable';
import { profileRegistry } from '../../../config/profiles/profileRegistry';

type ManualEntry = { profile_type: string; manual_value: string; booking_count: number };

const VENDOR_PROFILE_TYPES = new Set([
  'carrier',
  'agent',
  'consolidator',
  'forwarder',
  'shipping_line',
  'trucking_company',
  'insurer',
]);

const RULES = [
  { label: 'Strict select-only', desc: 'customer, user, country — no manual entry allowed', color: 'var(--theme-status-danger-fg)' },
  { label: 'Strict + privileged quick-create', desc: 'port — Executive/manager can create inline', color: 'var(--theme-status-warning-fg)' },
  { label: 'Vendor-managed', desc: 'carrier, agent, consolidator, forwarder, shipping_line, trucking_company, insurer — maintained in Vendors', color: 'var(--theme-status-success-fg)' },
  { label: 'Profiling-managed', desc: 'consignee, shipper, warehouse, driver, helper, vehicle', color: 'var(--theme-action-primary-bg)' },
];

export function ProfilingGovernanceTab() {
  const navigate = useNavigate();
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([]);
  const [loadingManual, setLoadingManual] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  async function loadManual() {
    setLoadingManual(true);
    const { data } = await supabase.rpc('get_manual_profile_usage');
    setManualEntries((data ?? []) as ManualEntry[]);
    setLoadingManual(false);
    setLastRefreshed(new Date());
  }

  useEffect(() => {
    loadManual();
  }, []);

  const manualColumns: ColumnDef<ManualEntry>[] = [
    {
      header: 'Profile Type',
      cell: r => (
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.2px',
            padding: '2px 7px',
            borderRadius: 3,
            background: 'var(--theme-bg-surface-tint)',
            color: 'var(--theme-text-primary)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          {r.profile_type}
        </span>
      ),
    },
    {
      header: 'Manual Value',
      cell: r => <span style={{ color: 'var(--theme-text-primary)', fontWeight: 450, fontSize: 13 }}>{r.manual_value}</span>,
    },
    {
      header: 'Bookings',
      align: 'right',
      width: '100px',
      cell: r => (
        <span
          style={{
            fontWeight: 500,
            fontSize: 13,
            color: r.booking_count >= 5
              ? 'var(--theme-status-danger-fg)'
              : r.booking_count >= 2
                ? 'var(--theme-status-warning-fg)'
                : 'var(--theme-text-muted)',
          }}
        >
          {r.booking_count}
        </span>
      ),
    },
    {
      header: '',
      align: 'right',
      width: '140px',
      cell: r => {
        const vendorManaged = VENDOR_PROFILE_TYPES.has(r.profile_type);
        const hasProfileSection = !!profileRegistry[r.profile_type]?.admin;
        const destination = vendorManaged
          ? `/pricing/vendors?q=${encodeURIComponent(r.manual_value)}`
          : hasProfileSection
            ? `/admin/profiling?section=${r.profile_type}&q=${encodeURIComponent(r.manual_value)}`
            : `/admin/profiling`;

        return (
          <button
            onClick={() => navigate(destination)}
            style={linkBtnStyle}
          >
            {vendorManaged ? 'Open vendors' : 'Link to profile'}
            <ArrowRight size={11} />
          </button>
        );
      },
    },
  ];

  const highUsageManual = manualEntries.filter(entry => entry.booking_count >= 3);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
      {/* Header */}
      <div>
        <h2 style={titleStyle}>Governance</h2>
        <p style={descStyle}>
          Manual-entry usage and the strictness rules that determine which profile fields permit free text.
        </p>
      </div>

      {/* Manual-entry section */}
      <section>
        <div style={sectionHeaderStyle}>
          <div>
            <h3 style={h3Style}>Manual-entry profile usage</h3>
            <p style={subStyle}>
              Values typed manually in booking forms instead of selected from a live profile.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {lastRefreshed && (
              <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                Refreshed {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={loadManual}
              disabled={loadingManual}
              style={refreshBtnStyle}
              title="Refresh"
            >
              <RefreshCw
                size={12}
                style={{ animation: loadingManual ? 'spin 1s linear infinite' : 'none' }}
              />
            </button>
          </div>
        </div>

        {highUsageManual.length > 0 && (
          <div style={warningStyle}>
            <AlertTriangle size={14} style={{ color: 'var(--theme-status-warning-fg)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--theme-text-primary)' }}>
                {highUsageManual.length} {highUsageManual.length === 1 ? 'value appears' : 'values appear'} in 3+ bookings.
              </span>{' '}
              <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>
                Promote them to live profiles to improve data quality.
              </span>
            </div>
          </div>
        )}

        <DataTable
          data={manualEntries}
          columns={manualColumns}
          isLoading={loadingManual}
          emptyMessage="No manual entries — every profile field is linked to a live record."
        />
      </section>

      {/* Rules section */}
      <section>
        <h3 style={h3Style}>Strictness rules</h3>
        <p style={subStyle}>How each profile type behaves in booking forms.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {RULES.map(rule => (
            <div key={rule.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: rule.color, flexShrink: 0, marginTop: 7,
              }} />
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                <span style={{ fontWeight: 500, color: 'var(--theme-text-primary)' }}>{rule.label}</span>
                <span style={{ color: 'var(--theme-text-muted)' }}> — {rule.desc}</span>
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--theme-text-muted)', margin: '16px 0 0', paddingTop: 12, borderTop: '1px solid var(--theme-border-default)' }}>
          To promote a combo field to strict, update its strictness in <code style={codeStyle}>profileRegistry.ts</code> and set{' '}
          <code style={codeStyle}>quickCreateAllowed: false</code>.
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const titleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--theme-text-primary)',
  margin: 0,
  letterSpacing: '-0.2px',
};

const descStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--theme-text-muted)',
  margin: '4px 0 0',
  maxWidth: '60ch',
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
  marginBottom: 16,
};

const h3Style: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--theme-text-primary)',
  margin: 0,
  letterSpacing: '-0.1px',
};

const subStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--theme-text-muted)',
  margin: '4px 0 0',
  maxWidth: '60ch',
};

const refreshBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 6,
  border: '1px solid var(--theme-border-default)',
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-text-muted)',
  cursor: 'pointer',
};

const warningStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  padding: '10px 14px',
  borderRadius: 6,
  background: 'var(--theme-status-warning-bg)',
  border: '1px solid var(--theme-status-warning-border)',
  marginBottom: 12,
};

const linkBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 8px',
  borderRadius: 5,
  border: 'none',
  background: 'transparent',
  color: 'var(--theme-action-primary-bg)',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
};

const codeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11,
  padding: '1px 5px',
  borderRadius: 3,
  background: 'var(--theme-bg-surface-tint)',
  color: 'var(--theme-text-primary)',
};
