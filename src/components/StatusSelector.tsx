"use client";

import { CustomDropdown } from "./bd/CustomDropdown";
import { ExecutionStatus } from "../types/operations";
import { getStatusOptions } from "../config/booking/bookingFieldOptions";
import { getBookingStatusStyles } from "../utils/bookingStatus";
import { cn } from "./ui/utils";

interface StatusSelectorProps {
  status: ExecutionStatus;
  onUpdateStatus?: (newStatus: ExecutionStatus) => void;
  readOnly?: boolean;
  className?: string;
  showIcon?: boolean;
  serviceType?: string;
}

const BOOKING_STATUS_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  Created: ["Draft", "Ongoing", "Cancelled"],
  Draft: ["Confirmed", "Ongoing", "Cancelled"],
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["In Progress", "Ongoing", "On Hold", "Cancelled"],
  "In Progress": ["Delivered", "On Hold", "Cancelled"],
  Delivered: ["Completed", "Billed", "Closed"],
  Completed: ["Billed", "Closed"],
  "On Hold": ["Confirmed", "Cancelled"],
  Cancelled: [],
  Closed: [],
  "Waiting for Arrival": ["Ongoing", "Cancelled"],
  Ongoing: ["Delivered", "In Transit", "Issued", "Completed", "Billed", "Cancelled"],
  "In Transit": ["Delivered", "Completed", "Cancelled"],
  Audited: ["Billed", "Closed"],
  "Empty Return": ["Liquidated", "Billed", "Cancelled"],
  Liquidated: ["Billed"],
  Issued: ["Billed", "Cancelled"],
  Billed: ["Paid", "Cancelled"],
  Paid: ["Audited", "Closed"],
};

const REVERSIBLE_BOOKING_STATUSES = new Set<ExecutionStatus>(["Completed", "Cancelled"]);
const DEFAULT_REVERSIBLE_STATUS_OPTIONS: Partial<Record<ExecutionStatus, ExecutionStatus[]>> = {
  Completed: ["Ongoing", "Delivered", "Billed", "Closed"],
  Cancelled: ["Draft", "Ongoing", "Delivered", "Completed", "Billed", "Paid"],
};

export function getAvailableBookingStatuses(status: ExecutionStatus, serviceType?: string): ExecutionStatus[] {
  const serviceStatuses = serviceType ? getStatusOptions(serviceType) : [];
  const reversibleStatuses = serviceStatuses.length > 0
    ? serviceStatuses
    : DEFAULT_REVERSIBLE_STATUS_OPTIONS[status] ?? [];
  const nextStatuses = (
    REVERSIBLE_BOOKING_STATUSES.has(status) && reversibleStatuses.length > 0
      ? reversibleStatuses
      : status === "Created" && serviceStatuses.length > 0
        ? serviceStatuses
        : BOOKING_STATUS_TRANSITIONS[status] ?? []
  ).filter((s): s is ExecutionStatus => s !== status);

  return Array.from(new Set(nextStatuses));
}

export function StatusSelector({
  status,
  onUpdateStatus,
  readOnly = false,
  className,
  showIcon = true,
  serviceType,
}: StatusSelectorProps) {
  const style = getBookingStatusStyles(status);
  const Icon = style.icon;

  const availableStatuses = getAvailableBookingStatuses(status, serviceType);

  const optionStatuses = [status, ...availableStatuses];
  const options = optionStatuses.map((optionStatus) => {
    const optionStyle = getBookingStatusStyles(optionStatus);
    const OptionIcon = optionStyle.icon;

    return {
      value: optionStatus,
      label: optionStatus,
      icon: showIcon && OptionIcon ? <OptionIcon size={16} /> : undefined,
      color: optionStyle.text,
      backgroundColor: optionStyle.bg,
      selectedColor: optionStyle.text,
      selectedBackgroundColor: optionStyle.bg,
    };
  });

  const buttonClassName = cn("rounded-full font-medium min-w-[140px]", className);
  const buttonStyle = {
    backgroundColor: "var(--theme-bg-surface)",
    color: style.text,
    border: "1px solid var(--theme-border-default)",
  };

  if (readOnly || availableStatuses.length === 0) {
    return (
      <button
        type="button"
        disabled
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2.5 text-[13px] outline-none cursor-default opacity-100",
          buttonClassName
        )}
        style={buttonStyle}
      >
        {showIcon && Icon && <Icon size={16} />}
        {status}
      </button>
    );
  }

  return (
    <CustomDropdown
      value={status}
      onChange={(value) => onUpdateStatus?.(value as ExecutionStatus)}
      options={options}
      size="md"
      buttonClassName={buttonClassName}
      buttonStyle={buttonStyle}
    />
  );
}
