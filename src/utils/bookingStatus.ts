import { ExecutionStatus } from "../types/operations";
import { CheckCircle2, Truck, XCircle, AlertCircle, FileText } from "lucide-react";

interface StatusStyle {
  bg: string;
  text: string;
  borderColor?: string;
  icon?: any;
  label?: string;
}

export function getBookingStatusStyles(status: ExecutionStatus): StatusStyle {
  switch (status) {
    case "Draft":
      return {
        bg: "var(--neuron-pill-inactive-bg)",
        text: "var(--theme-text-muted)",
        icon: FileText,
        borderColor: "var(--theme-border-default)"
      };

    case "Confirmed":
      return {
        bg: "var(--neuron-semantic-info-bg)",
        text: "var(--neuron-semantic-info)",
        icon: CheckCircle2,
        borderColor: "var(--neuron-semantic-info-bg)"
      };

    case "In Progress":
      return {
        bg: "var(--neuron-dept-ops-bg)",
        text: "var(--neuron-dept-ops-text)",
        icon: Truck,
        borderColor: "var(--neuron-dept-ops-bg)"
      };

    case "Delivered":
    case "Completed":
      return {
        bg: "var(--theme-status-success-bg)",
        text: "var(--theme-status-success-fg)",
        icon: CheckCircle2,
        borderColor: "var(--theme-status-success-bg)"
      };

    case "On Hold":
      return {
        bg: "var(--theme-status-warning-bg)",
        text: "var(--theme-status-warning-fg)",
        icon: AlertCircle,
        borderColor: "var(--theme-status-warning-bg)"
      };

    case "Cancelled":
      return {
        bg: "var(--theme-status-danger-bg)",
        text: "var(--theme-status-danger-fg)",
        icon: XCircle,
        borderColor: "var(--theme-status-danger-bg)"
      };

    case "Closed":
      return {
        bg: "var(--neuron-pill-inactive-bg)",
        text: "var(--theme-text-secondary)",
        icon: FileText,
        borderColor: "var(--theme-border-default)"
      };

    default:
      return {
        bg: "var(--neuron-pill-inactive-bg)",
        text: "var(--theme-text-muted)",
        icon: FileText,
        borderColor: "var(--theme-border-default)"
      };
  }
}
