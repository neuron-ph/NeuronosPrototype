import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, BarChart2, RefreshCw } from 'lucide-react';
import { supabase } from '../../../utils/supabase/client';
import { DataTable } from '../../common/DataTable';
import type { ColumnDef } from '../../common/DataTable';
import { PROFILE_TYPE_TO_SECTION } from './ProfilingModule';

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
            padding: '2px 8px',
            borderRadius: 4,
            background: '#EFF6FF',
            color: '#3B82F6',
          }}
        >
          {r.profile_type}
        </span>
      ),
    },
    { header: 'Manual Value', cell: r => <span style={{ color: '#12332B', fontWeight: 500 }}>{r.manual_value}</span> },
    {
      header: 'Active Bookings',
      align: 'right',
      cell: r => (
        <span
          style={{
            fontWeight: 600,
            color: r.booking_count >= 5 ? '#DC2626' : r.booking_count >= 2 ? '#F59E0B' : '#667085',
          }}
        >
          {r.booking_count}
        </span>
      ),
    },
    {
      header: 'Action',
      cell: r => {
        const vendorManaged = VENDOR_PROFILE_TYPES.has(r.profile_type);
        const section = PROFILE_TYPE_TO_SECTION[r.profile_type] ?? 'parties';
        const destination = vendorManaged
          ? `/pricing/vendors?q=${encodeURIComponent(r.manual_value)}`
          : `/admin/profiling?section=${section}&q=${encodeURIComponent(r.manual_value)}`;

        return (
          <span
            style={{ fontSize: 12, color: '#0F766E', cursor: 'pointer', fontWeight: 500 }}
            onClick={() => navigate(destination)}
          >
            {vendorManaged ? 'Open vendors →' : 'Link to profile →'}
          </span>
        );
      },
    },
  ];

  const highUsageManual = manualEntries.filter(entry => entry.booking_count >= 3);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '4px 0' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <BarChart2 size={16} style={{ color: '#0F766E' }} />
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#12332B', margin: 0 }}>Manual-Entry Profile Usage</h3>
          <button
            onClick={loadManual}
            disabled={loadingManual}
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid #E5E9F0',
              background: '#FFFFFF',
              fontSize: 12,
              color: '#667085',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={12} style={{ animation: loadingManual ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
        <p style={{ fontSize: 13, color: '#667085', marginBottom: 12 }}>
          These values were typed manually in booking forms instead of selected from a live profile. Create profile records
          for repeated values and route vendor-like entries to the Vendors module.
        </p>
        {lastRefreshed && (
          <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>
            Last refreshed: {lastRefreshed.toLocaleTimeString()}
          </p>
        )}
        <DataTable
          data={manualEntries}
          columns={manualColumns}
          isLoading={loadingManual}
          emptyMessage="No manual entries found — all profile fields are linked."
        />
      </div>

      {highUsageManual.length > 0 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <AlertTriangle size={15} style={{ color: '#D97706' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#92400E' }}>
              High-Frequency Manual Entries ({highUsageManual.length})
            </span>
          </div>
          <p style={{ fontSize: 13, color: '#92400E', margin: '0 0 10px' }}>
            These manual values appear in 3+ active bookings. Creating profiles for them will improve data quality and
            enable live linking.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {highUsageManual.map(entry => (
              <span
                key={`${entry.profile_type}-${entry.manual_value}`}
                style={{
                  fontSize: 12,
                  padding: '4px 10px',
                  borderRadius: 20,
                  background: '#FEF3C7',
                  color: '#92400E',
                  fontWeight: 500,
                }}
              >
                {entry.manual_value} ({entry.profile_type}) × {entry.booking_count}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: '#F7FAF8', borderRadius: 10, padding: '16px 20px', border: '1px solid #E5E9F0' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#12332B', margin: '0 0 12px' }}>Governance Rules</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'Strict select-only types', desc: 'customer, user, country — no manual entry allowed', color: '#DC2626' },
            { label: 'Strict + privileged quick-create', desc: 'port — Executive/manager can create inline', color: '#F59E0B' },
            {
              label: 'Vendor-managed combo types',
              desc: 'carrier, agent, consolidator, forwarder, shipping_line, trucking_company, insurer — maintained in Vendors',
              color: '#10B981',
            },
            {
              label: 'Profiling-managed combo types',
              desc: 'consignee, shipper, warehouse, driver, helper, vehicle',
              color: '#0F766E',
            },
          ].map(rule => (
            <div key={rule.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: rule.color, flexShrink: 0, marginTop: 5 }} />
              <div>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#12332B' }}>{rule.label}: </span>
                <span style={{ fontSize: 13, color: '#667085' }}>{rule.desc}</span>
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: '#667085', margin: '12px 0 0' }}>
          To promote a combo field to strict once adoption is high enough, update its strictness in <code>profileRegistry.ts</code>{' '}
          and set <code>quickCreateAllowed: false</code>.
        </p>
      </div>
    </div>
  );
}
