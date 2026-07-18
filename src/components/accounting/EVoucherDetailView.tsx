import { CheckCircle, FileText, Download } from "lucide-react";
import { VoucherBrandLogo } from "../VoucherBrandLogo";
import { formatAttachmentSize } from "../../utils/crmAttachments";
import { EVoucherWorkflowPanel } from "./evouchers/EVoucherWorkflowPanel";
import { LiquidationHistory } from "./evouchers/LiquidationHistory";
import { EVoucherStatusBadge } from "./evouchers/EVoucherStatusBadge";
import { EVoucherHistoryTimeline } from "./evouchers/EVoucherHistoryTimeline";
import { SidePanel } from "../common/SidePanel";
import type { EVoucher } from "../../types/evoucher";
import { evoucherTypeLabelFor } from "../../utils/evoucherTransactionType";
import { getPaymentUrgencyFor, resolveEvoucherDueDate, paymentUrgencyStyle } from "../../utils/evoucherUrgency";

interface EVoucherDetailViewProps {
  evoucher: EVoucher;
  onClose: () => void;
  currentUser?: { id: string; name: string; email: string; role?: string; department?: string; ev_approval_authority?: boolean | null };
  onStatusChange?: () => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);


// ── Shared style tokens ──────────────────────────────────────────────────────

const sectionHeading: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--theme-text-muted)",
  marginBottom: "16px",
};

const fieldLabel: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--theme-text-muted)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  marginBottom: "4px",
};

const fieldValue: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--theme-text-secondary)",
};

// ── Component ────────────────────────────────────────────────────────────────

export function EVoucherDetailView({
  evoucher,
  onClose,
  currentUser,
  onStatusChange,
}: EVoucherDetailViewProps) {
  // Prefer relational line items; fall back to legacy JSONB array
  const lineItems: Array<{ id?: string; particular?: string; description?: string; amount?: number }> =
    evoucher.evoucher_line_items?.length
      ? evoucher.evoucher_line_items
      : Array.isArray(evoucher.line_items)
      ? (evoucher.line_items as any[])
      : [];

  const totalAmount =
    lineItems.length > 0
      ? lineItems.reduce((sum, item) => sum + (item.amount || 0), 0)
      : evoucher.amount;

  const docTitle =
    evoucher.transaction_type === "reimbursement"
      ? "REIMBURSEMENT VOUCHER"
      : "PAYMENT VOUCHER";

  const requestDate = evoucher.request_date || evoucher.created_at;

  const panelTitle = (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <span
        style={{
          fontSize: "18px",
          fontWeight: 700,
          letterSpacing: "-0.018em",
          color: "var(--theme-text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {evoucher.voucher_number}
      </span>
      <EVoucherStatusBadge status={evoucher.status} size="md" />
    </div>
  );

  return (
    <SidePanel isOpen onClose={onClose} title={panelTitle} size="lg">
      <div style={{ overflowY: "auto", height: "100%", padding: "32px 48px" }}>

        {/* ── Document Header ──────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: "32px",
            paddingBottom: "24px",
            borderBottom: "1px solid var(--theme-border-default)",
          }}
        >
          <VoucherBrandLogo height={32} />

          <div style={{ textAlign: "right" }}>
            <h1
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "var(--theme-text-primary)",
                letterSpacing: "0.5px",
                marginBottom: "16px",
              }}
            >
              {docTitle}
            </h1>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div>
                <div style={fieldLabel}>Date</div>
                <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                  {new Date(requestDate).toLocaleDateString("en-US", {
                    month: "2-digit",
                    day: "2-digit",
                    year: "numeric",
                  })}
                </div>
              </div>
              <div>
                <div style={fieldLabel}>Ref No.</div>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--theme-action-primary-bg)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {evoucher.voucher_number}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Transaction Details ──────────────────────────────────────────── */}
        <div style={{ marginBottom: "28px" }}>
          <div style={sectionHeading}>Transaction Details</div>

          {/* Description / Purpose */}
          <div style={{ marginBottom: "20px" }}>
            <div style={fieldLabel}>Description / Purpose</div>
            <div style={{ ...fieldValue, fontSize: "14px", lineHeight: 1.55 }}>
              {evoucher.purpose || evoucher.description || "—"}
            </div>
          </div>

          {/* Transaction Type · Expense Category · Sub-Category */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "20px",
              marginBottom: "20px",
            }}
          >
            <div>
              <div style={fieldLabel}>Transaction Type</div>
              <div style={fieldValue}>
                {evoucherTypeLabelFor(evoucher)}
              </div>
            </div>
            <div>
              <div style={fieldLabel}>Expense Category</div>
              <div style={fieldValue}>
                {evoucher.expense_category || evoucher.gl_category || "—"}
              </div>
            </div>
            <div>
              <div style={fieldLabel}>Sub-Category</div>
              <div style={fieldValue}>
                {evoucher.sub_category || evoucher.gl_sub_category || "—"}
              </div>
            </div>
          </div>

          {/* Project Ref · Vendor */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <div style={fieldLabel}>Project / Booking Ref</div>
              <div style={fieldValue}>{evoucher.project_number || "—"}</div>
              {evoucher.customer_name && (
                <div style={{ fontSize: "12px", color: "var(--theme-text-muted)", marginTop: "3px" }}>
                  {evoucher.customer_name}
                </div>
              )}
            </div>
            <div>
              <div style={fieldLabel}>Paid To (Vendor)</div>
              <div style={fieldValue}>
                {evoucher.vendor_name || "—"}
                {evoucher.vendor_id && (
                  <span
                    title="Linked to a registered vendor"
                    style={{
                      marginLeft: "8px",
                      fontSize: "10px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.4px",
                      color: "var(--theme-status-success-fg, #0F766E)",
                      border: "1px solid var(--theme-status-success-fg, #0F766E)",
                      borderRadius: "4px",
                      padding: "1px 5px",
                      verticalAlign: "middle",
                    }}
                  >
                    Registered
                  </span>
                )}
              </div>
              {evoucher.vendor_contact && (
                <div style={{ fontSize: "12px", color: "var(--theme-text-muted)", marginTop: "3px" }}>
                  {evoucher.vendor_contact}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Line Items ───────────────────────────────────────────────────── */}
        <div style={{ marginBottom: "28px" }}>
          <div style={sectionHeading}>Line Items</div>

          <div
            style={{
              border: "1px solid var(--theme-border-default)",
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 2fr 1fr",
                padding: "10px 16px",
                backgroundColor: "var(--theme-bg-surface-subtle)",
                borderBottom: "1px solid var(--theme-border-default)",
              }}
            >
              {(["Particulars", "Description", "Amount"] as const).map((h) => (
                <div
                  key={h}
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--theme-text-muted)",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    textAlign: h === "Amount" ? "right" : "left",
                  }}
                >
                  {h}
                </div>
              ))}
            </div>

            {/* Rows */}
            {lineItems.length > 0 ? (
              lineItems.map((item, i) => (
                <div
                  key={item.id ?? i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 2fr 1fr",
                    padding: "12px 16px",
                    borderBottom:
                      i < lineItems.length - 1
                        ? "1px solid var(--theme-border-default)"
                        : "none",
                  }}
                >
                  <div style={fieldValue}>{item.particular || "—"}</div>
                  <div style={{ ...fieldValue, color: "var(--theme-text-muted)" }}>
                    {item.description || ""}
                  </div>
                  <div
                    style={{
                      ...fieldValue,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmt(item.amount || 0)}
                  </div>
                </div>
              ))
            ) : (
              // Fallback: show total as single row
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 2fr 1fr",
                  padding: "12px 16px",
                }}
              >
                <div style={fieldValue}>{evoucher.purpose || "—"}</div>
                <div />
                <div
                  style={{
                    ...fieldValue,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmt(evoucher.amount)}
                </div>
              </div>
            )}

            {/* Total row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 2fr 1fr",
                padding: "12px 16px",
                backgroundColor: "var(--theme-bg-surface-subtle)",
                borderTop: "1px solid var(--theme-border-default)",
              }}
            >
              <div
                style={{
                  gridColumn: "1 / 3",
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "var(--theme-text-primary)",
                }}
              >
                Total Amount
              </div>
              <div
                style={{
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "var(--theme-text-primary)",
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmt(totalAmount)}
              </div>
            </div>
          </div>
        </div>

        {/* ── Payment & Terms ──────────────────────────────────────────────── */}
        {(evoucher.payment_method ||
          evoucher.credit_terms ||
          evoucher.due_date ||
          evoucher.notes) && (
          <div style={{ marginBottom: "28px" }}>
            <div style={sectionHeading}>Payment & Terms</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "20px",
                marginBottom: evoucher.notes ? "20px" : 0,
              }}
            >
              {evoucher.payment_method && (
                <div>
                  <div style={fieldLabel}>Payment Method</div>
                  <div style={fieldValue}>{evoucher.payment_method}</div>
                </div>
              )}
              {(() => {
                const dueDate = resolveEvoucherDueDate(evoucher);
                if (!evoucher.credit_terms && !dueDate) return null;
                const urgency = getPaymentUrgencyFor(evoucher);
                return (
                  <div>
                    <div style={fieldLabel}>{dueDate ? "Due Date" : "Credit Terms"}</div>
                    <div style={{ ...fieldValue, display: "flex", alignItems: "center", gap: "8px" }}>
                      {dueDate
                        ? new Date(dueDate).toLocaleDateString("en-PH", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })
                        : evoucher.credit_terms}
                      {urgency && (
                        <span style={{
                          ...paymentUrgencyStyle(urgency.level),
                          display: "inline-flex", alignItems: "center",
                          padding: "2px 8px", borderRadius: "6px",
                          fontSize: "11px", fontWeight: 600,
                        }}>
                          {urgency.label}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
            {evoucher.notes && (
              <div>
                <div style={fieldLabel}>Notes</div>
                <div style={{ ...fieldValue, lineHeight: 1.6 }}>{evoucher.notes}</div>
              </div>
            )}
          </div>
        )}

        {/* ── Request Details ──────────────────────────────────────────────── */}
        <div
          style={{
            marginBottom: "28px",
            padding: "16px 20px",
            border: "1px solid var(--theme-border-default)",
            borderRadius: "8px",
            backgroundColor: "var(--theme-bg-surface-subtle)",
          }}
        >
          <div style={sectionHeading}>Request Details</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <div style={fieldLabel}>Requestor</div>
              <div style={fieldValue}>{evoucher.requestor_name || "—"}</div>
              {evoucher.requestor_department && (
                <div style={{ fontSize: "12px", color: "var(--theme-text-muted)", marginTop: "2px" }}>
                  {evoucher.requestor_department}
                </div>
              )}
            </div>
            <div>
              <div style={fieldLabel}>Request Date</div>
              <div style={fieldValue}>
                {new Date(requestDate).toLocaleDateString("en-PH", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
            </div>
            {/* NEU-045: cash receiver — shown when someone other than the
                requestor received the funds (the person who liquidates). */}
            {evoucher.cash_receiver_name &&
              evoucher.cash_receiver_id !== evoucher.requestor_id && (
                <div>
                  <div style={fieldLabel}>Cash Receiver</div>
                  <div style={fieldValue}>{evoucher.cash_receiver_name}</div>
                  <div style={{ fontSize: "12px", color: "var(--theme-text-muted)", marginTop: "2px" }}>
                    Received the funds · liquidates this advance
                  </div>
                  {/* NEU-050: receipt confirmation marker */}
                  {(evoucher as any).details?.receipt_confirmed_at && (
                    <div style={{ fontSize: "12px", color: "var(--theme-status-success-fg)", fontWeight: 500, marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                      <CheckCircle size={12} />
                      Receipt confirmed
                      {(evoucher as any).details?.receipt_confirmed_by_name ? ` by ${(evoucher as any).details.receipt_confirmed_by_name}` : ""}
                      {" · "}
                      {new Date((evoucher as any).details.receipt_confirmed_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  )}
                </div>
              )}
          </div>

          {/* Approvers */}
          {evoucher.approvers && evoucher.approvers.length > 0 && (
            <div
              style={{
                marginTop: "16px",
                paddingTop: "16px",
                borderTop: "1px solid var(--theme-border-default)",
              }}
            >
              <div style={{ ...fieldLabel, marginBottom: "10px" }}>Approvals</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {evoucher.approvers.map((a) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <CheckCircle
                      size={13}
                      style={{ color: "var(--theme-status-success-fg)", flexShrink: 0 }}
                    />
                    <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-secondary)" }}>
                      {a.name}
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
                      · {a.role}
                    </span>
                    {a.approved_at && (
                      <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
                        · {new Date(a.approved_at).toLocaleDateString("en-PH")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disbursement */}
          {evoucher.disbursement_officer_name && (
            <div
              style={{
                marginTop: "16px",
                paddingTop: "16px",
                borderTop: "1px solid var(--theme-border-default)",
              }}
            >
              <div style={{ ...fieldLabel, marginBottom: "10px" }}>Disbursement</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
                <div>
                  <div style={{ ...fieldLabel, marginBottom: "2px" }}>Officer</div>
                  <div style={fieldValue}>{evoucher.disbursement_officer_name}</div>
                </div>
                {evoucher.disbursement_date && (
                  <div>
                    <div style={{ ...fieldLabel, marginBottom: "2px" }}>Date</div>
                    <div style={fieldValue}>
                      {new Date(evoucher.disbursement_date).toLocaleDateString("en-PH", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                )}
                {evoucher.payment_method && (
                  <div>
                    <div style={{ ...fieldLabel, marginBottom: "2px" }}>Method</div>
                    <div style={fieldValue}>{evoucher.payment_method}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Attachments ──────────────────────────────────────────────────── */}
        {Array.isArray(evoucher.attachments) && evoucher.attachments.length > 0 && (
          <div
            style={{
              marginBottom: "28px",
              padding: "16px 20px",
              border: "1px solid var(--theme-border-default)",
              borderRadius: "8px",
              backgroundColor: "var(--theme-bg-surface-subtle)",
            }}
          >
            <div style={sectionHeading}>Attachments</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {evoucher.attachments.map((att, idx) => (
                <a
                  key={idx}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 12px",
                    fontSize: "13px",
                    color: "var(--theme-text-secondary)",
                    border: "1px solid var(--theme-border-default)",
                    borderRadius: "6px",
                    backgroundColor: "var(--theme-bg-surface)",
                    textDecoration: "none",
                  }}
                >
                  <FileText size={16} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} />
                  <span style={{ flex: 1, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {att.name}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--theme-text-muted)", flexShrink: 0 }}>
                    {formatAttachmentSize(att.size)}
                  </span>
                  <Download size={15} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ── Workflow History ─────────────────────────────────────────────── */}
        <div style={{ marginBottom: "28px" }}>
          <EVoucherHistoryTimeline evoucherId={evoucher.id} />
        </div>

        {/* ── Workflow Actions ─────────────────────────────────────────────── */}
        <div
          style={{
            paddingTop: "20px",
            borderTop: "1px solid var(--theme-border-default)",
          }}
        >
          <div style={{ ...sectionHeading, marginBottom: "14px" }}>Actions</div>
          <EVoucherWorkflowPanel
            evoucherId={evoucher.id}
            evoucherNumber={evoucher.voucher_number}
            transactionType={evoucher.transaction_type}
            amount={evoucher.amount}
            currentStatus={evoucher.status}
            requestorId={evoucher.requestor_id}
            cashReceiverId={evoucher.cash_receiver_id}
            receiptConfirmedAt={(evoucher as any).details?.receipt_confirmed_at ?? (evoucher as any).receipt_confirmed_at}
            cashReturnConfirmedAt={(evoucher as any).details?.cash_return_confirmed_at ?? (evoucher as any).cash_return_confirmed_at}
            currentUser={currentUser}
            onStatusChange={() => {
              onStatusChange?.();
              onClose();
            }}
            isBillable={evoucher.is_billable === true || (evoucher as any).details?.is_billable === true}
            bookingId={evoucher.booking_id ?? undefined}
            projectNumber={evoucher.project_number}
            currency={evoucher.currency}
            expenseCategory={(evoucher as any).expense_category ?? evoucher.gl_category}
          />
        </div>

        {/* ── Liquidation history + per-booking reconciliation (NEU-105) ────────
            cash_advance / budget_request, post-disbursement. Lives here (the LIVE
            detail view) — the old EVoucherDetailPage that used to host it is dead. */}
        {(evoucher.transaction_type === "cash_advance" || evoucher.transaction_type === "budget_request") &&
          ["disbursed", "pending_liquidation", "pending_verification", "posted"].includes((evoucher.status || "").toLowerCase()) && (
          <div style={{ paddingTop: "20px" }}>
            <LiquidationHistory
              evoucherId={evoucher.id}
              advanceAmount={evoucher.amount}
              currency={evoucher.currency}
            />
          </div>
        )}

      </div>
    </SidePanel>
  );
}
