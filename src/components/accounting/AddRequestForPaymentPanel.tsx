import { X, Plus, Printer, Download, Calendar as CalendarIcon, CreditCard, Clock, Tag, ChevronDown, RefreshCw, FileText, Banknote, Receipt, ArrowRight, CheckSquare, Square, Loader2, Save, Zap, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import logoImage from "figma:asset/28c84ed117b026fbf800de0882eb478561f37f4f.png";
import { CustomDropdown } from "../bd/CustomDropdown";
import { GroupedDropdown } from "../bd/GroupedDropdown";
import type { EVoucher, EVoucherTransactionType, LinkedBilling } from "../../types/evoucher";
import { useEVoucherSubmit } from "../../hooks/useEVoucherSubmit";
import { useUser } from "../../hooks/useUser";
import { supabase } from "../../utils/supabase/client";
import { getAccounts } from "../../utils/accounting-api";
import type { Account } from "../../types/accounting-core";

interface LineItem {
  id: string;
  particular: string;
  description: string;
  amount: number;
}

interface AddRequestForPaymentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void; // Called after successful save to backend
  onSave?: (expenseData: any) => void | Promise<void>; // Alias for onSuccess, used by some callers
  onSaveDraft?: (draftData: any) => void | Promise<void>; // Draft save callback
  context?: "bd" | "accounting" | "operations" | "collection" | "billing"; // Extended to support all E-Voucher types
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

type ExpenseCategory = 
  | "Brokerage - FCL"
  | "Brokerage - LCL/AIR"
  | "Forwarding" 
  | "Trucking"
  | "Miscellaneous"
  | "Office";

// Revenue Categories for Billing
type RevenueCategory =
  | "Brokerage Income"
  | "Forwarding Income"
  | "Trucking Income"
  | "Warehousing Income"
  | "Documentation Fees"
  | "Other Service Income";

type PaymentMethod = 
  | "Cash"
  | "Bank Transfer"
  | "Online Payment"
  | "Cash Deposit"
  | "Check Deposit"
  | "Manager's Check"
  | "E-Wallets";

type CreditTerm = "None" | "Net7" | "Net15" | "Net30";

interface SubCategory {
  label: string;
  items: string[];
}

// UI Subtypes for Operations/Accounting to distinguish between expense types
type TransactionSubtype = "regular_expense" | "billable_expense" | "cash_advance";

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "Brokerage - FCL",
  "Brokerage - LCL/AIR",
  "Forwarding",
  "Trucking",
  "Miscellaneous",
  "Office"
];

const REVENUE_CATEGORIES: RevenueCategory[] = [
  "Brokerage Income",
  "Forwarding Income",
  "Trucking Income",
  "Warehousing Income",
  "Documentation Fees",
  "Other Service Income"
];

// Hierarchical structure: Category -> Sub-Category -> Sub-Sub-Category
const SUB_CATEGORIES: Record<ExpenseCategory, SubCategory[]> = {
  "Brokerage - FCL": [
    {
      label: "Destination Local Charges",
      items: [
        "THC & Other Local Charges",
        "Detention",
        "Demurrage",
        "Detention/Demurrage",
        "Storage & Deposit",
        "Late Payment Fee",
        "Others"
      ]
    },
    {
      label: "Port Charges",
      items: [
        "THC",
        "Arrastre, Wharfage Due & Storage Fee",
        "Storage Fee",
        "Reefer",
        "Physical Examination",
        "Spot-check Examination",
        "O-LO",
        "Others"
      ]
    },
    {
      label: "Trucking Charges",
      items: [
        "Delivery Fee",
        "Booking Fee",
        "Tricod",
        "CY Fee",
        "Others"
      ]
    }
  ],
  "Brokerage - LCL/AIR": [
    {
      label: "Warehouse Charges",
      items: [
        "Storage & Other Fees"
      ]
    },
    {
      label: "Clearance Charges",
      items: [
        "Assessment",
        "Agents",
        "Liquidation",
        "Audit",
        "District",
        "X-Ray",
        "Wharfinger",
        "CNIU/CAIDTF",
        "BAI",
        "ISPM",
        "BPI",
        "Notary & Photocopies",
        "Employee Particulars",
        "Company Particulars",
        "Brokerage Fee",
        "Others"
      ]
    },
    {
      label: "Sales Commission",
      items: [
        "Sales Commission"
      ]
    }
  ],
  "Forwarding": [
    {
      label: "Freight Charges",
      items: [
        "Air Freight",
        "Ocean Freight"
      ]
    },
    {
      label: "Origin Local Charges",
      items: [
        "EXW",
        "FCA/FOB",
        "Others"
      ]
    },
    {
      label: "Freight & Origin Local Charges",
      items: [
        "EXW/FCA/FOB"
      ]
    },
    {
      label: "Destination Local Charges",
      items: [
        "THC & Other Local Charges",
        "Detention",
        "Demurrage",
        "Detention/Demurrage",
        "Storage & Deposit",
        "Late Payment Fee",
        "Others"
      ]
    },
    {
      label: "Port Charges",
      items: [
        "Arrastre & Wharfage Due",
        "Arrastre, Wharfage Due & Storage Fee",
        "Storage Fee",
        "Reefer",
        "Physical Examination",
        "Spot-check Examination",
        "O-LO",
        "Others"
      ]
    },
    {
      label: "Trucking Charges",
      items: [
        "Delivery Fee",
        "Booking Fee",
        "Tricod",
        "CY Fee",
        "Others"
      ]
    }
  ],
  "Trucking": [
    {
      label: "Transportation Charges",
      items: [
        "Gasoline",
        "Toll",
        "Pull-out",
        "Empty Return",
        "Facilitation",
        "Documentation",
        "Penalty",
        "Others"
      ]
    }
  ],
  "Miscellaneous": [
    {
      label: "NTC Charges",
      items: [
        "Processing",
        "Order of Payment"
      ]
    },
    {
      label: "FDA Charges",
      items: [
        "Processing",
        "Order of Payment"
      ]
    },
    {
      label: "ATRIG Charges",
      items: [
        "Processing",
        "Order of Payment"
      ]
    },
    {
      label: "SRA Charges",
      items: [
        "Processing",
        "Order of Payment"
      ]
    },
    {
      label: "BOC AMO Charges",
      items: [
        "Processing",
        "Order of Payment"
      ]
    },
    {
      label: "DTI Charges",
      items: [
        "Processing",
        "Order of Payment"
      ]
    }
  ],
  "Office": [
    {
      label: "Office Expenses",
      items: [
        "Office Supplies",
        "Utilities",
        "Rent",
        "Telecommunications",
        "Professional Fees",
        "Marketing & Advertising",
        "Travel & Transportation",
        "Representation",
        "Others"
      ]
    }
  ]
};

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
  
  // Use the custom hook for E-Voucher submission
  const { createDraft, submitForApproval, autoApprove, deleteEVoucher, isSaving } = useEVoucherSubmit(context);
  
  // Form state
  const [transactionType, setTransactionType] = useState<EVoucherTransactionType>("expense");
  const [transactionSubtype, setTransactionSubtype] = useState<TransactionSubtype>("regular_expense");
  
  const [requestName, setRequestName] = useState("");
  // We use "expenseCategory" as a generic "Category" state for both Expense and Revenue
  const [expenseCategory, setExpenseCategory] = useState<string>("Brokerage - FCL");
  const [subCategory, setSubCategory] = useState("");
  const [projectNumber, setProjectNumber] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: "1", particular: "", description: "", amount: 0 }
  ]);
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
    const loadAccounts = async () => {
      try {
        const allAccounts = await getAccounts();
        const assetAccounts = allAccounts.filter(a => a.type === 'Asset' && !a.is_folder);
        setAccounts(assetAccounts);
      } catch (e) {
        console.error("Failed to load accounts", e);
      }
    };
    loadAccounts();
  }, []);

  // Initialize Transaction Type based on Context
  useEffect(() => {
    if (context === "bd") {
      setTransactionType("budget_request");
    } else if (context === "collection") {
      setTransactionType("collection");
    } else if (context === "billing") {
      setTransactionType("billing");
    } else if (context === "operations") {
      // Operations defaults to expense, but allows switching
      setTransactionType("expense");
    } else if (context === "accounting") {
      setTransactionType("expense");
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
      if (dataToLoad.expense_category) {
        setExpenseCategory(dataToLoad.expense_category);
      } else if (dataToLoad.gl_category && dataToLoad.transaction_type === "billing") {
        // Map GL Category back if needed (simplified)
      }
      
      if (dataToLoad.gl_sub_category) setSubCategory(dataToLoad.gl_sub_category || "");
      if (dataToLoad.project_number) setProjectNumber(dataToLoad.project_number || "");
      
      // Handle line items
      if (dataToLoad.line_items && dataToLoad.line_items.length > 0) {
        setLineItems(dataToLoad.line_items as LineItem[]);
      } else if (dataToLoad.amount) {
        // Create single line item from total amount
        setLineItems([{ 
            id: "1", 
            particular: dataToLoad.purpose || "Service Fee", 
            description: dataToLoad.description || "", 
            amount: dataToLoad.amount 
        }]);
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

      // Auto-select expense category based on bookingType
      if (transactionType === "expense" || transactionType === "budget_request") {
        if (bookingType === "forwarding") {
          setExpenseCategory("Forwarding");
        } else if (bookingType === "brokerage") {
          setExpenseCategory("Brokerage - FCL");
        } else if (bookingType === "trucking") {
          setExpenseCategory("Trucking");
        }
      } else if (transactionType === "billing") {
         if (bookingType === "forwarding") {
          setExpenseCategory("Forwarding Income");
        } else if (bookingType === "brokerage") {
          setExpenseCategory("Brokerage Income");
        } else if (bookingType === "trucking") {
         setExpenseCategory("Trucking Income");
        }
      }
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
    
    // Create Line Item
    const newItem: LineItem = {
      id: "1",
      particular: `Payment for Statement ${statement.ref}`,
      description: `${statement.items.length} items linked`,
      amount: statement.remainingBalance
    };
    setLineItems([newItem]);
    
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

  const handleAddLine = () => {
    const newId = (Math.max(...lineItems.map(item => parseInt(item.id))) + 1).toString();
    setLineItems([
      ...lineItems,
      { id: newId, particular: "", description: "", amount: 0 }
    ]);
  };

  const handleRemoveLine = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter(item => item.id !== id));
    }
  };

  const handleLineItemChange = (id: string, field: keyof LineItem, value: string | number) => {
    setLineItems(lineItems.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const totalAmount = lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);

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
        transactionSubtype, // For frontend metadata if needed
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
    setExpenseCategory("Brokerage - FCL");
    setSubCategory("");
    setProjectNumber("");
    setLineItems([{ id: "1", particular: "", description: "", amount: 0 }]);
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
    (transactionType === "collection" || expenseCategory !== "") && // Category not strict for collections if statements used
    // Sub-category is optional for some flows
    lineItems.some(item => item.particular.trim() !== "" && item.amount > 0) &&
    vendor.trim() !== "";

  // Update sub-category when expense category changes
  const availableSubCategories = SUB_CATEGORIES[expenseCategory as ExpenseCategory] || [];

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
  const isCollectionMode = transactionType === "collection";
  const isBillingMode = transactionType === "billing";
  
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
              <div>
                <img 
                  src={logoImage} 
                  alt="Neuron" 
                  style={{ height: "32px", marginBottom: "12px" }}
                />
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

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  {/* Left Column: Transaction Type + Category */}
                  <div>
                    {/* Nested Grid to split Transaction Type and Category evenly within the same width as Project/Booking Ref */}
                    <div style={{ 
                      display: "grid", 
                      gridTemplateColumns: (context === "operations" || context === "accounting") ? "1fr 1fr" : "1fr", 
                      gap: "16px" 
                    }}>
                      {/* Transaction Type */}
                      {(context === "operations" || context === "accounting") && (
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
                            value={transactionType === "cash_advance" ? "cash_advance" : transactionSubtype === "billable_expense" ? "billable" : "expense"}
                            onChange={(val) => {
                              if (val === "cash_advance") {
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
                            options={[
                              { value: "expense", label: "Regular Expense" },
                              { value: "billable", label: "Billable Expense" },
                              { value: "cash_advance", label: "Cash Advance" }
                            ]}
                            placeholder="Select type"
                            disabled={isViewMode}
                          />
                        </div>
                      )}

                      {/* Category Dropdown */}
                      <div>
                        <label style={{ 
                          display: "block", 
                          fontSize: "12px", 
                          fontWeight: 500, 
                          color: "var(--theme-text-secondary)", 
                          marginBottom: "8px" 
                        }}>
                          {categoryLabel} <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>
                        </label>
                        <CustomDropdown
                          options={
                            transactionType === "billing" 
                            ? REVENUE_CATEGORIES.map(cat => ({ value: cat, label: cat, icon: <Tag size={16} /> }))
                            : EXPENSE_CATEGORIES.map(cat => ({ value: cat, label: cat, icon: <Tag size={16} /> }))
                          }
                          value={expenseCategory}
                          onChange={(value) => {
                            setExpenseCategory(value);
                            setSubCategory(""); // Reset sub-category when category changes
                          }}
                          placeholder="Select category"
                          disabled={isViewMode || isCollectionMode} // Disabled in collection mode (implied)
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Sub-Category */}
                  <div>
                    <label style={{ 
                      display: "block", 
                      fontSize: "12px", 
                      fontWeight: 500, 
                      color: "var(--theme-text-secondary)", 
                      marginBottom: "8px" 
                    }}>
                      Sub-Category
                    </label>
                    {availableSubCategories.length > 0 ? (
                      <GroupedDropdown
                        options={availableSubCategories}
                        value={subCategory}
                        onChange={(value) => setSubCategory(value)}
                        placeholder="Select sub-category"
                        disabled={isViewMode || !expenseCategory || isCollectionMode}
                      />
                    ) : (
                      <input
                         type="text"
                         readOnly
                         placeholder="N/A"
                         className="w-full px-3 py-2.5 bg-[var(--theme-bg-surface-subtle)] border border-[var(--theme-border-default)] rounded-md text-sm text-[var(--theme-text-muted)]"
                      />
                    )}
                  </div>
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
                      Project / Booking Ref (Optional)
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
                <h3 style={{ 
                  fontSize: "14px", 
                  fontWeight: 600, 
                  color: "var(--theme-text-primary)", 
                  textTransform: "uppercase",
                  letterSpacing: "0.5px"
                }}>
                  Line Items
                </h3>
                {!isViewMode && !isCollectionMode && (
                  <button
                    type="button"
                    onClick={handleAddLine}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--theme-action-primary-bg)",
                      backgroundColor: "transparent",
                      border: "1px solid var(--theme-border-default)",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    <Plus size={14} />
                    Add Item
                  </button>
                )}
              </div>

              <div style={{ border: "1px solid var(--theme-border-default)", borderRadius: "8px", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ backgroundColor: "var(--theme-bg-surface)", borderBottom: "1px solid var(--theme-border-default)" }}>
                    <tr>
                      <th style={{ padding: "10px 16px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "var(--theme-text-muted)", width: "40%" }}>Particulars</th>
                      <th style={{ padding: "10px 16px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "var(--theme-text-muted)", width: "30%" }}>Description</th>
                      <th style={{ padding: "10px 16px", textAlign: "right", fontSize: "12px", fontWeight: 600, color: "var(--theme-text-muted)", width: "20%" }}>Amount</th>
                      {!isViewMode && !isCollectionMode && <th style={{ padding: "10px 16px", width: "10%" }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item) => (
                      <tr key={item.id} style={{ borderBottom: "1px solid var(--theme-border-subtle)" }}>
                        <td style={{ padding: "10px 16px" }}>
                          <input
                            type="text"
                            readOnly={isViewMode || isCollectionMode}
                            value={item.particular}
                            onChange={(e) => handleLineItemChange(item.id, "particular", e.target.value)}
                            placeholder="Item name"
                            style={{ width: "100%", border: "none", outline: "none", fontSize: "14px", backgroundColor: "transparent" }}
                          />
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          <input
                            type="text"
                            readOnly={isViewMode || isCollectionMode}
                            value={item.description}
                            onChange={(e) => handleLineItemChange(item.id, "description", e.target.value)}
                            placeholder="Optional description"
                            style={{ width: "100%", border: "none", outline: "none", fontSize: "14px", backgroundColor: "transparent" }}
                          />
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                            <span style={{ color: "var(--theme-text-muted)", fontSize: "14px" }}>₱</span>
                            <input
                              type="number"
                              readOnly={isViewMode} // Allow editing amount in collection mode (partial payment)
                              value={item.amount || ""}
                              onChange={(e) => handleLineItemChange(item.id, "amount", parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              style={{ width: "100px", textAlign: "right", border: "none", outline: "none", fontSize: "14px", backgroundColor: "transparent" }}
                            />
                          </div>
                        </td>
                        {!isViewMode && !isCollectionMode && (
                          <td style={{ padding: "10px 16px", textAlign: "center" }}>
                            {lineItems.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveLine(item.id)}
                                style={{ color: "var(--theme-status-danger-fg)", background: "none", border: "none", cursor: "pointer" }}
                              >
                                <X size={16} />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot style={{ backgroundColor: "var(--theme-bg-page)", borderTop: "1px solid var(--theme-border-default)" }}>
                    <tr>
                      <td colSpan={2} style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, fontSize: "13px", color: "var(--theme-text-secondary)" }}>
                        Total Amount
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, fontSize: "14px", color: "var(--theme-text-primary)" }}>
                        ₱ {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      {!isViewMode && !isCollectionMode && <td></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
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
