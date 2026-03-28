// AuditingSummary — Per-catalog-item aggregation with data quality progress bar
// Styled 1:1 with ContractsList.tsx layout tokens

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { Loader2, AlertCircle, BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { toast } from "../ui/toast-utils";

// ==================== TYPES ====================

interface SummaryItem {
  catalog_item_id: string;
  name: string;
  type: string;
  booking_count: number;
  line_item_count: number;
  total_amount: number;
  avg_per_booking: number;
}

interface SummaryMeta {
  total_catalog_items: number;
  total_line_items: number;
  unlinked_count: number;
  linked_count: number;
  linked_percentage: number;
  period: string;
  service_type: string;
  view: string;
}

interface SummaryData {
  items: SummaryItem[];
  meta: SummaryMeta;
}

type ViewMode = "charges" | "expenses" | "both";

const SERVICE_TYPES = ["All", "Brokerage", "Trucking", "Forwarding", "Marine Insurance", "Others"];

// ==================== NUMBER FORMATTING ====================

const numFmt = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function fmtAmount(amount: number | undefined | null): { text: string; isNegative: boolean; isEmpty: boolean } {
  if (amount === undefined || amount === null || amount === 0) {
    return { text: "\u2014", isNegative: false, isEmpty: true };
  }
  if (amount < 0) {
    return { text: `(${numFmt.format(Math.abs(amount))})`, isNegative: true, isEmpty: false };
  }
  return { text: numFmt.format(amount), isNegative: false, isEmpty: false };
}

// ==================== MONTH HELPERS ====================

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatPeriodLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function shiftPeriod(period: string, delta: number): string {
  const [year, month] = period.split("-").map(Number);
  const d = new Date(year, month - 1 + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ==================== GRID TEMPLATE ====================

const GRID_COLS = "1fr 80px 90px 130px 120px";

// ==================== COMPONENT ====================

export function AuditingSummary() {
  const [period, setPeriod] = useState(getCurrentPeriod);
  const [serviceType, setServiceType] = useState("All");
  const [view, setView] = useState<ViewMode>("both");

  const { data: lineItems = [] } = useQuery({
    queryKey: ["billing_line_items", "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from('billing_line_items').select('*');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: catalogItems = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: queryKeys.catalog.items(),
    queryFn: async () => {
      const { data, error } = await supabase.from('catalog_items').select('id, name, category_id');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const error = queryError ? String(queryError) : null;

  // Aggregate by catalog item (client-side)
  const data: SummaryData | null = (() => {
    if (!catalogItems.length && !lineItems.length) return null;

    const itemMap = new Map<string, any>();
    for (const ci of catalogItems) {
      itemMap.set(ci.id, {
        catalog_item_id: ci.id,
        name: ci.name,
        type: (ci as any).type,
        booking_count: 0,
        total_amount: 0,
        avg_amount: 0,
        min_amount: Infinity,
        max_amount: -Infinity,
      });
    }

    for (const li of lineItems) {
      if ((li as any).catalog_item_id && itemMap.has((li as any).catalog_item_id)) {
        const entry = itemMap.get((li as any).catalog_item_id);
        entry.booking_count++;
        entry.total_amount += ((li as any).amount || 0);
        entry.min_amount = Math.min(entry.min_amount, (li as any).amount || 0);
        entry.max_amount = Math.max(entry.max_amount, (li as any).amount || 0);
      }
    }

    const items = Array.from(itemMap.values()).map(item => ({
      ...item,
      avg_amount: item.booking_count > 0 ? item.total_amount / item.booking_count : 0,
      min_amount: item.min_amount === Infinity ? 0 : item.min_amount,
      max_amount: item.max_amount === -Infinity ? 0 : item.max_amount,
    }));

    const linkedCount = lineItems.filter((li: any) => li.catalog_item_id).length;
    return {
      items,
      meta: {
        total_catalog_items: catalogItems.length,
        total_line_items: lineItems.length,
        linked_count: linkedCount,
        unlinked_count: lineItems.length - linkedCount,
        linked_percentage: lineItems.length > 0 ? Math.round((linkedCount / lineItems.length) * 100) : 0,
        period,
        service_type: serviceType,
        view,
      },
    };
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Filter Bar — same as ContractsList filter row */}
      <div style={{
        display: "flex",
        gap: "4px",
        marginBottom: "16px",
        alignItems: "center",
        flexWrap: "wrap",
      }}>
        {/* Period navigator */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "0 8px" }}>
          <span style={{ fontSize: "13px", color: "var(--theme-text-muted)", fontWeight: 500 }}>Period:</span>
          <button onClick={() => setPeriod(p => shiftPeriod(p, -1))} style={navBtnStyle} title="Previous month">
            <ChevronLeft size={14} />
          </button>
          <span style={{
            fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)",
            minWidth: "140px", textAlign: "center",
          }}>
            {formatPeriodLabel(period)}
          </span>
          <button onClick={() => setPeriod(p => shiftPeriod(p, 1))} style={navBtnStyle} title="Next month">
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Service type dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "0 8px" }}>
          <span style={{ fontSize: "13px", color: "var(--theme-text-muted)", fontWeight: 500 }}>Service:</span>
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            style={{
              fontSize: "13px",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--theme-border-default)",
              background: "var(--theme-bg-surface)",
              color: "var(--theme-text-primary)",
              cursor: "pointer",
              outline: "none",
              fontWeight: 500,
            }}
          >
            {SERVICE_TYPES.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>

        {/* View radio */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "0 8px" }}>
          <span style={{ fontSize: "13px", color: "var(--theme-text-muted)", fontWeight: 500 }}>View:</span>
          {(["charges", "expenses", "both"] as ViewMode[]).map(v => (
            <label key={v} style={{
              display: "flex", alignItems: "center", gap: "4px",
              fontSize: "13px", color: view === v ? "#0F766E" : "#6B7280",
              fontWeight: view === v ? 600 : 400, cursor: "pointer",
            }}>
              <input
                type="radio" name="summaryView" value={v}
                checked={view === v}
                onChange={() => setView(v)}
                style={{ accentColor: "#0F766E" }}
              />
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </label>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
        {loading && <LoadingOverlay />}
        {error && <ErrorState message={error} onRetry={() => {}} />}
        {!loading && !error && data && data.items.length === 0 && <EmptyState period={period} />}
        {!loading && !error && data && data.items.length > 0 && (
          <SummaryContent data={data} />
        )}
      </div>
    </div>
  );
}

// ==================== SUMMARY TABLE + QUALITY BAR ====================

function SummaryContent({ data }: { data: SummaryData }) {
  const { items, meta } = data;

  return (
    <div style={{ maxWidth: "900px" }}>
      {/* Table — ContractsList table container style */}
      <div style={{
        background: "var(--theme-bg-surface)",
        border: "1px solid var(--theme-border-default)",
        borderRadius: "12px",
        overflow: "hidden",
      }}>
        {/* Table Header */}
        <div
          className="grid gap-4 px-6 py-4"
          style={{
            gridTemplateColumns: GRID_COLS,
            borderBottom: "1px solid var(--theme-border-default)",
            background: "var(--theme-bg-page)",
          }}
        >
          <div style={thStyle}>ITEM NAME</div>
          <div style={{ ...thStyle, textAlign: "center" }}>TYPE</div>
          <div style={{ ...thStyle, textAlign: "right" }}>BOOKINGS</div>
          <div style={{ ...thStyle, textAlign: "right" }}>TOTAL AMOUNT</div>
          <div style={{ ...thStyle, textAlign: "right" }}>AVG / BOOKING</div>
        </div>

        {/* Table Body */}
        {items.map((item, i) => {
          const isUnlinked = item.catalog_item_id === "__unlinked__";
          const totalFmt = fmtAmount(item.total_amount);
          const avgFmt = fmtAmount(item.avg_per_booking);

          return (
            <div
              key={item.catalog_item_id}
              className="grid gap-4 px-6 py-4"
              style={{
                gridTemplateColumns: GRID_COLS,
                borderBottom: i < items.length - 1 ? "1px solid var(--theme-border-default)" : "none",
                background: isUnlinked ? "#FFFDE7" : "transparent",
                borderTop: isUnlinked ? "2px solid #E5E7EB" : undefined,
                alignItems: "center",
              }}
            >
              {/* Item Name */}
              <div style={{
                fontSize: "13px",
                fontWeight: isUnlinked ? 600 : 600,
                color: isUnlinked ? "#92400E" : "#12332B",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {item.name}
              </div>

              {/* Type Badge */}
              <div style={{ textAlign: "center" }}>
                {isUnlinked ? (
                  <span style={{ color: "var(--theme-border-default)", fontSize: "13px" }}>{"\u2014"}</span>
                ) : (
                  <TypeBadge type={item.type} />
                )}
              </div>

              {/* Bookings */}
              <div style={{
                fontSize: "13px",
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
                color: "var(--theme-text-muted)",
              }}>
                {item.booking_count}
              </div>

              {/* Total Amount */}
              <div style={{
                fontSize: "13px",
                textAlign: "right",
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                fontFamily: "'SF Mono', 'Cascadia Code', 'Consolas', monospace",
                color: totalFmt.isNegative ? "#DC2626" : totalFmt.isEmpty ? "#D1D5DB" : "#12332B",
              }}>
                {totalFmt.text}
              </div>

              {/* Avg / Booking */}
              <div style={{
                fontSize: "13px",
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
                fontFamily: "'SF Mono', 'Cascadia Code', 'Consolas', monospace",
                color: avgFmt.isNegative ? "#DC2626" : avgFmt.isEmpty ? "#D1D5DB" : "#6B7280",
              }}>
                {avgFmt.text}
              </div>
            </div>
          );
        })}
      </div>

      {/* Data Quality Section — card style matching ContractsList table container */}
      <div style={{
        marginTop: "20px",
        background: "var(--theme-bg-surface)",
        border: "1px solid var(--theme-border-default)",
        borderRadius: "12px",
        padding: "20px 24px",
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
            Data Quality
          </span>
          <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
            {meta.linked_count} / {meta.total_line_items} line items linked to catalog
          </span>
        </div>

        {/* Progress bar */}
        <div style={{
          height: "10px",
          background: "var(--theme-bg-surface-subtle)",
          borderRadius: "5px",
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${meta.linked_percentage}%`,
            background: meta.linked_percentage >= 90
              ? "#059669"
              : meta.linked_percentage >= 50
                ? "#D97706"
                : "#DC2626",
            borderRadius: "5px",
            transition: "width 0.4s ease",
          }} />
        </div>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "8px",
        }}>
          <span style={{
            fontSize: "13px",
            fontWeight: 600,
            color: meta.linked_percentage >= 90
              ? "#059669"
              : meta.linked_percentage >= 50
                ? "#D97706"
                : "#DC2626",
          }}>
            {meta.linked_percentage}% linked
          </span>
          {meta.unlinked_count > 0 && (
            <span style={{ fontSize: "12px", color: "var(--theme-status-warning-fg)" }}>
              {meta.unlinked_count} unlinked item{meta.unlinked_count !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Summary info chips */}
      <div style={{
        marginTop: "16px",
        display: "flex",
        gap: "8px",
        flexWrap: "wrap",
      }}>
        <InfoChip label="Catalog Items" value={meta.total_catalog_items} />
        <InfoChip label="Total Line Items" value={meta.total_line_items} />
        <InfoChip label="Period" value={formatPeriodLabel(meta.period)} />
        <InfoChip label="Service" value={meta.service_type} />
      </div>
    </div>
  );
}

// ==================== SUB-COMPONENTS ====================

function TypeBadge({ type }: { type: string }) {
  const normalized = type?.toLowerCase() || "";
  let bg = "#F9FAFB";
  let color = "#6B7280";

  if (normalized === "charge") {
    bg = "#ECFDF5";
    color = "#059669";
  } else if (normalized === "expense") {
    bg = "#FEF2F2";
    color = "#DC2626";
  }

  return (
    <span style={{
      display: "inline-block",
      fontSize: "11px",
      fontWeight: 600,
      padding: "2px 8px",
      borderRadius: "4px",
      background: bg,
      color: color,
      textTransform: "capitalize",
    }}>
      {type || "\u2014"}
    </span>
  );
}

function InfoChip({ label, value }: { label: string; value: string | number }) {
  return (
    <span style={{
      fontSize: "12px",
      padding: "4px 10px",
      borderRadius: "8px",
      background: "var(--theme-bg-page)",
      border: "1px solid var(--theme-border-default)",
      color: "var(--theme-text-muted)",
      fontWeight: 500,
    }}>
      {label}: <strong style={{ color: "var(--theme-text-primary)" }}>{value}</strong>
    </span>
  );
}

function LoadingOverlay() {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "rgba(255,255,255,0.85)", zIndex: 10,
    }}>
      <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "var(--theme-action-primary-bg)" }} />
      <p style={{ fontSize: "14px", color: "var(--theme-text-muted)", marginTop: "8px" }}>Loading summary...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{
      padding: "64px",
      textAlign: "center",
      maxWidth: "600px",
      margin: "0 auto",
    }}>
      <AlertCircle size={48} style={{ color: "var(--theme-border-default)", margin: "0 auto 16px" }} />
      <p style={{ fontSize: "14px", color: "var(--theme-text-muted)", marginBottom: "12px" }}>{message}</p>
      <button onClick={onRetry} style={{
        padding: "8px 20px", fontSize: "13px", fontWeight: 500,
        background: "#0F766E", color: "#FFF", border: "none", borderRadius: "8px", cursor: "pointer",
      }}>
        Retry
      </button>
    </div>
  );
}

function EmptyState({ period }: { period: string }) {
  return (
    <div style={{
      padding: "64px",
      textAlign: "center",
      maxWidth: "600px",
      margin: "0 auto",
    }}>
      <BarChart3 size={48} style={{ color: "var(--theme-border-default)", margin: "0 auto 16px" }} />
      <p style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>
        No data for {formatPeriodLabel(period)}
      </p>
      <p style={{ fontSize: "13px", color: "var(--theme-text-muted)", marginTop: "4px" }}>
        Try a different period, service type, or view.
      </p>
    </div>
  );
}

// ==================== STYLE CONSTANTS ====================

const thStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--theme-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const navBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 28, height: 28, border: "1px solid var(--theme-border-default)", borderRadius: "8px",
  background: "var(--theme-bg-surface)", cursor: "pointer", color: "var(--theme-text-muted)",
};