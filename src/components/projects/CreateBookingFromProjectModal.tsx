import { useState, useEffect } from "react";
import { X, CheckCircle, FileText, Info } from "lucide-react";
import type { Project } from "../../types/pricing";
import { apiFetch } from "../../utils/api";
import { 
  autofillForwardingFromProject,
  autofillBrokerageFromProject,
  autofillTruckingFromProject,
  autofillMarineInsuranceFromProject,
  autofillOthersFromProject,
  linkBookingToProject
} from "../../utils/projectAutofill";
import { toast } from "../ui/toast-utils";

interface CreateBookingFromProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  service: any;
  currentUser?: { 
    id: string;
    name: string; 
    email: string; 
    department: string;
  } | null;
  onSuccess: () => void;
}

export function CreateBookingFromProjectModal({
  isOpen,
  onClose,
  project,
  service,
  currentUser,
  onSuccess
}: CreateBookingFromProjectModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Trigger animation after mount
      setTimeout(() => setIsVisible(true), 10);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreateBooking = async () => {
    setIsSubmitting(true);
    
    try {
      const serviceType = service.service_type;
      
      // ==================== VALIDATION: Check for existing booking ====================
      // Prevent duplicate bookings for the same service type per project
      if (project.linkedBookings && project.linkedBookings.length > 0) {
        const existingBooking = project.linkedBookings.find(
          (b: any) => b.serviceType === serviceType
        );
        
        if (existingBooking) {
          toast.error(
            "Booking already exists",
            `A ${serviceType} booking (${existingBooking.bookingNumber}) has already been created for this project. Only one booking per service type is allowed.`
          );
          setIsSubmitting(false);
          return;
        }
      }
      // ==================== END VALIDATION ====================
      
      let bookingData: any = {};
      let endpoint = "";
      let bookingIdPrefix = "";

      // Prepare booking data based on service type
      switch (serviceType) {
        case "Forwarding":
          bookingData = autofillForwardingFromProject(project);
          endpoint = `/forwarding-bookings`;
          bookingIdPrefix = "FWD";
          
          // Add required fields for forwarding (only if not already autofilled)
          bookingData = {
            ...bookingData,
            accountOwner: currentUser?.name || "",
            accountHandler: currentUser?.name || "",
            services: service.service_details?.services || [],
            subServices: service.service_details?.sub_services || [],
            status: "Draft" as const,
            
            // These fields are operational and will be filled later by Operations
            consignee: bookingData.consignee || "",
            shipper: bookingData.shipper || "",
            mblMawb: bookingData.mblMawb || "",
            hblHawb: bookingData.hblHawb || "",
            registryNumber: bookingData.registryNumber || "",
            forwarder: bookingData.forwarder || "",
            eta: bookingData.eta || "",
          };
          break;

        case "Brokerage":
          bookingData = autofillBrokerageFromProject(project);
          endpoint = `/brokerage-bookings`;
          bookingIdPrefix = "BRK";
          
          bookingData = {
            ...bookingData,
            accountOwner: currentUser?.name || "",
            accountHandler: currentUser?.name || "",
            status: "Draft" as const,
            brokerageType: service.service_details?.subtype || "Formal Entry",
            
            // Empty fields to be filled later
            billOfLadingNumber: "",
            arrivalNoticeNumber: "",
            dateReceived: "",
            bureauOfCustomsAssessmentNumber: "",
            bureauOfCustomsReceiptNumber: "",
            importEntryDeclarationNumber: "",
            importPermitNumber: "",
            taxDeclarationNumber: "",
            billOfLadingDate: "",
          };
          break;

        case "Trucking":
          bookingData = autofillTruckingFromProject(project);
          endpoint = `/trucking-bookings`;
          bookingIdPrefix = "TRK";
          
          bookingData = {
            ...bookingData,
            accountOwner: currentUser?.name || "",
            accountHandler: currentUser?.name || "",
            status: "Draft" as const,
            
            // Empty fields to be filled later
            pullOutDate: "",
            driverName: "",
            plateNumber: "",
            deliveryDate: "",
            podReceived: "",
          };
          break;

        case "Marine Insurance":
          bookingData = autofillMarineInsuranceFromProject(project);
          endpoint = `/marine-insurance-bookings`;
          bookingIdPrefix = "INS";
          
          bookingData = {
            ...bookingData,
            accountOwner: currentUser?.name || "",
            accountHandler: currentUser?.name || "",
            status: "Draft" as const,
            
            // Empty fields to be filled later
            policyNumber: "",
            insurer: "",
            premiumAmount: "",
            coverageType: "",
            effectiveDate: "",
            expiryDate: "",
          };
          break;

        case "Others":
          bookingData = autofillOthersFromProject(project);
          endpoint = `/others-bookings`;
          bookingIdPrefix = "OTH";
          
          bookingData = {
            ...bookingData,
            accountOwner: currentUser?.name || "",
            accountHandler: currentUser?.name || "",
            status: "Draft" as const,
            
            // Empty fields to be filled later
            serviceDate: "",
            completionDate: "",
          };
          break;

        default:
          throw new Error(`Unsupported service type: ${serviceType}`);
      }

      // Create the booking
      console.log(`Creating ${serviceType} booking from project ${project.project_number}...`);
      const response = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(bookingData),
      });

      if (!response.ok) {
        throw new Error(`Failed to create booking: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || "Failed to create booking");
      }

      const createdBooking = result.data;
      console.log(`✓ Created booking: ${createdBooking.bookingId}`);

      // Link booking to project
      console.log(`Linking booking to project...`);
      const linkResult = await linkBookingToProject(
        project.id,
        createdBooking.bookingId,
        createdBooking.bookingId,
        serviceType,
        createdBooking.status,
      );

      if (!linkResult.success) {
        console.warn("Warning: Booking created but linking failed:", linkResult.error);
        // Don't fail the whole operation, the booking exists
      } else {
        console.log(`✓ Linked booking to project successfully`);
      }

      toast.success(
        `${serviceType} booking created!`,
        `Booking ${createdBooking.bookingId} has been created and linked to project ${project.project_number}`
      );
      
      onSuccess();
    } catch (error) {
      console.error("Error creating booking from project:", error);
      toast.error("Failed to create booking", String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300); // Wait for animation to complete
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.4)",
          zIndex: 999,
          opacity: isVisible ? 1 : 0,
          transition: "opacity 300ms ease-in-out"
        }}
        onClick={handleClose}
      />

      {/* Side Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "600px",
          maxWidth: "90vw",
          background: "white",
          zIndex: 1000,
          boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.12)",
          display: "flex",
          flexDirection: "column",
          transform: isVisible ? "translateX(0)" : "translateX(100%)",
          transition: "transform 300ms ease-in-out"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: "24px 32px",
          borderBottom: "1px solid var(--neuron-ui-border)",
          flexShrink: 0
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <FileText size={20} color="#0F766E" />
                <h2 style={{
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "var(--neuron-ink-primary)",
                  margin: 0
                }}>
                  Create {service.service_type} Booking
                </h2>
              </div>
              <p style={{
                fontSize: "13px",
                color: "var(--neuron-ink-muted)",
                margin: 0
              }}>
                From Project {project.project_number}
              </p>
            </div>
            <button
              onClick={handleClose}
              style={{
                background: "transparent",
                border: "none",
                padding: "8px",
                cursor: "pointer",
                borderRadius: "6px",
                color: "#6B7280",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#F3F4F6";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "32px"
        }}>
          {/* Auto-fill Notice */}
          <div style={{
            background: "#EFF6FF",
            border: "1px solid #93C5FD",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "32px"
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <CheckCircle size={20} color="#1E40AF" style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <h4 style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#1E40AF",
                  marginBottom: "4px",
                  margin: 0
                }}>
                  Auto-fill Enabled
                </h4>
                <p style={{
                  fontSize: "13px",
                  color: "#1E40AF",
                  margin: 0,
                  lineHeight: "1.6"
                }}>
                  The booking form will be automatically filled with specifications from this project
                </p>
              </div>
            </div>
          </div>

          {/* Pre-filled Information Section */}
          <div style={{ marginBottom: "32px" }}>
            <h3 style={{
              fontSize: "12px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              color: "#0F766E",
              marginBottom: "16px"
            }}>
              Pre-filled Information
            </h3>
            
            <div style={{
              background: "#F9FAFB",
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: "8px",
              padding: "20px"
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <PreviewField label="Project Reference" value={project.project_number} />
                <PreviewField label="Customer" value={project.customer_name} />
                <PreviewField label="Service Type" value={service.service_type} />
                
                {service.service_type === "Forwarding" && (
                  <>
                    <PreviewField label="Mode" value={service.service_details.mode} />
                    <PreviewField label="Cargo Type" value={service.service_details.cargo_type} />
                    <PreviewField label="POL" value={service.service_details.pol} />
                    <PreviewField label="POD" value={service.service_details.pod} />
                    <PreviewField label="Commodity" value={service.service_details.commodity} />
                  </>
                )}
                
                {service.service_type === "Brokerage" && (
                  <>
                    <PreviewField label="Subtype" value={service.service_details.subtype} />
                    <PreviewField label="Type of Entry" value={service.service_details.type_of_entry} />
                    <PreviewField label="Commodity" value={service.service_details.commodity} />
                  </>
                )}
                
                {service.service_type === "Trucking" && (
                  <>
                    <PreviewField label="Truck Type" value={service.service_details.truck_type} />
                    <PreviewField label="Pull Out Location" value={service.service_details.pull_out} />
                  </>
                )}
                
                {service.service_type === "Marine Insurance" && (
                  <>
                    <PreviewField label="Commodity" value={service.service_details.commodity_description} />
                    <PreviewField label="POL" value={service.service_details.pol} />
                    <PreviewField label="POD" value={service.service_details.pod} />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Info Note */}
          <div style={{
            padding: "16px",
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            borderRadius: "8px",
            display: "flex",
            alignItems: "flex-start",
            gap: "12px"
          }}>
            <Info size={18} color="#92400E" style={{ flexShrink: 0, marginTop: "2px" }} />
            <div style={{
              fontSize: "13px",
              color: "#92400E",
              lineHeight: "1.6"
            }}>
              <strong>Next Step:</strong> After creation, you'll be able to add operational details (vessel, dates, container numbers, etc.) in the booking form.
            </div>
          </div>
        </div>

        {/* Footer - Fixed */}
        <div style={{
          padding: "20px 32px",
          borderTop: "1px solid var(--neuron-ui-border)",
          background: "white",
          display: "flex",
          justifyContent: "flex-end",
          gap: "12px",
          flexShrink: 0
        }}>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            style={{
              padding: "10px 24px",
              background: "white",
              border: "1px solid #D1D5DB",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              color: "#6B7280",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              opacity: isSubmitting ? 0.5 : 1,
              transition: "all 150ms"
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.background = "#F9FAFB";
              }
            }}
            onMouseLeave={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.background = "white";
              }
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreateBooking}
            disabled={isSubmitting}
            style={{
              padding: "10px 24px",
              background: "#0F766E",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              color: "white",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              opacity: isSubmitting ? 0.7 : 1,
              transition: "all 150ms",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.background = "#0D6560";
              }
            }}
            onMouseLeave={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.background = "#0F766E";
              }
            }}
          >
            {isSubmitting ? "Creating..." : "Create Booking"}
          </button>
        </div>
      </div>
    </>
  );
}

function PreviewField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div style={{
        fontSize: "11px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        color: "#6B7280",
        marginBottom: "4px"
      }}>
        {label}
      </div>
      <div style={{
        fontSize: "14px",
        color: "var(--neuron-ink-primary)",
        fontWeight: 500
      }}>
        {value || "—"}
      </div>
    </div>
  );
}