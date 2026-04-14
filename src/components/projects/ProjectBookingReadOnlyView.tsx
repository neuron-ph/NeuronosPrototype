import { useState, useEffect } from "react";
import { X, Ban } from "lucide-react";
import { ExpensesTab } from "../operations/shared/ExpensesTab";
import { supabase } from "../../utils/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { useProjectFinancials } from "../../hooks/useProjectFinancials";
import { StatusSelector } from "../StatusSelector";
import { ExecutionStatus } from "../../types/operations";
import { toast } from "../ui/toast-utils";
import { UnifiedBillingsTab } from "../shared/billings/UnifiedBillingsTab";
import { BookingCommentsTab } from "../shared/BookingCommentsTab";

interface ProjectBookingReadOnlyViewProps {
  bookingId: string;
  bookingType: "forwarding" | "brokerage" | "trucking" | "marine-insurance" | "others";
  onBack: () => void;
  currentUser?: {
    id: string;
    name: string;
    email: string;
    department: string;
  } | null;
  onBookingUpdated?: () => void;
  onOpenCancelDelete?: () => void;
}

type DetailTab = "booking-info" | "billings" | "expenses" | "comments";

export function ProjectBookingReadOnlyView({
  bookingId,
  bookingType,
  onBack,
  currentUser,
  onBookingUpdated,
  onOpenCancelDelete,
}: ProjectBookingReadOnlyViewProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("booking-info");

  const isPricing = currentUser?.department === "Pricing";

  const { data: booking = null, isFetching: isLoading } = useQuery({
    queryKey: [...queryKeys.bookings.detail(bookingId), bookingType],
    queryFn: async () => {
      console.log("[ProjectBookingReadOnlyView] Fetching booking:", { bookingId, bookingType });

      const { data: bookingData, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!bookingData) throw new Error("Booking not found");

      // Merge details JSONB into top level for field access
      const { details, ...rest } = bookingData as any;
      return { ...details, ...rest };
    },
    enabled: !!bookingId && !!bookingType,
    staleTime: 30_000,
  });

  const financials = useProjectFinancials(booking?.projectNumber || "");
  const bookingBillingItems = financials.billingItems.filter(item => item.booking_id === bookingId);

  // Handle ESC key to close drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onBack();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  const getBookingTypeName = () => {
    const typeMap: Record<string, string> = {
      "forwarding": "Forwarding",
      "brokerage": "Brokerage",
      "trucking": "Trucking",
      "marine-insurance": "Marine Insurance",
      "others": "Others"
    };
    return typeMap[bookingType] || bookingType;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onBack}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(18, 51, 43, 0.4)",
          zIndex: 999,
          animation: "fadeIn 0.2s ease-out",
          cursor: "pointer"
        }}
      />

      {/* Drawer Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "70%",
          backgroundColor: "var(--theme-bg-surface)",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.12)",
          animation: "slideInRight 0.3s ease-out"
        }}
      >
        {isLoading ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%"
          }}>
            <p style={{ color: "var(--theme-text-muted)" }}>Loading booking details...</p>
          </div>
        ) : !booking ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%"
          }}>
            <p style={{ color: "var(--theme-text-muted)", marginBottom: "16px" }}>Booking not found</p>
            <button
              onClick={onBack}
              style={{
                padding: "10px 20px",
                backgroundColor: "var(--theme-action-primary-bg)",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer"
              }}
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{
              padding: "20px 32px",
              borderBottom: "1px solid var(--theme-border-default)",
              backgroundColor: "var(--theme-bg-page)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexShrink: 0
            }}>
              <div style={{ flex: 1 }}>
                <h1 style={{
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "var(--theme-text-primary)",
                  marginBottom: "4px"
                }}>
                  {booking.booking_number || bookingId}
                </h1>
                <p style={{ fontSize: "13px", color: "var(--theme-text-muted)", margin: 0 }}>
                  {booking.customerName && booking.customerName !== "—" 
                    ? `${booking.customerName} • ${getBookingTypeName()} Booking`
                    : `${getBookingTypeName()} Booking`
                  }
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {booking && (
                  <StatusSelector
                    status={booking.status as ExecutionStatus}
                    readOnly={true}
                  />
                )}

                {/* Cancel / Delete — Pricing only */}
                {isPricing && booking && (
                  <button
                    onClick={() => onOpenCancelDelete?.()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "7px 14px",
                      borderRadius: "6px",
                      border: "1px solid var(--theme-border-default)",
                      backgroundColor: "var(--theme-bg-surface)",
                      color: "var(--theme-text-secondary)",
                      fontSize: "13px",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = "var(--theme-status-danger-fg)";
                      e.currentTarget.style.color = "var(--theme-status-danger-fg)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = "var(--theme-border-default)";
                      e.currentTarget.style.color = "var(--theme-text-secondary)";
                    }}
                  >
                    <Ban size={14} />
                    Cancel / Delete
                  </button>
                )}

                {/* Close Button */}
                <button
                  onClick={onBack}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "8px",
                    cursor: "pointer",
                    color: "var(--neuron-ink-secondary)",
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
                    e.currentTarget.style.color = "var(--theme-text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--neuron-ink-secondary)";
                  }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div style={{
              padding: "0 32px",
              borderBottom: "1px solid var(--theme-border-default)",
              backgroundColor: "var(--theme-bg-surface)",
              display: "flex",
              gap: "24px",
              flexShrink: 0
            }}>
              <button
                onClick={() => setActiveTab("booking-info")}
                style={{
                  padding: "14px 0",
                  background: "none",
                  border: "none",
                  borderBottom: activeTab === "booking-info" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
                  color: activeTab === "booking-info" ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  marginBottom: "-1px"
                }}
              >
                Booking Info
              </button>
              <button
                onClick={() => setActiveTab("billings")}
                style={{
                  padding: "14px 0",
                  background: "none",
                  border: "none",
                  borderBottom: activeTab === "billings" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
                  color: activeTab === "billings" ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  marginBottom: "-1px"
                }}
              >
                Billings
              </button>
              <button
                onClick={() => setActiveTab("expenses")}
                style={{
                  padding: "14px 0",
                  background: "none",
                  border: "none",
                  borderBottom: activeTab === "expenses" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
                  color: activeTab === "expenses" ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  marginBottom: "-1px"
                }}
              >
                Expenses
              </button>
              <button
                onClick={() => setActiveTab("comments")}
                style={{
                  padding: "14px 0",
                  background: "none",
                  border: "none",
                  borderBottom: activeTab === "comments" ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
                  color: activeTab === "comments" ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  marginBottom: "-1px"
                }}
              >
                Comments
              </button>
            </div>

            {/* Content */}
            <div style={{
              flex: 1,
              overflow: "auto",
              backgroundColor: "var(--theme-bg-page)"
            }}>
              {activeTab === "booking-info" && (
                <BookingInformationReadOnly booking={booking} bookingType={bookingType} />
              )}
              {activeTab === "billings" && (
                <div className="flex flex-col bg-[var(--theme-bg-surface)] p-12 min-h-[600px]">
                  <UnifiedBillingsTab
                    items={bookingBillingItems}
                    projectId={booking.projectNumber || ""}
                    bookingId={bookingId}
                    onRefresh={financials.refresh}
                    isLoading={financials.isLoading}
                    readOnly={true}
                  />
                </div>
              )}
              {activeTab === "expenses" && (
                <ExpensesTab
                  bookingId={bookingId}
                  currentUserId={currentUser?.email || "unknown"}
                  currentUserName={currentUser?.name || "Unknown User"}
                  currentUserDepartment={currentUser?.department || "BD"}
                  readOnly={true}
                />
              )}
              {activeTab === "comments" && (
                <BookingCommentsTab
                  bookingId={bookingId}
                  currentUserId={currentUser?.email || "unknown"}
                  currentUserName={currentUser?.name || "Unknown User"}
                  currentUserDepartment={currentUser?.department || "BD"}
                />
              )}
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}

// Read-only booking information display
function BookingInformationReadOnly({ booking, bookingType }: { booking: any; bookingType: string }) {
  return (
    <div style={{
      padding: "24px 32px"
    }}>
      {/* General Information Section */}
      <div style={{
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--theme-border-default)",
        borderRadius: "8px",
        padding: "24px",
        marginBottom: "20px"
      }}>
        <h2 style={{
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--theme-action-primary-bg)",
          marginBottom: "20px"
        }}>
          General Information
        </h2>

        <div style={{ display: "grid", gap: "20px" }}>
          {/* Row 1: Customer Name, Account Owner */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <ReadOnlyField label="Customer Name" value={booking.customerName} />
            <ReadOnlyField label="Account Owner" value={booking.accountOwner} />
          </div>

          {/* Row 2: Account Handler, Mode, Type of Entry (for Forwarding) or just Account Handler + Service for others */}
          {bookingType === "forwarding" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
              <ReadOnlyField label="Account Handler" value={booking.accountHandler} />
              <ReadOnlyField label="Mode" value={booking.mode} />
              <ReadOnlyField label="Type of Entry" value={booking.typeOfEntry} />
            </div>
          ) : bookingType === "brokerage" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
              <ReadOnlyField label="Account Handler" value={booking.accountHandler} />
              <ReadOnlyField label="Mode" value={booking.mode} />
              <ReadOnlyField label="Service/s" value={booking.service} />
            </div>
          ) : bookingType === "trucking" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
              <ReadOnlyField label="Account Handler" value={booking.accountHandler} />
              <ReadOnlyField label="Service/s" value={booking.service} />
              <ReadOnlyField label="Truck Type" value={booking.truckType} />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <ReadOnlyField label="Account Handler" value={booking.accountHandler} />
              <ReadOnlyField label="Service/s" value={booking.service || booking.services?.join(", ")} />
            </div>
          )}

          {/* Row 3: Brokerage specific fields */}
          {bookingType === "brokerage" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
              <ReadOnlyField label="Incoterms" value={booking.incoterms} />
              <ReadOnlyField label="Cargo Type" value={booking.cargoType} />
              <ReadOnlyField label="Quotation Reference" value={booking.quotationReferenceNumber} />
            </div>
          ) : bookingType === "trucking" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
              <ReadOnlyField label="Mode" value={booking.mode} />
              <ReadOnlyField 
                label="Preferred Delivery Date" 
                value={booking.preferredDeliveryDate ? new Date(booking.preferredDeliveryDate).toLocaleDateString() : "—"} 
              />
              <ReadOnlyField label="Quotation Reference" value={booking.quotationReferenceNumber} />
            </div>
          ) : bookingType === "forwarding" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
              <ReadOnlyField label="Cargo Type" value={booking.cargoType} />
              <ReadOnlyField label="Quotation Reference" value={booking.quotationReferenceNumber} />
              {booking.projectNumber && (
                <ReadOnlyField label="Project Number" value={booking.projectNumber} />
              )}
            </div>
          ) : (
            <>
              <ReadOnlyField label="Quotation Reference" value={booking.quotationReferenceNumber} />
              {booking.projectNumber && (
                <ReadOnlyField label="Project Number" value={booking.projectNumber} />
              )}
            </>
          )}

          {/* Row 4: Cargo Nature (Brokerage only, conditional) */}
          {bookingType === "brokerage" && booking.cargoNature && (
            <ReadOnlyField label="Cargo Nature" value={booking.cargoNature} />
          )}

          {/* Row 5: Delivery Address (for Forwarding) */}
          {bookingType === "forwarding" && (
            <ReadOnlyField 
              label="Delivery Address" 
              value={booking.deliveryAddress} 
              multiline 
            />
          )}
        </div>
      </div>

      {/* Service-Specific Details */}
      {bookingType === "forwarding" && <ForwardingDetails booking={booking} />}
      {bookingType === "brokerage" && <BrokerageDetails booking={booking} />}
      {bookingType === "trucking" && <TruckingDetails booking={booking} />}
      {bookingType === "marine-insurance" && <MarineInsuranceDetails booking={booking} />}
      {bookingType === "others" && <OthersDetails booking={booking} />}

      {/* Additional Notes */}
      {booking.notes && (
        <div style={{
          backgroundColor: "var(--theme-bg-surface)",
          border: "1px solid var(--theme-border-default)",
          borderRadius: "8px",
          padding: "24px",
          marginTop: "20px"
        }}>
          <h2 style={{
            fontSize: "15px",
            fontWeight: 600,
            color: "var(--theme-action-primary-bg)",
            marginBottom: "16px"
          }}>
            Additional Notes
          </h2>
          <ReadOnlyField label="Notes" value={booking.notes} multiline />
        </div>
      )}
    </div>
  );
}

// Read-only field component
function ReadOnlyField({ label, value, multiline = false }: { label: string; value: any; multiline?: boolean }) {
  const displayValue = value || "—";

  return (
    <div>
      <label style={{
        display: "block",
        fontSize: "12px",
        fontWeight: 500,
        color: "var(--neuron-ink-base)",
        marginBottom: "6px"
      }}>
        {label}
      </label>
      <div style={{
        padding: "9px 12px",
        backgroundColor: "var(--theme-bg-page)",
        border: "1px solid var(--theme-border-default)",
        borderRadius: "6px",
        fontSize: "13px",
        color: "var(--theme-text-secondary)",
        minHeight: multiline ? "70px" : "38px",
        whiteSpace: multiline ? "pre-wrap" : "normal"
      }}>
        {displayValue}
      </div>
    </div>
  );
}

// Service-specific detail components
function ForwardingDetails({ booking }: { booking: any }) {
  return (
    <>
      <div style={{
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--theme-border-default)",
        borderRadius: "8px",
        padding: "24px",
        marginBottom: "20px"
      }}>
        <h2 style={{
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--theme-action-primary-bg)",
          marginBottom: "20px"
        }}>
          Shipment Information
        </h2>

        <div style={{ display: "grid", gap: "20px" }}>
          {/* Row 1: Consignee, Shipper */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <ReadOnlyField label="Consignee" value={booking.consignee} />
            <ReadOnlyField label="Shipper" value={booking.shipper} />
          </div>

          {/* Row 2: MBL/MAWB, HBL/HAWB, Registry Number */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <ReadOnlyField label="MBL/MAWB" value={booking.mblMawb} />
            <ReadOnlyField label="HBL/HAWB" value={booking.hblHawb} />
            <ReadOnlyField label="Registry Number" value={booking.registryNumber} />
          </div>

          {/* Row 3: Carrier, Forwarder */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <ReadOnlyField label="Carrier" value={booking.carrier} />
            <ReadOnlyField label="Forwarder" value={booking.forwarder} />
          </div>

          {/* Row 4: POD */}
          {booking.pod && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <ReadOnlyField label="POD (Port of Discharge)" value={booking.pod} />
              <div /> {/* Empty cell for layout */}
            </div>
          )}

          {/* Commodity Description */}
          <ReadOnlyField 
            label="Commodity Description" 
            value={booking.commodityDescription} 
            multiline 
          />

          {/* Row 5: Gross Weight, Dimensions */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <ReadOnlyField label="Gross Weight" value={booking.grossWeight} />
            <ReadOnlyField label="Dimensions" value={booking.dimensions} />
          </div>
        </div>
      </div>

      {/* Container Details (FCL only) */}
      {booking.mode === "FCL" && booking.containerNumbers && booking.containerNumbers.length > 0 && (
        <div style={{
          backgroundColor: "var(--theme-bg-surface)",
          border: "1px solid var(--theme-border-default)",
          borderRadius: "8px",
          padding: "24px",
          marginBottom: "20px"
        }}>
          <h2 style={{
            fontSize: "15px",
            fontWeight: 600,
            color: "var(--theme-action-primary-bg)",
            marginBottom: "20px"
          }}>
            Container Details
          </h2>

          <ReadOnlyField 
            label="Container Numbers" 
            value={booking.containerNumbers.join(", ")} 
            multiline 
          />
        </div>
      )}
    </>
  );
}

function BrokerageDetails({ booking }: { booking: any }) {
  return (
    <>
      {/* Shipment Information Section */}
      <div style={{
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--theme-border-default)",
        borderRadius: "8px",
        padding: "24px",
        marginBottom: "20px"
      }}>
        <h2 style={{
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--theme-action-primary-bg)",
          marginBottom: "20px"
        }}>
          Shipment Information
        </h2>

        <div style={{ display: "grid", gap: "20px" }}>
          {/* Row 1: Consignee, Shipper */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <ReadOnlyField label="Consignee" value={booking.consignee} />
            <ReadOnlyField label="Shipper" value={booking.shipper} />
          </div>

          {/* Row 2: MBL/MAWB, HBL/HAWB, Registry Number */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <ReadOnlyField label="MBL/MAWB" value={booking.mblMawb} />
            <ReadOnlyField label="HBL/HAWB" value={booking.hblHawb} />
            <ReadOnlyField label="Registry Number" value={booking.registryNumber} />
          </div>

          {/* Row 3: Carrier, Forwarder */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <ReadOnlyField label="Carrier" value={booking.carrier} />
            <ReadOnlyField label="Forwarder" value={booking.forwarder} />
          </div>

          {/* Row 4: POD */}
          {booking.pod && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <ReadOnlyField label="POD (Port of Discharge)" value={booking.pod} />
              <div /> {/* Empty cell for layout */}
            </div>
          )}

          {/* Commodity Description */}
          <ReadOnlyField 
            label="Commodity Description" 
            value={booking.commodityDescription} 
            multiline 
          />

          {/* Row 5: Gross Weight, Dimensions */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <ReadOnlyField label="Gross Weight" value={booking.grossWeight} />
            <ReadOnlyField label="Dimensions" value={booking.dimensions} />
          </div>
        </div>
      </div>
    </>
  );
}

function TruckingDetails({ booking }: { booking: any }) {
  return (
    <>
      {/* Shipment Information Section */}
      <div style={{
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--theme-border-default)",
        borderRadius: "8px",
        padding: "24px",
        marginBottom: "20px"
      }}>
        <h2 style={{
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--theme-action-primary-bg)",
          marginBottom: "20px"
        }}>
          Shipment Information
        </h2>

        <div style={{ display: "grid", gap: "20px" }}>
          {/* Row 1: Consignee, Driver */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <ReadOnlyField label="Consignee" value={booking.consignee} />
            <ReadOnlyField label="Driver" value={booking.driver} />
          </div>

          {/* Row 2: Helper, Vehicle Reference Number, Pull Out */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <ReadOnlyField label="Helper" value={booking.helper} />
            <ReadOnlyField label="Vehicle Reference Number" value={booking.vehicleReferenceNumber} />
            <ReadOnlyField label="Pull Out Location" value={booking.pullOut} />
          </div>

          {/* Row 3: Delivery Address */}
          <ReadOnlyField 
            label="Delivery Address" 
            value={booking.deliveryAddress} 
            multiline 
          />

          {/* Row 4: Delivery Instructions */}
          <ReadOnlyField 
            label="Delivery Instructions" 
            value={booking.deliveryInstructions} 
            multiline 
          />

          {/* Row 5: Date Delivered (conditional) */}
          {booking.dateDelivered && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <ReadOnlyField 
                label="Date Delivered" 
                value={booking.dateDelivered ? new Date(booking.dateDelivered).toLocaleDateString() : "—"} 
              />
              <div /> {/* Empty cell */}
            </div>
          )}
        </div>
      </div>

      {/* FCL Information Section (conditional) */}
      {(booking.tabsBooking || booking.emptyReturn || booking.cyFee || booking.eirAvailability || 
        booking.earlyGateIn || booking.detDemValidity || booking.storageValidity || booking.shippingLine) && (
        <div style={{
          backgroundColor: "var(--theme-bg-surface)",
          border: "1px solid var(--theme-border-default)",
          borderRadius: "8px",
          padding: "24px",
          marginBottom: "20px"
        }}>
          <h2 style={{
            fontSize: "15px",
            fontWeight: 600,
            color: "var(--theme-action-primary-bg)",
            marginBottom: "20px"
          }}>
            FCL Information
          </h2>

          <div style={{ display: "grid", gap: "20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
              {booking.tabsBooking && (
                <ReadOnlyField label="TABS Booking" value={booking.tabsBooking} />
              )}
              {booking.emptyReturn && (
                <ReadOnlyField label="Empty Return" value={booking.emptyReturn} />
              )}
              {booking.cyFee && (
                <ReadOnlyField label="CY Fee" value={booking.cyFee} />
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
              {booking.eirAvailability && (
                <ReadOnlyField label="EIR Availability" value={booking.eirAvailability} />
              )}
              {booking.earlyGateIn && (
                <ReadOnlyField label="Early Gate In" value={booking.earlyGateIn} />
              )}
              {booking.detDemValidity && (
                <ReadOnlyField label="Det/Dem Validity" value={booking.detDemValidity} />
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              {booking.storageValidity && (
                <ReadOnlyField label="Storage Validity" value={booking.storageValidity} />
              )}
              {booking.shippingLine && (
                <ReadOnlyField label="Shipping Line" value={booking.shippingLine} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MarineInsuranceDetails({ booking }: { booking: any }) {
  return (
    <>
      {/* Policy Information Section */}
      <div style={{
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--theme-border-default)",
        borderRadius: "8px",
        padding: "24px",
        marginBottom: "20px"
      }}>
        <h2 style={{
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--theme-action-primary-bg)",
          marginBottom: "20px"
        }}>
          Policy Information
        </h2>

        <div style={{ display: "grid", gap: "20px" }}>
          {/* Row 1: Policy Number, Insurance Company, Coverage Type */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <ReadOnlyField label="Policy Number" value={booking.policyNumber} />
            <ReadOnlyField label="Insurance Company" value={booking.insuranceCompany} />
            <ReadOnlyField label="Coverage Type" value={booking.coverageType} />
          </div>

          {/* Row 2: Insured Value, Currency */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <ReadOnlyField label="Insured Value" value={booking.insuredValue} />
            <ReadOnlyField label="Currency" value={booking.currency} />
            <div /> {/* Empty cell */}
          </div>

          {/* Row 3: Effective Date, Expiry Date */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <ReadOnlyField 
              label="Effective Date" 
              value={booking.effectiveDate ? new Date(booking.effectiveDate).toLocaleDateString() : "—"} 
            />
            <ReadOnlyField 
              label="Expiry Date" 
              value={booking.expiryDate ? new Date(booking.expiryDate).toLocaleDateString() : "—"} 
            />
          </div>
        </div>
      </div>

      {/* Shipment Information Section */}
      <div style={{
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--theme-border-default)",
        borderRadius: "8px",
        padding: "24px",
        marginBottom: "20px"
      }}>
        <h2 style={{
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--theme-action-primary-bg)",
          marginBottom: "20px"
        }}>
          Shipment Information
        </h2>

        <div style={{ display: "grid", gap: "20px" }}>
          {/* Commodity Description */}
          <ReadOnlyField 
            label="Commodity Description" 
            value={booking.commodityDescription} 
            multiline 
          />

          {/* Row 1: HS Code, Invoice Number, Invoice Value */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <ReadOnlyField label="HS Code" value={booking.hsCode} />
            <ReadOnlyField label="Invoice Number" value={booking.invoiceNumber} />
            <ReadOnlyField label="Invoice Value" value={booking.invoiceValue} />
          </div>

          {/* Row 2: Packaging Type, Number of Packages, Weight */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <ReadOnlyField label="Packaging Type" value={booking.packagingType} />
            <ReadOnlyField label="Number of Packages" value={booking.numberOfPackages} />
            <ReadOnlyField label="Weight" value={booking.weight} />
          </div>

          {/* Row 3: Origin, Destination, Vessel/Voyage */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <ReadOnlyField label="Origin" value={booking.origin} />
            <ReadOnlyField label="Destination" value={booking.destination} />
            <ReadOnlyField label="Vessel/Voyage" value={booking.vesselVoyage} />
          </div>

          {/* Row 4: Mode of Transport, Departure Date, Arrival Date */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
            <ReadOnlyField label="Mode of Transport" value={booking.mode} />
            <ReadOnlyField 
              label="Departure Date" 
              value={booking.departureDate ? new Date(booking.departureDate).toLocaleDateString() : "—"} 
            />
            <ReadOnlyField 
              label="Arrival Date" 
              value={booking.arrivalDate ? new Date(booking.arrivalDate).toLocaleDateString() : "—"} 
            />
          </div>
        </div>
      </div>
    </>
  );
}

function OthersDetails({ booking }: { booking: any }) {
  return (
    <div style={{
      backgroundColor: "var(--theme-bg-surface)",
      border: "1px solid var(--theme-border-default)",
      borderRadius: "8px",
      padding: "24px",
      marginBottom: "20px"
    }}>
      <h2 style={{
        fontSize: "15px",
        fontWeight: 600,
        color: "var(--theme-action-primary-bg)",
        marginBottom: "20px"
      }}>
        Service Details
      </h2>

      <div style={{ display: "grid", gap: "20px" }}>
        {/* Service Description */}
        {booking.serviceDescription && (
          <ReadOnlyField label="Service Description" value={booking.serviceDescription} multiline />
        )}

        {/* Row 1: Delivery Address, Special Requirements */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <ReadOnlyField label="Delivery Address" value={booking.deliveryAddress} multiline />
          <ReadOnlyField label="Special Requirements" value={booking.specialRequirements} multiline />
        </div>

        {/* Row 2: Requested Date, Completion Date */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <ReadOnlyField 
            label="Requested Date" 
            value={booking.requestedDate ? new Date(booking.requestedDate).toLocaleDateString() : "—"} 
          />
          <ReadOnlyField 
            label="Completion Date" 
            value={booking.completionDate ? new Date(booking.completionDate).toLocaleDateString() : "—"} 
          />
        </div>
      </div>
    </div>
  );
}