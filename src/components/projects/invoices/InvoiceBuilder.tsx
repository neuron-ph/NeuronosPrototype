import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Loader2, ZoomIn, ZoomOut, Maximize, ChevronDown, Layout, Check, FileText, Calendar, Box, Truck, CreditCard, Download, Printer, RefreshCw, AlertTriangle, Trash2, ShieldCheck, Ban } from "lucide-react";
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
import { downloadInvoicePDF, printInvoicePDF } from "./InvoicePDFRenderer";
import { SignatoryControl } from "../quotation/screen/controls/SignatoryControl";
import { BankDetailsControl } from "../quotation/screen/controls/BankDetailsControl";
import { DisplayOptionsControl } from "../quotation/screen/controls/DisplayOptionsControl";
import { CustomDropdown } from "../../bd/CustomDropdown";
import { useBookingGrouping } from "../../../hooks/useBookingGrouping";
import { getServiceIcon } from "../../../utils/quotation-helpers";
import { useConsignees } from "../../../hooks/useConsignees";
import type { Consignee } from "../../../types/bd";
import {
  FUNCTIONAL_CURRENCY,
  formatMoney,
  normalizeCurrency,
  resolvePostingRate,
  roundMoney,
  toBaseAmount,
  type AccountingCurrency,
} from "../../../utils/accountingCurrency";
import { recordNotificationEvent } from "../../../utils/notifications";
import { useCompanySettings, useUpdateCompanySettings } from "../../../hooks/useCompanySettings";
import { parseCreditTermDays } from "../../../utils/creditTerms";
import { buildCatalogSnapshot } from "../../../utils/catalogSnapshot";
import { useCreditTerms } from "../../../hooks/useCreditTerms";
import { useBankAccounts } from "../../../hooks/useBankAccounts";
import { normalizeDetails } from "../../../utils/bookings/bookingDetailsCompat";


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

  /** NEU-020 door purity: the grid row (door key) this builder is rendered behind,
   *  e.g. "ops_trucking_invoices_tab". When provided, ONLY that key's
   *  create/edit/delete/export govern this surface — no OR-gate, no foreign keys.
   *  Transitional: parents not yet threaded fall back to the NEU-019 OR-gate;
   *  the fallback is removed once every parent passes its door. */
  permissionDoor?: string;
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
  onRefreshData,
  permissionDoor
}: InvoiceBuilderProps) {
  // -- Common State --
  const { user } = useUser();
  const { settings: companySettings } = useCompanySettings();
  // NEU-071: Profiling-managed invoice lookups.
  const { creditTerms: creditTermsList } = useCreditTerms();
  const { bankAccounts } = useBankAccounts();
  const { can } = usePermission();
  // NEU-019 WG-06: the invoice lifecycle (draft/finalize/delete/void) wrote with
  // no permission beyond tab views. Same OR-gate family as billings/collections
  // (NEU-017) — any invoice-write key authorizes; delete stays accounting-only.
  const canKey = can as unknown as (moduleId: string, action: string) => boolean;
  // NEU-020 door purity: with a door, only that key governs. Without one
  // (transitional), the NEU-019 OR-gate still applies until every parent
  // threads its door — then the fallback dies.
  // 2.6-final: acct_financials master key retired (holders seeded into
  // accounting_financials_invoices_tab). Transitional fallback now master-free.
  const canWriteInvoices = permissionDoor
    ? ["create", "edit"].some(a => canKey(permissionDoor, a))
    : ["create", "edit"].some(a =>
        canKey("accounting_financials_invoices_tab", a) ||
        canKey("ops_bookings_invoices_tab", a) ||
        canKey("ops_projects_invoices_tab", a));
  const canDeleteInvoices = permissionDoor
    ? canKey(permissionDoor, "delete")
    : canKey("accounting_financials_invoices_tab", "delete");
  // NEU-020 DD-3: PDF/Print are export-class. With a door, the door's export
  // toggle governs. Without one (transitional fallback), exports stay open —
  // current behavior — so unthreaded parents don't lose printing before their batch.
  const canExportInvoices = permissionDoor ? canKey(permissionDoor, "export") : true;
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

  // Print is handled via the PDF engine (printInvoicePDF) — defined below next to
  // handleDownloadPDF, since it needs printOptions/companySettings. The old
  // window.open + document.write approach was unreliable (popup-blocked, images
  // raced print(), and the dialog rendered a blank/about:blank page).

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

  // Doctrine D1 (NEU-077): every invoice must be booking-linked. The invoice is
  // tied to exactly one booking — auto-selected when the project has one,
  // chosen when it has several, blocked when it has none.
  const [selectedBookingId, setSelectedBookingId] = useState<string>("");

  // -- Shared Options State --
  const [signatories, setSignatories] = useState({
      prepared_by: { name: "System User", title: "Authorized User" },
      checked_by: { name: "", title: "" },
      approved_by: { name: "MANAGEMENT", title: "Authorized Signatory" }
  });
  
  const [displayOptions, setDisplayOptions] = useState({
      show_bank_details: true,
      show_notes: true,
      show_letterhead: true,
      show_tax_summary: true
  });

  // NEU-055: bank details shown on the invoice. Seeded from the company default
  // (Profiling), editable per-invoice, and "Save as company default" writes back.
  const [bankDetails, setBankDetails] = useState({ bank_name: "", account_name: "", account_number: "" });
  const updateCompanySettings = useUpdateCompanySettings();

  // NEU-071: Profiling-managed selectors. Credit terms falls back to a free-text
  // "Custom…" entry; bank details can be picked from a profiled account.
  const [useCustomTerms, setUseCustomTerms] = useState(false);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState("");

  // Prefer a profiled term's net_days; fall back to parsing the label.
  const getNetDays = (label: string): number => {
    const t = creditTermsList.find((ct) => ct.label === label);
    return t ? t.net_days : parseCreditTermDays(label);
  };

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

  // Doctrine D1 (NEU-077): the project's bookings — the invoice must attach to one.
  const { data: projectBookings = [] } = useQuery({
    queryKey: ["invoice-project-bookings", project.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        // NEU-082: pull `details` too so the invoice can prefill BL / Consignee /
        // Commodity from the shipment record of the selected booking.
        // NEU-083 fix: the container may be a PROJECT (match its bookings by
        // project_id) or a single BOOKING (booking detail pages pass a
        // bookingContainer whose id IS the booking id) — match that booking by
        // its own id too, so the invoice number resolves in both surfaces.
        // Project ids ("proj-…") and booking ids (uuid) never collide.
        .select("id, booking_number, service_type, details")
        .or(`project_id.eq.${project.id},id.eq.${project.id}`)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as Array<{ id: string; booking_number: string; service_type: string; details: Record<string, unknown> | null }>;
    },
    enabled: mode === "create" && !!project.id,
    staleTime: 30_000,
  });

  // Auto-select when the project has exactly one booking.
  useEffect(() => {
    if (mode !== "create") return;
    if (projectBookings.length === 1) setSelectedBookingId(projectBookings[0].id);
    else if (!projectBookings.some(b => b.id === selectedBookingId)) setSelectedBookingId("");
  }, [mode, projectBookings, selectedBookingId]);

  // NEU-083: live preview of the invoice number [BookingNumber]-XXX (001 = first
  // invoice for the booking). Mirrors the save-time logic in handleSubmit so the
  // draft preview shows exactly what will persist — no more "INV-DRAFT" placeholder.
  const previewBookingNumber = projectBookings.find(b => b.id === selectedBookingId)?.booking_number || "";
  const { data: previewSeq = 1 } = useQuery({
    queryKey: ["invoice-number-preview", previewBookingNumber],
    queryFn: async () => {
      const { count } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .ilike("invoice_number", `${previewBookingNumber}-%`);
      return (count || 0) + 1;
    },
    enabled: mode === "create" && !!previewBookingNumber,
    staleTime: 10_000,
  });
  const previewInvoiceNumber = previewBookingNumber
    ? `${previewBookingNumber}-${String(previewSeq).padStart(3, "0")}`
    : "INV-DRAFT";

  // NEU-082: prefill BL No. / Consignee / Commodity from the selected booking's
  // shipment details (BL = House BL, falling back to Master BL). Prefill runs
  // once per booking selection — the user can still override each field, and
  // switching bookings re-seeds from the new one. Consignee prints on the
  // invoice; Shipper stays on the booking only (per Marcus 7/13).
  const prefilledBookingRef = useRef<string>("");
  useEffect(() => {
    if (mode !== "create" || !selectedBookingId) return;
    if (prefilledBookingRef.current === selectedBookingId) return;
    const bk = projectBookings.find(b => b.id === selectedBookingId);
    if (!bk) return;
    const d = normalizeDetails((bk.details as Record<string, unknown>) || {}, bk.service_type);
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const bkConsignee = str(d.consignee);
    const bkCommodity = str(d.commodity_description);
    const bkBl = str(d.hbl_hawb) || str(d.mbl_mawb);
    if (bkConsignee) setConsignee(bkConsignee);
    if (bkCommodity) setCommodityDescription(bkCommodity);
    if (bkBl) setBlNumber(bkBl);
    prefilledBookingRef.current = selectedBookingId;
  }, [mode, selectedBookingId, projectBookings]);

  // -- Initialization / Effects --

  // 1. If View Mode, load data into state
  useEffect(() => {
    if (mode === 'view' && viewInvoice) {
        // Load notes
        setNotes((viewInvoice.notes as string) || "");

        // NEU-055: restore this invoice's saved bank block (falls back to the
        // company default via the seed effect when the invoice has none).
        const bd = ((viewInvoice as any).metadata || {}).bank_details;
        if (bd && (bd.bank_name || bd.account_name || bd.account_number)) setBankDetails(bd);

        // Load metadata (signatories, display options) if available
        const metadata = (viewInvoice as any).metadata || {};
        if (metadata.signatories) setSignatories(prev => ({ ...prev, ...metadata.signatories }));
        else {
             // Fallback default for View
             setSignatories({
                prepared_by: { name: (viewInvoice.created_by_name as string) || "System User", title: "Authorized User" },
                checked_by: { name: "", title: "" },
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
         d.setDate(d.getDate() + getNetDays(creditTerms));
         effectiveDueDate = d.toISOString().split('T')[0];
    }
    
    let subtotal = 0;
    let taxAmount = 0;

    const finalLineItems: BillingLineItem[] = (selectedItems.map((item: any) => {
        const override = itemOverrides[item.id] || { remarks: "", tax_type: "NON-VAT" };
        
        // Multi-Currency Calculation
        // Convention: `exchangeRate` is the non-PHP↔PHP rate (e.g. USD→PHP = 58).
        //   - target=PHP, source=USD → finalAmount = source × rate
        //   - target=USD, source=PHP → finalAmount = source / rate
        //   - same currency → unchanged
        const originalAmount = Number(item.amount) || 0;
        const sourceCurrency = item.currency || targetCurrency;
        let finalAmount = originalAmount;
        let itemRateUsed = 1;

        if (sourceCurrency !== targetCurrency) {
            const rate = Number(exchangeRate);
            if (!Number.isFinite(rate) || rate <= 0) {
                finalAmount = originalAmount;
            } else if (targetCurrency === "PHP" && sourceCurrency !== "PHP") {
                finalAmount = roundMoney(originalAmount * rate);
                itemRateUsed = rate;
            } else if (targetCurrency !== "PHP" && sourceCurrency === "PHP") {
                finalAmount = roundMoney(originalAmount / rate);
                itemRateUsed = rate;
            } else {
                // Cross non-PHP (e.g. USD→EUR) — unsupported single-rate path; pass through.
                finalAmount = originalAmount;
                itemRateUsed = rate;
            }
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
            // NEU-058: carry the source classification so the printed invoice can
            // group charges into subtotals (Billable vs service charges).
            source_type: item.source_type,

            // Snapshot Strategy Fields
            original_amount: originalAmount,
            original_currency: item.currency,
            exchange_rate: itemRateUsed
        };
    })) as unknown as BillingLineItem[];

    const grandTotal = subtotal + taxAmount;

    return {
      id: "draft-preview",
      invoice_number: previewInvoiceNumber,
      invoice_date: invoiceDate,
      due_date: effectiveDueDate,
      customer_id: project.customer_id,
      customer_name: billedToType === "consignee" && selectedConsignee ? selectedConsignee.name : (project.customer_name || "Unknown Customer"),
      customer_address: customerAddress || project.customer_address,
      billed_to_type: billedToType,
      billed_to_consignee_id: billedToConsigneeId,
      project_number: selectedLineage.projectRefs.length === 1 ? selectedLineage.projectRefs[0] : project.project_number,
      booking_id: selectedBookingId || undefined,
      booking_ids: selectedBookingId ? [selectedBookingId] : [],
      booking_number: projectBookings.find(b => b.id === selectedBookingId)?.booking_number,
      service_type: projectBookings.find(b => b.id === selectedBookingId)?.service_type, // NEU-058 group label
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
  }, [mode, viewInvoice, selectedItems, selectedLineage, invoiceDate, dueDate, notes, project, currency, signatories, customerTin, blNumber, consignee, commodityDescription, creditTerms, itemOverrides, customerAddress, targetCurrency, exchangeRate, billedToType, selectedConsignee, selectedBookingId, projectBookings, creditTermsList, previewInvoiceNumber]);

  // NEU-055/071: seed the bank block once while empty (per-invoice edits win) —
  // prefer a profiled bank account (currency-matched), else the company default.
  useEffect(() => {
    if (bankDetails.bank_name || bankDetails.account_name || bankDetails.account_number) return;
    if (bankAccounts.length > 0) {
      const match = bankAccounts.find(b => (b.currency || "").toUpperCase() === (targetCurrency || "").toUpperCase()) || bankAccounts[0];
      setSelectedBankAccountId(match.id);
      setBankDetails({ bank_name: match.bank_name, account_name: match.account_name, account_number: match.account_number });
    } else if (companySettings?.bank_name || companySettings?.bank_account_number) {
      setBankDetails({
        bank_name: companySettings.bank_name || "",
        account_name: companySettings.bank_account_name || "",
        account_number: companySettings.bank_account_number || "",
      });
    }
  }, [companySettings, bankAccounts, targetCurrency, bankDetails.bank_name, bankDetails.account_name, bankDetails.account_number]);

  // NEU-071: pick a profiled bank account → fill the (still-editable) bank block.
  const selectBankAccount = (id: string) => {
    setSelectedBankAccountId(id);
    const acct = bankAccounts.find(b => b.id === id);
    if (acct) setBankDetails({ bank_name: acct.bank_name, account_name: acct.account_name, account_number: acct.account_number });
  };

  const updateBankDetail = (field: "bank_name" | "account_name" | "account_number", value: string) => {
    setSelectedBankAccountId(""); // manual edit = custom, no longer a profiled account
    setBankDetails(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveBankDefault = () => {
    updateCompanySettings.mutate(
      {
        bank_name: bankDetails.bank_name || null,
        bank_account_name: bankDetails.account_name || null,
        bank_account_number: bankDetails.account_number || null,
      },
      {
        onSuccess: () => toast.success("Saved as company default"),
        onError: () => toast.error("Failed to save company default"),
      }
    );
  };

  const printOptions: InvoicePrintOptions = useMemo(() => ({
      signatories: signatories,
      display: displayOptions,
      custom_notes: notes,
      bank_details: bankDetails,
  }), [signatories, displayOptions, notes, bankDetails]);

  const handleDownloadPDF = useCallback(async () => {
    setIsGeneratingPDF(true);
    try {
      await downloadInvoicePDF(viewInvoice as any, printOptions, companySettings);
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error("PDF generation failed. Try the print option instead.");
    } finally {
      setIsGeneratingPDF(false);
    }
  }, [viewInvoice, printOptions, companySettings]);

  // Print via the PDF engine (hidden iframe) — same output as the download,
  // reliable across browsers. Replaces the old popup/document.write approach.
  const handlePrint = useCallback(async () => {
    if (!viewInvoice) {
      toast.error("Open an invoice to print.");
      return;
    }
    setIsGeneratingPDF(true);
    try {
      await printInvoicePDF(viewInvoice as any, printOptions, companySettings);
    } catch (err) {
      console.error("Print failed:", err);
      toast.error("Failed to prepare print. Try the PDF download instead.");
    } finally {
      setIsGeneratingPDF(false);
    }
  }, [viewInvoice, printOptions, companySettings]);

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
    if (!canWriteInvoices) return; // WG-06 backstop
    if (selectedIds.size === 0) {
      toast.error("Please select at least one billing item.");
      return;
    }
    // Doctrine D1 (NEU-077): an invoice must be booking-linked.
    if (projectBookings.length === 0) {
      toast.error("This project has no booking. Create a booking before invoicing.");
      return;
    }
    if (!selectedBookingId) {
      toast.error("Select the booking this invoice belongs to.");
      return;
    }
    const invoiceBooking = projectBookings.find(b => b.id === selectedBookingId);

    try {
      setIsSubmitting(true);
      
      // -- HANDLE VIRTUAL ITEMS --
      let finalBillingItemIds = Array.from(selectedIds);
      const virtualIds = finalBillingItemIds.filter(id => id.startsWith('virtual-'));
      
      if (virtualIds.length > 0) {
          toast.info("Finalizing billing items...");
          
          const virtualItemsToSave = billingItems.filter(item => virtualIds.includes(item.id));

          // Billing charges are NOT e-vouchers — persist them as real
          // billing_line_items (the invoice references these). Mirror the
          // canonical mapping in UnifiedBillingsTab: explicit column whitelist +
          // catalog snapshot, dropping stray quotation-item fields (amount_added,
          // percentage_added, base_cost, forex_rate…) that aren't columns here.
          const batchInsertItems = virtualItemsToSave.map((item: any) => {
            const lineCurrency = item.currency || "PHP";
            const rawRate = Number(item.exchange_rate ?? item.forex_rate);
            const lineRate = lineCurrency === "PHP"
              ? 1
              : (Number.isFinite(rawRate) && rawRate > 0 ? rawRate : null);
            const lineAmount = Number(item.amount || 0);
            const category = item.category || item.quotation_category || null;
            return {
              id: crypto.randomUUID(),
              // D1: stamp the invoice's booking onto the charge so billings are
              // booking-linked too (auto-assigns raw project/quotation charges).
              booking_id: selectedBookingId,
              booking_number: invoiceBooking?.booking_number || null,
              project_id: project.id,
              project_number: project.project_number,
              description: item.description || "",
              service_type: item.service_type || "",
              category,
              quotation_category: category,
              amount: lineAmount,
              quantity: item.quantity || 1,
              unit_price: item.unit_price ?? item.amount ?? 0,
              currency: lineCurrency,
              exchange_rate: lineRate,
              base_currency: "PHP",
              base_amount: lineRate === null ? null : Math.round(lineAmount * lineRate * 100) / 100,
              status: 'unbilled',
              is_taxed: item.is_taxed || false,
              tax_code: item.tax_code || null,
              unit_type: item.unit_type || null,
              catalog_item_id: item.catalog_item_id || null,
              catalog_snapshot: item.catalog_item_id
                ? buildCatalogSnapshot(
                    { description: item.description, unit_type: item.unit_type, tax_code: item.tax_code, amount: item.amount, currency: item.currency },
                    category
                  )
                : (item.catalog_snapshot || null),
              source_id: item.source_id || null,
              source_type: item.source_type || (item.source_quotation_item_id ? "quotation_item" : "manual"),
              source_quotation_item_id: item.source_quotation_item_id || null,
              // NEU-069: carry any EWT captured on the charge (quotation-derived
              // virtual items normally have none; real tagged charges do).
              ewt_rate: Number(item.ewt_rate) > 0 ? Number(item.ewt_rate) : null,
              ewt_amount: Number(item.ewt_rate) > 0
                ? Math.round(lineAmount * Number(item.ewt_rate) / 100 * 100) / 100
                : (item.ewt_amount ?? null),
              created_at: new Date().toISOString(),
            };
          });
          const { data: batchResult, error: batchSaveError } = await supabase.from('billing_line_items').insert(batchInsertItems).select();
          if (batchSaveError) throw new Error(batchSaveError.message);
          const savedItems: any[] = batchResult || [];
          
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

      // NEU-070 + Doctrine D1: invoice number = [Booking Number]-XXX. Every
      // invoice is booking-linked (enforced above), so the base is always the
      // selected booking's number. XXX = 3-digit running sequence (001, 002, …)
      // counted from existing invoices that share the prefix.
      const numberBase = invoiceBooking?.booking_number || project.project_number || "INV";
      const { count: priorInvoiceCount } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .ilike("invoice_number", `${numberBase}-%`);
      const invoiceNumber = `${numberBase}-${String((priorInvoiceCount || 0) + 1).padStart(3, "0")}`;

      // Compute effective due date for persistence
      let effectiveDueDate = dueDate || undefined;
      if (!effectiveDueDate) {
          const d = new Date(invoiceDate);
          d.setDate(d.getDate() + getNetDays(creditTerms));
          effectiveDueDate = d.toISOString().split('T')[0];
      }

      // FX: invoice posts in `targetCurrency`, but the GL functional currency
      // is PHP. Lock a rate at create time so downstream reports and the GL
      // posting sheet have the same numbers we showed the user.
      const invoiceCurrency = normalizeCurrency(targetCurrency, FUNCTIONAL_CURRENCY);
      let lockedRate: number;
      try {
        lockedRate = resolvePostingRate(invoiceCurrency, exchangeRate);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Invalid exchange rate");
        return;
      }
      const baseAmount = toBaseAmount({
        amount: draftInvoice.total_amount,
        currency: invoiceCurrency,
        exchangeRate: lockedRate,
      });
      const rateDate = (invoiceDate || new Date().toISOString()).slice(0, 10);

      // NEU-069: total EWT withheld across the invoiced lines (gross, invoice
      // currency). Internal only — the printed invoice still shows the full
      // total_amount; ewt_total reduces the collectible balance so the invoice
      // closes when the net (total − ewt_total) is remitted.
      const ewtTotal = roundMoney(
        selectedItems.reduce((sum: number, it: any) => {
          const rate = Number(it.ewt_rate) || 0;
          const amt = Number(it.ewt_amount) || (rate > 0 ? Number(it.amount || 0) * rate / 100 : 0);
          return sum + amt;
        }, 0)
      );

      const invoiceRow = {
        id: crypto.randomUUID(),
        invoice_number: invoiceNumber,
        project_number: selectedLineage.projectRefs.length === 1 ? selectedLineage.projectRefs[0] : project.project_number,
        project_refs: selectedLineage.projectRefs,
        contract_refs: selectedLineage.contractRefs,
        customer_id: project.customer_id,
        customer_name: billedToType === "consignee" && selectedConsignee ? selectedConsignee.name : project.customer_name,
        booking_id: selectedBookingId, // D1: every invoice is booking-linked
        booking_ids: [selectedBookingId],
        billing_item_ids: finalBillingItemIds,
        invoice_date: invoiceDate,
        due_date: effectiveDueDate,
        payment_terms: creditTerms || 'NET 15',
        notes: notes,
        currency: invoiceCurrency,
        original_currency: invoiceCurrency,
        exchange_rate: lockedRate,
        base_currency: FUNCTIONAL_CURRENCY,
        base_amount: baseAmount,
        exchange_rate_date: rateDate,
        subtotal: draftInvoice.subtotal,
        total_amount: roundMoney(draftInvoice.total_amount),
        tax_amount: draftInvoice.tax_amount,
        ewt_total: ewtTotal, // NEU-069: internal, reduces the collectible balance
        status: 'draft',
        metadata: {
            signatories,
            displayOptions,
            billed_to_type: billedToType,
            billed_to_consignee_id: billedToConsigneeId || null,
            customer_address: customerAddress,
            exchange_rate: lockedRate,
            original_currency: invoiceCurrency,
            revenue_account_id: revenueAccountId || null,
            line_items: draftInvoice.line_items,
            zone_a: {
                customer_tin: customerTin,
                bl_number: blNumber,
                consignee: consignee,
                commodity_description: commodityDescription,
                credit_terms: creditTerms,
                booking_number: invoiceBooking?.booking_number || null,
            },
            bank_details: bankDetails, // NEU-055: remember this invoice's bank block
            bank_account_id: selectedBankAccountId || null, // NEU-071: profiled account, if picked
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

      const actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
      logCreation("invoice", invoiceData.id, invoiceData.invoice_number ?? invoiceData.id, actor);

      // Mark selected billing items as invoiced (claimed by this draft) and
      // stamp the booking (D1) so any charge that lacked one is now booking-linked.
      const { error: updateError } = await supabase
        .from('billing_line_items')
        .update({
          status: 'invoiced',
          invoice_id: invoiceData.id,
          invoice_number: invoiceData.invoice_number,
          booking_id: selectedBookingId,
          booking_number: invoiceBooking?.booking_number || null,
        })
        .in('id', finalBillingItemIds);
      if (updateError) console.warn('[InvoiceBuilder] Failed to mark items as invoiced:', updateError.message);

      toast.success(`Invoice ${invoiceData.invoice_number} saved as draft`);
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Error creating invoice:", error);
      toast.error("Failed to create invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  // -- Invoice Lifecycle Actions (View Mode) --
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const invoiceStatus = (viewInvoice?.status || "").toLowerCase();
  const isDraft = invoiceStatus === "draft";
  const isPosted = invoiceStatus === "posted" || invoiceStatus === "open" || invoiceStatus === "sent";
  const isVoid = invoiceStatus === "void";
  const hasJournalEntry = !!(viewInvoice as any)?.journal_entry_id;

  const handleFinalize = async () => {
    if (!viewInvoice || !user || !canWriteInvoices) return; // WG-06 backstop
    setIsFinalizing(true);
    try {
      const inv = viewInvoice as any;
      const invoiceCurrency = normalizeCurrency(inv.original_currency || inv.currency || "PHP", FUNCTIONAL_CURRENCY);
      const lockedRate = inv.exchange_rate || 1;
      const baseAmount = toBaseAmount({
        amount: inv.total_amount,
        currency: invoiceCurrency,
        exchangeRate: lockedRate,
      });
      const rateDate = (inv.invoice_date || new Date().toISOString()).slice(0, 10);

      // NEU-106: invoices route through the Transaction Journal. Build the REAL
      // Dr Accounts Receivable / Cr Revenue entry (replacing the old empty-lines
      // placeholder) and land it as `ready_to_post`. Accounting confirms it in the
      // TJ ("Submit for Posting") and only then does it hit the General Journal /
      // balances (postJournalEntry's source-effect stamps the invoice posted +
      // journal_entry_id). The invoice document flip below is unchanged.
      const revenueId = inv.metadata?.revenue_account_id || "coa-4000";
      const { data: acctRows } = await supabase
        .from("accounts")
        .select("id, code, name")
        .in("id", ["coa-1100", revenueId]);
      const acctMap = new Map((acctRows ?? []).map((a: any) => [a.id, a]));
      const ar = acctMap.get("coa-1100") ?? { id: "coa-1100", code: "1100", name: "Accounts Receivable - Trade" };
      const rev = acctMap.get(revenueId) ?? { id: "coa-4000", code: "4000", name: "Freight Forwarding Revenue" };
      const invLines = [
        { account_id: ar.id, account_code: ar.code, account_name: ar.name, debit: baseAmount, credit: 0, description: `AR — ${inv.invoice_number} · ${inv.customer_name}` },
        { account_id: rev.id, account_code: rev.code, account_name: rev.name, debit: 0, credit: baseAmount, description: `Revenue — ${inv.invoice_number}` },
      ];

      const jeId = `JE-INV-${Date.now()}`;
      await supabase.from("journal_entries").insert({
        id: jeId,
        entry_date: new Date().toISOString(),
        invoice_id: inv.id,
        kind: "invoice",
        description: `Invoice ${inv.invoice_number} — ${inv.customer_name}`,
        reference: inv.invoice_number,
        project_number: inv.project_number || null,
        customer_name: inv.customer_name || null,
        lines: invLines,
        total_debit: baseAmount,
        total_credit: baseAmount,
        transaction_currency: invoiceCurrency,
        exchange_rate: lockedRate,
        base_currency: FUNCTIONAL_CURRENCY,
        source_amount: roundMoney(inv.total_amount),
        base_amount: baseAmount,
        exchange_rate_date: rateDate,
        status: "ready_to_post",
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const { error } = await supabase
        .from("invoices")
        .update({ status: "posted", updated_at: new Date().toISOString() })
        .eq("id", inv.id);
      if (error) throw error;

      const actor = { id: user.id, name: user.name, department: user.department ?? "" };
      logActivity("invoice", inv.id, inv.invoice_number ?? inv.id, "finalized", actor);

      const { data: arManagers } = await supabase
        .from("users")
        .select("id")
        .eq("department", "Accounting")
        .in("role", ["manager", "executive"]);
      const projectOwnerId = (project as any).created_by as string | undefined;
      void recordNotificationEvent({
        actorUserId: user.id,
        module: "accounting",
        subSection: "invoices",
        entityType: "invoice",
        entityId: inv.id,
        kind: "issued",
        summary: {
          label: `Invoice ${inv.invoice_number} finalized`,
          reference: inv.invoice_number,
          customer_name: inv.customer_name,
          amount: inv.total_amount,
          currency: invoiceCurrency,
        },
        recipientIds: [projectOwnerId, ...(arManagers || []).map((u: any) => u.id)],
      });

      setViewInvoice({ ...viewInvoice, status: "posted" } as Invoice);
      toast.success(`Invoice ${inv.invoice_number} finalized — entry queued in the Transaction Journal`);
      if (onRefreshData) await onRefreshData();
      if (onBack) onBack();
    } catch (err) {
      console.error("Finalize error:", err);
      toast.error("Failed to finalize invoice");
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!viewInvoice || !user || !canDeleteInvoices) return; // WG-06 backstop
    setIsDeletingDraft(true);
    try {
      const inv = viewInvoice as any;
      const billingItemIds = Array.isArray(inv.billing_item_ids) ? inv.billing_item_ids : [];

      if (billingItemIds.length > 0) {
        await supabase
          .from("billing_line_items")
          .update({ status: "unbilled", invoice_id: null, invoice_number: null })
          .in("id", billingItemIds);
      }

      const { error } = await supabase.from("invoices").delete().eq("id", inv.id);
      if (error) throw error;

      const actor = { id: user.id, name: user.name, department: user.department ?? "" };
      logActivity("invoice", inv.id, inv.invoice_number ?? inv.id, "deleted", actor);

      toast.success(`Draft ${inv.invoice_number} deleted`);
      setConfirmDelete(false);
      if (onRefreshData) await onRefreshData();
      if (onBack) onBack();
    } catch (err) {
      console.error("Delete draft error:", err);
      toast.error("Failed to delete draft");
    } finally {
      setIsDeletingDraft(false);
    }
  };

  const handleVoidInvoice = async () => {
    if (!viewInvoice || !user || !canDeleteInvoices) return; // WG-06 backstop — NEU-020 DD-9: void is delete-class
    setIsVoiding(true);
    try {
      const inv = viewInvoice as any;

      const { data: linkedCollections } = await supabase
        .from("collections")
        .select("id")
        .eq("invoice_id", inv.id)
        .limit(1);

      if (linkedCollections && linkedCollections.length > 0) {
        toast.error("Cannot void — collections exist on this invoice. Reverse or remove collections first.");
        setIsVoiding(false);
        return;
      }

      // NEU-106: if the invoice was voided BEFORE its Transaction Journal entry
      // was posted, neutralize the still-pending entry so it can never post
      // orphaned revenue. (Posted entries are handled by the reversal below.)
      await supabase
        .from("journal_entries")
        .update({ status: "void", updated_at: new Date().toISOString() })
        .eq("invoice_id", inv.id)
        .eq("status", "ready_to_post");

      if (hasJournalEntry) {
        const invoiceCurrency = normalizeCurrency(inv.original_currency || inv.currency || "PHP", FUNCTIONAL_CURRENCY);
        const lockedRate = inv.exchange_rate || 1;
        const baseAmount = toBaseAmount({
          amount: inv.total_amount,
          currency: invoiceCurrency,
          exchangeRate: lockedRate,
        });
        const rateDate = new Date().toISOString().slice(0, 10);

        const reversingJeId = `JE-VOID-${Date.now()}`;
        await supabase.from("journal_entries").insert({
          id: reversingJeId,
          entry_date: new Date().toISOString(),
          invoice_id: inv.id,
          description: `VOID — Reversal of Invoice ${inv.invoice_number}`,
          reference: `VOID-${inv.invoice_number}`,
          project_number: inv.project_number || null,
          customer_name: inv.customer_name || null,
          lines: [],
          total_debit: baseAmount,
          total_credit: baseAmount,
          transaction_currency: invoiceCurrency,
          exchange_rate: lockedRate,
          base_currency: FUNCTIONAL_CURRENCY,
          source_amount: roundMoney(inv.total_amount),
          base_amount: baseAmount,
          exchange_rate_date: rateDate,
          status: "posted",
          created_by: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      const billingItemIds = Array.isArray(inv.billing_item_ids) ? inv.billing_item_ids : [];
      if (billingItemIds.length > 0) {
        await supabase
          .from("billing_line_items")
          .update({ status: "unbilled", invoice_id: null, invoice_number: null })
          .in("id", billingItemIds);
      }

      const { error } = await supabase
        .from("invoices")
        .update({
          status: "void",
          payment_status: "void",
          remaining_balance: 0,
          amount_due: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inv.id);
      if (error) throw error;

      const actor = { id: user.id, name: user.name, department: user.department ?? "" };
      logActivity("invoice", inv.id, inv.invoice_number ?? inv.id, "voided", actor, {
        description: hasJournalEntry ? "Voided with reversing journal entry" : "Voided (no GL entry to reverse)",
      });

      setViewInvoice({ ...viewInvoice, status: "void" } as Invoice);
      toast.success(`Invoice ${inv.invoice_number} voided`);
      setConfirmVoid(false);
      if (onRefreshData) await onRefreshData();
      if (onBack) onBack();
    } catch (err) {
      console.error("Void error:", err);
      toast.error("Failed to void invoice");
    } finally {
      setIsVoiding(false);
    }
  };

  // Shared Actions
  const zoomIn = () => { setAutoScale(false); setScale(prev => Math.min(prev + 0.1, 1.5)); };
  const zoomOut = () => { setAutoScale(false); setScale(prev => Math.max(prev - 0.1, 0.4)); };
  const toggleFit = () => { setAutoScale(true); };
  
  const updateSignatory = (type: "prepared_by" | "approved_by" | "checked_by", field: "name" | "title", value: string) => {
      setSignatories(prev => ({
          ...prev,
          [type]: { ...prev[type], [field]: value }
      }));
  };

  const toggleDisplay = (key: keyof typeof displayOptions) => {
      setDisplayOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Helper — delegates to the canonical formatter.
  const formatCurrency = (amount: number, curr: string = "PHP") => formatMoney(amount, curr as any);
  
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
                {isDraft && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--theme-status-warning-bg)] text-[var(--theme-status-warning-fg)] border border-[var(--theme-status-warning-border)]">
                    Draft
                  </span>
                )}
                {isVoid && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--theme-bg-surface-subtle)] text-[var(--theme-text-muted)] border border-[var(--theme-border-default)]">
                    Void
                  </span>
                )}
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
                {/* Doctrine D1 (NEU-077): an invoice must be booking-linked. */}
                <div>
                  <label className="block text-[11px] font-bold text-[var(--theme-text-muted)] mb-1.5 uppercase tracking-wider">Booking *</label>
                  {projectBookings.length === 0 ? (
                    <div className="px-3 py-2 rounded-lg border border-[var(--theme-status-warning-border)] bg-[var(--theme-status-warning-bg)] text-[13px] text-[var(--theme-status-warning-fg)]">
                      This project has no booking. An invoice must be booking-linked — create a booking before invoicing.
                    </div>
                  ) : projectBookings.length === 1 ? (
                    <div className="px-3 py-2 rounded-lg border border-[var(--theme-border-default)] bg-[var(--theme-bg-surface-subtle)] text-[13px] text-[var(--theme-text-primary)]">
                      {projectBookings[0].booking_number}
                      <span className="text-[var(--theme-text-muted)]"> · {projectBookings[0].service_type}</span>
                    </div>
                  ) : (
                    <CustomDropdown
                      value={selectedBookingId}
                      onChange={setSelectedBookingId}
                      options={projectBookings.map(b => ({ value: b.id, label: `${b.booking_number} · ${b.service_type}` }))}
                      placeholder="Select the booking for this invoice..."
                      fullWidth
                      size="sm"
                    />
                  )}
                </div>

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
                  {/* NEU-071: Profiling-managed Credit Terms with a Custom… fallback. */}
                  <label className="block text-[11px] font-bold text-[var(--theme-text-muted)] mb-1.5 uppercase tracking-wider">Credit Terms</label>
                  {(() => {
                    const isKnown = creditTermsList.some(t => t.label === creditTerms);
                    const custom = useCustomTerms || !isKnown;
                    return (
                      <>
                        <CustomDropdown
                          value={custom ? "__custom__" : creditTerms}
                          onChange={(v) => {
                            if (v === "__custom__") { setUseCustomTerms(true); }
                            else { setCreditTerms(v); setUseCustomTerms(false); }
                          }}
                          options={[
                            ...creditTermsList.map(t => ({ value: t.label, label: `${t.label} · ${t.net_days}d` })),
                            { value: "__custom__", label: "Custom…" },
                          ]}
                          placeholder="Select credit terms..."
                          fullWidth
                          size="sm"
                        />
                        {custom && (
                          <input
                            type="text"
                            value={creditTerms}
                            onChange={(e) => setCreditTerms(e.target.value)}
                            placeholder="e.g. NET 20"
                            className="mt-2 w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-lg text-sm focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)] outline-none transition-all placeholder:text-[var(--theme-text-muted)]"
                          />
                        )}
                      </>
                    );
                  })()}
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
                    checkedBy={signatories.checked_by}
                    approvedBy={signatories.approved_by}
                    onUpdate={updateSignatory}
                  />
                </div>

                <div className="h-px bg-[var(--theme-border-default)]" />

                {/* Bank Details (NEU-055) */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--theme-text-muted)] mb-3">Bank Details</p>
                  {/* NEU-071: pick a profiled bank account (fills the editable fields below). */}
                  {bankAccounts.length > 0 && (
                    <div className="mb-3">
                      <CustomDropdown
                        value={selectedBankAccountId || "__custom__"}
                        onChange={(v) => { if (v === "__custom__") setSelectedBankAccountId(""); else selectBankAccount(v); }}
                        options={[
                          ...bankAccounts.map(b => ({ value: b.id, label: b.currency ? `${b.label} · ${b.currency}` : b.label })),
                          { value: "__custom__", label: "Custom / one-off" },
                        ]}
                        placeholder="Select a bank account..."
                        fullWidth
                        size="sm"
                      />
                    </div>
                  )}
                  <BankDetailsControl
                    bankDetails={bankDetails}
                    onUpdate={updateBankDetail}
                    onSaveAsDefault={handleSaveBankDefault}
                    isSavingDefault={updateCompanySettings.isPending}
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
                    checkedBy={signatories.checked_by}
                    approvedBy={signatories.approved_by}
                    onUpdate={updateSignatory}
                  />
                  <p className="text-[10px] text-[var(--theme-text-muted)] mt-3 italic">Changes affect print output only.</p>
                </div>

                <div className="h-px bg-[var(--theme-border-default)]" />

                {/* Bank Details (NEU-055) */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--theme-text-muted)] mb-3">Bank Details</p>
                  {/* NEU-071: pick a profiled bank account (fills the editable fields below). */}
                  {bankAccounts.length > 0 && (
                    <div className="mb-3">
                      <CustomDropdown
                        value={selectedBankAccountId || "__custom__"}
                        onChange={(v) => { if (v === "__custom__") setSelectedBankAccountId(""); else selectBankAccount(v); }}
                        options={[
                          ...bankAccounts.map(b => ({ value: b.id, label: b.currency ? `${b.label} · ${b.currency}` : b.label })),
                          { value: "__custom__", label: "Custom / one-off" },
                        ]}
                        placeholder="Select a bank account..."
                        fullWidth
                        size="sm"
                      />
                    </div>
                  )}
                  <BankDetailsControl
                    bankDetails={bankDetails}
                    onUpdate={updateBankDetail}
                    onSaveAsDefault={handleSaveBankDefault}
                    isSavingDefault={updateCompanySettings.isPending}
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

                {canWriteInvoices && (
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || selectedIds.size === 0 || !selectedBookingId}
                  title={!selectedBookingId ? (projectBookings.length === 0 ? "This project has no booking" : "Select a booking in the Details tab") : undefined}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 text-[13px] font-bold text-white bg-[var(--theme-action-primary-bg)] rounded-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check size={16} />
                  )}
                  {isSubmitting ? "Saving..." : "Save as Draft"}
                </button>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-2.5">
                {/* Draft actions */}
                {isDraft && canWriteInvoices && (
                  <>
                    <button
                      onClick={handleFinalize}
                      disabled={isFinalizing}
                      className="flex items-center justify-center gap-2 w-full px-4 py-3 text-[13px] font-bold text-white bg-[var(--theme-action-primary-bg)] rounded-lg hover:opacity-90 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isFinalizing ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                      {isFinalizing ? "Finalizing..." : "Finalize Invoice"}
                    </button>
                    {!confirmDelete ? (
                      canDeleteInvoices &&
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-[13px] font-medium text-[var(--theme-status-danger-fg)] border border-[var(--theme-status-danger-border)] rounded-lg hover:bg-[var(--theme-status-danger-bg)] transition-all"
                      >
                        <Trash2 size={15} />
                        Delete Draft
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={handleDeleteDraft}
                          disabled={isDeletingDraft}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-bold text-white bg-[var(--theme-status-danger-fg)] rounded-lg hover:opacity-90 transition-all disabled:opacity-60"
                        >
                          {isDeletingDraft ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          Confirm Delete
                        </button>
                        <button
                          onClick={() => setConfirmDelete(false)}
                          className="px-4 py-2.5 text-[13px] font-medium text-[var(--theme-text-secondary)] border border-[var(--theme-border-default)] rounded-lg hover:bg-[var(--theme-bg-surface-subtle)] transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Void action for posted invoices — NEU-020 DD-9: void is delete-class */}
                {isPosted && !isVoid && canDeleteInvoices && (
                  <>
                    {!confirmVoid ? (
                      <button
                        onClick={() => setConfirmVoid(true)}
                        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-[13px] font-medium text-[var(--theme-status-danger-fg)] border border-[var(--theme-status-danger-border)] rounded-lg hover:bg-[var(--theme-status-danger-bg)] transition-all"
                      >
                        <Ban size={15} />
                        Void Invoice
                      </button>
                    ) : (
                      <div className="p-3 border border-[var(--theme-status-danger-border)] rounded-lg bg-[var(--theme-status-danger-bg)]">
                        <div className="flex items-start gap-2 mb-3">
                          <AlertTriangle size={14} className="text-[var(--theme-status-danger-fg)] shrink-0 mt-0.5" />
                          <p className="text-[12px] text-[var(--theme-status-danger-fg)] leading-relaxed">
                            This will void the invoice{hasJournalEntry ? " and create a reversing journal entry" : ""}. Billing items will be released back to unbilled.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleVoidInvoice}
                            disabled={isVoiding}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-bold text-white bg-[var(--theme-status-danger-fg)] rounded-lg hover:opacity-90 transition-all disabled:opacity-60"
                          >
                            {isVoiding ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                            Confirm Void
                          </button>
                          <button
                            onClick={() => setConfirmVoid(false)}
                            className="px-4 py-2.5 text-[13px] font-medium text-[var(--theme-text-secondary)] border border-[var(--theme-border-default)] rounded-lg hover:bg-[var(--theme-bg-surface-subtle)] transition-all bg-[var(--theme-bg-surface)]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Void badge */}
                {isVoid && (
                  <div className="flex items-center justify-center gap-2 w-full px-4 py-3 text-[13px] font-bold text-[var(--theme-text-muted)] bg-[var(--theme-bg-surface-subtle)] border border-[var(--theme-border-default)] rounded-lg">
                    <Ban size={15} />
                    Invoice Voided
                  </div>
                )}

                {/* PDF / Print — NEU-020 DD-3: export-class, gated by the door's export toggle */}
                {canExportInvoices && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleDownloadPDF}
                    disabled={isGeneratingPDF}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-medium text-[var(--theme-text-secondary)] border border-[var(--theme-border-default)] rounded-lg hover:bg-[var(--theme-bg-surface-subtle)] transition-all disabled:opacity-60"
                  >
                    {isGeneratingPDF ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                    {isGeneratingPDF ? "Generating..." : "PDF"}
                  </button>
                  <button
                    onClick={handlePrint}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-medium text-[var(--theme-text-secondary)] border border-[var(--theme-border-default)] rounded-lg hover:bg-[var(--theme-bg-surface-subtle)] transition-all"
                  >
                    <Printer size={15} />
                    Print
                  </button>
                </div>
                )}
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
