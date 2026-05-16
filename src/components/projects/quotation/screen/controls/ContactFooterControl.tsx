import { Plus, X } from "lucide-react";
import type { ContactFooter } from "../useQuotationDocumentState";

interface ContactFooterControlProps {
  contactFooter: ContactFooter;
  onUpdateField: (field: "email" | "office_address", value: string) => void;
  onUpdateCallNumber: (index: number, value: string) => void;
  onAddCallNumber: () => void;
  onRemoveCallNumber: (index: number) => void;
  onSaveAsDefault?: () => void;
  isSavingDefault?: boolean;
}

const inputCls = "w-full px-3.5 py-2 text-sm border border-[var(--theme-border-default)] rounded-lg focus:border-[var(--theme-action-primary-bg)] focus:ring-1 focus:ring-[var(--theme-action-primary-bg)] outline-none transition-all placeholder:text-[var(--theme-text-muted)]";
const inputSubtleCls = `${inputCls} bg-[var(--theme-bg-surface-subtle)]`;

export function ContactFooterControl({
  contactFooter,
  onUpdateField,
  onUpdateCallNumber,
  onAddCallNumber,
  onRemoveCallNumber,
  onSaveAsDefault,
  isSavingDefault,
}: ContactFooterControlProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-[var(--theme-text-secondary)] uppercase tracking-wider">Call</label>
          <button
            type="button"
            onClick={onAddCallNumber}
            className="flex items-center gap-1 text-xs text-[var(--theme-action-primary-bg)] hover:underline"
            aria-label="Add phone number"
          >
            <Plus size={12} /> Add
          </button>
        </div>
        <div className="space-y-1.5">
          {contactFooter.call_numbers.length === 0 && (
            <p className="text-xs text-[var(--theme-text-muted)] italic">No phone numbers — click Add to include one.</p>
          )}
          {contactFooter.call_numbers.map((num, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <input
                type="text"
                value={num}
                onChange={(e) => onUpdateCallNumber(idx, e.target.value)}
                className={inputCls}
                placeholder="+63 (2) 0000 0000"
              />
              <button
                type="button"
                onClick={() => onRemoveCallNumber(idx)}
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-surface-subtle)] hover:text-[var(--theme-text-primary)]"
                aria-label="Remove phone number"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="contact-email" className="text-xs font-semibold text-[var(--theme-text-secondary)] uppercase tracking-wider block">Message (Email)</label>
        <input
          id="contact-email"
          type="email"
          value={contactFooter.email}
          onChange={(e) => onUpdateField("email", e.target.value)}
          className={inputCls}
          placeholder="inquiries@example.com"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="contact-address" className="text-xs font-semibold text-[var(--theme-text-secondary)] uppercase tracking-wider block">Office Address</label>
        <textarea
          id="contact-address"
          value={contactFooter.office_address}
          onChange={(e) => onUpdateField("office_address", e.target.value)}
          rows={3}
          className={`${inputSubtleCls} resize-y`}
          placeholder="One line per row"
        />
        <p className="text-[11px] text-[var(--theme-text-muted)]">Line breaks are preserved in the printed footer.</p>
      </div>

      {onSaveAsDefault && (
        <button
          type="button"
          onClick={onSaveAsDefault}
          disabled={isSavingDefault}
          className="w-full mt-1 px-3 py-1.5 text-xs font-medium text-[var(--theme-text-secondary)] border border-dashed border-[var(--theme-border-default)] rounded-lg hover:bg-[var(--theme-bg-surface-subtle)] hover:text-[var(--theme-text-primary)] transition-all disabled:opacity-50"
        >
          {isSavingDefault ? "Saving…" : "Save as company default"}
        </button>
      )}
    </div>
  );
}
