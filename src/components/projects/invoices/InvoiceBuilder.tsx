import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Loader2, ZoomIn, ZoomOut, Maximize, ChevronDown, Layout, Check, FileText, Calendar, Box, Truck, CreditCard, Download, Printer, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "../../../hooks/useUser";
import { usePermission } from "../../../context/PermissionProvider";
import { logCreation, logActivity } from "../../../utils/activityLog";
import { toast } from "../../ui/toast-utils";
import type { FinancialContainer } from "../../../types/financials";
import type { Project } from "../../../types/pricing";
import { Invoice, Billing, Account } from "../../../types/accounting";
import type { BillingLineItem } from "../../../types/operations";
import { getAccounts } from "../../../utils/accounting-api";
import { supabase } from "../../../utils/supabase/client";
import { queryKeys } from "../../../lib/queryKeys";
import { InvoiceDocument, InvoicePrintOptions } from "./InvoiceDocument";
import { downloadInvoicePDF } from "./InvoicePDFRenderer";
import { SignatoryControl } from "../quotation/screen/controls/SignatoryControl";
import { DisplayOptionsControl } from "../quotation/screen/controls/DisplayOptionsControl";
import { CustomDropdown } from "../../bd/CustomDropdown";
import { useBookingGrouping } from "../../../hooks/useBookingGrouping";
import { getServiceIcon } from "../../../utils/quotation-helpers";
import { useConsignees } from "../../../hooks/useConsignees";
import type { Consignee } from "../../../types/bd";


// A4 Dimensions in pixels at 96 DPI
const A4_WIDTH_PX = 794; // 210mm
const A4_HEIGHT_PX = 1123; // 297mm

interface InvoiceBuilderProps {
  mode: "create" | "view";
  project: FinancialContainer;
  
  // Create Mode
  billingItems?: Billing[];
  linkedBookings?: any[];
  onSuccess?: () => void;
  onRefreshData?: () => Promise<void>;
  
  // View Mode
  invoice?: Invoice;
  onBack?: () => void;
}

interface ItemOverride {
    remarks: string;
    tax_type: "VAT" | "NON-VAT";
}

const normalizeRef = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export function InvoiceBuilder({ 
  mode, 
  project, 
  billingItems = [], 
  linkedBookings = [],
  onSuccess,
  invoice: initialInvoice,
  onBack,
  onRefreshData
}: InvoiceBuilderProps) {
  // -- Common State --
  const { user } = useUser();
  const { can } = usePermission();
  const canViewItemsTab = can("ops_invoices_items_tab", "view");
  const canViewDetailsTab = can("ops_invoices_details_tab", "view");
  const canViewLegalTab = can("ops_invoices_legal_tab", "view");
  const canViewSettingsTab = can("ops_invoices_settings_tab", "view");

  const [scale, setScale] = useState(0.85);
  const [autoScale, setAutoScale] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const componentRef = useRef<HTMLDivElement>(null); // For printing

  // -- View Mode State --
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(initialInvoice || null);

  // Print handler using native browser print
  const handlePrint = useCallback(() => {
    const content = componentRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const title = viewInvoice ? `Invoice-${viewInvoice.invoice_number}` : "Invoice";
    printWindow.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>@media print { body { margin: 0; } }</style></head><body>${content.innerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  }, [viewInvoice]);

  // PDF download handler using @react-pdf/renderer
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // -- Create Mode State --
  type CreateTab = 'items' | 'details' | 'legal' | 'settings';
  const defaultCreateTab: CreateTab = canViewItemsTab ? 'items' : canViewDetailsTab ? 'details' : canViewLegalTab ? 'legal' : canViewSettingsTab ? 'settings' : 'items';
  const [activeTab, setActiveTab] = useState<CreateTab>(defaultCreateTab);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Currency & Exchange Rate (Snapshot Strategy)
  const [targetCurrency, setTargetCurrency] = useState(project.currency || "PHP");
  const [exchangeRate, setExchangeRate] = useState(1);
  
  // Item Overrides (Remarks, Tax Type)
  const [itemOverrides, setItemOverrides] = useState<Record<string, ItemOverride>>({});

  // New Fields (Zone A Requirements)
  const [customerTin, setCustomerTin] = useState("");
  const [blNumber, setBlNumber] = useState("");
  const [consignee, setConsignee] = useState(project.customer_name || ""); // Default to customer
  const [commodityDescription, setCommodityDescription] = useState(project.commodity || "");
  const [creditTerms, setCreditTerms] = useState("NET 15");
  const [customerAddress, setCustomerAddress] = useState(project.customer_address || "");
  const [isFetchingAddress] = useState(false); // Kept for placeholder text; actual loading tracked by customerData query

  // Bill To Override (Consignee billing — Phase 4)
  const [billedToType, setBilledToType] = useState<"customer" | "consignee">("customer");
  const [billedToConsigneeId, setBilledToConsigneeId] = useState<string | undefined>(undefined);
  const { consignees: customerConsignees } = useConsignees(project.customer_id);
  const selectedConsignee = customerConsignees.find(c => c.id === billedToConsigneeId);

  const handleBillToChange = (type: "customer" | "consignee") => {
    setBilledToType(type);
    if (type === "customer") {
      setBilledToConsigneeId(undefined);
      setCustomerAddress(project.customer_address || "");
      setCustomerTin("");
    }
  };

  const handleBillToConsigneeSelect = (csgId: string) => {
    setBilledToConsigneeId(csgId);
    const csg = customerConsignees.find(c => c.id === csgId);
    if (csg) {
      setCustomerAddress(csg.address || "");
      setCustomerTin(csg.tin || "");
    }
  };

  // Accounting State (For GL Posting — Revenue Account for DR AR / CR Revenue)
  const [revenueAccountId, setRevenueAccountId] = useState("");

  // -- Shared Options State --
  const [signatories, setSignatories] = useState({
      prepared_by: { name: "System User", title: "Authorized User" },
      approved_by: { name: "MANAGEMENT", title: "Authorized Signatory" }
  });
  
  const [displayOptions, setDisplayOptions] = useState({
      show_bank_details: true,
      show_notes: true,
      show_letterhead: true,
      show_tax_summary: true
  });

  // -- Queries --

  // Revenue accounts for GL posting (create mode only)
  const { data: allAccountsRaw = [], isLoading: loadingAccounts } = useQuery({
    queryKey: queryKeys.transactions.accounts(),
    queryFn: async () => {
      const accs = await getAccounts();
      return accs;
    },
    enabled: mode === 'create',
    staleTime: 60_000,
  });

  const accounts = useMemo(() => {
    const incomeAccounts = allAccountsRaw.filter((a: any) => {
      const t = (a.type || '').toLowerCase();
      return (t === 'income' || t === 'revenue') && !a.is_folder;
    });
    return incomeAccounts as unknown as Account[];
  }, [allAccountsRaw]);

  // Customer address lookup (create mode only)
  const { data: customerData } = useQuery({
    queryKey: queryKeys.customers.detail(project.customer_id || ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', project.customer_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: mode === 'create' && !!project.customer_id,
    staleTime: 30_000,
  });

  // -- Initialization / Effects --

  // 1. If View Mode, load data into state
  useEffect(() => {
    if (mode === 'view' && viewInvoice) {
        // Load notes
        setNotes((viewInvoice.notes as string) || "");

        // Load metadata (signatories, display options) if available
        const metadata = (viewInvoice as any).metadata || {};
        if (metadata.signatories) setSignatories(metadata.signatories);
        else {
             // Fallback default for View
             setSignatories({
                prepared_by: { name: (viewInvoice.created_by_name as string) || "System User", title: "Authorized User" },
                approved_by: { name: "MANAGEMENT", title: "Authorized Signatory" }
             });
        }
        if (metadata.displayOptions) setDisplayOptions(metadata.displayOptions);
    }
  }, [mode, viewInvoice]);

  // 2. Auto-select first revenue account when accounts load
  useEffect(() => {
    if (mode === 'create' && !revenueAccountId && accounts.length > 0) {
      setRevenueAccountId(accounts[0].id);
    }
  }, [mode, accounts, revenueAccountId]);

  // 3. Apply customer address/TIN from query result
  useEffect(() => {
    if (mode === 'create' && customerData) {
      const addr = (customerData as any).address || (customerData as any).registered_address || (customerData as any).billing_address || "";
      if (addr && !customerAddress) setCustomerAddress(addr);
      if ((customerData as any).tin && !customerTin) setCustomerTin((customerData as any).tin);
    }
  }, [mode, customerData]);
  
  // 4. Auto-scale Logic
  useEffect(() => {
    if (!autoScale || !containerRef.current) return;

    const calculateScale = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      
      const xMargin = 64; 
      const yMargin = 120; 
      
      const availableWidth = clientWidth - xMargin;
      const availableHeight = clientHeight - yMargin;
      
      const scaleX = availableWidth / A4_WIDTH_PX;
      const scaleY = availableHeight / A4_HEIGHT_PX;
      
      const fitScale = Math.min(scaleX, scaleY);
      const finalScale = Math.max(0.4, Math.min(fitScale, 1.1));
      
      setScale(finalScale);
    };

    const observer = new ResizeObserver(calculateScale);
    observer.observe(containerRef.current!);
    calculateScale();

    return () => observer.disconnect();
  }, [autoScale]);

  // -- Data Derivation --

  // Filter unbilled (Create Mode)
  const unbilledItems = useMemo(() => {
    if (mode === 'view') return [];
    return billingItems.filter(item => item.status === 'unbilled');
  }, [billingItems, mode]);

  // Booking grouping for unbilled items (Create Mode)
  const getBookingId = useCallback((item: any) => item.booking_id || "unassigned", []);
  const {
    bookingGroupedData,
    bookingIds: bookingGroupIds,
    bookingMeta,
    inferServiceType: inferSvcType,
    expandedBookings,
    toggleBooking,
    toggleAllBookings: handleToggleAllBookings,
    allExpanded: allBookingsExpanded,
    hasBookings,
  } = useBookingGrouping({
    items: unbilledItems,
    linkedBookings,
    getBookingId,
    enabled: mode === 'create' && linkedBookings.length > 0,
  });

  // Selected Items (Create Mode)
  const selectedItems = useMemo(() => {
    if (mode === 'view') return [];
    return unbilledItems.filter(item => selectedIds.has(item.id));
  }, [unbilledItems, selectedIds, mode]);

  const selectedLineage = useMemo(() => {
    const bookingIds = new Set<string>();
    const projectRefs = new Set<string>();
    const contractRefs = new Set<string>();

    selectedItems.forEach((item: any) => {
      const bookingId = normalizeRef(item.booking_id) || normalizeRef(item.source_booking_id);
      const projectRef = normalizeRef(item.project_number);
      const contractRef = normalizeRef(item.contract_number) || normalizeRef(item.quotation_number);

      if (bookingId) bookingIds.add(bookingId);
      if (projectRef) projectRefs.add(projectRef);
      if (contractRef) contractRefs.add(contractRef);
    });

    const resolvedProjectRefs = projectRefs.size > 0 ? Array.from(projectRefs) : [project.project_number];

    return {
      bookingIds: Array.from(bookingIds),
      projectRefs: resolvedProjectRefs,
      contractRefs: Array.from(contractRefs),
    };
  }, [project.project_number, selectedItems]);

  // Currency (Shared)
  const currency = useMemo(() => {
    if (mode === 'view') return viewInvoice?.currency || "PHP";
    return targetCurrency;
  }, [mode, viewInvoice, targetCurrency]);

  // -- The Invoice Object --
  const draftInvoice: Invoice = useMemo(() => {
    // VIEW MODE: Return the static invoice
    if (mode === 'view' && viewInvoice) {
        return viewInvoice;
    }

    // CREATE MODE: Calculate logic
    let effectiveDueDate = dueDate;
    if (!effectiveDueDate) {
         const d = new Date(invoiceDate);
         d.setDate(d.getDate() + 30);
         effectiveDueDate = d.toISOString().split('T')[0];
    }
    
    let subtotal = 0;
    let taxAmount = 0;

    const finalLineItems: BillingLineItem[] = (selectedItems.map((item: any) => {
        const override = itemOverrides[item.id] || { remarks: "", tax_type: "NON-VAT" };
        
        // Multi-Currency Calculation
        const originalAmount = Number(item.amount) || 0;
        let finalAmount = originalAmount;
        let itemRateUsed = 1;
        
        // If item currency differs from target currency, apply rate
        if (item.currency && item.currency !== targetCurrency) {
            finalAmount = originalAmount * exchangeRate;
            itemRateUsed = exchangeRate;
        }
        
        const isVat = override.tax_type === "VAT";
        const lineTax = isVat ? finalAmount * 0.12 : 0;
        
        subtotal += finalAmount;
        taxAmount += lineTax;

        return {
            id: item.id,
            description: item.description,
            remarks: override.remarks,
            quantity: 1,
            unit_price: finalAmount,
            amount: finalAmount,
            tax_type: override.tax_type,
            
            // Snapshot Strategy Fields
            original_amount: originalAmount,
            original_currency: item.currency,
            exchange_rate: itemRateUsed
        };
    })) as unknown as BillingLineItem[];

    const grandTotal = subtotal + taxAmount;

    return {
      id: "draft-preview",
      invoice_number: "INV-DRAFT",
      invoice_date: invoiceDate,
      due_date: effectiveDueDate,
      customer_id: project.customer_id,
      customer_name: billedToType === "consignee" && selectedConsignee ? selectedConsignee.name : (project.customer_name || "Unknown Customer"),
      customer_address: customerAddress || project.customer_address,
      billed_to_type: billedToType,
      billed_to_consignee_id: billedToConsigneeId,
      project_number: selectedLineage.projectRefs.length === 1 ? selectedLineage.projectRefs[0] : project.project_number,
      booking_id: selectedLineage.bookingIds.length === 1 ? selectedLineage.bookingIds[0] : undefined,
      booking_ids: selectedLineage.bookingIds,
      line_items: finalLineItems,
      subtotal: subtotal,
      tax_amount: taxAmount,
      total_amount: grandTotal,
      currency: currency,
      notes: notes,
      payment_status: "unpaid",
      created_by_name: signatories.prepared_by.name,
      status: "draft",
      
      // New Fields
      exchange_rate: exchangeRate,
      original_currency: project.currency, // Store source currency context
      
      customer_tin: customerTin,
      bl_number: blNumber,
      consignee: consignee,
      commodity_description: commodityDescription,
      credit_terms: creditTerms,
      contract_number: selectedLineage.contractRefs.length === 1 ? selectedLineage.contractRefs[0] : undefined,
    } as Invoice;
  }, [mode, viewInvoice, selectedItems, selectedLineage, invoiceDate, dueDate, notes, project, currency, signatories, customerTin, blNumber, consignee, commodityDescription, creditTerms, itemOverrides, customerAddress, targetCurrency, exchangeRate, billedToType, selectedConsignee]);

  // Print Options Object
  const printOptions: InvoicePrintOptions = useMemo(() => ({
      signatories: signatories,
      display: displayOptions,
      custom_notes: notes
  }), [signatories, displayOptions, notes]);

  const handleDownloadPDF = useCallback(async () => {
    setIsGeneratingPDF(true);
    try {
      await downloadInvoicePDF(viewInvoice as any, printOptions);
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error("PDF generation failed. Try the print option instead.");
    } finally {
      setIsGeneratingPDF(false);
    }
  }, [viewInvoice, printOptions]);

  // -- Actions --

  // Create Mode Actions
  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
      if (!itemOverrides[id]) {
          setItemOverrides(prev => ({
              ...prev,
              [id]: { remarks: "", tax_type: "NON-VAT" }
          }));
      }
    }
    setSelectedIds(newSet);
  };

  const toggleAll = () => {
    if (selectedIds.size === unbilledItems.length) {
      setSelectedIds(new Set());
    } else {
      const newSet = new Set(unbilledItems.map(i => i.id));
      setSelectedIds(newSet);
      const newOverrides = { ...itemOverrides };
      unbilledItems.forEach(item => {
          if (!newOverrides[item.id]) {
              newOverrides[item.id] = { remarks: "", tax_type: "NON-VAT" };
          }
      });
      setItemOverrides(newOverrides);
    }
  };

  const updateItemOverride = (id: string, field: keyof ItemOverride, value: any) => {
      setItemOverrides(prev => ({
          ...prev,
          [id]: {
              ...prev[id] || { remarks: "", tax_type: "NON-VAT" },
              [field]: value
          }
      }));
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one billing item.");
      return;
    }

    try {
      setIsSubmitting(true);
      
      // -- HANDLE VIRTUAL ITEMS --
      let finalBillingItemIds = Array.from(selectedIds);
      const virtualIds = finalBillingItemIds.filter(id => id.startsWith('virtual-'));
      
      if (virtualIds.length > 0) {
          toast.info("Finalizing billing items...");
          
          const virtualItemsToSave = billingItems.filter(item => virtualIds.includes(item.id));
          
          // Prepare payload: remove virtual ID
          const itemsToSave = virtualItemsToSave.map(item => {
             // eslint-disable-next-line @typescript-eslint/no-unused-vars
             const { id, is_virtual, ...rest } = item as any;
             return {
                 ...rest,
                 project_id: project.id,
                 status: 'unbilled'
             };
          });

          const batchInsertItems = itemsToSave.map((item: any) => ({
              ...item,
              project_id: project.id,
              project_number: project.project_number,
              transaction_type: 'billing',
              status: 'unbilled',
              created_at: new Date().toISOString(),
          }));
          const { data: batchResult, error: batchSaveError } = await supabase.from('evouchers').insert(batchInsertItems).select();
          if (batchSaveError) throw new Error(batchSaveError.message);
          const savedItems: any[] = batchResult || [];
          const batchActor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
          savedItems.forEach(inv => logCreation("invoice", inv.id, inv.invoice_number ?? inv.id, batchActor));
          
          // Map Virtual IDs -> Real IDs
          const idMap = new Map<string, string>();
          virtualItemsToSave.forEach(vItem => {
              const match = savedItems.find((sItem: any) => 
                  (vItem.source_quotation_item_id && sItem.source_quotation_item_id === vItem.source_quotation_item_id) ||
                  (sItem.description === vItem.description && sItem.amount === vItem.amount)
              );
              if (match) {
                  idMap.set(vItem.id, match.id);
              }
          });
          
          // Replace virtual IDs with real IDs
          finalBillingItemIds = finalBillingItemIds.map(id => idMap.get(id) || id);
          
          // Refresh parent data if possible
          if (onRefreshData) {
              onRefreshData(); // Non-blocking
          }
      }


      // Generate invoice number (prefix + timestamp-based suffix)
      const invalidSelections = selectedItems.filter((item: any) => {
        const status = (item.status || "").toLowerCase();
        return status !== "unbilled" || item.invoice_id;
      });

      if (invalidSelections.length > 0) {
        toast.error("Only unbilled charge lines can be packaged into a new invoice. Refresh and try again.");
        return;
      }

      const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

      // Compute effective due date for persistence
      let effectiveDueDate = dueDate || undefined;
      if (!effectiveDueDate) {
          const d = new Date(invoiceDate);
          d.setDate(d.getDate() + 30);
          effectiveDueDate = d.toISOString().split('T')[0];
      }

      const invoiceRow = {
        id: crypto.randomUUID(),
        invoice_number: invoiceNumber,
        project_number: selectedLineage.projectRefs.length === 1 ? selectedLineage.projectRefs[0] : project.project_number,
        project_refs: selectedLineage.projectRefs,
        contract_refs: selectedLineage.contractRefs,
        customer_id: project.customer_id,
        customer_name: billedToType === "consignee" && selectedConsignee ? selectedConsignee.name : project.customer_name,
        booking_id: selectedLineage.bookingIds.length === 1 ? selectedLineage.bookingIds[0] : null,
        booking_ids: selectedLineage.bookingIds,
        billing_item_ids: finalBillingItemIds,
        invoice_date: invoiceDate,
        due_date: effectiveDueDate,
        payment_terms: creditTerms || 'NET 15',
        notes: notes,
        currency: targetCurrency,
        subtotal: draftInvoice.subtotal,
        total_amount: draftInvoice.total_amount,
        tax_amount: draftInvoice.tax_amount,
        status: 'posted',
        metadata: {
            signatories,
            displayOptions,
            billed_to_type: billedToType,
            billed_to_consignee_id: billedToConsigneeId || null,
            customer_address: customerAddress,
            exchange_rate: exchangeRate,
            original_currency: project.currency,
            revenue_account_id: revenueAccountId || null,
            line_items: draftInvoice.line_items,
            zone_a: {
                customer_tin: customerTin,
                bl_number: blNumber,
                consignee: consignee,
                commodity_description: commodityDescription,
                credit_terms: creditTerms
            },
            item_overrides: itemOverrides
        },
        created_at: new Date().toISOString(),
      };

      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .insert(invoiceRow)
        .select()
        .single();

      if (invoiceError) throw new Error(invoiceError.message);

      // Create draft journal entry for Accounting to review and post
      const jeId = `JE-INV-${Date.now()}`;
      await supabase.from("journal_entries").insert({
        id: jeId,
        entry_number: jeId,
        entry_date: new Date().toISOString(),
        invoice_id: invoiceData.id,
        description: `Invoice ${invoiceData.invoice_number} — ${invoiceRow.customer_name}`,
        reference: invoiceData.invoice_number,
        project_number: invoiceRow.project_number || null,
        customer_name: invoiceRow.customer_name || null,
        lines: [],
        total_debit: invoiceRow.total_amount,
        total_credit: invoiceRow.total_amount,
        status: "draft",
        created_by: user?.id ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
      logCreation("invoice", invoiceData.id, invoiceData.invoice_number ?? invoiceData.id, actor);

      // Mark selected billing items as invoiced
      const { error: updateError } = await supabase
        .from('billing_line_items')
        .update({ status: 'invoiced', invoice_id: invoiceData.id, invoice_number: invoiceData.invoice_number })
        .in('id', finalBillingItemIds);
      if (updateError) console.warn('[InvoiceBuilder] Failed to mark items as invoiced:', updateError.message);
      else logActivity("invoice", invoiceData.id, invoiceData.invoice_number ?? invoiceData.id, "updated", actor, { description: "Marked as invoiced" });

      toast.success(`Invoice ${invoiceData.invoice_number} created`);
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Error creating invoice:", error);
      toast.error("Failed to create invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Shared Actions
  const zoomIn = () => { setAutoScale(false); setScale(prev => Math.min(prev + 0.1, 1.5)); };
  const zoomOut = () => { setAutoScale(false); setScale(prev => Math.max(prev - 0.1, 0.4)); };
  const toggleFit = () => { setAutoScale(true); };
  
  const updateSignatory = (type: "prepared_by" | "approved_by", field: "name" | "title", value: string) => {
      setSignatories(prev => ({
          ...prev,
          [type]: { ...prev[type], [field]: value }
      }));
  };

  const toggleDisplay = (key: keyof typeof displayOptions) => {
      setDisplayOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Helper
  const formatCurrency = (amount: number, curr: string = "PHP") => {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: curr }).format(amount);
  };
  
  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  // Shared row renderer for billing items (used in both booking-grouped and category-grouped views)
  const renderBillingItemRow = (item: any) => {
    const isSelected = selectedIds.has(item.id);
    const override = itemOverrides[item.id] || { remarks: "", tax_type: "NON-VAT" };
    return (
      <div key={item.id} className={`group border-b border-[var(--neuron-pill-inactive-bg)] last:border-0 transition-all ${isSelected ? 'bg-[var(--theme-bg-surface-tint)]' : 'hover:bg-[var(--theme-bg-page)]'}`}>
        <div className="flex items-start px-4 py-3 cursor-pointer" onClick={() => toggleSelection(item.id)}>
            <div className="w-8 shrink-0 pt-1 flex items-center justify-center">
                <div className="relative flex items-center justify-center">
                    <input 
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(item.id)}
                        className="peer appearance-none w-4 h-4 rounded border border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] checked:bg-[var(--theme-action-primary-bg)] checked:border-[var(--theme-action-primary-bg)] focus:ring-0 focus:ring-offset-0 cursor-pointer transition-colors"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <Check className="w-3 h-3 text-white absolute pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                </div>
            </div>
            <div className="flex-1 px-3 min-w-0">
                <div className={`text-sm font-medium mb-1 ${isSelected ? 'text-[var(--theme-text-primary)]' : 'text-[var(--theme-text-secondary)]'}`}>
                    {item.description}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-[var(--theme-text-muted)]">
                    <span>{formatDate(item.created_at)}</span>
                </div>
            </div>
            <div className="shrink-0 text-right pl-2 pt-1">
                <div className={`text-sm font-bold whitespace-nowrap ${isSelected ? 'text-[var(--theme-text-primary)]' : 'text-[var(--theme-text-secondary)]'}`}>
                    {formatCurrency(item.amount, item.currency)}
                </div>
            </div>
        </div>
        {isSelected && (
            <div className="px-4 pb-4 pt-0 pl-14 cursor-default">
                <div className="p-3 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-lg grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                        <label className="block text-[10px] font-bold text-[var(--theme-text-muted)] mb-2 uppercase tracking-wide">Remarks</label>
                        <input 
                            type="text" 
                            value={override.remarks}
                            onChange={(e) => updateItemOverride(item.id, 'remarks', e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-[var(--theme-border-default)] rounded focus:ring-1 focus:ring-[var(--theme-action-primary-bg)] focus:border-[var(--theme-action-primary-bg)] outline-none transition-all placeholder:text-[var(--theme-text-muted)]"
                            placeholder="e.g. SERVICE CHARGE"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                    <div className="col-span-1" onClick={(e) => e.stopPropagation()}>
                        <label className="block text-[10px] font-bold text-[var(--theme-text-muted)] mb-2 uppercase tracking-wide">Tax</label>
                        <div className="flex items-center h-[34px]">
                            <label className="flex items-center gap-2 cursor-pointer group/tax select-none">
                                <div className="relative flex items-center justify-center">
                                    <input 
                                        type="checkbox"
                                        checked={override.tax_type === "VAT"}
                                        onChange={(e) => updateItemOverride(item.id, 'tax_type', e.target.checked ? "VAT" : "NON-VAT")}
                                        className="peer appearance-none w-4 h-4 rounded border border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] checked:bg-[var(--theme-action-primary-bg)] checked:border-[var(--theme-action-primary-bg)] focus:ring-0 focus:ring-offset-0 cursor-pointer transition-colors"
                                    />
                                    <Check className="w-3 h-3 text-white absolute pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                                </div>
                                <span className="text-xs font-medium text-[var(--theme-text-secondary)] group-hover/tax:text-[var(--theme-text-primary)] transition-colors">VAT (12%)</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex w-full h-full overflow-hidden bg-[var(--theme-bg-surface)]">
      {/* LEFT PANEL: Live Preview Stage */}
      <div className="w-2/5 bg-[var(--theme-bg-surface-subtle)] flex flex-col relative overflow-hidden border-r border-[var(--theme-border-default)]">
          
          {/* Canvas */}
          <div 
            ref={containerRef}
            className="flex-1 relative overflow-hidden flex items-center justify-center p-8"
          >
              <div className="absolute inset-0 overflow-auto flex items-center justify-center p-8 pb-32">
                   <div 
                      style={{ 
                          width: A4_WIDTH_PX * scale,
                          height: A4_HEIGHT_PX * scale,
                          transition: 'width 0.2s, height 0.2s',
                          position: 'relative'
                      }}
                   >
                       {/* The Paper */}
                       <div 
                           className="bg-[var(--theme-bg-surface)] origin-top-left"
                           style={{
                              width: '210mm',
                              minHeight: '297mm',
                              transform: `scale(${scale})`,
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0,0,0,0.02)'
                           }}
                       >
                          <InvoiceDocument
                              ref={componentRef}
                              project={project as unknown as Project}
                              invoice={draftInvoice}
                              mode="preview"
                              options={printOptions}
                          />
                       </div>
                   </div>
              </div>

              {/* Floating Zoom Controls */}
              <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-[var(--theme-bg-surface)]/90 backdrop-blur-sm border border-[var(--theme-border-default)] shadow-lg rounded-full px-4 py-2 flex items-center gap-4 z-30 transition-all hover:bg-[var(--theme-bg-surface)] hover:shadow-xl">
                   <button onClick={zoomOut} className="p-1.5 hover:bg-[var(--theme-bg-surface-subtle)] rounded-full text-[var(--theme-text-secondary)] transition-all" title="Zoom Out">
                      <ZoomOut size={18} />
                   </button>
                   <span className="text-sm font-medium text-[var(--theme-text-secondary)] w-12 text-center select-none tabular-nums">{Math.round(scale * 100)}%</span>
                   <button onClick={zoomIn} className="p-1.5 hover:bg-[var(--theme-bg-surface-subtle)] rounded-full text-[var(--theme-text-secondary)] transition-all" title="Zoom In">
                      <ZoomIn size={18} />
                   </button>
                   <div className="w-px h-4 bg-[var(--theme-bg-surface-tint)]" />
                   <button 
                      onClick={toggleFit} 
                      className={`flex items-center gap-2 px-2 py-1 rounded-md text-sm font-medium transition-all ${autoScale ? 'text-[var(--theme-action-primary-bg)] bg-[var(--theme-bg-surface-tint)]' : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-surface-subtle)]'}`}
                      title="Fit to Screen"
                   >
                      <Maximize size={16} />
                      <span>Fit</span>
                   </button>
              </div>
          </div>
      </div>

      {/* RIGHT PANEL: Controls Sidebar */}
      <div className="w-3/5 flex flex-col bg-[var(--theme-bg-surface)] z-20 border-l border-[var(--theme-border-default)]">

          {/* ── CREATE MODE: Tab Navigation ── */}
          {mode === 'create' && (
            <div className="flex shrink-0 border-b border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)]">
              {([
                { id: 'items' as CreateTab, label: 'Items', icon: FileText, allowed: canViewItemsTab },
                { id: 'details' as CreateTab, label: 'Details', icon: Calendar, allowed: canViewDetailsTab },
                { id: 'legal' as CreateTab, label: 'Shipment', icon: Truck, allowed: canViewLegalTab },
                { id: 'settings' as CreateTab, label: 'Settings', icon: Layout, allowed: canViewSettingsTab },
              ]).filter(({ allowed }) => allowed).map(({ id, label, icon: Icon }) => {
                const isActive = activeTab === id;
                return (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className="flex-1 flex flex-col items-center gap-0.5 pt-3 pb-2.5 transition-colors outline-none"
                    style={{
                      color: isActive ? 'var(--theme-action-primary-bg)' : 'var(--theme-text-muted)',
                      background: 'none',
                      border: 'none',
                      borderBottom: isActive ? '2px solid var(--theme-action-primary-bg)' : '2px solid transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <Icon size={15} />
                    <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── VIEW MODE: Invoice Summary Header ── */}
          {mode === 'view' && viewInvoice && (
            <div className="p-4 border-b border-[var(--theme-border-default)] shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--theme-text-muted)] mb-1">Invoice</p>
                  <p className="text-[15px] font-bold font-mono text-[var(--theme-text-primary)]">{viewInvoice.invoice_number}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--theme-text-muted)] mb-1">Total</p>
                  <p className="text-[15px] font-bold text-[var(--theme-text-primary)] tabular-nums">{formatCurrency(Number(viewInvoice.total_amount) || 0, viewInvoice.currency)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2.5">
                <span className="text-[11px] text-[var(--theme-text-muted)]">Issued {formatDate(viewInvoice.invoice_date || (viewInvoice as any).created_at || '')}</span>
                <span className="w-1 h-1 rounded-full bg-[var(--theme-text-muted)] opacity-30 shrink-0" />
                <span className="text-[11px] text-[var(--theme-text-muted)]">Due {formatDate(viewInvoice.due_date || '')}</span>
              </div>
            </div>
          )}

          {/* ── SCROLLABLE CONTENT AREA ── */}
          <div className={`flex-1 ${mode === 'create' && activeTab === 'items' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--theme-border-default)]'}`}>

            {/* ─── CREATE MODE: Items Tab ─── */}
            {mode === 'create' && activeTab === 'items' && canViewItemsTab && (
              <>
                {/* Table Header */}
                <div className="flex items-center bg-[var(--theme-bg-page)] border-b border-[var(--theme-border-default)] px-4 py-2.5 shrink-0">
                  <div className="w-8 shrink-0 flex items-center justify-center">
                    <div className="relative flex items-center justify-center">
                      <input
                        type="checkbox"
                        className="peer appearance-none w-4 h-4 rounded border border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] checked:bg-[var(--theme-action-primary-bg)] checked:border-[var(--theme-action-primary-bg)] focus:ring-0 focus:ring-offset-0 cursor-pointer transition-colors"
                        checked={unbilledItems.length > 0 && selectedIds.size === unbilledItems.length}
                        onChange={toggleAll}
                      />
                      <Check className="w-3 h-3 text-white absolute pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                    </div>
                  </div>
                  <div className="flex-1 px-3">
                    {hasBookings ? (
                      <button onClick={handleToggleAllBookings} className="flex items-center gap-2" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--theme-text-muted)", fontSize: "11px", fontWeight: 600, letterSpacing: "0.02em" }}>
                        <div style={{ transition: "transform 0.15s ease", transform: allBookingsExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}>
                          <ChevronDown size={12} />
                        </div>
                        <span>Particulars</span>
                      </button>
                    ) : (
                      <span className="text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.05em]">Particulars</span>
                    )}
                  </div>
                  <div className="text-right flex items-center gap-2.5">
                    <span className="text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.05em]">Amount</span>
                    {selectedIds.size > 0 && (
                      <span className="text-[10px] font-bold text-[var(--theme-action-primary-bg)] bg-[var(--theme-bg-surface-tint)] px-1.5 py-0.5 rounded-full">
                        {selectedIds.size}/{unbilledItems.length}
                      </span>
                    )}
                  </div>
                </div>

                {/* Items List */}
                <div className="flex-1 overflow-y-auto">
                  {unbilledItems.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center gap-2">
                      <FileText size={20} className="text-[var(--theme-text-muted)] opacity-40" />
                      <span className="text-sm text-[var(--theme-text-muted)]">No unbilled charges found.</span>
                    </div>
                  ) : hasBookings ? (
                    bookingGroupIds.map((bid, bidIdx) => {
                      const items = bookingGroupedData[bid] || [];
                      const meta = bookingMeta.get(bid);
                      const serviceType = bid === "unassigned" ? "Unassigned" : inferSvcType(bid, meta);
                      const subtotal = items.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
                      const isExpanded = expandedBookings.has(bid);
                      const itemCount = items.length;
                      return (
                        <div key={bid}>
                          <button
                            onClick={() => toggleBooking(bid)}
                            className="w-full flex items-center justify-between transition-colors"
                            style={{ padding: "8px 16px", background: isExpanded ? "var(--theme-bg-surface-tint)" : "var(--theme-bg-page)", border: "none", borderTop: bidIdx > 0 ? "1px solid var(--theme-border-default)" : "none", borderBottom: isExpanded ? "1px solid var(--theme-border-default)" : "none", cursor: "pointer" }}
                          >
                            <div className="flex items-center gap-2.5">
                              <div style={{ color: "var(--theme-text-muted)", transition: "transform 0.15s ease", transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}>
                                <ChevronDown size={13} />
                              </div>
                              {bid !== "unassigned" && getServiceIcon(serviceType, { size: 13, color: "var(--theme-action-primary-bg)" })}
                              <span style={{ fontSize: "11px", fontWeight: 600, color: bid === "unassigned" ? "var(--theme-text-muted)" : "var(--theme-action-primary-bg)", fontFamily: "monospace" }}>
                                {bid === "unassigned" ? "Unassigned Items" : (meta?.bookingNumber || bid)}
                              </span>
                              {bid !== "unassigned" && (
                                <span style={{ fontSize: "9px", fontWeight: 600, color: "var(--theme-text-muted)", padding: "1px 5px", backgroundColor: "var(--theme-bg-surface-subtle)", borderRadius: "3px", border: "1px solid var(--theme-border-default)" }}>
                                  {serviceType}
                                </span>
                              )}
                              <span style={{ fontSize: "9px", fontWeight: 600, color: "var(--theme-text-muted)", padding: "1px 5px", backgroundColor: "var(--theme-bg-surface-subtle)", borderRadius: "3px", border: "1px solid var(--theme-border-default)" }}>
                                {itemCount} item{itemCount !== 1 ? "s" : ""}
                              </span>
                            </div>
                            <span style={{ fontSize: "12px", fontWeight: 600, color: itemCount === 0 ? "var(--theme-text-muted)" : "var(--theme-text-primary)", fontFamily: "monospace" }}>
                              {formatCurrency(subtotal)}
                            </span>
                          </button>
                          {isExpanded && items.map((item: any) => renderBillingItemRow(item))}
                        </div>
                      );
                    })
                  ) : (
                    Object.entries(unbilledItems.reduce((acc: Record<string, any[]>, item: any) => {
                      let key = item.service_type || "Freight Charges";
                      const desc = (item.description || "").toLowerCase();
                      if (key === "Reimbursable Expense") { key = "Billable Expense"; }
                      else if (key === "General" || key === "Freight Charges") {
                        if (desc.includes("trucking") || desc.includes("customs") || desc.includes("fee") || desc.includes("handling") || desc.includes("thc")) { key = "Origin Charges"; }
                        else if (desc.includes("freight") || desc.includes("ocean")) { key = "Freight Charges"; }
                        else { key = "Freight Charges"; }
                      }
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(item);
                      return acc;
                    }, {} as Record<string, any[]>))
                    .sort(([a], [b]) => {
                      const order: Record<string, number> = { "Freight Charges": 1, "Origin Charges": 2, "Destination Charges": 3, "Billable Expense": 4 };
                      return (order[a] || 99) - (order[b] || 99);
                    })
                    .map(([category, items]) => (
                      <div key={category}>
                        <div className="px-4 py-2 bg-[var(--theme-bg-surface-subtle)] border-b border-[var(--neuron-pill-inactive-bg)] text-[10px] font-bold text-[var(--theme-text-muted)] uppercase tracking-wider flex items-center gap-2 sticky top-0 z-10">
                          <div className="w-1 h-1 rounded-full bg-[var(--theme-text-muted)]" />
                          {category}
                          <span className="text-[9px] ml-auto bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] px-1.5 rounded-full text-[var(--theme-text-muted)]">{items.length}</span>
                        </div>
                        {items.map((item: any) => renderBillingItemRow(item))}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {/* ─── CREATE MODE: Details Tab ─── */}
            {mode === 'create' && activeTab === 'details' && canViewDetailsTab && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--theme-text-muted)] mb-1.5 uppercase tracking-wider">Invoice Date</label>
                    <input
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)] outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--theme-text-muted)] mb-1.5 uppercase tracking-wider">Due Date</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)] outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--theme-text-muted)] mb-1.5 uppercase tracking-wider">Credit Terms</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-2.5 text-[var(--theme-text-muted)]" size={14} />
                    <input
                      type="text"
                      value={creditTerms}
                      onChange={(e) => setCreditTerms(e.target.value)}
                      placeholder="e.g. NET 15, NET 30, COD"
                      className="w-full pl-9 pr-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)] outline-none transition-all placeholder:text-[var(--theme-text-muted)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--theme-text-muted)] mb-1.5 uppercase tracking-wider">Notes / Memo</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    placeholder="Add payment instructions or notes..."
                    className="w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)] outline-none resize-none transition-all"
                  />
                </div>
              </div>
            )}

            {/* ─── CREATE MODE: Shipment Tab ─── */}
            {mode === 'create' && activeTab === 'legal' && canViewLegalTab && (
              <div className="p-5 space-y-4">
                {/* Bill To Toggle */}
                <div>
                  <label className="block text-[11px] font-bold text-[var(--theme-text-muted)] mb-1.5 uppercase tracking-wider">Bill To</label>
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => handleBillToChange("customer")}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
                      style={{ backgroundColor: billedToType === "customer" ? "var(--theme-action-primary-bg)" : "var(--neuron-pill-inactive-bg)", color: billedToType === "customer" ? "#FFFFFF" : "var(--theme-text-muted)", border: billedToType === "customer" ? "1px solid var(--theme-action-primary-bg)" : "1px solid var(--theme-border-default)" }}
                    >
                      Customer
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBillToChange("consignee")}
                      disabled={customerConsignees.length === 0}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ backgroundColor: billedToType === "consignee" ? "var(--theme-action-primary-bg)" : "var(--neuron-pill-inactive-bg)", color: billedToType === "consignee" ? "#FFFFFF" : "var(--theme-text-muted)", border: billedToType === "consignee" ? "1px solid var(--theme-action-primary-bg)" : "1px solid var(--theme-border-default)" }}
                    >
                      Consignee
                    </button>
                    {customerConsignees.length === 0 && (
                      <span className="text-[11px] italic" style={{ color: "var(--theme-text-muted)" }}>No consignees saved</span>
                    )}
                  </div>

                  {billedToType === "consignee" && customerConsignees.length > 0 && (
                    <div className="mb-3">
                      <label className="block text-[11px] font-bold text-[var(--theme-text-muted)] mb-1.5 uppercase tracking-wider">Select Consignee</label>
                      <select
                        value={billedToConsigneeId || ""}
                        onChange={(e) => handleBillToConsigneeSelect(e.target.value)}
                        className="w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)] outline-none transition-all"
                        style={{ color: billedToConsigneeId ? "var(--theme-text-primary)" : "var(--theme-text-muted)" }}
                      >
                        <option value="" disabled>Choose a consignee...</option>
                        {customerConsignees.map(csg => (
                          <option key={csg.id} value={csg.id}>{csg.name}{csg.tin ? ` (TIN: ${csg.tin})` : ""}</option>
                        ))}
                      </select>
                      {selectedConsignee && (
                        <div className="mt-2 px-3 py-2 rounded-md text-[12px]" style={{ backgroundColor: "var(--theme-bg-surface-tint)", color: "var(--theme-text-primary)" }}>
                          <span className="font-medium">Billing as:</span> {selectedConsignee.name}
                          {selectedConsignee.address && <span className="text-[11px] ml-2" style={{ color: "var(--theme-text-muted)" }}>• {selectedConsignee.address}</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--theme-text-muted)] mb-1.5 uppercase tracking-wider">Bill To Address</label>
                  <textarea
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    rows={2}
                    placeholder="Enter customer address"
                    className="w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)] outline-none resize-none transition-all placeholder:text-[var(--theme-text-muted)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--theme-text-muted)] mb-1.5 uppercase tracking-wider">Customer TIN</label>
                  <input
                    type="text"
                    value={customerTin}
                    onChange={(e) => setCustomerTin(e.target.value)}
                    placeholder="000-000-000-000"
                    className="w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)] outline-none transition-all placeholder:text-[var(--theme-text-muted)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--theme-text-muted)] mb-1.5 uppercase tracking-wider">BL No.</label>
                  <input
                    type="text"
                    value={blNumber}
                    onChange={(e) => setBlNumber(e.target.value)}
                    placeholder="e.g. KULA2503335"
                    className="w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)] outline-none transition-all placeholder:text-[var(--theme-text-muted)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--theme-text-muted)] mb-1.5 uppercase tracking-wider">Consignee</label>
                  <input
                    type="text"
                    value={consignee}
                    onChange={(e) => setConsignee(e.target.value)}
                    placeholder="Consignee Name"
                    className="w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)] outline-none transition-all placeholder:text-[var(--theme-text-muted)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--theme-text-muted)] mb-1.5 uppercase tracking-wider">Commodity Desc.</label>
                  <div className="relative">
                    <Box className="absolute left-3 top-2.5 text-[var(--theme-text-muted)]" size={14} />
                    <input
                      type="text"
                      value={commodityDescription}
                      onChange={(e) => setCommodityDescription(e.target.value)}
                      placeholder="e.g. AIR / STC: LEAD FRAME"
                      className="w-full pl-9 pr-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)] outline-none transition-all placeholder:text-[var(--theme-text-muted)]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ─── CREATE MODE: Settings Tab ─── */}
            {mode === 'create' && activeTab === 'settings' && canViewSettingsTab && (
              <div className="p-5 space-y-6">
                {/* Currency & GL */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--theme-text-muted)] mb-3">Currency & GL</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.05em] mb-1.5">Invoice Currency</label>
                      <div className="relative">
                        <select
                          value={targetCurrency}
                          onChange={(e) => setTargetCurrency(e.target.value)}
                          className="w-full h-9 pl-3 pr-8 text-sm border border-[var(--theme-border-default)] rounded-md focus:ring-[var(--theme-action-primary-bg)] focus:border-[var(--theme-action-primary-bg)] appearance-none bg-[var(--theme-bg-surface)]"
                        >
                          <option value="PHP">PHP (Philippine Peso)</option>
                          <option value="USD">USD (US Dollar)</option>
                        </select>
                        <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-[var(--theme-text-muted)] pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.05em] mb-1.5">Exchange Rate</label>
                      <input
                        type="number"
                        step="0.01"
                        value={exchangeRate}
                        onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)}
                        className="w-full h-9 pl-3 pr-3 text-sm border border-[var(--theme-border-default)] rounded-md focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)] outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.05em] mb-1.5">Revenue Account</label>
                      <CustomDropdown
                        value={revenueAccountId}
                        onChange={setRevenueAccountId}
                        options={accounts.map(acc => ({ value: acc.id, label: acc.code ? `${acc.code} - ${acc.name}` : acc.name }))}
                        placeholder="Select Revenue Account..."
                        fullWidth
                        size="sm"
                      />
                    </div>
                    {selectedItems.some(i => i.currency !== targetCurrency) && (
                      <div className="bg-[var(--theme-status-warning-bg)] border border-[var(--theme-status-warning-border)] rounded-md p-3 text-xs text-[var(--theme-status-warning-fg)] flex items-start gap-2">
                        <RefreshCw className="w-4 h-4 shrink-0 mt-0.5" />
                        <div><span className="font-semibold">Conversion Active:</span> Items not in {targetCurrency} will be converted using rate {exchangeRate}.</div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="h-px bg-[var(--theme-border-default)]" />

                {/* Signatories */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--theme-text-muted)] mb-3">Signatories</p>
                  <SignatoryControl
                    preparedBy={signatories.prepared_by}
                    approvedBy={signatories.approved_by}
                    onUpdate={updateSignatory}
                  />
                </div>

                <div className="h-px bg-[var(--theme-border-default)]" />

                {/* Display Options */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--theme-text-muted)] mb-3">Display Options</p>
                  <DisplayOptionsControl options={displayOptions} onToggle={toggleDisplay} />
                </div>
              </div>
            )}

            {/* ─── VIEW MODE CONTENT ─── */}
            {mode === 'view' && (
              <div className="p-5 space-y-5">
                {/* Custom Notes */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--theme-text-muted)] mb-2">Print Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3.5 py-3 text-sm border border-[var(--theme-border-default)] rounded-lg focus:border-[var(--theme-action-primary-bg)] focus:ring-1 focus:ring-[var(--theme-action-primary-bg)] outline-none transition-all placeholder:text-[var(--theme-text-muted)] resize-none"
                    placeholder="Add custom notes for this printout..."
                  />
                </div>

                <div className="h-px bg-[var(--theme-border-default)]" />

                {/* Signatories */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--theme-text-muted)] mb-3">Signatories</p>
                  <SignatoryControl
                    preparedBy={signatories.prepared_by}
                    approvedBy={signatories.approved_by}
                    onUpdate={updateSignatory}
                  />
                  <p className="text-[10px] text-[var(--theme-text-muted)] mt-3 italic">Changes affect print output only.</p>
                </div>

                <div className="h-px bg-[var(--theme-border-default)]" />

                {/* Display Options */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--theme-text-muted)] mb-3">Display Options</p>
                  <DisplayOptionsControl options={displayOptions} onToggle={toggleDisplay} />
                </div>
              </div>
            )}
          </div>

          {/* ── FOOTER: Actions & Totals ── */}
          <div className="p-4 border-t border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] shrink-0">
            {mode === 'create' ? (
              <>
                {/* Totals */}
                <div className="mb-4 space-y-1.5">
                  <div className="flex justify-between text-[12px]">
                    <span className="text-[var(--theme-text-muted)]">Subtotal</span>
                    <span className="font-medium text-[var(--theme-text-secondary)]">{formatCurrency(Number(draftInvoice.subtotal), currency)}</span>
                  </div>
                  <div className="flex justify-between text-[12px]">
                    <span className="text-[var(--theme-text-muted)]">Tax</span>
                    <span className="font-medium text-[var(--theme-text-secondary)]">{formatCurrency(Number(draftInvoice.tax_amount) || 0, currency)}</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-2.5 border-t border-[var(--theme-border-default)]">
                    <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--theme-text-muted)]">Total</span>
                    <span className="text-[22px] font-bold text-[var(--theme-text-primary)] tabular-nums leading-none">{formatCurrency(Number(draftInvoice.total_amount), currency)}</span>
                  </div>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || selectedIds.size === 0}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 text-[13px] font-bold text-white bg-[var(--theme-action-primary-bg)] rounded-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check size={16} />
                  )}
                  {isSubmitting ? "Creating..." : "Create & Finalize"}
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={handleDownloadPDF}
                  disabled={isGeneratingPDF}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 text-[13px] font-bold text-white bg-[var(--theme-action-primary-bg)] rounded-lg hover:opacity-90 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isGeneratingPDF ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  {isGeneratingPDF ? "Generating..." : "Download PDF"}
                </button>
                <button
                  onClick={handlePrint}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-[13px] font-medium text-[var(--theme-text-secondary)] border border-[var(--theme-border-default)] rounded-lg hover:bg-[var(--theme-bg-surface-subtle)] transition-all"
                >
                  <Printer size={15} />
                  Print
                </button>
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
