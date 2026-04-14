import { motion } from "motion/react";
import { ArrowLeft, FileText } from "lucide-react";
import { InvoiceBuilder } from "./InvoiceBuilder";
import type { FinancialContainer } from "../../../types/financials";
import type { Invoice, Billing } from "../../../types/accounting";

interface InvoiceCreatorPageProps {
  mode: "create" | "view";
  project: FinancialContainer;
  billingItems?: Billing[];
  linkedBookings?: any[];
  invoice?: Invoice | null;
  onClose: () => void;
  onSuccess?: () => void;
  onRefreshData?: () => Promise<void>;
}

export function InvoiceCreatorPage({
  mode,
  project,
  billingItems,
  linkedBookings,
  invoice,
  onClose,
  onSuccess,
  onRefreshData,
}: InvoiceCreatorPageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "var(--theme-bg-page)",
        overflow: "hidden",
      }}
    >
      {/* ── Top Command Bar ── */}
      <div
        style={{
          height: "48px",
          flexShrink: 0,
          borderBottom: "1px solid var(--theme-border-default)",
          backgroundColor: "var(--theme-bg-surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
        }}
      >
        {/* Left: Breadcrumb nav */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
          <button
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--theme-text-muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 6px",
              borderRadius: "6px",
              flexShrink: 0,
              transition: "color 0.15s, background 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = "var(--theme-text-primary)";
              (e.currentTarget as HTMLElement).style.background = "var(--theme-bg-surface-subtle)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = "var(--theme-text-muted)";
              (e.currentTarget as HTMLElement).style.background = "none";
            }}
          >
            <ArrowLeft size={14} />
            <span>Invoices</span>
          </button>

          <span style={{ color: "var(--theme-border-default)", fontSize: "15px", flexShrink: 0 }}>
            /
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: 0 }}>
            <FileText size={13} style={{ color: "var(--theme-action-primary-bg)", flexShrink: 0 }} />
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--theme-text-primary)", flexShrink: 0 }}>
              {mode === "create" ? "New Invoice" : invoice?.invoice_number || "Invoice"}
            </span>
            {project.customer_name && (
              <>
                <span style={{ color: "var(--theme-border-default)", flexShrink: 0 }}>·</span>
                <span style={{ fontSize: "13px", color: "var(--theme-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {project.customer_name}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right: Project reference pill */}
        {project.project_number && (
          <span
            style={{
              fontSize: "11px",
              fontFamily: "monospace",
              fontWeight: 600,
              color: "var(--theme-text-muted)",
              backgroundColor: "var(--theme-bg-surface-subtle)",
              border: "1px solid var(--theme-border-default)",
              padding: "3px 8px",
              borderRadius: "4px",
              flexShrink: 0,
            }}
          >
            {project.project_number}
          </span>
        )}
      </div>

      {/* ── Content: InvoiceBuilder fills the rest ── */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <InvoiceBuilder
          mode={mode}
          project={project}
          billingItems={billingItems}
          linkedBookings={linkedBookings}
          invoice={invoice || undefined}
          onSuccess={onSuccess}
          onRefreshData={onRefreshData}
          onBack={onClose}
        />
      </div>
    </motion.div>
  );
}
