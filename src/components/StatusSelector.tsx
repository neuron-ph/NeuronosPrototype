"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { ExecutionStatus } from "../types/operations";
import { getBookingStatusStyles } from "../utils/bookingStatus";
import { cn } from "./ui/utils";

interface StatusSelectorProps {
  status: ExecutionStatus;
  onUpdateStatus?: (newStatus: ExecutionStatus) => void;
  readOnly?: boolean;
  className?: string;
  showIcon?: boolean;
}

// Valid transitions per status — only allowed next states are shown
const BOOKING_STATUS_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  "Draft":       ["Confirmed", "Cancelled"],
  "Pending":     ["Confirmed", "Cancelled"],
  "Confirmed":   ["In Progress", "On Hold", "Cancelled"],
  "In Progress": ["Delivered", "On Hold", "Cancelled"],
  "Delivered":   ["Completed", "Closed"],
  "Completed":   ["Closed"],
  "On Hold":     ["Confirmed", "Cancelled"],
  "Cancelled":   [],
  "Closed":      [],
};

export function StatusSelector({
  status,
  onUpdateStatus,
  readOnly = false,
  className,
  showIcon = true
}: StatusSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  const style = getBookingStatusStyles(status);
  const Icon = style.icon;

  const availableStatuses: ExecutionStatus[] = BOOKING_STATUS_TRANSITIONS[status] ?? [];
  const isTerminal = availableStatuses.length === 0;

  // Position the portal menu below the trigger
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left, minWidth: rect.width });
    }
  }, [isOpen]);

  // Reposition on scroll
  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const update = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setMenuPos({ top: rect.bottom + 4, left: rect.left, minWidth: rect.width });
      }
    };
    window.addEventListener("scroll", update, true);
    return () => window.removeEventListener("scroll", update, true);
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!buttonRef.current?.contains(t) && !menuRef.current?.contains(t)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [isOpen]);

  // Read-only badge (no dropdown)
  if (readOnly || isTerminal) {
    return (
      <button
        type="button"
        disabled
        className={cn(
          "inline-flex items-center px-4 py-2.5 rounded-full text-[13px] font-medium gap-2 transition-all duration-200 outline-none cursor-default opacity-100",
          className
        )}
        style={{
          backgroundColor: style.bg,
          color: style.text,
          border: style.borderColor ? `1px solid ${style.borderColor}` : undefined
        }}
      >
        {showIcon && Icon && <Icon size={16} />}
        {status}
      </button>
    );
  }

  // Interactive — trigger shows current status; dropdown shows valid next states
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className={cn(
          "inline-flex items-center px-4 py-2.5 rounded-full text-[13px] font-medium gap-2 transition-all duration-200 outline-none cursor-pointer",
          className
        )}
        style={{
          backgroundColor: style.bg,
          color: style.text,
          border: style.borderColor ? `1px solid ${style.borderColor}` : undefined
        }}
      >
        {showIcon && Icon && <Icon size={16} />}
        {status}
        <ChevronDown
          size={14}
          style={{
            transition: "transform 0.2s",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {isOpen && menuPos && createPortal(
        <div
          ref={menuRef}
          className="rounded-lg overflow-hidden"
          style={{
            position: "fixed",
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--neuron-ui-border)",
            boxShadow: "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)",
            maxHeight: "240px",
            overflowY: "auto",
            zIndex: 9999,
            top: menuPos.top,
            left: menuPos.left,
            minWidth: menuPos.minWidth,
            width: "max-content",
          }}
        >
          {availableStatuses.map((s, i) => {
            const sStyle = getBookingStatusStyles(s);
            const SIcon = sStyle.icon;
            return (
              <button
                key={s}
                type="button"
                onClick={() => { onUpdateStatus?.(s); setIsOpen(false); }}
                className="w-full px-4 py-2.5 text-left text-[13px] transition-colors flex items-center gap-2"
                style={{
                  backgroundColor: "var(--theme-bg-surface)",
                  color: "var(--theme-text-primary)",
                  borderBottom: i < availableStatuses.length - 1 ? "1px solid var(--theme-border-subtle)" : "none",
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--theme-state-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)"; }}
              >
                {SIcon && <SIcon size={16} />}
                {s}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
