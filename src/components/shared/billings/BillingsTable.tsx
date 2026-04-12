import { Receipt, Plus, DollarSign, ChevronDown, ChevronRight, Briefcase, Ship, Truck, Shield, Package, Ban, Trash2 } from "lucide-react";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
// Shared Components
import { SkeletonTable } from "../NeuronSkeleton";
import { PricingTableHeader } from "../pricing/PricingTableHeader";
import { UniversalPricingRow, PricingItemData } from "../pricing/UniversalPricingRow";
// Pricing Components & Types
import { CategoryHeader } from "../../pricing/quotations/CategoryHeader";
import type { SellingPriceCategory } from "../../../types/pricing";
import { getServiceIcon } from "../../../utils/quotation-helpers";
import { useBookingGrouping } from "../../../hooks/useBookingGrouping";

export interface BillingTableItem {
  id: string;
  category: string;
  serviceType: string;
  description: string;
  status: string; // 'unbilled', 'billed', 'paid'
  amount: number;
  currency: string;
  date: string;
  originalData?: any;
}

interface BillingsTableProps {
  data: BillingTableItem[];
  isLoading?: boolean;
  emptyMessage?: string;
  footerSummary?: {
    label: string;
    amount: number;
    currency?: string;
  };
  grossSummary?: {
    label: string;
    amount: number;
    currency?: string;
  };
  viewMode?: boolean; 
  onRowClick?: (item: any) => void;
  onItemChange?: (id: string, field: string, value: any) => void;
  // Phase 3: Category Management Handlers
  activeCategories?: Set<string>;
  onAddCategory?: (name: string) => void;
  onRenameCategory?: (oldName: string, newName: string) => void;
  onDeleteCategory?: (name: string) => void;
  onAddItem?: (category: string) => void;
  // ✨ Booking / Service Grouping
  groupBy?: "category" | "booking" | "service";
  linkedBookings?: any[];
  /** Deep-link: highlight a specific billing item row */
  highlightId?: string | null;
  /** Void an unbilled billing item (sets status=voided, preserves record) */
  onVoidItem?: (itemId: string) => void;
}

const formatCurrency = (amount: number, currency: string = "PHP") => {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

// Helper: Compute aggregate billing status from a list of items
const getBookingBillingStatus = (items: BillingTableItem[]): "Unbilled" | "Partially Billed" | "Fully Billed" | "Voided" => {
  if (items.length === 0) return "Unbilled";
  const voidedCount = items.filter(i => (i.status || "").toLowerCase() === "voided").length;
  if (voidedCount === items.length) return "Voided";
  const billedCount = items.filter(i => i.status === "invoiced" || i.status === "paid").length;
  if (billedCount === 0) return "Unbilled";
  if (billedCount === items.length) return "Fully Billed";
  return "Partially Billed";
};

const billingStatusStyles: Record<string, { bg: string; text: string; border: string }> = {
  "Unbilled": { bg: "var(--theme-bg-surface-subtle)", text: "var(--theme-text-muted)", border: "var(--theme-border-default)" },
  "Partially Billed": { bg: "var(--theme-status-warning-bg)", text: "var(--theme-status-warning-fg)", border: "var(--theme-status-warning-border)" },
  "Fully Billed": { bg: "var(--theme-status-success-bg)", text: "var(--theme-status-success-fg)", border: "var(--theme-status-success-border)" },
  "Voided": { bg: "var(--theme-status-danger-bg)", text: "var(--theme-status-danger-fg)", border: "var(--theme-status-danger-border)" },
};

export function BillingsTable({
  data,
  isLoading = false,
  emptyMessage = "No billings found.",
  footerSummary,
  grossSummary,
  viewMode = true,
  onRowClick,
  onItemChange,
  activeCategories,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onAddItem,
  groupBy = "category",
  linkedBookings,
  highlightId = null,
  onVoidItem,
}: BillingsTableProps) {
  // Ref for scrolling to highlighted item
  const highlightRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to highlighted item after render
  useEffect(() => {
    if (highlightId && highlightRef.current) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [highlightId]);

  // State for collapsible sections
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // ✨ Booking grouping via shared hook
  const getBookingId = useCallback((item: BillingTableItem) => item.originalData?.booking_id || "unassigned", []);
  const {
    bookingGroupedData,
    bookingIds,
    bookingMeta,
    inferServiceType: inferSvcType,
    expandedBookings,
    toggleBooking,
    toggleAllBookings: handleToggleAll,
    allExpanded,
  } = useBookingGrouping({
    items: data,
    linkedBookings,
    getBookingId,
    enabled: groupBy === "booking",
  });

  // Group data by category
  const groupedData = useMemo(() => {
    const groups: Record<string, BillingTableItem[]> = {};
    data.forEach(item => {
      const cat = item.category || "General";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [data]);

  // Determine list of categories to display
  // Prioritize activeCategories (state-based) to support empty categories
  const displayedCategories = useMemo(() => {
      if (activeCategories && activeCategories.size > 0) {
          return Array.from(activeCategories).sort();
      }
      // Fallback for when activeCategories prop isn't fully ready or initial load
      const dataCats = Object.keys(groupedData);
      if (dataCats.length === 0 && !viewMode) return []; // Allow empty state in edit mode
      return dataCats.sort();
  }, [activeCategories, groupedData, viewMode]);

  // Initialize expanded state when categories load
  useEffect(() => {
    if (displayedCategories.length > 0 && expandedCategories.size === 0) {
      setExpandedCategories(new Set(displayedCategories));
    }
  }, [displayedCategories.length]);

  const toggleCategory = (category: string) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(category)) {
      newSet.delete(category);
    } else {
      newSet.add(category);
    }
    setExpandedCategories(newSet);
  };

  if (isLoading) {
    return <SkeletonTable rows={8} cols={5} />;
  }

  // Helper to map BillingTableItem to PricingItemData
  const mapToPricingData = (item: BillingTableItem): PricingItemData => {
    const original = item.originalData || {};
    return {
      id: item.id,
      description: item.description,
      quantity: original.quantity || 1,
      base_cost: 0, 
      amount_added: original.amount_added || 0,
      percentage_added: original.percentage_added || 0,
      currency: item.currency,
      forex_rate: original.forex_rate || 1,
      is_taxed: original.is_taxed || false,
      final_price: item.amount, 
      remarks: original.remarks,
      service: item.serviceType,
      service_tag: item.serviceType,
      status: item.status,
      created_at: item.date
    };
  };

  // Build custom action buttons (Void + Delete) for unbilled rows.
  // Replaces UniversalPricingRow's single onRemove button.
  const buildRowActions = (item: BillingTableItem): React.ReactNode | undefined => {
    if (viewMode) return undefined;
    const isUnbilled = (item.status || "").toLowerCase() === "unbilled";
    if (!isUnbilled) return undefined;
    return (
      <div style={{ display: "flex", gap: "4px" }}>
        {onVoidItem && (
          <button
            onClick={(e) => { e.stopPropagation(); onVoidItem(item.id); }}
            style={{
              display: "flex", alignItems: "center", gap: "4px",
              padding: "5px 9px", fontSize: "12px", fontWeight: 500,
              border: "1px solid var(--theme-status-warning-border)", borderRadius: "6px",
              backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-status-warning-fg)", cursor: "pointer",
            }}
            title="Void Item — sets status to voided, preserves the record for audit"
          >
            <Ban size={12} />
            Void
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onItemChange?.(item.id, "delete", true); }}
          style={{
            display: "flex", alignItems: "center", gap: "4px",
            padding: "5px 9px", fontSize: "12px", fontWeight: 500,
            border: "1px solid var(--theme-status-danger-border)", borderRadius: "6px",
            backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-status-danger-fg)", cursor: "pointer",
          }}
          title="Delete — permanently removes this record"
        >
          <Trash2 size={12} />
          Delete
        </button>
      </div>
    );
  };

  if (displayedCategories.length === 0 && groupBy === "category" && data.length === 0 && !onAddCategory) {
     // Only show empty state if we can't add categories (view mode or no handler)
     return (
      <div className="rounded-[10px] overflow-hidden" style={{ 
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--neuron-ui-border)"
      }}>
        <div className="px-6 py-12 text-center">
          <Receipt className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--neuron-ink-muted)" }} />
          <h3 style={{ color: "var(--neuron-ink-primary)" }} className="mb-1">No billings found</h3>
          <p style={{ color: "var(--neuron-ink-muted)" }}>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  // ✨ BOOKING-GROUPED RENDERING
  if (groupBy === "booking") {
    if (bookingIds.length === 0) {
      return (
        <div className="rounded-[10px] overflow-hidden" style={{ backgroundColor: "var(--theme-bg-surface)", border: "1px solid var(--neuron-ui-border)" }}>
          <div className="px-6 py-12 text-center">
            <Receipt className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--neuron-ink-muted)" }} />
            <h3 style={{ color: "var(--neuron-ink-primary)" }} className="mb-1">No billings found</h3>
            <p style={{ color: "var(--neuron-ink-muted)" }}>{emptyMessage}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-0">
        {/* Unified Table Container */}
        <div
          className="bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-xl overflow-hidden"
        >
          {/* Single shared column header with Collapse/Expand toggle */}
          <PricingTableHeader
            showCost={false}
            showMarkup={false}
            showForex={true}
            showTax={true}
            firstCellContent={
              <button
                onClick={handleToggleAll}
                className="flex items-center gap-3"
                style={{
                  backgroundColor: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  color: "var(--theme-text-muted)",
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                }}
              >
                <div style={{ transition: "transform 0.15s ease", transform: allExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}>
                  <ChevronDown size={14} />
                </div>
                <span style={{ color: "var(--theme-text-muted)" }}>Item</span>
              </button>
            }
          />

          {/* Booking groups as row sections */}
          {bookingIds.map((bid, bidIdx) => {
            const items = bookingGroupedData[bid] || [];
            const meta = bookingMeta.get(bid);
            const serviceType = bid === "unassigned" ? "Unassigned" : inferSvcType(bid, meta);
            const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
            const isExpanded = expandedBookings.has(bid);
            const itemCount = items.length;
            const isEmpty = itemCount === 0;

            // Compute aggregate billing status for this booking
            const bookingStatus = getBookingBillingStatus(items);
            const statusStyle = billingStatusStyles[bookingStatus];

            // Sub-group items by category within this booking
            const catGroups: Record<string, BillingTableItem[]> = {};
            items.forEach(item => {
              const cat = item.category || "General";
              if (!catGroups[cat]) catGroups[cat] = [];
              catGroups[cat].push(item);
            });
            const catNames = Object.keys(catGroups).sort();

            return (
              <div key={bid}>
                {/* Booking Header Row — acts as a collapsible divider */}
                <button
                  onClick={() => toggleBooking(bid)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 16px",
                    background: isExpanded ? "var(--theme-bg-surface-tint)" : "var(--theme-bg-page)",
                    border: "none",
                    borderTop: bidIdx > 0 ? "1px solid var(--theme-border-default)" : "none",
                    borderBottom: isExpanded ? "1px solid var(--theme-border-default)" : "none",
                    cursor: "pointer",
                    transition: "background 0.15s ease",
                  }}
                >
                  <div className="flex items-center gap-3">
                    {/* Expand chevron */}
                    <div style={{ color: "var(--theme-text-muted)", transition: "transform 0.15s ease", transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}>
                      <ChevronDown size={14} />
                    </div>
                    {/* Service icon */}
                    {bid !== "unassigned" && getServiceIcon(serviceType, { size: 14, color: "var(--theme-action-primary-bg)" })}
                    {/* Booking ID */}
                    <span style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: bid === "unassigned" ? "var(--theme-text-muted)" : "var(--theme-action-primary-bg)",
                      fontFamily: "monospace",
                    }}>
                      {bid === "unassigned" ? "Unassigned Items" : bid}
                    </span>
                    {/* Customer / Project context (for system-wide views) */}
                    {bid !== "unassigned" && meta?.customerName && (
                      <span style={{
                        fontSize: "11px",
                        fontWeight: 500,
                        color: "var(--theme-text-secondary)",
                      }}>
                        · {meta.customerName}
                      </span>
                    )}
                    {/* Service type label */}
                    {bid !== "unassigned" && (
                      <span style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        color: "var(--theme-text-muted)",
                        padding: "1px 6px",
                        backgroundColor: "var(--theme-bg-surface-subtle)",
                        borderRadius: "3px",
                        border: "1px solid var(--theme-border-default)",
                      }}>
                        {serviceType}
                      </span>
                    )}
                    {/* Item count badge */}
                    <span style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      color: "var(--theme-text-muted)",
                      padding: "1px 6px",
                      backgroundColor: "var(--theme-bg-surface-subtle)",
                      borderRadius: "3px",
                      border: "1px solid var(--theme-border-default)",
                    }}>
                      {itemCount} item{itemCount !== 1 ? "s" : ""}
                    </span>
                    {/* Aggregate billing status badge */}
                    {itemCount > 0 && (
                      <span style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        color: statusStyle.text,
                        backgroundColor: statusStyle.bg,
                        border: `1px solid ${statusStyle.border}`,
                        padding: "1px 6px",
                        borderRadius: "3px",
                      }}>
                        {bookingStatus}
                      </span>
                    )}
                  </div>
                  {/* Subtotal */}
                  <span style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: isEmpty ? "var(--theme-text-muted)" : "var(--theme-text-primary)",
                    fontFamily: "monospace",
                  }}>
                    {formatCurrency(subtotal)}
                  </span>
                </button>

                {/* Expanded Content: inline rows under this booking header */}
                {isExpanded && (
                  <>
                    {catNames.length > 0 ? (
                      catNames.map((catName, catIdx) => {
                        const catItems = catGroups[catName];
                        const catSubtotal = catItems.reduce((sum, i) => sum + i.amount, 0);

                        return (
                          <div key={catName}>
                            {/* Category sub-header — lightweight inline row */}
                            {catNames.length > 1 && (
                              <div
                                className="flex items-center justify-between"
                                style={{
                                  padding: "6px 16px 6px 44px",
                                  backgroundColor: "var(--theme-bg-page)",
                                  borderBottom: "1px solid var(--theme-border-default)",
                                }}
                              >
                                <span style={{
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  color: "var(--theme-text-muted)",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                }}>
                                  {catName}
                                </span>
                                <div className="flex items-center gap-3">
                                  <span style={{ fontSize: "10px", color: "var(--theme-text-muted)" }}>
                                    {catItems.length} item{catItems.length !== 1 ? "s" : ""}
                                  </span>
                                  <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", fontFamily: "monospace" }}>
                                    {formatCurrency(catSubtotal)}
                                  </span>
                                </div>
                              </div>
                            )}
                            {/* Billing item rows — directly rendered, sharing the unified column grid */}
                            <div className="divide-y divide-[var(--theme-border-default)]">
                              {catItems.map(item => {
                                const isBilled = ["billed", "paid", "invoiced", "voided", "cancelled", "void"].includes((item.status || "").toLowerCase());
                                const isHighlighted = highlightId === item.id;
                                return (
                                  <div
                                    key={item.id}
                                    ref={isHighlighted ? highlightRef : undefined}
                                    className={isHighlighted ? "ring-2 ring-[var(--theme-action-primary-bg)] bg-[var(--theme-action-primary-bg)]/5 rounded-md transition-all duration-700" : ""}
                                  >
                                  <UniversalPricingRow
                                    data={mapToPricingData(item)}
                                    mode={viewMode || isBilled ? "view" : "edit"}
                                    serviceType={item.serviceType}
                                    config={{
                                      showCost: false,
                                      showMarkup: false,
                                      showForex: true,
                                      showTax: true,
                                      simpleMode: true,
                                      priceEditable: true,
                                    }}
                                    handlers={{
                                      onFieldChange: isBilled ? (_f: string, _v: any) => {} : (field, value) => { onItemChange?.(item.id, field, value); },
                                      onPriceChange: isBilled ? undefined : (value) => onItemChange?.(item.id, "amount", value),
                                    }}
                                    customActions={buildRowActions(item)}
                                  />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      /* Empty booking — dashed subtle indicator */
                      <div
                        style={{
                          padding: "12px 16px 12px 44px",
                          borderLeft: "2px dashed var(--neuron-ui-muted)",
                          marginLeft: "16px",
                          marginTop: "4px",
                          marginBottom: "8px",
                        }}
                      >
                        <p style={{ fontSize: "12px", color: "var(--theme-text-muted)", fontStyle: "italic" }}>
                          No billing items yet
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer Summaries — same as category view */}
        {(footerSummary || grossSummary) && (
          <div className="mt-4 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-lg px-6 py-4 flex items-center justify-end gap-8">
            {grossSummary && (
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-wider">
                  {grossSummary.label}
                </span>
                <span className="text-[14px] font-bold text-[var(--theme-text-secondary)]">
                  {formatCurrency(grossSummary.amount, grossSummary.currency)}
                </span>
              </div>
            )}
            {footerSummary && (
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold text-[var(--theme-text-muted)] uppercase tracking-wider">
                  {footerSummary.label}
                </span>
                <span className="text-[14px] font-bold text-[var(--theme-action-primary-bg)]">
                  {formatCurrency(footerSummary.amount, footerSummary.currency)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ✨ SERVICE-GROUPED RENDERING
  if (groupBy === "service") {
    // Group items by serviceType
    const serviceGroups: Record<string, BillingTableItem[]> = {};
    data.forEach(item => {
      const svc = item.serviceType || "General";
      if (!serviceGroups[svc]) serviceGroups[svc] = [];
      serviceGroups[svc].push(item);
    });
    const serviceKeys = Object.keys(serviceGroups).sort();

    // Build a service→bookingId map from linkedBookings for badge display
    // linkedBookings shape: { bookingId, serviceType, bookingNumber?, status? }
    const serviceToBookingId = new Map<string, string>();
    (linkedBookings || []).forEach((b: any) => {
      const svc = (b.serviceType || b.service_type || "").toLowerCase();
      const bid = b.bookingId || b.id || "";
      if (svc && bid) serviceToBookingId.set(svc, bid);
    });

    if (serviceKeys.length === 0) {
      return (
        <div className="rounded-[10px] overflow-hidden" style={{
          backgroundColor: "var(--theme-bg-surface)",
          border: "1px solid var(--neuron-ui-border)"
        }}>
          <div className="px-6 py-12 text-center">
            <Receipt className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--neuron-ink-muted)" }} />
            <h3 style={{ color: "var(--neuron-ink-primary)" }} className="mb-1">No billings found</h3>
            <p style={{ color: "var(--neuron-ink-muted)" }}>{emptyMessage}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-0">
        <div className="bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-xl overflow-hidden">
          <PricingTableHeader
            showCost={false}
            showMarkup={false}
            showForex={true}
            showTax={true}
            firstCellContent={
              <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)" }}>
                Item
              </span>
            }
          />

          {serviceKeys.map((svcKey, svcIdx) => {
            const items = serviceGroups[svcKey] || [];
            const subtotal = items.reduce((sum, i) => sum + i.amount, 0);
            const isExpanded = expandedCategories.has(svcKey);
            const linkedBookingId = serviceToBookingId.get(svcKey.toLowerCase());

            // Sub-group by category within this service
            const catGroups: Record<string, BillingTableItem[]> = {};
            items.forEach(item => {
              const cat = item.category || "General";
              if (!catGroups[cat]) catGroups[cat] = [];
              catGroups[cat].push(item);
            });
            const catNames = Object.keys(catGroups).sort();

            return (
              <div key={svcKey}>
                {/* Service Group Header */}
                <button
                  onClick={() => toggleCategory(svcKey)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 16px",
                    background: isExpanded ? "var(--theme-bg-surface-tint)" : "var(--theme-bg-page)",
                    border: "none",
                    borderTop: svcIdx > 0 ? "1px solid var(--theme-border-default)" : "none",
                    borderBottom: isExpanded ? "1px solid var(--theme-border-default)" : "none",
                    cursor: "pointer",
                    transition: "background 0.15s ease",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div style={{ color: "var(--theme-text-muted)", transition: "transform 0.15s ease", transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}>
                      <ChevronDown size={14} />
                    </div>
                    {getServiceIcon(svcKey, { size: 14, color: "var(--theme-action-primary-bg)" })}
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
                      {svcKey}
                    </span>
                    <span style={{
                      fontSize: "10px", fontWeight: 600,
                      color: "var(--theme-text-muted)",
                      padding: "1px 6px", borderRadius: "3px",
                      backgroundColor: "var(--theme-bg-surface-subtle)",
                      border: "1px solid var(--theme-border-default)",
                    }}>
                      {items.length} item{items.length !== 1 ? "s" : ""}
                    </span>
                    {/* Booking link badge */}
                    {linkedBookingId ? (
                      <span style={{
                        fontSize: "10px", fontWeight: 600,
                        color: "var(--theme-status-success-fg)",
                        backgroundColor: "var(--theme-status-success-bg)",
                        border: "1px solid var(--theme-status-success-border)",
                        padding: "1px 6px", borderRadius: "3px",
                      }}>
                        → {linkedBookingId}
                      </span>
                    ) : (
                      <span style={{
                        fontSize: "10px", fontWeight: 600,
                        color: "var(--theme-status-warning-fg)",
                        backgroundColor: "var(--theme-status-warning-bg)",
                        border: "1px solid var(--theme-status-warning-border)",
                        padding: "1px 6px", borderRadius: "3px",
                      }}>
                        No booking yet
                      </span>
                    )}
                  </div>
                  <span style={{
                    fontSize: "13px", fontWeight: 600,
                    color: "var(--theme-text-primary)", fontFamily: "monospace",
                  }}>
                    {formatCurrency(subtotal)}
                  </span>
                </button>

                {/* Expanded: items sub-grouped by category */}
                {isExpanded && (
                  <>
                    {catNames.map((catName, catIdx) => {
                      const catItems = catGroups[catName];
                      const catSubtotal = catItems.reduce((sum, i) => sum + i.amount, 0);
                      return (
                        <div key={catName}>
                          {catNames.length > 1 && (
                            <div
                              className="flex items-center justify-between"
                              style={{
                                padding: "6px 16px 6px 44px",
                                backgroundColor: "var(--theme-bg-page)",
                                borderBottom: "1px solid var(--theme-border-default)",
                              }}
                            >
                              <span style={{
                                fontSize: "10px", fontWeight: 700,
                                color: "var(--theme-text-muted)",
                                textTransform: "uppercase", letterSpacing: "0.05em",
                              }}>
                                {catName}
                              </span>
                              <div className="flex items-center gap-3">
                                <span style={{ fontSize: "10px", color: "var(--theme-text-muted)" }}>
                                  {catItems.length} item{catItems.length !== 1 ? "s" : ""}
                                </span>
                                <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-text-muted)", fontFamily: "monospace" }}>
                                  {formatCurrency(catSubtotal)}
                                </span>
                              </div>
                            </div>
                          )}
                          <div className="divide-y divide-[var(--theme-border-default)]">
                            {catItems.map(item => {
                              const isBilled = ["billed", "paid", "invoiced", "voided", "cancelled", "void"].includes((item.status || "").toLowerCase());
                              const isHighlighted = highlightId === item.id;
                              return (
                                <div
                                  key={item.id}
                                  ref={isHighlighted ? highlightRef : undefined}
                                  className={isHighlighted ? "ring-2 ring-[var(--theme-action-primary-bg)] bg-[var(--theme-action-primary-bg)]/5 rounded-md transition-all duration-700" : ""}
                                >
                                  <UniversalPricingRow
                                    data={mapToPricingData(item)}
                                    mode={viewMode || isBilled ? "view" : "edit"}
                                    serviceType={item.serviceType}
                                    config={{
                                      showCost: false,
                                      showMarkup: false,
                                      showForex: true,
                                      showTax: true,
                                      simpleMode: true,
                                      priceEditable: true,
                                    }}
                                    handlers={{
                                      onFieldChange: isBilled ? (_f: string, _v: any) => {} : (field, value) => { onItemChange?.(item.id, field, value); },
                                      onPriceChange: isBilled ? undefined : (value) => onItemChange?.(item.id, "amount", value),
                                    }}
                                    customActions={buildRowActions(item)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {(footerSummary || grossSummary) && (
          <div className="mt-4 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-lg px-6 py-4 flex items-center justify-end gap-8">
            {grossSummary && (
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-wider">
                  {grossSummary.label}
                </span>
                <span className="text-[14px] font-bold text-[var(--theme-text-secondary)]">
                  {formatCurrency(grossSummary.amount, grossSummary.currency)}
                </span>
              </div>
            )}
            {footerSummary && (
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold text-[var(--theme-text-muted)] uppercase tracking-wider">
                  {footerSummary.label}
                </span>
                <span className="text-[14px] font-bold text-[var(--theme-action-primary-bg)]">
                  {formatCurrency(footerSummary.amount, footerSummary.currency)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ✨ CATEGORY-GROUPED RENDERING (existing behavior)
  return (
    <div className="flex flex-col gap-6">
      {/* Categories List */}
      <div className="flex flex-col gap-4">
        {displayedCategories.map(category => {
            const items = groupedData[category] || [];
            const isExpanded = expandedCategories.has(category);
            const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
            const currency = items[0]?.currency || "PHP";

            // Adapter: Create a partial SellingPriceCategory object for the header
            const headerCategoryMock: any = {
                id: category, // Use name as ID
                category_name: category,
                line_items: items, // Passing array ensures .length works
                subtotal: subtotal
            };

            return (
            <div 
                key={category}
                className="bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-xl overflow-hidden"
            >
                {/* Reused Category Header */}
                <CategoryHeader 
                    category={headerCategoryMock}
                    isExpanded={isExpanded}
                    onToggle={() => toggleCategory(category)}
                    onAddItem={() => {
                        // Auto-expand the category when adding an item
                        if (!expandedCategories.has(category)) {
                             toggleCategory(category);
                        }
                        onAddItem?.(category);
                    }}
                    onRename={(newName) => onRenameCategory?.(category, newName)}
                    onDuplicate={() => {}} // Not implemented
                    onDelete={() => onDeleteCategory?.(category)}
                    viewMode={viewMode}
                />

                {/* Collapsible Content */}
                {isExpanded && (
                <div className="p-4 bg-[var(--theme-bg-surface)]">
                    <div className="border border-[var(--theme-border-default)] rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        {/* Table Header */}
                        {items.length > 0 ? (
                            <>
                                <PricingTableHeader 
                                showCost={false}
                                showMarkup={false}
                                showForex={true}
                                showTax={true}
                                />

                                {/* Items */}
                                <div className="divide-y divide-[var(--theme-border-default)]">
                                {items.map(item => {
                                    // Protect billed/paid items from editing
                                    const isBilled = ["billed", "paid", "invoiced", "voided", "cancelled", "void"].includes((item.status || "").toLowerCase());
                                    return (
                                    <UniversalPricingRow
                                    key={item.id}
                                    data={mapToPricingData(item)}
                                    mode={viewMode || isBilled ? "view" : "edit"}
                                    serviceType={item.serviceType}
                                    config={{
                                        showCost: false,
                                        showMarkup: false,
                                        showForex: true,
                                        showTax: true,
                                        simpleMode: true,
                                        priceEditable: true
                                    }}
                                    handlers={{
                                        onFieldChange: isBilled ? (_f: string, _v: any) => {} : (field, value) => { onItemChange?.(item.id, field, value); },
                                        onPriceChange: isBilled ? undefined : (value) => onItemChange?.(item.id, 'amount', value),
                                    }}
                                    customActions={buildRowActions(item)}
                                    />
                                    );
                                })}
                                </div>
                            </>
                        ) : (
                            <div className="py-8 text-center text-[var(--theme-text-muted)] text-[13px] italic">
                                No items in this category. Click "Add Item" to start.
                            </div>
                        )}
                    </div>
                    </div>
                </div>
                )}
            </div>
            );
        })}
      </div>

      {/* Footer Summaries */}
      {(footerSummary || grossSummary) && (
         <div className="mt-4 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-lg px-6 py-4 flex items-center justify-end gap-8">
           {grossSummary && (
             <div className="flex items-center gap-2">
               <span className="text-[12px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-wider">
                 {grossSummary.label}
               </span>
               <span className="text-[14px] font-bold text-[var(--theme-text-secondary)]">
                 {formatCurrency(grossSummary.amount, grossSummary.currency)}
               </span>
             </div>
           )}
           {footerSummary && (
             <div className="flex items-center gap-2">
               <span className="text-[12px] font-bold text-[var(--theme-text-muted)] uppercase tracking-wider">
                 {footerSummary.label}
               </span>
               <span className="text-[14px] font-bold text-[var(--theme-action-primary-bg)]">
                 {formatCurrency(footerSummary.amount, footerSummary.currency)}
               </span>
             </div>
           )}
         </div>
      )}
    </div>
  );
}
