import { useState, useEffect } from "react";
import { Loader2, ArrowRight, Check, Trash2 } from "lucide-react";
import { logCreation } from "../../../utils/activityLog";
import { toast } from "../../ui/toast-utils";
import type { FinancialContainer } from "../../../types/financials";
import type { LinkedBilling } from "../../../types/evoucher";
import { Invoice, Collection } from "../../../types/accounting";
import { useUser } from "../../../hooks/useUser";
import { fireGLPostingTicketOnCollection } from "../../../utils/workflowTickets";
import { SidePanel } from "../../common/SidePanel";
import { CustomDatePicker } from "../../common/CustomDatePicker";
import { CustomDropdown } from "../../bd/CustomDropdown";
import { calculateInvoiceBalance } from "../../../utils/accounting-math";
import { supabase } from "../../../utils/supabase/client";
import { REVERSED_INVOICE_STATUS } from "../../../utils/invoiceReversal";
import { NeuronModal } from "../../ui/NeuronModal";
import {
  FUNCTIONAL_CURRENCY,
  SUPPORTED_ACCOUNTING_CURRENCIES,
  formatMoney,
  normalizeCurrency,
  resolvePostingRate,
  roundMoney,
  toBaseAmount,
  type AccountingCurrency,
} from "../../../utils/accountingCurrency";
import { resolveExchangeRate } from "../../../utils/exchangeRates";
import { recordNotificationEvent } from "../../../utils/notifications";

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
  remaining_balance: number;       // invoice currency (legacy display)
  remaining_balance_base: number;  // PHP base — authoritative for cross-currency allocation
  invoice_currency: string;
  invoice_rate: number;            // invoice's locked FX rate (invoice currency → PHP)
  payment_amount: number;          // invoice currency
  isSelected: boolean;
  isReversed?: boolean;
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
  const [isSaving, setIsSaving] = useState(false);
  const isReadOnly = mode === 'view';
  const [pendingDeleteInvoice, setPendingDeleteInvoice] = useState<{ id: string; voucherNumber: string } | null>(null);

  // -- Form State --
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState("Bank Transfer");
  const [referenceNo, setReferenceNo] = useState("");
  const [depositTo, setDepositTo] = useState("Undeposited Funds");
  const [notes, setNotes] = useState("");
  const [amountReceived, setAmountReceived] = useState<number>(0);

  // Multi-currency. Defaults to PHP; user can switch to USD and lock a rate.
  const [collectionCurrency, setCollectionCurrency] =
    useState<AccountingCurrency>(FUNCTIONAL_CURRENCY);
  const [exchangeRateInput, setExchangeRateInput] = useState<string>("");

  useEffect(() => {
    if (collectionCurrency === FUNCTIONAL_CURRENCY) {
      setExchangeRateInput("");
      return;
    }
    let cancelled = false;
    resolveExchangeRate({
      fromCurrency: collectionCurrency,
      toCurrency: FUNCTIONAL_CURRENCY,
      rateDate: paymentDate || new Date(),
    })
      .then((row) => {
        if (cancelled) return;
        setExchangeRateInput((cur) => cur || String(row.rate));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [collectionCurrency, paymentDate]);

  // -- Data State --
  const [invoices, setInvoices] = useState<OpenInvoice[]>([]);

  // Initialize Data when Open
  useEffect(() => {
    if (isOpen) {
      if (mode === 'view' && initialData) {
        // --- VIEW MODE INITIALIZATION ---
        setPaymentDate(initialData.collection_date || initialData.created_at || "");
        setPaymentMethod(initialData.payment_method || "Bank Transfer");
        setReferenceNo(initialData.reference_number || "");
        setNotes(initialData.notes || "");
        setAmountReceived(initialData.amount);
        const cur = normalizeCurrency(
          (initialData as any).original_currency ?? initialData.currency ?? FUNCTIONAL_CURRENCY,
          FUNCTIONAL_CURRENCY,
        );
        setCollectionCurrency(cur);
        const rate = (initialData as any).exchange_rate;
        if (rate && rate > 0) setExchangeRateInput(String(rate));

        // Filter and map invoices that are LINKED to this collection
        const linkedInvoiceIds = initialData.linked_billings?.map(lb => lb.id) || [];
        
        const viewableInvoices = existingInvoices
          .filter(inv => linkedInvoiceIds.includes(inv.id))
          .map(inv => {
            const link = initialData.linked_billings?.find(lb => lb.id === inv.id);
            const paymentAmount = link ? link.amount : 0;
            const invCcy = ((inv as any).original_currency || (inv as any).currency || FUNCTIONAL_CURRENCY) as string;
            const rRaw = Number((inv as any).exchange_rate);
            const invRate = Number.isFinite(rRaw) && rRaw > 0 ? rRaw : 1;

            return {
              id: inv.id,
              voucher_number: inv.invoice_number || "",
              statement_reference: inv.invoice_number || "",
              description: inv.description || "",
              due_date: inv.due_date || inv.created_at || "",
              amount: (inv.total_amount ?? inv.amount) ?? 0,
              remaining_balance: 0, // In view mode, we don't care about balance
              remaining_balance_base: 0,
              invoice_currency: invCcy,
              invoice_rate: invRate,
              payment_amount: paymentAmount,
              isSelected: true,
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

        // Separate reversed invoices from open ones so reversed show in the list
        // but cannot be selected for payment.
        const buildInvoiceMeta = (inv: Invoice) => {
          const invCcy = ((inv as any).original_currency || (inv as any).currency || FUNCTIONAL_CURRENCY) as string;
          const rRaw = Number((inv as any).exchange_rate);
          const invRate = Number.isFinite(rRaw) && rRaw > 0 ? rRaw : 1;
          return { invCcy, invRate };
        };

        const reversedItems: OpenInvoice[] = existingInvoices
          .filter(inv => String(inv.status || "").toLowerCase() === REVERSED_INVOICE_STATUS)
          .map(inv => {
            const { invCcy, invRate } = buildInvoiceMeta(inv);
            return {
              id: inv.id,
              voucher_number: inv.invoice_number || "",
              statement_reference: inv.invoice_number || "",
              description: inv.description || "",
              due_date: inv.due_date || inv.created_at || "",
              amount: (inv.total_amount ?? inv.amount) ?? 0,
              remaining_balance: 0,
              remaining_balance_base: 0,
              invoice_currency: invCcy,
              invoice_rate: invRate,
              payment_amount: 0,
              isSelected: false,
              isReversed: true,
            };
          });

        const openItems: OpenInvoice[] = existingInvoices
          .filter(inv => String(inv.status || "").toLowerCase() !== REVERSED_INVOICE_STATUS)
          .map(inv => {
            const fin = calculateInvoiceBalance(inv, existingCollections);
            return { invoice: inv, fin };
          })
          .filter(({ fin }) => fin.balanceBase > 0.01 && fin.status !== 'paid')
          .map(({ invoice: inv, fin }) => {
            const { invCcy, invRate } = buildInvoiceMeta(inv);
            return {
              id: inv.id,
              voucher_number: inv.invoice_number || "",
              statement_reference: inv.invoice_number || "",
              description: inv.description || "",
              due_date: inv.due_date || inv.created_at || "",
              amount: (inv.total_amount ?? inv.amount) ?? 0,
              remaining_balance: fin.balance,
              remaining_balance_base: fin.balanceBase,
              invoice_currency: invCcy,
              invoice_rate: invRate,
              payment_amount: 0,
              isSelected: false,
            };
          })
          .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

        setInvoices([...openItems, ...reversedItems]);
      }
    }
  }, [isOpen, mode, initialData, existingInvoices, existingCollections]);


  // -- Bidirectional Logic --
  //
  // Multi-currency convention:
  //   - amountReceived is in collectionCurrency.
  //   - inv.payment_amount is in invoice currency.
  //   - inv.remaining_balance_base is the authoritative remaining balance in PHP.
  //   - All cross-row comparisons happen in PHP base.

  const collectionRate = (() => {
    if (collectionCurrency === FUNCTIONAL_CURRENCY) return 1;
    const r = parseFloat(exchangeRateInput);
    return Number.isFinite(r) && r > 0 ? r : 0; // 0 means "not yet known"
  })();

  // collection currency → PHP base
  const collToBase = (amt: number) => collectionRate > 0 ? roundMoney(amt * collectionRate) : 0;
  // PHP base → collection currency
  const baseToColl = (base: number) => collectionRate > 0 ? roundMoney(base / collectionRate) : 0;
  // invoice currency → PHP base
  const invToBase = (amt: number, rate: number) => roundMoney(amt * (rate > 0 ? rate : 1));
  // PHP base → invoice currency
  const baseToInv = (base: number, rate: number) => roundMoney(base / (rate > 0 ? rate : 1));

  // 1. Handle "Amount Received" Change (Auto-Allocate, in PHP base)
  const handleAmountReceivedChange = (val: string) => {
    if (isReadOnly) return;
    const newAmount = parseFloat(val) || 0;
    setAmountReceived(newAmount);

    // If we don't yet have a collection rate (USD without rate entered), fall back to
    // raw allocation in collection currency to keep the UI usable. The submit guard
    // will refuse if reconciliation fails.
    const haveBase = collectionRate > 0;
    let remainingBase = haveBase ? collToBase(newAmount) : newAmount;

    const newInvoices = invoices.map(inv => {
      if (inv.isReversed || remainingBase <= 0) {
        return { ...inv, isSelected: false, payment_amount: 0 };
      }
      const invRemainingBase = haveBase
        ? inv.remaining_balance_base
        : inv.remaining_balance; // fall-back when no rate
      const sliceBase = Math.min(remainingBase, invRemainingBase);
      remainingBase -= sliceBase;

      const paymentInInvoiceCcy = haveBase
        ? baseToInv(sliceBase, inv.invoice_rate)
        : roundMoney(sliceBase);

      return {
        ...inv,
        isSelected: paymentInInvoiceCcy > 0,
        payment_amount: paymentInInvoiceCcy,
      };
    });

    setInvoices(newInvoices);
  };

  // 2. Handle Invoice Selection (Manual Toggle)
  const toggleInvoice = (id: string) => {
    if (isReadOnly) return;
    const target = invoices.find(inv => inv.id === id);
    if (target?.isReversed) return;
    let collectionDelta = 0;

    const newInvoices = invoices.map(inv => {
      if (inv.id === id) {
        const newSelected = !inv.isSelected;
        const newPaymentAmount = newSelected ? inv.remaining_balance : 0;

        // Translate the invoice-currency change into collection-currency delta via PHP base.
        const baseDelta = newSelected
          ? inv.remaining_balance_base
          : -invToBase(inv.payment_amount, inv.invoice_rate);
        collectionDelta = collectionRate > 0 ? baseToColl(baseDelta) : baseDelta;

        return {
          ...inv,
          isSelected: newSelected,
          payment_amount: newPaymentAmount,
        };
      }
      return inv;
    });

    setInvoices(newInvoices);
    setAmountReceived(prev => Math.max(0, roundMoney(prev + collectionDelta)));
  };

  // 3. Handle specific Payment Amount change on a row (input is in invoice currency)
  const handleInvoicePaymentChange = (id: string, amount: number) => {
    if (isReadOnly) return;
    let collectionDelta = 0;

    const newInvoices = invoices.map(inv => {
      if (inv.id === id) {
        const validAmount = Math.min(amount, inv.remaining_balance);
        const baseDelta = invToBase(validAmount - inv.payment_amount, inv.invoice_rate);
        collectionDelta = collectionRate > 0 ? baseToColl(baseDelta) : baseDelta;

        return {
          ...inv,
          payment_amount: validAmount,
          isSelected: validAmount > 0,
        };
      }
      return inv;
    });

    setInvoices(newInvoices);
    setAmountReceived(prev => Math.max(0, roundMoney(prev + collectionDelta)));
  };

  // Delete a reversed invoice — only allowed when status='reversed'
  const handleDeleteInvoice = (id: string) => {
    const target = invoices.find(inv => inv.id === id);
    if (!target?.isReversed) return;
    setPendingDeleteInvoice({ id, voucherNumber: target.voucher_number });
  };

  const handleDeleteInvoiceConfirm = async () => {
    if (!pendingDeleteInvoice) return;
    const { id, voucherNumber } = pendingDeleteInvoice;
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete invoice: " + error.message);
      return;
    }
    setInvoices(prev => prev.filter(inv => inv.id !== id));
    toast.success(`Reversed invoice ${voucherNumber} deleted.`);
    setPendingDeleteInvoice(null);
  };

  // -- Submission --
  const handleSubmit = async () => {
    if (amountReceived <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    // Belt-and-suspenders: never allow applying a collection to a reversed invoice
    const selectedInvoicesPreCheck = invoices.filter(inv => inv.payment_amount > 0 && inv.isReversed);
    if (selectedInvoicesPreCheck.length > 0) {
      toast.error("Cannot apply a payment to a reversed invoice. Deselect it and try again.");
      return;
    }

    const selectedInvoices = invoices.filter(inv => inv.payment_amount > 0);
    const primaryInvoiceId = selectedInvoices.length === 1 ? selectedInvoices[0].id : undefined;

    const totalApplied = selectedInvoices.reduce((sum, inv) => sum + inv.payment_amount, 0);
    const amountToCredit = amountReceived - totalApplied;

    const submissionNotes = amountToCredit > 0.01
      ? [notes, `Customer credit pending: ${formatCurrency(amountToCredit)} remains unapplied.`].filter(Boolean).join("\n\n")
      : notes;

    // FX guard: USD postings must carry a positive rate.
    let lockedRate: number;
    try {
      lockedRate = resolvePostingRate(collectionCurrency, parseFloat(exchangeRateInput));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid exchange rate");
      return;
    }
    const baseAmount = toBaseAmount({
      amount: amountReceived,
      currency: collectionCurrency,
      exchangeRate: lockedRate,
    });
    const rateDate = (paymentDate || new Date().toISOString()).slice(0, 10);

    // Reconciliation guard: Σ(payment_amount × invoice.exchange_rate) plus any
    // unapplied credit must equal baseAmount within ±₱0.05. Prevents silent
    // cross-currency allocation drift.
    const allocatedBase = selectedInvoices.reduce(
      (sum, inv) => sum + roundMoney(inv.payment_amount * (inv.invoice_rate > 0 ? inv.invoice_rate : 1)),
      0,
    );
    const creditBase = amountToCredit > 0 ? roundMoney(amountToCredit * lockedRate) : 0;
    if (Math.abs((allocatedBase + creditBase) - baseAmount) > 0.05) {
      toast.error("Allocations don't reconcile in PHP — re-allocate before saving.");
      return;
    }

    try {
      setIsSaving(true);

      const linkedBillings: LinkedBilling[] = selectedInvoices.map(inv => ({
        id: inv.id,
        amount: inv.payment_amount
      }));

      const collectionNumber = `COL-${Date.now()}`;
      const { data: created, error: insertErr } = await supabase
        .from('collections')
        .insert({
          id: crypto.randomUUID(),
          collection_number: collectionNumber,
          project_number: project.project_number,
          customer_id: project.customer_id || null,
          customer_name: project.customer_name,
          invoice_id: primaryInvoiceId || null,
          amount: roundMoney(amountReceived),
          currency: collectionCurrency,
          original_currency: collectionCurrency,
          exchange_rate: lockedRate,
          base_currency: FUNCTIONAL_CURRENCY,
          base_amount: baseAmount,
          exchange_rate_date: rateDate,
          payment_method: paymentMethod,
          reference_number: referenceNo || null,
          collection_date: new Date(paymentDate).toISOString(),
          status: 'posted',
          notes: submissionNotes || null,
          created_by: user?.id || null,
          linked_billings: linkedBillings,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertErr) throw new Error(insertErr.message);

      // Create draft journal entry for Accounting to review and post.
      // Total debit/credit are PHP base; the closing posting sheet writes the
      // full FX-balanced lines and any realized FX gain/loss.
      const jeId = `JE-COL-${Date.now()}`;
      await supabase.from("journal_entries").insert({
        id: jeId,
        // entry_number filled by DB trigger (set_journal_entry_number)
        entry_date: new Date().toISOString(),
        collection_id: created.id,
        description: `Collection ${collectionNumber} — ${project.customer_name}`,
        reference: referenceNo || collectionNumber,
        customer_name: project.customer_name || null,
        lines: [],
        total_debit: baseAmount,
        total_credit: baseAmount,
        transaction_currency: collectionCurrency,
        exchange_rate: lockedRate,
        base_currency: FUNCTIONAL_CURRENCY,
        source_amount: roundMoney(amountReceived),
        base_amount: baseAmount,
        exchange_rate_date: rateDate,
        status: "draft",
        created_by: user?.id ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
      logCreation("collection", created.id, created.collection_number ?? created.id, actor);

      toast.success(`Collection ${collectionNumber} recorded successfully!`);

      // Red-dot ping: notify accounting managers + project owner
      const { data: arManagers } = await supabase
        .from('users')
        .select('id')
        .eq('department', 'Accounting')
        .in('role', ['manager', 'executive']);
      const projectOwnerId = (project as any).created_by as string | undefined;
      void recordNotificationEvent({
        actorUserId: user?.id ?? null,
        module: 'accounting',
        subSection: 'collections',
        entityType: 'collection',
        entityId: created.id,
        kind: 'recorded',
        summary: {
          label: `Collection ${collectionNumber} recorded`,
          reference: collectionNumber,
          customer_name: project.customer_name,
          amount: amountReceived,
          currency: collectionCurrency,
        },
        recipientIds: [projectOwnerId, ...(arManagers || []).map((u: any) => u.id)],
      });

      if (user?.id) {
        fireGLPostingTicketOnCollection({
          collectionId: created.id,
          collectionRef: referenceNo || collectionNumber,
          customerName: project.customer_name,
          amount: amountReceived,
          userId: user.id,
          userName: user.name || "Accounting",
          userDept: user.department || "Accounting",
        });
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Submission error:", error);
      toast.error("Failed to record collection: " + (error?.message || "Unknown error"));
    } finally {
      setIsSaving(false);
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
      <div className="flex flex-col h-full bg-[var(--theme-bg-surface)]">
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* 1. Top Form Section */}
            <div className={`bg-[var(--theme-bg-surface)] rounded-xl border border-[var(--theme-border-default)] p-6 ${isReadOnly ? 'pointer-events-none opacity-90' : ''}`}>
              <div className="flex gap-8">
                {/* Left Column: Details */}
                <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-5">
                   {/* Customer */}
                   <div className="col-span-2">
                      <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1.5">Customer</label>
                      <input 
                        type="text" 
                        readOnly 
                        value={project.customer_name}
                        className="w-full px-3.5 py-2.5 bg-[var(--theme-bg-surface-subtle)] border border-[var(--theme-border-default)] rounded-lg text-[var(--theme-text-primary)] text-sm focus:outline-none"
                      />
                   </div>

                   {/* Row 1: Date & Method */}
                   <div>
                      <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1.5">Payment Date</label>
                      <CustomDatePicker 
                        value={paymentDate}
                        onChange={setPaymentDate}
                        className="w-full px-3.5 py-2.5"
                      />
                   </div>

                   <div>
                      <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1.5">Payment Method</label>
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
                      <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1.5">Reference no.</label>
                      <input 
                        type="text" 
                        value={referenceNo}
                        onChange={(e) => setReferenceNo(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-lg text-[var(--theme-text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--theme-action-primary-bg)] focus:border-[var(--theme-action-primary-bg)]"
                        placeholder="e.g. 12345"
                      />
                   </div>

                   <div>
                      <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1.5">Deposit to</label>
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

                   {/* Currency + FX rate */}
                   <div>
                      <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1.5">Currency</label>
                      <CustomDropdown
                        value={collectionCurrency}
                        onChange={(v) => setCollectionCurrency(v as AccountingCurrency)}
                        options={SUPPORTED_ACCOUNTING_CURRENCIES.map((c) => ({ value: c, label: c }))}
                        fullWidth
                      />
                   </div>

                   {collectionCurrency !== FUNCTIONAL_CURRENCY && (
                     <div>
                        <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1.5">
                          {collectionCurrency} → {FUNCTIONAL_CURRENCY} Rate
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          readOnly={isReadOnly}
                          value={exchangeRateInput}
                          onChange={(e) => setExchangeRateInput(e.target.value)}
                          placeholder="e.g. 58.25"
                          className="w-full px-3.5 py-2.5 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-lg text-[var(--theme-text-primary)] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[var(--theme-action-primary-bg)] focus:border-[var(--theme-action-primary-bg)]"
                        />
                     </div>
                   )}
                </div>

                {/* Right Column: Amount Received */}
                <div className="w-[300px] flex flex-col justify-start pt-1">
                   <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1.5">
                     Amount Received ({collectionCurrency})
                   </label>
                   <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)] font-medium text-lg">{collectionCurrency === "USD" ? "$" : "₱"}</span>
                      <input
                        type="number"
                        value={amountReceived || ""}
                        onChange={(e) => handleAmountReceivedChange(e.target.value)}
                        className="w-full pl-10 pr-4 py-4 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-lg text-2xl font-bold text-[var(--theme-action-primary-bg)] placeholder-[var(--theme-border-default)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)] focus:border-transparent"
                        placeholder="0.00"
                      />
                   </div>
                   {collectionCurrency !== FUNCTIONAL_CURRENCY && (() => {
                     const r = parseFloat(exchangeRateInput);
                     if (!Number.isFinite(r) || r <= 0 || amountReceived <= 0) return null;
                     return (
                       <p className="text-xs text-[var(--theme-text-muted)] mt-2">
                         ≈ {formatMoney(amountReceived * r, FUNCTIONAL_CURRENCY)} @ rate {r}
                       </p>
                     );
                   })()}
                   <p className="text-xs text-[var(--theme-text-muted)] mt-2">
                      {isReadOnly 
                        ? "Total amount for this collection record." 
                        : "Enter the total amount received. It will be automatically applied to the oldest invoices first, or you can manually select below."
                      }
                   </p>
                </div>
              </div>
            </div>

            {/* 2. Outstanding Transactions Table */}
            <div className="bg-[var(--theme-bg-surface)] rounded-xl border border-[var(--theme-border-default)] overflow-hidden flex flex-col min-h-[400px]">
              <div className="px-6 py-4 border-b border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] flex justify-between items-center">
                <h3 className="text-sm font-bold text-[var(--theme-text-primary)] uppercase tracking-wide">
                  {mode === 'view' ? "Linked Invoices" : "Outstanding Transactions"}
                </h3>
                <span className="text-xs text-[var(--theme-text-muted)] font-medium">
                  {invoices.filter(inv => !inv.isReversed).length} {mode === 'view' ? "linked" : "open"} invoices
                  {invoices.some(inv => inv.isReversed) && (
                    <span className="ml-2 text-red-400">
                      · {invoices.filter(inv => inv.isReversed).length} reversed
                    </span>
                  )}
                </span>
              </div>

              {invoices.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-[var(--theme-text-muted)]">
                  <p>{mode === 'view' ? "No invoices linked to this collection." : "No open invoices found."}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[var(--theme-bg-surface)] border-b border-[var(--theme-border-default)]">
                      <tr>
                        <th className="px-6 py-3 w-12 text-center">
                           <div className="w-5 h-5 rounded border border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] flex items-center justify-center opacity-50 cursor-not-allowed">
                           </div>
                        </th>
                        <th className="px-6 py-3 text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-wider">Description</th>
                        <th className="px-6 py-3 text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-wider">Due Date</th>
                        <th className="px-6 py-3 text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-wider text-right">Original Amount</th>
                        <th className="px-6 py-3 text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-wider text-right">
                          {mode === 'view' ? "Balance" : "Open Balance"}
                        </th>
                        <th className="px-6 py-3 text-xs font-semibold text-[var(--theme-text-muted)] uppercase tracking-wider text-right w-48">Payment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--neuron-pill-inactive-bg)]">
                      {invoices.map((inv) => (
                        <tr
                          key={inv.id}
                          className={`transition-colors ${
                            inv.isReversed
                              ? "opacity-60 bg-[var(--theme-bg-surface-subtle)]"
                              : `hover:bg-[var(--theme-bg-surface-subtle)] ${inv.isSelected ? "bg-[var(--theme-bg-surface-tint)]" : ""}`
                          } ${isReadOnly ? 'pointer-events-none' : ''}`}
                          onClick={(e) => {
                            if (!isReadOnly && !inv.isReversed) {
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
                                  if (!isReadOnly && !inv.isReversed) toggleInvoice(inv.id);
                                }}
                                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors mx-auto ${
                                  inv.isReversed
                                    ? "bg-[var(--theme-bg-surface-subtle)] border-[var(--theme-border-default)] cursor-not-allowed"
                                    : inv.isSelected
                                      ? "bg-[var(--theme-action-primary-bg)] border-[var(--theme-action-primary-bg)] cursor-pointer"
                                      : "bg-[var(--theme-bg-surface)] border-[var(--theme-border-default)] hover:border-[var(--theme-action-primary-bg)] cursor-pointer"
                                }`}
                              >
                                {inv.isSelected && !inv.isReversed && <Check size={14} className="text-white" strokeWidth={3} />}
                              </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-[var(--theme-text-primary)]">{inv.voucher_number}</span>
                              {inv.isReversed && (
                                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-[var(--theme-status-danger-bg)] text-[var(--theme-status-danger-fg)] rounded uppercase tracking-wide">
                                  Reversed
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[var(--theme-text-muted)]">{inv.description}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-[var(--theme-text-secondary)]">
                            {new Date(inv.due_date).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-sm text-[var(--theme-text-secondary)] text-right">
                            {formatCurrency(inv.amount)}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-[var(--theme-text-primary)] text-right">
                            {mode === 'view' ? "-" : inv.isReversed ? "—" : formatCurrency(inv.remaining_balance)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {inv.isReversed ? (
                              !isReadOnly && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteInvoice(inv.id); }}
                                  title="Delete reversed invoice"
                                  className="ml-auto flex items-center justify-center w-8 h-8 rounded-md text-red-400 hover:text-[var(--theme-status-danger-fg)] hover:bg-[var(--theme-status-danger-bg)] transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )
                            ) : (
                              <input
                                type="number"
                                value={inv.payment_amount > 0 ? inv.payment_amount : ""}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => handleInvoicePaymentChange(inv.id, parseFloat(e.target.value) || 0)}
                                readOnly={isReadOnly}
                                className={`w-full text-right px-3 py-2 border rounded-md text-sm outline-none transition-all ${
                                  inv.isSelected
                                    ? "border-[var(--theme-action-primary-bg)] ring-1 ring-[#0F766E] font-bold text-[var(--theme-action-primary-bg)] bg-[var(--theme-bg-surface)]"
                                    : "border-[var(--theme-border-default)] text-[var(--theme-text-secondary)] bg-transparent"
                                }`}
                                placeholder="0.00"
                              />
                            )}
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
                   <label className="block text-sm font-medium text-[var(--theme-text-primary)] mb-1.5">Memo</label>
                   <textarea
                     value={notes}
                     onChange={(e) => setNotes(e.target.value)}
                     className="w-full px-3.5 py-2.5 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-lg text-[var(--theme-text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--theme-action-primary-bg)]"
                     placeholder="Notes..."
                     rows={3}
                   />
                </div>

                {/* Summary Metrics */}
                <div className="flex flex-col justify-end gap-3">
                   <div className="flex justify-between items-center text-sm">
                      <span className="text-[var(--theme-text-secondary)]">Amount to Apply:</span>
                      <span className="font-semibold text-[var(--theme-text-primary)]">{formatCurrency(totalApplied)}</span>
                   </div>
                   <div className="flex justify-between items-center text-sm">
                      <span className="text-[var(--theme-text-secondary)]">Amount to Credit:</span>
                      <span className="font-semibold text-[var(--theme-text-primary)]">{formatCurrency(amountToCredit)}</span>
                   </div>
                   <div className="h-px bg-[var(--theme-bg-surface-tint)] my-1"></div>
                   <div className="flex justify-between items-center">
                      <span className="text-base font-bold text-[var(--theme-text-primary)]">Total Received:</span>
                      <span className="text-xl font-bold text-[var(--theme-action-primary-bg)]">{formatCurrency(amountReceived)}</span>
                   </div>
                </div>
            </div>

          </div>
        </div>

        {/* Action Bar */}
        {!isReadOnly && (
          <div className="px-8 py-5 bg-[var(--theme-bg-surface)] border-t border-[var(--theme-border-default)] flex justify-end gap-3 shrink-0">
             <button
               onClick={onClose}
               className="px-4 py-2 text-sm font-medium text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-surface-subtle)] rounded-lg transition-colors"
             >
               Cancel
             </button>
             <button
               onClick={handleSubmit}
               disabled={isSaving || amountReceived <= 0}
               className={`px-6 py-2 text-sm font-bold text-white rounded-lg shadow-sm flex items-center gap-2 transition-all ${
                 isSaving || amountReceived <= 0 
                   ? "bg-[var(--theme-text-muted)] cursor-not-allowed opacity-60"
                   : "bg-[var(--theme-action-primary-bg)] hover:opacity-90 hover:shadow-md"
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
      <NeuronModal
        isOpen={!!pendingDeleteInvoice}
        onClose={() => setPendingDeleteInvoice(null)}
        title={`Delete reversed invoice "${pendingDeleteInvoice?.voucherNumber ?? ''}"?`}
        description="This permanently removes the record and cannot be undone."
        confirmLabel="Delete Invoice"
        onConfirm={handleDeleteInvoiceConfirm}
        variant="danger"
      />
    </SidePanel>
  );
}
