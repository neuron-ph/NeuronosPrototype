import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";

interface BookingPendingEVStripProps {
  bookingId: string;
}

const IN_FLIGHT_STATUSES = ["draft", "pending_manager", "pending_ceo", "pending_accounting", "disbursed", "pending_liquidation", "pending_verification"];
const POSTED_STATUSES = ["posted"];

export function BookingPendingEVStrip({ bookingId }: BookingPendingEVStripProps) {
  const [pendingTotal, setPendingTotal] = useState(0);
  const [postedTotal, setPostedTotal] = useState(0);
  const [hasAny, setHasAny] = useState(false);

  useEffect(() => {
    if (!bookingId) return;

    const fetchEVs = async () => {
      const { data, error } = await supabase
        .from("evouchers")
        .select("amount, status")
        .eq("booking_id", bookingId)
        .not("status", "in", '("rejected","cancelled")');

      if (error || !data || data.length === 0) return;

      let pending = 0;
      let posted = 0;
      for (const ev of data) {
        const amt = Number(ev.amount) || 0;
        if (IN_FLIGHT_STATUSES.includes(ev.status)) pending += amt;
        else if (POSTED_STATUSES.includes(ev.status)) posted += amt;
      }

      setPendingTotal(pending);
      setPostedTotal(posted);
      setHasAny(true);
    };

    fetchEVs();
  }, [bookingId]);

  if (!hasAny) return null;

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "24px",
        padding: "8px 48px",
        backgroundColor: "var(--theme-bg-surface-subtle)",
        borderBottom: "1px solid var(--neuron-ui-border)",
        fontSize: "12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--theme-text-muted)" }}>
        <FileText size={13} />
        <span style={{ fontWeight: 500 }}>E-Vouchers</span>
      </div>
      {pendingTotal > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              display: "inline-block",
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: "#B45309",
            }}
          />
          <span style={{ color: "var(--theme-text-muted)" }}>Pending Expenses:</span>
          <span style={{ fontWeight: 600, color: "#B45309" }}>{fmt(pendingTotal)}</span>
        </div>
      )}
      {postedTotal > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              display: "inline-block",
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: "var(--theme-status-success-fg)",
            }}
          />
          <span style={{ color: "var(--theme-text-muted)" }}>Posted Expenses:</span>
          <span style={{ fontWeight: 600, color: "var(--theme-status-success-fg)" }}>{fmt(postedTotal)}</span>
        </div>
      )}
    </div>
  );
}
