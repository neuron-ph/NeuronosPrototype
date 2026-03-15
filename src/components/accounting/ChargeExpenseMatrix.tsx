// ChargeExpenseMatrix — Pivot table: bookings as rows, catalog items as columns
// Styled 1:1 with ContractsList.tsx layout tokens (borders, header colors, border-radius, font sizes)

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, AlertCircle, Grid3X3, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { apiFetch } from "../../utils/api";
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
  const [view, setView] = useState<ViewMode>("charges");
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const fetchMatrix = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period, view });
      if (serviceType !== "All") params.set("service_type", serviceType);

      const res = await apiFetch(`/catalog/audit/matrix?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Unknown error");
      setData(json.data);
    } catch (err) {
      console.error("Matrix fetch error:", err);
      setError(String(err));
      toast.error("Failed to load matrix", String(err));
    } finally {
      setLoading(false);
    }
  }, [period, serviceType, view]);

  useEffect(() => { fetchMatrix(); }, [fetchMatrix]);

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
          <span style={{ fontSize: "13px", color: "#6B7280", fontWeight: 500 }}>Period:</span>
          <button onClick={() => setPeriod(p => shiftPeriod(p, -1))} style={navBtnStyle} title="Previous month">
            <ChevronLeft size={14} />
          </button>
          <span style={{
            fontSize: "14px", fontWeight: 600, color: "#12332B",
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
          <span style={{ fontSize: "13px", color: "#6B7280", fontWeight: 500 }}>Service:</span>
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            style={{
              fontSize: "13px",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid #E5E7EB",
              background: "#FFFFFF",
              color: "#12332B",
              cursor: "pointer",
              outline: "none",
              fontWeight: 500,
            }}
          >
            {SERVICE_TYPES.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>

        {/* View radio */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "0 8px",
        }}>
          <span style={{ fontSize: "13px", color: "#6B7280", fontWeight: 500 }}>View:</span>
          {(["charges", "expenses", "both"] as ViewMode[]).map(v => (
            <label key={v} style={{
              display: "flex", alignItems: "center", gap: "4px",
              fontSize: "13px", color: view === v ? "#0F766E" : "#6B7280",
              fontWeight: view === v ? 600 : 400, cursor: "pointer",
            }}>
              <input
                type="radio" name="matrixView" value={v}
                checked={view === v}
                onChange={() => setView(v)}
                style={{ accentColor: "#0F766E" }}
              />
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </label>
          ))}
        </div>

        {/* Right side: meta chips + export */}
        {data?.meta && !loading && (
          <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
            <MetaChip label="Bookings" value={data.meta.total_bookings} />
            <MetaChip label="Line Items" value={data.meta.total_line_items} />
            <MetaChip
              label="Linked"
              value={`${data.meta.linked_percentage}%`}
              color={data.meta.linked_percentage >= 90 ? "#059669" : data.meta.linked_percentage >= 50 ? "#D97706" : "#DC2626"}
            />
            <button
              onClick={() => exportMatrixCSV(data, period)}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "8px 16px", fontSize: "13px", fontWeight: 500,
                background: "#FFFFFF", color: "#0F766E",
                border: "1px solid #E5E7EB", borderRadius: "8px",
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
        {error && <ErrorState message={error} onRetry={fetchMatrix} />}
        {!loading && !error && data && data.rows.length === 0 && <EmptyState period={period} />}
        {!loading && !error && data && data.rows.length > 0 && (
          <MatrixTable data={data} containerRef={tableContainerRef} />
        )}
      </div>
    </div>
  );
}

// ==================== MATRIX TABLE ====================

function MatrixTable({ data, containerRef }: { data: MatrixData; containerRef: React.RefObject<HTMLDivElement | null> }) {
  const { columns, rows, totals } = data;

  return (
    <div
      ref={containerRef}
      style={{
        overflow: "auto",
        height: "100%",
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
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
              color: "#6B7280",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              textAlign: "left",
              background: "#F9FAFB",
              borderBottom: "1px solid #E5E7EB",
              borderRight: "2px solid #E5E7EB",
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
                    ...(isUnlinked ? { background: "#FEF9C3", color: "#92400E" } : {}),
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
              color: "#12332B",
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
            const rowBg = isEven ? "#FFFFFF" : "#F9FAFB";

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
                  color: "#12332B",
                  background: rowBg,
                  borderRight: "2px solid #E5E7EB",
                  borderBottom: "1px solid #E5E7EB",
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
                  color: "#6B7280",
                  background: rowBg,
                  borderBottom: "1px solid #E5E7EB",
                  borderRight: "1px solid #F3F4F6",
                  whiteSpace: "nowrap",
                  minWidth: 70,
                  maxWidth: 70,
                }}>
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    fontSize: "10px",
                    fontWeight: 500,
                    color: "#0F766E",
                    backgroundColor: "#E8F5F3",
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
                        color: isNegative ? "#DC2626" : isEmpty ? "#D1D5DB" : "#12332B",
                        background: isUnlinked && !isEmpty
                          ? (isEven ? "#FFFDE7" : "#FFFBCB")
                          : rowBg,
                        borderBottom: "1px solid #E5E7EB",
                        borderRight: "1px solid #F3F4F6",
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
                  borderBottom: "1px solid #E5E7EB",
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
              color: "#12332B",
              background: "#F0FDF9",
              borderTop: "2px solid #0F766E",
              borderRight: "2px solid #E5E7EB",
            }}>
              TOTAL
            </td>
            <td style={{
              padding: "12px",
              position: "sticky",
              bottom: 0,
              zIndex: 1,
              background: "#F0FDF9",
              borderTop: "2px solid #0F766E",
              borderRight: "1px solid #F3F4F6",
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
                    color: isNegative ? "#DC2626" : isEmpty ? "#D1D5DB" : "#12332B",
                    background: isUnlinked ? "#FEF9C3" : "#F0FDF9",
                    borderTop: "2px solid #0F766E",
                    borderRight: "1px solid #F3F4F6",
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
              background: "#ECFDF5",
              borderTop: "2px solid #0F766E",
              borderLeft: "2px solid #E5E7EB",
              color: "#0F766E",
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
      background: "#F9FAFB",
      border: "1px solid #E5E7EB",
      color: color || "#6B7280",
      fontWeight: 500,
      whiteSpace: "nowrap",
    }}>
      {label}: <strong style={{ color: color || "#12332B" }}>{value}</strong>
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
      <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "#0F766E" }} />
      <p style={{ fontSize: "14px", color: "#667085", marginTop: "8px" }}>Loading matrix data...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: "100%", padding: "64px", color: "#DC2626",
    }}>
      <AlertCircle size={48} style={{ marginBottom: "16px", color: "#D1D5DB" }} />
      <p style={{ fontSize: "14px", marginBottom: "12px", color: "#667085" }}>{message}</p>
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
      <div style={{ textAlign: "center", padding: "48px 0" }}>
        <Grid3X3 size={48} style={{ color: "#D1D5DB", margin: "0 auto 16px" }} />
        <p style={{ fontSize: "14px", color: "#667085" }}>
          No data for {formatPeriodLabel(period)}
        </p>
        <p style={{ fontSize: "13px", color: "#9CA3AF", marginTop: "4px" }}>
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
  color: "#6B7280",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  textAlign: "center",
  background: "#F9FAFB",
  borderBottom: "1px solid #E5E7EB",
  borderRight: "1px solid #E5E7EB",
  whiteSpace: "nowrap",
  minWidth: CELL_MIN_WIDTH,
};

const navBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 28, height: 28, border: "1px solid #E5E7EB", borderRadius: "8px",
  background: "#FFFFFF", cursor: "pointer", color: "#6B7280",
};