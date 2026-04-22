import { ChevronRight, Package, Trash2, Plus, Wallet, Building2 } from "lucide-react";
import React, { useRef, useState, useEffect } from "react";
import type { BuyingPriceCategory, QuotationLineItemNew } from "../../../types/pricing";
import { CustomDropdown } from "../../bd/CustomDropdown";
import { CategoryHeader } from "./CategoryHeader";
import { CategoryPresetDropdown } from "./CategoryPresetDropdown";
import { CustomCheckbox } from "../../bd/CustomCheckbox";
import { NaturalNumberInput } from "../../shared/pricing/NaturalNumberInput";

interface BuyingPriceSectionProps {
  categories: BuyingPriceCategory[];
  onChange: (categories: BuyingPriceCategory[]) => void;
  currency: string;
  expandedCategories: Set<string>;
  onToggleCategory: (categoryId: string) => void;
  onAddCategory: (categoryName: string) => void;
  onAddItemToCategory: (categoryId: string) => void;
  onRenameCategory: (categoryId: string, newName: string) => void;
  onDuplicateCategory: (categoryId: string) => void;
  onDeleteCategory: (categoryId: string) => void;
  vendors?: Array<{ id: string; name: string; type: string; country?: string; service_tag?: string; vendor_id?: string }>; // Vendor lookup
  viewMode?: boolean;
}

// Service options for dropdown
const SERVICE_OPTIONS = [
  { value: "", label: "Unassigned" },
  { value: "Forwarding", label: "Forwarding" },
  { value: "Brokerage", label: "Brokerage" },
  { value: "Trucking", label: "Trucking" },
  { value: "Marine Insurance", label: "Marine Insurance" },
  { value: "General", label: "General" },
  { value: "Others", label: "Others" }
];

// Helper to get service display name
const getServiceDisplayName = (service: string | undefined | null): string => {
  if (!service || service === "") return "Unassigned";
  return service;
};

// Grouping structure - 3-level: Vendor → Category → Line Items
interface CategoryGroup {
  category_id: string;
  category_name: string;
  line_items: Array<QuotationLineItemNew & { _categoryId: string }>;
  subtotal: number;
}

interface VendorGroup {
  vendor_id: string;
  vendor_name: string;
  vendor_service: string; // Service tag for badge display
  categories: CategoryGroup[];
  subtotal: number;
}

export function BuyingPriceSectionV2({ 
  categories, 
  onChange, 
  currency,
  expandedCategories: _expandedCategories, // Rename prop to avoid conflict
  onToggleCategory,
  onAddCategory,
  onAddItemToCategory,
  onRenameCategory,
  onDuplicateCategory,
  onDeleteCategory,
  vendors,
  viewMode = false
}: BuyingPriceSectionProps) {
  
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  const addCategoryButtonRef = useRef<HTMLButtonElement>(null);
  
  // State for expanded vendors
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(
    new Set() // Will be populated with vendor IDs
  );

  // State for expanded categories within vendors (composite key: "vendorId:::categoryId")
  const [expandedVendorCategories, setExpandedVendorCategories] = useState<Set<string>>(
    new Set()
  );

  // Calculate total from all categories
  const total = categories.reduce((sum, cat) => sum + cat.subtotal, 0);
  
  // Group categories by Vendor → Category → Line Items
  const groupedData: VendorGroup[] = (() => {
    // Step 1: Flatten all line items with their vendor info
    const flatItems: Array<{
      categoryId: string;
      categoryName: string;
      item: QuotationLineItemNew;
      vendorId: string;
      vendorName: string;
      service: string;
    }> = [];

    categories.forEach(category => {
      category.line_items.forEach(item => {
        const vendorId = item.vendor_id || "no-vendor";
        
        // Look up actual vendor name from vendors array
        // FIX: Use vendor_id instead of id for lookup
        let vendorName = "No Vendor";
        let vendorService = "";
        
        if (item.vendor_id && vendors) {
          const vendor = vendors.find(v => v.vendor_id === item.vendor_id);
          if (vendor) {
            vendorName = vendor.name;
            vendorService = vendor.service_tag || "";
          } else {
            vendorName = `Vendor ${item.vendor_id}`; // Fallback if vendor not found
          }
        }
        
        const service = getServiceDisplayName(item.service || vendorService);

        flatItems.push({
          categoryId: category.id,
          categoryName: category.category_name || category.name || "Unnamed Category",
          item,
          vendorId,
          vendorName,
          service
        });
      });
    });

    // Step 2: Group by Vendor → Category
    const vendorMap = new Map<string, Map<string, Array<QuotationLineItemNew & { _categoryId: string }>>>();

    flatItems.forEach(({ vendorId, vendorName, categoryId, categoryName, item, service }) => {
      const vendorKey = `${vendorId}:::${vendorName}:::${service}`;
      if (!vendorMap.has(vendorKey)) {
        vendorMap.set(vendorKey, new Map());
      }
      const categoryMap = vendorMap.get(vendorKey)!;

      const categoryKey = `${categoryId}:::${categoryName}`;
      if (!categoryMap.has(categoryKey)) {
        categoryMap.set(categoryKey, []);
      }
      
      // Add item with category ID for update tracking
      categoryMap.get(categoryKey)!.push({
        ...item,
        _categoryId: categoryId
      });
    });

    // Step 3: Convert to VendorGroup structure with CategoryGroups
    const vendorGroups: VendorGroup[] = [];

    vendorMap.forEach((categoryMap, vendorKey) => {
      const [vendorId, vendorName, vendorService] = vendorKey.split(":::");
      const categoryGroups: CategoryGroup[] = [];

      categoryMap.forEach((items, categoryKey) => {
        const [categoryId, categoryName] = categoryKey.split(":::");
        const subtotal = items.reduce((sum, item) => sum + item.amount, 0);

        categoryGroups.push({
          category_id: categoryId,
          category_name: categoryName,
          line_items: items,
          subtotal
        });
      });

      const vendorSubtotal = categoryGroups.reduce((sum, cat) => sum + cat.subtotal, 0);

      vendorGroups.push({
        vendor_id: vendorId,
        vendor_name: vendorName,
        vendor_service: vendorService || "Unassigned",
        categories: categoryGroups,
        subtotal: vendorSubtotal
      });
    });

    return vendorGroups;
  })();
  
  // Solution C: Auto-expand vendors (hybrid approach)
  // - Auto-expands on initial load
  // - Auto-expands newly added vendors
  // - Preserves user's manual collapse/expand for existing vendors
  useEffect(() => {
    setExpandedVendors(prev => {
      const newSet = new Set(prev);
      // Add all vendor IDs from groupedData (preserves existing expanded state)
      groupedData.forEach(g => newSet.add(g.vendor_id));
      return newSet;
    });
  }, [groupedData.length]); // Only re-run when NUMBER of vendors changes
  
  // Auto-expand all categories within expanded vendors
  useEffect(() => {
    setExpandedVendorCategories(prev => {
      const newSet = new Set(prev);
      // Add all category keys from expanded vendors
      groupedData.forEach(vendorGroup => {
        if (expandedVendors.has(vendorGroup.vendor_id)) {
          vendorGroup.categories.forEach(cat => {
            const catKey = `${vendorGroup.vendor_id}:::${cat.category_id}`;
            newSet.add(catKey);
          });
        }
      });
      return newSet;
    });
  }, [expandedVendors, groupedData.length]); // Re-run when vendors expand or data changes
  
  // Handle field changes
  const handleFieldChange = (categoryId: string, itemId: string, field: string, value: any) => {
    const updatedCategories = categories.map(cat => {
      if (cat.id !== categoryId) return cat;
      
      const updatedItems = cat.line_items.map(item => {
        if (item.id !== itemId) return item;
        
        // Update the field
        const updatedItem = { ...item, [field]: value };
        
        // Recalculate amount if quantity, price, or forex_rate changed
        if (field === 'quantity' || field === 'price' || field === 'forex_rate') {
          updatedItem.amount = updatedItem.price * updatedItem.quantity * updatedItem.forex_rate;
        }
        
        return updatedItem;
      });
      
      // Recalculate subtotal
      const subtotal = updatedItems.reduce((sum, item) => sum + item.amount, 0);
      
      return {
        ...cat,
        line_items: updatedItems,
        subtotal
      };
    });
    
    onChange(updatedCategories);
  };
  
  // Handle remove line item
  const handleRemoveItem = (categoryId: string, itemId: string) => {
    const updatedCategories = categories.map(cat => {
      if (cat.id !== categoryId) return cat;
      
      const updatedItems = cat.line_items.filter(item => item.id !== itemId);
      const subtotal = updatedItems.reduce((sum, item) => sum + item.amount, 0);
      
      return {
        ...cat,
        line_items: updatedItems,
        subtotal
      };
    }).filter(cat => cat.line_items.length > 0); // Remove empty categories
    
    onChange(updatedCategories);
  };

  // Toggle vendor expansion
  const toggleVendor = (vendorId: string) => {
    const newExpanded = new Set(expandedVendors);
    if (newExpanded.has(vendorId)) {
      newExpanded.delete(vendorId);
    } else {
      newExpanded.add(vendorId);
    }
    setExpandedVendors(newExpanded);
  };
  
  return (
    <div
      style={{
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--neuron-ui-border)",
        borderRadius: "12px",
        padding: "28px",
        marginBottom: "24px",
        boxShadow: "0 1px 3px rgba(18, 51, 43, 0.04)"
      }}
    >
      {/* Header */}
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between",
        marginBottom: "24px",
        paddingBottom: "20px",
        borderBottom: "2px solid var(--theme-border-subtle)"
      }}>
        {/* Section Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Wallet size={18} style={{ color: "var(--neuron-brand-green)" }} />
          <h2 style={{
            fontSize: "17px",
            fontWeight: 600,
            color: "var(--neuron-brand-green)",
            margin: 0,
            letterSpacing: "-0.01em"
          }}>
            Buying Price
          </h2>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "8px" }}>
          {/* Add Category Button - Hidden in View Mode */}
          {!viewMode && (
          <button
            ref={addCategoryButtonRef}
            onClick={() => setShowPresetDropdown(!showPresetDropdown)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--neuron-brand-green)",
              backgroundColor: "var(--theme-bg-surface)",
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.2s ease"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
              e.currentTarget.style.borderColor = "var(--neuron-brand-green)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
              e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <Plus size={16} />
            Add Category
          </button>
          )}
        </div>
      </div>

      {/* Preset Dropdown */}
      {showPresetDropdown && (
        <CategoryPresetDropdown
          isOpen={showPresetDropdown}
          anchorRef={addCategoryButtonRef as React.RefObject<HTMLButtonElement>}
          onSelect={(categoryName) => {
            onAddCategory(categoryName);
            setShowPresetDropdown(false);
          }}
          onClose={() => setShowPresetDropdown(false)}
        />
      )}

      {/* Categories Display - Hierarchical Grouping */}
      {groupedData.length === 0 ? (
        <div style={{
          padding: "48px 24px",
          textAlign: "center",
          backgroundColor: "var(--theme-bg-surface)",
          border: "1px solid var(--neuron-ui-border)",
          borderRadius: "10px"
        }}>
          <Package 
            size={48} 
            strokeWidth={1.5}
            style={{ 
              color: "var(--neuron-ink-muted)",
              margin: "0 auto 12px auto",
              display: "block"
            }} 
          />
          <h3 style={{ 
            color: "var(--neuron-ink-primary)",
            fontSize: "16px",
            fontWeight: 500,
            marginBottom: "4px"
          }}>
            No categories yet
          </h3>
          <p style={{ 
            color: "var(--neuron-ink-muted)",
            fontSize: "14px",
            margin: 0
          }}>
            Get started by adding a category to organize your line items
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {groupedData.map((vendorGroup) => {
            const isVendorExpanded = expandedVendors.has(vendorGroup.vendor_id);

            return (
              <div key={`${vendorGroup.vendor_id}-${vendorGroup.vendor_service}`} style={{
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "10px",
                overflow: "hidden",
                backgroundColor: "var(--theme-bg-surface)"
              }}>
                {/* Vendor Header */}
                <button
                  onClick={() => toggleVendor(vendorGroup.vendor_id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    backgroundColor: "var(--theme-bg-surface-subtle)",
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <ChevronRight
                      size={16}
                      style={{
                        color: "var(--theme-text-muted)",
                        transform: isVendorExpanded ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 0.2s ease"
                      }}
                    />
                    <Building2 size={16} style={{ color: "var(--theme-text-muted)" }} />
                    <span style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--neuron-ink-base)"
                    }}>
                      {vendorGroup.vendor_name}
                    </span>
                    {/* Service Badge */}
                    {vendorGroup.vendor_service && vendorGroup.vendor_service !== "Unassigned" && (
                      <span style={{
                        fontSize: "11px",
                        fontWeight: 500,
                        color: "var(--neuron-brand-teal)",
                        backgroundColor: "var(--theme-bg-surface-tint)",
                        padding: "3px 8px",
                        borderRadius: "4px"
                      }}>
                        {vendorGroup.vendor_service}
                      </span>
                    )}
                    <span style={{
                      fontSize: "11px",
                      fontWeight: 500,
                      color: "var(--theme-text-muted)",
                      backgroundColor: "var(--theme-bg-surface)",
                      padding: "2px 6px",
                      borderRadius: "4px"
                    }}>
                      {vendorGroup.categories.reduce((total, cat) => total + cat.line_items.length, 0)} item{vendorGroup.categories.reduce((total, cat) => total + cat.line_items.length, 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--neuron-brand-green)"
                  }}>
                    ₱ {vendorGroup.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </button>

                {/* Vendor's Categories */}
                {isVendorExpanded && (
                  <div style={{ padding: "8px", backgroundColor: "var(--theme-bg-surface-subtle)", display: "flex", flexDirection: "column", gap: "8px" }}>
                    {vendorGroup.categories.map((categoryGroup, catIdx) => {
                      const catKey = `${vendorGroup.vendor_id}:::${categoryGroup.category_id}`;
                      const isCategoryExpanded = expandedVendorCategories.has(catKey);

                      return (
                        <div key={categoryGroup.category_id} style={{
                          border: "1px solid var(--neuron-ui-border)",
                          borderRadius: "10px",
                          overflow: "hidden",
                          backgroundColor: "var(--theme-bg-surface)"
                        }}>
                          {/* Category Header */}
                          <button
                            onClick={() => {
                              const newSet = new Set(expandedVendorCategories);
                              if (newSet.has(catKey)) {
                                newSet.delete(catKey);
                              } else {
                                newSet.add(catKey);
                              }
                              setExpandedVendorCategories(newSet);
                            }}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "12px 16px",
                              backgroundColor: "var(--theme-bg-surface-subtle)",
                              border: "none",
                              cursor: "pointer",
                              transition: "all 0.2s ease"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <ChevronRight
                                size={16}
                                style={{
                                  color: "var(--theme-text-muted)",
                                  transform: isCategoryExpanded ? "rotate(90deg)" : "rotate(0deg)",
                                  transition: "transform 0.2s ease"
                                }}
                              />
                              <Package size={16} style={{ color: "var(--theme-text-muted)" }} />
                              <span style={{
                                fontSize: "14px",
                                fontWeight: 600,
                                color: "var(--neuron-ink-base)"
                              }}>
                                {categoryGroup.category_name}
                              </span>
                              <span style={{
                                fontSize: "11px",
                                fontWeight: 500,
                                color: "var(--theme-text-muted)",
                                backgroundColor: "var(--theme-bg-surface)",
                                padding: "2px 6px",
                                borderRadius: "4px"
                              }}>
                                {categoryGroup.line_items.length} item{categoryGroup.line_items.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <div style={{
                              fontSize: "13px",
                              fontWeight: 600,
                              color: "var(--neuron-brand-green)"
                            }}>
                              ₱ {categoryGroup.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </button>

                          {/* Category's Line Items (Flat Table) */}
                          {isCategoryExpanded && (
                            <div style={{ padding: "12px", backgroundColor: "var(--theme-bg-surface)" }}>
                              <div style={{
                                border: "1px solid var(--neuron-ui-border)",
                                borderRadius: "10px",
                                overflow: "hidden",
                                backgroundColor: "var(--theme-bg-surface)"
                              }}>
                                {/* Wrapper for horizontal scroll on mobile */}
                                <div style={{ 
                                  overflowX: "auto",
                                  WebkitOverflowScrolling: "touch"
                                }}>
                                  {/* Table Header */}
                                  <div style={{
                                    display: "grid",
                                    gridTemplateColumns: "minmax(160px, 3fr) minmax(55px, 0.8fr) minmax(70px, 1fr) minmax(58px, 0.7fr) minmax(60px, 0.9fr) 40px minmax(100px, 1.3fr)",
                                    gap: "8px",
                                    padding: "10px 16px",
                                    backgroundColor: "var(--theme-bg-surface-subtle)",
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    color: "var(--theme-text-muted)",
                                    letterSpacing: "0.02em",
                                    borderBottom: "1px solid var(--theme-border-subtle)"
                                  }}>
                                    <div>Item</div>
                                    <div style={{ textAlign: "right" }}>Qty</div>
                                    <div style={{ textAlign: "right" }}>Rate</div>
                                    <div style={{ textAlign: "center" }}>Curr</div>
                                    <div style={{ textAlign: "right" }}>Forex</div>
                                    <div style={{ textAlign: "center" }}>Tax</div>
                                    <div style={{ textAlign: "right" }}>Amount</div>
                                  </div>

                                  {/* Table Body - All Line Items */}
                                  {categoryGroup.line_items.map((item, idx) => (
                                    <div key={item.id}>
                                      {/* Main Row - Pricing Data */}
                                      <div
                                        style={{
                                          display: "grid",
                                          gridTemplateColumns: "minmax(160px, 3fr) minmax(55px, 0.8fr) minmax(70px, 1fr) minmax(58px, 0.7fr) minmax(60px, 0.9fr) 40px minmax(100px, 1.3fr)",
                                          gap: "8px",
                                          padding: "12px 16px",
                                          fontSize: "13px",
                                          color: "var(--neuron-ink-base)",
                                          backgroundColor: "var(--theme-bg-surface)",
                                          alignItems: "center",
                                          borderBottom: idx === categoryGroup.line_items.length - 1 ? "none" : "1px solid var(--theme-border-subtle)"
                                        }}
                                      >
                                        {/* Item */}
                                        <input
                                          type="text"
                                          value={item.description}
                                          onChange={(e) => handleFieldChange(item._categoryId, item.id, 'description', e.target.value)}
                                          placeholder="Item description"
                                          title={item.description}
                                          disabled={viewMode}
                                          style={{
                                            width: "100%",
                                            padding: "6px 8px",
                                            fontSize: "13px",
                                            border: "1px solid var(--neuron-ui-border)",
                                            borderRadius: "6px",
                                            backgroundColor: viewMode ? "var(--theme-bg-surface-subtle)" : "var(--theme-bg-surface)",
                                            fontWeight: 500,
                                            color: "var(--neuron-ink-base)",
                                            transition: "all 0.15s ease",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                            outline: "none",
                                            cursor: viewMode ? "default" : "text"
                                          }}
                                          onFocus={(e) => {
                                            if (viewMode) return;
                                            e.currentTarget.style.borderColor = "var(--neuron-brand-green)";
                                            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(15, 118, 110, 0.08)";
                                          }}
                                          onBlur={(e) => {
                                            if (viewMode) return;
                                            e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                                            e.currentTarget.style.boxShadow = "none";
                                          }}
                                        />
                                        
                                        {/* Qty */}
                                        <NaturalNumberInput
                                          value={item.quantity}
                                          onChange={(value) => handleFieldChange(item._categoryId, item.id, 'quantity', value)}
                                          decimals={2}
                                          formatOnBlur
                                          step="0.01"
                                          min="0"
                                          disabled={viewMode}
                                          style={{
                                            width: "100%",
                                            padding: "6px 8px",
                                            fontSize: "13px",
                                            textAlign: "right",
                                            border: "1px solid var(--neuron-ui-border)",
                                            borderRadius: "6px",
                                            backgroundColor: viewMode ? "var(--theme-bg-surface-subtle)" : "var(--theme-bg-surface)",
                                            color: "var(--neuron-brand-green)",
                                            fontWeight: 600,
                                            outline: "none",
                                            transition: "all 0.15s ease",
                                            cursor: viewMode ? "default" : "text"
                                          }}
                                          onFocus={(e) => {
                                            if (viewMode) return;
                                            e.currentTarget.style.borderColor = "var(--neuron-brand-green)";
                                            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(15, 118, 110, 0.08)";
                                          }}
                                          onBlur={(e) => {
                                            if (viewMode) return;
                                            e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                                            e.currentTarget.style.boxShadow = "none";
                                          }}
                                        />
                                        
                                        {/* Rate */}
                                        <NaturalNumberInput
                                          value={item.price}
                                          onChange={(value) => handleFieldChange(item._categoryId, item.id, 'price', value)}
                                          decimals={2}
                                          formatOnBlur
                                          allowNegative
                                          step="0.01"
                                          disabled={viewMode}
                                          style={{
                                            width: "100%",
                                            padding: "6px 8px",
                                            fontSize: "13px",
                                            textAlign: "right",
                                            border: "1px solid var(--neuron-ui-border)",
                                            borderRadius: "6px",
                                            backgroundColor: viewMode ? "var(--theme-bg-surface-subtle)" : "var(--theme-bg-surface)",
                                            color: "var(--neuron-brand-green)",
                                            fontWeight: 600,
                                            outline: "none",
                                            transition: "all 0.15s ease",
                                            cursor: viewMode ? "default" : "text"
                                          }}
                                          onFocus={(e) => {
                                            if (viewMode) return;
                                            e.currentTarget.style.borderColor = "var(--neuron-brand-green)";
                                            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(15, 118, 110, 0.08)";
                                          }}
                                          onBlur={(e) => {
                                            if (viewMode) return;
                                            e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                                            e.currentTarget.style.boxShadow = "none";
                                          }}
                                        />
                                        
                                        {/* Currency */}
                                        <div style={{ fontSize: "12px" }}>
                                          <CustomDropdown
                                            value={item.currency || "USD"}
                                            onChange={(value) => handleFieldChange(item._categoryId, item.id, 'currency', value)}
                                            options={[
                                              { value: "USD", label: "USD" },
                                              { value: "PHP", label: "PHP" },
                                              { value: "EUR", label: "EUR" },
                                              { value: "CNY", label: "CNY" }
                                            ]}
                                            placeholder="USD"
                                            size="sm"
                                            disabled={viewMode}
                                          />
                                        </div>
                                        
                                        {/* Forex */}
                                        <NaturalNumberInput
                                          value={item.forex_rate}
                                          onChange={(value) => handleFieldChange(item._categoryId, item.id, 'forex_rate', value)}
                                          decimals={2}
                                          formatOnBlur
                                          disabled={viewMode}
                                          style={{
                                            width: "100%",
                                            padding: "6px 8px",
                                            fontSize: "12px",
                                            textAlign: "right",
                                            border: "1px solid var(--neuron-ui-border)",
                                            borderRadius: "6px",
                                            backgroundColor: viewMode ? "var(--theme-bg-surface-subtle)" : "var(--theme-bg-surface-subtle)",
                                            outline: "none",
                                            cursor: viewMode ? "default" : "text"
                                          }}
                                        />
                                        
                                        {/* Tax Checkbox */}
                                        <div style={{ display: "flex", justifyContent: "center" }}>
                                          <CustomCheckbox
                                            checked={item.is_taxed}
                                            onChange={(checked) => handleFieldChange(item._categoryId, item.id, 'is_taxed', checked)}
                                            disabled={viewMode}
                                          />
                                        </div>
                                        
                                        {/* Calculated Amount */}
                                        <div style={{ 
                                          textAlign: "right", 
                                          fontWeight: 700, 
                                          color: "var(--neuron-brand-green)",
                                          fontSize: "13px",
                                          display: "flex",
                                          flexDirection: "column",
                                          alignItems: "flex-end",
                                          justifyContent: "center"
                                        }}>
                                          {/* Primary: PHP Total */}
                                          <span>
                                            ₱ {item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </span>
                                          
                                          {/* Secondary: Original Currency (if not PHP/Forex 1) */}
                                          {(item.currency !== 'PHP' && item.forex_rate !== 1) && (
                                            <span style={{ 
                                              fontSize: "11px", 
                                              color: "var(--theme-text-muted)", 
                                              fontWeight: 500,
                                              marginTop: "2px"
                                            }}>
                                              ({item.currency} {(item.price * item.quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Metadata Row - Remarks, Service Tag, Remove */}
                                      <div style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "14px",
                                        padding: "10px 16px 12px 28px",
                                        backgroundColor: "var(--theme-bg-surface-subtle)",
                                        borderTop: "1px solid var(--theme-border-subtle)",
                                        fontSize: "12px",
                                        color: "var(--theme-text-muted)",
                                        borderBottom: idx === categoryGroup.line_items.length - 1 ? "none" : "1px solid var(--theme-border-subtle)"
                                      }}>
                                        {/* Remarks */}
                                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1 1 300px" }}>
                                          <label style={{ 
                                            fontWeight: 500, 
                                            whiteSpace: "nowrap",
                                            color: "var(--theme-text-muted)",
                                            fontSize: "12px"
                                          }}>
                                            Remarks:
                                          </label>
                                          <input
                                            type="text"
                                            value={item.remarks || ""}
                                            onChange={(e) => handleFieldChange(item._categoryId, item.id, 'remarks', e.target.value)}
                                            placeholder="Add optional notes..."
                                            disabled={viewMode}
                                            style={{
                                              flex: 1,
                                              padding: "5px 8px",
                                              fontSize: "12px",
                                              border: "1px solid var(--neuron-ui-border)",
                                              borderRadius: "6px",
                                              backgroundColor: viewMode ? "var(--theme-bg-surface-subtle)" : "var(--theme-bg-surface)",
                                              color: "var(--neuron-ink-base)",
                                              outline: "none",
                                              transition: "all 0.15s ease",
                                              cursor: viewMode ? "default" : "text"
                                            }}
                                            onFocus={(e) => {
                                              if (viewMode) return;
                                              e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                                              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(15, 118, 110, 0.06)";
                                            }}
                                            onBlur={(e) => {
                                              if (viewMode) return;
                                              e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                                              e.currentTarget.style.boxShadow = "none";
                                            }}
                                          />
                                        </div>

                                        {/* Service Field */}
                                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "0 1 200px" }}>
                                          <label style={{ 
                                            fontWeight: 500, 
                                            whiteSpace: "nowrap",
                                            color: "var(--theme-text-muted)",
                                            fontSize: "12px"
                                          }}>
                                            Service:
                                          </label>
                                          <div style={{ flex: 1, fontSize: "12px" }}>
                                            <CustomDropdown
                                              value={item.service || ""}
                                              onChange={(value) => handleFieldChange(item._categoryId, item.id, 'service', value)}
                                              options={SERVICE_OPTIONS}
                                              placeholder="Unassigned"
                                              size="sm"
                                              disabled={viewMode}
                                            />
                                          </div>
                                        </div>

                                        {/* Remove Button - Hidden in viewMode */}
                                        {!viewMode && (
                                        <button
                                          onClick={() => handleRemoveItem(item._categoryId, item.id)}
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "5px",
                                            padding: "5px 10px",
                                            fontSize: "12px",
                                            border: "1px solid var(--theme-status-danger-border)",
                                            borderRadius: "6px",
                                            backgroundColor: "var(--theme-bg-surface)",
                                            color: "var(--theme-status-danger-fg)",
                                            cursor: "pointer",
                                            fontWeight: 500,
                                            transition: "all 0.2s ease"
                                          }}
                                          title="Remove Item"
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = "var(--theme-status-danger-bg)";
                                            e.currentTarget.style.borderColor = "var(--theme-status-danger-fg)";
                                            e.currentTarget.style.transform = "translateY(-1px)";
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                                            e.currentTarget.style.borderColor = "var(--theme-status-danger-border)";
                                            e.currentTarget.style.transform = "translateY(0)";
                                          }}
                                        >
                                          <Trash2 size={13} />
                                          <span>Remove</span>
                                        </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Grand Total */}
          <div style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "20px 24px",
            backgroundColor: "var(--theme-bg-surface-tint)",
            borderRadius: "10px",
            border: "2px solid var(--theme-status-success-border)"
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "auto auto",
              gap: "20px",
              alignItems: "center"
            }}>
              <div style={{
                fontSize: "15px",
                fontWeight: 600,
                color: "var(--neuron-ink-base)",
                letterSpacing: "-0.01em"
              }}>
                Total Buying Price:
              </div>
              <div style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "var(--neuron-brand-teal)",
                letterSpacing: "-0.02em"
              }}>
                ₱ {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
