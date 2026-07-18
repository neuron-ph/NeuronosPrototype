import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Receipt } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import type { LiquidationSubmission } from "../../../types/evoucher";

interface LiquidationHistoryProps {
  evoucherId: string;
  advanceAmount: number;
  currency?: string;
  refreshKey?: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  pending:            { bg: "var(--theme-status-warning-bg)",  fg: "var(--theme-status-warning-fg)" },
  approved:           { bg: "var(--theme-status-success-bg)",  fg: "var(--theme-status-success-fg)" },
  revision_requested: { bg: "var(--theme-status-danger-bg)",   fg: "var(--theme-status-danger-fg)" },
};

export function LiquidationHistory({
  evoucherId,
  advanceAmount,
  currency: _currency = "PHP",
  refreshKey,
}: LiquidationHistoryProps) {
  const [submissions, setSubmissions] = useState<LiquidationSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // NEU-105: planned per-booking allocation (the cash-advance budget lines) and
  // a booking-id → number map for the reconciliation table.
  const [planned, setPlanned] = useState<{ bookingId: string; amount: number }[]>([]);
  const [bookingNames, setBookingNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!evoucherId) return;
    setLoading(true);
    supabase
      .from("liquidation_submissions")
      .select("*")
      .eq("evoucher_id", evoucherId)
      .order("submitted_at", { ascending: true })
      .then(({ data }) => {
        const rows = (data ?? []) as LiquidationSubmission[];
        setSubmissions(rows);
        // Auto-expand first and last
        const ids = new Set<string>();
        if (rows.length > 0) ids.add(rows[0].id);
        if (rows.length > 1) ids.add(rows[rows.length - 1].id);
        setExpandedIds(ids);
        setLoading(false);
      });
  }, [evoucherId, refreshKey]);

  // NEU-105: planned allocation = the cash-advance's budget lines (booking + amount).
  useEffect(() => {
    if (!evoucherId) return;
    let cancelled = false;
    supabase
      .from("evoucher_line_items")
      .select("booking_id, amount")
      .eq("evoucher_id", evoucherId)
      .then(({ data }) => {
        if (cancelled) return;
        const map = new Map<string, number>();
        for (const r of (data ?? []) as any[]) {
          if (!r.booking_id) continue;
          map.set(r.booking_id, (map.get(r.booking_id) ?? 0) + (Number(r.amount) || 0));
        }
        setPlanned(Array.from(map.entries()).map(([bookingId, amount]) => ({ bookingId, amount })));
      });
    return () => { cancelled = true; };
  }, [evoucherId, refreshKey]);

  // Resolve booking numbers for every booking referenced by planned or actual.
  useEffect(() => {
    const ids = new Set<string>();
    planned.forEach((p) => ids.add(p.bookingId));
    submissions.forEach((s) => (s.line_items ?? []).forEach((li: any) => li.booking_id && ids.add(li.booking_id)));
    if (ids.size === 0) return;
    let cancelled = false;
    supabase
      .from("bookings")
      .select("id, booking_number")
      .in("id", Array.from(ids))
      .then(({ data }) => {
        if (cancelled) return;
        const m: Record<string, string> = {};
        for (const b of (data ?? []) as any[]) m[b.id] = b.booking_number || b.id;
        setBookingNames(m);
      });
    return () => { cancelled = true; };
  }, [planned, submissions]);

  if (!loading && submissions.length === 0) return null;

  // NEU-105: per-booking planned vs actual reconciliation.
  const actualByBooking = new Map<string, number>();
  for (const sub of submissions) {
    for (const li of (sub.line_items ?? []) as any[]) {
      if (!li.booking_id) continue;
      actualByBooking.set(li.booking_id, (actualByBooking.get(li.booking_id) ?? 0) + (Number(li.amount) || 0));
    }
  }
  const plannedByBooking = new Map(planned.map((p) => [p.bookingId, p.amount]));
  const reconBookingIds = Array.from(new Set([...plannedByBooking.keys(), ...actualByBooking.keys()]));
  const reconRows = reconBookingIds.map((bookingId) => {
    const plan = plannedByBooking.get(bookingId) ?? 0;
    const actual = actualByBooking.get(bookingId) ?? 0;
    return { bookingId, number: bookingNames[bookingId] || bookingId, plan, actual, variance: actual - plan };
  });

  const totalSpent = submissions.reduce((s, r) => s + (r.total_spend ?? 0), 0);
  const totalReturned = submissions.reduce((s, r) => s + (r.unused_return ?? 0), 0);
  // Unaccounted balance: advance minus what was expensed AND returned. A fully
  // reconciled advance nets to 0 (spent + returned == advance).
  const remainingBalance = advanceAmount - totalSpent - totalReturned;

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div style={{
      padding: "24px",
      border: "1px solid var(--theme-border-default)",
      borderRadius: "12px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <Receipt size={16} style={{ color: "var(--theme-text-muted)" }} />
        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)", margin: 0 }}>
          Liquidation Submissions
          {submissions.length > 0 && (
            <span style={{ marginLeft: "8px", fontSize: "13px", fontWeight: 400, color: "var(--theme-text-muted)" }}>
              ({submissions.length})
            </span>
          )}
        </h3>
      </div>

      {loading ? (
        <p style={{ fontSize: "13px", color: "var(--theme-text-muted)", margin: 0 }}>Loading…</p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
            {submissions.map((sub) => {
              const isExpanded = expandedIds.has(sub.id);
              const style = STATUS_STYLE[sub.status] ?? STATUS_STYLE.pending;
              return (
                <div
                  key={sub.id}
                  style={{
                    border: "1px solid var(--theme-border-default)",
                    borderRadius: "8px",
                    overflow: "hidden",
                  }}
                >
                  {/* Header row */}
                  <button
                    onClick={() => toggleExpand(sub.id)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                      {isExpanded
                        ? <ChevronDown size={14} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} />
                        : <ChevronRight size={14} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} />
                      }
                      <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
                        {new Date(sub.submitted_at).toLocaleDateString("en-PH", {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                        {" · "}
                        {sub.submitted_by_name}
                      </span>
                      {sub.is_final && (
                        <span style={{
                          fontSize: "10px", fontWeight: 700, letterSpacing: "0.04em",
                          padding: "2px 6px", borderRadius: "4px",
                          backgroundColor: "var(--theme-action-primary-bg)",
                          color: "#fff",
                        }}>
                          FINAL
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                      <span style={{
                        fontSize: "10px", fontWeight: 600, padding: "2px 6px",
                        borderRadius: "4px", backgroundColor: style.bg, color: style.fg,
                        textTransform: "capitalize",
                      }}>
                        {sub.status.replace("_", " ")}
                      </span>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--theme-text-primary)", fontVariantNumeric: "tabular-nums" }}>
                        {fmt(sub.total_spend)}
                      </span>
                    </div>
                  </button>

                  {/* Expanded: line items */}
                  {isExpanded && (
                    <div style={{
                      borderTop: "1px solid var(--theme-border-default)",
                      padding: "12px 14px 14px 36px",
                      backgroundColor: "var(--theme-bg-surface-subtle)",
                    }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textAlign: "left", paddingBottom: "6px" }}>Description</th>
                            {sub.line_items?.some(li => li.vendor_name) && (
                              <th style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textAlign: "left", paddingBottom: "6px", width: "150px" }}>Vendor</th>
                            )}
                            <th style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textAlign: "right", paddingBottom: "6px", width: "100px" }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(sub.line_items ?? []).map((li, i) => (
                            <tr key={i}>
                              <td style={{ fontSize: "13px", color: "var(--theme-text-secondary)", padding: "3px 0" }}>
                                {li.particular || li.description || "—"}
                                {(li.booking_id && bookingNames[li.booking_id]) && (
                                  <span style={{ fontSize: "11px", color: "var(--theme-text-muted)", marginLeft: "6px" }}>
                                    · {bookingNames[li.booking_id]}
                                  </span>
                                )}
                              </td>
                              {sub.line_items?.some(x => x.vendor_name) && (
                                <td style={{ fontSize: "12px", color: "var(--theme-text-muted)", padding: "3px 0" }}>{li.vendor_name || "—"}</td>
                              )}
                              <td style={{ fontSize: "13px", color: "var(--theme-text-secondary)", textAlign: "right", fontVariantNumeric: "tabular-nums", padding: "3px 0" }}>
                                {fmt(li.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {sub.unused_return != null && sub.unused_return > 0 && (
                        <div style={{
                          marginTop: "10px", paddingTop: "10px",
                          borderTop: "1px solid var(--theme-border-default)",
                          display: "flex", justifyContent: "space-between",
                        }}>
                          <span style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>Returned</span>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--theme-status-success-fg)", fontVariantNumeric: "tabular-nums" }}>
                            {fmt(sub.unused_return)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary strip */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "12px",
            paddingTop: "16px",
            borderTop: "1px solid var(--theme-border-default)",
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "11px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Total Spent</div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", fontVariantNumeric: "tabular-nums" }}>
                {fmt(totalSpent)}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "11px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Total Returned</div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-status-success-fg)", fontVariantNumeric: "tabular-nums" }}>
                {fmt(totalReturned)}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "11px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Remaining Balance</div>
              <div style={{
                fontSize: "14px", fontWeight: 600, fontVariantNumeric: "tabular-nums",
                color: remainingBalance < 0 ? "var(--theme-status-danger-fg)" : "var(--theme-text-primary)",
              }}>
                {fmt(remainingBalance)}
              </div>
            </div>
          </div>

          {/* NEU-105: per-booking reconciliation — planned budget vs actual spend */}
          {reconRows.length > 0 && (
            <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--theme-border-default)" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "10px" }}>
                Reconciliation — planned vs actual per booking
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textAlign: "left", paddingBottom: "6px" }}>Booking</th>
                    <th style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textAlign: "right", paddingBottom: "6px", width: "120px" }}>Planned</th>
                    <th style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textAlign: "right", paddingBottom: "6px", width: "120px" }}>Actual</th>
                    <th style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", textAlign: "right", paddingBottom: "6px", width: "120px" }}>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {reconRows.map((r) => (
                    <tr key={r.bookingId} style={{ borderTop: "1px solid var(--theme-border-subtle)" }}>
                      <td style={{ fontSize: "13px", color: "var(--theme-text-primary)", padding: "6px 0", fontVariantNumeric: "tabular-nums" }}>{r.number}</td>
                      <td style={{ fontSize: "13px", color: "var(--theme-text-secondary)", textAlign: "right", padding: "6px 0", fontVariantNumeric: "tabular-nums" }}>{fmt(r.plan)}</td>
                      <td style={{ fontSize: "13px", color: "var(--theme-text-secondary)", textAlign: "right", padding: "6px 0", fontVariantNumeric: "tabular-nums" }}>{fmt(r.actual)}</td>
                      <td style={{ fontSize: "13px", fontWeight: 600, textAlign: "right", padding: "6px 0", fontVariantNumeric: "tabular-nums", color: r.variance > 0 ? "var(--theme-status-danger-fg)" : r.variance < 0 ? "var(--theme-status-success-fg)" : "var(--theme-text-muted)" }}>
                        {r.variance > 0 ? "+" : ""}{fmt(r.variance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: "11px", color: "var(--theme-text-muted)", margin: "8px 0 0" }}>
                Variance = actual − planned. Positive (red) = over budget on that booking; negative (green) = under.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
