import { useState, useRef, useEffect } from "react";
import { Clock, CheckCircle, XCircle, AlertCircle, ChevronDown, Send } from "lucide-react";
import type { QuotationNew, QuotationStatus } from "../../types/pricing";
import { FormDropdown } from "./FormDropdown";
import { getDisplayStatus, getStatusStyle } from "../../utils/statusMapping";

interface StatusChangeButtonProps {
  quotation: QuotationNew;
  onStatusChange: (newStatus: string, reason?: string) => void;
  userDepartment?: "Business Development" | "Pricing";
}

export function StatusChangeButton({ quotation, onStatusChange, userDepartment }: StatusChangeButtonProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showDisapproveModal, setShowDisapproveModal] = useState(false);
  const [selectedDisapprovalStatus, setSelectedDisapprovalStatus] = useState<"Rejected by Client" | "Disapproved" | "Cancelled">("Disapproved");
  const [reason, setReason] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // Get display status and styling
  const displayStatus = getDisplayStatus(quotation.status);
  const statusStyle = getStatusStyle(displayStatus);
  const StatusIcon = statusStyle.icon;

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    
    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMenu]);

  const handleDisapproveOrCancel = () => {
    setShowMenu(false);
    setShowDisapproveModal(true);
    setReason("");
    setSelectedDisapprovalStatus("Disapproved");
  };

  const confirmDisapprove = () => {
    if (!reason) {
      alert("Please select a reason");
      return;
    }
    onStatusChange(selectedDisapprovalStatus, reason);
    setShowDisapproveModal(false);
    setReason("");
  };

  const reasons = [
    "Pricing",
    "Speed",
    "Urgency",
    "Cancelled Order",
    "Agent Concern",
    "Shipping Plan",
    "No Service",
    "Others"
  ];

  // Get available actions based on current status AND user role
  const getAvailableActions = () => {
    const actions = [];

    // PD WORKFLOW: Mark as Priced - PD ONLY (when quotation is awaiting pricing)
    if (quotation.status === "Pending Pricing" && userDepartment === "Pricing") {
      actions.push({
        label: "Mark as Priced",
        sublabel: "Pricing complete, ready for BD",
        value: "Priced",
        icon: <CheckCircle size={16} style={{ color: "#0F766E" }} />,
        action: () => {
          onStatusChange("Priced");
          setShowMenu(false);
        }
      });
    }

    // PD WORKFLOW: Send back for revision - PD ONLY (if quotation needs more info)
    if (quotation.status === "Pending Pricing" && userDepartment === "Pricing") {
      actions.push({
        label: "Request Revision",
        sublabel: "Need more information from BD",
        value: "Needs Revision",
        icon: <Clock size={16} style={{ color: "#D97706" }} />,
        action: () => {
          onStatusChange("Needs Revision");
          setShowMenu(false);
        }
      });
    }

    // Mark as Ongoing (for revisions/negotiations) - BD ONLY
    if ((quotation.status === "Sent to Client" || quotation.status === "Priced") && userDepartment === "Business Development") {
      actions.push({
        label: "Mark as Ongoing",
        sublabel: "Send back for revisions",
        value: "Needs Revision",
        icon: <Clock size={16} style={{ color: "#D97706" }} />,
        action: () => {
          onStatusChange("Needs Revision");
          setShowMenu(false);
        }
      });
    }

    // Send to Client - BD ONLY (after PD finishes pricing)
    if ((quotation.status === "Priced" || quotation.status === "Needs Revision") && userDepartment === "Business Development") {
      actions.push({
        label: "Send to Client",
        sublabel: "Mark as Waiting Approval",
        value: "Sent to Client",
        icon: <Send size={16} style={{ color: "#C88A2B" }} />,
        action: () => {
          onStatusChange("Sent to Client");
          setShowMenu(false);
        }
      });
    }

    // Mark as Approved - BD ONLY (client accepted)
    if (quotation.status === "Sent to Client" && userDepartment === "Business Development") {
      actions.push({
        label: "Mark as Approved",
        sublabel: "Client accepted quotation",
        value: "Accepted by Client",
        icon: <CheckCircle size={16} style={{ color: "#0F766E" }} />,
        action: () => {
          onStatusChange("Accepted by Client");
          setShowMenu(false);
        }
      });
    }

    return actions;
  };

  const availableActions = getAvailableActions();

  // Don't show status button if there are no actions available
  if (availableActions.length === 0 && (quotation.status === "Converted to Project" || quotation.status === "Converted to Contract")) {
    return null;
  }

  return (
    <div style={{ position: "relative" }} ref={menuRef}>
      {/* Status Indicator Button - Outline Style */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 14px",
          backgroundColor: "white", // White background by default
          border: `1px solid ${statusStyle.borderColor}`,
          borderRadius: "8px",
          fontSize: "13px",
          fontWeight: 600,
          color: statusStyle.color,
          cursor: "pointer",
          transition: "all 0.2s ease"
        }}
        onMouseEnter={(e) => {
          // On hover, show the faint background color
          e.currentTarget.style.backgroundColor = statusStyle.bgColor;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "white";
        }}
      >
        <span style={{ color: statusStyle.color, display: "flex", alignItems: "center" }}>
          <StatusIcon size={16} />
        </span>
        <span>{displayStatus}</span>
        <ChevronDown size={14} style={{ color: statusStyle.color }} />
      </button>

      {/* Dropdown Menu */}
      {showMenu && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          width: "240px",
          backgroundColor: "white",
          border: "1px solid var(--neuron-ui-border)",
          borderRadius: "8px",
          boxShadow: "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)",
          zIndex: 100,
          overflow: "hidden"
        }}>
          {availableActions.map((action, index) => (
            <button
              key={action.value}
              onClick={action.action}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "12px 16px",
                backgroundColor: "transparent",
                border: "none",
                borderBottom: index < availableActions.length - 1 ? "1px solid #F3F4F6" : "none",
                cursor: "pointer",
                textAlign: "left",
                transition: "background-color 0.15s ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#F9FAFB";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <div style={{ marginTop: "2px" }}>{action.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ 
                  fontSize: "14px", 
                  color: "#12332B",
                  fontWeight: 500,
                  marginBottom: "2px"
                }}>
                  {action.label}
                </div>
                <div style={{ 
                  fontSize: "12px", 
                  color: "#667085",
                  lineHeight: "1.4"
                }}>
                  {action.sublabel}
                </div>
              </div>
            </button>
          ))}
          
          {/* Separator before Disapproved/Cancelled */}
          {availableActions.length > 0 && (
            <div style={{
              height: "1px",
              backgroundColor: "#E5E7EB",
              margin: "4px 0"
            }} />
          )}
          
          <button
            onClick={handleDisapproveOrCancel}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
              padding: "12px 16px",
              backgroundColor: "transparent",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              transition: "background-color 0.15s ease"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#FEF2F2";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <div style={{ marginTop: "2px" }}>
              <XCircle size={16} style={{ color: "#DC2626" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ 
                fontSize: "14px", 
                color: "#DC2626",
                fontWeight: 500,
                marginBottom: "2px"
              }}>
                Disapproved / Cancelled
              </div>
              <div style={{ 
                fontSize: "12px", 
                color: "#DC2626",
                opacity: 0.8,
                lineHeight: "1.4"
              }}>
                Reject or cancel quotation
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Disapprove/Cancel Modal */}
      {showDisapproveModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "20px"
        }}>
          <div style={{
            backgroundColor: "white",
            borderRadius: "12px",
            width: "540px",
            maxHeight: "90vh",
            overflow: "auto",
            boxShadow: "0px 20px 25px -5px rgba(0, 0, 0, 0.1), 0px 10px 10px -5px rgba(0, 0, 0, 0.04)"
          }}>
            {/* Modal Header */}
            <div style={{
              padding: "32px 32px 24px 32px",
              borderBottom: "1px solid #F3F4F6"
            }}>
              <h2 style={{
                fontSize: "24px",
                fontWeight: 600,
                color: "#12332B",
                marginBottom: "12px",
                lineHeight: "1.3"
              }}>
                Disapprove or Cancel Quotation
              </h2>
              <p style={{
                fontSize: "15px",
                color: "#667085",
                lineHeight: "1.6",
                margin: 0
              }}>
                Select the appropriate status and provide a reason. This will automatically notify the Pricing Manager and CEO.
              </p>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "32px" }}>
              {/* Status Selection */}
              <div style={{ marginBottom: "24px" }}>
                <label style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#12332B",
                  marginBottom: "10px",
                  display: "block",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px"
                }}>
                  Mark as *
                </label>
                <FormDropdown
                  value={selectedDisapprovalStatus}
                  onChange={(value) => setSelectedDisapprovalStatus(value as typeof selectedDisapprovalStatus)}
                  options={[
                    { value: "Rejected by Client", label: "Rejected by Client" },
                    { value: "Disapproved", label: "Disapproved (Management)" },
                    { value: "Cancelled", label: "Cancelled" }
                  ]}
                  placeholder="Select status..."
                />
              </div>

              {/* Reason Selection */}
              <div style={{ marginBottom: "24px" }}>
                <label style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#12332B",
                  marginBottom: "10px",
                  display: "block",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px"
                }}>
                  Reason *
                </label>
                <FormDropdown
                  value={reason}
                  onChange={setReason}
                  options={reasons.map(r => ({ value: r, label: r }))}
                  placeholder="Select a reason..."
                />
              </div>

              {/* Alert Note */}
              <div style={{
                backgroundColor: "#FFFBEB",
                border: "1px solid #FDE68A",
                borderRadius: "8px",
                padding: "16px",
                fontSize: "14px",
                color: "#78350F",
                lineHeight: "1.5"
              }}>
                <div style={{ 
                  fontWeight: 600, 
                  marginBottom: "4px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}>
                  <AlertCircle size={16} />
                  Note:
                </div>
                <div>
                  This action will automatically route a notification ticket to the Pricing Manager and CEO for review.
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: "20px 32px 32px 32px",
              display: "flex",
              gap: "12px",
              justifyContent: "flex-end"
            }}>
              <button
                onClick={() => {
                  setShowDisapproveModal(false);
                  setReason("");
                }}
                style={{
                  padding: "12px 24px",
                  backgroundColor: "white",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "#374151",
                  cursor: "pointer",
                  transition: "all 0.2s ease"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#F9FAFB";
                  e.currentTarget.style.borderColor = "#9CA3AF";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "white";
                  e.currentTarget.style.borderColor = "#D1D5DB";
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDisapprove}
                disabled={!reason}
                style={{
                  padding: "12px 24px",
                  backgroundColor: !reason ? "#FCA5A5" : "#DC2626",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "white",
                  cursor: !reason ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease"
                }}
                onMouseEnter={(e) => {
                  if (reason) {
                    e.currentTarget.style.backgroundColor = "#B91C1C";
                  }
                }}
                onMouseLeave={(e) => {
                  if (reason) {
                    e.currentTarget.style.backgroundColor = "#DC2626";
                  }
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}