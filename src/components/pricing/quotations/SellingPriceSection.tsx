import { Plus, DollarSign } from "lucide-react";
import React, { useState, useRef } from "react";
import type { SellingPriceCategory } from "../../../types/pricing";
import { CategoryHeader } from "./CategoryHeader";
import { CategoryPresetDropdown } from "./CategoryPresetDropdown";
import { PhilippinePeso } from "../../icons/PhilippinePeso";
import { PricingTableHeader } from "../../shared/pricing/PricingTableHeader";
import { UniversalPricingRow, PricingItemData } from "../../shared/pricing/UniversalPricingRow";

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
  
  // Calculate total from all categories (unused variable but kept for logic if needed later)
  // const total = categories.reduce((sum, cat) => sum + cat.subtotal, 0);
  
  // Handle field changes
  const handleFieldChange = (categoryId: string, itemId: string, field: string, value: any) => {
    const updatedCategories = categories.map(cat => {
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
          const newBaseCost = Math.max(0, value);
          updatedItem.base_cost = newBaseCost;
          // Recalculate markup amount from percentage (preserve the percentage)
          updatedItem.amount_added = (newBaseCost * updatedItem.percentage_added) / 100;
          updatedItem.final_price = newBaseCost + updatedItem.amount_added;
          updatedItem.price = updatedItem.final_price;
          updatedItem.amount = updatedItem.final_price * updatedItem.quantity * updatedItem.forex_rate;
        }
        
        // Recalculate if quantity, forex_rate, or is_taxed changed
        if (field === 'quantity' || field === 'forex_rate' || field === 'is_taxed') {
          updatedItem.amount = updatedItem.final_price * updatedItem.quantity * updatedItem.forex_rate;
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
  
  // Handle amount input change
  const handleAmountChange = (categoryId: string, itemId: string, newAmount: number) => {
    const validAmount = Math.max(0, newAmount);
    
    const updatedCategories = categories.map(cat => {
      if (cat.id !== categoryId) return cat;
      
      const updatedItems = cat.line_items.map(item => {
        if (item.id !== itemId) return item;
        
        const percentage = item.base_cost > 0 ? (validAmount / item.base_cost) * 100 : 0;
        const finalPrice = item.base_cost + validAmount;
        
        return {
          ...item,
          amount_added: validAmount,
          percentage_added: percentage,
          final_price: finalPrice,
          price: finalPrice,
          amount: finalPrice * item.quantity * item.forex_rate
        };
      });
      
      const subtotal = updatedItems.reduce((sum, item) => sum + item.amount, 0);
      
      return {
        ...cat,
        line_items: updatedItems,
        subtotal
      };
    });
    
    onChange(updatedCategories);
  };
  
  // Handle percentage input change
  const handlePercentageChange = (categoryId: string, itemId: string, newPercentage: number) => {
    const validPercentage = Math.max(0, newPercentage);
    
    const updatedCategories = categories.map(cat => {
      if (cat.id !== categoryId) return cat;
      
      const updatedItems = cat.line_items.map(item => {
        if (item.id !== itemId) return item;
        
        const amount = (item.base_cost * validPercentage) / 100;
        const finalPrice = item.base_cost + amount;
        
        return {
          ...item,
          amount_added: amount,
          percentage_added: validPercentage,
          final_price: finalPrice,
          price: finalPrice,
          amount: finalPrice * item.quantity * item.forex_rate
        };
      });
      
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
            Buying price items will automatically appear here
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
                  onDelete={() => onDeleteCategory(category.id)}
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
                            Subtotal (Selling Price - PHP)
                          </div>
                          <div style={{ textAlign: "right" }}>
                            ₱ {category.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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