import { useState, useEffect } from "react";
import { X, Save, Trash2, Folder, FileText } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { motion, AnimatePresence } from "motion/react";
import { saveAccount, deleteAccount, getAccounts } from "../../../utils/accounting-api";
import type { Account, AccountType } from "../../../types/accounting-core";
import { formatMoney } from "../../../utils/accountingCurrency";

interface AccountSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  account: Account | null; // If null, it's create mode
}

const ACCOUNT_TYPES: AccountType[] = ["Asset", "Liability", "Equity", "Income", "Expense"];
const CURRENCIES = ["PHP", "USD"] as const;
// Only monetary leaf accounts (cash, bank, AR, AP) may hold a non-PHP balance.
// P&L and equity accounts stay in the GL functional currency (PHP).
//
// Seeded rows use lowercase ("asset","liability"); newer UI uses the
// capitalised forms. Normalise before comparing to avoid silently snapping a
// seeded USD bank account back to PHP whenever the panel reopens.
const FOREIGN_CURRENCY_ALLOWED_TYPES = new Set(["asset", "liability"]);
function allowsForeignCurrency(type: unknown): boolean {
  return typeof type === "string" && FOREIGN_CURRENCY_ALLOWED_TYPES.has(type.trim().toLowerCase());
}

export function AccountSidePanel({ isOpen, onClose, onSave, account }: AccountSidePanelProps) {
  const [formData, setFormData] = useState<Partial<Account>>({
    name: "",
    code: "",
    type: "Asset",
    currency: "PHP",
    is_folder: false,
    parent_id: undefined,
    balance: 0,
    starting_amount: 0,
    subtype: ""
  });
  
  const [loading, setLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [availableParents, setAvailableParents] = useState<Account[]>([]);

  // Load available parents (only folders can be parents)
  useEffect(() => {
    if (isOpen) {
      getAccounts().then(accounts => {
        // Prevent circular dependency: an account cannot be its own parent
        // And only folders can be parents
        const validParents = accounts.filter(a => 
          a.is_folder && 
          (account ? a.id !== account.id : true)
        );
        setAvailableParents(validParents);
      });
    }
  }, [isOpen, account]);

  // Lock currency to PHP for any non-monetary account type. Revenue/expense/equity
  // accounts always denominate in the GL functional currency.
  useEffect(() => {
    if (!allowsForeignCurrency(formData.type) && formData.currency !== "PHP") {
      setFormData(prev => ({ ...prev, currency: "PHP" }));
    }
  }, [formData.type, formData.currency]);

  useEffect(() => {
    if (account) {
      setFormData(account);
    } else {
      setFormData({
        name: "",
        code: "",
        type: "Asset",
        currency: "PHP",
        is_folder: false,
        parent_id: undefined,
        balance: 0,
        starting_amount: 0,
        subtype: ""
      });
    }
  }, [account, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name) {
      toast.error("Please fill in the account name");
      return;
    }

    try {
      setLoading(true);
      
      const startingAmount = formData.starting_amount ?? 0;
      // On create, balance starts at starting_amount.
      // On edit, preserve existing balance (don't overwrite transaction activity).
      const balance = account ? (formData.balance ?? 0) : startingAmount;

      const newAccount: Account = {
        id: account?.id || Math.random().toString(36).substring(2, 15),
        created_at: account?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        name: formData.name,
        code: formData.code || "",
        type: formData.type as AccountType,
        currency: formData.currency as "USD" | "PHP",
        is_folder: formData.is_folder || false,
        parent_id: formData.parent_id,
        starting_amount: startingAmount,
        balance,
        subtype: formData.subtype || "",
        is_system: account?.is_system || false,
        is_active: true
      };

      await saveAccount(newAccount);

      toast.success(account ? "Account updated" : "Account created");
      onSave();
      onClose();
    } catch (error) {
      console.error("Error saving account:", error);
      toast.error("Failed to save account");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!account) return;

    if (!confirm("Are you sure you want to delete this account? This action cannot be undone.")) return;

    try {
      setIsDeleting(true);
      await deleteAccount(account.id);

      toast.success("Account deleted");
      onSave();
      onClose();
    } catch (error) {
      console.error("Error deleting account:", error);
      toast.error("Failed to delete account");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 right-0 w-[500px] bg-[var(--theme-bg-surface)] shadow-2xl z-50 flex flex-col border-l border-[var(--theme-border-subtle)]"
          >
            {/* Header */}
            <div className="px-8 py-6 border-b border-[var(--theme-border-subtle)] flex items-center justify-between bg-[var(--theme-bg-surface-subtle)]/50">
              <div>
                <h2 className="text-xl font-semibold text-[var(--theme-text-primary)]">
                  {account ? "Edit Account" : "New Account"}
                </h2>
                <p className="text-sm text-[var(--theme-text-muted)] mt-1">
                  {account ? "Modify account details" : "Add a new account to your chart of accounts"}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-[var(--theme-bg-surface-tint)] rounded-full transition-colors text-[var(--theme-text-muted)]"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
              
              {/* Type Selection */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--theme-text-primary)]">Account Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {ACCOUNT_TYPES.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, type }))}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all capitalize ${
                        formData.type === type
                          ? "bg-[var(--theme-action-primary-bg)]/10 border-[var(--theme-action-primary-bg)] text-[var(--theme-action-primary-bg)]"
                          : "bg-[var(--theme-bg-surface)] border-[var(--theme-border-default)] text-[var(--theme-text-secondary)] hover:border-[var(--theme-border-default)]"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Code & Name Row */}
              <div className="flex gap-4">
                 <div className="space-y-1.5 w-32">
                    <label className="text-sm font-medium text-[var(--theme-text-primary)]">Code</label>
                    <input
                      type="text"
                      value={formData.code || ""}
                      onChange={e => setFormData(prev => ({ ...prev, code: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-[var(--theme-border-default)] focus:outline-none focus:border-[var(--theme-action-primary-bg)] text-sm font-mono"
                      placeholder="e.g. 1000"
                    />
                 </div>
                 <div className="space-y-1.5 flex-1">
                    <label className="text-sm font-medium text-[var(--theme-text-primary)]">Account Name <span className="text-[var(--theme-status-danger-fg)]">*</span></label>
                    <input
                      required
                      type="text"
                      value={formData.name || ""}
                      onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-[var(--theme-border-default)] focus:outline-none focus:border-[var(--theme-action-primary-bg)] text-sm"
                      placeholder="e.g. HSBC Account"
                    />
                 </div>
              </div>

              {/* Detail Type / Subtype */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--theme-text-primary)]">Detail Type (Subtype)</label>
                <input
                  type="text"
                  value={formData.subtype || ""}
                  onChange={e => setFormData(prev => ({ ...prev, subtype: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--theme-border-default)] focus:outline-none focus:border-[var(--theme-action-primary-bg)] text-sm"
                  placeholder="e.g. Bank, Accounts Receivable, etc."
                />
              </div>

              {/* Starting Amount — leaf accounts only */}
              {!formData.is_folder && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--theme-text-primary)]">
                    Starting Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--theme-text-muted)] font-medium select-none">
                      {formData.currency === "PHP" ? "₱" : "$"}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.starting_amount ?? 0}
                      onChange={e => setFormData(prev => ({ ...prev, starting_amount: parseFloat(e.target.value) || 0 }))}
                      className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-[var(--theme-border-default)] focus:outline-none focus:border-[var(--theme-action-primary-bg)] text-sm font-mono"
                      placeholder="0.00"
                    />
                  </div>
                  {account && (
                    <p className="text-xs text-[var(--theme-text-muted)]">
                      Editing the starting amount updates the opening balance. Current balance is{" "}
                      <span className="font-mono font-medium text-[var(--theme-text-secondary)]">
                        {formatMoney(formData.balance ?? 0, (formData.currency === "USD" ? "USD" : "PHP") as any)}
                      </span>
                      .
                    </p>
                  )}
                </div>
              )}

              {/* Currency */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--theme-text-primary)]">Currency</label>
                <div className="flex gap-4">
                  {CURRENCIES.map(curr => {
                    const allowsForeign = allowsForeignCurrency(formData.type);
                    const disabled = curr !== "PHP" && !allowsForeign;
                    return (
                      <label
                        key={curr}
                        className={`flex items-center gap-2 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                      >
                        <input
                          type="radio"
                          name="currency"
                          value={curr}
                          checked={formData.currency === curr}
                          disabled={disabled}
                          onChange={() => setFormData(prev => ({ ...prev, currency: curr }))}
                          className="text-[var(--theme-action-primary-bg)] focus:ring-[var(--theme-action-primary-bg)]"
                        />
                        <span className="text-sm text-[var(--theme-text-secondary)] font-medium">{curr}</span>
                      </label>
                    );
                  })}
                </div>
                {!allowsForeignCurrency(formData.type) && (
                  <p className="text-xs text-[var(--theme-text-muted)]">
                    Only Asset and Liability accounts (cash, bank, AR, AP) may hold a non-PHP balance. The GL is PHP-functional.
                  </p>
                )}
              </div>

              {/* Is Folder */}
              <div className="flex items-center gap-3 p-4 bg-[var(--theme-bg-surface-subtle)] rounded-lg border border-[var(--theme-border-subtle)]">
                <input
                  type="checkbox"
                  id="isFolder"
                  checked={formData.is_folder || false}
                  onChange={e => setFormData(prev => ({ ...prev, is_folder: e.target.checked }))}
                  className="w-4 h-4 text-[var(--theme-action-primary-bg)] rounded border-[var(--theme-border-default)] focus:ring-[var(--theme-action-primary-bg)]"
                />
                <div className="flex-1">
                  <label htmlFor="isFolder" className="text-sm font-medium text-[var(--theme-text-secondary)] cursor-pointer flex items-center gap-2">
                    <Folder size={16} className="text-[var(--theme-text-muted)]" />
                    This is a Folder (Parent Account)
                  </label>
                  <p className="text-xs text-[var(--theme-text-muted)] mt-1">Folders can contain other accounts but cannot store transactions directly.</p>
                </div>
              </div>

              {/* Parent Account */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--theme-text-primary)]">Parent Account (Optional)</label>
                <select
                  value={formData.parent_id || ""}
                  onChange={e => setFormData(prev => ({ ...prev, parent_id: e.target.value || undefined }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--theme-border-default)] focus:outline-none focus:border-[var(--theme-action-primary-bg)] text-sm bg-[var(--theme-bg-surface)]"
                >
                  <option value="">None (Top Level)</option>
                  {availableParents.map(parent => (
                    <option key={parent.id} value={parent.id}>
                      {parent.code ? `${parent.code} - ` : ""}{parent.name} ({parent.currency})
                    </option>
                  ))}
                </select>
              </div>

            </form>

            {/* Footer */}
            <div className="px-8 py-6 border-t border-[var(--theme-border-subtle)] flex items-center justify-between bg-[var(--theme-bg-surface)]">
              {account ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="text-[var(--theme-status-danger-fg)] hover:text-red-700 text-sm font-medium flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--theme-status-danger-bg)] transition-colors"
                >
                  <Trash2 size={18} />
                  Delete
                </button>
              ) : (
                <div></div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] font-medium text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="px-6 py-2.5 bg-[var(--theme-action-primary-bg)] hover:bg-[var(--theme-action-primary-border)] text-white rounded-xl font-semibold text-sm shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      Save Account
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
