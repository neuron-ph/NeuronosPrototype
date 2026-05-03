import { useState } from "react";
import { Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../utils/supabase/client";
import { usePermission } from "../../context/PermissionProvider";
import type { ModuleId } from "../admin/permissionsConfig";

type EntityType =
  | "inquiry" | "quotation" | "contract" | "booking"
  | "project" | "invoice" | "collection" | "expense"
  | "customer" | "contact" | "vendor" | "budget_request";

const ENTITY_TABS: { key: EntityType; label: string }[] = [
  { key: "inquiry", label: "Inquiry" },
  { key: "quotation", label: "Quotation" },
  { key: "contract", label: "Contract" },
  { key: "booking", label: "Booking" },
  { key: "project", label: "Project" },
  { key: "invoice", label: "Invoice" },
  { key: "collection", label: "Collection" },
  { key: "expense", label: "Expense" },
  { key: "customer", label: "Customer" },
  { key: "contact", label: "Contact" },
  { key: "vendor", label: "Vendor" },
  { key: "budget_request", label: "Budget Req." },
];

interface EntityResult {
  id: string;
  label: string;
  sub?: string;
}

interface EntityPickerProps {
  onSelect: (entity: { entity_type: string; entity_id: string; entity_label: string }) => void;
  onClose: () => void;
}

const ENTITY_TAB_PERMISSION_IDS: Record<EntityType, ModuleId> = {
  inquiry: "inbox_entity_inquiry_tab",
  quotation: "inbox_entity_quotation_tab",
  contract: "inbox_entity_contract_tab",
  booking: "inbox_entity_booking_tab",
  project: "inbox_entity_project_tab",
  invoice: "inbox_entity_invoice_tab",
  collection: "inbox_entity_collection_tab",
  expense: "inbox_entity_expense_tab",
  customer: "inbox_entity_customer_tab",
  contact: "inbox_entity_contact_tab",
  vendor: "inbox_entity_vendor_tab",
  budget_request: "inbox_entity_budget_request_tab",
};

export function EntityPicker({ onSelect, onClose }: EntityPickerProps) {
  const { can } = usePermission();

  const allowedEntityTabs = ENTITY_TABS.filter((tab) =>
    can(ENTITY_TAB_PERMISSION_IDS[tab.key], "view")
  );

  const [activeType, setActiveType] = useState<EntityType>(
    allowedEntityTabs[0]?.key ?? "inquiry"
  );
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  const { data: inquiryResults = [], isFetching: inquiryFetching } = useQuery({
    queryKey: ["entity_picker", "inquiry", q],
    queryFn: async () => {
      const { data } = await supabase.from("inquiries").select("id, inquiry_name, customer_name").ilike("inquiry_name", `%${q}%`).limit(20);
      return (data || []).map((r) => ({ id: r.id, label: r.inquiry_name || r.id, sub: r.customer_name }));
    },
    enabled: activeType === "inquiry",
    staleTime: 30_000,
  });

  const { data: quotationResults = [], isFetching: quotationFetching } = useQuery({
    queryKey: ["entity_picker", "quotation", q],
    queryFn: async () => {
      const { data } = await supabase.from("quotations").select("id, quotation_name, customer_name").eq("quotation_type", "spot").ilike("quotation_name", `%${q}%`).limit(20);
      return (data || []).map((r) => ({ id: r.id, label: r.quotation_name || r.id, sub: r.customer_name }));
    },
    enabled: activeType === "quotation",
    staleTime: 30_000,
  });

  const { data: contractResults = [], isFetching: contractFetching } = useQuery({
    queryKey: ["entity_picker", "contract", q],
    queryFn: async () => {
      const { data } = await supabase.from("quotations").select("id, quotation_name, customer_name").eq("quotation_type", "contract").ilike("quotation_name", `%${q}%`).limit(20);
      return (data || []).map((r) => ({ id: r.id, label: r.quotation_name || r.id, sub: r.customer_name }));
    },
    enabled: activeType === "contract",
    staleTime: 30_000,
  });

  const { data: bookingResults = [], isFetching: bookingFetching } = useQuery({
    queryKey: ["entity_picker", "booking", q],
    queryFn: async () => {
      const { data } = await supabase.from("bookings").select("id, tracking_number, customer_name").ilike("tracking_number", `%${q}%`).limit(20);
      return (data || []).map((r) => ({ id: r.id, label: r.tracking_number || "—", sub: r.customer_name }));
    },
    enabled: activeType === "booking",
    staleTime: 30_000,
  });

  const { data: projectResults = [], isFetching: projectFetching } = useQuery({
    queryKey: ["entity_picker", "project", q],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id, project_number, customer_name").ilike("project_number", `%${q}%`).limit(20);
      return (data || []).map((r) => ({ id: r.id, label: r.project_number || "—", sub: r.customer_name }));
    },
    enabled: activeType === "project",
    staleTime: 30_000,
  });

  const { data: invoiceResults = [], isFetching: invoiceFetching } = useQuery({
    queryKey: ["entity_picker", "invoice", q],
    queryFn: async () => {
      const { data } = await supabase.from("billings").select("id, invoice_number, customer_name").not("invoice_number", "is", null).ilike("invoice_number", `%${q}%`).limit(20);
      return (data || []).map((r) => ({ id: r.id, label: r.invoice_number || "—", sub: r.customer_name }));
    },
    enabled: activeType === "invoice",
    staleTime: 30_000,
  });

  const { data: collectionResults = [], isFetching: collectionFetching } = useQuery({
    queryKey: ["entity_picker", "collection", q],
    queryFn: async () => {
      const { data } = await supabase.from("collections").select("id, reference_number, customer_name").ilike("reference_number", `%${q}%`).limit(20);
      return (data || []).map((r) => ({ id: r.id, label: r.reference_number || "—", sub: r.customer_name }));
    },
    enabled: activeType === "collection",
    staleTime: 30_000,
  });

  const { data: expenseResults = [], isFetching: expenseFetching } = useQuery({
    queryKey: ["entity_picker", "expense", q],
    queryFn: async () => {
      const { data } = await supabase.from("expenses").select("id, description, amount").ilike("description", `%${q}%`).limit(20);
      return (data || []).map((r) => ({ id: r.id, label: r.description || "—", sub: r.amount ? `PHP ${r.amount}` : undefined }));
    },
    enabled: activeType === "expense",
    staleTime: 30_000,
  });

  const { data: customerResults = [], isFetching: customerFetching } = useQuery({
    queryKey: ["entity_picker", "customer", q],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name, industry").ilike("name", `%${q}%`).limit(20);
      return (data || []).map((r) => ({ id: r.id, label: r.name, sub: r.industry }));
    },
    enabled: activeType === "customer",
    staleTime: 30_000,
  });

  const { data: contactResults = [], isFetching: contactFetching } = useQuery({
    queryKey: ["entity_picker", "contact", q],
    queryFn: async () => {
      const { data } = await supabase.from("contacts").select("id, name, company_name").ilike("name", `%${q}%`).limit(20);
      return (data || []).map((r) => ({ id: r.id, label: r.name, sub: r.company_name }));
    },
    enabled: activeType === "contact",
    staleTime: 30_000,
  });

  const { data: vendorResults = [], isFetching: vendorFetching } = useQuery({
    queryKey: ["entity_picker", "vendor", q],
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("id, name, service_type").ilike("name", `%${q}%`).limit(20);
      return (data || []).map((r) => ({ id: r.id, label: r.name, sub: r.service_type }));
    },
    enabled: activeType === "vendor",
    staleTime: 30_000,
  });

  const { data: budgetRequestResults = [], isFetching: budgetRequestFetching } = useQuery({
    queryKey: ["entity_picker", "budget_request", q],
    queryFn: async () => {
      const { data } = await supabase.from("budget_requests").select("id, title, amount").ilike("title", `%${q}%`).limit(20);
      return (data || []).map((r) => ({ id: r.id, label: r.title || r.id, sub: r.amount ? `PHP ${r.amount}` : undefined }));
    },
    enabled: activeType === "budget_request",
    staleTime: 30_000,
  });

  const resultsByType: Record<EntityType, EntityResult[]> = {
    inquiry: inquiryResults,
    quotation: quotationResults,
    contract: contractResults,
    booking: bookingResults,
    project: projectResults,
    invoice: invoiceResults,
    collection: collectionResults,
    expense: expenseResults,
    customer: customerResults,
    contact: contactResults,
    vendor: vendorResults,
    budget_request: budgetRequestResults,
  };

  const fetchingByType: Record<EntityType, boolean> = {
    inquiry: inquiryFetching,
    quotation: quotationFetching,
    contract: contractFetching,
    booking: bookingFetching,
    project: projectFetching,
    invoice: invoiceFetching,
    collection: collectionFetching,
    expense: expenseFetching,
    customer: customerFetching,
    contact: contactFetching,
    vendor: vendorFetching,
    budget_request: budgetRequestFetching,
  };

  const results = resultsByType[activeType];
  const isLoading = fetchingByType[activeType];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(18,51,43,0.15)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="flex flex-col"
        style={{
          width: 560,
          maxHeight: "70vh",
          backgroundColor: "var(--theme-bg-surface)",
          border: "1px solid var(--theme-border-default)",
          borderRadius: 12,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{ padding: "16px 20px", borderBottom: "1px solid var(--theme-border-default)" }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--theme-text-primary)" }}>
            Link System Record
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--theme-text-muted)", display: "flex" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Entity type tabs — scrollable row */}
        <div
          style={{
            display: "flex",
            overflowX: "auto",
            borderBottom: "1px solid var(--theme-border-default)",
            padding: "0 4px",
            gap: 0,
            scrollbarWidth: "none",
          }}
        >
          {allowedEntityTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveType(tab.key); setQuery(""); }}
              style={{
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: activeType === tab.key ? 600 : 400,
                color: activeType === tab.key ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
                background: "none",
                border: "none",
                borderBottom: activeType === tab.key ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "color 150ms ease",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--theme-border-default)" }}>
          <div className="flex items-center gap-2" style={{ border: "1px solid var(--theme-border-default)", borderRadius: 8, padding: "8px 12px" }}>
            <Search size={14} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${ENTITY_TABS.find((t) => t.key === activeType)?.label}…`}
              style={{ flex: 1, border: "none", outline: "none", fontSize: 13, color: "var(--theme-text-primary)", backgroundColor: "transparent" }}
            />
          </div>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {isLoading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--theme-text-muted)", fontSize: 13 }}>
              Searching…
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--theme-text-muted)", fontSize: 13 }}>
              No {ENTITY_TABS.find((t) => t.key === activeType)?.label.toLowerCase()} records found
            </div>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                onClick={() =>
                  onSelect({ entity_type: activeType, entity_id: r.id, entity_label: r.label })
                }
                className="w-full text-left transition-colors duration-150 focus:outline-none"
                style={{
                  padding: "10px 16px",
                  background: "none",
                  border: "none",
                  borderBottom: "1px solid var(--theme-border-subtle)",
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--theme-bg-page)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <p style={{ fontSize: 13, fontWeight: 500, color: "var(--theme-text-primary)" }}>{r.label}</p>
                {r.sub && <p style={{ fontSize: 12, color: "var(--theme-text-muted)", marginTop: 2 }}>{r.sub}</p>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
