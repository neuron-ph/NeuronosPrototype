import React from "react";
import { Check } from "lucide-react";
import type { QuotationPrintOptions } from "../useQuotationDocumentState";

interface DisplayOptionsControlProps {
  options: QuotationPrintOptions["display"];
  onToggle: (key: keyof QuotationPrintOptions["display"]) => void;
}

export function DisplayOptionsControl({ options, onToggle }: DisplayOptionsControlProps) {
  const ToggleItem = ({ label, checked, onClick }: { label: string, checked: boolean, onClick: () => void }) => (
    <button
      role="checkbox"
      aria-checked={checked}
      onClick={onClick}
      className="group flex items-center justify-between w-full p-3 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-subtle)] rounded-lg hover:border-[var(--theme-action-primary-bg)]/30 hover:shadow-sm transition-all text-left"
    >
      <span className={`text-sm ${checked ? "text-[var(--theme-text-primary)] font-medium" : "text-[var(--theme-text-muted)]"}`}>{label}</span>

      <div className={`w-5 h-5 rounded flex items-center justify-center transition-all ${checked ? "bg-[var(--theme-action-primary-bg)] border-[var(--theme-action-primary-bg)]" : "bg-[var(--theme-bg-surface)] border-[var(--theme-border-default)] group-hover:border-[var(--theme-action-primary-bg)]"}`} style={{ borderWidth: '1.5px' }}>
         {checked && <Check size={14} className="text-white stroke-[3]" />}
      </div>
    </button>
  );

  return (
    <div className="space-y-2" role="group" aria-label="Display options">
      <ToggleItem
          label="Show Bank Details"
          checked={options.show_bank_details}
          onClick={() => onToggle("show_bank_details")}
      />
      <ToggleItem
          label="Show Tax Breakdown"
          checked={options.show_tax_summary}
          onClick={() => onToggle("show_tax_summary")}
      />
    </div>
  );
}
