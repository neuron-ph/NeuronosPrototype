/**
 * FinancialsModule — "Cash Management" super-module
 *
 * Consolidates Billings, Invoices, Collections, Expenses into a single
 * tabbed view with a Dashboard overview — mirroring the Contract/Project
 * detail view pattern.
 *
 * Replaces: AggregateBillingsPage, AggregateInvoicesPage,
 *           AggregateCollectionsPage, AggregateExpensesPage
 *
 * All tabs now use aggregate shell components (Phase 1-5):
 *   - AggregateFinancialShell, ScopeBar, KPIStrip, AgingStrip,
 *     GroupingToolbar, GroupedDataTable
 *   - FinancialDashboard (Dashboard tab — 6-zone company-wide view)
 */

import { useState, useCallback, useMemo } from "react";
import { usePermission } from "../../context/PermissionProvider";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { useNavigate } from "react-router";
import {
  Layout,
  Receipt,
  FileStack,
  DollarSign,
  Wallet,
  FileWarning,
  Hash,
  BarChart3,
  AlertTriangle,
  Percent,
  Clock,
  CalendarCheck,
  Timer,
  FolderOpen,
  Layers,
} from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { useDataScope } from "../../hooks/useDataScope";
import type { DataScope } from "../../hooks/useDataScope";
import { calculateFinancialTotals } from "../../utils/financialCalculations";
import { calculateInvoiceBalance } from "../../utils/accounting-math";
import { pickReportingAmount } from "../../utils/accountingCurrency";
import type { FinancialData } from "../../hooks/useProjectFinancials";
import type { BillingItem } from "../shared/billings/UnifiedBillingsTab";
import type { Expense as OperationsExpense } from "../../types/operations";

// Aggregate shell (Phase 1)
import { AggregateFinancialShell } from "./aggregate/AggregateFinancialShell";
import { createDateScope, getDateScopeQueryRange, isInScope, formatCurrencyCompact, formatCurrencyFull } from "./aggregate/types";
import type { DateScope, KPICard, GroupedItems, GroupOption, StatusOption } from "./aggregate/types";

// Phase 2: GroupingToolbar + GroupedDataTable
import { GroupingToolbar } from "./aggregate/GroupingToolbar";
import { GroupedDataTable } from "./aggregate/GroupedDataTable";
import type { AggColumnDef } from "./aggregate/GroupedDataTable";

// Phase 3: AgingStrip
import { AgingStrip } from "./aggregate/AgingStrip";
import type { AgingBucket } from "./aggregate/types";

// Phase 5: Module-level ScopeBar
// ScopeBar is now rendered inline inside GroupingToolbar (Option C layout)
import { ScopeBar } from "./aggregate/ScopeBar";

// Dashboard overview (reused from project-level view)
import { ProjectFinancialOverview } from "../projects/tabs/ProjectFinancialOverview";
import { NeuronRefreshButton } from "../shared/NeuronRefreshButton";
import { toast } from "../ui/toast-utils";

// Dashboard (6-zone company-wide view)
import { FinancialDashboard } from "./dashboard/FinancialDashboard";

// Detail sheets (C9 + C10)
import { BillingDetailsSheet } from "./billings/BillingDetailsSheet";
import { CollectionDetailsSheet } from "./collections/CollectionDetailsSheet";

// ── Types ──

type FinancialsTab = "dashboard" | "billings" | "invoices" | "collections" | "expenses";

const TABS: { id: FinancialsTab; label: string; icon: typeof Layout }[] = [
  { id: "dashboard", label: "Dashboard", icon: Layout },
  { id: "billings", label: "Billings", icon: Receipt },
  { id: "invoices", label: "Invoices", icon: FileStack },
  { id: "collections", label: "Collections", icon: DollarSign },
  { id: "expenses", label: "Expenses", icon: Wallet },
];

// ── Component ──

type RecordLineage = {
  bookingRefs: string[];
  projectRefs: string[];
  contractRefs: string[];
};

const normalizeRef = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const collectUniqueRefs = (...lists: Array<unknown[] | undefined>): string[] => {
  const refs = lists
    .flatMap((list) => list ?? [])
    .map(normalizeRef)
    .filter(Boolean);

  return [...new Set(refs)];
};

const readRefList = (value: unknown): string[] => (
  Array.isArray(value) ? collectUniqueRefs(value) : []
);

const getDirectLineage = (item: any): RecordLineage => ({
  bookingRefs: collectUniqueRefs(
    [item.booking_id, item.bookingId],
    Array.isArray(item.booking_ids) ? item.booking_ids : [],
    Array.isArray(item.bookingIds) ? item.bookingIds : [],
  ),
  projectRefs: collectUniqueRefs(
    [item.project_number, item.projectNumber],
    readRefList(item.project_refs),
    readRefList(item.projectRefs),
  ),
  contractRefs: collectUniqueRefs(
    [item.quotation_number, item.quotationNumber, item.contract_number, item.contractNumber],
    readRefList(item.contract_refs),
    readRefList(item.contractRefs),
  ),
});

const mergeLineages = (...lineages: RecordLineage[]): RecordLineage => ({
  bookingRefs: collectUniqueRefs(...lineages.map((lineage) => lineage.bookingRefs)),
  projectRefs: collectUniqueRefs(...lineages.map((lineage) => lineage.projectRefs)),
  contractRefs: collectUniqueRefs(...lineages.map((lineage) => lineage.contractRefs)),
});

const getCollectionLinkedInvoiceIds = (item: any): string[] => {
  const linkedBillings = Array.isArray(item.linked_billings)
    ? item.linked_billings
    : Array.isArray(item.linkedBillings)
      ? item.linkedBillings
      : [];

  return collectUniqueRefs(
    [item.invoice_id, item.invoiceId],
    linkedBillings.flatMap((entry: any) => [entry?.id, entry?.invoice_id, entry?.invoiceId]),
  );
};

const getPrimaryRefDisplay = (refs: string[], fallback = "—"): string => {
  if (refs.length === 0) return fallback;
  if (refs.length === 1) return refs[0];
  return `${refs[0]} +${refs.length - 1}`;
};

const pickUniqueRef = (refs: string[]): string => (refs.length === 1 ? refs[0] : "");

export function FinancialsModule() {
  const { can } = usePermission();
  const canDashboard = can("accounting_financials_dashboard_tab", "view");
  const canBillings = can("accounting_financials_billings_tab", "view");
  const canInvoices = can("accounting_financials_invoices_tab", "view");
  const canCollections = can("accounting_financials_collections_tab", "view");
  const canExpenses = can("accounting_financials_expenses_tab", "view");

  const firstAllowedTab: FinancialsTab =
    canDashboard ? "dashboard" :
    canBillings ? "billings" :
    canInvoices ? "invoices" :
    canCollections ? "collections" :
    canExpenses ? "expenses" :
    "dashboard";

  const [activeTab, setActiveTab] = useState<FinancialsTab>(firstAllowedTab);
  const navigate = useNavigate();
  const { scope: dataScope, isLoaded: isScopeLoaded } = useDataScope('financials');

  // Detail sheet state (C9 + C10)
  const [selectedBillingId, setSelectedBillingId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);

  // Create actions (C12) — navigate to project-scoped creation flows
  const handleCreateInvoice = useCallback(() => {
    navigate("/accounting/projects?action=create-invoice");
  }, [navigate]);

  const handleCreateCollection = useCallback(() => {
    navigate("/accounting/projects?action=create-collection");
  }, [navigate]);

  // Aggregate scope state (shared across tabs — Phase 1: billings only)
  const [scope, setScope] = useState<DateScope>(() => createDateScope("this-month"));

  /** Detect which tab to deep-link into based on record shape */
  const detectTargetTab = useCallback((item: any): string => {
    if (item.invoice_number) return "invoices";
    if (item.collection_date) return "collections";
    if (item.expenseCategory || item.expenseDate) return "expenses";
    return "billings";
  }, []);

  /** Get the best display reference for a record (booking > project > contract) */
  const getRefDisplay = useCallback((item: any): string => {
    const booking = item.booking_id || item.bookingId || "";
    const proj = item.project_number || item.projectNumber || "";
    const contract = item.quotation_number || item.quotationNumber || "";
    if (booking) return booking;
    if (proj) return proj;
    if (contract) return contract;
    return "—";
  }, []);

  /** Navigate to the source record based on lineage (project → contract → booking → toast) */
  const handleRowClick = useCallback((item: any) => {
    const projNum = item.project_number || item.projectNumber || "";
    const bookingId = item.booking_id || item.bookingId || "";
    const quotationNum = item.quotation_number || item.quotationNumber || "";
    const tab = detectTargetTab(item);
    const recordId = item.id || "";
    const hl = recordId ? `&highlight=${encodeURIComponent(recordId)}` : "";

    // Expenses always route to the booking (expenses are booked against bookings, not projects)
    if (tab === "expenses") {
      if (bookingId) {
        navigate(`/accounting/bookings?booking=${encodeURIComponent(bookingId)}&tab=expenses${hl}`);
      } else {
        toast.info("No linked booking for this expense.");
      }
      return;
    }

    if (projNum) {
      // Record belongs to a project → navigate to project detail with correct tab + highlight
      navigate(`/accounting/projects?project=${encodeURIComponent(projNum)}&tab=${tab}${hl}`);
    } else if (quotationNum) {
      // Record belongs to a contract (no project) → navigate to contract detail
      navigate(`/accounting/contracts?contract=${encodeURIComponent(quotationNum)}&tab=${tab}${hl}`);
    } else if (bookingId) {
      // Standalone booking → navigate to bookings shell (billings tab)
      navigate(`/accounting/bookings?booking=${encodeURIComponent(bookingId)}&tab=${tab}${hl}`);
    } else {
      toast.info("No linked project, contract, or booking for this record.");
    }
  }, [navigate, detectTargetTab]);

  // Helper: apply data-scope filter to a Supabase query
  const applyScope = useCallback((query: any, scope: DataScope): any => {
    if (scope.type === 'all') return query;
    if (scope.type === 'userIds') return query.in('created_by', scope.ids);
    if (scope.type === 'own') return query.or(`created_by.eq.${scope.userId},assigned_to.eq.${scope.userId}`);
    return query;
  }, []);

  // Centralised data (fetched once, shared across all tabs)
  const { data: financialsData, isLoading, refetch: fetchAll } = useQuery({
    queryKey: [
      ...queryKeys.financials.reportsData(),
      JSON.stringify(dataScope),
      scope.preset,
      scope.from.toISOString(),
      scope.to.toISOString(),
    ],
    enabled: isScopeLoaded,
    queryFn: async () => {
      const { fromIso, toIso } = getDateScopeQueryRange(scope);
      const applyTimeRange = (query: any): any => (
        scope.preset === "all" ? query : query.gte("created_at", fromIso).lte("created_at", toIso)
      );

      const [
        { data: billingRows, error: e1 },
        { data: invoiceRows, error: e2 },
        { data: collectionRows, error: e3 },
        { data: expenseRows, error: e4 },
      ] = await Promise.all([
        applyTimeRange(applyScope(supabase.from('billing_line_items').select('*, bookings:booking_id(booking_number)'), dataScope)),
        applyTimeRange(applyScope(supabase.from('invoices').select('*'), dataScope)),
        applyTimeRange(applyScope(supabase.from('collections').select('*'), dataScope)),
        applyTimeRange(applyScope(supabase.from('evouchers').select('*'), dataScope)),
      ]);

      const billingItems = (!e1 && billingRows)
        ? billingRows.map((b: any) => ({
            ...b,
            booking_number: b.bookings?.booking_number ?? b.booking_number ?? null,
          }))
        : [];

      const invoices = (!e2 && invoiceRows)
        ? invoiceRows.filter((b: any) => {
            const status = (b.status || "").toLowerCase();
            const paymentStatus = (b.payment_status || "").toLowerCase();
            return (
              ["draft", "posted", "approved", "paid", "open", "partial"].includes(status) ||
              ["paid", "partial"].includes(paymentStatus)
            );
          })
        : [];

      const collections = (!e3 && collectionRows) ? collectionRows : [];

      const expenses: OperationsExpense[] = (!e4 && expenseRows)
        ? expenseRows.map((ev: any) => ({
            id: ev.id,
            expenseName: ev.voucher_number || ev.expense_name || ev.id,
            description: ev.purpose || ev.description || "",
            amount: ev.total_amount || ev.amount || 0,
            currency: ev.currency || "PHP",
            expenseCategory: ev.expense_category || ev.category || "General",
            expenseDate: ev.request_date || ev.expense_date || ev.created_at,
            createdAt: ev.created_at,
            status: ev.status || "pending",
            vendorName: ev.vendor_name || ev.payee_name || "\u2014",
            bookingId: ev.booking_id || "",
            isBillable: ev.is_billable || ev.details?.is_billable || false,
            transactionType: ev.transaction_type || ev.details?.transaction_type || "expense",
            customerName: ev.customer_name || "",
            projectNumber: ev.project_number || "",
            quotationNumber: ev.quotation_number || "",
            hasProject: ev.has_project || false,
            service_type: ev.service_type || "",
          }))
        : [];

      return { billingItems, invoices, collections, expenses };
    },
    staleTime: 30_000,
  });

  const billingItems = financialsData?.billingItems ?? [];
  const invoices = financialsData?.invoices ?? [];
  const collections = financialsData?.collections ?? [];
  const expenses: OperationsExpense[] = (financialsData?.expenses ?? []) as OperationsExpense[];

  const invoiceById = useMemo(() => {
    const map = new Map<string, any>();
    invoices.forEach((invoice) => {
      if (invoice?.id) {
        map.set(invoice.id, invoice);
      }
    });
    return map;
  }, [invoices]);

  const resolveLineage = useCallback((item: any): RecordLineage => {
    const directLineage = getDirectLineage(item);

    if (detectTargetTab(item) !== "collections") {
      return directLineage;
    }

    const linkedInvoiceLineages = getCollectionLinkedInvoiceIds(item)
      .map((invoiceId) => invoiceById.get(invoiceId))
      .filter(Boolean)
      .map((invoice) => getDirectLineage(invoice));

    return mergeLineages(directLineage, ...linkedInvoiceLineages);
  }, [detectTargetTab, invoiceById]);

  const getResolvedRefDisplay = useCallback((item: any): string => {
    const lineage = resolveLineage(item);
    return (
      getPrimaryRefDisplay(lineage.projectRefs, "") ||
      getPrimaryRefDisplay(lineage.contractRefs, "") ||
      getPrimaryRefDisplay(lineage.bookingRefs, "") ||
      "\u2014"
    );
  }, [resolveLineage]);

  const handleResolvedRowClick = useCallback((item: any) => {
    const directLineage = getDirectLineage(item);
    const lineage = resolveLineage(item);
    const bookingId = pickUniqueRef(directLineage.bookingRefs) || pickUniqueRef(lineage.bookingRefs);
    const projectRef = pickUniqueRef(directLineage.projectRefs) || pickUniqueRef(lineage.projectRefs);
    const contractRef = pickUniqueRef(directLineage.contractRefs) || pickUniqueRef(lineage.contractRefs);
    const tab = detectTargetTab(item);
    const recordId = item.id || "";
    const hl = recordId ? `&highlight=${encodeURIComponent(recordId)}` : "";

    if (tab === "expenses") {
      if (bookingId) {
        navigate(`/accounting/bookings?booking=${encodeURIComponent(bookingId)}&tab=expenses${hl}`);
      } else {
        toast.info("No linked booking for this expense.");
      }
      return;
    }

    if (bookingId) {
      navigate(`/accounting/bookings?booking=${encodeURIComponent(bookingId)}&tab=${tab}${hl}`);
      return;
    }

    if (projectRef) {
      navigate(`/accounting/projects?project=${encodeURIComponent(projectRef)}&tab=${tab}${hl}`);
      return;
    }

    if (contractRef) {
      navigate(`/accounting/contracts?contract=${encodeURIComponent(contractRef)}&tab=${tab}${hl}`);
      return;
    }

    if (
      lineage.bookingRefs.length > 1 ||
      lineage.projectRefs.length > 1 ||
      lineage.contractRefs.length > 1
    ) {
      toast.info("This record spans multiple bookings or containers. Open it from a specific source file.");
      return;
    }

    toast.info("No linked project, contract, or booking for this record.");
  }, [detectTargetTab, navigate, resolveLineage]);

  // ── Derived data ──

  // Scope-filtered financials for Dashboard (Phase 5)
  const scopedFinancials: FinancialData = useMemo(() => {
    const sInvoices = invoices.filter((inv: any) => isInScope(inv.invoice_date || inv.created_at, scope));
    const sBillings = billingItems.filter((b: any) => isInScope(b.created_at, scope));
    const sCollections = collections.filter((c: any) => isInScope(c.collection_date || c.created_at, scope));
    const sExpenses = expenses.filter((e: any) => isInScope((e as any).expenseDate || (e as any).createdAt, scope));
    return {
      invoices: sInvoices,
      billingItems: sBillings,
      collections: sCollections,
      expenses: sExpenses as any[],
      isLoading,
      refresh: () => { void fetchAll(); },
      totals: calculateFinancialTotals(sInvoices, sBillings, sExpenses as any[], sCollections),
    };
  }, [invoices, billingItems, collections, expenses, isLoading, fetchAll, scope]);

  // Billing items typed as BillingItem[]
  const typedBillingItems: BillingItem[] = useMemo(() => billingItems, [billingItems]);

  // ── Billings Aggregate (Phase 1) ──

  // Scope-filtered billing items
  const scopedBillingItems: BillingItem[] = useMemo(() => {
    return typedBillingItems.filter((item) =>
      isInScope(item.created_at, scope)
    );
  }, [typedBillingItems, scope]);

  const activeScopedBillingItems = useMemo(() => (
    scopedBillingItems.filter((item) => !["voided", "cancelled", "void"].includes((item.status || "").toLowerCase()))
  ), [scopedBillingItems]);

  // Billings KPI cards
  const billingsKPIs: KPICard[] = useMemo(() => {
    const items = activeScopedBillingItems;
    const total = items.reduce((sum, i) => sum + pickReportingAmount(i as any), 0);
    const unbilledItems = items.filter((i) => (i.status || "").toLowerCase() === "unbilled");
    const unbilledTotal = unbilledItems.reduce((sum, i) => sum + pickReportingAmount(i as any), 0);
    const uniqueBookings = new Set(items.map((i) => i.booking_id).filter(Boolean));
    const avgPerBooking = uniqueBookings.size > 0 ? total / uniqueBookings.size : 0;
    const unbilledPct = total > 0 ? (unbilledTotal / total) * 100 : 0;

    return [
      {
        label: "Total Charges",
        value: formatCurrencyCompact(total),
        subtext: `${items.length} items`,
        icon: Receipt,
        severity: "normal" as const,
      },
      {
        label: "Unbilled",
        value: formatCurrencyCompact(unbilledTotal),
        subtext: `${unbilledItems.length} items`,
        icon: FileWarning,
        severity: unbilledPct > 30 ? "warning" as const : "normal" as const,
      },
      {
        label: "Items",
        value: items.length.toLocaleString(),
        subtext: `${uniqueBookings.size} bookings`,
        icon: Hash,
        severity: "normal" as const,
      },
      {
        label: "Avg / Booking",
        value: formatCurrencyCompact(avgPerBooking),
        subtext: uniqueBookings.size > 0 ? `across ${uniqueBookings.size}` : "no bookings",
        icon: BarChart3,
        severity: "normal" as const,
      },
    ];
  }, [activeScopedBillingItems]);

  // ── Billings Aggregate (Phase 2) — Grouping + Table ──

  const [billingsGroupBy, setBillingsGroupBy] = useState("booking");
  const [billingsSearch, setBillingsSearch] = useState("");
  const [billingsStatusFilter, setBillingsStatusFilter] = useState("");
  const [billingsBookingTypeFilter, setBillingsBookingTypeFilter] = useState<string>("");

  const BILLINGS_GROUP_OPTIONS: GroupOption[] = [
    { value: "booking", label: "Booking" },
    { value: "customer", label: "Customer" },
  ];

  const BILLINGS_STATUS_OPTIONS: StatusOption[] = [
    { value: "unbilled", label: "Unbilled", color: "var(--theme-status-warning-fg)" },
    { value: "billed", label: "Billed", color: "var(--theme-action-primary-bg)" },
    { value: "paid", label: "Paid", color: "var(--theme-status-success-fg)" },
    { value: "voided", label: "Voided", color: "var(--theme-status-danger-fg)" },
  ];

  const BILLINGS_COLUMNS: AggColumnDef<BillingItem>[] = useMemo(() => [
    {
      header: "Date",
      width: "90px",
      cell: (item: BillingItem) => {
        if (!item.created_at) return "—";
        return new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      },
    },
    {
      header: "Ref #",
      width: "110px",
      cell: (item: BillingItem) => (
        <span className="font-medium" style={{ color: "var(--neuron-brand-green)" }}>
          {getResolvedRefDisplay(item)}
        </span>
      ),
    },
    {
      header: "Customer",
      width: "140px",
      cell: (item: BillingItem) => (item as any).customer_name || "—",
    },
    {
      header: "Description",
      cell: (item: BillingItem) => item.description || item.service_type || "—",
    },
    {
      header: "Category",
      width: "120px",
      accessorKey: "quotation_category",
    },
    {
      header: "Amount",
      width: "110px",
      align: "right" as const,
      cell: (item: BillingItem) => (
        <span className="font-medium tabular-nums">{formatCurrencyFull(Number(item.amount) || 0, item.currency || "PHP")}</span>
      ),
    },
    {
      header: "Source",
      width: "90px",
      cell: (item: BillingItem) => {
        const src = ((item as any).source_type || "manual") as string;
        const label =
          src === "quotation_item" ? "Quotation" :
          src === "contract_rate" || src === "rate_card" ? "Contract" :
          src === "billable_expense" ? "Expense" :
          "Manual";
        const fg =
          label === "Quotation" ? "var(--theme-action-primary-bg)" :
          label === "Contract" ? "#6366F1" :
          label === "Expense" ? "var(--theme-status-warning-fg)" :
          "var(--theme-text-muted)";
        const bg =
          label === "Quotation" ? "var(--theme-status-success-bg)" :
          label === "Contract" ? "#6366F120" :
          label === "Expense" ? "var(--theme-status-warning-bg)" :
          "var(--theme-bg-surface-subtle)";
        return (
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
            style={{ backgroundColor: bg, color: fg }}
          >
            {label}
          </span>
        );
      },
    },
    {
      header: "Status",
      width: "80px",
      align: "center" as const,
      cell: (item: BillingItem) => {
        const s = (item.status || "").toLowerCase();
        const fg =
          s === "paid" ? "var(--theme-status-success-fg)" :
          s === "billed" ? "var(--theme-action-primary-bg)" :
          s === "voided" ? "var(--theme-status-danger-fg)" :
          "var(--theme-status-warning-fg)";
        const bg =
          s === "paid" ? "var(--theme-status-success-bg)" :
          s === "billed" ? "var(--theme-status-success-bg)" :
          s === "voided" ? "var(--theme-status-danger-bg)" :
          "var(--theme-status-warning-bg)";
        return (
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase"
            style={{ backgroundColor: bg, color: fg }}
          >
            {s || "—"}
          </span>
        );
      },
    },
  ], []);

  // Filtered + grouped billing items
  const filteredBillingItems = useMemo(() => {
    let items = scopedBillingItems;
    // Status filter
    if (billingsStatusFilter) {
      items = items.filter((i) => (i.status || "").toLowerCase() === billingsStatusFilter);
    }
    // Booking type filter
    if (billingsBookingTypeFilter) {
      items = items.filter((i) => (i.service_type || "").toLowerCase() === billingsBookingTypeFilter.toLowerCase());
    }
    // Search filter
    if (billingsSearch) {
      const q = billingsSearch.toLowerCase();
      items = items.filter((i) =>
        (i.description || "").toLowerCase().includes(q) ||
        (i.service_type || "").toLowerCase().includes(q) ||
        ((i as any).customer_name || "").toLowerCase().includes(q) ||
        ((i as any).project_number || "").toLowerCase().includes(q) ||
        (i.booking_id || "").toLowerCase().includes(q) ||
        (i.quotation_category || "").toLowerCase().includes(q)
      );
    }
    return items;
  }, [scopedBillingItems, billingsStatusFilter, billingsBookingTypeFilter, billingsSearch]);

  const billingsGroups: GroupedItems<BillingItem>[] = useMemo(() => {
    const map = new Map<string, BillingItem[]>();

    filteredBillingItems.forEach((item) => {
      let key: string;
      switch (billingsGroupBy) {
        case "booking":
          key = item.booking_id || "Unlinked Billing";
          break;
        case "customer":
          key = (item as any).customer_name || "Unknown Customer";
          break;
        default:
          key = "Other";
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });

    // Sort groups by subtotal descending
    return Array.from(map.entries())
      .map(([key, items]) => ({
        key,
        label: key,
        items,
        subtotal: items.reduce((sum, i) => sum + pickReportingAmount(i as any), 0),
        count: items.length,
      }))
      .sort((a, b) => b.subtotal - a.subtotal);
  }, [filteredBillingItems, billingsGroupBy]);

  // ══════════════════════════════════════════════
  // ── Invoices Aggregate (Phase 3) ──
  // ══════════════════════════════════════════════

  const [invoicesGroupBy, setInvoicesGroupBy] = useState("customer");
  const [invoicesSearch, setInvoicesSearch] = useState("");
  const [invoicesStatusFilter, setInvoicesStatusFilter] = useState("");
  const [invoicesAgingBucket, setInvoicesAgingBucket] = useState<string | null>(null);

  // Scope-filtered invoices
  const scopedInvoices = useMemo(() => {
    return invoices.filter((inv: any) =>
      isInScope(inv.invoice_date || inv.created_at, scope)
    );
  }, [invoices, scope]);

  // Aging bucket helper
  const getAgingDays = (inv: any): number => {
    const dueDate = inv.due_date ? new Date(inv.due_date) : null;
    if (!dueDate) return 0;
    const now = new Date();
    const diff = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    return diff; // negative = not yet due, positive = overdue
  };

  const getAgingBucketLabel = (days: number): string => {
    if (days <= 0) return "Current";
    if (days <= 30) return "1-30 days";
    if (days <= 60) return "31-60 days";
    if (days <= 90) return "61-90 days";
    return "90+ days";
  };

  // Aging buckets (computed from scoped invoices, excluding fully paid)
  const invoicesAgingBuckets: AgingBucket[] = useMemo(() => {
    const unpaid = scopedInvoices.filter((inv: any) => {
      const s = (inv.status || "").toLowerCase();
      return s !== "paid";
    });

    const bucketMap: Record<string, { amount: number; count: number }> = {
      "Current": { amount: 0, count: 0 },
      "1-30 days": { amount: 0, count: 0 },
      "31-60 days": { amount: 0, count: 0 },
      "61-90 days": { amount: 0, count: 0 },
      "90+ days": { amount: 0, count: 0 },
    };

    unpaid.forEach((inv: any) => {
      const days = getAgingDays(inv);
      const label = getAgingBucketLabel(days);
      // PHP-base balance: remaining_balance is in original currency; translate
      // by exchange_rate so USD invoices aggregate correctly with PHP ones.
      const rate = Number(inv.exchange_rate);
      const remainingOriginal = Number(
        inv.remaining_balance ?? inv.total_amount ?? inv.amount ?? 0,
      );
      const balance =
        Number.isFinite(rate) && rate > 0 && rate !== 1
          ? remainingOriginal * rate
          : Number(inv.base_amount ?? remainingOriginal);
      bucketMap[label].amount += balance;
      bucketMap[label].count += 1;
    });

    const AGING_COLORS: Record<string, string> = {
      "Current": "#0F766E",
      "1-30 days": "#14B8A6",
      "31-60 days": "#F59E0B",
      "61-90 days": "#F97316",
      "90+ days": "#EF4444",
    };

    return Object.entries(bucketMap).map(([label, data]) => ({
      label,
      amount: data.amount,
      count: data.count,
      color: AGING_COLORS[label] || "#6B7A76",
    }));
  }, [scopedInvoices]);

  // Invoice KPIs
  const invoicesKPIs: KPICard[] = useMemo(() => {
    const items = scopedInvoices;
    // Aggregations are in PHP base. Prefer the persisted base_amount column
    // and translate `remaining_balance` (original currency) via exchange_rate
    // so USD invoices roll up correctly alongside PHP ones.
    const baseTotal = (inv: any) =>
      Number(inv.base_amount ?? inv.total_amount ?? inv.amount ?? 0);
    const baseRemaining = (inv: any) => {
      const remainingOriginal = Number(
        inv.remaining_balance ?? inv.total_amount ?? inv.amount ?? 0,
      );
      const rate = Number(inv.exchange_rate);
      if (Number.isFinite(rate) && rate > 0 && rate !== 1) {
        return remainingOriginal * rate;
      }
      // Fall back to base_amount when remaining_balance is missing.
      return inv.remaining_balance == null
        ? Number(inv.base_amount ?? remainingOriginal)
        : remainingOriginal;
    };

    const totalInvoiced = items.reduce((sum, inv: any) => sum + baseTotal(inv), 0);

    const unpaid = items.filter((inv: any) => (inv.status || "").toLowerCase() !== "paid");
    const outstanding = unpaid.reduce((sum, inv: any) => sum + baseRemaining(inv), 0);

    const overdue = items.filter((inv: any) => {
      const s = (inv.status || "").toLowerCase();
      if (s === "paid") return false;
      return getAgingDays(inv) > 0;
    });
    const overdueAmount = overdue.reduce((sum, inv: any) => sum + baseRemaining(inv), 0);

    // Collection rate: use scoped collections that match scoped invoices
    const scopedCollectionTotal = collections
      .filter((c: any) => isInScope(c.collection_date || c.created_at, scope))
      .reduce((sum, c: any) => sum + pickReportingAmount(c), 0);
    const collectionRate = totalInvoiced > 0 ? (scopedCollectionTotal / totalInvoiced) * 100 : 0;

    const outstandingPct = totalInvoiced > 0 ? (outstanding / totalInvoiced) * 100 : 0;

    return [
      {
        label: "Total Invoiced",
        value: formatCurrencyCompact(totalInvoiced),
        subtext: `${items.length} invoices`,
        icon: FileStack,
        severity: "normal" as const,
      },
      {
        label: "Outstanding",
        value: formatCurrencyCompact(outstanding),
        subtext: `${unpaid.length} unpaid`,
        icon: Clock,
        severity: outstandingPct > 50 ? "warning" as const : "normal" as const,
      },
      {
        label: "Overdue",
        value: formatCurrencyCompact(overdueAmount),
        subtext: `${overdue.length} past due`,
        icon: AlertTriangle,
        severity: overdueAmount > 0 ? "danger" as const : "normal" as const,
      },
      {
        label: "Collection Rate",
        value: `${collectionRate.toFixed(1)}%`,
        subtext: formatCurrencyCompact(scopedCollectionTotal) + " collected",
        icon: Percent,
        severity: collectionRate < 60 ? "danger" as const : collectionRate < 80 ? "warning" as const : "normal" as const,
      },
    ];
  }, [scopedInvoices, collections, scope]);

  const INVOICES_GROUP_OPTIONS: GroupOption[] = [
    { value: "customer", label: "Customer" },
    { value: "project", label: "Project" },
    { value: "contract", label: "Contract" },
    { value: "booking", label: "Booking" },
  ];

  const INVOICES_STATUS_OPTIONS: StatusOption[] = [
    { value: "draft", label: "Draft", color: "var(--theme-text-muted)" },
    { value: "posted", label: "Posted", color: "var(--theme-action-primary-bg)" },
    { value: "open", label: "Open", color: "#2563EB" },
    { value: "partial", label: "Partial", color: "var(--theme-status-warning-fg)" },
    { value: "paid", label: "Paid", color: "var(--theme-status-success-fg)" },
  ];

  const INVOICES_COLUMNS: AggColumnDef<any>[] = useMemo(() => [
    {
      header: "Invoice #",
      width: "110px",
      cell: (inv: any) => (
        <span className="font-medium" style={{ color: "var(--neuron-brand-green)" }}>
          {inv.invoice_number || "—"}
        </span>
      ),
    },
    {
      header: "Date",
      width: "90px",
      cell: (inv: any) => {
        const d = inv.invoice_date || inv.created_at;
        if (!d) return "—";
        return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      },
    },
    {
      header: "Customer",
      width: "150px",
      cell: (inv: any) => inv.customer_name || "—",
    },
    {
      header: "Ref #",
      width: "100px",
      cell: (inv: any) => getResolvedRefDisplay(inv),
    },
    {
      header: "Due Date",
      width: "90px",
      cell: (inv: any) => {
        if (!inv.due_date) return "—";
        const d = new Date(inv.due_date);
        const isOverdue = d < new Date() && (inv.status || "").toLowerCase() !== "paid";
        return (
          <span style={{ color: isOverdue ? "var(--theme-status-danger-fg)" : "inherit", fontWeight: isOverdue ? 600 : 400 }}>
            {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        );
      },
    },
    {
      header: "Amount",
      width: "110px",
      align: "right" as const,
      cell: (inv: any) => (
        <span className="font-medium tabular-nums">
          {formatCurrencyFull(Number(inv.total_amount) || Number(inv.amount) || 0)}
        </span>
      ),
    },
    {
      header: "Balance",
      width: "100px",
      align: "right" as const,
      cell: (inv: any) => {
        const balance = Number(inv.remaining_balance ?? inv.total_amount ?? inv.amount ?? 0);
        const isPaid = (inv.status || "").toLowerCase() === "paid";
        return (
          <span className="tabular-nums" style={{ color: isPaid ? "var(--neuron-semantic-success)" : "inherit" }}>
            {isPaid ? "Paid" : formatCurrencyFull(balance)}
          </span>
        );
      },
    },
    {
      header: "Status",
      width: "80px",
      align: "center" as const,
      cell: (inv: any) => {
        const s = (inv.status || "").toLowerCase();
        const fgMap: Record<string, string> = {
          draft: "var(--theme-text-muted)",
          posted: "var(--theme-action-primary-bg)",
          open: "#2563EB",
          partial: "var(--theme-status-warning-fg)",
          paid: "var(--theme-status-success-fg)",
        };
        const bgMap: Record<string, string> = {
          draft: "var(--theme-bg-surface-subtle)",
          posted: "var(--theme-status-success-bg)",
          open: "#2563EB20",
          partial: "var(--theme-status-warning-bg)",
          paid: "var(--theme-status-success-bg)",
        };
        const fg = fgMap[s] || "var(--theme-text-muted)";
        const bg = bgMap[s] || "var(--theme-bg-surface-subtle)";
        return (
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase"
            style={{ backgroundColor: bg, color: fg }}
          >
            {s || "—"}
          </span>
        );
      },
    },
  ], []);

  // Filtered invoices (status + search + aging bucket)
  const filteredInvoices = useMemo(() => {
    let items = scopedInvoices;
    // Status filter
    if (invoicesStatusFilter) {
      items = items.filter((inv: any) => (inv.status || "").toLowerCase() === invoicesStatusFilter);
    }
    // Aging bucket filter
    if (invoicesAgingBucket) {
      items = items.filter((inv: any) => {
        const s = (inv.status || "").toLowerCase();
        if (s === "paid") return false;
        return getAgingBucketLabel(getAgingDays(inv)) === invoicesAgingBucket;
      });
    }
    // Search
    if (invoicesSearch) {
      const q = invoicesSearch.toLowerCase();
      items = items.filter((inv: any) =>
        (inv.invoice_number || "").toLowerCase().includes(q) ||
        (inv.customer_name || "").toLowerCase().includes(q) ||
        resolveLineage(inv).projectRefs.concat(resolveLineage(inv).contractRefs, resolveLineage(inv).bookingRefs)
          .some((ref) => ref.toLowerCase().includes(q)) ||
        (inv.id || "").toLowerCase().includes(q)
      );
    }
    return items;
  }, [scopedInvoices, invoicesStatusFilter, invoicesAgingBucket, invoicesSearch, resolveLineage]);

  // Grouped invoices
  const invoicesGroups: GroupedItems<any>[] = useMemo(() => {
    const map = new Map<string, any[]>();

    filteredInvoices.forEach((inv: any) => {
      let key: string;
      switch (invoicesGroupBy) {
        case "customer":
          key = inv.customer_name || "Unknown Customer";
          break;
        case "project":
          key = getPrimaryRefDisplay(resolveLineage(inv).projectRefs, "No Project Ref");
          break;
        case "contract":
          key = getPrimaryRefDisplay(resolveLineage(inv).contractRefs, "No Contract Ref");
          break;
        case "booking":
          key = getPrimaryRefDisplay(resolveLineage(inv).bookingRefs, "Unlinked Invoice");
          break;
        default:
          key = "Other";
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(inv);
    });

    return Array.from(map.entries())
      .map(([key, items]) => ({
        key,
        label: key,
        items,
        subtotal: items.reduce((sum, inv) => sum + pickReportingAmount(inv as any), 0),
        count: items.length,
      }))
      .sort((a, b) => b.subtotal - a.subtotal);
  }, [filteredInvoices, invoicesGroupBy, resolveLineage]);

  // ══════════════════════════════════════════════
  // ── Collections Aggregate (Phase 4) ──
  // ══════════════════════════════════════════════

  const [collectionsGroupBy, setCollectionsGroupBy] = useState("customer");
  const [collectionsSearch, setCollectionsSearch] = useState("");
  const [collectionsStatusFilter, setCollectionsStatusFilter] = useState("");

  // Scope-filtered collections
  const scopedCollections = useMemo(() => {
    return collections.filter((c: any) =>
      isInScope(c.collection_date || c.created_at, scope)
    );
  }, [collections, scope]);

  // Collections KPIs
  const collectionsKPIs: KPICard[] = useMemo(() => {
    const items = scopedCollections;
    const totalCollected = items.reduce((sum, c: any) => sum + pickReportingAmount(c), 0);

    // "This Month" — collections in the current calendar month
    const now = new Date();
    const thisMonthItems = items.filter((c: any) => {
      const d = c.collection_date ? new Date(c.collection_date) : null;
      return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const thisMonthTotal = thisMonthItems.reduce((sum, c: any) => sum + pickReportingAmount(c), 0);

    // Avg days to collect
    let totalDays = 0;
    let countWithDates = 0;
    items.forEach((c: any) => {
      const collDate = c.collection_date ? new Date(c.collection_date) : null;
      const invDate = c.invoice_date ? new Date(c.invoice_date) : null;
      if (collDate && invDate) {
        totalDays += Math.max(0, Math.floor((collDate.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24)));
        countWithDates++;
      }
    });
    const avgDays = countWithDates > 0 ? Math.round(totalDays / countWithDates) : 0;

    // Collection rate (collected vs. total outstanding invoices in scope)
    const totalInvoiced = scopedInvoices.reduce((sum, inv: any) =>
      sum + pickReportingAmount(inv), 0);
    const collRate = totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0;

    return [
      {
        label: "Total Collected",
        value: formatCurrencyCompact(totalCollected),
        subtext: `${items.length} collections`,
        icon: DollarSign,
        severity: "normal" as const,
      },
      {
        label: "This Month",
        value: formatCurrencyCompact(thisMonthTotal),
        subtext: `${thisMonthItems.length} collections`,
        icon: CalendarCheck,
        severity: "normal" as const,
      },
      {
        label: "Avg Days to Collect",
        value: countWithDates > 0 ? `${avgDays}d` : "N/A",
        subtext: countWithDates > 0 ? `from ${countWithDates} records` : "no data",
        icon: Timer,
        severity: avgDays > 45 ? "warning" as const : "normal" as const,
      },
      {
        label: "Collection Rate",
        value: `${collRate.toFixed(1)}%`,
        subtext: formatCurrencyCompact(totalInvoiced) + " invoiced",
        icon: Percent,
        severity: collRate < 60 ? "danger" as const : collRate < 80 ? "warning" as const : "normal" as const,
      },
    ];
  }, [scopedCollections, scopedInvoices]);

  const COLLECTIONS_GROUP_OPTIONS: GroupOption[] = [
    { value: "customer", label: "Customer" },
    { value: "project", label: "Project" },
    { value: "contract", label: "Contract" },
    { value: "booking", label: "Booking" },
  ];

  const COLLECTIONS_STATUS_OPTIONS: StatusOption[] = [
    { value: "pending", label: "Pending", color: "var(--theme-status-warning-fg)" },
    { value: "posted", label: "Posted", color: "var(--theme-status-success-fg)" },
    { value: "credited", label: "Customer Credit", color: "#1D4ED8" },
    { value: "refunded", label: "Refunded", color: "var(--theme-text-muted)" },
    { value: "voided", label: "Voided", color: "var(--theme-status-danger-fg)" },
  ];

  const COLLECTIONS_COLUMNS: AggColumnDef<any>[] = useMemo(() => [
    {
      header: "Date",
      width: "90px",
      cell: (c: any) => {
        const d = c.collection_date || c.created_at;
        if (!d) return "—";
        return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      },
    },
    {
      header: "Customer",
      width: "150px",
      cell: (c: any) => c.customer_name || "—",
    },
    {
      header: "Invoice #",
      width: "110px",
      cell: (c: any) => (
        <span className="font-medium" style={{ color: "var(--neuron-brand-green)" }}>
          {c.invoice_number || "—"}
        </span>
      ),
    },
    {
      header: "Ref #",
      width: "100px",
      cell: (c: any) => getResolvedRefDisplay(c),
    },
    {
      header: "Method",
      width: "100px",
      cell: (c: any) => c.payment_method || c.mode_of_payment || "—",
    },
    {
      header: "Reference",
      width: "120px",
      cell: (c: any) => c.reference_number || c.or_number || "—",
    },
    {
      header: "Amount",
      width: "110px",
      align: "right" as const,
      cell: (c: any) => (
        <span className="font-medium tabular-nums">
          {formatCurrencyFull(Number(c.amount) || 0)}
        </span>
      ),
    },
    {
      header: "Status",
      width: "80px",
      align: "center" as const,
      cell: (c: any) => {
        const s = (c.status || "posted").toLowerCase();
        const fgMap: Record<string, string> = {
          posted: "var(--theme-status-success-fg)",
          pending: "var(--theme-status-warning-fg)",
          credited: "#1D4ED8",
          refunded: "var(--theme-text-muted)",
          voided: "var(--theme-status-danger-fg)",
        };
        const bgMap: Record<string, string> = {
          posted: "var(--theme-status-success-bg)",
          pending: "var(--theme-status-warning-bg)",
          credited: "#1D4ED820",
          refunded: "var(--theme-bg-surface-subtle)",
          voided: "var(--theme-status-danger-bg)",
        };
        const fg = fgMap[s] || "var(--theme-status-success-fg)";
        const bg = bgMap[s] || "var(--theme-status-success-bg)";
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase"
            style={{ backgroundColor: bg, color: fg }}>
            {s}
          </span>
        );
      },
    },
  ], []);

  // Filtered collections
  const filteredCollections = useMemo(() => {
    let items = scopedCollections;
    if (collectionsStatusFilter) {
      items = items.filter((c: any) => (c.status || "posted").toLowerCase() === collectionsStatusFilter);
    }
    if (collectionsSearch) {
      const q = collectionsSearch.toLowerCase();
      items = items.filter((c: any) =>
        (c.customer_name || "").toLowerCase().includes(q) ||
        (c.invoice_number || "").toLowerCase().includes(q) ||
        resolveLineage(c).projectRefs.concat(resolveLineage(c).contractRefs, resolveLineage(c).bookingRefs)
          .some((ref) => ref.toLowerCase().includes(q)) ||
        (c.reference_number || c.or_number || "").toLowerCase().includes(q) ||
        (c.payment_method || c.mode_of_payment || "").toLowerCase().includes(q)
      );
    }
    return items;
  }, [scopedCollections, collectionsStatusFilter, collectionsSearch, resolveLineage]);

  // Grouped collections
  const collectionsGroups: GroupedItems<any>[] = useMemo(() => {
    const map = new Map<string, any[]>();
    filteredCollections.forEach((c: any) => {
      let key: string;
      switch (collectionsGroupBy) {
        case "customer":
          key = c.customer_name || "Unknown Customer";
          break;
        case "project":
          key = getPrimaryRefDisplay(resolveLineage(c).projectRefs, "No Project Ref");
          break;
        case "contract":
          key = getPrimaryRefDisplay(resolveLineage(c).contractRefs, "No Contract Ref");
          break;
        case "booking":
          key = getPrimaryRefDisplay(resolveLineage(c).bookingRefs, "Unlinked Collection");
          break;
        default:
          key = "Other";
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    return Array.from(map.entries())
      .map(([key, items]) => ({
        key,
        label: key,
        items,
        subtotal: items.reduce((sum, c) => sum + pickReportingAmount(c as any), 0),
        count: items.length,
      }))
      .sort((a, b) => b.subtotal - a.subtotal);
  }, [filteredCollections, collectionsGroupBy, resolveLineage]);

  // ── Expenses Aggregate (Phase 4) ──

  const [expensesGroupBy, setExpensesGroupBy] = useState("booking");
  const [expensesSearch, setExpensesSearch] = useState("");
  const [expensesStatusFilter, setExpensesStatusFilter] = useState("");
  const [expensesBookingTypeFilter, setExpensesBookingTypeFilter] = useState<string>("");

  // Scope-filtered expenses
  const scopedExpenses = useMemo(() => {
    return expenses.filter((e: any) =>
      isInScope(e.expenseDate || e.createdAt, scope)
    );
  }, [expenses, scope]);

  // Expenses KPIs
  const expensesKPIs: KPICard[] = useMemo(() => {
    const items = scopedExpenses;
    const totalExpenses = items.reduce((sum, e: any) => sum + pickReportingAmount(e), 0);

    const pending = items.filter((e: any) => (e.status || "").toLowerCase() === "pending");
    const pendingCount = pending.length;

    // Top category
    const catMap = new Map<string, number>();
    items.forEach((e: any) => {
      const cat = e.expenseCategory || e.category || "General";
      catMap.set(cat, (catMap.get(cat) || 0) + pickReportingAmount(e));
    });
    let topCategory = "N/A";
    let topCatAmount = 0;
    catMap.forEach((amt, cat) => {
      if (amt > topCatAmount) { topCatAmount = amt; topCategory = cat; }
    });

    // Billable ratio
    const billable = items.filter((e: any) => e.isBillable);
    const billableTotal = billable.reduce((sum, e: any) => sum + pickReportingAmount(e), 0);
    const billableRatio = totalExpenses > 0 ? (billableTotal / totalExpenses) * 100 : 0;

    return [
      {
        label: "Total Expenses",
        value: formatCurrencyCompact(totalExpenses),
        subtext: `${items.length} records`,
        icon: Wallet,
        severity: "normal" as const,
      },
      {
        label: "Pending Approval",
        value: pendingCount.toString(),
        subtext: pendingCount > 0 ? formatCurrencyCompact(pending.reduce((s, e: any) => s + pickReportingAmount(e), 0)) : "all clear",
        icon: Clock,
        severity: pendingCount > 10 ? "warning" as const : "normal" as const,
      },
      {
        label: "Top Category",
        value: topCategory,
        subtext: topCatAmount > 0 ? formatCurrencyCompact(topCatAmount) : "—",
        icon: FolderOpen,
        severity: "normal" as const,
      },
      {
        label: "Billable Ratio",
        value: `${billableRatio.toFixed(1)}%`,
        subtext: `${billable.length} of ${items.length} billable`,
        icon: Layers,
        severity: "normal" as const,
      },
    ];
  }, [scopedExpenses]);

  const EXPENSES_GROUP_OPTIONS: GroupOption[] = [
    { value: "booking", label: "Booking" },
    { value: "customer", label: "Customer" },
  ];

  const EXPENSES_STATUS_OPTIONS: StatusOption[] = [
    { value: "draft", label: "Draft", color: "var(--theme-text-muted)" },
    { value: "pending", label: "Pending", color: "var(--theme-status-warning-fg)" },
    { value: "approved", label: "Approved", color: "var(--theme-action-primary-bg)" },
    { value: "posted", label: "Posted", color: "var(--theme-status-success-fg)" },
    { value: "rejected", label: "Rejected", color: "var(--theme-status-danger-fg)" },
  ];

  const EXPENSES_COLUMNS: AggColumnDef<any>[] = useMemo(() => [
    {
      header: "Date",
      width: "90px",
      cell: (e: any) => {
        const d = e.expenseDate || e.createdAt;
        if (!d) return "—";
        return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      },
    },
    {
      header: "Ref #",
      width: "100px",
      cell: (e: any) => (
        <span className="font-medium" style={{ color: "var(--neuron-brand-green)" }}>
          {getResolvedRefDisplay(e)}
        </span>
      ),
    },
    {
      header: "Vendor",
      width: "130px",
      cell: (e: any) => e.vendorName || e.vendor || "—",
    },
    {
      header: "Description",
      cell: (e: any) => e.description || e.expenseName || "—",
    },
    {
      header: "Category",
      width: "120px",
      cell: (e: any) => e.expenseCategory || e.category || "—",
    },
    {
      header: "Amount",
      width: "110px",
      align: "right" as const,
      cell: (e: any) => (
        <span className="font-medium tabular-nums">
          {formatCurrencyFull(Number(e.amount) || 0, e.currency || "PHP")}
        </span>
      ),
    },
    {
      header: "Status",
      width: "80px",
      align: "center" as const,
      cell: (e: any) => {
        const s = (e.status || "").toLowerCase();
        const fgMap: Record<string, string> = {
          draft: "var(--theme-text-muted)",
          pending: "var(--theme-status-warning-fg)",
          approved: "var(--theme-action-primary-bg)",
          posted: "var(--theme-status-success-fg)",
          rejected: "var(--theme-status-danger-fg)",
        };
        const bgMap: Record<string, string> = {
          draft: "var(--theme-bg-surface-subtle)",
          pending: "var(--theme-status-warning-bg)",
          approved: "var(--theme-status-success-bg)",
          posted: "var(--theme-status-success-bg)",
          rejected: "var(--theme-status-danger-bg)",
        };
        const fg = fgMap[s] || "var(--theme-text-muted)";
        const bg = bgMap[s] || "var(--theme-bg-surface-subtle)";
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase"
            style={{ backgroundColor: bg, color: fg }}>
            {s || "—"}
          </span>
        );
      },
    },
  ], []);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    let items = scopedExpenses;
    if (expensesStatusFilter) {
      items = items.filter((e: any) => (e.status || "").toLowerCase() === expensesStatusFilter);
    }
    // Booking type filter
    if (expensesBookingTypeFilter) {
      items = items.filter((e: any) => (e.service_type || "").toLowerCase() === expensesBookingTypeFilter.toLowerCase());
    }
    if (expensesSearch) {
      const q = expensesSearch.toLowerCase();
      items = items.filter((e: any) =>
        (e.description || "").toLowerCase().includes(q) ||
        (e.expenseName || "").toLowerCase().includes(q) ||
        (e.vendorName || e.vendor || "").toLowerCase().includes(q) ||
        (e.bookingId || "").toLowerCase().includes(q) ||
        (e.projectNumber || "").toLowerCase().includes(q) ||
        (e.expenseCategory || e.category || "").toLowerCase().includes(q)
      );
    }
    return items;
  }, [scopedExpenses, expensesStatusFilter, expensesBookingTypeFilter, expensesSearch]);

  // Grouped expenses
  const expensesGroups: GroupedItems<any>[] = useMemo(() => {
    const map = new Map<string, any[]>();
    filteredExpenses.forEach((e: any) => {
      let key: string;
      switch (expensesGroupBy) {
        case "customer":
          key = e.customerName || e.customer_name || "Unknown Customer";
          break;
        case "booking":
          key = e.bookingId || "Unlinked Expense";
          break;
        default:
          key = "Other";
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return Array.from(map.entries())
      .map(([key, items]) => ({
        key,
        label: key,
        items,
        subtotal: items.reduce((sum, e) => sum + pickReportingAmount(e as any), 0),
        count: items.length,
      }))
      .sort((a, b) => b.subtotal - a.subtotal);
  }, [filteredExpenses, expensesGroupBy]);

  // ── Booking Type Options (derived from data, shared by Billings & Expenses) ──

  const billingsBookingTypeOptions = useMemo(() => {
    const types = new Set<string>();
    scopedBillingItems.forEach((item) => {
      const svc = item.service_type || "";
      if (svc) types.add(svc);
    });
    return Array.from(types).sort();
  }, [scopedBillingItems]);

  const expensesBookingTypeOptions = useMemo(() => {
    const types = new Set<string>();
    scopedExpenses.forEach((e: any) => {
      const svc = e.service_type || "";
      if (svc) types.add(svc);
    });
    return Array.from(types).sort();
  }, [scopedExpenses]);

  // ── Render ──

  return (
    <div className="flex flex-col h-full bg-[var(--theme-bg-surface)]">
      {/* Header */}
      <div className="px-12 pt-8 pb-0">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 style={{ fontSize: "32px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "4px", letterSpacing: "-1.2px" }}>
              Financials
            </h1>
            <p style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>
              System-wide view of billings, invoices, collections, and expenses.
            </p>
          </div>
          <NeuronRefreshButton
            onRefresh={() => { void fetchAll(); }}
            label="Refresh financials"
          />
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-0 border-b border-[var(--theme-border-default)]">
          {TABS.filter((tab) => {
            if (tab.id === "dashboard") return canDashboard;
            if (tab.id === "billings") return canBillings;
            if (tab.id === "invoices") return canInvoices;
            if (tab.id === "collections") return canCollections;
            if (tab.id === "expenses") return canExpenses;
            return false;
          }).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="relative flex items-center gap-2 px-5 py-3 text-[13px] font-medium transition-colors"
                style={{
                  color: isActive ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
                  fontWeight: isActive ? 600 : 500,
                }}
              >
                <Icon size={14} />
                {tab.label}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--theme-action-primary-bg)] rounded-t" />
                )}
              </button>
            );
          })}
        </div>

        {/* Module-level Scope Bar removed — now inline in each tab's GroupingToolbar (Option C) */}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto px-12 pt-6 pb-12">
        {canDashboard && activeTab === "dashboard" && (
          <FinancialDashboard
            billingItems={billingItems}
            invoices={invoices}
            collections={collections}
            expenses={expenses as any[]}
            scope={scope}
            onScopeChange={setScope}
            isLoading={isLoading}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {canBillings && activeTab === "billings" && (
          <AggregateFinancialShell
            scope={scope}
            onScopeChange={setScope}
            kpiCards={billingsKPIs}
            isLoading={isLoading}
            hideScopeBar
          >
            <GroupingToolbar
              scope={scope}
              onScopeChange={setScope}
              groupByOptions={BILLINGS_GROUP_OPTIONS}
              groupBy={billingsGroupBy}
              onGroupByChange={setBillingsGroupBy}
              searchQuery={billingsSearch}
              onSearchChange={setBillingsSearch}
              statusOptions={BILLINGS_STATUS_OPTIONS}
              activeStatus={billingsStatusFilter}
              onStatusChange={setBillingsStatusFilter}
              totalCount={filteredBillingItems.length}
              groupCount={billingsGroups.length}
              bookingTypeOptions={billingsBookingTypeOptions}
              activeBookingType={billingsBookingTypeFilter}
              onBookingTypeChange={(v) => setBillingsBookingTypeFilter(v || "")}
            />
            <GroupedDataTable<BillingItem>
              groups={billingsGroups}
              columns={BILLINGS_COLUMNS}
              isLoading={isLoading}
              onRowClick={(item) => setSelectedBillingId((item as any).invoice_id || item.id)}
              exportFileName="billings"
            />
          </AggregateFinancialShell>
        )}

        {canInvoices && activeTab === "invoices" && (
          <AggregateFinancialShell
            scope={scope}
            onScopeChange={setScope}
            kpiCards={invoicesKPIs}
            isLoading={isLoading}
            hideScopeBar
          >
            <div className="flex items-center justify-end px-4 pt-2">
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium text-white"
                style={{ backgroundColor: "var(--neuron-brand-green, #0F766E)" }}
                onClick={handleCreateInvoice}
              >
                <FileStack className="w-4 h-4" /> Create Invoice
              </button>
            </div>
            <GroupingToolbar
              scope={scope}
              onScopeChange={setScope}
              groupByOptions={INVOICES_GROUP_OPTIONS}
              groupBy={invoicesGroupBy}
              onGroupByChange={setInvoicesGroupBy}
              searchQuery={invoicesSearch}
              onSearchChange={setInvoicesSearch}
              statusOptions={INVOICES_STATUS_OPTIONS}
              activeStatus={invoicesStatusFilter}
              onStatusChange={setInvoicesStatusFilter}
              totalCount={filteredInvoices.length}
              groupCount={invoicesGroups.length}
              agingBuckets={invoicesAgingBuckets}
              activeAgingBucket={invoicesAgingBucket}
              onAgingBucketChange={setInvoicesAgingBucket}
            />
            <GroupedDataTable<any>
              groups={invoicesGroups}
              columns={INVOICES_COLUMNS}
              isLoading={isLoading}
              onRowClick={handleResolvedRowClick}
              exportFileName="invoices"
            />
          </AggregateFinancialShell>
        )}

        {canCollections && activeTab === "collections" && (
          <AggregateFinancialShell
            scope={scope}
            onScopeChange={setScope}
            kpiCards={collectionsKPIs}
            isLoading={isLoading}
            hideScopeBar
          >
            <div className="flex items-center justify-end px-4 pt-2">
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium text-white"
                style={{ backgroundColor: "var(--neuron-brand-green, #0F766E)" }}
                onClick={handleCreateCollection}
              >
                <DollarSign className="w-4 h-4" /> Add Collection
              </button>
            </div>
            <GroupingToolbar
              scope={scope}
              onScopeChange={setScope}
              groupByOptions={COLLECTIONS_GROUP_OPTIONS}
              groupBy={collectionsGroupBy}
              onGroupByChange={setCollectionsGroupBy}
              searchQuery={collectionsSearch}
              onSearchChange={setCollectionsSearch}
              statusOptions={COLLECTIONS_STATUS_OPTIONS}
              activeStatus={collectionsStatusFilter}
              onStatusChange={setCollectionsStatusFilter}
              totalCount={filteredCollections.length}
              groupCount={collectionsGroups.length}
            />
            <GroupedDataTable<any>
              groups={collectionsGroups}
              columns={COLLECTIONS_COLUMNS}
              isLoading={isLoading}
              onRowClick={(item: any) => setSelectedCollectionId(item.id)}
              exportFileName="collections"
            />
          </AggregateFinancialShell>
        )}

        {canExpenses && activeTab === "expenses" && (
          <AggregateFinancialShell
            scope={scope}
            onScopeChange={setScope}
            kpiCards={expensesKPIs}
            isLoading={isLoading}
            hideScopeBar
          >
            <GroupingToolbar
              scope={scope}
              onScopeChange={setScope}
              groupByOptions={EXPENSES_GROUP_OPTIONS}
              groupBy={expensesGroupBy}
              onGroupByChange={setExpensesGroupBy}
              searchQuery={expensesSearch}
              onSearchChange={setExpensesSearch}
              statusOptions={EXPENSES_STATUS_OPTIONS}
              activeStatus={expensesStatusFilter}
              onStatusChange={setExpensesStatusFilter}
              totalCount={filteredExpenses.length}
              groupCount={expensesGroups.length}
              bookingTypeOptions={expensesBookingTypeOptions}
              activeBookingType={expensesBookingTypeFilter}
              onBookingTypeChange={(v) => setExpensesBookingTypeFilter(v || "")}
            />
            <GroupedDataTable<any>
              groups={expensesGroups}
              columns={EXPENSES_COLUMNS}
              isLoading={isLoading}
              onRowClick={handleResolvedRowClick}
              exportFileName="expenses"
            />
          </AggregateFinancialShell>
        )}
      </div>

      {/* Detail sheets (C9 + C10) */}
      <BillingDetailsSheet
        isOpen={!!selectedBillingId}
        onClose={() => setSelectedBillingId(null)}
        billingId={selectedBillingId || ""}
      />
      <CollectionDetailsSheet
        isOpen={!!selectedCollectionId}
        onClose={() => setSelectedCollectionId(null)}
        collectionId={selectedCollectionId || ""}
      />
    </div>
  );
}
