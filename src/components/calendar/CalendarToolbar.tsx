import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react@0.487.0";
import { Calendar } from "../ui/calendar";
import type { CalendarViewType } from "../../types/calendar";

interface CalendarToolbarProps {
  title: string;
  currentView: CalendarViewType;
  currentDate: Date;
  onViewChange: (view: CalendarViewType) => void;
  onNavigate: (direction: "prev" | "next" | "today") => void;
  onDateSelect: (date: Date) => void;
  /** Omitted when the user lacks calendar:create — the button is hidden (WG-07). */
  onNewEvent?: () => void;
}

const views: { value: CalendarViewType; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

export function CalendarToolbar({
  title,
  currentView,
  currentDate,
  onViewChange,
  onNavigate,
  onDateSelect,
  onNewEvent,
}: CalendarToolbarProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click
  useEffect(() => {
    if (!showDatePicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDatePicker]);

  return (
    <div
      className="flex items-center justify-between px-6 py-2.5"
      style={{
        borderBottom: "1px solid var(--neuron-ui-border)",
        backgroundColor: "var(--neuron-bg-elevated)",
      }}
    >
      {/* Left: Today + Navigation + Date title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onNavigate("today")}
          className="px-3 py-1.5 text-[13px] font-medium rounded-[var(--neuron-radius-s)] transition-colors duration-150"
          style={{
            border: "1px solid var(--neuron-ui-border)",
            color: "var(--neuron-ink-primary)",
            backgroundColor: "var(--neuron-bg-elevated)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "var(--neuron-bg-elevated)")
          }
        >
          Today
        </button>

        <div className="flex items-center gap-0.5">
          <NavButton direction="prev" onClick={() => onNavigate("prev")} />
          <NavButton direction="next" onClick={() => onNavigate("next")} />
        </div>

        {/* Date title with calendar popover */}
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setShowDatePicker((v) => !v)}
            className="text-[17px] font-semibold select-none cursor-pointer transition-colors duration-100"
            style={{
              color: "var(--neuron-ink-primary)",
              letterSpacing: "-0.01em",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--neuron-action-primary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--neuron-ink-primary)")
            }
          >
            {title}
          </button>

          {showDatePicker && (
            <div
              className="absolute top-full left-0 mt-1.5 z-50 rounded-[var(--neuron-radius-m)] p-2"
              style={{
                backgroundColor: "var(--neuron-bg-elevated)",
                border: "1px solid var(--neuron-ui-border)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
              }}
            >
              <Calendar
                mode="single"
                selected={currentDate}
                onSelect={(date) => {
                  if (date) {
                    onDateSelect(date);
                    setShowDatePicker(false);
                  }
                }}
                className="w-full"
              />
            </div>
          )}
        </div>
      </div>

      {/* Right: View switcher + New Event */}
      <div className="flex items-center gap-3">
        {/* Segmented View Switcher */}
        <div
          className="flex rounded-[var(--neuron-radius-s)] p-0.5"
          style={{
            backgroundColor: "var(--theme-bg-surface-subtle)",
            border: "1px solid var(--neuron-ui-border)",
          }}
        >
          {views.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => onViewChange(v.value)}
              className="px-3 py-1 text-[13px] font-medium rounded transition-all duration-150"
              style={{
                backgroundColor:
                  currentView === v.value
                    ? "var(--neuron-bg-elevated)"
                    : "transparent",
                color:
                  currentView === v.value
                    ? "var(--neuron-ink-primary)"
                    : "var(--neuron-ink-muted)",
                boxShadow:
                  currentView === v.value
                    ? "0 1px 2px rgba(0,0,0,0.05)"
                    : "none",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* New Event Button */}
        {onNewEvent && (
        <button
          type="button"
          onClick={onNewEvent}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-medium rounded-[var(--neuron-radius-s)] transition-colors duration-150"
          style={{
            backgroundColor: "var(--neuron-action-primary)",
            color: "var(--neuron-action-primary-text)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor =
              "var(--neuron-action-primary-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor =
              "var(--neuron-action-primary)")
          }
        >
          <Plus size={14} strokeWidth={2.5} />
          New Event
        </button>
        )}
      </div>
    </div>
  );
}

function NavButton({
  direction,
  onClick,
}: {
  direction: "prev" | "next";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-1 rounded-[var(--neuron-radius-s)] transition-colors duration-150"
      style={{ color: "var(--neuron-ink-muted)" }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.backgroundColor = "transparent")
      }
      aria-label={direction === "prev" ? "Previous" : "Next"}
    >
      {direction === "prev" ? (
        <ChevronLeft size={18} />
      ) : (
        <ChevronRight size={18} />
      )}
    </button>
  );
}
