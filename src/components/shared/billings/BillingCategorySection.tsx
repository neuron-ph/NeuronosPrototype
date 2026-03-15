import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { SharedPricingRow, PricingRowData } from "../pricing/SharedPricingRow";
import { apiFetch } from "../../../utils/api";
import { toast } from "../../ui/toast-utils";
import { PricingTableHeader } from "../pricing/PricingTableHeader";
import { UniversalPricingRow, PricingItemData } from "../pricing/UniversalPricingRow";

// Define locally to avoid circular dependencies
export interface BillingCategoryItem {
  id: string;
  created_at: string;
  service_type: string;
  description: string;
  amount: number;
  currency: string;
  status: 'unbilled' | 'billed' | 'paid';
  quotation_category?: string;
  [key: string]: any;
}

interface BillingCategorySectionProps {
  categoryName: string;
  items: BillingCategoryItem[];
  defaultExpanded?: boolean;
  projectId?: string;
  bookingId?: string;
  onRefresh?: () => void;
  readOnly?: boolean;
  viewMode?: boolean;
  // New props for in-place creation
  isEditing?: boolean;
  onSaveName?: (name: string) => void;
  onCancel?: () => void;
  onDelete?: () => void; // New prop for deletion
}

export function BillingCategorySection({
  categoryName,
  items,
  defaultExpanded = true,
  projectId,
  bookingId,
  onRefresh,
  readOnly = false,
  viewMode = false, // Default to Edit mode if not specified? No, usually View mode.
  isEditing = false,
  onSaveName,
  onCancel,
  onDelete
}: BillingCategorySectionProps) {
  // If readOnly is true, force viewMode to true
  const effectiveViewMode = readOnly || viewMode;
  
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [localItems, setLocalItems] = useState<BillingCategoryItem[]>(items);
  
  // Local state for name editing
  const [editName, setEditName] = useState(categoryName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync props to local state
  useEffect(() => {
    setLocalItems(items);
  }, [items]);
  
  // Auto-focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  // Helper: Format Currency
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  // Logic: Calculate Subtotals per Currency
  const subtotals = localItems.reduce((acc, item) => {
    const curr = item.currency || 'PHP';
    acc[curr] = (acc[curr] || 0) + (item.amount || 0);
    return acc;
  }, {} as Record<string, number>);

  const subtotalDisplay = Object.entries(subtotals)
    .map(([curr, amount]) => formatCurrency(amount, curr))
    .join(" + ");

  const handleSaveItem = async (data: PricingRowData) => {
    if (!projectId) return;

    try {
      const payload = {
        project_number: projectId,
        booking_id: bookingId,
        description: data.description,
        amount: data.total_amount, // Use the calculated total
        currency: data.currency,
        service_type: data.service_type,
        type: "revenue", // Default
        source_type: "manual",
        quotation_category: categoryName,
        quantity: data.quantity,
        unit_price: data.price, 
        remarks: data.remarks
      };

      const response = await apiFetch(`/accounting/billing-items`, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast.success("Item added successfully");
        setIsAddingItem(false);
        if (onRefresh) onRefresh();
      } else {
        toast.error(result.error || "Failed to add item");
      }
    } catch (error) {
      console.error("Error adding item:", error);
      toast.error("An error occurred while adding the item");
    }
  };

  // Handle local field changes (visual only until save is implemented)
  const handleItemChange = (id: string, field: string, value: any) => {
    setLocalItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      return { ...item, [field]: value };
    }));
  };

  // Handle local removal
  const handleRemoveItem = (id: string) => {
    setLocalItems(prev => prev.filter(item => item.id !== id));
    toast.success("Item removed from list (unsaved)");
  };
  
  // Handle Category Name Save
  const handleNameSave = () => {
    if (!editName.trim()) {
      if (onCancel) onCancel();
    } else {
      if (onSaveName) onSaveName(editName.trim());
    }
  };

  return (
    <div style={{
      border: "1px solid var(--neuron-ui-border)", // #E5E9F0
      borderLeft: "3px solid var(--neuron-brand-green)", // #12332B
      borderRadius: "8px",
      backgroundColor: "white",
      overflow: "hidden",
      marginBottom: "16px"
    }}>
      {/* Header */}
      <div 
        onClick={() => !isEditing && setIsExpanded(!isExpanded)}
        style={{
          padding: "12px 16px",
          borderBottom: isExpanded ? "1px solid var(--neuron-ui-border)" : "none",
          backgroundColor: "#F8FBFB",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: isEditing ? "default" : "pointer",
          minHeight: "48px"
        }}
        className="group" // For hover effects
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
          <button
            style={{
              background: "none",
              border: "none",
              cursor: isEditing ? "default" : "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              color: "var(--neuron-ink-secondary, #6B7280)",
              visibility: isEditing ? "hidden" : "visible"
            }}
          >
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="ENTER CATEGORY NAME"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameSave();
                if (e.key === 'Escape' && onCancel) onCancel();
              }}
              onBlur={() => {
                 handleNameSave();
              }}
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--neuron-ink-primary, #111827)",
                textTransform: "uppercase",
                letterSpacing: "0.3px",
                border: "none",
                borderRadius: "0",
                padding: "0",
                outline: "none",
                width: "100%",
                maxWidth: "300px",
                backgroundColor: "transparent",
                fontFamily: "inherit"
              }}
              onClick={(e) => e.stopPropagation()} // Prevent expansion toggle
            />
          ) : (
            <span style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--neuron-ink-primary, #111827)",
              textTransform: "uppercase",
              letterSpacing: "0.3px"
            }}>
              {categoryName}
            </span>
          )}

          {!isEditing && (
            <span style={{
              fontSize: "11px",
              color: "var(--neuron-ink-muted, #9CA3AF)",
              marginLeft: "8px"
            }}>
              ({localItems.length} {localItems.length === 1 ? 'item' : 'items'})
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {!isEditing && (
            <span style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--neuron-brand-green, #0F766E)"
            }}>
              {subtotalDisplay || "0.00"}
            </span>
          )}
          
          {/* Action Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Add Item Button (Inline) */}
            {!effectiveViewMode && !isAddingItem && !isEditing && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(true);
                  setIsAddingItem(true);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 8px",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--neuron-brand-green, #0F766E)",
                  backgroundColor: "#F0FDF9",
                  border: "1px solid #CCFBF1",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                <Plus size={12} />
                Add Item
              </button>
            )}

            {/* Delete Category Button - Now always shown if onDelete provided */}
            {!effectiveViewMode && !isEditing && onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "6px",
                  color: "#9CA3AF", // Muted by default
                  border: "1px solid transparent",
                  borderRadius: "4px",
                  cursor: "pointer",
                  backgroundColor: "transparent",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#EF4444"; // Red on hover
                  e.currentTarget.style.backgroundColor = "#FEF2F2";
                  e.currentTarget.style.borderColor = "#FECACA";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#9CA3AF";
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.borderColor = "transparent";
                }}
                title="Delete category"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table Body */}
      {isExpanded && !isEditing && (
        <div className="p-4">
          <div style={{
            border: "1px solid #E5E9E8",
            borderRadius: "10px",
            overflow: "hidden",
            backgroundColor: "white",
            marginBottom: isAddingItem ? "12px" : "0"
          }}>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              {/* Shared Header (With Forex/Tax) */}
              <PricingTableHeader 
                simpleMode={true} // Just used for context, but we override
                showCost={false}
                showMarkup={false}
                showForex={true}
                showTax={true}
              />

              {/* Rows */}
              {localItems.map((item) => {
                // Map BillingItem to PricingItemData
                const pricingData: PricingItemData = {
                  id: item.id,
                  description: item.description,
                  quantity: item.quantity || 1,
                  base_cost: 0,
                  amount_added: item.amount, // Final Amount
                  percentage_added: 0,
                  currency: item.currency,
                  forex_rate: item.forex_rate || 1,
                  is_taxed: item.is_taxed || false,
                  final_price: item.amount,
                  remarks: item.remarks || "",
                  service: item.service_type,
                  status: item.status, // Billing status
                  created_at: item.created_at
                };

                return (
                  <UniversalPricingRow 
                    key={item.id}
                    data={pricingData}
                    mode={effectiveViewMode ? "view" : "edit"} // Controlled by parent
                    serviceType={item.service_type}
                    itemType="charge"
                    config={{
                      simpleMode: true,
                      showCost: false,
                      showMarkup: false,
                      showTax: true,    // Show Tax
                      showForex: true,  // Show Forex
                      priceEditable: true // Direct Price Entry
                    }}
                    handlers={{
                      onFieldChange: (field, value) => handleItemChange(item.id, field, value),
                      onPriceChange: (val) => handleItemChange(item.id, 'amount', val),
                      onRemove: () => handleRemoveItem(item.id)
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Inline Add Row */}
          {isAddingItem && (
            <SharedPricingRow
              mode="add"
              showCost={false} // Hidden as per request
              showMarkup={false} // Hidden as per request
              priceEditable={true} // Enabled for Manual Entry
              onSave={handleSaveItem}
              onCancel={() => setIsAddingItem(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}