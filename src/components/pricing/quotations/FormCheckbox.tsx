import { Check } from "lucide-react";
import { useState } from "react";

interface FormCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function FormCheckbox({ checked, onChange, label, disabled = false }: FormCheckboxProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  // Compute styles based on state
  let borderColor = "var(--neuron-ui-border)";
  let backgroundColor = "var(--theme-bg-surface)";
  let cursor = disabled ? "default" : "pointer";
  let opacity = disabled ? 0.6 : 1;
  
  if (checked) {
    borderColor = disabled ? "var(--theme-text-muted)" : "var(--theme-action-primary-bg)";
    backgroundColor = disabled ? "var(--theme-text-muted)" : "var(--theme-action-primary-bg)";
  } else if (isHovered && !disabled) {
    borderColor = "var(--theme-action-primary-bg)";
    backgroundColor = "var(--theme-bg-surface-tint)";
  }
  
  return (
    <label 
      style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: "8px", 
        cursor: cursor,
        userSelect: "none",
        opacity: opacity
      }}
    >
      <div
        onClick={() => !disabled && onChange(!checked)}
        onMouseEnter={() => !disabled && setIsHovered(true)}
        onMouseLeave={() => !disabled && setIsHovered(false)}
        style={{
          width: "18px",
          height: "18px",
          borderRadius: "4px",
          border: `2px solid ${borderColor}`,
          backgroundColor: backgroundColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s ease",
          flexShrink: 0
        }}
      >
        {checked && (
          <Check 
            size={12} 
            style={{ 
              color: "white",
              strokeWidth: 3
            }} 
          />
        )}
      </div>
      <span style={{ 
        fontSize: "13px",
        color: "var(--neuron-ink-base)",
        fontWeight: 500
      }}>
        {label}
      </span>
    </label>
  );
}