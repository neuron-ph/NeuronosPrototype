import React, { useState, useMemo, useRef, useEffect } from "react";
import { Search, X, Plus, Filter, Download, Loader2, Pencil, Check } from "lucide-react";
import { useUser } from "../../../hooks/useUser";
import { logActivity } from "../../../utils/activityLog";
import { CustomDropdown } from "../../bd/CustomDropdown";
import { CustomDatePicker } from "../../common/CustomDatePicker";
import { BillingsTable } from "./BillingsTable";
import { CategoryPresetDropdown } from "../../pricing/quotations/CategoryPresetDropdown";
import { toast } from "../../ui/toast-utils";
import { supabase } from "../../../utils/supabase/client";
import type { QuotationNew } from "../../../types/pricing";
import { buildServiceToBookingMap, resolveBookingIdForService } from "../../../utils/financialSelectors";

// Interface matching the backend response for billing items
export interface BillingItem {
  id: string;
  created_at: string;
  service_type: string;
  description: string;
  amount: number;
  currency: string;
  status: 'unbilled' | 'invoiced' | 'paid' | 'voided';
  quotation_category?: string;
  booking_id?: string | null;
  // Linking fields
  source_id?: string;
  source_quotation_item_id?: string; // Matching backend field for imported items
  source_type?: 'quotation_item' | 'billable_expense' | 'manual' | 'contract_rate' | 'rate_card';
  is_virtual?: boolean;
  catalog_item_id?: string; // Catalog linkage (Item Master reference)
  [key: string]: any;
}

interface UnifiedBillingsTabProps {
  items: BillingItem[];
  quotation?: QuotationNew; // New prop for reflective billing
  projectId: string; // Project Number
  bookingId?: string;
  onRefresh: () => void;
  isLoading?: boolean;
  readOnly?: boolean;
  /** Optional title override (defaults to "Project Billings") */
  title?: string;
  /** Optional subtitle override */
  subtitle?: string;
  /** Optional extra action buttons rendered alongside "Add Billing" */
  extraActions?: React.ReactNode;
  /** Enable group-by toggle (only for contract billings). When set, shows Booking/Category toggle. */
  enableGroupByToggle?: boolean;
  /** Linked bookings metadata for booking-grouped view headers */
  linkedBookings?: any[];
  /** Deep-link: highlight a specific billing item */
  highlightId?: string | null;
  /** Amber badge count: unconverted billable expenses pending conversion */
  pendingBillableCount?: number;
}

const formatCurrency = (amount: number, currency: string = "PHP") => {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

const EMPTY_LINKED_BOOKINGS: any[] = [];
// Canonical billing item statuses: unbilled → invoiced → paid → voided
// Items with any of these statuses are immutable (locked from editing/deletion).
const IMMUTABLE_BILLING_STATUSES = new Set(["invoiced", "paid", "voided"]);
const VOIDED_BILLING_STATUSES = new Set(["voided"]);

export function UnifiedBillingsTab({
  items,
  quotation,
  projectId,
  bookingId,
  onRefresh,
  isLoading = false,
  readOnly = false,
  title,
  subtitle,
  extraActions,
  enableGroupByToggle = false,
  linkedBookings,
  highlightId,
  pendingBillableCount,
}: UnifiedBillingsTabProps) {
  const { user } = useUser();
  // Stable reference for empty array to prevent infinite re-render loops
  const stableLinkedBookings = linkedBookings && linkedBookings.length > 0 ? linkedBookings : EMPTY_LINKED_BOOKINGS;
  
  // -- Local State --
  const [localItems, setLocalItems] = useState<BillingItem[]>([]);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  // Removed isImporting state as import button is gone
  // Removed isEditing state - now derived from readOnly
  const [pendingChanges, setPendingChanges] = useState(false);
  // groupBy is always "booking" for contract billings, "category" otherwise
  const groupBy = enableGroupByToggle ? "booking" : "category";

  // Category Dropdown State
  const [showAddCategoryDropdown, setShowAddCategoryDropdown] = useState(false);
  const addCategoryBtnRef = useRef<HTMLButtonElement>(null);

  // Always edit mode if not read only
  const isEditing = !readOnly;

  // -- MERGE LOGIC --
  // Merges Real Billing Items with Virtual Quotation Items
  const mergedItems = useMemo(() => {
    // Build service-to-booking map from linkedBookings for auto-routing
    // Maps e.g. "Brokerage" → "BRK-20260301-1234"
    const serviceToBookingMap = buildServiceToBookingMap(stableLinkedBookings);

    // Helper: resolve booking_id from a service type
    const resolveBookingId = (serviceType: string | undefined) => {
      // If we're already at booking-level (bookingId prop set), use that
      if (bookingId) return bookingId;
      // Try to match service → booking
      if (serviceType && serviceToBookingMap.has(serviceType.toLowerCase())) {
        return serviceToBookingMap.get(serviceType.toLowerCase())!;
      }
      return null;
    };

    // 1. Deep copy existing real items to avoid mutating props
    // We filter out items that will be replaced by the reflective logic to avoid duplicates if we push them later, 
    // OR we just update them in place. Updating in place is better to preserve IDs.
    const combined = items.map(item => ({ ...item }));
    
    // Create a map of "Source IDs" to their index in the combined array
    const realItemIndices = new Map<string, number>();
    
    combined.forEach((item, index) => {
        const sourceId = item.source_quotation_item_id || item.source_id;
        if (sourceId) {
            realItemIndices.set(sourceId, index);
        }
    });

    // If we have a quotation, reflect its items
    if (quotation && quotation.selling_price) {
        quotation.selling_price.forEach(cat => {
            cat.line_items.forEach(item => {
                const sourceId = item.id;
                const existingIndex = realItemIndices.get(sourceId);

                if (existingIndex !== undefined) {
                    // REAL ITEM EXISTS
                    // If the item is UNBILLED, we reflect the quotation changes live.
                    // This overwrites the DB value with the Quotation value in the UI.
                    // When saved, this new value becomes the persistent one.
                    const existingItem = combined[existingIndex];
                    
                    if (existingItem.status === 'unbilled') {
                        combined[existingIndex] = {
                            ...existingItem,
                            // Reflective fields (Overwrite DB with Quote)
                            description: item.description,
                            service_type: item.service || existingItem.service_type || "General",
                            amount: item.amount, // Calculated final price
                            currency: item.currency,
                            quotation_category: cat.category_name,
                            // Auto-route to correct booking based on service tag
                            booking_id: resolveBookingId(item.service || existingItem.service_type),
                            // Extended fields
                            quantity: item.quantity,
                            forex_rate: item.forex_rate,
                            is_taxed: item.is_taxed,
                            amount_added: item.amount_added,
                            percentage_added: item.percentage_added,
                            base_cost: item.base_cost
                        };
                    }
                    return; 
                }

                // NO REAL ITEM -> Create Virtual Item
                const virtualItem: BillingItem = {
                    id: `virtual-${item.id}`,
                    source_id: item.id, // We use generic source_id for internal tracking
                    source_quotation_item_id: item.id, // We set specific one for backend compatibility
                    source_type: 'quotation_item',
                    is_virtual: true,
                    created_at: quotation.created_at || new Date().toISOString(),
                    service_type: item.service || "General",
                    description: item.description,
                    amount: item.amount, // This is final_price (unit * qty * forex)
                    currency: item.currency,
                    status: 'unbilled', // Virtual items are always unbilled by definition
                    quotation_category: cat.category_name,
                    booking_id: resolveBookingId(item.service),
                    // Extended fields for editing
                    quantity: item.quantity,
                    forex_rate: item.forex_rate,
                    is_taxed: item.is_taxed,
                    amount_added: item.amount_added,
                    percentage_added: item.percentage_added,
                    base_cost: item.base_cost
                };

                combined.push(virtualItem);
            });
        });
    }

    return combined;
  }, [items, quotation, projectId, bookingId, stableLinkedBookings]);

  // Sync merged items to local state when props change (and not pending changes)
  useEffect(() => {
     if (!pendingChanges) {
         setLocalItems(prev => prev === mergedItems ? prev : mergedItems);
         
         // Update categories based on merged items — only update if content changed
         const newCatNames = mergedItems.map(i => i.quotation_category || "General");
         const newCatsSet = new Set(newCatNames);
         if (newCatsSet.size === 0) newCatsSet.add("General");
         setActiveCategories(prev => {
           if (prev.size === newCatsSet.size && [...prev].every(c => newCatsSet.has(c))) return prev;
           return newCatsSet;
         });
     }
  }, [mergedItems, pendingChanges]);

  // -- Derived Data --
  // We use activeCategories state instead of deriving from items now, to support empty categories
  const categoriesList = useMemo(() => Array.from(activeCategories).sort(), [activeCategories]);

  const totalUnbilledAmount = useMemo(() => {
    return localItems
      .filter(i => i.status === "unbilled")
      .reduce((sum, i) => sum + (i.amount || 0), 0);
  }, [localItems]);

  const totalGrossAmount = useMemo(() => {
    return localItems
      .filter(i => !VOIDED_BILLING_STATUSES.has((i.status || "").toLowerCase()))
      .reduce((sum, i) => sum + (i.amount || 0), 0);
  }, [localItems]);

  // -- Filter Logic --
  const filteredItems = useMemo(() => {
    return localItems.filter((item) => {
      // 1. Search Query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          (item.description || "").toLowerCase().includes(query) ||
          (item.service_type || "").toLowerCase().includes(query) ||
          (item.quotation_category || "").toLowerCase().includes(query) ||
          (item.booking_id || "").toLowerCase().includes(query);
        
        if (!matchesSearch) return false;
      }

      // 2. Status Filter
      if (selectedStatus && item.status !== selectedStatus) {
        return false;
      }

      // 3. Date Filter (created_at)
      if (dateFrom) {
        const itemDate = new Date(item.created_at);
        const fromDate = new Date(dateFrom);
        if (itemDate < fromDate) return false;
      }
      if (dateTo) {
        const itemDate = new Date(item.created_at);
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (itemDate > toDate) return false;
      }

      // 4. Category Filter
      if (selectedCategory) {
        const cat = item.quotation_category || "Uncategorized";
        if (cat !== selectedCategory) return false;
      }

      return true;
    });
  }, [localItems, searchQuery, selectedStatus, dateFrom, dateTo, selectedCategory]);

  // Memoize the data transformation for BillingsTable to avoid new array refs on every render
  const billingsTableData = useMemo(() => {
    return filteredItems.map(item => ({
      id: item.id,
      date: item.created_at,
      category: item.quotation_category || "Uncategorized",
      serviceType: item.service_type || "General",
      description: item.description,
      status: item.status,
      amount: item.amount,
      currency: item.currency || "PHP",
      originalData: item
    }));
  }, [filteredItems]);

  const hasActiveFilters = dateFrom || dateTo || selectedCategory || selectedStatus || searchQuery;

  const isImmutableBillingItem = (item?: BillingItem | null) => {
    const status = (item?.status || "").toLowerCase();
    return IMMUTABLE_BILLING_STATUSES.has(status);
  };

  const handleClearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSelectedCategory("");
    setSelectedStatus("");
    setSearchQuery("");
  };

  // -- Handlers for Category Management --
  const handleAddCategory = (name: string) => {
    if (!name.trim()) return;
    setActiveCategories(prev => {
        const next = new Set(prev);
        next.add(name.trim());
        return next;
    });
    setPendingChanges(true);
  };

  const handleRenameCategory = (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) return;
    const hasImmutableItems = localItems.some((item) => (item.quotation_category || "General") === oldName && isImmutableBillingItem(item));
    if (hasImmutableItems) {
      toast.error("Categories with invoiced or paid billing lines cannot be renamed.");
      return;
    }
    
    // 1. Update Category State
    setActiveCategories(prev => {
        const next = new Set(prev);
        next.delete(oldName);
        next.add(newName);
        return next;
    });

    // 2. Update Items
    setLocalItems(prev => prev.map(item => {
        const cat = item.quotation_category || "General";
        if (cat === oldName) {
            return { ...item, quotation_category: newName };
        }
        return item;
    }));
    setPendingChanges(true);
  };

  const handleDeleteCategory = (name: string) => {
      const hasImmutableItems = localItems.some((item) => (item.quotation_category || "General") === name && isImmutableBillingItem(item));
      if (hasImmutableItems) {
          toast.error("Categories with invoiced or paid billing lines cannot be deleted.");
          return;
      }
      if (confirm(`Are you sure you want to delete category "${name}" and all its items?`)) {
          setActiveCategories(prev => {
              const next = new Set(prev);
              next.delete(name);
              return next;
          });
          setLocalItems(prev => prev.filter(item => (item.quotation_category || "General") !== name));
          setPendingChanges(true);
      }
  };

  const handleAddItemToCategory = (categoryName: string) => {
    const newItem: BillingItem = {
      id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date().toISOString(),
      service_type: "",
      description: "",
      amount: 0,
      currency: "PHP",
      status: "unbilled",
      quotation_category: categoryName,
      booking_id: bookingId || null,
      // Default Extended Fields
      quantity: 1,
      forex_rate: 1,
      is_taxed: false,
      amount_added: 0,
      percentage_added: 0
    };
    
    setLocalItems(prev => [...prev, newItem]);
    setPendingChanges(true);
  };

  const handleItemChange = (id: string, field: string, value: any) => {
    const targetItem = localItems.find((item) => item.id === id);
    if (targetItem && isImmutableBillingItem(targetItem)) {
      toast.info("Invoiced billing lines are immutable. Use a reversal or credit flow instead.");
      return;
    }

    // Phase 3: Handle deletion
    if (field === 'delete') {
        if (confirm("Remove this billing item?")) {
            setLocalItems(prev => prev.filter(i => i.id !== id));
            setPendingChanges(true);
        }
        return;
    }

    // Map view fields to backend fields
    let backendField = field;
    if (field === 'category') backendField = 'quotation_category';
    if (field === 'serviceType' || field === 'service') backendField = 'service_type';
    
    // Ensure numeric types
    if (['amount', 'quantity', 'forex_rate', 'amount_added', 'percentage_added'].includes(field)) {
        value = Number(value) || 0;
    }

    setLocalItems(prev => prev.map(item => {
      if (item.id === id) {
        // If editing a virtual item, it's technically still virtual until saved,
        // but for the UI it behaves like a normal item being edited.
        // We might want to clear 'is_virtual' flag here? 
        // No, keep it until save so backend knows to create new.
        return { ...item, [backendField]: value };
      }
      return item;
    }));
    setPendingChanges(true);
  };

  const handleAddBilling = () => {
    const newItem: BillingItem = {
      id: `temp-${Date.now()}`,
      created_at: new Date().toISOString(),
      service_type: "",
      description: "",
      amount: 0,
      currency: "PHP",
      status: "unbilled",
      quotation_category: "Uncategorized",
      booking_id: bookingId || null
    };
    
    setLocalItems(prev => [newItem, ...prev]);
    setPendingChanges(true);
    toast.success("New billing row added. Edit details below.");
  };

  const handleSaveChanges = async () => {
      try {
          // Recalculate booking_id for each item based on its service_type
          const itemsToSave = localItems.map(item => {
            const resolvedBookingId = resolveBookingIdForService({
              serviceType: item.service_type,
              bookingId: item.booking_id || bookingId,
              linkedBookings: stableLinkedBookings,
            });

            return { ...item, booking_id: resolvedBookingId };
          });

          const immutableItems = itemsToSave.filter((item) => isImmutableBillingItem(item));
          if (immutableItems.length > 0) {
            const currentItems = new Map(mergedItems.map((item) => [item.id, item]));
            const hasImmutableMutation = immutableItems.some((item) => {
              const original = currentItems.get(item.id);
              if (!original) return false;
              return JSON.stringify(item) !== JSON.stringify(original);
            });

            if (hasImmutableMutation) {
              toast.error("Invoiced billing lines cannot be edited or removed. Refresh and use a reversal flow instead.");
              return;
            }
          }

          const unresolvedItems = itemsToSave.filter(item => !item.booking_id);
          if (unresolvedItems.length > 0) {
            toast.error("Every billing row must be assigned to a real booking before saving.");
            return;
          }

          toast.info("Saving changes...");

          const isNew = (item: any) =>
            item.is_virtual ||
            (item.id && (item.id.startsWith('temp-') || item.id.startsWith('virtual-')));

          const mapRow = (item: any) => ({
            booking_id: item.booking_id || null,
            project_number: projectId,
            description: item.description || "",
            service_type: item.service_type || "",
            category: item.quotation_category || "Uncategorized",
            amount: item.amount || 0,
            quantity: item.quantity || 1,
            currency: item.currency || "PHP",
            status: item.status || "unbilled",
            is_taxed: item.is_taxed || false,
            catalog_item_id: item.catalog_item_id || null,
            // Snapshot: preserve catalog metadata at creation time so renames
            // don't alter historical billing line descriptions.
            catalog_snapshot: item.catalog_item_id
              ? {
                  name: item.description || "",
                  unit_type: item.unit_type || null,
                  tax_code: item.tax_code || null,
                  category_name: item.quotation_category || null,
                  default_price: item.amount || 0,
                  currency: item.currency || "PHP",
                }
              : (item.catalog_snapshot || {}),
            created_at: item.created_at || new Date().toISOString(),
          });

          const realItems = itemsToSave.filter(i => !isNew(i));
          const newItems = itemsToSave.filter(i => isNew(i));

          const ops: Promise<any>[] = [];

          if (realItems.length > 0) {
            ops.push(
              (supabase.from('billing_line_items').upsert(
                realItems.map(i => ({ id: i.id, ...mapRow(i) }))
              ).select() as unknown) as Promise<any>
            );
          }
          if (newItems.length > 0) {
            ops.push(
              (supabase.from('billing_line_items').insert(
                newItems.map(i => ({ id: crypto.randomUUID(), ...mapRow(i) }))
              ).select() as unknown) as Promise<any>
            );
          }

          const results = await Promise.all(ops);
          const saveError = results.find(r => r.error)?.error;

          if (!saveError) {
              const actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
              logActivity("billing", projectId, projectId, "updated", actor, { description: "Billing items saved" });
              toast.success("Changes saved successfully");
              setPendingChanges(false);
              onRefresh();
          } else {
              toast.error(saveError.message || "Failed to save changes");
          }

      } catch (error) {
          console.error("Error saving billings:", error);
          toast.error("Failed to save changes");
      }
  };

  const handleCancelChanges = () => {
      if (confirm("Discard all unsaved changes?")) {
        setLocalItems(mergedItems); // Revert to merged state
        setPendingChanges(false);
      }
  };

  const handleVoidItem = async (itemId: string) => {
    const item = localItems.find(i => i.id === itemId);
    if (!item) return;

    // Virtual / unsaved items have no DB record — just remove locally
    if (item.is_virtual || item.id.startsWith("virtual-") || item.id.startsWith("temp-")) {
      if (confirm("Remove this unsaved item?")) {
        setLocalItems(prev => prev.filter(i => i.id !== itemId));
      }
      return;
    }

    if (!confirm("Void this billing item? The record will be preserved with status 'voided'.")) return;

    const { error } = await supabase
      .from("billing_line_items")
      .update({ status: "voided" })
      .eq("id", itemId);

    if (error) {
      toast.error("Failed to void billing item");
      return;
    }
    const actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
    logActivity("billing", itemId, item.description ?? itemId, "cancelled", actor);
    toast.success("Billing item voided");
    onRefresh();
  };

  return (
    <div className="flex flex-col bg-[var(--theme-bg-surface)]">
      {/* Header Section */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[32px] font-semibold text-[var(--theme-text-primary)] mb-1 tracking-tight flex items-center gap-2">
            {title || "Project Billings"}
            {pendingBillableCount != null && pendingBillableCount > 0 && (
              <span
                className="text-[12px] font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)", border: "1px solid var(--theme-status-warning-border)" }}
                title={`${pendingBillableCount} billable expense${pendingBillableCount !== 1 ? "s" : ""} not yet converted to billing items`}
              >
                {pendingBillableCount} pending
              </span>
            )}
          </h1>
          <p className="text-[14px] text-[var(--theme-text-muted)]">
            {subtitle || "Manage, track, and bill charges across all linked bookings."}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
            {/* Save / Cancel Controls */}
            {pendingChanges && (
                <>
                    <button
                        onClick={handleCancelChanges}
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] text-[var(--theme-text-secondary)] rounded-lg hover:bg-[var(--theme-bg-page)] transition-colors font-medium text-[14px]"
                    >
                        <X size={16} />
                        Cancel
                    </button>
                    <button
                        onClick={handleSaveChanges}
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--theme-action-primary-bg)] text-white rounded-lg hover:bg-[#0D6559] transition-colors font-medium text-[14px]"
                    >
                        <Check size={16} />
                        Save Changes
                    </button>
                </>
            )}

            {/* Add Billing Button */}
            {!readOnly && !pendingChanges && (
                <button
                    onClick={handleAddBilling}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--theme-action-primary-bg)] text-white rounded-lg hover:bg-[#0D6559] transition-colors font-medium text-[14px]"
                >
                    <Plus size={16} />
                    Add Billing
                </button>
            )}
        </div>
      </div>

      {/* Contextual Actions (e.g., Rate Card Banner) */}
      {extraActions && (
        <div className="mb-4">
          {extraActions}
        </div>
      )}

      {/* Control Bar */}
      <div className="flex items-center gap-2 mb-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--neuron-ink-muted)]" />
          <input
            type="text"
            placeholder="Search by Description, Service Type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 text-[13px] border-[1.5px] border-[var(--neuron-ui-border)] bg-[var(--theme-bg-surface)] text-[var(--neuron-ink-primary)] focus:border-[var(--theme-action-primary-bg)]"
          />
        </div>

        {/* Filters */}
        <div style={{ minWidth: "140px" }}>
           <CustomDatePicker value={dateFrom} onChange={setDateFrom} placeholder="Start Date" minWidth="100%" className="w-full px-4 py-2" />
        </div>
        <span className="text-[13px] text-[var(--theme-text-muted)] font-medium">to</span>
        <div style={{ minWidth: "140px" }}>
           <CustomDatePicker value={dateTo} onChange={setDateTo} placeholder="End Date" minWidth="100%" className="w-full px-4 py-2" />
        </div>
        
        {/* Status Filter */}
        <div style={{ minWidth: "140px" }}>
          <CustomDropdown
            value={selectedStatus}
            onChange={setSelectedStatus}
            options={[
              { value: "", label: "Status" },
              { value: "unbilled", label: "Unbilled" },
              { value: "billed", label: "Billed" },
              { value: "paid", label: "Paid" },
              { value: "voided", label: "Voided" }
            ]}
            placeholder="Status"
          />
        </div>

        {/* Category Filter */}
        <div style={{ minWidth: "140px" }}>
          <CustomDropdown
            value={selectedCategory}
            onChange={setSelectedCategory}
            options={[{ value: "", label: "Category" }, ...categoriesList.map(c => ({ value: c, label: c }))]}
            placeholder="Category"
          />
        </div>

        {/* Add Category Button (Visible in Edit Mode) */}
        {isEditing && !readOnly && (
             <div className="relative">
                <button
                    ref={addCategoryBtnRef}
                    onClick={() => setShowAddCategoryDropdown(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] text-[var(--theme-action-primary-bg)] rounded-lg hover:bg-[var(--theme-bg-page)] transition-colors font-medium text-[13px] h-10"
                >
                    <Plus size={16} />
                    Add Category
                </button>
                <CategoryPresetDropdown
                    isOpen={showAddCategoryDropdown}
                    onClose={() => setShowAddCategoryDropdown(false)}
                    buttonRef={addCategoryBtnRef as React.RefObject<HTMLButtonElement>}
                    onSelect={(cat) => {
                        handleAddCategory(cat);
                        setShowAddCategoryDropdown(false);
                    }}
                />
            </div>
        )}

        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="flex items-center justify-center w-10 h-10 rounded-lg text-[var(--theme-status-danger-fg)] hover:bg-[var(--theme-status-danger-bg)] transition-colors shrink-0"
            title="Clear Filters"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Table Component */}
      <BillingsTable
        data={billingsTableData}
        isLoading={isLoading}
        emptyMessage="No billings found. Items from your quotation will appear here automatically."
        footerSummary={filteredItems.length > 0 ? {
          label: "Total Unbilled",
          amount: totalUnbilledAmount,
          currency: "PHP" 
        } : undefined}
        grossSummary={filteredItems.length > 0 ? {
          label: "Total Gross Billings",
          amount: totalGrossAmount,
          currency: "PHP"
        } : undefined}
        viewMode={!isEditing}
        onItemChange={handleItemChange}
        // Phase 3: Category Management Handlers
        activeCategories={activeCategories}
        onAddCategory={!readOnly ? handleAddCategory : undefined}
        onRenameCategory={!readOnly ? handleRenameCategory : undefined}
        onDeleteCategory={!readOnly ? handleDeleteCategory : undefined}
        onAddItem={!readOnly ? handleAddItemToCategory : undefined}
        groupBy={groupBy}
        linkedBookings={stableLinkedBookings}
        highlightId={highlightId}
        onVoidItem={!readOnly ? handleVoidItem : undefined}
      />
    </div>
  );
}
