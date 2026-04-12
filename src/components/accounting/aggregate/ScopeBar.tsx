/**
 * ScopeBar — Compact date scope selector for aggregate financial views.
 *
 * Layout: [Preset Dropdown] [📅 From] to [📅 To]
 *
 * The date pickers ALWAYS show the resolved date range — even for presets
 * like "This Quarter". Manually changing a date auto-switches to "Custom".
 *
 * Supports two modes:
 *   - `embedded` (default): borderless, transparent — designed to sit inside the unified toolbar
 *   - `standalone`: has its own border — used on Dashboard tab
 */

import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown, Check } from "lucide-react";
import { CustomDatePicker } from "../../common/CustomDatePicker";
import type { DateScope, ScopePreset } from "./types";
import { createDateScope } from "./types";

interface ScopeBarProps {
  scope: DateScope;
  onScopeChange: (scope: DateScope) => void;
  /** When true, renders with its own border (for standalone use outside toolbar) */
  standalone?: boolean;
}

const PRESETS: { value: ScopePreset; label: string; shortLabel: string }[] = [
  { value: "this-week", label: "This Week", shortLabel: "This Week" },
  { value: "this-month", label: "This Month", shortLabel: "This Month" },
  { value: "this-quarter", label: "This Quarter", shortLabel: "This Quarter" },
  { value: "ytd", label: "Year to Date", shortLabel: "YTD" },
  { value: "all", label: "All Time", shortLabel: "All Time" },
];

const getPresetLabel = (preset: ScopePreset): string => {
  if (preset === "custom") return "Custom";
  return PRESETS.find((p) => p.value === preset)?.shortLabel || preset;
};

const toInputValue = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export function ScopeBar({ scope, onScopeChange, standalone }: ScopeBarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handlePresetClick = (preset: ScopePreset) => {
    onScopeChange(createDateScope(preset));
    setOpen(false);
  };

  // When user picks a date from CustomDatePicker → auto-switch to "custom"
  const handleDatePickerChange = (field: "from" | "to", isoStr: string) => {
    if (!isoStr) return; // cleared — ignore
    const date = new Date(isoStr + "T00:00:00");
    if (isNaN(date.getTime())) return;
    onScopeChange({
      preset: "custom",
      from: field === "from" ? date : scope.from,
      to: field === "to" ? date : scope.to,
    });
  };

  // Resolve display values — always show the scope's from/to, even for "all"
  const displayFrom = scope.preset === "all" ? "" : toInputValue(scope.from);
  const displayTo = scope.preset === "all" ? "" : toInputValue(scope.to);

  return (
    <div className="flex items-center gap-2" ref={ref}>
      {/* Preset dropdown */}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors hover:bg-[var(--theme-bg-surface-subtle)]"
          style={{
            border: standalone ? "1px solid var(--theme-border-default)" : "none",
            color: "var(--theme-text-primary)",
            backgroundColor: open ? "var(--theme-status-success-bg)" : standalone ? "var(--theme-bg-surface)" : "transparent",
          }}
        >
          <Calendar size={14} style={{ color: open ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)" }} />
          <span>{getPresetLabel(scope.preset)}</span>
          <ChevronDown
            size={12}
            style={{ color: "var(--theme-text-muted)" }}
            className={`ml-0.5 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {/* Dropdown popover */}
        {open && (
          <div
            className="absolute top-full left-0 mt-1.5 z-50 rounded-lg shadow-lg py-1 min-w-[220px]"
            style={{
              border: "1px solid var(--neuron-ui-border)",
              backgroundColor: "var(--theme-bg-surface)",
            }}
          >
            {PRESETS.map((p) => {
              const isActive = scope.preset === p.value;
              return (
                <button
                  key={p.value}
                  onClick={() => handlePresetClick(p.value)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors hover:bg-[var(--theme-bg-surface-subtle)]"
                  style={{
                    color: isActive ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-primary)",
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {isActive ? (
                    <Check size={12} style={{ color: "var(--theme-action-primary-bg)" }} />
                  ) : (
                    <span className="w-3" />
                  )}
                  {p.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Date range pickers — always visible, always reflect scope.from / scope.to */}
      {scope.preset !== "all" && (
        <>
          <div style={{ minWidth: "130px" }}>
            <CustomDatePicker
              value={displayFrom}
              onChange={(val) => handleDatePickerChange("from", val)}
              placeholder="Start Date"
              minWidth="100%"
              className="w-full px-3 py-2 text-[13px]"
            />
          </div>
          <span className="text-[12px] font-medium" style={{ color: "var(--theme-text-muted)" }}>
            to
          </span>
          <div style={{ minWidth: "130px" }}>
            <CustomDatePicker
              value={displayTo}
              onChange={(val) => handleDatePickerChange("to", val)}
              placeholder="End Date"
              minWidth="100%"
              className="w-full px-3 py-2 text-[13px]"
            />
          </div>
        </>
      )}
    </div>
  );
}