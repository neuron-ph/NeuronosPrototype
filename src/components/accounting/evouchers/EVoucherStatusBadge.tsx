import { FileText, Clock, CheckCircle, XCircle, Ban } from "lucide-react";
import type { EVoucherStatus } from "../../../types/evoucher";

interface EVoucherStatusBadgeProps {
  status: EVoucherStatus;
  size?: "sm" | "md" | "lg";
}

export function EVoucherStatusBadge({ status, size = "md" }: EVoucherStatusBadgeProps) {
  const getStatusStyle = (status: EVoucherStatus) => {
    const normalized = status.toLowerCase();
    
    switch (normalized) {
      case "draft":
        return {
          bg: "var(--theme-bg-page)",
          color: "var(--theme-text-muted)",
          border: "var(--theme-border-default)",
          icon: FileText,
          label: "Draft"
        };
      // Canonical AP workflow states
      case "pending_manager":
      case "pending_tl": // legacy
        return { bg: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)", border: "var(--theme-status-warning-border)", icon: Clock, label: "Pending Manager Approval" };
      case "pending_ceo":
        return { bg: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)", border: "var(--theme-status-warning-border)", icon: Clock, label: "Pending CEO Approval" };
      case "pending_accounting":
        return { bg: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)", border: "var(--theme-status-warning-border)", icon: Clock, label: "Pending Accounting" };
      case "disbursed":
        return { bg: "var(--theme-status-success-bg)", color: "var(--theme-status-success-fg)", border: "var(--theme-status-success-border)", icon: CheckCircle, label: "Disbursed" };
      case "posted":
        return { bg: "var(--theme-bg-surface-tint)", color: "var(--theme-action-primary-bg)", border: "var(--theme-action-primary-border)", icon: CheckCircle, label: "Posted" };
      case "rejected":
        return { bg: "var(--theme-status-danger-bg)", color: "var(--theme-status-danger-fg)", border: "var(--theme-status-danger-border)", icon: XCircle, label: "Rejected" };
      case "cancelled":
        return { bg: "var(--theme-bg-surface-subtle)", color: "var(--theme-text-muted)", border: "var(--theme-border-default)", icon: Ban, label: "Cancelled" };
      case "pending_liquidation":
      case "liquidation_open": // legacy
        return { bg: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)", border: "var(--theme-status-warning-border)", icon: Clock, label: "Submit Receipts" };
      case "pending_verification":
      case "liquidation_pending": // legacy
        return { bg: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)", border: "var(--theme-status-warning-border)", icon: Clock, label: "Pending Verification" };
      case "liquidation_closed": // legacy — maps to posted
        return { bg: "var(--theme-status-success-bg)", color: "var(--theme-status-success-fg)", border: "var(--theme-status-success-border)", icon: CheckCircle, label: "Posted" };
      // Legacy statuses — kept for backwards compat with old DB records
      case "pending":
        return { bg: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)", border: "var(--theme-status-warning-border)", icon: Clock, label: "Pending" };
      case "submitted":
        return { bg: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)", border: "var(--theme-status-warning-border)", icon: Clock, label: "Submitted" };
      case "under review":
        return { bg: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)", border: "var(--theme-status-warning-border)", icon: Clock, label: "Under Review" };
      case "approved":
        return { bg: "var(--theme-status-success-bg)", color: "var(--theme-status-success-fg)", border: "var(--theme-status-success-border)", icon: CheckCircle, label: "Approved" };
      default:
        return {
          bg: "var(--theme-bg-page)",
          color: "var(--theme-text-muted)",
          border: "var(--theme-border-default)",
          icon: FileText,
          label: status
        };
    }
  };

  const sizes = {
    sm: {
      padding: "4px 8px",
      fontSize: "11px",
      iconSize: 12,
      gap: "4px"
    },
    md: {
      padding: "6px 12px",
      fontSize: "13px",
      iconSize: 14,
      gap: "6px"
    },
    lg: {
      padding: "8px 16px",
      fontSize: "14px",
      iconSize: 16,
      gap: "8px"
    }
  };

  const statusStyle = getStatusStyle(status);
  const sizeStyle = sizes[size];
  const StatusIcon = statusStyle.icon;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: sizeStyle.gap,
        padding: sizeStyle.padding,
        borderRadius: "8px",
        backgroundColor: statusStyle.bg,
        color: statusStyle.color,
        border: `1px solid ${statusStyle.border}`,
        fontSize: sizeStyle.fontSize,
        fontWeight: 500,
        whiteSpace: "nowrap"
      }}
    >
      <StatusIcon size={sizeStyle.iconSize} />
      {statusStyle.label}
    </span>
  );
}
