import { useState, useEffect } from "react";
import { X, Save, ArrowRightLeft, Calendar } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../../utils/supabase/client";
import { saveTransaction } from "../../utils/accounting-api";
import type { Account } from "../../types/accounting-core";
import type { EVoucher } from "../../types/evoucher";

interface PostToLedgerPanelProps {
  evoucher: EVoucher;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUser: any;
}

export function PostToLedgerPanel({ evoucher, isOpen, onClose, onSuccess, currentUser }: PostToLedgerPanelProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  
  // Form State
  const [debitAccountId, setDebitAccountId] = useState("");
  const [creditAccountId, setCreditAccountId] = useState("");
  const [postingDate, setPostingDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState(evoucher.description || evoucher.purpose || "");

  // Load Accounts
  useEffect(() => {
    if (isOpen) {
      fetchAccounts();
    }
  }, [isOpen]);

  const fetchAccounts = async () => {
    try {
      setLoadingAccounts(true);
      const { data, error } = await supabase.from('accounts').select('*');
      if (error) throw new Error(error.message);
      setAccounts(data || []);
    } catch (error) {
      console.error("Error loading accounts:", error);
      toast.error("Failed to load accounts");
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handlePost = async () => {
    if (!debitAccountId || !creditAccountId) {
      toast.error("Please select both Debit and Credit accounts");
      return;
    }

    try {
      setLoading(true);
      // Update evoucher status to posted
      const { error: updateErr } = await supabase.from('evouchers')
        .update({ status: 'posted', posted_to_ledger: true, updated_at: new Date().toISOString() })
        .eq('id', evoucher.id);
      
      if (updateErr) throw new Error(updateErr.message);

      // Insert history record
      await supabase.from('evoucher_history').insert({
        id: `EH-${Date.now()}`,
        evoucher_id: evoucher.id,
        action: 'Posted to Ledger',
        previous_status: evoucher.status,
        new_status: 'posted',
        performed_by: currentUser?.id,
        performed_by_name: currentUser?.name,
        performed_by_role: currentUser?.department,
        created_at: new Date().toISOString()
      });

      // --- AUTO-POST TRANSACTION TO LEDGER ---
      // Check if Credit Account is an Asset (Bank/Cash) => Money Out
      const creditAccount = accounts.find(a => a.id === creditAccountId);
      if (creditAccount && creditAccount.type?.toLowerCase() === 'asset') {
          try {
             await saveTransaction({
                 id: crypto.randomUUID(),
                 date: postingDate,
                 description: description || `Expense: ${evoucher.vendor_name || 'Unknown Vendor'}`,
                 amount: -Math.abs(evoucher.amount), // Negative for withdrawal
                 currency: evoucher.currency || creditAccount.currency || "PHP",
                 bank_account_id: creditAccountId,
                 category_account_id: debitAccountId, // Auto-categorize!
                 status: "posted", // Fully categorized and posted
                 source_document_id: evoucher.id,
                 created_at: new Date().toISOString()
             } as any);
             toast.success("Transaction auto-posted to Cash Ledger");
          } catch (txError) {
             console.error("Failed to auto-post transaction:", txError);
             toast.warning("Journal entry created, but failed to update Cash Ledger.");
          }
      }

      toast.success("Transaction Posted to Ledger");
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error posting to ledger:", error);
      toast.error(error instanceof Error ? error.message : "Failed to post transaction");
    } finally {
      setLoading(false);
    }
  };

  // Filter accounts for dropdowns
  const expenseAccounts = accounts.filter(a => a.type === "Expense" || a.type === "Asset");
  const paymentAccounts = accounts.filter(a => a.type === "Asset" || a.type === "Liability" || a.type === "Equity"); // Cash/Bank or AP

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60]"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 right-0 w-[500px] bg-white shadow-2xl z-[70] flex flex-col border-l border-gray-100"
          >
            {/* Header */}
            <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h2 className="text-xl font-semibold text-[#12332B]">
                  Post to Ledger
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Create a Journal Entry for {evoucher.voucher_number}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
              
              {/* Summary Card */}
              <div className="bg-[#E8F5F3] border border-[#0F766E]/20 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#0F766E] uppercase tracking-wide">Amount to Post</p>
                  <p className="text-2xl font-bold text-[#12332B] mt-1">
                    ₱ {evoucher.amount?.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-white/50 p-2 rounded-lg">
                  <ArrowRightLeft className="text-[#0F766E]" size={24} />
                </div>
              </div>

              {/* Date & Description */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#12332B]">Posting Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      type="date" 
                      value={postingDate}
                      onChange={(e) => setPostingDate(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-[#0F766E] text-sm bg-white"
                    />
                  </div>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[#12332B]">Memo / Description</label>
                  <input 
                    type="text" 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-[#0F766E] text-sm"
                  />
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              {/* GL Accounts */}
              <div className="space-y-6">
                {/* Debit */}
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <label className="text-sm font-medium text-[#12332B]">Debit Account (Expense)</label>
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">DR</span>
                  </div>
                  {loadingAccounts ? (
                    <div className="h-10 bg-gray-100 animate-pulse rounded-lg" />
                  ) : (
                    <select
                      value={debitAccountId}
                      onChange={(e) => setDebitAccountId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-[#0F766E] text-sm bg-white"
                    >
                      <option value="">Select Expense Account...</option>
                      {expenseAccounts.map(acc => (
                        <option key={acc.id} value={acc.id} disabled={acc.is_folder}>
                          {'\u00A0'.repeat((acc.depth || 0) * 4)}
                          {acc.code} - {acc.name} {acc.is_folder ? '(Folder)' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="text-xs text-gray-500">
                    Typically an Expense account like "Ocean Freight Cost" or "Office Supplies"
                  </p>
                </div>

                {/* Credit */}
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <label className="text-sm font-medium text-[#12332B]">Credit Account (Source)</label>
                    <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded">CR</span>
                  </div>
                  {loadingAccounts ? (
                    <div className="h-10 bg-gray-100 animate-pulse rounded-lg" />
                  ) : (
                    <select
                      value={creditAccountId}
                      onChange={(e) => setCreditAccountId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:border-[#0F766E] text-sm bg-white"
                    >
                      <option value="">Select Payment Source...</option>
                      {paymentAccounts.map(acc => (
                        <option key={acc.id} value={acc.id} disabled={acc.is_folder}>
                          {'\u00A0'.repeat((acc.depth || 0) * 4)}
                          {acc.code} - {acc.name} {acc.is_folder ? '(Folder)' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="text-xs text-gray-500">
                    Typically "Cash in Bank" (if paid) or "Accounts Payable" (if bill)
                  </p>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="px-8 py-6 border-t border-gray-100 flex items-center justify-end gap-3 bg-white">
              <button
                onClick={onClose}
                className="px-5 py-2.5 text-gray-600 hover:text-gray-900 font-medium text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePost}
                disabled={loading || !debitAccountId || !creditAccountId}
                className="px-6 py-2.5 bg-[#0F766E] hover:bg-[#0D6560] text-white rounded-xl font-semibold text-sm shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? "Posting..." : (
                  <>
                    <Save size={18} />
                    Post Entry
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}