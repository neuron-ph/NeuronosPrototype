"use client";

import { CustomDropdown } from "./bd/CustomDropdown";
import { ExecutionStatus } from "../types/operations";
import { getStatusOptions } from "../config/booking/bookingFieldOptions";
import { useServiceStatusOptions } from "../hooks/useEnumOptions";
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

// A BOOKING_STATUS_TRANSITIONS lifecycle map used to live here, alongside a
// reversible-status table. Both were unreachable: every caller passes a
// serviceType, and the service branch below returns before the map is ever
// consulted. They were removed rather than left in place, because code that
// reads like a transition guard but never runs is worse than none — bookings
// have no allowed-transition rules, and that should be obvious from the source.

export function getAvailableBookingStatuses(
  status: ExecutionStatus,
  serviceType?: string,
  /** DB-backed list from `useServiceStatusOptions`; falls back to the static one. */
  serviceStatusOptions?: string[],
): ExecutionStatus[] {
  const serviceStatuses = serviceStatusOptions?.length
    ? serviceStatusOptions
    : serviceType
      ? getStatusOptions(serviceType)
      : [];

  if (serviceStatuses.length > 0) {
    return Array.from(new Set(serviceStatuses as ExecutionStatus[]));
  }

  // No service type and no DB list — the current status is the only safe option.
  return [status];
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

  // Read the same DB-backed list the booking form uses (profile_service_statuses,
  // editable via Profiling) so an admin-added status appears here too. The hook
  // falls back to the static seed before the query resolves.
  const dbStatusOptions = useServiceStatusOptions(serviceType ?? "");
  const availableStatuses = getAvailableBookingStatuses(status, serviceType, dbStatusOptions);

  // The flat service list already includes the current status; only prepend it
  // when the fallback transition list doesn't contain it (no service type).
  const optionStatuses = availableStatuses.includes(status)
    ? availableStatuses
    : [status, ...availableStatuses];
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
