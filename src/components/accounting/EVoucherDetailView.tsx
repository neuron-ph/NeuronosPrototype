import { useState } from "react";
import { X, FileText, User, Calendar, Building2, CheckCircle, XCircle, Clock, ArrowRight, ExternalLink } from "lucide-react";
import { PhilippinePeso } from "../icons/PhilippinePeso";
import { EVoucherStatusBadge } from "./evouchers/EVoucherStatusBadge";
import { EVoucherWorkflowPanel } from "./evouchers/EVoucherWorkflowPanel";
import { EVoucherHistoryTimeline } from "./evouchers/EVoucherHistoryTimeline";
import { apiFetch } from "../../utils/api";
import { toast } from "sonner@2.0.3";
import type { EVoucher } from "../../types/evoucher";

interface EVoucherDetailViewProps {
  evoucher: EVoucher;
  onClose: () => void;
  currentUser?: { id: string; name: string; email: string; role?: string; department?: string };
  onStatusChange?: () => void;
}

export function EVoucherDetailView({ evoucher, onClose, currentUser, onStatusChange }: EVoucherDetailViewProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Approved":
        return { bg: "#E8F5F3", color: "#0F766E", icon: CheckCircle };
      case "Disbursed":
        return { bg: "#D1FAE5", color: "#059669", icon: CheckCircle };
      case "Recorded":
      case "Audited":
        return { bg: "#DBEAFE", color: "#1D4ED8", icon: CheckCircle };
      case "Disapproved":
      case "Cancelled":
        return { bg: "#FFE5E5", color: "#C94F3D", icon: XCircle };
      case "Under Review":
      case "Processing":
        return { bg: "#FEF3E7", color: "#C88A2B", icon: Clock };
      case "Submitted":
        return { bg: "#F3F4F6", color: "#6B7A76", icon: Clock };
      default: // Draft
        return { bg: "#F9FAFB", color: "#9CA3AF", icon: FileText };
    }
  };

  const statusStyle = getStatusColor(evoucher.status);
  const StatusIcon = statusStyle.icon;

  // Check if current user can approve
  const dept = currentUser?.department;
  const role = currentUser?.role;
  const isAcctMgr = dept === 'Accounting' && (role === 'manager' || role === 'director');
  const isAcctRep = dept === 'Accounting' && role === 'rep';
  const isAcctDir = dept === 'Accounting' && role === 'director';
  const isExec = dept === 'Executive';
  const canApprove  = evoucher.status === 'Under Review' && (isAcctMgr || isExec);
  const canDisburse = evoucher.status === 'Approved'     && (isAcctMgr || isExec);
  const canRecord   = evoucher.status === 'Disbursed'    && (isAcctRep || isAcctMgr || isExec);
  const canAudit    = evoucher.status === 'Recorded'     && (isAcctDir || isExec);

  const getUserPayload = () => {
    const userData = localStorage.getItem("neuron_user");
    const user = userData ? JSON.parse(userData) : currentUser;
    return {
      user_id: user?.id || currentUser?.id,
      user_name: user?.name || currentUser?.name,
      user_role: user?.department || currentUser?.department,
    };
  };

  const handleApprove = async () => {
    if (!confirm("Are you sure you want to approve this E-Voucher?")) return;
    setIsSubmitting(true);
    try {
      const response = await apiFetch(`/evouchers/${evoucher.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ ...getUserPayload(), notes: '' }),
      });
      const result = await response.json();
      if (result.success) {
        toast.success("E-Voucher approved successfully");
        onStatusChange?.();
        onClose();
      } else {
        toast.error(`Failed to approve: ${result.error}`);
      }
    } catch (error) {
      console.error("Error approving E-Voucher:", error);
      toast.error("Failed to approve E-Voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisapprove = async () => {
    const reason = prompt("Please provide a reason for disapproval:");
    if (!reason) return;
    setIsSubmitting(true);
    try {
      const response = await apiFetch(`/evouchers/${evoucher.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ ...getUserPayload(), rejection_reason: reason }),
      });
      const result = await response.json();
      if (result.success) {
        toast.success("E-Voucher disapproved");
        onStatusChange?.();
        onClose();
      } else {
        toast.error(`Failed to disapprove: ${result.error}`);
      }
    } catch (error) {
      console.error("Error disapproving E-Voucher:", error);
      toast.error("Failed to disapprove E-Voucher");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisburse = async () => {
    if (!confirm("Mark this E-Voucher as disbursed?")) return;
    setIsSubmitting(true);
    try {
      // TODO: Server endpoint POST /evouchers/:id/disburse does not exist yet.
      // When added, it should transition status Approved → Disbursed and record
      // disbursement_officer, disbursement_date, payment_method in the evoucher.
      const response = await apiFetch(`/evouchers/${evoucher.id}/disburse`, {
        method: 'POST',
        body: JSON.stringify(getUserPayload()),
      });
      const result = await response.json();
      if (result.success) {
        toast.success("E-Voucher marked as disbursed");
        onStatusChange?.();
        onClose();
      } else {
        toast.error(`Failed to disburse: ${result.error}`);
      }
    } catch (error) {
      console.error("Error disbursing E-Voucher:", error);
      toast.error("Disburse endpoint not available yet — server update required");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecord = async () => {
    if (!confirm("Record the transaction for this E-Voucher? This will post to the accounting ledger.")) return;
    setIsSubmitting(true);
    try {
      const response = await apiFetch(`/evouchers/${evoucher.id}/post-to-ledger`, {
        method: 'POST',
        body: JSON.stringify(getUserPayload()),
      });
      const result = await response.json();
      if (result.success) {
        toast.success("Transaction recorded and posted to ledger");
        onStatusChange?.();
        onClose();
      } else {
        toast.error(`Failed to record: ${result.error}`);
      }
    } catch (error) {
      console.error("Error recording transaction:", error);
      toast.error("Failed to record transaction");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAudit = async () => {
    if (!confirm("Mark this E-Voucher as audited? This completes the workflow.")) return;
    setIsSubmitting(true);
    try {
      // TODO: Server endpoint POST /evouchers/:id/audit does not exist yet.
      // When added, it should transition status Recorded → Audited and record
      // audited_by, audited_at in the evoucher + add workflow history.
      const response = await apiFetch(`/evouchers/${evoucher.id}/audit`, {
        method: 'POST',
        body: JSON.stringify(getUserPayload()),
      });
      const result = await response.json();
      if (result.success) {
        toast.success("E-Voucher audit completed");
        onStatusChange?.();
        onClose();
      } else {
        toast.error(`Failed to complete audit: ${result.error}`);
      }
    } catch (error) {
      console.error("Error auditing E-Voucher:", error);
      toast.error("Audit endpoint not available yet — server update required");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "960px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px 32px",
            borderBottom: "1px solid var(--neuron-ui-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <h2 style={{ fontSize: "24px", fontWeight: 600, color: "#12332B" }}>
                {evoucher.voucher_number}
              </h2>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  padding: "6px 12px",
                  borderRadius: "8px",
                  backgroundColor: statusStyle.bg,
                  color: statusStyle.color,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <StatusIcon size={14} />
                {evoucher.status}
              </span>
            </div>
            <p style={{ fontSize: "14px", color: "#667085" }}>
              E-Voucher Details & Approval Workflow
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "transparent",
              color: "#667085",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#F3F4F6";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "32px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px" }}>
            {/* Left Column */}
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* Expense Information Card */}
              <div
                style={{
                  padding: "20px",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "12px",
                  backgroundColor: "#FAFAFA",
                }}
              >
                <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#12332B", marginBottom: "16px" }}>
                  Expense Information
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "14px", color: "#667085" }}>Amount:</span>
                    <span style={{ fontSize: "18px", fontWeight: 600, color: "#12332B" }}>
                      <PhilippinePeso size={16} style={{ marginRight: "4px" }} />
                      {evoucher.amount.toLocaleString()} {evoucher.currency}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "14px", color: "#667085" }}>Category:</span>
                    <span style={{ fontSize: "14px", fontWeight: 500, color: "#374151" }}>
                      {evoucher.expense_category}
                    </span>
                  </div>
                  {evoucher.sub_category && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "14px", color: "#667085" }}>Sub-Category:</span>
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "#374151" }}>
                        {evoucher.sub_category}
                      </span>
                    </div>
                  )}
                  <div style={{ marginTop: "8px", paddingTop: "12px", borderTop: "1px solid var(--neuron-ui-border)" }}>
                    <div style={{ fontSize: "13px", color: "#667085", marginBottom: "4px" }}>Purpose:</div>
                    <div style={{ fontSize: "14px", color: "#374151" }}>{evoucher.purpose}</div>
                  </div>
                  {evoucher.description && (
                    <div>
                      <div style={{ fontSize: "13px", color: "#667085", marginBottom: "4px" }}>Description:</div>
                      <div style={{ fontSize: "14px", color: "#374151" }}>{evoucher.description}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Vendor Information Card */}
              <div
                style={{
                  padding: "20px",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "12px",
                }}
              >
                <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#12332B", marginBottom: "16px" }}>
                  Vendor/Payee
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Building2 size={16} style={{ color: "#667085" }} />
                    <span style={{ fontSize: "14px", fontWeight: 500, color: "#374151" }}>
                      {evoucher.vendor_name}
                    </span>
                  </div>
                  {evoucher.vendor_contact && (
                    <div style={{ fontSize: "13px", color: "#667085" }}>
                      Contact: {evoucher.vendor_contact}
                    </div>
                  )}
                  {evoucher.credit_terms && (
                    <div style={{ fontSize: "13px", color: "#667085" }}>
                      Terms: {evoucher.credit_terms}
                    </div>
                  )}
                  {evoucher.due_date && (
                    <div style={{ fontSize: "13px", color: "#667085" }}>
                      Due: {new Date(evoucher.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  )}
                </div>
              </div>

              {/* Linking Information Card */}
              {(evoucher.project_number || evoucher.customer_name || evoucher.budget_request_number) && (
                <div
                  style={{
                    padding: "20px",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "12px",
                  }}
                >
                  <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#12332B", marginBottom: "16px" }}>
                    Linked Records
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {evoucher.project_number && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <FileText size={16} style={{ color: "#667085" }} />
                        <span style={{ fontSize: "14px", color: "#0F766E", fontWeight: 500 }}>
                          Project: {evoucher.project_number}
                        </span>
                      </div>
                    )}
                    {evoucher.customer_name && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Building2 size={16} style={{ color: "#667085" }} />
                        <span style={{ fontSize: "14px", color: "#0F766E", fontWeight: 500 }}>
                          Customer: {evoucher.customer_name}
                        </span>
                      </div>
                    )}
                    {evoucher.budget_request_number && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <FileText size={16} style={{ color: "#667085" }} />
                        <span style={{ fontSize: "14px", color: "#0F766E", fontWeight: 500 }}>
                          Budget Request: {evoucher.budget_request_number}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Workflow History */}
              <div
                style={{
                  padding: "20px",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "12px",
                }}
              >
                <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#12332B", marginBottom: "16px" }}>
                  Workflow History
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {(evoucher.workflow_history || []).length === 0 ? (
                    <div style={{ fontSize: "14px", color: "#667085", textAlign: "center", padding: "20px" }}>
                      No workflow history yet
                    </div>
                  ) : (
                    (evoucher.workflow_history || []).map((item, index) => {
                      const isLast = index === (evoucher.workflow_history || []).length - 1;
                      return (
                        <div key={item.id} style={{ display: "flex", gap: "12px" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <div
                              style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                backgroundColor: isLast ? "#0F766E" : "#CBD5E1",
                              }}
                            />
                            {!isLast && (
                              <div style={{ width: "2px", flex: 1, backgroundColor: "#E2E8F0", minHeight: "24px" }} />
                            )}
                          </div>
                          <div style={{ flex: 1, paddingBottom: isLast ? "0" : "8px" }}>
                            <div style={{ fontSize: "14px", fontWeight: 500, color: "#374151", marginBottom: "2px" }}>
                              {item.action}
                            </div>
                            <div style={{ fontSize: "13px", color: "#667085" }}>
                              {item.user_name} ({item.user_role})
                            </div>
                            <div style={{ fontSize: "12px", color: "#98A2B3" }}>
                              {new Date(item.timestamp).toLocaleString('en-PH', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                            {item.remarks && (
                              <div style={{ fontSize: "13px", color: "#667085", marginTop: "4px", fontStyle: "italic" }}>
                                "{item.remarks}"
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* Request Details Card */}
              <div
                style={{
                  padding: "20px",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "12px",
                  backgroundColor: "#FAFAFA",
                }}
              >
                <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#12332B", marginBottom: "16px" }}>
                  Request Details
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <div style={{ fontSize: "13px", color: "#667085", marginBottom: "4px" }}>Requestor:</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <User size={14} style={{ color: "#667085" }} />
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "#374151" }}>
                        {evoucher.requestor_name}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "13px", color: "#667085", marginBottom: "4px" }}>Request Date:</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Calendar size={14} style={{ color: "#667085" }} />
                      <span style={{ fontSize: "14px", color: "#374151" }}>
                        {new Date(evoucher.request_date).toLocaleDateString('en-PH', { 
                          month: 'long', 
                          day: 'numeric', 
                          year: 'numeric' 
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Approvers Card */}
              {evoucher.approvers && evoucher.approvers.length > 0 && (
                <div
                  style={{
                    padding: "20px",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "12px",
                  }}
                >
                  <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#12332B", marginBottom: "16px" }}>
                    Approvers
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {(evoucher.approvers || []).map((approver) => (
                      <div key={approver.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <CheckCircle size={16} style={{ color: "#059669" }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "14px", fontWeight: 500, color: "#374151" }}>
                            {approver.name}
                          </div>
                          <div style={{ fontSize: "12px", color: "#667085" }}>
                            {approver.role} • {approver.approved_at && new Date(approver.approved_at).toLocaleDateString('en-PH')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Disbursement Info */}
              {evoucher.disbursement_officer_name && (
                <div
                  style={{
                    padding: "20px",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "12px",
                  }}
                >
                  <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#12332B", marginBottom: "16px" }}>
                    Disbursement
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <div style={{ fontSize: "13px", color: "#667085", marginBottom: "4px" }}>Officer:</div>
                      <div style={{ fontSize: "14px", fontWeight: 500, color: "#374151" }}>
                        {evoucher.disbursement_officer_name}
                      </div>
                    </div>
                    {evoucher.disbursement_date && (
                      <div>
                        <div style={{ fontSize: "13px", color: "#667085", marginBottom: "4px" }}>Date:</div>
                        <div style={{ fontSize: "14px", color: "#374151" }}>
                          {new Date(evoucher.disbursement_date).toLocaleDateString('en-PH')}
                        </div>
                      </div>
                    )}
                    {evoucher.payment_method && (
                      <div>
                        <div style={{ fontSize: "13px", color: "#667085", marginBottom: "4px" }}>Method:</div>
                        <div style={{ fontSize: "14px", color: "#374151" }}>
                          {evoucher.payment_method}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {(canApprove || canDisburse || canRecord || canAudit) && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {canApprove && (
                    <>
                      <button
                        style={{
                          width: "100%",
                          padding: "12px",
                          borderRadius: "8px",
                          border: "none",
                          backgroundColor: "#0F766E",
                          color: "#FFFFFF",
                          fontSize: "14px",
                          fontWeight: 500,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#0D6560";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "#0F766E";
                        }}
                        onClick={handleApprove}
                        disabled={isSubmitting}
                      >
                        <CheckCircle size={16} />
                        Approve Voucher
                      </button>
                      <button
                        style={{
                          width: "100%",
                          padding: "12px",
                          borderRadius: "8px",
                          border: "1px solid #EF4444",
                          backgroundColor: "#FFFFFF",
                          color: "#EF4444",
                          fontSize: "14px",
                          fontWeight: 500,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#FEE2E2";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "#FFFFFF";
                        }}
                        onClick={handleDisapprove}
                        disabled={isSubmitting}
                      >
                        <XCircle size={16} />
                        Disapprove
                      </button>
                    </>
                  )}
                  {canDisburse && (
                    <button
                      style={{
                        width: "100%",
                        padding: "12px",
                        borderRadius: "8px",
                        border: "none",
                        backgroundColor: "#0F766E",
                        color: "#FFFFFF",
                        fontSize: "14px",
                        fontWeight: 500,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#0D6560";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#0F766E";
                      }}
                      onClick={handleDisburse}
                      disabled={isSubmitting}
                    >
                      <ArrowRight size={16} />
                      Process Disbursement
                    </button>
                  )}
                  {canRecord && (
                    <button
                      style={{
                        width: "100%",
                        padding: "12px",
                        borderRadius: "8px",
                        border: "none",
                        backgroundColor: "#0F766E",
                        color: "#FFFFFF",
                        fontSize: "14px",
                        fontWeight: 500,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#0D6560";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#0F766E";
                      }}
                      onClick={handleRecord}
                      disabled={isSubmitting}
                    >
                      <FileText size={16} />
                      Record Transaction
                    </button>
                  )}
                  {canAudit && (
                    <button
                      style={{
                        width: "100%",
                        padding: "12px",
                        borderRadius: "8px",
                        border: "none",
                        backgroundColor: "#0F766E",
                        color: "#FFFFFF",
                        fontSize: "14px",
                        fontWeight: 500,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#0D6560";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#0F766E";
                      }}
                      onClick={handleAudit}
                      disabled={isSubmitting}
                    >
                      <CheckCircle size={16} />
                      Complete Audit
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}