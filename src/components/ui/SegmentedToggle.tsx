import React from "react";
import { motion } from "motion/react";

export interface SegmentedToggleOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedToggleProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedToggleOption<T>[];
  className?: string;
  layoutIdPrefix?: string;
}

export function SegmentedToggle<T extends string>({
  value,
  onChange,
  options,
  className,
  layoutIdPrefix = "toggle-pill"
}: SegmentedToggleProps<T>) {
  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        border: "1px solid var(--theme-border-default)",
        borderRadius: "10px",
        padding: "4px",
        backgroundColor: "var(--theme-bg-surface)",
        width: "fit-content"
      }}
    >
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            style={{
              position: "relative",
              padding: "6px 16px",
              fontSize: "13px",
              fontWeight: 500,
              color: isActive ? "white" : "var(--theme-text-secondary)",
              backgroundColor: "transparent",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              transition: "color 0.2s ease",
              zIndex: 1,
              outline: "none",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            {isActive && (
              <motion.div
                layoutId={layoutIdPrefix}
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: "var(--theme-action-primary-bg)",
                  borderRadius: "6px",
                  zIndex: -1
                }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
            <span style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: "8px" }}>
              {option.icon}
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
