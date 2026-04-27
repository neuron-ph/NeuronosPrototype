import { X, Plus, Printer, Download, Calendar as CalendarIcon, CreditCard, Clock, Tag, ChevronDown, ChevronRight, RefreshCw, FileText, Banknote, Receipt, ArrowRight, CheckSquare, Square, Loader2, Save, Zap, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { NeuronLogo } from "../NeuronLogo";
import { CustomDropdown } from "../bd/CustomDropdown";
import { CatalogItemCombobox } from "../shared/pricing/CatalogItemCombobox";
import { CategoryDropdown } from "../pricing/quotations/CategoryDropdown";
import type { EVoucher, EVoucherTransactionType, LinkedBilling } from "../../types/evoucher";
import { useEVoucherSubmit } from "../../hooks/useEVoucherSubmit";
import { useUser } from "../../hooks/useUser";
import { supabase } from "../../utils/supabase/client";
import { getAccounts } from "../../utils/accounting-api";
import type { Account } from "../../types/accounting-core";
import { canDeleteEVoucher } from "../../utils/permissions";
import { toast } from "sonner@2.0.3";

interface LineItem {
  id: string;
  particular: string;
  description: string;
  amount: number;
  catalog_item_id?: string | null;
}

interface CategorySection {
  id: string;
  category_name: string;
  catalog_category_id?: string;
  expanded: boolean;
  items: LineItem[];
}

interface AddRequestForPaymentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void; // Called after successful save to backend
  onSave?: (expenseData: any) => void | Promise<void>; // Alias for onSuccess, used by some callers
  onSaveDraft?: (draftData: any) => void | Promise<void>; // Draft save callback
  context?: "bd" | "accounting" | "operations" | "collection" | "billing" | "personal"; // Extended to support all E-Voucher types
  defaultRequestor?: string; // For pre-filling requestor name
  mode?: "create" | "view"; // View mode for displaying existing expense
  existingData?: EVoucher; // Pre-fill data when in view mode
  initialValues?: Partial<EVoucher>; // Pre-fill data for new creation (e.g. converting expense to billing)
  bookingId?: string; // For auto-linking to specific booking (from Operations modules)
  projectNumber?: string; // Optional container reference shown alongside a real booking link
  bookingType?: "forwarding" | "brokerage" | "trucking" | "marine-insurance" | "others";
  onExpenseCreated?: () => void; // Callback after expense is created (used by Operations)
  footerActions?: React.ReactNode; // Custom footer actions for view mode
}


type PaymentMethod = 
  | "Cash"
  | "Bank Transfer"
  | "Online Payment"
  | "Cash Deposit"
  | "Check Deposit"
  | "Manager's Check"
  | "E-Wallets";

type CreditTerm = "None" | "Net7" | "Net15" | "Net30";

// UI Subtypes for Operations/Accounting to distinguish between expense types
type TransactionSubtype = "regular_expense" | "billable_expense" | "cash_advance";

const PAYMENT_METHODS: PaymentMethod[] = [
  "Cash",
  "Bank Transfer",
  "Online Payment",
  "Cash Deposit",
  "Check Deposit",
  "Manager's Check",
  "E-Wallets"
];

const CREDIT_TERMS: CreditTerm[] = ["None", "Net7", "Net15", "Net30"];

export function AddRequestForPaymentPanel({ 
  isOpen, 
  onClose, 
  onSuccess,
  context = "bd",
  defaultRequestor,
  mode,
  existingData,
  initialValues,
  bookingId,
  projectNumber: lockedProjectNumber,
  bookingType,
  onExpenseCreated,
  footerActions
}: AddRequestForPaymentPanelProps) {
  // View mode specific state
  const isViewMode = mode === "view";

  // Get current user for requestor name
  const { user } = useUser();
  
  const currentActor = user
    ? {
        id: user.id,
        name: user.name,
        department: user.department,
      }
    : undefined;
  const existingCreatorId =
    (existingData as (EVoucher & { created_by?: string }) | undefined)?.created_by ??
    existingData?.requestor_id;
  const canDeleteExistingVoucher = canDeleteEVoucher(
    existingData?.status,
    existingCreatorId,
    user?.id,
    user?.role ?? "",
    user?.department ?? "",
  );

  // Use the custom hook for E-Voucher submission
  const { createDraft, submitForApproval, autoApprove, deleteEVoucher, isSaving } = useEVoucherSubmit(context, currentActor);
  
  // Form state
  const [transactionType, setTransactionType] = useState<EVoucherTransactionType>("expense");
  const [transactionSubtype, setTransactionSubtype] = useState<TransactionSubtype>("regular_expense");
  
  const [requestName, setRequestName] = useState("");
  const [projectNumber, setProjectNumber] = useState("");
  const [categorySections, setCategorySections] = useState<CategorySection[]>([]);
  const [showAddCategoryDropdown, setShowAddCategoryDropdown] = useState(false);
  const [preferredPayment, setPreferredPayment] = useState<PaymentMethod>("Bank Transfer");
  const [vendor, setVendor] = useState("");
  const [creditTerms, setCreditTerms] = useState<CreditTerm>("None");
  const [paymentSchedule, setPaymentSchedule] = useState("");
  const [notes, setNotes] = useState("");
  
  // New State for Collections
  const [linkedBillings, setLinkedBillings] = useState<LinkedBilling[]>([]);
  const [availableStatements, setAvailableStatements] = useState<any[]>([]);
  const [isLoadingStatements, setIsLoadingStatements] = useState(false);
  const [selectedStatementRef, setSelectedStatementRef] = useState<string>("");

  // Bank/Cash Accounts
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [sourceAccountId, setSourceAccountId] = useState("");

  // Fetch Accounts (Assets Only)
  useEffect(() => {
    let cancelled = false;
    const loadAccounts = async () => {
      try {
        const allAccounts = await getAccounts();
        if (!cancelled) {
          const assetAccounts = allAccounts.filter(a => a.type === 'Asset' && !a.is_folder);
          setAccounts(assetAccounts);
        }
      } catch (e) {
        console.error("Failed to load accounts", e);
        if (!cancelled) toast.error("Failed to load bank/cash accounts");
      }
    };
    loadAccounts();
    return () => { cancelled = true; };
  }, []);

  // Initialize Transaction Type based on Context
  useEffect(() => {
    if (context === "bd") {
      setTransactionType("budget_request");
    } else if (context === "collection") {
      setTransactionType("collection" as any);
    } else if (context === "billing") {
      setTransactionType("billing" as any);
    } else if (context === "operations") {
      // Operations defaults to expense, but allows switching to cash_advance
      setTransactionType("expense");
    } else if (context === "accounting") {
      setTransactionType("expense");
    } else if (context === "personal") {
      // My E-Vouchers: defaults to reimbursement, can switch to direct_expense
      setTransactionType("reimbursement");
    }
  }, [context]);

  // Pre-fill data if in view mode OR if initialValues provided
  useEffect(() => {
    const dataToLoad = mode === "view" ? existingData : initialValues;
    
    if (dataToLoad) {
      if (dataToLoad.transaction_type) {
        setTransactionType(dataToLoad.transaction_type);
        // Infer subtype if possible
        if (dataToLoad.transaction_type === "budget_request" && context !== "bd") {
          setTransactionSubtype("cash_advance");
        } else if (dataToLoad.is_billable || (dataToLoad.source_type === 'billable_expense')) {
          setTransactionSubtype("billable_expense");
        } else {
          setTransactionSubtype("regular_expense");
        }
      }
      
      setRequestName(dataToLoad.purpose || dataToLoad.description || "");
      // Only set category if provided, otherwise let defaults logic handle it
      if (dataToLoad.project_number) setProjectNumber(dataToLoad.project_number || "");

      // Handle line items — prefer relational, fall back to JSONB
      const lineItemsSource = (dataToLoad as any).evoucher_line_items?.length
        ? (dataToLoad as any).evoucher_line_items
        : dataToLoad.line_items;
      if (lineItemsSource && lineItemsSource.length > 0) {
        // Group by catalog_snapshot.category_name, fall back to gl_category
        const fallbackCat = dataToLoad.expense_category || dataToLoad.gl_category || "Expenses";
        const groupMap: Record<string, { name: string; items: LineItem[] }> = {};
        lineItemsSource.forEach((item: any) => {
          const catName = item.catalog_snapshot?.category_name || fallbackCat;
          if (!groupMap[catName]) groupMap[catName] = { name: catName, items: [] };
          groupMap[catName].items.push({
            id: item.id,
            particular: item.particular || "",
            description: item.description || "",
            amount: item.amount || 0,
            catalog_item_id: item.catalog_item_id || undefined,
          });
        });
        setCategorySections(Object.values(groupMap).map((g, i) => ({
          id: `loaded-${i}`,
          category_name: g.name,
          expanded: true,
          items: g.items,
        })));
      } else if (dataToLoad.amount) {
        // Create single section from total amount
        const fallbackCat = dataToLoad.expense_category || dataToLoad.gl_category || "Expenses";
        setCategorySections([{ id: "loaded-0", category_name: fallbackCat, expanded: true, items: [{
            id: "1",
            particular: dataToLoad.purpose || "Service Fee",
            description: dataToLoad.description || "",
            amount: dataToLoad.amount,
        }]}]);
      }

      if (dataToLoad.payment_method) setPreferredPayment((dataToLoad.payment_method as PaymentMethod) || "Bank Transfer");
      if (dataToLoad.vendor_name) setVendor(dataToLoad.vendor_name || "");
      if (dataToLoad.credit_terms) setCreditTerms((dataToLoad.credit_terms as CreditTerm) || "None");
      if (dataToLoad.due_date) setPaymentSchedule(dataToLoad.due_date || "");
      if (dataToLoad.notes) setNotes(dataToLoad.notes || "");
      if (dataToLoad.source_account_id) setSourceAccountId(dataToLoad.source_account_id || "");
      
      if (dataToLoad.linked_billings) setLinkedBillings(dataToLoad.linked_billings);
    }
  }, [mode, existingData, initialValues, context]);

  // Operations flows may lock both booking linkage and the visible project reference.
  useEffect(() => {
    if (bookingId || lockedProjectNumber) {
      setProjectNumber(lockedProjectNumber || "");

    }
  }, [bookingId, bookingType, lockedProjectNumber, transactionType]);
  
  // Fetch Open Statements when in Collection Mode
  useEffect(() => {
    if (transactionType === "collection" && !isViewMode) {
      fetchOpenStatements();
    }
  }, [transactionType, isViewMode, projectNumber]); // Re-fetch if project number changes
  
  const fetchOpenStatements = async () => {
    try {
      setIsLoadingStatements(true);
      const { data: evoucherRows, error: fetchError } = await supabase
        .from('evouchers')
        .select('*')
        .eq('transaction_type', 'billing');
      
      if (!fetchError && evoucherRows) {
          let billings = evoucherRows;
          
          // Filter by project if projectNumber is set
          if (projectNumber) {
            billings = billings.filter((b: any) => b.project_number === projectNumber);
          }
          
          // Group by Statement Reference
          // Only include items that are billed and have balance
          const grouped = billings.reduce((acc: any, curr: any) => {
            if (curr.statement_reference && curr.billing_status === "billed") {
              const ref = curr.statement_reference;
              if (!acc[ref]) {
                acc[ref] = {
                  ref,
                  items: [],
                  totalAmount: 0,
                  remainingBalance: 0,
                  project: curr.project_number,
                  client: curr.vendor_name
                };
              }
              acc[ref].items.push(curr);
              acc[ref].totalAmount += curr.amount || 0;
              acc[ref].remainingBalance += (curr.remaining_balance ?? curr.amount) || 0;
            }
            return acc;
          }, {});
          
          const statements = Object.values(grouped).filter((s: any) => s.remainingBalance > 1); // Ignore small balances
          setAvailableStatements(statements);
        }
    } catch (error) {
      console.error("Error fetching statements:", error);
    } finally {
      setIsLoadingStatements(false);
    }
  };
  
  const handleStatementSelect = (statement: any) => {
    setSelectedStatementRef(statement.ref);
    setRequestName(`Payment for ${statement.ref}`);
    setVendor(statement.client || "");
    setProjectNumber(statement.project || "");
    
    // Create single collection section
    setCategorySections([{
      id: "collection-1",
      category_name: "Collection",
      expanded: true,
      items: [{ id: "1", particular: `Payment for Statement ${statement.ref}`, description: `${statement.items.length} items linked`, amount: statement.remainingBalance }],
    }]);
    
    // Create Links
    const links: LinkedBilling[] = statement.items.map((item: any) => ({
      id: item.id,
      amount: item.remaining_balance ?? item.amount
    }));
    setLinkedBillings(links);
  };

  // Generate today's date and EVRN number
  const today = new Date();
  const todayFormatted = today.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  });
  
  // Generate EVRN: EVRNYYYYMM001 format
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const evrnNumber = `EVRN${year}${month}${day}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

  // Derived flat line items for submission
  const allLineItems: (LineItem & { expense_category: string; catalog_category_id?: string })[] = categorySections.flatMap(s =>
    s.items.map(item => ({ ...item, expense_category: s.category_name, catalog_category_id: s.catalog_category_id }))
  );
  const expenseCategory = categorySections[0]?.category_name || "";
  const totalAmount = allLineItems.reduce((sum, item) => sum + (item.amount || 0), 0);

  const handleAddSection = (name: string, catalogCategoryId?: string) => {
    const newSection: CategorySection = {
      id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category_name: name,
      catalog_category_id: catalogCategoryId,
      expanded: true,
      items: [{ id: `item-${Date.now()}`, particular: "", description: "", amount: 0 }],
    };
    setCategorySections(prev => [...prev, newSection]);
  };

  const handleDeleteSection = (sectionId: string) => {
    setCategorySections(prev => prev.filter(s => s.id !== sectionId));
  };

  const toggleSection = (sectionId: string) => {
    setCategorySections(prev => prev.map(s => s.id === sectionId ? { ...s, expanded: !s.expanded } : s));
  };

  const handleAddItemToSection = (sectionId: string) => {
    const newItem: LineItem = { id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, particular: "", description: "", amount: 0 };
    setCategorySections(prev => prev.map(s => s.id === sectionId ? { ...s, items: [...s.items, newItem] } : s));
  };

  const handleRemoveItemFromSection = (sectionId: string, itemId: string) => {
    setCategorySections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      if (s.items.length <= 1) return s; // keep at least one row
      return { ...s, items: s.items.filter(i => i.id !== itemId) };
    }));
  };

  const handleItemChange = (sectionId: string, itemId: string, field: string, value: any) => {
    setCategorySections(prev => prev.map(s =>
      s.id === sectionId
        ? { ...s, items: s.items.map(i => i.id === itemId ? { ...i, [field]: value } : i) }
        : s
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Don't submit if in view mode
    if (isViewMode) {
      return;
    }
    
    try {
      // Prepare form data
      const formData = {
        transactionType,
        transactionSubtype,
        requestName,
        expenseCategory,
        subCategory: "",
        projectNumber,
        lineItems: allLineItems,
        totalAmount,
        preferredPayment,
        vendor,
        creditTerms,
        paymentSchedule,
        notes,
        requestor: defaultRequestor || user?.name || "Current User",
        bookingId,
        isBillable: transactionSubtype === "billable_expense",
        linkedBillings: isCollectionMode ? linkedBillings : undefined,
        sourceAccountId: sourceAccountId || undefined
      };

      // Use the hook's submitForApproval function (creates + submits in one go)
      await submitForApproval(formData);
      
      // Call new success callback
      onSuccess?.();
      
      // Call Operations callback if provided
      onExpenseCreated?.();
      
      // Close and reset form
      handleClose();
    } catch (error) {
      // Error already handled by the hook (toast shown)
      console.error('Form submission error:', error);
    }
  };

  const handleSaveDraft = async () => {
    if (isViewMode) {
      return;
    }
    
    try {
      // Prepare form data
      const formData = {
        transactionType,
        transactionSubtype,
        requestName,
        expenseCategory,
        subCategory,
        projectNumber,
        lineItems,
        totalAmount,
        preferredPayment,
        vendor,
        creditTerms,
        paymentSchedule,
        notes,
        requestor: defaultRequestor || user?.name || "Current User",
        bookingId,
        isBillable: transactionSubtype === "billable_expense",
        linkedBillings: isCollectionMode ? linkedBillings : undefined,
        sourceAccountId: sourceAccountId || undefined
      };

      // Use the hook's createDraft function
      await createDraft(formData);
      
      // Call new success callback
      onSuccess?.();
      
      // Close and reset form
      handleClose();
    } catch (error) {
      // Error already handled by the hook (toast shown)
      console.error('Draft save error:', error);
    }
  };

  const handleAutoApprove = async () => {
    if (isViewMode) return;

    try {
      // Prepare form data
      const formData = {
        transactionType,
        transactionSubtype,
        requestName,
        expenseCategory,
        subCategory,
        projectNumber,
        lineItems,
        totalAmount,
        preferredPayment,
        vendor,
        creditTerms,
        paymentSchedule,
        notes,
        requestor: defaultRequestor || user?.name || "Current User",
        bookingId,
        isBillable: transactionSubtype === "billable_expense",
        linkedBillings: isCollectionMode ? linkedBillings : undefined,
        sourceAccountId: sourceAccountId || undefined
      };

      // Use the hook's autoApprove function
      await autoApprove(formData);
      
      // Call success callback
      onSuccess?.();
      
      // Close and reset form
      handleClose();
    } catch (error) {
      console.error('Auto-approve error:', error);
    }
  };

  const handleClose = () => {
    onClose();
    // Reset form
    setRequestName("");
    setProjectNumber("");
    setCategorySections([]);
    setPreferredPayment("Bank Transfer");
    setVendor("");
    setCreditTerms("None");
    setPaymentSchedule("");
    setNotes("");
    setTransactionSubtype("regular_expense");
    setLinkedBillings([]);
    setSelectedStatementRef("");
    setSourceAccountId("");
  };

  const handleDelete = async () => {
    if (!existingData?.id) return;
    
    // Safety check: Confirm deletion
    const status = existingData.status?.toLowerCase();
    const isPosted = status === "posted" || status === "paid";
    
    const confirmMessage = isPosted 
      ? "⚠️ WARNING: This record is already POSTED to the ledger.\n\nDeleting it may cause accounting inconsistencies.\n\nAre you sure you want to force delete?"
      : "Are you sure you want to delete this record?\n\nThis action cannot be undone.";

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const success = await deleteEVoucher(existingData.id);
      if (success) {
        onSuccess?.(); // Refresh parent list
        handleClose();
      }
    } catch (e) {
      // Error handled by hook
    }
  };

  if (!isOpen) return null;

  const isFormValid =
    requestName.trim() !== "" &&
    (isCollectionMode || categorySections.some(s => s.items.some(item => item.particular.trim() !== "" && item.amount > 0))) &&
    vendor.trim() !== "";

  // Context-aware labels
  const isAccounting = context === "accounting";
  const isOperations = context === "operations";
  const isBD = context === "bd";
  const isCollection = context === "collection";
  const isBilling = context === "billing";
  
  // Logic for UI State
  const isExpense = transactionType === "expense";
  const isBudgetRequest = transactionType === "budget_request";
  const isCashAdvance = transactionType === "cash_advance";
  const isReimbursement = transactionType === "reimbursement";
  const isDirectExpense = transactionType === "direct_expense";
  const isCollectionMode = (transactionType as string) === "collection";
  const isBillingMode = (transactionType as string) === "billing";
  const isPersonal = context === "personal";
  
  // Derived state for labels
  let panelTitle = "Request For Payment";
  let panelDescription = "Create a new transaction record";
  let vendorLabel = "Vendor / Payee";
  let categoryLabel = "Expense Category";
  
  if (isCollectionMode) {
    panelTitle = "New Collection Voucher";
    panelDescription = "Record a payment collection from customers";
    vendorLabel = "Received From (Payer)";
    categoryLabel = "Collection Category";
  } else if (isBillingMode) {
    panelTitle = "New Billing Voucher";
    panelDescription = "Create a new invoice/billing voucher";
    vendorLabel = "Bill To (Client)";
    categoryLabel = "Revenue Category";
  } else if (isBudgetRequest) {
    panelTitle = "New Budget Request";
    panelDescription = "Request funds for operational expenses (Revolving Fund)";
    vendorLabel = "Payable To";
    categoryLabel = "Budget Category";
  } else if (isCashAdvance) {
    panelTitle = "Cash Advance Request";
    panelDescription = "Request cash advance for operations/staff";
    vendorLabel = "Payable To (Employee)";
    categoryLabel = "Expense Category";
  } else if (transactionType === "reimbursement") {
    panelTitle = "Reimbursement Request";
    panelDescription = "Request reimbursement for out-of-pocket expenses";
    vendorLabel = "Paid To (Vendor)";
    categoryLabel = "Expense Category";
  } else if (transactionType === "direct_expense") {
    panelTitle = "Direct Expense Request";
    panelDescription = "Request a direct purchase (not tied to a booking)";
    vendorLabel = "Vendor / Payee";
    categoryLabel = "Expense Category";
  } else {
    // Regular Expense
    panelTitle = transactionSubtype === "billable_expense" ? "New Billable Expense" : "New Expense Voucher";
    panelDescription = transactionSubtype === "billable_expense"
      ? "Record an expense to be charged to the client"
      : "Record a direct expense entry";
    vendorLabel = "Vendor / Payee";
    categoryLabel = "Expense Category";
  }

  // Override labels for view mode
  const viewPanelTitle = isAccounting ? "Expense Details" : "Transaction Details";
  const viewPanelDescription = "View complete details and workflow history";
  
  // Use view labels if in view mode
  const finalPanelTitle = isViewMode ? viewPanelTitle : panelTitle;
  const finalPanelDescription = isViewMode ? viewPanelDescription : panelDescription;

  // Get status color for view mode
  const getStatusColor = (status: string) => {
    switch (status) {
      case "Approved":
      case "posted":
        return { bg: "var(--theme-bg-surface-tint)", color: "var(--theme-action-primary-bg)" };
      case "Disbursed":
      case "Audited":
        return { bg: "var(--theme-status-success-bg)", color: "var(--theme-status-success-fg)" };
      case "Disapproved":
      case "rejected":
      case "cancelled":
        return { bg: "var(--theme-status-danger-bg)", color: "var(--theme-status-danger-fg)" };
      case "Under Review":
      case "pending":
      case "Processing":
        return { bg: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)" };
      case "Submitted":
        return { bg: "var(--theme-bg-surface-subtle)", color: "var(--theme-text-muted)" };
      default: // Draft
        return { bg: "var(--theme-bg-page)", color: "var(--theme-text-muted)" };
    }
  };

  const statusStyle = existingData ? getStatusColor(existingData.status) : null;

  // Get formatted date for view mode
  const formattedDate = existingData 
    ? new Date(existingData.request_date || existingData.created_at).toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric"
      })
    : todayFormatted;

  const displayEvrnNumber = existingData?.voucher_number || evrnNumber;
  const displayRequestor = existingData?.requestor_name || defaultRequestor || user?.name || "Current User";

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black z-40"
        onClick={handleClose}
        style={{ 
          backdropFilter: "blur(2px)",
          backgroundColor: "rgba(18, 51, 43, 0.15)"
        }}
      />

      {/* Slide-out Panel */}
      <motion.div
        initial={{ x: "100%", opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: "100%", opacity: 0 }}
        transition={{ 
          type: "spring",
          damping: 30,
          stiffness: 300,
          duration: 0.3
        }}
        className="fixed right-0 top-0 h-full w-[920px] bg-[var(--theme-bg-surface)] shadow-2xl z-50 flex flex-col"
        style={{
          borderLeft: "1px solid var(--neuron-ui-border)",
        }}
      >
        {/* Header */}
        <div 
          style={{
            padding: "24px 48px",
            borderBottom: "1px solid var(--neuron-ui-border)",
            backgroundColor: "var(--theme-bg-surface)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
                <h2 style={{ fontSize: "20px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                  {finalPanelTitle}
                </h2>
                {/* Status Badge - Only in View Mode */}
                {isViewMode && existingData && (
                  <span style={{
                    padding: "4px 12px",
                    fontSize: "12px",
                    fontWeight: 600,
                    backgroundColor: statusStyle?.bg,
                    color: statusStyle?.color,
                    borderRadius: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px"
                  }}>
                    {existingData.status}
                  </span>
                )}
              </div>
              <p style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
                {finalPanelDescription}
              </p>
            </div>
            <button
              onClick={handleClose}
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "transparent",
                color: "var(--theme-text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Form Content - Scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "32px 48px" }}>
          <form onSubmit={handleSubmit} id="rfp-form">
            {/* Header Section with Logo */}
            <div style={{ 
              display: "flex", 
              alignItems: "flex-start", 
              justifyContent: "space-between",
              marginBottom: "32px",
              paddingBottom: "24px",
              borderBottom: "1px solid var(--theme-border-default)"
            }}>
              <div style={{ marginBottom: "12px" }}>
                <NeuronLogo height={32} />
              </div>
              
              <div style={{ textAlign: "right" }}>
                <h1 style={{ 
                  fontSize: "20px", 
                  fontWeight: 700, 
                  color: "var(--theme-text-primary)",
                  letterSpacing: "0.5px",
                  marginBottom: "16px"
                }}>
                  {transactionType === "billing" ? "INVOICE / BILLING" : 
                   transactionType === "collection" ? "COLLECTION RECEIPT" :
                   "PAYMENT VOUCHER"}
                </h1>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div>
                    <span style={{ 
                      fontSize: "11px", 
                      fontWeight: 500, 
                      color: "var(--theme-text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      display: "block",
                      marginBottom: "4px"
                    }}>
                      Date
                    </span>
                    <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      {formattedDate}
                    </span>
                  </div>
                  <div>
                    <span style={{ 
                      fontSize: "11px", 
                      fontWeight: 500, 
                      color: "var(--theme-text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      display: "block",
                      marginBottom: "4px"
                    }}>
                      Ref No.
                    </span>
                    <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--theme-action-primary-bg)" }}>
                      {displayEvrnNumber}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Request Information Section */}
            <div style={{ marginBottom: "32px" }}>
              <h3 style={{ 
                fontSize: "14px", 
                fontWeight: 600, 
                color: "var(--theme-text-primary)", 
                marginBottom: "16px",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                {isBillingMode ? "Billing Details" : 
                 isCollectionMode ? "Payment Details" : 
                 "Transaction Details"}
              </h3>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                
                {/* Collection Mode: Statement Picker */}
                {isCollectionMode && !isViewMode && (
                   <div style={{ marginBottom: "8px" }}>
                      <label style={{ 
                        display: "block", fontSize: "12px", fontWeight: 500, color: "var(--theme-text-secondary)", marginBottom: "8px" 
                      }}>
                        Link to Statement / Invoice <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>
                      </label>
                      <div className="relative">
                        <select
                          value={selectedStatementRef}
                          onChange={(e) => {
                             const stmt = availableStatements.find(s => s.ref === e.target.value);
                             if (stmt) handleStatementSelect(stmt);
                          }}
                          className="w-full px-3 py-2.5 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]"
                          disabled={isLoadingStatements}
                        >
                          <option value="">Select an open statement...</option>
                          {availableStatements.map((stmt) => (
                             <option key={stmt.ref} value={stmt.ref}>
                                {stmt.ref} — {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(stmt.remainingBalance)} (Client: {stmt.client || "Unknown"})
                             </option>
                          ))}
                        </select>
                        {isLoadingStatements && (
                          <div className="absolute right-3 top-2.5">
                            <Loader2 className="animate-spin text-[var(--theme-text-muted)]" size={16} />
                          </div>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-[var(--theme-text-muted)]">
                        Selecting a statement will auto-populate the details.
                      </p>
                   </div>
                )}

                {/* Description / Purpose + Transaction Type on one row */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: (context === "operations" || context === "accounting" || context === "personal") ? "2fr 1fr" : "1fr",
                  gap: "16px"
                }}>
                  {/* Request Name */}
                  <div>
                    <label style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--theme-text-secondary)",
                      marginBottom: "8px"
                    }}>
                      {isBillingMode ? "Billing Description / Title" :
                       isCollectionMode ? "Collection Reference / Title" :
                       "Description / Purpose"} {!isViewMode && <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>}
                    </label>
                    <input
                      type="text"
                      required={!isViewMode}
                      readOnly={isViewMode}
                      value={requestName}
                      onChange={(e) => !isViewMode && setRequestName(e.target.value)}
                      placeholder={isBillingMode ? "e.g., Import Brokerage Services - Ref 12345" : "e.g., Office Supplies, Cash Advance for Docking"}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        fontSize: "14px",
                        border: "1px solid var(--theme-border-default)",
                        borderRadius: "6px",
                        outline: "none",
                        transition: "all 0.2s",
                        backgroundColor: isViewMode ? "var(--theme-bg-surface-subtle)" : "var(--theme-bg-surface)",
                        color: isViewMode ? "var(--theme-text-secondary)" : "inherit",
                        cursor: isViewMode ? "default" : "text"
                      }}
                      onFocus={(e) => {
                        if (!isViewMode) {
                          e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(15, 118, 110, 0.1)";
                        }
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "var(--theme-border-default)";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    />
                  </div>

                  {/* Transaction Type — scoped to context */}
                  {(context === "operations" || context === "accounting" || context === "personal") && (
                    <div>
                      <label style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 500,
                        color: "var(--theme-text-secondary)",
                        marginBottom: "8px"
                      }}>
                        Transaction Type <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>
                      </label>
                      <CustomDropdown
                        value={
                          context === "personal"
                            ? transactionType
                            : transactionType === "cash_advance" ? "cash_advance" : transactionSubtype === "billable_expense" ? "billable" : "expense"
                        }
                        onChange={(val) => {
                          if (context === "personal") {
                            setTransactionType(val as EVoucherTransactionType);
                            setTransactionSubtype("regular_expense");
                          } else if (val === "cash_advance") {
                            setTransactionType("cash_advance");
                            setTransactionSubtype("regular_expense");
                          } else if (val === "billable") {
                            setTransactionType("expense");
                            setTransactionSubtype("billable_expense");
                          } else {
                            setTransactionType("expense");
                            setTransactionSubtype("regular_expense");
                          }
                        }}
                        options={
                          context === "personal"
                            ? [
                                { value: "reimbursement", label: "Reimbursement" },
                                { value: "direct_expense", label: "Direct Expense" }
                              ]
                            : context === "operations"
                            ? [
                                { value: "expense", label: "Regular Expense" },
                                { value: "billable", label: "Billable Expense" },
                                { value: "cash_advance", label: "Cash Advance" }
                              ]
                            : [
                                { value: "expense", label: "Regular Expense" },
                                { value: "billable", label: "Billable Expense" },
                                { value: "cash_advance", label: "Cash Advance" },
                                { value: "reimbursement", label: "Reimbursement" },
                                { value: "direct_expense", label: "Direct Expense" }
                              ]
                        }
                        placeholder="Select type"
                        disabled={isViewMode}
                      />
                    </div>
                  )}
                </div>

                {/* Project / Booking Number */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div>
                    <label style={{ 
                      display: "block", 
                      fontSize: "12px", 
                      fontWeight: 500, 
                      color: "var(--theme-text-secondary)", 
                      marginBottom: "8px" 
                    }}>
                      {isDirectExpense ? "Reference (Optional)" : "Project / Booking Ref (Optional)"}
                    </label>
                    <input
                      type="text"
                      readOnly={isViewMode || !!bookingId || isCollectionMode} // Read only if view mode OR passed as prop OR collection mode
                      value={projectNumber}
                      onChange={(e) => !isViewMode && setProjectNumber(e.target.value)}
                      placeholder="e.g., BN-2025-001"
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        fontSize: "14px",
                        border: "1px solid var(--theme-border-default)",
                        borderRadius: "6px",
                        outline: "none",
                        transition: "all 0.2s",
                        backgroundColor: (isViewMode || bookingId || isCollectionMode) ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
                        color: "var(--theme-text-secondary)"
                      }}
                    />
                  </div>
                  
                  {/* Vendor / Counterparty */}
                  <div>
                    <label style={{ 
                      display: "block", 
                      fontSize: "12px", 
                      fontWeight: 500, 
                      color: "var(--theme-text-secondary)", 
                      marginBottom: "8px" 
                    }}>
                      {vendorLabel} <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>
                    </label>
                    <input
                      type="text"
                      required={!isViewMode}
                      readOnly={isViewMode || isCollectionMode} // Auto-filled in collection mode
                      value={vendor}
                      onChange={(e) => !isViewMode && setVendor(e.target.value)}
                      placeholder={isBillingMode ? "Client Name" : isCollectionMode ? "Payer Name" : "Vendor Name"}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        fontSize: "14px",
                        border: "1px solid var(--theme-border-default)",
                        borderRadius: "6px",
                        outline: "none",
                        transition: "all 0.2s",
                        backgroundColor: (isViewMode || isCollectionMode) ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)"
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Line Items Section */}
            <div style={{ marginBottom: "32px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Line Items
                </h3>
                {!isViewMode && !isCollectionMode && (
                  <div style={{ position: "relative" }}>
                    <button
                      type="button"
                      onClick={() => setShowAddCategoryDropdown(true)}
                      style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "var(--theme-action-primary-bg)", backgroundColor: "transparent", border: "1px solid var(--theme-border-default)", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", transition: "all 0.2s" }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                    >
                      <Plus size={14} /> Add Category
                    </button>
                    {showAddCategoryDropdown && (
                      <CategoryDropdown
                        side={isBillingMode ? "revenue" : "expense"}
                        onAdd={(name, catalogCategoryId) => { handleAddSection(name, catalogCategoryId); setShowAddCategoryDropdown(false); }}
                        onClose={() => setShowAddCategoryDropdown(false)}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Empty state */}
              {categorySections.length === 0 && !isViewMode && !isCollectionMode && (
                <div style={{ padding: "32px 24px", textAlign: "center", border: "1px dashed var(--theme-border-default)", borderRadius: "8px", color: "var(--theme-text-muted)" }}>
                  <p style={{ fontSize: "13px", margin: 0 }}>Click "+ Add Category" to start adding expense items.</p>
                </div>
              )}

              {/* Category sections */}
              {categorySections.map(section => {
                const sectionSubtotal = section.items.reduce((s, i) => s + (i.amount || 0), 0);
                return (
                  <div key={section.id} style={{ border: "1px solid var(--theme-border-default)", borderRadius: "8px", marginBottom: "12px", overflow: "visible" }}>
                    {/* Section header */}
                    <div
                      onClick={() => toggleSection(section.id)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", backgroundColor: "var(--theme-bg-page)", borderRadius: section.expanded ? "8px 8px 0 0" : "8px", borderBottom: section.expanded ? "1px solid var(--theme-border-default)" : "none", cursor: "pointer", userSelect: "none" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {section.expanded ? <ChevronDown size={13} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} /> : <ChevronRight size={13} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} />}
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--theme-text-primary)" }}>{section.category_name}</span>
                        <span style={{ fontSize: "11px", color: "var(--theme-text-muted)", backgroundColor: "var(--theme-bg-surface)", padding: "1px 7px", borderRadius: "3px", border: "1px solid var(--theme-border-default)" }}>
                          {section.items.length} item{section.items.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {!isViewMode && !isCollectionMode && (
                        <div style={{ display: "flex", gap: "6px" }} onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => handleAddItemToSection(section.id)}
                            style={{ display: "flex", alignItems: "center", gap: "3px", padding: "3px 9px", fontSize: "11px", fontWeight: 600, color: "var(--theme-action-primary-bg)", backgroundColor: "transparent", border: "1px solid var(--theme-action-primary-bg)", borderRadius: "5px", cursor: "pointer" }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)"; e.currentTarget.style.color = "#fff"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--theme-action-primary-bg)"; }}
                          >
                            <Plus size={11} /> Add Item
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSection(section.id)}
                            style={{ display: "flex", alignItems: "center", padding: "3px", background: "none", border: "none", cursor: "pointer", color: "var(--theme-text-muted)", opacity: 0.5 }}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "var(--theme-status-danger-fg)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; e.currentTarget.style.color = "var(--theme-text-muted)"; }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Items table */}
                    {section.expanded && (
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead style={{ backgroundColor: "var(--theme-bg-surface)", borderBottom: "1px solid var(--theme-border-default)" }}>
                          <tr>
                            <th style={{ padding: "8px 16px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", width: "40%" }}>Particulars</th>
                            <th style={{ padding: "8px 16px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", width: "30%" }}>Description</th>
                            <th style={{ padding: "8px 16px", textAlign: "right", fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", width: "20%" }}>Amount</th>
                            {!isViewMode && !isCollectionMode && <th style={{ width: "10%" }} />}
                          </tr>
                        </thead>
                        <tbody>
                          {section.items.map(item => (
                            <tr key={item.id} style={{ borderBottom: "1px solid var(--theme-border-subtle)" }}>
                              <td style={{ padding: "10px 16px" }}>
                                {isViewMode || isCollectionMode ? (
                                  <div style={{ fontSize: "14px" }}>{item.particular}</div>
                                ) : (
                                  <CatalogItemCombobox
                                    value={item.particular}
                                    catalogItemId={item.catalog_item_id ?? undefined}
                                    categoryId={section.catalog_category_id}
                                    side={isBillingMode ? "revenue" : "expense"}
                                    onChange={(name, catId) => {
                                      handleItemChange(section.id, item.id, "particular", name);
                                      handleItemChange(section.id, item.id, "catalog_item_id", catId ?? null);
                                    }}
                                    placeholder="Select or type item..."
                                  />
                                )}
                              </td>
                              <td style={{ padding: "10px 16px" }}>
                                <input
                                  type="text"
                                  readOnly={isViewMode || isCollectionMode}
                                  value={item.description}
                                  onChange={e => handleItemChange(section.id, item.id, "description", e.target.value)}
                                  placeholder="Optional description"
                                  style={{ width: "100%", border: "none", outline: "none", fontSize: "14px", backgroundColor: "transparent" }}
                                />
                              </td>
                              <td style={{ padding: "10px 16px" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                                  <span style={{ color: "var(--theme-text-muted)", fontSize: "14px" }}>₱</span>
                                  <input
                                    type="number"
                                    readOnly={isViewMode}
                                    value={item.amount || ""}
                                    onChange={e => handleItemChange(section.id, item.id, "amount", parseFloat(e.target.value) || 0)}
                                    placeholder="0.00"
                                    style={{ width: "100px", textAlign: "right", border: "none", outline: "none", fontSize: "14px", backgroundColor: "transparent" }}
                                  />
                                </div>
                              </td>
                              {!isViewMode && !isCollectionMode && (
                                <td style={{ padding: "10px 16px", textAlign: "center" }}>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveItemFromSection(section.id, item.id)}
                                    style={{ color: "var(--theme-status-danger-fg)", background: "none", border: "none", cursor: "pointer", opacity: section.items.length <= 1 ? 0.2 : 1 }}
                                    disabled={section.items.length <= 1}
                                  >
                                    <X size={14} />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot style={{ backgroundColor: "var(--theme-bg-page)", borderTop: "1px solid var(--theme-border-default)" }}>
                          <tr>
                            <td colSpan={2} style={{ padding: "8px 16px", textAlign: "right", fontWeight: 500, fontSize: "12px", color: "var(--theme-text-muted)" }}>
                              Subtotal ({section.category_name})
                            </td>
                            <td style={{ padding: "8px 16px", textAlign: "right", fontWeight: 600, fontSize: "13px", color: "var(--theme-text-secondary)" }}>
                              ₱ {sectionSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            {!isViewMode && !isCollectionMode && <td />}
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>
                );
              })}

              {/* Grand total */}
              {(categorySections.length > 0 || isCollectionMode) && (
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "24px", padding: "12px 16px", backgroundColor: "var(--theme-bg-page)", borderRadius: "8px", border: "1px solid var(--theme-border-default)", marginTop: "4px" }}>
                  <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--theme-text-secondary)" }}>Total Amount</span>
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--theme-text-primary)" }}>
                    ₱ {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>

            {/* Payment & Terms Section */}
            <div style={{ marginBottom: "32px" }}>
              <h3 style={{ 
                fontSize: "14px", 
                fontWeight: 600, 
                color: "var(--theme-text-primary)", 
                marginBottom: "16px",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                Payment & Terms
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", rowGap: "16px" }}>
                {/* Payment Method */}
                <div>
                  <label style={{ 
                    display: "block", 
                    fontSize: "12px", 
                    fontWeight: 500, 
                    color: "var(--theme-text-secondary)", 
                    marginBottom: "8px" 
                  }}>
                    Method
                  </label>
                  <CustomDropdown
                    options={PAYMENT_METHODS.map(m => ({ value: m, label: m, icon: <CreditCard size={16} /> }))}
                    value={preferredPayment}
                    onChange={(value) => setPreferredPayment(value as PaymentMethod)}
                    placeholder="Select method"
                    disabled={isViewMode}
                  />
                </div>

                {/* Source Account (Bank/Fund) - Only show if Accounts loaded */}
                <div>
                  <label style={{ 
                    display: "block", 
                    fontSize: "12px", 
                    fontWeight: 500, 
                    color: "var(--theme-text-secondary)", 
                    marginBottom: "8px" 
                  }}>
                    Source Account / Fund
                  </label>
                  <CustomDropdown
                    options={accounts.map(acc => ({ 
                      value: acc.id, 
                      label: `${acc.name} (${acc.currency})`, 
                      icon: <Banknote size={16} /> 
                    }))}
                    value={sourceAccountId}
                    onChange={(value) => setSourceAccountId(value)}
                    placeholder="Select account (Optional)"
                    disabled={isViewMode || accounts.length === 0}
                  />
                </div>

                {/* Credit Terms */}
                <div>
                  <label style={{ 
                    display: "block", 
                    fontSize: "12px", 
                    fontWeight: 500, 
                    color: "var(--theme-text-secondary)", 
                    marginBottom: "8px" 
                  }}>
                    Credit Terms
                  </label>
                  <CustomDropdown
                    options={CREDIT_TERMS.map(t => ({ value: t, label: t, icon: <Clock size={16} /> }))}
                    value={creditTerms}
                    onChange={(value) => setCreditTerms(value as CreditTerm)}
                    placeholder="Select terms"
                    disabled={isViewMode}
                  />
                </div>

                {/* Due Date */}
                <div>
                  <label style={{ 
                    display: "block", 
                    fontSize: "12px", 
                    fontWeight: 500, 
                    color: "var(--theme-text-secondary)", 
                    marginBottom: "8px" 
                  }}>
                    Payment Due Date
                  </label>
                  <div style={{ position: "relative" }}>
                    <CalendarIcon size={16} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--theme-text-muted)" }} />
                    <input
                      type="date"
                      readOnly={isViewMode}
                      value={paymentSchedule}
                      onChange={(e) => setPaymentSchedule(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 10px 10px 36px",
                        fontSize: "14px",
                        border: "1px solid var(--theme-border-default)",
                        borderRadius: "6px",
                        outline: "none",
                        transition: "all 0.2s",
                        backgroundColor: isViewMode ? "var(--theme-bg-surface-subtle)" : "var(--theme-bg-surface)"
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Notes Section */}
            <div>
              <label style={{ 
                display: "block", 
                fontSize: "12px", 
                fontWeight: 500, 
                color: "var(--theme-text-secondary)", 
                marginBottom: "8px" 
              }}>
                Additional Notes
              </label>
              <textarea
                readOnly={isViewMode}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special instructions or remarks..."
                rows={3}
                style={{
                  width: "100%",
                  padding: "12px",
                  fontSize: "14px",
                  border: "1px solid var(--theme-border-default)",
                  borderRadius: "6px",
                  outline: "none",
                  resize: "vertical",
                  backgroundColor: isViewMode ? "var(--theme-bg-surface-subtle)" : "var(--theme-bg-surface)"
                }}
              />
            </div>
          </form>
        </div>

        {/* Footer Actions */}
        {!isViewMode ? (
          <div style={{ 
            padding: "24px 48px", 
            borderTop: "1px solid var(--neuron-ui-border)", 
            backgroundColor: "var(--theme-bg-surface)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px"
          }}>
            <button
              type="button"
              onClick={handleClose}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--theme-text-secondary)",
                backgroundColor: "var(--theme-bg-surface)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              Cancel
            </button>
            
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSaving}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--theme-text-primary)",
                backgroundColor: "var(--theme-bg-surface)",
                border: "1px solid var(--theme-text-primary)",
                borderRadius: "6px",
                cursor: isSaving ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                opacity: isSaving ? 0.7 : 1,
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              <Save size={16} />
              Save Draft
            </button>
            
            {isAccounting && (
              <button
                type="button"
                onClick={handleAutoApprove}
                disabled={!isFormValid || isSaving}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#FFFFFF",
                  backgroundColor: "var(--theme-action-primary-bg)", // Slightly different shade if needed
                  border: "none",
                  borderRadius: "6px",
                  cursor: (isFormValid && !isSaving) ? "pointer" : "not-allowed",
                  transition: "all 0.2s",
                  opacity: (isFormValid && !isSaving) ? 1 : 0.5,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}
              >
                <Zap size={16} />
                Auto-Approve
              </button>
            )}
            
            <button
              type="button"
              onClick={(e) => handleSubmit(e)}
              disabled={!isFormValid || isSaving}
              style={{
                padding: "10px 24px",
                fontSize: "14px",
                fontWeight: 600,
                color: "#FFFFFF",
                backgroundColor: isAccounting ? "var(--theme-action-primary-border)" : "var(--theme-action-primary-bg)",
                border: "none",
                borderRadius: "6px",
                cursor: (isFormValid && !isSaving) ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                opacity: (isFormValid && !isSaving) ? 1 : 0.5,
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {isCollectionMode ? "Record Collection" : isAccounting ? "Save & Submit" : "Submit Request"}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        ) : (
          /* View Mode Footer with Status Banner */
          <div style={{ 
            padding: "24px 48px", 
            borderTop: "1px solid var(--neuron-ui-border)", 
            backgroundColor: "var(--theme-bg-surface)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "32px"
          }}>
             {/* Left Action: Delete & Custom Actions */}
             <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {canDeleteExistingVoucher && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isSaving}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px 16px",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "var(--theme-status-danger-fg)",
                      backgroundColor: "transparent",
                      border: "1px solid var(--theme-status-danger-border)",
                      borderRadius: "6px",
                      cursor: isSaving ? "not-allowed" : "pointer",
                      transition: "all 0.2s"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--theme-status-danger-bg)"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Delete
                  </button>
                )}
                
                {footerActions}
             </div>

             <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              {statusStyle && (
                <div style={{ textAlign: "right" }}>
                    <span style={{ display: "block", fontSize: "11px", color: "var(--theme-text-muted)", marginBottom: "4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      STATUS
                    </span>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                       <span style={{ 
                         display: "inline-flex",
                         alignItems: "center",
                         padding: "4px 12px",
                         borderRadius: "16px",
                         backgroundColor: statusStyle.bg,
                         color: statusStyle.color,
                         fontSize: "13px",
                         fontWeight: 600,
                         textTransform: "uppercase",
                         letterSpacing: "0.5px"
                       }}>
                          {existingData?.status || "Draft"}
                       </span>
                    </div>
                </div>
             )}

             {/* Vertical Divider */}
             <div style={{ width: "1px", height: "40px", backgroundColor: "var(--theme-border-default)" }} />

             <div style={{ textAlign: "right" }}>
                <span style={{ display: "block", fontSize: "11px", color: "var(--theme-text-muted)", marginBottom: "4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  TOTAL AMOUNT
                </span>
                <span style={{ fontSize: "24px", fontWeight: 700, color: "var(--theme-text-primary)" }}>
                  ₱ {(existingData?.amount || totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
             </div>
          </div>
          </div>
        )}
      </motion.div>
    </>
  );
}
