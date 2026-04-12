import { X, FileText, User, Calendar, Building2, CheckCircle } from "lucide-react";
import { PhilippinePeso } from "../icons/PhilippinePeso";
import { EVoucherWorkflowPanel } from "./evouchers/EVoucherWorkflowPanel";
import type { EVoucher } from "../../types/evoucher";

interface EVoucherDetailViewProps {
  evoucher: EVoucher;
  onClose: () => void;
  currentUser?: { id: string; name: string; email: string; role?: string; department?: string };
  onStatusChange?: () => void;
}

export function EVoucherDetailView({ evoucher, onClose, currentUser, onStatusChange }: EVoucherDetailViewProps) {

  const getStatusColor = (status: string) => {
    switch (status) {
      case "posted":
      case "disbursed":
        return { bg: "var(--theme-status-success-bg)", color: "var(--theme-status-success-fg)", icon: CheckCircle };
      case "pending_accounting":
      case "pending_ceo":
      case "pending_manager":
      case "pending_tl": // legacy
      case "pending_liquidation":
      case "pending_verification":
        return { bg: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)", icon: FileText };
      case "rejected":
      case "cancelled":
        return { bg: "var(--theme-status-danger-bg)", color: "var(--theme-status-danger-fg)", icon: X };
      // Legacy states — for old DB records
      case "Approved": case "Recorded": case "Audited": case "Disbursed":
        return { bg: "var(--theme-status-success-bg)", color: "var(--theme-status-success-fg)", icon: CheckCircle };
      case "Under Review": case "Processing": case "Submitted":
        return { bg: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)", icon: FileText };
      case "Disapproved": case "Cancelled":
        return { bg: "var(--theme-status-danger-bg)", color: "var(--theme-status-danger-fg)", icon: X };
      default:
        return { bg: "var(--theme-bg-page)", color: "var(--theme-text-muted)", icon: FileText };
    }
  };

  const statusStyle = getStatusColor(evoucher.status);
  const StatusIcon = statusStyle.icon;

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
          backgroundColor: "var(--theme-bg-surface)",
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
              <h2 style={{ fontSize: "24px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
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
            <p style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>
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
              color: "var(--theme-text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
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
                  backgroundColor: "var(--neuron-pill-inactive-bg)",
                }}
              >
                <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "16px" }}>
                  Expense Information
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>Amount:</span>
                    <span style={{ fontSize: "18px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                      <PhilippinePeso size={16} style={{ marginRight: "4px" }} />
                      {evoucher.amount.toLocaleString()} {evoucher.currency}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>Category:</span>
                    <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-secondary)" }}>
                      {evoucher.expense_category}
                    </span>
                  </div>
                  {evoucher.gl_sub_category && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>Sub-Category:</span>
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-secondary)" }}>
                        {evoucher.gl_sub_category}
                      </span>
                    </div>
                  )}
                  <div style={{ marginTop: "8px", paddingTop: "12px", borderTop: "1px solid var(--neuron-ui-border)" }}>
                    <div style={{ fontSize: "13px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Purpose:</div>
                    <div style={{ fontSize: "14px", color: "var(--theme-text-secondary)" }}>{evoucher.purpose}</div>
                  </div>
                  {evoucher.description && (
                    <div>
                      <div style={{ fontSize: "13px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Description:</div>
                      <div style={{ fontSize: "14px", color: "var(--theme-text-secondary)" }}>{evoucher.description}</div>
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
                <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "16px" }}>
                  Vendor/Payee
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Building2 size={16} style={{ color: "var(--theme-text-muted)" }} />
                    <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-secondary)" }}>
                      {evoucher.vendor_name}
                    </span>
                  </div>
                  {evoucher.vendor_contact && (
                    <div style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
                      Contact: {evoucher.vendor_contact}
                    </div>
                  )}
                  {evoucher.credit_terms && (
                    <div style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
                      Terms: {evoucher.credit_terms}
                    </div>
                  )}
                  {evoucher.due_date && (
                    <div style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
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
                  <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "16px" }}>
                    Linked Records
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {evoucher.project_number && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <FileText size={16} style={{ color: "var(--theme-text-muted)" }} />
                        <span style={{ fontSize: "14px", color: "var(--theme-action-primary-bg)", fontWeight: 500 }}>
                          Project: {evoucher.project_number}
                        </span>
                      </div>
                    )}
                    {evoucher.customer_name && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Building2 size={16} style={{ color: "var(--theme-text-muted)" }} />
                        <span style={{ fontSize: "14px", color: "var(--theme-action-primary-bg)", fontWeight: 500 }}>
                          Customer: {evoucher.customer_name}
                        </span>
                      </div>
                    )}
                    {evoucher.budget_request_number && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <FileText size={16} style={{ color: "var(--theme-text-muted)" }} />
                        <span style={{ fontSize: "14px", color: "var(--theme-action-primary-bg)", fontWeight: 500 }}>
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
                <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "16px" }}>
                  Workflow History
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {(evoucher.workflow_history || []).length === 0 ? (
                    <div style={{ fontSize: "14px", color: "var(--theme-text-muted)", textAlign: "center", padding: "20px" }}>
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
                                backgroundColor: isLast ? "var(--theme-action-primary-bg)" : "var(--neuron-ui-muted)",
                              }}
                            />
                            {!isLast && (
                              <div style={{ width: "2px", flex: 1, backgroundColor: "var(--theme-border-default)", minHeight: "24px" }} />
                            )}
                          </div>
                          <div style={{ flex: 1, paddingBottom: isLast ? "0" : "8px" }}>
                            <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-secondary)", marginBottom: "2px" }}>
                              {item.action}
                            </div>
                            <div style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
                              {item.user_name} ({item.user_role})
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
                              {new Date(item.timestamp).toLocaleString('en-PH', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                            {item.remarks && (
                              <div style={{ fontSize: "13px", color: "var(--theme-text-muted)", marginTop: "4px", fontStyle: "italic" }}>
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
                  backgroundColor: "var(--neuron-pill-inactive-bg)",
                }}
              >
                <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "16px" }}>
                  Request Details
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <div style={{ fontSize: "13px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Requestor:</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <User size={14} style={{ color: "var(--theme-text-muted)" }} />
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-secondary)" }}>
                        {evoucher.requestor_name}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "13px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Request Date:</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Calendar size={14} style={{ color: "var(--theme-text-muted)" }} />
                      <span style={{ fontSize: "14px", color: "var(--theme-text-secondary)" }}>
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
                  <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "16px" }}>
                    Approvers
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {(evoucher.approvers || []).map((approver) => (
                      <div key={approver.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <CheckCircle size={16} style={{ color: "var(--theme-status-success-fg)" }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-secondary)" }}>
                            {approver.name}
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--theme-text-muted)" }}>
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
                  <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "16px" }}>
                    Disbursement
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <div style={{ fontSize: "13px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Officer:</div>
                      <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-secondary)" }}>
                        {evoucher.disbursement_officer_name}
                      </div>
                    </div>
                    {evoucher.disbursement_date && (
                      <div>
                        <div style={{ fontSize: "13px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Date:</div>
                        <div style={{ fontSize: "14px", color: "var(--theme-text-secondary)" }}>
                          {new Date(evoucher.disbursement_date).toLocaleDateString('en-PH')}
                        </div>
                      </div>
                    )}
                    {evoucher.payment_method && (
                      <div>
                        <div style={{ fontSize: "13px", color: "var(--theme-text-muted)", marginBottom: "4px" }}>Method:</div>
                        <div style={{ fontSize: "14px", color: "var(--theme-text-secondary)" }}>
                          {evoucher.payment_method}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Workflow Actions — all state transitions handled here */}
              <div
                style={{
                  padding: "20px",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "12px",
                }}
              >
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
                  currentUser={currentUser}
                  onStatusChange={() => {
                    onStatusChange?.();
                    onClose();
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}