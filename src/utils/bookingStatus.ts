import { ExecutionStatus } from "../types/operations";
import { CheckCircle2, Clock, DollarSign, FileText, RotateCw, Ship, Truck, XCircle, AlertCircle } from "lucide-react";

interface StatusStyle {
  bg: string;
  text: string;
  borderColor?: string;
  icon?: any;
  label?: string;
}

export function getBookingStatusStyles(status: ExecutionStatus): StatusStyle {
  switch (status) {
    case "Created":
    case "Draft":
      return {
        bg: "var(--neuron-pill-inactive-bg)",
        text: "var(--theme-text-muted)",
        icon: FileText,
        borderColor: "var(--theme-border-default)"
      };

    case "Confirmed":
    case "Waiting for Arrival":
      return {
        bg: "var(--neuron-semantic-info-bg)",
        text: "var(--neuron-semantic-info)",
        icon: CheckCircle2,
        borderColor: "var(--neuron-semantic-info-bg)"
      };

    case "In Progress":
    case "Ongoing":
    case "In Transit":
      return {
        bg: "var(--neuron-dept-ops-bg)",
        text: "var(--neuron-dept-ops-text)",
        icon: Truck,
        borderColor: "var(--neuron-dept-ops-bg)"
      };

    case "Pending":
      return {
        bg: "var(--theme-status-warning-bg)",
        text: "var(--theme-status-warning-fg)",
        icon: Clock,
        borderColor: "var(--theme-status-warning-border)"
      };

    case "Delivered":
    case "Completed":
    case "Audited":
      return {
        bg: "var(--theme-status-success-bg)",
        text: "var(--theme-status-success-fg)",
        icon: CheckCircle2,
        borderColor: "var(--theme-status-success-bg)"
      };

    case "Empty Return":
      return {
        bg: "var(--neuron-semantic-info-bg)",
        text: "var(--neuron-semantic-info)",
        icon: RotateCw,
        borderColor: "var(--neuron-semantic-info-bg)"
      };

    case "Liquidated":
      return {
        bg: "var(--theme-status-success-bg)",
        text: "var(--theme-status-success-fg)",
        icon: CheckCircle2,
        borderColor: "var(--theme-status-success-bg)"
      };

    case "Issued":
      return {
        bg: "var(--neuron-status-accent-bg)",
        text: "var(--neuron-status-accent-fg)",
        icon: Ship,
        borderColor: "var(--neuron-status-accent-bg)"
      };

    case "Billed":
      return {
        bg: "var(--neuron-status-accent-bg)",
        text: "var(--neuron-status-accent-fg)",
        icon: FileText,
        borderColor: "var(--neuron-status-accent-bg)"
      };

    case "Paid":
      return {
        bg: "var(--theme-status-success-bg)",
        text: "var(--theme-status-success-fg)",
        icon: DollarSign,
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
