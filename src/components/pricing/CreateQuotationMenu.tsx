import { useState, useRef, useEffect } from "react";
import { Plus, ChevronDown } from "lucide-react";
import { ProjectIcon, ContractIcon } from "./QuotationTypeIcons";
import type { QuotationType } from "../../types/pricing";

// ─── Menu Options ──────────────────────────────────────────────────────

const MENU_OPTIONS: { type: QuotationType; labelSuffix: string; description: string; Icon: React.FC }[] = [
  {
    type: "project",
    labelSuffix: "Project",
    description: "One-time pricing for a specific shipment",
    Icon: () => <ProjectIcon size={20} />,
  },
  {
    type: "contract",
    labelSuffix: "Contract",
    description: "Annual rate table for recurring clients",
    Icon: () => <ContractIcon size={20} />,
  },
];

interface CreateQuotationMenuProps {
  onSelect: (quotationType: QuotationType) => void;
  /** Label for the trigger button — e.g. "Create Inquiry" or "Create Quotation" */
  buttonText: string;
  /** Entity word used in the dropdown items — e.g. "Inquiry" or "Quotation" */
  entityWord?: string;
  /** Optional: override the button styling variant */
  variant?: "primary-green" | "primary-outline";
}

export function CreateQuotationMenu({ onSelect, buttonText, entityWord = "Quotation" }: CreateQuotationMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 20px",
          backgroundColor: "var(--neuron-brand-green)",
          border: "none",
          borderRadius: "8px",
          fontSize: "14px",
          fontWeight: 600,
          color: "white",
          cursor: "pointer",
          transition: "background-color 0.2s ease",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#0F544A";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "var(--neuron-brand-green)";
        }}
      >
        <Plus size={18} />
        {buttonText}
        <ChevronDown
          size={16}
          style={{
            marginLeft: "2px",
            transition: "transform 0.2s ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* Dropdown Menu — Figma-matched */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: "340px",
            backgroundColor: "var(--theme-bg-surface)",
            border: "0.8px solid var(--theme-border)",
            borderRadius: "10px",
            boxShadow:
              "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)",
            zIndex: 1000,
            overflow: "hidden",
          }}
        >
          {MENU_OPTIONS.map(({ type, labelSuffix, description, Icon }, idx) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setOpen(false);
                onSelect(type);
              }}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                width: "100%",
                padding: "14px 16px",
                backgroundColor: "var(--theme-bg-surface)",
                border: "none",
                borderBottom:
                  idx < MENU_OPTIONS.length - 1
                    ? "0.8px solid var(--neuron-pill-inactive-bg)"
                    : "none",
                cursor: "pointer",
                transition: "background-color 0.15s ease",
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
              }}
            >
              {/* Icon */}
              <div style={{ marginTop: "1px" }}>
                <Icon />
              </div>

              {/* Text */}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--theme-text-primary)",
                    lineHeight: "19.5px",
                    marginBottom: "2px",
                  }}
                >
                  {labelSuffix} {entityWord}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#969EAF",
                    lineHeight: "15.6px",
                  }}
                >
                  {description}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}