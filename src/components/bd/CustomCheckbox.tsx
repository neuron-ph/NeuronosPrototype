import { Check } from "lucide-react";

interface CustomCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function CustomCheckbox({ checked, onChange, disabled = false }: CustomCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={{
        width: "18px",
        height: "18px",
        borderRadius: "4px",
        border: checked ? "none" : `1.5px solid var(--theme-border-default)`,
        backgroundColor: checked ? "var(--neuron-brand-green)" : "var(--theme-bg-surface)",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.15s ease",
        opacity: disabled ? 0.5 : 1,
        padding: 0
      }}
      onMouseEnter={(e) => {
        if (!disabled && !checked) {
          e.currentTarget.style.borderColor = "var(--neuron-brand-green)";
          e.currentTarget.style.backgroundColor = "var(--theme-state-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !checked) {
          e.currentTarget.style.borderColor = "var(--theme-border-default)";
          e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
        }
      }}
    >
      {checked && (
        <Check 
          size={12} 
          strokeWidth={3}
          style={{ 
            color: "white",
            display: "block"
          }} 
        />
      )}
    </button>
  );
}
