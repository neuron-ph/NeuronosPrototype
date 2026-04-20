import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, User, Building2, ClipboardList } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import { useUser } from "../../../hooks/useUser";
import { EVoucherStatusBadge } from "./EVoucherStatusBadge";
import { EVoucherWorkflowPanel } from "./EVoucherWorkflowPanel";
import { EVoucherHistoryTimeline } from "./EVoucherHistoryTimeline";
import { LiquidationForm } from "./LiquidationForm";
import { LiquidationHistory } from "./LiquidationHistory";
import type { EVoucher } from "../../../types/evoucher";

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  expense: "Expense",
  cash_advance: "Cash Advance",
  reimbursement: "Reimbursement",
  budget_request: "Budget Request",
  direct_expense: "Direct Expense",
};

const BACK_ROUTES: Record<string, string> = {
  accounting: "/accounting/evouchers",
  operations: "/operations",
  bd: "/bd/budget-requests",
  my: "/my-evouchers",
};

export function EVoucherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useUser();

  const [evoucher, setEvoucher] = useState<EVoucher | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLiquidation, setShowLiquidation] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [prevTotalSpent, setPrevTotalSpent] = useState(0);
  const [prevTotalReturned, setPrevTotalReturned] = useState(0);

  const from = searchParams.get("from") || "my";
  const backRoute = BACK_ROUTES[from] || "/my-evouchers";

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const fetchEV = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("evouchers")
        .select("*, evoucher_line_items(*)")
        .eq("id", id)
        .maybeSingle();

      if (cancelled) return;

      if (!error && data) {
        setEvoucher({ ...data?.details, ...data } as EVoucher);
      }
      setLoading(false);
    };

    fetchEV();
    return () => { cancelled = true; };
  }, [id]);

  // Exposed so child workflow panels can trigger a refresh
  const refetchEV = () => {
    if (!id) return;
    setHistoryKey(k => k + 1);
    supabase
      .from("evouchers")
      .select("*, evoucher_line_items(*)")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data) setEvoucher({ ...data?.details, ...data } as EVoucher);
      });
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);

  if (loading) {
    return (
      <div style={{ padding: "32px 48px", textAlign: "center", color: "var(--theme-text-muted)" }}>
        Loading E-Voucher...
      </div>
    );
  }

  if (!evoucher) {
    return (
      <div style={{ padding: "32px 48px", textAlign: "center" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "8px" }}>
          E-Voucher not found
        </h2>
        <button onClick={() => navigate(backRoute)} style={{ color: "var(--theme-action-primary-bg)", cursor: "pointer", background: "none", border: "none", fontSize: "14px" }}>
          Go back
        </button>
      </div>
    );
  }

  // Prefer relational line items, fall back to JSONB for old records
  const lineItems = evoucher.evoucher_line_items?.length
    ? evoucher.evoucher_line_items
    : (evoucher.line_items as any[]) || [];

  const isOwner = user?.id === evoucher.requestor_id;
  const status = evoucher.status?.toLowerCase?.() ?? evoucher.status;
  const needsLiquidation = (status === "disbursed" || status === "pending_liquidation") &&
    evoucher.transaction_type !== "reimbursement" && isOwner;

  return (
    <div style={{ padding: "32px 48px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Back Button */}
      <button
        onClick={() => navigate(backRoute)}
        style={{
          display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--theme-text-muted)",
          background: "none", border: "none", cursor: "pointer", marginBottom: "24px", padding: 0,
        }}
      >
        <ArrowLeft size={16} />
        Back
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "32px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <h1 style={{ fontSize: "32px", fontWeight: 600, color: "var(--theme-text-primary)", letterSpacing: "-0.02em" }}>
              {evoucher.voucher_number}
            </h1>
            <EVoucherStatusBadge status={evoucher.status} size="md" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "14px", color: "var(--theme-text-muted)" }}>
            <span>{TRANSACTION_TYPE_LABELS[evoucher.transaction_type ?? ""] ?? evoucher.transaction_type}</span>
            <span>·</span>
            <span>Created {new Date(evoucher.created_at).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "24px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
            {fmt(evoucher.amount)}
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px" }}>
        {/* Left Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Details Card */}
          <div style={{ padding: "24px", border: "1px solid var(--theme-border-default)", borderRadius: "12px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "16px" }}>
              Details
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <div style={{ fontSize: "12px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Purpose</div>
                <div style={{ fontSize: "14px", color: "var(--theme-text-secondary)" }}>{evoucher.purpose || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Category</div>
                <div style={{ fontSize: "14px", color: "var(--theme-text-secondary)" }}>{evoucher.expense_category || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Requestor</div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <User size={14} style={{ color: "var(--theme-text-muted)" }} />
                  <span style={{ fontSize: "14px", color: "var(--theme-text-secondary)" }}>{evoucher.requestor_name}</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Vendor / Payee</div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Building2 size={14} style={{ color: "var(--theme-text-muted)" }} />
                  <span style={{ fontSize: "14px", color: "var(--theme-text-secondary)" }}>{evoucher.vendor_name || "—"}</span>
                </div>
              </div>
              {evoucher.project_number && (
                <div>
                  <div style={{ fontSize: "12px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Project / Booking</div>
                  <div style={{ fontSize: "14px", color: "var(--theme-action-primary-bg)", fontWeight: 500 }}>{evoucher.project_number}</div>
                </div>
              )}
              {evoucher.payment_method && (
                <div>
                  <div style={{ fontSize: "12px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Payment Method</div>
                  <div style={{ fontSize: "14px", color: "var(--theme-text-secondary)" }}>{evoucher.payment_method}</div>
                </div>
              )}
            </div>
            {evoucher.description && (
              <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--theme-border-default)" }}>
                <div style={{ fontSize: "12px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Description</div>
                <div style={{ fontSize: "14px", color: "var(--theme-text-secondary)" }}>{evoucher.description}</div>
              </div>
            )}
          </div>

          {/* Line Items Card */}
          {lineItems.length > 0 && (
            <div style={{ padding: "24px", border: "1px solid var(--theme-border-default)", borderRadius: "12px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "16px" }}>
                Line Items
              </h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--theme-border-default)" }}>
                    <th style={{ textAlign: "left", padding: "8px 0", fontSize: "12px", color: "var(--theme-text-muted)", fontWeight: 500 }}>Particular</th>
                    <th style={{ textAlign: "left", padding: "8px 0", fontSize: "12px", color: "var(--theme-text-muted)", fontWeight: 500 }}>Description</th>
                    <th style={{ textAlign: "right", padding: "8px 0", fontSize: "12px", color: "var(--theme-text-muted)", fontWeight: 500 }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item: any, i: number) => (
                    <tr key={item.id || i} style={{ borderBottom: "1px solid var(--theme-border-default)" }}>
                      <td style={{ padding: "10px 0", fontSize: "13px", color: "var(--theme-text-secondary)" }}>{item.particular || "—"}</td>
                      <td style={{ padding: "10px 0", fontSize: "13px", color: "var(--theme-text-muted)" }}>{item.description || "—"}</td>
                      <td style={{ padding: "10px 0", fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)", textAlign: "right" }}>
                        {fmt(item.amount || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} style={{ padding: "10px 0", fontSize: "13px", fontWeight: 600, color: "var(--theme-text-primary)" }}>Total</td>
                    <td style={{ padding: "10px 0", fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textAlign: "right" }}>
                      {fmt(evoucher.amount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Liquidation History — cash_advance and budget_request only, post-disbursement */}
          {(evoucher.transaction_type === "cash_advance" || evoucher.transaction_type === "budget_request") &&
            ["disbursed", "pending_liquidation", "pending_verification", "posted"].includes(status) && (
            <LiquidationHistory
              key={historyKey}
              evoucherId={evoucher.id}
              advanceAmount={evoucher.amount}
              currency={evoucher.currency}
            />
          )}

          {/* Approval Timeline */}
          <div style={{ border: "1px solid var(--theme-border-default)", borderRadius: "12px", overflow: "hidden" }}>
            <EVoucherHistoryTimeline evoucherId={evoucher.id} />
          </div>
        </div>

        {/* Right Column — Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Workflow Actions */}
          <div style={{ padding: "20px", border: "1px solid var(--theme-border-default)", borderRadius: "12px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "16px" }}>
              Actions
            </h3>
            <EVoucherWorkflowPanel
              evoucherId={evoucher.id}
              evoucherNumber={evoucher.voucher_number}
              transactionType={evoucher.transaction_type}
              amount={evoucher.amount}
              currentStatus={evoucher.status}
              requestorId={evoucher.requestor_id}
              currentUser={user ? {
                id: user.id,
                name: user.name,
                department: user.department,
                role: user.role,
                ev_approval_authority: user.ev_approval_authority ?? undefined,
              } : undefined}
              onStatusChange={refetchEV}
              isBillable={evoucher.is_billable === true || (evoucher as any).details?.is_billable === true}
              bookingId={evoucher.booking_id ?? undefined}
              projectNumber={evoucher.project_number}
              currency={evoucher.currency}
              expenseCategory={(evoucher as any).expense_category ?? evoucher.gl_category}
            />
          </div>

          {/* Liquidation shortcut */}
          {needsLiquidation && (
            <button
              onClick={async () => {
                if (status === "pending_liquidation") {
                  const { data } = await supabase
                    .from("liquidation_submissions")
                    .select("total_spend, unused_return")
                    .eq("evoucher_id", evoucher.id);
                  const rows = data ?? [];
                  setPrevTotalSpent(rows.reduce((s: number, r: any) => s + (r.total_spend ?? 0), 0));
                  setPrevTotalReturned(rows.reduce((s: number, r: any) => s + (r.unused_return ?? 0), 0));
                }
                setShowLiquidation(true);
              }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                padding: "14px", borderRadius: "10px", border: "1px solid var(--theme-action-primary-bg)",
                backgroundColor: "var(--theme-bg-surface-tint)", color: "var(--theme-action-primary-bg)",
                fontSize: "14px", fontWeight: 500, cursor: "pointer", width: "100%",
              }}
            >
              <ClipboardList size={16} />
              {status === "pending_liquidation" ? "Add More Receipts" : "Submit Liquidation"}
            </button>
          )}

          {/* Disbursement Details — visible once status ≥ disbursed */}
          {evoucher.disbursement_date && (
            <div style={{ padding: "20px", border: "1px solid var(--theme-border-default)", borderRadius: "12px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "16px" }}>
                Disbursement Details
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Date</span>
                  <span style={{ fontSize: "13px", color: "var(--theme-text-secondary)" }}>
                    {new Date(evoucher.disbursement_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                {evoucher.disbursement_method && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Method</span>
                    <span style={{ fontSize: "13px", color: "var(--theme-text-secondary)" }}>{evoucher.disbursement_method}</span>
                  </div>
                )}
                {evoucher.disbursement_source_account_name && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                    <span style={{ fontSize: "13px", color: "var(--theme-text-muted)", flexShrink: 0 }}>Source Account</span>
                    <span style={{ fontSize: "13px", color: "var(--theme-text-secondary)", textAlign: "right" }}>{evoucher.disbursement_source_account_name}</span>
                  </div>
                )}
                {evoucher.disbursement_reference && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                    <span style={{ fontSize: "13px", color: "var(--theme-text-muted)", flexShrink: 0 }}>Reference</span>
                    <span style={{ fontSize: "13px", color: "var(--theme-text-secondary)", fontVariantNumeric: "tabular-nums" }}>{evoucher.disbursement_reference}</span>
                  </div>
                )}
                {evoucher.disbursed_by_name && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Released By</span>
                    <span style={{ fontSize: "13px", color: "var(--theme-text-secondary)" }}>{evoucher.disbursed_by_name}</span>
                  </div>
                )}
                {evoucher.disbursement_remarks && (
                  <div style={{ paddingTop: "8px", borderTop: "1px solid var(--theme-border-default)" }}>
                    <div style={{ fontSize: "12px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Remarks</div>
                    <div style={{ fontSize: "13px", color: "var(--theme-text-secondary)" }}>{evoucher.disbursement_remarks}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Key Dates */}
          <div style={{ padding: "20px", border: "1px solid var(--theme-border-default)", borderRadius: "12px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "16px" }}>
              Key Dates
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Created</span>
                <span style={{ fontSize: "13px", color: "var(--theme-text-secondary)" }}>
                  {new Date(evoucher.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
              {evoucher.disbursement_date && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Disbursed</span>
                  <span style={{ fontSize: "13px", color: "var(--theme-text-secondary)" }}>
                    {new Date(evoucher.disbursement_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
              )}
              {(evoucher as any).liquidated_at && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Liquidated</span>
                  <span style={{ fontSize: "13px", color: "var(--theme-text-secondary)" }}>
                    {new Date((evoucher as any).liquidated_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
              )}
              {(evoucher as any).verified_at && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Verified & Posted</span>
                  <span style={{ fontSize: "13px", color: "var(--theme-text-secondary)" }}>
                    {new Date((evoucher as any).verified_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Liquidation Form */}
      {showLiquidation && user && (
        <LiquidationForm
          isOpen={showLiquidation}
          onClose={() => setShowLiquidation(false)}
          evoucherId={evoucher.id}
          evoucherNumber={evoucher.voucher_number}
          advanceAmount={evoucher.amount}
          currentUser={{ id: user.id, name: user.name }}
          onSubmitted={() => {
            setShowLiquidation(false);
            refetchEV();
          }}
          previousTotalSpent={prevTotalSpent > 0 ? prevTotalSpent : undefined}
          previousTotalReturned={prevTotalReturned > 0 ? prevTotalReturned : undefined}
        />
      )}
    </div>
  );
}
