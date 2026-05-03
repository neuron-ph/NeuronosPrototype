import { Plus, DollarSign, Trash2 } from "lucide-react";
import React, { useState, useRef } from "react";
import type { SellingPriceCategory } from "../../../types/pricing";
import { CategoryHeader } from "./CategoryHeader";
import { CategoryPresetDropdown } from "./CategoryPresetDropdown";
import { PhilippinePeso } from "../../icons/PhilippinePeso";
import { PricingTableHeader } from "../../shared/pricing/PricingTableHeader";
import { UniversalPricingRow, PricingItemData } from "../../shared/pricing/UniversalPricingRow";
import { MixedCurrencySubtotal } from "../../shared/pricing/MixedCurrencySubtotal";
import { NeuronModal } from "../../ui/NeuronModal";
import {
  calculateSellingItemFromAmountAdded,
  calculateSellingItemFromCostChange,
  calculateSellingItemFromPercentage,
} from "../../../utils/pricing/quotationSignedPricing";

interface SellingPriceSectionProps {
  categories: SellingPriceCategory[];
  onChange: (categories: SellingPriceCategory[]) => void;
  currency: string;
  expandedCategories: Set<string>;
  onToggleCategory: (categoryId: string) => void;
  onAddCategory: (categoryName: string) => void;
  onAddItemToCategory: (categoryId: string) => void;
  onRenameCategory: (categoryId: string, newName: string) => void;
  onDuplicateCategory: (categoryId: string) => void;
  onDeleteCategory: (categoryId: string) => void;
  viewMode?: boolean;
}

export function SellingPriceSection({ 
  categories, 
  onChange,
  currency,
  expandedCategories,
  onToggleCategory,
  onAddCategory,
  onAddItemToCategory,
  onRenameCategory,
  onDuplicateCategory,
  onDeleteCategory,
  viewMode = false
}: SellingPriceSectionProps) {
  
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  const addCategoryButtonRef = useRef<HTMLButtonElement>(null);
  const [pendingDelete, setPendingDelete] = useState<{ categoryId: string; itemId: string } | null>(null);
  const [pendingCategoryDelete, setPendingCategoryDelete] = useState<string | null>(null);
  
  // Calculate total from all categories (unused variable but kept for logic if needed later)
  // const total = categories.reduce((sum, cat) => sum + cat.subtotal, 0);
  
  // Handle field changes — uses functional update to avoid stale-state when multiple
  // fields are set in the same event (e.g., CatalogItemCombobox sets description + catalog_item_id)
  const handleFieldChange = (categoryId: string, itemId: string, field: string, value: any) => {
    (onChange as any)((prev: SellingPriceCategory[]) => prev.map(cat => {
      if (cat.id !== categoryId) return cat;

      const updatedItems = cat.line_items.map(item => {
        if (item.id !== itemId) return item;

        // Update the field
        const updatedItem = { ...item, [field]: value };

        // ✨ SYNC: Ensure both service fields are kept in sync
        if (field === 'service') {
          updatedItem.service_tag = value;
        } else if (field === 'service_tag') {
          updatedItem.service = value;
        }

        // Recalculate if base_cost changed — update final_price from base_cost + markup
        if (field === 'base_cost') {
          return calculateSellingItemFromCostChange(updatedItem, value);
        }

        // Recalculate if quantity, forex_rate, or is_taxed changed
        if (field === 'quantity' || field === 'forex_rate' || field === 'is_taxed') {
          updatedItem.amount = updatedItem.final_price * updatedItem.quantity * updatedItem.forex_rate;
        }

        return updatedItem;
      });

      const subtotal = updatedItems.reduce((sum, item) => sum + item.amount, 0);

      return {
        ...cat,
        line_items: updatedItems,
        subtotal
      };
    }));
  };
  
  // Handle amount input change
  const handleAmountChange = (categoryId: string, itemId: string, newAmount: number) => {
    (onChange as any)((prev: SellingPriceCategory[]) => prev.map(cat => {
      if (cat.id !== categoryId) return cat;
      const updatedItems = cat.line_items.map(item => {
        if (item.id !== itemId) return item;
        return calculateSellingItemFromAmountAdded(item, newAmount);
      });
      const subtotal = updatedItems.reduce((sum, item) => sum + item.amount, 0);
      return { ...cat, line_items: updatedItems, subtotal };
    }));
  };

  // Handle percentage input change
  const handlePercentageChange = (categoryId: string, itemId: string, newPercentage: number) => {
    (onChange as any)((prev: SellingPriceCategory[]) => prev.map(cat => {
      if (cat.id !== categoryId) return cat;
      const updatedItems = cat.line_items.map(item => {
        if (item.id !== itemId) return item;
        return calculateSellingItemFromPercentage(item, newPercentage);
      });
      const subtotal = updatedItems.reduce((sum, item) => sum + item.amount, 0);
      return { ...cat, line_items: updatedItems, subtotal };
    }));
  };
  
  // Handle remove line item — shows confirmation modal first
  const handleRemoveItem = (categoryId: string, itemId: string) => {
    setPendingDelete({ categoryId, itemId });
  };

  const confirmRemoveItem = () => {
    if (!pendingDelete) return;
    const { categoryId, itemId } = pendingDelete;
    (onChange as any)((prev: SellingPriceCategory[]) =>
      prev.map(cat => {
        if (cat.id !== categoryId) return cat;
        const updatedItems = cat.line_items.filter(item => item.id !== itemId);
        const subtotal = updatedItems.reduce((sum, item) => sum + item.amount, 0);
        return { ...cat, line_items: updatedItems, subtotal };
      }).filter((cat: SellingPriceCategory) => cat.line_items.length > 0)
    );
    setPendingDelete(null);
  };
  
  return (
    <div
      style={{
        backgroundColor: "var(--theme-bg-surface)",
        border: "1px solid var(--theme-border-default)",
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
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <PhilippinePeso size={18} style={{ color: "var(--neuron-brand-green)" }} />
          <h2 style={{
            fontSize: "17px",
            fontWeight: 600,
            color: "var(--neuron-brand-green)",
            margin: 0,
            letterSpacing: "-0.01em"
          }}>
            Selling Price
          </h2>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "8px" }}>
          {/* Collapse All / Expand All */}
          {categories.length > 0 && (
            <button
              onClick={() => {
                if (expandedCategories.size === categories.length) {
                  // All expanded → Collapse all
                  categories.forEach(cat => onToggleCategory(cat.id));
                } else {
                  // Some or none expanded → Expand all
                  categories.forEach(cat => {
                    if (!expandedCategories.has(cat.id)) {
                      onToggleCategory(cat.id);
                    }
                  });
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 12px",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--theme-text-muted)",
                backgroundColor: "var(--theme-bg-surface)",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
                e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                e.currentTarget.style.borderColor = "var(--theme-border-default)";
              }}
            >
              {expandedCategories.size === categories.length ? "Collapse All" : "Expand All"}
            </button>
          )}

          {/* Add Category Button */}
          {!viewMode && (
          <button
            ref={addCategoryButtonRef}
            onClick={() => setShowPresetDropdown(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--neuron-brand-green)",
              backgroundColor: "var(--theme-bg-surface)",
              border: "1px solid var(--theme-border-default)",
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
              e.currentTarget.style.borderColor = "var(--theme-border-default)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <Plus size={16} />
            Add Category
          </button>
          )}
        </div>
      </div>

      {/* Categories Display */}
      {categories.length === 0 ? (
        <div style={{
          padding: "48px 24px",
          textAlign: "center",
          backgroundColor: "var(--theme-bg-surface)",
          border: "1px solid var(--neuron-ui-border)",
          borderRadius: "10px"
        }}>
          <DollarSign 
            size={48} 
            strokeWidth={1.2}
            style={{ 
              color: "var(--neuron-ink-muted)",
              margin: "0 auto 12px auto",
              display: "block",
              opacity: 0.75
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
            Add categories above to set your selling prices
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {categories.map((category) => {
            const isCategoryExpanded = expandedCategories.has(category.id);

            return (
              <div key={category.id} style={{
                border: "1px solid var(--theme-border-default)",
                borderRadius: "10px",
                overflow: "visible",
                backgroundColor: "var(--theme-bg-surface)"
              }}>
                {/* Category Header */}
                <CategoryHeader
                  category={category}
                  isExpanded={isCategoryExpanded}
                  onToggle={() => onToggleCategory(category.id)}
                  onAddItem={() => onAddItemToCategory(category.id)}
                  onRename={(newName) => onRenameCategory(category.id, newName)}
                  onDuplicate={() => onDuplicateCategory(category.id)}
                  onDelete={() => setPendingCategoryDelete(category.id)}
                  viewMode={viewMode}
                />

                {/* Line Items Table */}
                {isCategoryExpanded && (
                  <div style={{ padding: "12px", backgroundColor: "var(--theme-bg-surface)" }}>
                    <div style={{
                      border: "1px solid var(--theme-border-default)",
                      borderRadius: "10px",
                      overflow: "hidden",
                      backgroundColor: "var(--theme-bg-surface)"
                    }}>
                      {/* Wrapper for horizontal scroll on mobile */}
                      <div style={{ 
                        overflowX: "auto",
                        WebkitOverflowScrolling: "touch"
                      }}>
                        {/* ♻️ REFACTORED: Use Shared PricingTableHeader */}
                        <PricingTableHeader />

                        {/* Table Body */}
                        {category.line_items.map((item, idx) => (
                          <UniversalPricingRow
                            key={item.id}
                            data={item as unknown as PricingItemData}
                            mode={viewMode ? "view" : "edit"}
                            serviceType={item.service_tag || item.service || category.category_name}
                            categoryId={category.catalog_category_id}
                            config={{
                              showCost: true,
                              showMarkup: true,
                              showTax: true,
                              showForex: true,
                              simpleMode: false,
                              showPHPConversion: true // ✨ FORCE PHP DISPLAY
                            }}
                            handlers={{
                              onFieldChange: (field, value) => handleFieldChange(category.id, item.id, field, value),
                              onAmountChange: (value) => handleAmountChange(category.id, item.id, value),
                              onPercentageChange: (value) => handlePercentageChange(category.id, item.id, value),
                              onRemove: () => handleRemoveItem(category.id, item.id)
                            }}
                          />
                        ))}

                        {/* Category Subtotal */}
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(140px, 3fr) minmax(50px, 0.8fr) minmax(80px, 1.2fr) minmax(70px, 1fr) minmax(65px, 1fr) minmax(45px, 0.6fr) minmax(55px, 0.8fr) 40px minmax(90px, 1.5fr)",
                          gap: "8px",
                          padding: "12px 16px",
                          backgroundColor: "var(--theme-bg-surface-tint)",
                          borderTop: "2px solid var(--neuron-brand-teal)",
                          fontSize: "13px",
                          fontWeight: 700,
                          color: "var(--neuron-brand-green)",
                          alignItems: "center"
                        }}>
                          <div style={{ gridColumn: "1 / -2", textAlign: "right", paddingRight: "16px" }}>
                            Subtotal (Selling Price)
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <MixedCurrencySubtotal
                              items={category.line_items as any}
                              phpTotal={category.subtotal}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      
      {/* Delete Line Item Confirmation */}
      <NeuronModal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Remove Line Item"
        description="This line item will be permanently removed from the selling price. This action cannot be undone."
        confirmLabel="Remove Item"
        confirmIcon={<Trash2 size={15} />}
        onConfirm={confirmRemoveItem}
        variant="danger"
      />

      {/* Delete Category Confirmation */}
      <NeuronModal
        isOpen={pendingCategoryDelete !== null}
        onClose={() => setPendingCategoryDelete(null)}
        title="Remove Category"
        description="This category and all its line items will be permanently removed from the selling price. This action cannot be undone."
        confirmLabel="Remove Category"
        confirmIcon={<Trash2 size={15} />}
        onConfirm={() => {
          if (pendingCategoryDelete) {
            onDeleteCategory(pendingCategoryDelete);
            setPendingCategoryDelete(null);
          }
        }}
        variant="danger"
      />

      {/* Category Preset Dropdown */}
      <CategoryPresetDropdown
        isOpen={showPresetDropdown}
        onClose={() => setShowPresetDropdown(false)}
        buttonRef={addCategoryButtonRef as React.RefObject<HTMLButtonElement>} // ✨ ADDED THIS
        onSelect={(categoryName) => {
          onAddCategory(categoryName);
          setShowPresetDropdown(false);
        }}
      />
    </div>
  );
}
