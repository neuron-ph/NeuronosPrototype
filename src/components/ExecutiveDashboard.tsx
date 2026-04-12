import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Package, 
  Users, 
  Percent,
  Calendar,
  AlertCircle,
  Clock,
  Target,
  BarChart3,
  Wallet,
  CreditCard,
  Receipt,
  Truck,
  FileCheck,
  AlertTriangle
} from "lucide-react";
import { NeuronCard } from "./NeuronCard";
import { EVoucherApprovalQueue } from "./accounting/evouchers/EVoucherApprovalQueue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useState, useMemo, memo, useRef, useEffect } from "react";

interface ExecutiveDashboardProps {
  currentUser?: { name: string; email: string } | null;
}

interface HeroMetricProps {
  label: string;
  value: string;
  subtext?: string;
  trend: "up" | "down" | "neutral";
  trendValue: string;
  icon: any;
  alert?: boolean;
}

// Hero Metric Card Component - Memoized for performance
const HeroMetric = memo(({ 
  label, 
  value, 
  subtext, 
  trend, 
  trendValue, 
  icon: Icon,
  alert
}: HeroMetricProps) => {
  const isPositive = trend === "up";
  const isNeutral = trend === "neutral";
  
  return (
    <NeuronCard padding="lg" elevation="1" className="relative overflow-hidden">
      {/* Background gradient accent */}
      <div 
        className="absolute top-0 right-0 w-32 h-32 opacity-5"
        style={{
          background: `radial-gradient(circle, ${alert ? '#C94F3D' : 'var(--neuron-brand-green)'} 0%, transparent 70%)`
        }}
      />
      
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12px] text-[var(--theme-text-muted)] font-medium uppercase tracking-wide">
            {label}
          </span>
          <Icon size={20} className={alert ? "text-[var(--theme-status-danger-fg)]" : "text-[var(--theme-text-muted)]"} />
        </div>
        
        <div className="text-[32px] font-semibold text-[var(--theme-text-primary)] leading-none mb-2" style={{ letterSpacing: '-0.8px' }}>
          {value}
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {!isNeutral && (isPositive ? (
              <TrendingUp size={14} className="text-[var(--theme-action-primary-bg)]" />
            ) : (
              <TrendingDown size={14} className="text-[var(--theme-status-danger-fg)]" />
            ))}
            <span className={`text-[13px] font-medium ${isNeutral ? 'text-[var(--theme-text-muted)]' : isPositive ? 'text-[var(--theme-action-primary-bg)]' : 'text-[var(--theme-status-danger-fg)]'}`}>
              {trendValue}
            </span>
          </div>
          
          {subtext && (
            <>
              <span className="text-[#E5ECE9]">·</span>
              <span className="text-[11px] text-[var(--theme-text-muted)]">
                {subtext}
              </span>
            </>
          )}
        </div>
      </div>
    </NeuronCard>
  );
});

HeroMetric.displayName = 'HeroMetric';

export function ExecutiveDashboard({ currentUser }: ExecutiveDashboardProps) {
  const [timeframe, setTimeframe] = useState("month");

  // ⚡ PERFORMANCE: Memoize all chart data to prevent recreation on every render
  const cashFlowData = useMemo(() => [
    { month: "Jun", receivables: 485000, payables: 362000, netPosition: 123000 },
    { month: "Jul", receivables: 512000, payables: 389000, netPosition: 123500 },
    { month: "Aug", receivables: 548000, payables: 401000, netPosition: 147000 },
    { month: "Sep", receivables: 592000, payables: 438000, netPosition: 154000 },
    { month: "Oct", receivables: 634000, payables: 467000, netPosition: 167000 },
    { month: "Nov", receivables: 678000, payables: 495000, netPosition: 183000 }
  ], []);

  const marginByServiceData = useMemo(() => [
    { service: "Ocean FCL", revenue: 285000, cost: 218000, margin: 23.5 },
    { service: "Ocean LCL", revenue: 142000, cost: 115000, margin: 19.0 },
    { service: "Air Freight", revenue: 189000, cost: 156000, margin: 17.5 },
    { service: "Domestic", revenue: 62000, cost: 51000, margin: 17.7 }
  ], []);

  const paymentBehaviorData = useMemo(() => [
    { name: "0-30 Days", value: 45, amount: "₱305K" },
    { name: "31-60 Days", value: 32, amount: "₱217K" },
    { name: "61-90 Days", value: 15, amount: "₱102K" },
    { name: "90+ Days", value: 8, amount: "₱54K" }
  ], []);

  const bookingTrendsData = useMemo(() => [
    { week: "W40", bookings: 42, onTime: 39, revenue: 125000 },
    { week: "W41", bookings: 48, onTime: 45, revenue: 138000 },
    { week: "W42", bookings: 51, onTime: 48, revenue: 147000 },
    { week: "W43", bookings: 45, onTime: 43, revenue: 132000 },
    { week: "W44", bookings: 53, onTime: 51, revenue: 156000 }
  ], []);

  const COLORS = useMemo(() => ({
    green: '#0F766E',
    teal: '#14B8A6',
    orange: '#F97316',
    red: '#EF4444',
    gray: '#9CA3AF'
  }), []);

  const topClientsByProfit = useMemo(() => [
    { 
      client: "Acme Trading Corp", 
      revenue: "₱124,500", 
      margin: "24.2%", 
      bookings: 28, 
      paymentDays: 32,
      status: "Excellent"
    },
    { 
      client: "Global Imports Ltd", 
      revenue: "₱98,200", 
      margin: "22.1%", 
      bookings: 21, 
      paymentDays: 28,
      status: "Excellent"
    },
    { 
      client: "Metro Retail Group", 
      revenue: "₱156,800", 
      margin: "18.5%", 
      bookings: 34, 
      paymentDays: 45,
      status: "Good"
    },
    { 
      client: "Pacific Distribution Co", 
      revenue: "₱87,400", 
      margin: "26.8%", 
      bookings: 15, 
      paymentDays: 21,
      status: "Excellent"
    },
    { 
      client: "Sterling Supply Chain", 
      revenue: "₱73,900", 
      margin: "21.3%", 
      bookings: 18, 
      paymentDays: 38,
      status: "Good"
    }
  ], []);

  const topSubcontractors = useMemo(() => [
    { 
      name: "Pacific Express Logistics", 
      bookings: 47, 
      onTimeRate: "96.2%", 
      avgCost: "₱4,850",
      rating: "Excellent"
    },
    { 
      name: "Golden Bridge Transport", 
      bookings: 38, 
      onTimeRate: "94.7%", 
      avgCost: "₱4,620",
      rating: "Excellent"
    },
    { 
      name: "Metro Freight Services", 
      bookings: 42, 
      onTimeRate: "91.3%", 
      avgCost: "₱5,120",
      rating: "Good"
    },
    { 
      name: "Asia Cargo Solutions", 
      bookings: 29, 
      onTimeRate: "89.6%", 
      avgCost: "₱4,980",
      rating: "Good"
    }
  ], []);

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--theme-bg-surface)" }}>
      <div className="flex-1 overflow-y-auto">
        <div style={{ maxWidth: "1440px", margin: "0 auto", padding: "32px 48px" }}>
          
          {/* Page Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-[32px] font-semibold text-[var(--theme-text-primary)] mb-1" style={{ letterSpacing: '-1.2px' }}>
                Executive Dashboard
              </h1>
              <p className="text-[14px] text-[var(--theme-text-muted)]">
                Cash flow, margins, and coordination performance for asset-light forwarding
              </p>
            </div>
            
            <Select value={timeframe} onValueChange={setTimeframe}>
              <SelectTrigger className="w-[180px] bg-[var(--theme-bg-surface)] border-[var(--theme-border-default)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="quarter">This Quarter</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Critical Alerts Banner */}
          <div className="mb-6 p-4 bg-[var(--theme-status-danger-bg)] border border-[var(--theme-status-danger-border)] rounded-lg flex items-start gap-3">
            <AlertTriangle size={20} className="text-[var(--theme-status-danger-fg)] mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-[14px] font-semibold text-[var(--theme-text-primary)] mb-1">
                Cash Flow Alert
              </div>
              <div className="text-[13px] text-[var(--theme-text-muted)]">
                3 clients with invoices overdue 60+ days totaling <span className="font-semibold text-[var(--theme-text-primary)]">₱54,200</span>. 
                Review payment terms in Client Intelligence section.
              </div>
            </div>
          </div>

          {/* Hero Metrics - Cash Flow Focus */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <HeroMetric
              label="Outstanding Receivables"
              value="₱678K"
              trend="up"
              trendValue="+6.8% MoM"
              subtext="₱183K net position"
              icon={Wallet}
            />
            <HeroMetric
              label="Avg Gross Margin"
              value="21.4%"
              trend="up"
              trendValue="+1.2% vs Q3"
              subtext="Target: 22%"
              icon={Percent}
            />
            <HeroMetric
              label="Active Shipments"
              value="127"
              trend="neutral"
              trendValue="53 bookings/week"
              subtext="Nov avg"
              icon={Package}
            />
            <HeroMetric
              label="Avg Payment Days"
              value="35.2"
              trend="down"
              trendValue="+2.8 days"
              subtext="Target: 30 days"
              icon={Clock}
              alert={true}
            />
          </div>

          {/* Cash Flow Management */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <NeuronCard padding="lg" className="lg:col-span-2" style={{ contain: 'layout style paint', willChange: 'contents' }}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-[18px] font-semibold text-[var(--theme-text-primary)] mb-1">
                    Cash Flow Position
                  </h3>
                  <p className="text-[13px] text-[var(--theme-text-muted)]">
                    Receivables vs payables - your working capital health
                  </p>
                </div>
              </div>
              
              <div style={{ width: '100%', height: 350, contain: 'strict' }}>
                {/* CSS-based bar chart to avoid recharts duplicate key bug */}
                <div className="flex flex-col h-full">
                  {/* Legend */}
                  <div className="flex items-center gap-6 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#0F766E' }} />
                      <span className="text-[12px] text-[var(--theme-text-muted)]">Receivables</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#9CA3AF' }} />
                      <span className="text-[12px] text-[var(--theme-text-muted)]">Payables</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#14B8A6' }} />
                      <span className="text-[12px] text-[var(--theme-text-muted)]">Net Position</span>
                    </div>
                  </div>
                  {/* Bars */}
                  <div className="flex-1 flex items-end gap-3">
                    {cashFlowData.map((item) => {
                      const maxVal = 700000;
                      return (
                        <div key={item.month} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full flex items-end gap-1" style={{ height: 260 }}>
                            <div 
                              className="flex-1 rounded-t-[4px] transition-all hover:opacity-80" 
                              style={{ height: `${(item.receivables / maxVal) * 100}%`, backgroundColor: '#0F766E' }}
                              title={`Receivables: ₱${(item.receivables / 1000).toFixed(0)}K`}
                            />
                            <div 
                              className="flex-1 rounded-t-[4px] transition-all hover:opacity-80" 
                              style={{ height: `${(item.payables / maxVal) * 100}%`, backgroundColor: '#9CA3AF' }}
                              title={`Payables: ₱${(item.payables / 1000).toFixed(0)}K`}
                            />
                            <div 
                              className="flex-1 rounded-t-[4px] transition-all hover:opacity-80" 
                              style={{ height: `${(item.netPosition / maxVal) * 100}%`, backgroundColor: '#14B8A6' }}
                              title={`Net Position: ₱${(item.netPosition / 1000).toFixed(0)}K`}
                            />
                          </div>
                          <div className="border-t border-[var(--theme-border-default)] w-full pt-2">
                            <span className="text-[12px] text-[var(--theme-text-muted)] block text-center">{item.month}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </NeuronCard>

            <NeuronCard padding="lg">
              <div className="mb-6">
                <h3 className="text-[18px] font-semibold text-[var(--theme-text-primary)] mb-1">
                  Payment Aging
                </h3>
                <p className="text-[13px] text-[var(--theme-text-muted)]">
                  Client receivables breakdown
                </p>
              </div>
              
              <div className="space-y-4">
                {paymentBehaviorData.map((item, idx) => (
                  <div key={idx}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[13px] font-medium text-[var(--theme-text-primary)]">{item.name}</span>
                      <span className="text-[13px] font-semibold text-[var(--theme-action-primary-bg)]">{item.amount}</span>
                    </div>
                    <div className="w-full h-2 bg-[#E5E9F0] rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all"
                        style={{ 
                          width: `${item.value}%`,
                          backgroundColor: idx === 0 ? '#0F766E' : idx === 1 ? '#14B8A6' : idx === 2 ? '#F97316' : '#EF4444'
                        }}
                      />
                    </div>
                    <div className="text-[11px] text-[var(--theme-text-muted)] mt-1">{item.value}% of total</div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-[var(--theme-border-default)]">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[var(--theme-text-muted)]">Total Outstanding</span>
                  <span className="text-[16px] font-semibold text-[var(--theme-text-primary)]">₱678,000</span>
                </div>
              </div>
            </NeuronCard>
          </div>

          {/* Margin Analysis & Booking Trends */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <NeuronCard padding="lg">
              <div className="mb-6">
                <h3 className="text-[18px] font-semibold text-[var(--theme-text-primary)] mb-1">
                  Margin by Service Type
                </h3>
                <p className="text-[13px] text-[var(--theme-text-muted)]">
                  Where you make the most profit
                </p>
              </div>
              
              <div className="space-y-4">
                {marginByServiceData.map((item, idx) => (
                  <div key={idx} className="p-4 bg-[var(--theme-bg-page)] rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[14px] font-medium text-[var(--theme-text-primary)]">{item.service}</span>
                      <span className="text-[14px] font-semibold text-[var(--theme-action-primary-bg)]">{item.margin}%</span>
                    </div>
                    <div className="flex items-center gap-4 text-[12px] text-[var(--theme-text-muted)]">
                      <span>Revenue: ₱{(item.revenue / 1000).toFixed(0)}K</span>
                      <span>·</span>
                      <span>Cost: ₱{(item.cost / 1000).toFixed(0)}K</span>
                      <span>·</span>
                      <span className="font-medium text-[var(--theme-text-primary)]">
                        Profit: ₱{((item.revenue - item.cost) / 1000).toFixed(0)}K
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </NeuronCard>

            <NeuronCard padding="lg" style={{ contain: 'layout style paint', willChange: 'contents' }}>
              <div className="mb-6">
                <h3 className="text-[18px] font-semibold text-[var(--theme-text-primary)] mb-1">
                  Booking Volume & On-Time Rate
                </h3>
                <p className="text-[13px] text-[var(--theme-text-muted)]">
                  Weekly coordination performance
                </p>
              </div>
              
              <div style={{ width: '100%', height: 300, contain: 'strict' }}>
                {/* CSS-based bar chart to avoid recharts duplicate key bug */}
                <div className="flex flex-col h-full">
                  {/* Legend */}
                  <div className="flex items-center gap-6 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#9CA3AF' }} />
                      <span className="text-[12px] text-[var(--theme-text-muted)]">Total Bookings</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#0F766E' }} />
                      <span className="text-[12px] text-[var(--theme-text-muted)]">On-Time Deliveries</span>
                    </div>
                  </div>
                  {/* Bars */}
                  <div className="flex-1 flex items-end gap-4">
                    {bookingTrendsData.map((item) => {
                      const maxVal = 60;
                      return (
                        <div key={item.week} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full flex items-end gap-1" style={{ height: 200 }}>
                            <div 
                              className="flex-1 rounded-t-[4px] transition-all hover:opacity-80" 
                              style={{ height: `${(item.bookings / maxVal) * 100}%`, backgroundColor: '#9CA3AF' }}
                              title={`Total Bookings: ${item.bookings}`}
                            />
                            <div 
                              className="flex-1 rounded-t-[4px] transition-all hover:opacity-80" 
                              style={{ height: `${(item.onTime / maxVal) * 100}%`, backgroundColor: '#0F766E' }}
                              title={`On-Time: ${item.onTime}`}
                            />
                          </div>
                          <div className="border-t border-[var(--theme-border-default)] w-full pt-2">
                            <span className="text-[12px] text-[var(--theme-text-muted)] block text-center">{item.week}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </NeuronCard>
          </div>

          {/* Client Intelligence - Profitability Focus */}
          <div className="mb-8">
            <NeuronCard padding="lg">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-[18px] font-semibold text-[var(--theme-text-primary)] mb-1">
                    Top Clients by Profitability
                  </h3>
                  <p className="text-[13px] text-[var(--theme-text-muted)]">
                    Not just revenue — who actually makes you money
                  </p>
                </div>
                <button className="px-4 py-2 text-[13px] font-medium text-[var(--theme-action-primary-bg)] hover:bg-[var(--theme-bg-surface-tint)] rounded-lg transition-colors">
                  View All Clients
                </button>
              </div>

              <div className="overflow-hidden rounded-lg border border-[var(--theme-border-default)]">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[var(--theme-bg-page)] border-b border-[var(--theme-border-default)]">
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-wide">
                        Client
                      </th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-wide">
                        Revenue (MTD)
                      </th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-wide">
                        Margin
                      </th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-wide">
                        Bookings
                      </th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-wide">
                        Avg Payment Days
                      </th>
                      <th className="px-4 py-3 text-center text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-wide">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topClientsByProfit.map((client, idx) => (
                      <tr 
                        key={idx} 
                        className="border-b border-[var(--theme-border-default)] last:border-0 hover:bg-[var(--theme-bg-page)] transition-colors"
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[var(--theme-bg-surface-tint)] flex items-center justify-center">
                              <Users size={14} className="text-[var(--theme-action-primary-bg)]" />
                            </div>
                            <span className="text-[13px] font-medium text-[var(--theme-text-primary)]">
                              {client.client}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right text-[13px] font-semibold text-[var(--theme-text-primary)]">
                          {client.revenue}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[var(--theme-bg-surface-tint)] text-[12px] font-semibold text-[var(--theme-action-primary-bg)]">
                            {client.margin}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right text-[13px] text-[var(--theme-text-muted)]">
                          {client.bookings}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className={`text-[13px] font-medium ${
                            client.paymentDays <= 30 ? 'text-[var(--theme-action-primary-bg)]' : 
                            client.paymentDays <= 45 ? 'text-[#F97316]' : 
                            'text-[var(--theme-status-danger-fg)]'
                          }`}>
                            {client.paymentDays} days
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-medium ${
                            client.status === 'Excellent' 
                              ? 'bg-[var(--theme-bg-surface-tint)] text-[var(--theme-action-primary-bg)]' 
                              : 'bg-[var(--theme-status-warning-bg)] text-[var(--theme-status-warning-fg)]'
                          }`}>
                            {client.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </NeuronCard>
          </div>

          {/* Subcontractor Performance */}
          <div className="mb-8">
            <NeuronCard padding="lg">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-[18px] font-semibold text-[var(--theme-text-primary)] mb-1">
                    Reliable Subcontractors
                  </h3>
                  <p className="text-[13px] text-[var(--theme-text-muted)]">
                    Your coordination network performance
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {topSubcontractors.map((sub, idx) => (
                  <div 
                    key={idx}
                    className="p-4 bg-[var(--theme-bg-page)] rounded-lg border border-[var(--theme-border-default)] hover:border-[var(--theme-action-primary-bg)] transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[var(--theme-bg-surface-tint)] flex items-center justify-center">
                          <Truck size={18} className="text-[var(--theme-action-primary-bg)]" />
                        </div>
                        <div>
                          <div className="text-[14px] font-medium text-[var(--theme-text-primary)] mb-0.5">
                            {sub.name}
                          </div>
                          <div className="text-[11px] text-[var(--theme-text-muted)]">
                            {sub.bookings} bookings this month
                          </div>
                        </div>
                      </div>
                      <span className={`inline-flex px-2 py-1 rounded text-[10px] font-semibold ${
                        sub.rating === 'Excellent' 
                          ? 'bg-[var(--theme-bg-surface-tint)] text-[var(--theme-action-primary-bg)]' 
                          : 'bg-[var(--theme-status-warning-bg)] text-[var(--theme-status-warning-fg)]'
                      }`}>
                        {sub.rating}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] text-[var(--theme-text-muted)] mb-1">On-Time Rate</div>
                        <div className="text-[15px] font-semibold text-[var(--theme-action-primary-bg)]">{sub.onTimeRate}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[var(--theme-text-muted)] mb-1">Avg Cost</div>
                        <div className="text-[15px] font-semibold text-[var(--theme-text-primary)]">{sub.avgCost}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </NeuronCard>
          </div>

          {/* Key Risk Indicators */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <NeuronCard padding="lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[var(--theme-status-danger-bg)] flex items-center justify-center">
                  <AlertCircle size={18} className="text-[var(--theme-status-danger-fg)]" />
                </div>
                <div>
                  <div className="text-[13px] text-[var(--theme-text-muted)]">Overdue Payments</div>
                  <div className="text-[20px] font-semibold text-[var(--theme-text-primary)]">₱54,200</div>
                </div>
              </div>
              <div className="text-[12px] text-[var(--theme-text-muted)]">
                3 clients with 60+ day overdue invoices
              </div>
            </NeuronCard>

            <NeuronCard padding="lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[var(--theme-status-warning-bg)] flex items-center justify-center">
                  <Clock size={18} className="text-[#F97316]" />
                </div>
                <div>
                  <div className="text-[13px] text-[var(--theme-text-muted)]">Delayed Shipments</div>
                  <div className="text-[20px] font-semibold text-[var(--theme-text-primary)]">6 Active</div>
                </div>
              </div>
              <div className="text-[12px] text-[var(--theme-text-muted)]">
                2 critical delays requiring intervention
              </div>
            </NeuronCard>

            <NeuronCard padding="lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[var(--theme-bg-surface-tint)] flex items-center justify-center">
                  <FileCheck size={18} className="text-[var(--theme-action-primary-bg)]" />
                </div>
                <div>
                  <div className="text-[13px] text-[var(--theme-text-muted)]">Doc Compliance</div>
                  <div className="text-[20px] font-semibold text-[var(--theme-text-primary)]">94.3%</div>
                </div>
              </div>
              <div className="text-[12px] text-[var(--theme-text-muted)]">
                4 shipments pending customs docs
              </div>
            </NeuronCard>
          </div>

        </div>

        {/* CEO E-Voucher Approval Queue */}
        <EVoucherApprovalQueue
          view="pending-ceo"
          currentUser={currentUser ? { id: "", name: currentUser.name, email: currentUser.email, department: "Executive", role: "director" } : undefined}
          title="E-Vouchers Awaiting CEO Approval"
        />
      </div>
    </div>
  );

}