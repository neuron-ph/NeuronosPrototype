import { useState, useEffect } from "react";
import { Loader2, ArrowRight, Check } from "lucide-react";
import { toast } from "../../ui/toast-utils";
import type { FinancialContainer } from "../../../types/financials";
import type { LinkedBilling } from "../../../types/evoucher";
import { Invoice, Collection } from "../../../types/accounting";
import { useEVoucherSubmit } from "../../../hooks/useEVoucherSubmit";
import { useUser } from "../../../hooks/useUser";
import { SidePanel } from "../../common/SidePanel";
import { CustomDatePicker } from "../../common/CustomDatePicker";
import { CustomDropdown } from "../../bd/CustomDropdown";
import { calculateInvoiceBalance } from "../../../utils/accounting-math";

interface CollectionCreatorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  project: FinancialContainer;
  onSuccess: () => void;
  // New props for Viewing & Data Injection
  existingInvoices: Invoice[];
  existingCollections: Collection[];
  initialData?: Collection | null;
  mode?: 'create' | 'view';
}

interface OpenInvoice {
  id: string;
  voucher_number: string;
  statement_reference: string;
  description: string;
  due_date: string;
  amount: number;
  remaining_balance: number;
  payment_amount: number; // For the form
  isSelected: boolean;
}

export function CollectionCreatorPanel({ 
  isOpen, 
  onClose, 
  project, 
  onSuccess,
  existingInvoices,
  existingCollections,
  initialData,
  mode = 'create' 
}: CollectionCreatorPanelProps) {
  const { user } = useUser();
  const { submitForApproval, isSaving } = useEVoucherSubmit("collection");
  const isReadOnly = mode === 'view';

  // -- Form State --
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState("Bank Transfer");
  const [referenceNo, setReferenceNo] = useState("");
  const [depositTo, setDepositTo] = useState("Undeposited Funds");
  const [notes, setNotes] = useState("");
  const [amountReceived, setAmountReceived] = useState<number>(0);
  
  // -- Data State --
  const [invoices, setInvoices] = useState<OpenInvoice[]>([]);

  // Initialize Data when Open
  useEffect(() => {
    if (isOpen) {
      if (mode === 'view' && initialData) {
        // --- VIEW MODE INITIALIZATION ---
        setPaymentDate(initialData.collection_date || initialData.created_at);
        setPaymentMethod(initialData.payment_method);
        setReferenceNo(initialData.reference_number || "");
        setNotes(initialData.notes || "");
        setAmountReceived(initialData.amount);

        // Filter and map invoices that are LINKED to this collection
        const linkedInvoiceIds = initialData.linked_billings?.map(lb => lb.id) || [];
        
        const viewableInvoices = existingInvoices
          .filter(inv => linkedInvoiceIds.includes(inv.id))
          .map(inv => {
            const link = initialData.linked_billings?.find(lb => lb.id === inv.id);
            const paymentAmount = link ? link.amount : 0;
            
            return {
              id: inv.id,
              voucher_number: inv.invoice_number,
              statement_reference: inv.invoice_number,
              description: inv.description,
              due_date: inv.due_date || inv.created_at,
              amount: inv.total_amount || inv.amount,
              remaining_balance: 0, // In view mode, we don't care about balance
              payment_amount: paymentAmount,
              isSelected: true
            };
          });

        setInvoices(viewableInvoices);

      } else {
        // --- CREATE MODE INITIALIZATION ---
        // Reset Form
        setPaymentDate(new Date().toISOString().split('T')[0]);
        setPaymentMethod("Bank Transfer");
        setReferenceNo("");
        setNotes("");
        setAmountReceived(0);

        const openItems = existingInvoices
          .map(inv => {
            const { balance, status } = calculateInvoiceBalance(inv, existingCollections);

            return {
              invoice: inv,
              balance,
              status,
            };
          })
          .filter(({ balance, status }) => balance > 0.01 && status !== 'paid')
          .map(({ invoice: inv, balance }) => ({
            id: inv.id,
            voucher_number: inv.invoice_number,
            statement_reference: inv.invoice_number,
            description: inv.description,
            due_date: inv.due_date || inv.created_at,
            amount: inv.total_amount || inv.amount,
            remaining_balance: balance,
            payment_amount: 0,
            isSelected: false
          }))
          .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

        setInvoices(openItems);
      }
    }
  }, [isOpen, mode, initialData, existingInvoices, existingCollections]);


  // -- Bidirectional Logic --

  // 1. Handle "Amount Received" Change (Auto-Allocate)
  const handleAmountReceivedChange = (val: string) => {
    if (isReadOnly) return;
    const newAmount = parseFloat(val) || 0;
    setAmountReceived(newAmount);

    // Auto-allocate logic
    let remainingToAllocate = newAmount;
    
    const newInvoices = invoices.map(inv => {
      if (remainingToAllocate <= 0) {
        return { ...inv, isSelected: false, payment_amount: 0 };
      }

      const amountToPay = Math.min(remainingToAllocate, inv.remaining_balance);
      remainingToAllocate -= amountToPay;

      return {
        ...inv,
        isSelected: true,
        payment_amount: parseFloat(amountToPay.toFixed(2))
      };
    });

    setInvoices(newInvoices);
  };

  // 2. Handle Invoice Selection (Manual Toggle)
  const toggleInvoice = (id: string) => {
    if (isReadOnly) return;
    let amountDelta = 0;

    const newInvoices = invoices.map(inv => {
      if (inv.id === id) {
        const newSelected = !inv.isSelected;
        // If selecting, default to full balance. If deselecting, 0.
        const newPaymentAmount = newSelected ? inv.remaining_balance : 0;
        
        // Calculate delta to update total Amount Received
        amountDelta = newSelected ? inv.remaining_balance : -inv.payment_amount;

        return {
          ...inv,
          isSelected: newSelected,
          payment_amount: newPaymentAmount
        };
      }
      return inv;
    });

    setInvoices(newInvoices);
    setAmountReceived(prev => Math.max(0, parseFloat((prev + amountDelta).toFixed(2))));
  };

  // 3. Handle specific Payment Amount change on a row
  const handleInvoicePaymentChange = (id: string, amount: number) => {
    if (isReadOnly) return;
    let amountDelta = 0;

    const newInvoices = invoices.map(inv => {
      if (inv.id === id) {
        // Limit to remaining balance
        const validAmount = Math.min(amount, inv.remaining_balance);
        amountDelta = validAmount - inv.payment_amount;

        return {
          ...inv,
          payment_amount: validAmount,
          isSelected: validAmount > 0
        };
      }
      return inv;
    });

    setInvoices(newInvoices);
    setAmountReceived(prev => Math.max(0, parseFloat((prev + amountDelta).toFixed(2))));
  };


  // -- Submission --
  const handleSubmit = async () => {
    if (amountReceived <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const selectedInvoices = invoices.filter(inv => inv.payment_amount > 0);
    const primaryInvoiceId = selectedInvoices.length === 1 ? selectedInvoices[0].id : undefined;
    
    // Calculate total applied to invoices
    const totalApplied = selectedInvoices.reduce((sum, inv) => sum + inv.payment_amount, 0);
    
    // Check for overpayment (credit)
    const amountToCredit = amountReceived - totalApplied;

    try {
      const linkedBillings: LinkedBilling[] = selectedInvoices.map(inv => ({
        id: inv.id,
        amount: inv.payment_amount
      }));

      // Create line items
      const lineItems = [{
        id: "1",
        particular: `Payment for ${selectedInvoices.length} invoices`,
        description: selectedInvoices.map(inv => inv.voucher_number).join(", "),
        amount: totalApplied
      }];

      // If there's credit, add a line item or handle it (for now, we'll just note it)
      if (amountToCredit > 0.01) {
        lineItems.push({
           id: "2",
           particular: "Overpayment / Credit",
           description: "Unapplied amount to be credited",
           amount: amountToCredit
        });
      }

      const submissionNotes = amountToCredit > 0.01
        ? [notes, `Customer credit pending: ${formatCurrency(amountToCredit)} remains unapplied.`].filter(Boolean).join("\n\n")
        : notes;

      await submitForApproval({
        requestName: `Collection - ${project.customer_name}`,
        expenseCategory: "Collection",
        subCategory: "",
        projectNumber: project.project_number,
        invoiceId: primaryInvoiceId,
        lineItems: lineItems,
        totalAmount: amountReceived,
        preferredPayment: paymentMethod,
        vendor: project.customer_name,
        creditTerms: "None",
        paymentSchedule: paymentDate,
        notes: submissionNotes,
        requestor: user?.name || "Current User",
        transactionType: "collection",
        linkedBillings: linkedBillings as any
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error("Submission error:", error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(amount);
  };

  const totalApplied = invoices.reduce((sum, inv) => sum + inv.payment_amount, 0);
  const amountToCredit = Math.max(0, amountReceived - totalApplied);

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={mode === 'view' ? "Collection Details" : "Receive Payment"}
    >
      <div className="flex flex-col h-full bg-white">
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* 1. Top Form Section */}
            <div className={`bg-white rounded-xl border border-[#E5E9F0] p-6 ${isReadOnly ? 'pointer-events-none opacity-90' : ''}`}>
              <div className="flex gap-8">
                {/* Left Column: Details */}
                <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-5">
                   {/* Customer */}
                   <div className="col-span-2">
                      <label className="block text-sm font-medium text-[#0A1D4D] mb-1.5">Customer</label>
                      <input 
                        type="text" 
                        readOnly 
                        value={project.customer_name}
                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-[#E5E7EB] rounded-lg text-[#0A1D4D] text-sm focus:outline-none"
                      />
                   </div>

                   {/* Row 1: Date & Method */}
                   <div>
                      <label className="block text-sm font-medium text-[#0A1D4D] mb-1.5">Payment Date</label>
                      <CustomDatePicker 
                        value={paymentDate}
                        onChange={setPaymentDate}
                        className="w-full px-3.5 py-2.5"
                      />
                   </div>

                   <div>
                      <label className="block text-sm font-medium text-[#0A1D4D] mb-1.5">Payment Method</label>
                      <CustomDropdown
                        value={paymentMethod}
                        onChange={setPaymentMethod}
                        options={[
                            { value: "Bank Transfer", label: "Bank Transfer" },
                            { value: "Check", label: "Check" },
                            { value: "Cash", label: "Cash" },
                            { value: "Credit Card", label: "Credit Card" },
                        ]}
                        fullWidth
                      />
                   </div>

                   {/* Row 2: Reference & Deposit */}
                   <div>
                      <label className="block text-sm font-medium text-[#0A1D4D] mb-1.5">Reference no.</label>
                      <input 
                        type="text" 
                        value={referenceNo}
                        onChange={(e) => setReferenceNo(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-[#E5E7EB] rounded-lg text-[#0A1D4D] text-sm focus:outline-none focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E]"
                        placeholder="e.g. 12345"
                      />
                   </div>

                   <div>
                      <label className="block text-sm font-medium text-[#0A1D4D] mb-1.5">Deposit to</label>
                      <CustomDropdown
                        value={depositTo}
                        onChange={setDepositTo}
                        options={[
                            { value: "Undeposited Funds", label: "Undeposited Funds" },
                            { value: "BDO Savings", label: "BDO Savings" },
                            { value: "BPI Current", label: "BPI Current" },
                        ]}
                        fullWidth
                      />
                   </div>
                </div>

                {/* Right Column: Amount Received */}
                <div className="w-[300px] flex flex-col justify-start pt-1">
                   <label className="block text-sm font-medium text-[#0A1D4D] mb-1.5">Amount Received</label>
                   <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-lg">₱</span>
                      <input 
                        type="number"
                        value={amountReceived || ""}
                        onChange={(e) => handleAmountReceivedChange(e.target.value)}
                        className="w-full pl-10 pr-4 py-4 bg-white border border-[#E5E7EB] rounded-lg text-2xl font-bold text-[#0F766E] placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0F766E] focus:border-transparent"
                        placeholder="0.00"
                      />
                   </div>
                   <p className="text-xs text-gray-500 mt-2">
                      {isReadOnly 
                        ? "Total amount for this collection record." 
                        : "Enter the total amount received. It will be automatically applied to the oldest invoices first, or you can manually select below."
                      }
                   </p>
                </div>
              </div>
            </div>

            {/* 2. Outstanding Transactions Table */}
            <div className="bg-white rounded-xl border border-[#E5E9F0] overflow-hidden flex flex-col min-h-[400px]">
              <div className="px-6 py-4 border-b border-[#E5E9F0] bg-white flex justify-between items-center">
                <h3 className="text-sm font-bold text-[#12332B] uppercase tracking-wide">
                  {mode === 'view' ? "Linked Invoices" : "Outstanding Transactions"}
                </h3>
                <span className="text-xs text-gray-500 font-medium">
                  {invoices.length} {mode === 'view' ? "linked" : "open"} invoices
                </span>
              </div>

              {invoices.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-gray-400">
                  <p>{mode === 'view' ? "No invoices linked to this collection." : "No open invoices found."}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-white border-b border-[#E5E9F0]">
                      <tr>
                        <th className="px-6 py-3 w-12 text-center">
                           <div className="w-5 h-5 rounded border border-gray-300 bg-white flex items-center justify-center opacity-50 cursor-not-allowed">
                           </div>
                        </th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Due Date</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Original Amount</th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                          {mode === 'view' ? "Balance" : "Open Balance"}
                        </th>
                        <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right w-48">Payment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3F4F6]">
                      {invoices.map((inv) => (
                        <tr 
                          key={inv.id} 
                          className={`transition-colors hover:bg-gray-50 ${inv.isSelected ? "bg-[#F0FDFA]" : ""} ${isReadOnly ? 'pointer-events-none' : ''}`}
                          onClick={(e) => {
                            if (!isReadOnly) {
                                if ((e.target as HTMLElement).tagName !== 'INPUT') {
                                    toggleInvoice(inv.id);
                                }
                            }
                          }}
                        >
                          <td className="px-6 py-4 text-center">
                             <div 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isReadOnly) toggleInvoice(inv.id);
                                }}
                                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors cursor-pointer mx-auto ${
                                  inv.isSelected 
                                    ? "bg-[#0F766E] border-[#0F766E]" 
                                    : "bg-white border-gray-300 hover:border-[#0F766E]"
                                }`}
                              >
                                {inv.isSelected && <Check size={14} className="text-white" strokeWidth={3} />}
                              </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-[#12332B]">{inv.voucher_number}</div>
                            <div className="text-xs text-gray-500">{inv.description}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {new Date(inv.due_date).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600 text-right">
                            {formatCurrency(inv.amount)}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-[#12332B] text-right">
                            {mode === 'view' ? "-" : formatCurrency(inv.remaining_balance)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <input
                              type="number"
                              value={inv.payment_amount > 0 ? inv.payment_amount : ""}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => handleInvoicePaymentChange(inv.id, parseFloat(e.target.value) || 0)}
                              readOnly={isReadOnly}
                              className={`w-full text-right px-3 py-2 border rounded-md text-sm outline-none transition-all ${
                                inv.isSelected 
                                  ? "border-[#0F766E] ring-1 ring-[#0F766E] font-bold text-[#0F766E] bg-white" 
                                  : "border-gray-200 text-gray-700 bg-transparent"
                              }`}
                              placeholder="0.00"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            
            {/* 3. Footer Section (QuickBooks Style) */}
            <div className={`grid grid-cols-2 gap-8 ${isReadOnly ? 'pointer-events-none' : ''}`}>
                {/* Memo */}
                <div>
                   <label className="block text-sm font-medium text-[#0A1D4D] mb-1.5">Memo</label>
                   <textarea
                     value={notes}
                     onChange={(e) => setNotes(e.target.value)}
                     className="w-full px-3.5 py-2.5 bg-white border border-[#E5E7EB] rounded-lg text-[#0A1D4D] text-sm focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                     placeholder="Notes..."
                     rows={3}
                   />
                </div>

                {/* Summary Metrics */}
                <div className="flex flex-col justify-end gap-3">
                   <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Amount to Apply:</span>
                      <span className="font-semibold text-[#12332B]">{formatCurrency(totalApplied)}</span>
                   </div>
                   <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Amount to Credit:</span>
                      <span className="font-semibold text-[#12332B]">{formatCurrency(amountToCredit)}</span>
                   </div>
                   <div className="h-px bg-gray-200 my-1"></div>
                   <div className="flex justify-between items-center">
                      <span className="text-base font-bold text-[#0A1D4D]">Total Received:</span>
                      <span className="text-xl font-bold text-[#0F766E]">{formatCurrency(amountReceived)}</span>
                   </div>
                </div>
            </div>

          </div>
        </div>

        {/* Action Bar */}
        {!isReadOnly && (
          <div className="px-8 py-5 bg-white border-t border-[#E5E9F0] flex justify-end gap-3 shrink-0">
             <button
               onClick={onClose}
               className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
             >
               Cancel
             </button>
             <button
               onClick={handleSubmit}
               disabled={isSaving || amountReceived <= 0}
               className={`px-6 py-2 text-sm font-bold text-white rounded-lg shadow-sm flex items-center gap-2 transition-all ${
                 isSaving || amountReceived <= 0 
                   ? "bg-gray-400 cursor-not-allowed" 
                   : "bg-[#0F766E] hover:bg-[#0D655E] hover:shadow-md"
               }`}
             >
               {isSaving ? (
                 <>
                   <Loader2 className="animate-spin" size={16} />
                   Processing...
                 </>
               ) : (
                 <>
                   Save & Close
                   <ArrowRight size={16} />
                 </>
               )}
             </button>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
