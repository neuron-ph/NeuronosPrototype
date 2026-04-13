/**
 * BookingsTable
 *
 * Shared bookings table used by both ContractDetailView (Contracts → Operations → Bookings)
 * and ProjectBookingsTab (Projects → Bookings). Single source of truth for the bookings
 * table layout: Booking ID | Service | Date | Status | Actions.
 *
 * @see /utils/quotation-helpers.tsx — getServiceIcon, serviceTypeToBookingType, formatShortDate
 */

import type { ReactNode } from "react";
import { FileText, Receipt } from "lucide-react";
import { getServiceIcon, serviceTypeToBookingType, formatShortDate } from "../../utils/quotation-helpers";

// ============================================
// TYPES
// ============================================

export interface BookingRow {
  bookingId: string;
  serviceType?: string;
  bookingType?: string;
  service?: string;
  createdAt?: string;
  status?: string;
  [key: string]: any;
}

interface BookingsTableProps {
  /** Array of booking objects — works with both project and contract shapes */
  bookings: BookingRow[];
  /** Whether bookings are still loading */
  isLoading?: boolean;
  /** Called when user clicks a row to view the booking */
  onViewBooking: (bookingId: string, bookingType: string) => void;
  /** Optional "Generate Billing" callback — if omitted, the Bill button is hidden */
  onGenerateBilling?: (bookingId: string, serviceType: string) => void;
  /** Which booking is currently generating a billing (loading state) */
  generatingBillingId?: string | null;
  /** Custom empty state — rendered when bookings array is empty and not loading */
  emptyState?: ReactNode;
}

// ============================================
// HELPERS
// ============================================

/** Resolve the display service type from the various field names */
function resolveServiceType(booking: BookingRow): string {
  const raw = booking.serviceType || booking.bookingType || booking.service;
  if (raw) return raw;
  // Infer from booking ID prefix
  const id = booking.bookingId || "";
  if (id.startsWith("FWD-")) return "Forwarding";
  if (id.startsWith("BRK-")) return "Brokerage";
  if (id.startsWith("TRK-")) return "Trucking";
  if (id.startsWith("INS-")) return "Marine Insurance";
  if (id.startsWith("OTH-")) return "Others";
  return "Others";
}

// ============================================
// COMPONENT
// ============================================

export function BookingsTable({
  bookings,
  isLoading = false,
  onViewBooking,
  onGenerateBilling,
  generatingBillingId,
  emptyState,
}: BookingsTableProps) {
  const showBillColumn = !!onGenerateBilling;
  const gridCols = showBillColumn
    ? "160px 1fr 120px 120px 140px"
    : "160px 1fr 120px 120px";

  if (isLoading) {
    return (
      <div style={{ padding: "48px", textAlign: "center", color: "var(--neuron-ink-muted)", fontSize: "13px" }}>
        Loading bookings...
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <>
        {emptyState || (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--neuron-ink-muted)" }}>
            <FileText size={40} style={{ marginBottom: "12px", opacity: 0.3, margin: "0 auto 12px" }} />
            <p style={{ fontSize: "14px", fontWeight: 500, margin: "0 0 4px" }}>No bookings linked yet</p>
            <p style={{ fontSize: "13px", margin: 0 }}>Bookings will appear here once created.</p>
          </div>
        )}
      </>
    );
  }

  return (
    <div style={{
      border: "1px solid var(--neuron-ui-border)",
      borderRadius: "8px",
      overflow: "hidden",
    }}>
      {/* Table header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: gridCols,
        gap: "12px",
        padding: "10px 16px",
        fontSize: "11px",
        fontWeight: 600,
        color: "var(--neuron-ink-muted)",
        textTransform: "uppercase" as const,
        letterSpacing: "0.5px",
        borderBottom: "1px solid var(--neuron-ui-border)",
        backgroundColor: "var(--theme-bg-page)",
      }}>
        <div>Booking</div>
        <div>Service</div>
        <div>Date</div>
        <div>Status</div>
        {showBillColumn && <div style={{ textAlign: "right" }}>Actions</div>}
      </div>

      {/* Table rows */}
      {bookings.map((booking, idx) => {
        const bookingId = booking.bookingId || (booking as any).id;
        const displayId = (booking as any).name || (booking as any).bookingNumber || (booking as any).booking_number || bookingId;
        const serviceType = resolveServiceType(booking);
        const isGenerating = generatingBillingId === bookingId;

        return (
          <div
            key={bookingId || idx}
            onClick={() => onViewBooking(bookingId, serviceTypeToBookingType(serviceType))}
            style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              gap: "12px",
              padding: "12px 16px",
              fontSize: "13px",
              color: "var(--neuron-ink-primary)",
              borderBottom: idx < bookings.length - 1 ? "1px solid var(--neuron-ui-divider)" : "none",
              backgroundColor: idx % 2 === 0 ? "var(--theme-bg-surface)" : "var(--theme-bg-page)",
              cursor: "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)"; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = idx % 2 === 0 ? "var(--theme-bg-surface)" : "var(--theme-bg-page)"; }}
          >
            {/* Booking ID — teal link style */}
            <div style={{ fontWeight: 500, color: "var(--theme-action-primary-bg)" }}>
              {displayId || "—"}
            </div>

            {/* Service type with icon */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--neuron-ink-muted)" }}>
              {getServiceIcon(serviceType, { size: 15, color: "var(--theme-action-primary-bg)" })}
              {serviceType}
            </div>

            {/* Date */}
            <div style={{ color: "var(--neuron-ink-muted)", fontSize: "12px" }}>
              {formatShortDate(booking.createdAt)}
            </div>

            {/* Status pill */}
            <div>
              <span style={{
                fontSize: "11px",
                fontWeight: 500,
                padding: "3px 8px",
                borderRadius: "4px",
                backgroundColor: booking.status === "Completed" ? "var(--theme-status-success-bg)" : "var(--neuron-pill-inactive-bg)",
                color: booking.status === "Completed" ? "var(--theme-status-success-fg)" : "var(--theme-text-muted)",
              }}>
                {booking.status || "Draft"}
              </span>
            </div>

            {/* Actions — only Bill button when applicable */}
            {showBillColumn && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "4px" }}>
                <button
                  onClick={(e) => { e.stopPropagation(); onGenerateBilling!(bookingId, serviceType); }}
                  disabled={isGenerating}
                  title="Generate billing from rate card"
                  style={{
                    display: "flex", alignItems: "center", gap: "4px",
                    padding: "4px 8px", fontSize: "12px", fontWeight: 500,
                    color: isGenerating ? "var(--theme-text-muted)" : "var(--neuron-status-accent-fg)",
                    backgroundColor: "transparent",
                    border: `1px solid ${isGenerating ? "var(--theme-border-default)" : "var(--neuron-status-accent-border)"}`,
                    borderRadius: "4px",
                    cursor: isGenerating ? "not-allowed" : "pointer",
                  }}
                  onMouseEnter={e => { if (!isGenerating) { e.currentTarget.style.backgroundColor = "var(--neuron-status-accent-bg)"; e.currentTarget.style.borderColor = "var(--neuron-status-accent-fg)"; }}}
                  onMouseLeave={e => { if (!isGenerating) { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.borderColor = "var(--neuron-status-accent-border)"; }}}
                >
                  <Receipt size={12} />
                  {isGenerating ? "..." : "Bill"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}