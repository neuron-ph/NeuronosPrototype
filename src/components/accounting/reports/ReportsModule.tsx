// ReportsModule — Hub shell for the Reports module.
// Full-width layout with horizontal tab navigation (no sidebar).
// Shares a single useReportsData hook across all child reports.
//
// Design: Matches FinancialsModule tab pattern — underline tabs with icons.
// Reference: Uxerflow financial reports aesthetic.

import { useState } from "react";
import {
  DollarSign,
  ArrowUpDown,
  Clock,
  Banknote,
  AlertTriangle,
  RefreshCw,
  Printer,
  type LucideIcon,
} from "lucide-react";
import { useReportsData } from "../../../hooks/useReportsData";
import { SalesReport } from "./SalesReport";
import { BookingCashFlowReport } from "./BookingCashFlowReport";
import { ReceivablesAgingReport } from "./ReceivablesAgingReport";
import { CollectionsReport } from "./CollectionsReport";
import { UnbilledRevenueReport } from "./UnbilledRevenueReport";
import { ScopeBar } from "../aggregate/ScopeBar";
import { createDateScope } from "../aggregate/types";
import type { DateScope } from "../aggregate/types";

// ── Report registry ──

interface ReportEntry {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  ready: boolean;
}

const REPORTS: ReportEntry[] = [
  {
    id: "sales",
    label: "Sales Report",
    icon: DollarSign,
    description: "Per-booking revenue breakdown",
    ready: true,
  },
  {
    id: "cashflow",
    label: "Booking Cash Flow",
    icon: ArrowUpDown,
    description: "Cash in/out per booking",
    ready: true,
  },
  {
    id: "aging",
    label: "Receivables Aging",
    icon: Clock,
    description: "Outstanding AR by age",
    ready: true,
  },
  {
    id: "collections",
    label: "Collections",
    icon: Banknote,
    description: "Payment receipts for reconciliation",
    ready: true,
  },
  {
    id: "unbilled",
    label: "Unbilled Revenue",
    icon: AlertTriangle,
    description: "Work not yet invoiced",
    ready: true,
  },
];

// ── Component ──

export function ReportsModule() {
  const [activeReport, setActiveReport] = useState("sales");
  const [scope, setScope] = useState<DateScope>(() => createDateScope("this-month"));
  const data = useReportsData(scope);

  const activeEntry = REPORTS.find((r) => r.id === activeReport) || REPORTS[0];

  const renderReport = () => {
    switch (activeReport) {
      case "sales":
        return <SalesReport data={data} scope={scope} />;
      case "cashflow":
        return <BookingCashFlowReport scope={scope} />;
      case "aging":
        return <ReceivablesAgingReport scope={scope} />;
      case "collections":
        return <CollectionsReport scope={scope} />;
      case "unbilled":
        return <UnbilledRevenueReport scope={scope} />;
      default:
        return (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: "var(--neuron-state-hover)" }}
              >
                <activeEntry.icon size={24} style={{ color: "var(--neuron-ink-muted)" }} />
              </div>
              <p
                className="text-[16px] font-semibold mb-1"
                style={{ color: "var(--neuron-ink-primary)" }}
              >
                {activeEntry.label}
              </p>
              <p className="text-[13px]" style={{ color: "var(--neuron-ink-muted)" }}>
                Coming soon — this report is planned for the next phase.
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--neuron-bg-page)" }}>
      {/* ── Page Header ── */}
      <div
        className="px-10 pt-8 pb-0"
        style={{ backgroundColor: "var(--neuron-bg-elevated)" }}
      >
        {/* Title row */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1
              className="tracking-tight mb-1"
              style={{
                fontSize: "28px",
                fontWeight: 600,
                color: "var(--neuron-ink-primary)",
                letterSpacing: "-0.8px",
              }}
            >
              Reports
            </h1>
            <p className="text-[13px]" style={{ color: "var(--neuron-ink-muted)" }}>
              System-wide financial reporting — drill into revenue, cash flow, receivables, and more.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <ScopeBar scope={scope} onScopeChange={setScope} standalone />
            <div style={{ width: "1px", height: 24, backgroundColor: "var(--neuron-ui-border)" }} />
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors hover:bg-[var(--neuron-state-hover)]"
              style={{ color: "var(--neuron-ink-muted)", border: "1px solid var(--neuron-ui-border)" }}
            >
              <Printer size={14} />
              Print
            </button>
            <button
              onClick={() => data.refresh()}
              className="p-2 rounded-lg transition-colors hover:bg-[var(--neuron-state-hover)]"
              title="Refresh data"
            >
              <RefreshCw
                size={16}
                className={data.isLoading ? "animate-spin" : ""}
                style={{ color: "var(--neuron-ink-muted)" }}
              />
            </button>
          </div>
        </div>

        {/* ── Tab Bar ── */}
        <div
          className="flex items-center gap-0"
          style={{ borderBottom: "1px solid var(--neuron-ui-border)" }}
        >
          {REPORTS.map((report) => {
            const Icon = report.icon;
            const isActive = report.id === activeReport;
            return (
              <button
                key={report.id}
                onClick={() => report.ready && setActiveReport(report.id)}
                disabled={!report.ready}
                className="relative flex items-center gap-2 px-5 py-3 text-[13px] font-medium transition-colors"
                style={{
                  color: isActive
                    ? "var(--neuron-brand-green)"
                    : !report.ready
                      ? "var(--neuron-ink-muted)"
                      : "var(--neuron-ink-muted)",
                  fontWeight: isActive ? 600 : 500,
                  opacity: !report.ready ? 0.5 : 1,
                  cursor: !report.ready ? "not-allowed" : "pointer",
                }}
              >
                <Icon size={14} />
                {report.label}
                {!report.ready && (
                  <span
                    className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: "var(--neuron-ui-divider)",
                      color: "var(--neuron-ink-muted)",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Soon
                  </span>
                )}
                {isActive && (
                  <div
                    className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t"
                    style={{ backgroundColor: "var(--neuron-brand-green)" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content Area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {renderReport()}
      </div>
    </div>
  );
}
