import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronDown } from "lucide-react";

interface CustomDatePickerProps {
  label?: string;
  value: string; // ISO date string (YYYY-MM-DD)
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minWidth?: string;
  className?: string;
  portalZIndex?: number;
}

export function CustomDatePicker({
  label,
  value,
  onChange,
  placeholder = "dd/mm/yyyy",
  disabled = false,
  minWidth = "140px",
  className = "",
  portalZIndex = 9999,
}: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const [pendingDate, setPendingDate] = useState<string>(""); // YYYY-MM-DD, staged until Confirm
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentYearButtonRef = useRef<HTMLButtonElement>(null);

  // Sync the staged pendingDate with the committed value whenever the calendar opens.
  useEffect(() => {
    if (isOpen) setPendingDate(value ?? "");
  }, [isOpen, value]);

  // When the year picker opens, scroll the current view year into view so it's
  // immediately visible (default browser behavior shows the top of the list).
  useEffect(() => {
    if (showYearPicker) {
      // Defer until after the dropdown has mounted.
      requestAnimationFrame(() => {
        currentYearButtonRef.current?.scrollIntoView({ block: "center" });
      });
    }
  }, [showYearPicker]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [calendarPosition, setCalendarPosition] = useState<{
    top: number;
    left: number;
    openUpward: boolean;
  } | null>(null);

  const closeCalendar = useCallback(() => {
    setIsOpen(false);
    setShowMonthPicker(false);
    setShowYearPicker(false);
  }, []);

  const positionCalendar = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const gap = 4;
    const estimatedHeight = calendarRef.current?.offsetHeight ?? 360;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openUpward = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    const top = openUpward
      ? Math.max(gap, rect.top - estimatedHeight - gap)
      : rect.bottom + gap;

    setCalendarPosition({
      top,
      left: rect.left,
      openUpward,
    });
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current?.contains(target) ||
        calendarRef.current?.contains(target)
      ) {
        return;
      }
      closeCalendar();
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, closeCalendar]);

  // Initialize viewDate when value changes
  useEffect(() => {
    if (value) {
      setViewDate(parseLocalDate(value));
    }
  }, [value]);

  // Parse an ISO date string (YYYY-MM-DD) as a local date (no timezone shift).
  // Tolerates full timestamps from Postgres (e.g. "2027-04-29 00:00:00+00" or
  // "2027-04-29T00:00:00.000Z") by taking only the date portion before
  // any "T" or whitespace.
  const parseLocalDate = (dateStr: string): Date => {
    const datePart = dateStr.split(/[T\s]/)[0];
    const [y, m, d] = datePart.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  // Format display value
  const formatDisplayValue = (dateStr: string) => {
    if (!dateStr) return placeholder;
    const date = parseLocalDate(dateStr);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  };

  // Get days in month
  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  // Get first day of month (0 = Sunday, 1 = Monday, etc.)
  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  // Generate calendar grid
  const generateCalendarDays = () => {
    const daysInMonth = getDaysInMonth(viewDate);
    const firstDay = getFirstDayOfMonth(viewDate);
    const days: (number | null)[] = [];

    // Add empty slots for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    return days;
  };

  // Handle date selection — stages the date as pending; commit happens on Confirm.
  const handleDateSelect = (day: number) => {
    const y = viewDate.getFullYear();
    const m = String(viewDate.getMonth() + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    setPendingDate(`${y}-${m}-${d}`);
  };

  // Navigate months
  const handlePreviousMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  // Handle Today button — stages today's date and jumps the view to today; does not commit.
  const handleToday = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    setPendingDate(`${y}-${m}-${d}`);
    setViewDate(today);
  };

  // Handle Confirm button — commits the currently staged pendingDate.
  const handleConfirm = () => {
    onChange(pendingDate);
    closeCalendar();
  };

  // Handle year selection
  const handleYearChange = (year: number) => {
    setViewDate(new Date(year, viewDate.getMonth(), 1));
    setShowYearPicker(false);
  };

  // Generate year range (current year ± 10 years)
  const generateYearRange = () => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let i = currentYear - 10; i <= currentYear + 10; i++) {
      years.push(i);
    }
    return years;
  };

  // Check if a day is selected — reflects the staged pendingDate while the calendar is open.
  const isDateSelected = (day: number) => {
    const source = pendingDate || value;
    if (!source) return false;
    const selectedDate = parseLocalDate(source);
    return (
      selectedDate.getDate() === day &&
      selectedDate.getMonth() === viewDate.getMonth() &&
      selectedDate.getFullYear() === viewDate.getFullYear()
    );
  };

  // Check if a day is today
  const isToday = (day: number) => {
    const today = new Date();
    return (
      today.getDate() === day &&
      today.getMonth() === viewDate.getMonth() &&
      today.getFullYear() === viewDate.getFullYear()
    );
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  useEffect(() => {
    if (!isOpen) return;
    positionCalendar();
    const rafId = window.requestAnimationFrame(positionCalendar);
    return () => window.cancelAnimationFrame(rafId);
  }, [isOpen, showMonthPicker, showYearPicker, value, viewDate, positionCalendar]);

  useEffect(() => {
    if (!isOpen) return;
    const handleReposition = () => positionCalendar();
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [isOpen, positionCalendar]);

  const calendarDropdown = isOpen && !disabled && calendarPosition
    ? createPortal(
        <div
          ref={calendarRef}
          style={{
            position: "fixed",
            top: calendarPosition.top,
            left: calendarPosition.left,
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "8px",
            padding: "16px",
            zIndex: portalZIndex,
            minWidth: "280px",
            boxShadow: "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)"
          }}
        >
          <div style={{
            display: "flex",
            gap: "12px",
            marginBottom: "16px"
          }}>
            <div style={{ position: "relative", flex: 1 }}>
              <button
                type="button"
                onClick={() => {
                  setShowMonthPicker(!showMonthPicker);
                  setShowYearPicker(false);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  backgroundColor: "var(--theme-bg-page)",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-primary)"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                }}
              >
                {monthNames[viewDate.getMonth()]}
                <ChevronDown size={14} style={{
                  transition: "transform 0.2s",
                  transform: showMonthPicker ? "rotate(180deg)" : "rotate(0deg)",
                  color: "var(--neuron-ink-muted)"
                }} />
              </button>

              {showMonthPicker && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  marginTop: "4px",
                  backgroundColor: "var(--theme-bg-surface)",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "6px",
                  maxHeight: "200px",
                  overflowY: "auto",
                  zIndex: portalZIndex + 1,
                  boxShadow: "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)"
                }}>
                  {monthNames.map((month, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        setViewDate(new Date(viewDate.getFullYear(), index, 1));
                        setShowMonthPicker(false);
                      }}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        textAlign: "left",
                        border: "none",
                        backgroundColor: index === viewDate.getMonth() ? "var(--theme-state-selected)" : "var(--theme-bg-surface)",
                        color: index === viewDate.getMonth() ? "var(--theme-action-primary-bg)" : "var(--theme-text-primary)",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: index === viewDate.getMonth() ? 600 : 400
                      }}
                      onMouseEnter={(e) => {
                        if (index !== viewDate.getMonth()) {
                          e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = index === viewDate.getMonth() ? "var(--theme-state-selected)" : "var(--theme-bg-surface)";
                      }}
                    >
                      {month}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ position: "relative", flex: 1 }}>
              <button
                type="button"
                onClick={() => {
                  setShowYearPicker(!showYearPicker);
                  setShowMonthPicker(false);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  backgroundColor: "var(--theme-bg-page)",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-primary)"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                }}
              >
                {viewDate.getFullYear()}
                <ChevronDown size={14} style={{
                  transition: "transform 0.2s",
                  transform: showYearPicker ? "rotate(180deg)" : "rotate(0deg)",
                  color: "var(--neuron-ink-muted)"
                }} />
              </button>

              {showYearPicker && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  marginTop: "4px",
                  backgroundColor: "var(--theme-bg-surface)",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "6px",
                  maxHeight: "200px",
                  overflowY: "auto",
                  zIndex: portalZIndex + 1,
                  boxShadow: "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)"
                }}>
                  {generateYearRange().map((year) => (
                    <button
                      key={year}
                      ref={year === viewDate.getFullYear() ? currentYearButtonRef : undefined}
                      type="button"
                      onClick={() => handleYearChange(year)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        textAlign: "left",
                        border: "none",
                        backgroundColor: year === viewDate.getFullYear() ? "var(--theme-state-selected)" : "var(--theme-bg-surface)",
                        color: year === viewDate.getFullYear() ? "var(--theme-action-primary-bg)" : "var(--theme-text-primary)",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: year === viewDate.getFullYear() ? 600 : 400
                      }}
                      onMouseEnter={(e) => {
                        if (year !== viewDate.getFullYear()) {
                          e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = year === viewDate.getFullYear() ? "var(--theme-state-selected)" : "var(--theme-bg-surface)";
                      }}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "4px",
            marginBottom: "8px"
          }}>
            {dayNames.map((day) => (
              <div
                key={day}
                style={{
                  textAlign: "center",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--neuron-ink-muted)",
                  padding: "4px"
                }}
              >
                {day}
              </div>
            ))}
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "4px",
            marginBottom: "12px"
          }}>
            {generateCalendarDays().map((day, index) => {
              if (day === null) {
                return <div key={`empty-${index}`} />;
              }

              const selected = isDateSelected(day);
              const today = isToday(day);

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleDateSelect(day)}
                  style={{
                    padding: "8px",
                    fontSize: "13px",
                    fontWeight: selected ? 600 : 400,
                    color: selected ? "white" : today ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-primary)",
                    backgroundColor: selected ? "var(--theme-action-primary-bg)" : "transparent",
                    border: today && !selected ? "1px solid var(--theme-action-primary-bg)" : "1px solid transparent",
                    borderRadius: "6px",
                    cursor: "pointer",
                    transition: "background-color 0.2s"
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) {
                      e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div style={{
            display: "flex",
            justifyContent: "space-between",
            paddingTop: "12px",
            borderTop: "1px solid var(--neuron-ui-border)"
          }}>
            <button
              type="button"
              onClick={handleToday}
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--neuron-ink-muted)",
                backgroundColor: "transparent",
                border: "none",
                cursor: "pointer",
                borderRadius: "4px"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                e.currentTarget.style.color = "var(--neuron-ink-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--neuron-ink-muted)";
              }}
            >
              Today
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!pendingDate}
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 500,
                color: "white",
                backgroundColor: "var(--theme-action-primary-bg)",
                border: "none",
                cursor: pendingDate ? "pointer" : "not-allowed",
                borderRadius: "4px",
                opacity: pendingDate ? 1 : 0.5
              }}
              onMouseEnter={(e) => {
                if (pendingDate) e.currentTarget.style.backgroundColor = "#0d6660";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
              }}
            >
              Confirm
            </button>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Input Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          // Updated to match CustomDropdown styling (px-4 py-2.5 equivalent)
          padding: className ? undefined : "10px 16px", 
          fontSize: "13px",
          border: "1px solid var(--neuron-ui-border)",
          borderRadius: "8px", // Updated to rounded-lg equivalent (8px)
          backgroundColor: disabled ? "var(--theme-bg-surface-subtle)" : "var(--theme-bg-surface)",
          color: value ? "var(--neuron-ink-primary)" : "var(--neuron-ink-muted)",
          cursor: disabled ? "not-allowed" : "pointer",
          outline: "none",
          minWidth: minWidth,
          opacity: disabled ? 0.6 : 1,
          transition: "border-color 0.2s"
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled) {
            e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
          }
        }}
      >
        <Calendar size={16} style={{ color: "currentColor", flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: "left" }}>
          {formatDisplayValue(value)}
        </span>
      </button>
      {calendarDropdown}
    </div>
  );
}
