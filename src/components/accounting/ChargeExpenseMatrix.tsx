// ChargeExpenseMatrix — Pivot table: bookings as rows, catalog items as columns
// Styled 1:1 with ContractsList.tsx layout tokens (borders, header colors, border-radius, font sizes)

import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { Loader2, AlertCircle, Grid3X3, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { toast } from "../ui/toast-utils";

// ==================== TYPES ====================

interface MatrixColumn {
  catalog_item_id: string;
  name: string;
}

interface MatrixRow {
  booking_id: string;
  project_number: string;
  service_type: string;
  cells: Record<string, { amount: number; currency: string }>;
}

interface MatrixMeta {
  total_bookings: number;
  total_line_items: number;
  unlinked_count: number;
  linked_count: number;
  linked_percentage: number;
  period: string;
  service_type: string;
  view: string;
}

interface MatrixData {
  columns: MatrixColumn[];
  rows: MatrixRow[];
  totals: Record<string, number>;
  meta: MatrixMeta;
}

const MATRIX_THEME = {
  accent: "var(--theme-action-primary-bg)",
  footerBg: "var(--theme-status-success-bg)",
  footerBgAlt: "var(--theme-status-success-bg)",
  footerBorder: "var(--theme-action-primary-bg)",
  grandTotalColor: "var(--theme-action-primary-bg)",
};

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

// ==================== CSV EXPORT ====================

function exportMatrixCSV(data: MatrixData, period: string) {
  const { columns, rows, totals } = data;
  const esc = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };
  const fmtCSV = (amount: number | undefined | null): string => {
    if (amount === undefined || amount === null || amount === 0) return "";
    return String(Math.round(amount * 100) / 100);
  };

  const headers = ["Booking #", "Service", ...columns.map(c => c.name), "Row Total"];
  const csvRows: string[] = [headers.map(esc).join(",")];

  for (const row of rows) {
    const rowTotal = columns.reduce((s, col) => s + (row.cells[col.catalog_item_id]?.amount || 0), 0);
    const line = [
      row.booking_id,
      row.service_type,
      ...columns.map(col => fmtCSV(row.cells[col.catalog_item_id]?.amount)),
      fmtCSV(rowTotal),
    ];
    csvRows.push(line.map(esc).join(","));
  }

  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
  const totalsLine = [
    "TOTAL", "",
    ...columns.map(col => fmtCSV(totals[col.catalog_item_id] || 0)),
    fmtCSV(grandTotal),
  ];
  csvRows.push(totalsLine.map(esc).join(","));

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-matrix-${period}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("CSV exported", `Matrix for ${formatPeriodLabel(period)} downloaded.`);
}

// ==================== STYLES (ContractsList tokens) ====================

const FROZEN_COL_WIDTH = 150;
const CELL_MIN_WIDTH = 110;

// ==================== COMPONENT ====================

export function ChargeExpenseMatrix() {
  const [period, setPeriod] = useState(getCurrentPeriod);
  const [serviceType, setServiceType] = useState("All");
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const { data: lineItems = [], isLoading: lineItemsLoading, error: lineItemsError } = useQuery({
    queryKey: ["billing_line_items", "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from('billing_line_items').select('*');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: catalogItems = [], isLoading: catalogLoading, error: catalogError } = useQuery({
    queryKey: queryKeys.catalog.items(),
    queryFn: async () => {
      const { data, error } = await supabase.from('catalog_items').select('id, name, category_id');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const loading = lineItemsLoading || catalogLoading;
  const error = lineItemsError || catalogError ? String(lineItemsError || catalogError) : null;

  // Build matrix client-side from fetched data
  const data: MatrixData | null = (() => {
    if (loading) return null;

    const emptyMeta = (): MatrixMeta => ({
      total_bookings: 0,
      total_line_items: 0,
      unlinked_count: 0,
      linked_count: 0,
      linked_percentage: 0,
      period,
      service_type: serviceType,
      view: "all",
    });

    if (!catalogItems.length) {
      return { columns: [], rows: [], totals: {}, meta: emptyMeta() };
    }

    const columns = (catalogItems as any[]).map((ci: any) => ({
      catalog_item_id: ci.id,
      name: ci.name,
    }));

    if (!lineItems.length) {
      return {
        columns,
        rows: [],
        totals: Object.fromEntries(columns.map((c: MatrixColumn) => [c.catalog_item_id, 0])),
        meta: emptyMeta(),
      };
    }

    // Group line items by booking
    const byBooking = new Map<string, any[]>();
    for (const li of lineItems) {
      const key = (li as any).booking_id || (li as any).project_number || 'unassigned';
      if (!byBooking.has(key)) byBooking.set(key, []);
      byBooking.get(key)!.push(li);
    }

    const rows = Array.from(byBooking.entries()).map(([bookingId, items]) => ({
      booking_id: bookingId,
      project_number: items[0]?.project_number || bookingId,
      service_type: items[0]?.service_type || '',
      cells: Object.fromEntries(
        columns.map((col: any) => {
          const match = items.find((li: any) => li.catalog_item_id === col.catalog_item_id);
          return [col.catalog_item_id, match ? { amount: Number(match.amount) || 0, currency: match.currency || 'PHP' } : null];
        })
      ),
    }));

    const totals: Record<string, number> = {};
    for (const col of columns) {
      totals[col.catalog_item_id] = rows.reduce(
        (sum, row) => sum + (row.cells[col.catalog_item_id]?.amount || 0), 0
      );
    }

    const linkedItems = lineItems.filter((li: any) => (li as any).catalog_item_id);
    const linkedPct = lineItems.length > 0
      ? Math.round((linkedItems.length / lineItems.length) * 100)
      : 0;
    const meta: MatrixMeta = {
      total_bookings: byBooking.size,
      total_line_items: lineItems.length,
      unlinked_count: lineItems.length - linkedItems.length,
      linked_count: linkedItems.length,
      linked_percentage: linkedPct,
      period,
      service_type: serviceType,
      view: "all",
    };

    return { columns, rows, totals, meta };
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Filter Bar — styled like ContractsList filter row */}
      <div style={{
        display: "flex",
        gap: "4px",
        marginBottom: "16px",
        alignItems: "center",
        flexWrap: "wrap",
      }}>
        {/* Period navigator */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "0 8px",
        }}>
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

        {/* Service type dropdown — styled like ContractsList filter dropdowns */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "0 8px",
        }}>
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

        {/* Right side: meta chips + export */}
        {data?.meta && !loading && (
          <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
            <MetaChip label="Bookings" value={data.meta.total_bookings} />
            <MetaChip label="Line Items" value={data.meta.total_line_items} />
            <MetaChip
              label="Linked"
              value={`${data.meta.linked_percentage}%`}
              color={data.meta.linked_percentage >= 90 ? "var(--theme-status-success-fg)" : data.meta.linked_percentage >= 50 ? "var(--theme-status-warning-fg)" : "var(--theme-status-danger-fg)"}
            />
            <button
              onClick={() => exportMatrixCSV(data, period)}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "8px 16px", fontSize: "13px", fontWeight: 500,
                background: "var(--theme-bg-surface)", color: "var(--theme-action-primary-bg)",
                border: "1px solid var(--theme-border-default)", borderRadius: "8px",
                cursor: "pointer",
              }}
              title="Export current matrix as CSV"
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
        )}
      </div>

      {/* Table area */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {loading && <LoadingOverlay />}
        {error && <ErrorState message={error} onRetry={() => {}} />}
        {!loading && !error && data && data.columns.length === 0 && <NoCatalogState />}
        {!loading && !error && data && data.columns.length > 0 && data.rows.length === 0 && <EmptyState period={period} />}
        {!loading && !error && data && data.columns.length > 0 && data.rows.length > 0 && (
          <MatrixTable data={data} containerRef={tableContainerRef} />
        )}
      </div>
    </div>
  );
}

// ==================== MATRIX TABLE ====================

function MatrixTable({ data, containerRef }: { data: MatrixData; containerRef: React.RefObject<HTMLDivElement | null> }) {
  const { columns, rows, totals } = data;
  const theme = MATRIX_THEME;

  return (
    <div
      ref={containerRef}
      style={{
        overflow: "auto",
        height: "100%",
        background: "var(--theme-bg-surface)",
        border: "1px solid var(--theme-border-default)",
        borderRadius: "12px",
      }}
    >
      <table style={{
        borderCollapse: "separate",
        borderSpacing: 0,
        width: "max-content",
        minWidth: "100%",
        fontSize: "13px",
      }}>
        {/* Header — matches ContractsList table header */}
        <thead>
          <tr>
            <th style={{
              position: "sticky",
              left: 0,
              top: 0,
              zIndex: 3,
              minWidth: FROZEN_COL_WIDTH,
              maxWidth: FROZEN_COL_WIDTH,
              padding: "12px 16px",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--theme-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              textAlign: "left",
              background: "var(--theme-bg-surface)",
              borderBottom: "1px solid var(--theme-border-default)",
              borderRight: "2px solid var(--theme-border-default)",
              whiteSpace: "nowrap",
            }}>
              Booking #
            </th>
            <th style={{
              ...headerCellBase,
              minWidth: 70,
              maxWidth: 70,
            }}>
              Service
            </th>
            {columns.map(col => {
              const isUnlinked = col.catalog_item_id === "__unlinked__";
              return (
                <th
                  key={col.catalog_item_id}
                  style={{
                    ...headerCellBase,
                    textAlign: "center",
                    ...(isUnlinked ? { background: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)" } : {}),
                  }}
                  title={col.name}
                >
                  <span style={{
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 120,
                  }}>
                    {col.name}
                  </span>
                </th>
              );
            })}
            <th style={{
              ...headerCellBase,
              fontWeight: 700,
              color: "var(--theme-text-primary)",
              minWidth: 110,
            }}>
              Row Total
            </th>
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {rows.map((row, i) => {
            const rowTotal = columns.reduce((sum, col) => sum + (row.cells[col.catalog_item_id]?.amount || 0), 0);
            const isEven = i % 2 === 0;
            const rowBg = isEven ? "var(--theme-bg-surface)" : "var(--neuron-pill-inactive-bg)";

            return (
              <tr key={row.booking_id}>
                {/* Frozen booking col */}
                <td style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 2,
                  minWidth: FROZEN_COL_WIDTH,
                  maxWidth: FROZEN_COL_WIDTH,
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--theme-text-primary)",
                  background: rowBg,
                  borderRight: "2px solid var(--theme-border-default)",
                  borderBottom: "1px solid var(--theme-border-default)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {row.booking_id}
                </td>
                {/* Service type */}
                <td style={{
                  padding: "8px 12px",
                  fontSize: "11px",
                  textAlign: "center",
                  color: "var(--theme-text-muted)",
                  background: rowBg,
                  borderBottom: "1px solid var(--theme-border-default)",
                  borderRight: "1px solid var(--theme-border-subtle)",
                  whiteSpace: "nowrap",
                  minWidth: 70,
                  maxWidth: 70,
                }}>
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    fontSize: "10px",
                    fontWeight: 500,
                    color: "var(--theme-action-primary-bg)",
                    backgroundColor: "var(--theme-bg-surface-tint)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}>
                    {serviceAbbr(row.service_type)}
                  </span>
                </td>
                {/* Value cells */}
                {columns.map(col => {
                  const cellVal = row.cells[col.catalog_item_id]?.amount;
                  const { text, isNegative, isEmpty } = fmtAmount(cellVal);
                  const isUnlinked = col.catalog_item_id === "__unlinked__";

                  return (
                    <td
                      key={col.catalog_item_id}
                      style={{
                        padding: "8px 12px",
                        fontSize: "12px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontFamily: "'SF Mono', 'Cascadia Code', 'Consolas', monospace",
                        whiteSpace: "nowrap",
                        minWidth: CELL_MIN_WIDTH,
                        color: isNegative ? "var(--theme-status-danger-fg)" : isEmpty ? "var(--neuron-ui-muted)" : "var(--theme-text-primary)",
                        background: isUnlinked && !isEmpty
                          ? (isEven ? "#FFFDE7" : "#FFFBCB")
                          : rowBg,
                        borderBottom: "1px solid var(--theme-border-default)",
                        borderRight: "1px solid var(--theme-border-subtle)",
                      }}
                    >
                      {text}
                    </td>
                  );
                })}
                {/* Row total */}
                <td style={{
                  padding: "8px 12px",
                  fontSize: "12px",
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  fontFamily: "'SF Mono', 'Cascadia Code', 'Consolas', monospace",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  minWidth: 110,
                  color: rowTotal < 0 ? "#DC2626" : rowTotal === 0 ? "#D1D5DB" : "#12332B",
                  background: rowBg,
                  borderBottom: "1px solid var(--theme-border-default)",
                  borderLeft: "2px solid #E5E7EB",
                }}>
                  {fmtAmount(rowTotal).text}
                </td>
              </tr>
            );
          })}
        </tbody>

        {/* Totals footer (sticky bottom) */}
        <tfoot>
          <tr>
            <td style={{
              position: "sticky",
              left: 0,
              bottom: 0,
              zIndex: 3,
              minWidth: FROZEN_COL_WIDTH,
              maxWidth: FROZEN_COL_WIDTH,
              padding: "12px 16px",
              fontWeight: 700,
              fontSize: "13px",
              color: "var(--theme-text-primary)",
              background: theme.footerBg,
              borderTop: `2px solid ${theme.footerBorder}`,
              borderRight: "2px solid var(--theme-border-default)",
            }}>
              TOTAL
            </td>
            <td style={{
              padding: "12px",
              position: "sticky",
              bottom: 0,
              zIndex: 1,
              background: theme.footerBg,
              borderTop: `2px solid ${theme.footerBorder}`,
              borderRight: "1px solid var(--theme-border-subtle)",
              minWidth: 70,
              maxWidth: 70,
            }} />
            {columns.map(col => {
              const total = totals[col.catalog_item_id] || 0;
              const { text, isNegative, isEmpty } = fmtAmount(total);
              const isUnlinked = col.catalog_item_id === "__unlinked__";

              return (
                <td
                  key={col.catalog_item_id}
                  style={{
                    padding: "12px 12px",
                    fontSize: "12px",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    fontFamily: "'SF Mono', 'Cascadia Code', 'Consolas', monospace",
                    whiteSpace: "nowrap",
                    minWidth: CELL_MIN_WIDTH,
                    position: "sticky",
                    bottom: 0,
                    zIndex: 1,
                    fontWeight: 700,
                    color: isNegative ? "var(--theme-status-danger-fg)" : isEmpty ? "var(--neuron-ui-muted)" : "var(--theme-text-primary)",
                    background: isUnlinked ? "#FEF9C3" : theme.footerBg,
                    borderTop: `2px solid ${theme.footerBorder}`,
                    borderRight: "1px solid var(--theme-border-subtle)",
                  }}
                >
                  {text}
                </td>
              );
            })}
            {/* Grand total */}
            <td style={{
              padding: "12px 12px",
              fontSize: "12px",
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
              fontFamily: "'SF Mono', 'Cascadia Code', 'Consolas', monospace",
              whiteSpace: "nowrap",
              minWidth: 110,
              position: "sticky",
              bottom: 0,
              zIndex: 1,
              fontWeight: 700,
              background: theme.footerBgAlt,
              borderTop: `2px solid ${theme.footerBorder}`,
              borderLeft: "2px solid #E5E7EB",
              color: theme.grandTotalColor,
            }}>
              {fmtAmount(Object.values(totals).reduce((a, b) => a + b, 0)).text}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ==================== SUB-COMPONENTS ====================

function MetaChip({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <span style={{
      fontSize: "12px",
      padding: "4px 10px",
      borderRadius: "8px",
      background: "var(--theme-bg-page)",
      border: "1px solid var(--theme-border-default)",
      color: color || "var(--theme-text-muted)",
      fontWeight: 500,
      whiteSpace: "nowrap",
    }}>
      {label}: <strong style={{ color: color || "var(--theme-text-primary)" }}>{value}</strong>
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
      <p style={{ fontSize: "14px", color: "var(--theme-text-muted)", marginTop: "8px" }}>Loading matrix data...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: "100%", padding: "64px", color: "var(--theme-status-danger-fg)",
    }}>
      <AlertCircle size={48} style={{ marginBottom: "16px", color: "var(--theme-border-default)" }} />
      <p style={{ fontSize: "14px", marginBottom: "12px", color: "var(--theme-text-muted)" }}>{message}</p>
      <button onClick={onRetry} style={{
        padding: "8px 20px", fontSize: "13px", fontWeight: 500,
        background: "var(--theme-action-primary-bg)", color: "#FFF", border: "none", borderRadius: "8px", cursor: "pointer",
      }}>
        Retry
      </button>
    </div>
  );
}

function NoCatalogState() {
  return (
    <div style={{ padding: "64px", textAlign: "center", maxWidth: "600px", margin: "0 auto" }}>
      <div style={{ textAlign: "center", padding: "48px 0" }}>
        <Grid3X3 size={48} style={{ color: "var(--theme-border-default)", margin: "0 auto 16px" }} />
        <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "8px" }}>
          No catalog items configured
        </p>
        <p style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
          Go to <strong>Accounting → Admin → Item Catalog</strong> to add charge types.
          The matrix columns are built from your active catalog items.
        </p>
      </div>
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
      <div style={{ textAlign: "center", padding: "48px 0" }}>
        <Grid3X3 size={48} style={{ color: "var(--theme-border-default)", margin: "0 auto 16px" }} />
        <p style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>
          No data for {formatPeriodLabel(period)}
        </p>
        <p style={{ fontSize: "13px", color: "var(--theme-text-muted)", marginTop: "4px" }}>
          Try a different period, service type, or view.
        </p>
      </div>
    </div>
  );
}

// ==================== HELPERS ====================

function serviceAbbr(type: string): string {
  switch (type) {
    case "Brokerage": return "BRK";
    case "Trucking": return "TRK";
    case "Forwarding": return "FWD";
    case "Marine Insurance": return "MI";
    case "Others": return "OTH";
    default: return type?.slice(0, 3)?.toUpperCase() || "\u2014";
  }
}

// Header cell base — matches ContractsList table header style
const headerCellBase: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  padding: "12px 12px",
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--theme-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  textAlign: "center",
  background: "var(--theme-bg-surface)",
  borderBottom: "1px solid var(--theme-border-default)",
  borderRight: "1px solid var(--theme-border-default)",
  whiteSpace: "nowrap",
  minWidth: CELL_MIN_WIDTH,
};

const navBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 28, height: 28, border: "1px solid var(--theme-border-default)", borderRadius: "8px",
  background: "var(--theme-bg-surface)", cursor: "pointer", color: "var(--theme-text-muted)",
};