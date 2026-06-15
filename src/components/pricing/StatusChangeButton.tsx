import { useState, useRef, useEffect } from "react";
import { Clock, CheckCircle, XCircle, AlertCircle, ChevronDown, Send, RotateCcw } from "lucide-react";
import type { QuotationNew, QuotationStatus } from "../../types/pricing";
import { FormDropdown } from "./FormDropdown";
import { getDisplayStatus, getStatusStyle } from "../../utils/statusMapping";
import { getNormalizedQuotationStatus } from "../../utils/quotationStatus";
import { SidePanel } from "../common/SidePanel";
import { usePermission } from "../../context/PermissionProvider";

interface StatusChangeButtonProps {
  quotation: QuotationNew;
  onStatusChange: (newStatus: string, reason?: string) => void;
  userDepartment?: "Business Development" | "Pricing";
  userRole?: string;
  variant?: "button" | "chip";
}

export function StatusChangeButton({ quotation, onStatusChange, userDepartment, userRole, variant = "button" }: StatusChangeButtonProps) {
  // NEU-012 Phase 5b: workflow-side transitions are gated by the quotation
  // module grants (BD side = bd_inquiries, Pricing side = pricing_quotations),
  // not by department/role identity.
  const { can } = usePermission();
  const canActAsBD = can("bd_inquiries", "edit");
  const canActAsPricing = can("pricing_quotations", "edit");
  const [showMenu, setShowMenu] = useState(false);
  const [showDisapproveModal, setShowDisapproveModal] = useState(false);
  const [selectedDisapprovalStatus, setSelectedDisapprovalStatus] = useState<"Rejected by Client" | "Disapproved" | "Cancelled">("Disapproved");
  const [reason, setReason] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const normalizedStatus = getNormalizedQuotationStatus(quotation);

  // Get display status and styling
  const displayStatus = getDisplayStatus(normalizedStatus);
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

    // Contract lifecycle: Mark as Expired — available when contract is Active or Expiring.
    // NEU-019 WG-28: was the only status action with no can() check.
    if (normalizedStatus === "Converted to Contract" && (canActAsBD || canActAsPricing) && (quotation.contract_status === "Active" || quotation.contract_status === "Expiring")) {
      actions.push({
        label: "Mark as Expired",
        sublabel: "End this contract's active period",
        value: "Mark as Expired",
        icon: <Clock size={16} style={{ color: "var(--theme-status-warning-fg)" }} />,
        action: () => {
          onStatusChange("Mark as Expired");
          setShowMenu(false);
        }
      });
    }

    // Submit for Pricing (Draft → Pending Pricing) — NEU-036: gated on quotation-edit
    // access on EITHER side, not BD-department only, so a Pricing user who created/owns
    // a Draft (e.g. a project quotation) can push it forward instead of being stuck
    // with only Disapprove/Cancel.
    if (normalizedStatus === "Draft" && (canActAsBD || canActAsPricing)) {
      actions.push({
        label: "Submit for Pricing",
        sublabel: "Send to Pricing department for review",
        value: "Pending Pricing",
        icon: <Send size={16} style={{ color: "var(--neuron-semantic-info)" }} />,
        action: () => {
          onStatusChange("Pending Pricing");
          setShowMenu(false);
        }
      });
    }

    // PD WORKFLOW: Mark as Priced - PD ONLY (when quotation is awaiting pricing)
    if (normalizedStatus === "Pending Pricing" && canActAsPricing) {
      actions.push({
        label: "Mark as Priced",
        sublabel: "Pricing complete, ready for BD",
        value: "Priced",
        icon: <CheckCircle size={16} style={{ color: "var(--theme-action-primary-bg)" }} />,
        action: () => {
          onStatusChange("Priced");
          setShowMenu(false);
        }
      });
    }

    // PD WORKFLOW: Send back for revision - PD ONLY (if quotation needs more info)
    if (normalizedStatus === "Pending Pricing" && canActAsPricing) {
      actions.push({
        label: "Request Revision",
        sublabel: "Need more information from BD",
        value: "Needs Revision",
        icon: <Clock size={16} style={{ color: "var(--theme-status-warning-fg)" }} />,
        action: () => {
          onStatusChange("Needs Revision");
          setShowMenu(false);
        }
      });
    }

    // Mark as Ongoing (for revisions/negotiations) - BD and Pricing
    if ((normalizedStatus === "Sent to Client" || normalizedStatus === "Priced") && (canActAsBD || canActAsPricing)) {
      actions.push({
        label: "Mark as Ongoing",
        sublabel: "Send back for revisions",
        value: "Needs Revision",
        icon: <Clock size={16} style={{ color: "var(--theme-status-warning-fg)" }} />,
        action: () => {
          onStatusChange("Needs Revision");
          setShowMenu(false);
        }
      });
    }

    // Recall for Edits - BD and Pricing (pull back a sent or ongoing quotation to Draft)
    if ((normalizedStatus === "Sent to Client" || normalizedStatus === "Needs Revision") && (canActAsBD || canActAsPricing)) {
      actions.push({
        label: "Recall for Edits",
        sublabel: "Pull back to Draft for corrections",
        value: "Draft",
        icon: <RotateCcw size={16} style={{ color: "var(--theme-text-muted)" }} />,
        action: () => {
          onStatusChange("Draft");
          setShowMenu(false);
        }
      });
    }

    // Send to Client - BD and Pricing (after PD finishes pricing)
    if ((normalizedStatus === "Priced" || normalizedStatus === "Needs Revision") && (canActAsBD || canActAsPricing)) {
      actions.push({
        label: "Send to Client",
        sublabel: "Mark as Waiting Approval",
        value: "Sent to Client",
        icon: <Send size={16} style={{ color: "var(--theme-status-warning-fg)" }} />,
        action: () => {
          onStatusChange("Sent to Client");
          setShowMenu(false);
        }
      });
    }

    // Mark as Approved (client accepted) — NEU-031: gated on quotation-edit access
    // on EITHER side (bd_inquiries OR pricing_quotations), not BD-department only,
    // so a Pricing manager with quotation access can confirm client acceptance.
    if (normalizedStatus === "Sent to Client" && (canActAsBD || canActAsPricing)) {
      actions.push({
        label: "Mark as Approved",
        sublabel: "Client accepted quotation",
        value: "Accepted by Client",
        icon: <CheckCircle size={16} style={{ color: "var(--theme-action-primary-bg)" }} />,
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
  if (availableActions.length === 0 && (normalizedStatus === "Converted to Project" || normalizedStatus === "Converted to Contract")) {
    return null;
  }

  return (
    <div style={{ position: "relative" }} ref={menuRef}>
      {/* Status Indicator — Chip variant (quiet, dot-led) or Button variant (outline) */}
      {variant === "chip" ? (
        <button
          onClick={() => availableActions.length > 0 && setShowMenu(!showMenu)}
          aria-haspopup={availableActions.length > 0 ? "menu" : undefined}
          aria-expanded={showMenu}
          aria-label={availableActions.length > 0 ? `Status: ${displayStatus}. Click to change.` : `Status: ${displayStatus}`}
          disabled={availableActions.length === 0}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            height: "24px",
            padding: "0 10px",
            backgroundColor: statusStyle.bgColor,
            border: `1px solid ${statusStyle.borderColor}`,
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: 500,
            color: statusStyle.color,
            cursor: availableActions.length > 0 ? "pointer" : "default",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: statusStyle.color,
            display: "inline-block",
            flexShrink: 0,
          }} />
          <span>{displayStatus}</span>
          {availableActions.length > 0 && (
            <ChevronDown size={12} style={{ color: statusStyle.color, opacity: 0.7 }} />
          )}
        </button>
      ) : (
        <button
          onClick={() => setShowMenu(!showMenu)}
          aria-haspopup="menu"
          aria-expanded={showMenu}
          aria-label={`Status: ${displayStatus}. Click to change.`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            height: "36px",
            padding: "0 14px",
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--theme-border-default)",
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: 600,
            color: statusStyle.color,
            cursor: "pointer",
            transition: "all 0.2s ease"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
          }}
        >
          <span style={{ color: statusStyle.color, display: "flex", alignItems: "center" }}>
            <StatusIcon size={16} />
          </span>
          <span>{displayStatus}</span>
          <ChevronDown size={14} style={{ color: statusStyle.color }} />
        </button>
      )}

      {/* Dropdown Menu */}
      {showMenu && (
        <div
          role="menu"
          aria-label="Change quotation status"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: "240px",
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "8px",
            boxShadow: "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)",
            zIndex: 100,
            overflow: "hidden"
          }}
        >
          {availableActions.map((action, index) => (
            <button
              key={action.value}
              role="menuitem"
              onClick={action.action}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "12px 16px",
                backgroundColor: "transparent",
                border: "none",
                borderBottom: index < availableActions.length - 1 ? "1px solid var(--theme-border-subtle)" : "none",
                cursor: "pointer",
                textAlign: "left",
                transition: "background-color 0.15s ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <div style={{ marginTop: "2px" }}>{action.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ 
                  fontSize: "14px", 
                  color: "var(--theme-text-primary)",
                  fontWeight: 500,
                  marginBottom: "2px"
                }}>
                  {action.label}
                </div>
                <div style={{ 
                  fontSize: "12px", 
                  color: "var(--theme-text-muted)",
                  lineHeight: "1.4"
                }}>
                  {action.sublabel}
                </div>
              </div>
            </button>
          ))}
          
          {/* Separator + Disapproved/Cancelled — hidden if already converted to project or contract */}
          {normalizedStatus !== "Converted to Project" && normalizedStatus !== "Converted to Contract" && normalizedStatus !== "Disapproved" && normalizedStatus !== "Cancelled" && (
            <>
              {availableActions.length > 0 && (
                <div style={{
                  height: "1px",
                  backgroundColor: "var(--theme-border-default)",
                  margin: "4px 0"
                }} />
              )}
              <button
                role="menuitem"
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
              e.currentTarget.style.backgroundColor = "var(--theme-status-danger-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <div style={{ marginTop: "2px" }}>
              <XCircle size={16} style={{ color: "var(--theme-status-danger-fg)" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ 
                fontSize: "14px", 
                color: "var(--theme-status-danger-fg)",
                fontWeight: 500,
                marginBottom: "2px"
              }}>
                Disapproved / Cancelled
              </div>
              <div style={{ 
                fontSize: "12px", 
                color: "var(--theme-status-danger-fg)",
                opacity: 0.8,
                lineHeight: "1.4"
              }}>
                Reject or cancel quotation
              </div>
            </div>
          </button>
            </>
          )}
        </div>
      )}

      {/* Disapprove/Cancel — SidePanel (replaces centered overlay modal) */}
      <SidePanel
        isOpen={showDisapproveModal}
        onClose={() => { setShowDisapproveModal(false); setReason(""); }}
        title="Disapprove or Cancel Quotation"
        size="sm"
        footer={
          <div style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--theme-border-default)",
            display: "flex",
            gap: "12px",
            justifyContent: "flex-end",
            backgroundColor: "var(--theme-bg-surface)"
          }}>
            <button
              onClick={() => { setShowDisapproveModal(false); setReason(""); }}
              style={{
                padding: "10px 20px",
                backgroundColor: "var(--theme-bg-surface)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--theme-text-secondary)",
                cursor: "pointer",
                transition: "background-color 0.15s ease"
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-bg-page)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)"; }}
            >
              Cancel
            </button>
            <button
              onClick={confirmDisapprove}
              disabled={!reason}
              style={{
                padding: "10px 20px",
                backgroundColor: !reason ? "var(--theme-status-danger-border)" : "var(--theme-status-danger-fg)",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                color: "white",
                cursor: !reason ? "not-allowed" : "pointer",
                opacity: !reason ? 0.6 : 1,
                transition: "opacity 0.15s ease"
              }}
            >
              Confirm
            </button>
          </div>
        }
      >
        <div style={{ padding: "24px", overflowY: "auto", height: "100%" }}>
          <p style={{
            fontSize: "14px",
            color: "var(--theme-text-muted)",
            lineHeight: "1.6",
            marginBottom: "24px"
          }}>
            Select the appropriate status and provide a reason. This will automatically notify the Pricing Manager and CEO.
          </p>

          {/* Status Selection */}
          <div style={{ marginBottom: "20px" }}>
            <label htmlFor="disapproval-status" style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--theme-text-primary)",
              marginBottom: "8px",
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
            <label htmlFor="disapproval-reason" style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--theme-text-primary)",
              marginBottom: "8px",
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

          {/* Warning Note */}
          <div style={{
            backgroundColor: "var(--theme-status-warning-bg)",
            border: "1px solid var(--theme-status-warning-border)",
            borderRadius: "8px",
            padding: "14px 16px",
            fontSize: "13px",
            color: "var(--theme-status-warning-fg)",
            lineHeight: "1.5"
          }}>
            <div style={{
              fontWeight: 600,
              marginBottom: "4px",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}>
              <AlertCircle size={15} />
              Note:
            </div>
            <div>
              This action will automatically route a notification ticket to the Pricing Manager and CEO for review.
            </div>
          </div>
        </div>
      </SidePanel>
    </div>
  );
}
