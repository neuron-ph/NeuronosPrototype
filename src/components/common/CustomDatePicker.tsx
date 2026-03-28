import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";

interface CustomDatePickerProps {
  label?: string;
  value: string; // ISO date string (YYYY-MM-DD)
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minWidth?: string;
  className?: string;
}

export function CustomDatePicker({
  label,
  value,
  onChange,
  placeholder = "dd/mm/yyyy",
  disabled = false,
  minWidth = "140px",
  className = ""
}: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Initialize viewDate when value changes
  useEffect(() => {
    if (value) {
      setViewDate(new Date(value));
    }
  }, [value]);

  // Format display value
  const formatDisplayValue = (dateStr: string) => {
    if (!dateStr) return placeholder;
    const date = new Date(dateStr);
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

  // Handle date selection
  const handleDateSelect = (day: number) => {
    const selectedDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const isoString = selectedDate.toISOString().split('T')[0];
    onChange(isoString);
    setIsOpen(false);
  };

  // Navigate months
  const handlePreviousMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  // Handle Today button
  const handleToday = () => {
    const today = new Date();
    const isoString = today.toISOString().split('T')[0];
    onChange(isoString);
    setViewDate(today);
    setIsOpen(false);
  };

  // Handle Clear button
  const handleClear = () => {
    onChange("");
    setIsOpen(false);
  };

  // Handle year selection
  const handleYearChange = (year: number) => {
    setViewDate(new Date(year, viewDate.getMonth(), 1));
    setShowYearPicker(false);
  };

  // Generate year range (current year ± 50 years)
  const generateYearRange = () => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let i = currentYear - 50; i <= currentYear + 50; i++) {
      years.push(i);
    }
    return years;
  };

  // Check if a day is selected
  const isDateSelected = (day: number) => {
    if (!value) return false;
    const selectedDate = new Date(value);
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

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      {/* Input Trigger */}
      <button
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
        <Calendar size={16} style={{ color: "var(--neuron-ink-muted)", flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: "left" }}>
          {formatDisplayValue(value)}
        </span>
      </button>

      {/* Calendar Dropdown */}
      {isOpen && !disabled && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "4px",
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "8px",
            padding: "16px",
            zIndex: 1000,
            minWidth: "280px",
            boxShadow: "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)"
          }}
        >
          {/* Month/Year Header */}
          <div style={{
            display: "flex",
            gap: "12px",
            marginBottom: "16px"
          }}>
            {/* Month Dropdown */}
            <div style={{ position: "relative", flex: 1 }}>
              <button
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

              {/* Month Picker Dropdown */}
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
                  zIndex: 1001,
                  boxShadow: "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)"
                }}>
                  {monthNames.map((month, index) => (
                    <button
                      key={index}
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
            
            {/* Year Dropdown */}
            <div style={{ position: "relative", flex: 1 }}>
              <button
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

              {/* Year Picker Dropdown */}
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
                  zIndex: 1001,
                  boxShadow: "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)"
                }}>
                  {generateYearRange().map((year) => (
                    <button
                      key={year}
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

          {/* Day Names */}
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

          {/* Calendar Days */}
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

          {/* Action Buttons */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            paddingTop: "12px",
            borderTop: "1px solid var(--neuron-ui-border)"
          }}>
            <button
              onClick={handleClear}
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
              Clear
            </button>

            <button
              onClick={handleToday}
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 500,
                color: "white",
                backgroundColor: "var(--theme-action-primary-bg)",
                border: "none",
                cursor: "pointer",
                borderRadius: "4px"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#0d6660";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
              }}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
