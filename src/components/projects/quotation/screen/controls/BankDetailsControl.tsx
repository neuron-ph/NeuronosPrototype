import type { BankDetails } from "../useQuotationDocumentState";

interface BankDetailsControlProps {
  bankDetails: BankDetails;
  onUpdate: (field: keyof BankDetails, value: string) => void;
  onSaveAsDefault?: () => void;
  isSavingDefault?: boolean;
}

const inputCls = "w-full px-3.5 py-2 text-sm border border-[var(--theme-border-default)] rounded-lg focus:border-[var(--theme-action-primary-bg)] focus:ring-1 focus:ring-[var(--theme-action-primary-bg)] outline-none transition-all placeholder:text-[var(--theme-text-muted)]";
const inputSubtleCls = `${inputCls} bg-[var(--theme-bg-surface-subtle)]`;

export function BankDetailsControl({ bankDetails, onUpdate, onSaveAsDefault, isSavingDefault }: BankDetailsControlProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label htmlFor="bank-name" className="text-xs font-semibold text-[var(--theme-text-secondary)] uppercase tracking-wider block">Bank</label>
        <input
          id="bank-name"
          type="text"
          value={bankDetails.bank_name}
          onChange={(e) => onUpdate("bank_name", e.target.value)}
          className={inputCls}
          placeholder="e.g. BDO Unibank"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="bank-acct-name" className="text-xs font-semibold text-[var(--theme-text-secondary)] uppercase tracking-wider block">Account Name</label>
        <input
          id="bank-acct-name"
          type="text"
          value={bankDetails.account_name}
          onChange={(e) => onUpdate("account_name", e.target.value)}
          className={inputSubtleCls}
          placeholder="Account holder name"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="bank-acct-no" className="text-xs font-semibold text-[var(--theme-text-secondary)] uppercase tracking-wider block">Account Number</label>
        <input
          id="bank-acct-no"
          type="text"
          value={bankDetails.account_number}
          onChange={(e) => onUpdate("account_number", e.target.value)}
          className={inputSubtleCls}
          placeholder="0000-0000-0000"
        />
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
