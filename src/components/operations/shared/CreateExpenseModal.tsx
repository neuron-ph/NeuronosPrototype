import React, { useState } from "react";
import { X } from "lucide-react";
import type { Expense } from "../../../types/operations";
import { supabase } from "../../../utils/supabase/client";
import { toast } from "../../ui/toast-utils";
import { useUser } from "../../../hooks/useUser";
import { logCreation } from "../../../utils/activityLog";

interface CreateExpenseModalProps {
  bookingId: string;
  bookingType: "forwarding" | "brokerage" | "trucking" | "marine-insurance" | "others";
  onClose: () => void;
  onExpenseCreated: () => void;
}

const EXPENSE_CATEGORIES = [
  "Trucking Fee",
  "Customs Fee",
  "Storage Fee",
  "Handling Fee",
  "Documentation Fee",
  "Port Charges",
  "Fuel Surcharge",
  "Insurance",
  "Other",
];

export function CreateExpenseModal({
  bookingId,
  bookingType,
  onClose,
  onExpenseCreated
}: CreateExpenseModalProps) {
  const { user } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PHP");
  const [vendor, setVendor] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<"Pending" | "Approved" | "Paid">("Pending");
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!description || !amount) {
      toast.error("Description and Amount are required");
      return;
    }

    setIsSubmitting(true);

    try {
      const expenseData: Partial<Expense> = {
        bookingId,
        bookingType,
        description,
        amount: parseFloat(amount),
        currency,
        vendor: vendor || undefined,
        expenseDate: expenseDate || undefined,
        category: category || undefined,
        status,
        notes: notes || undefined,
      };

      const expenseId = `exp-${Date.now()}`;
      const { error } = await supabase.from('expenses').insert({
        ...expenseData,
        id: expenseId,
        created_at: new Date().toISOString(),
      });

      if (error) throw error;
      logCreation("expense", expenseId, description || expenseId, { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" });
      toast.success("Expense created successfully");
      onExpenseCreated();
    } catch (error) {
      console.error('Error creating expense:', error);
      toast.error('Unable to create expense');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--theme-bg-surface)] rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--theme-text-primary)]/10">
          <h2 className="text-[var(--theme-text-primary)]">Add Expense</h2>
          <button
            onClick={onClose}
            className="text-[var(--theme-text-primary)]/40 hover:text-[var(--theme-text-primary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-[var(--theme-text-primary)]/80 mb-2">
                Description <span className="text-[var(--theme-status-danger-fg)]">*</span>
              </label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Container trucking, Storage charges"
                className="w-full px-3 py-2 border border-[var(--theme-text-primary)]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)]"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-[var(--theme-text-primary)]/80 mb-2">
                  Amount <span className="text-[var(--theme-status-danger-fg)]">*</span>
                </label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-[var(--theme-text-primary)]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)]"
                />
              </div>

              <div>
                <label className="block text-[var(--theme-text-primary)]/80 mb-2">
                  Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--theme-text-primary)]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)]"
                >
                  <option value="PHP">PHP</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="CNY">CNY</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[var(--theme-text-primary)]/80 mb-2">
                  Vendor
                </label>
                <input
                  type="text"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="Vendor or supplier name"
                  className="w-full px-3 py-2 border border-[var(--theme-text-primary)]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)]"
                />
              </div>

              <div>
                <label className="block text-[var(--theme-text-primary)]/80 mb-2">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--theme-text-primary)]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)]"
                >
                  <option value="">Select category...</option>
                  {EXPENSE_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[var(--theme-text-primary)]/80 mb-2">
                  Expense Date
                </label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--theme-text-primary)]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)]"
                />
              </div>

              <div>
                <label className="block text-[var(--theme-text-primary)]/80 mb-2">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "Pending" | "Approved" | "Paid")}
                  className="w-full px-3 py-2 border border-[var(--theme-text-primary)]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)]"
                >
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[var(--theme-text-primary)]/80 mb-2">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Additional notes or comments..."
                className="w-full px-3 py-2 border border-[var(--theme-text-primary)]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)]"
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-[var(--theme-text-primary)]/10">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-[var(--theme-text-primary)] hover:bg-[var(--theme-text-primary)]/5 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 bg-[var(--theme-action-primary-bg)] text-white rounded-lg hover:bg-[var(--theme-action-primary-bg)]/90 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create Expense"}
          </button>
        </div>
      </div>
    </div>
  );
}