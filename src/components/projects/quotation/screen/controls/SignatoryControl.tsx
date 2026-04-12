import React from "react";
import type { Signatory } from "../useQuotationDocumentState";

interface SignatoryControlProps {
  preparedBy: Signatory;
  approvedBy: Signatory;
  onUpdate: (type: "prepared_by" | "approved_by", field: "name" | "title", value: string) => void;
}

const inputCls = "w-full px-3.5 py-2 text-sm border border-[var(--theme-border-default)] rounded-lg focus:border-[var(--theme-action-primary-bg)] focus:ring-1 focus:ring-[var(--theme-action-primary-bg)] outline-none transition-all placeholder:text-[var(--theme-text-muted)]";
const inputSubtleCls = `${inputCls} bg-[var(--theme-bg-surface-subtle)]`;

export function SignatoryControl({ preparedBy, approvedBy, onUpdate }: SignatoryControlProps) {
  return (
    <div className="space-y-5">
      {/* Prepared By */}
      <div className="space-y-2.5">
        <label htmlFor="sig-prepared-name" className="text-xs font-semibold text-[var(--theme-text-primary)] uppercase tracking-wider">
          Prepared By
        </label>
        <div className="space-y-2">
          <input
            id="sig-prepared-name"
            type="text"
            value={preparedBy.name}
            onChange={(e) => onUpdate("prepared_by", "name", e.target.value)}
            className={inputCls}
            placeholder="Name"
            aria-label="Prepared by name"
          />
          <input
            id="sig-prepared-title"
            type="text"
            value={preparedBy.title}
            onChange={(e) => onUpdate("prepared_by", "title", e.target.value)}
            className={inputSubtleCls}
            placeholder="Job Title"
            aria-label="Prepared by job title"
          />
        </div>
      </div>

      {/* Approved By */}
      <div className="space-y-2.5">
        <label htmlFor="sig-approved-name" className="text-xs font-semibold text-[var(--theme-text-primary)] uppercase tracking-wider">
          Approved By
        </label>
        <div className="space-y-2">
          <input
            id="sig-approved-name"
            type="text"
            value={approvedBy.name}
            onChange={(e) => onUpdate("approved_by", "name", e.target.value)}
            className={inputCls}
            placeholder="Name (Optional)"
            aria-label="Approved by name"
          />
          <input
            id="sig-approved-title"
            type="text"
            value={approvedBy.title}
            onChange={(e) => onUpdate("approved_by", "title", e.target.value)}
            className={inputSubtleCls}
            placeholder="Job Title"
            aria-label="Approved by job title"
          />
        </div>
      </div>
    </div>
  );
}
