import { DollarSign, Plus } from "lucide-react";
import { useState } from "react";
import type { QuotationChargeCategory, QuotationLineItemNew } from "../../../types/pricing";
import { 
  generateCategoryId, 
  generateLineItemId, 
  updateCategorySubtotal 
} from "../../../utils/quotationCalculations";
import { CategoryDropdown } from "../quotations/CategoryDropdown";
import { CategorySection } from "./CategorySection";

export type ChargeCategoriesMode = "full" | "simplified";

interface ChargeCategoriesManagerProps {
  // Core data
  categories: QuotationChargeCategory[];
  onChange: (categories: QuotationChargeCategory[]) => void;
  
  // Currency management
  currency: string;
  onCurrencyChange?: (currency: string) => void;
  
  // Mode configuration
  mode?: ChargeCategoriesMode; // "full" = all fields (quotations), "simplified" = basic fields (vendors)
  
  // Field visibility (for fine-tuning)
  showQuantityField?: boolean;   // Default: true for full, false for simplified
  showForexField?: boolean;      // Default: true for full, false for simplified
  showTaxField?: boolean;        // Default: true for full, false for simplified
  showRemarksField?: boolean;    // Default: true for both modes
  
  // UI customization
  title?: string;                // Default: "CHARGE CATEGORIES & LINE ITEMS"
  readOnly?: boolean;            // Default: false
  showCurrencySelector?: boolean; // Default: true
}

export function ChargeCategoriesManager({
  categories,
  onChange,
  currency,
  onCurrencyChange,
  mode = "full",
  showQuantityField,
  showForexField,
  showTaxField,
  showRemarksField = true,
  title = "CHARGE CATEGORIES & LINE ITEMS",
  readOnly = false,
  showCurrencySelector = true
}: ChargeCategoriesManagerProps) {
  
  // Determine field visibility based on mode
  const fieldVisibility = {
    quantity: showQuantityField ?? (mode === "full"),
    forex: showForexField ?? (mode === "full"),
    tax: showTaxField ?? (mode === "full"),
    remarks: showRemarksField
  };

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showAddCategory, setShowAddCategory] = useState(false);

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const handleAddCategory = (name: string, catalogCategoryId?: string) => {
    const newCategory: QuotationChargeCategory = {
      id: generateCategoryId(),
      category_name: name,
      name: name, // Backward compatibility
      catalog_category_id: catalogCategoryId,
      line_items: [],
      subtotal: 0
    };
    onChange([...categories, newCategory]);
    setShowAddCategory(false);
    // Auto-expand the new category
    const newExpanded = new Set(expandedCategories);
    newExpanded.add(newCategory.id);
    setExpandedCategories(newExpanded);
  };

  const handleDeleteCategory = (categoryId: string) => {
    if (confirm("Are you sure you want to delete this category and all its line items?")) {
      onChange(categories.filter(c => c.id !== categoryId));
    }
  };

  const handleAddLineItem = (categoryId: string, lineItem: Omit<QuotationLineItemNew, "id" | "amount">) => {
    const amount = lineItem.price * lineItem.quantity * lineItem.forex_rate;
    const newLineItem: QuotationLineItemNew = {
      ...lineItem,
      id: generateLineItemId(),
      amount
    };

    const updatedCategories = categories.map(cat => {
      if (cat.id === categoryId) {
        const updatedCat = {
          ...cat,
          line_items: [...cat.line_items, newLineItem]
        };
        return updateCategorySubtotal(updatedCat);
      }
      return cat;
    });

    onChange(updatedCategories);
  };

  const handleUpdateLineItem = (categoryId: string, itemId: string, lineItem: Omit<QuotationLineItemNew, "id" | "amount">) => {
    const amount = lineItem.price * lineItem.quantity * lineItem.forex_rate;
    const updatedLineItem: QuotationLineItemNew = {
      ...lineItem,
      id: itemId,
      amount
    };

    const updatedCategories = categories.map(cat => {
      if (cat.id === categoryId) {
        const updatedCat = {
          ...cat,
          line_items: (cat.line_items || []).map(item => 
            item.id === itemId ? updatedLineItem : item
          )
        };
        return updateCategorySubtotal(updatedCat);
      }
      return cat;
    });

    onChange(updatedCategories);
  };

  const handleDeleteLineItem = (categoryId: string, lineItemId: string) => {
    if (confirm("Are you sure you want to delete this line item?")) {
      const updatedCategories = categories.map(cat => {
        if (cat.id === categoryId) {
          const updatedCat = {
            ...cat,
            line_items: (cat.line_items || []).filter(item => item.id !== lineItemId)
          };
          return updateCategorySubtotal(updatedCat);
        }
        return cat;
      });
      onChange(updatedCategories);
    }
  };

  const handleAddBlankLineItem = (categoryId: string) => {
    const newLineItem: QuotationLineItemNew = {
      id: generateLineItemId(),
      description: "",
      price: 0,
      currency: currency,
      charge_currency: currency, // Backward compatibility
      quantity: 1,
      unit: "",
      forex_rate: 1,
      is_taxed: false,
      taxed: false, // Backward compatibility
      remarks: "",
      amount: 0
    };

    const updatedCategories = categories.map(cat => {
      if (cat.id === categoryId) {
        const updatedCat = {
          ...cat,
          line_items: [...(cat.line_items || []), newLineItem]
        };
        return updateCategorySubtotal(updatedCat);
      }
      return cat;
    });

    onChange(updatedCategories);
  };

  return (
    <section style={{ marginBottom: "32px" }}>
      <div style={{
        border: "1px solid var(--neuron-ui-border)",
        borderRadius: "8px",
        backgroundColor: "var(--theme-bg-surface)",
        overflow: "visible"
      }}>
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--neuron-ui-border)",
          backgroundColor: "var(--theme-bg-page)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <DollarSign size={16} style={{ color: "var(--neuron-brand-green)" }} />
            <h3 style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--neuron-ink-primary)",
              margin: 0
            }}>
              {title}
            </h3>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            {/* Currency Selector */}
            {showCurrencySelector && onCurrencyChange && (
              <select
                value={currency}
                onChange={(e) => onCurrencyChange(e.target.value)}
                disabled={readOnly}
                style={{
                  padding: "6px 10px",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-primary)",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "6px",
                  backgroundColor: "var(--theme-bg-surface)",
                  cursor: readOnly ? "not-allowed" : "pointer",
                  opacity: readOnly ? 0.6 : 1
                }}
              >
                <option value="USD">USD</option>
                <option value="PHP">PHP</option>
                <option value="EUR">EUR</option>
                <option value="CNY">CNY</option>
              </select>
            )}

            {/* Add Category Button */}
            {!readOnly && (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowAddCategory(!showAddCategory)}
                  style={{
                    padding: "6px 12px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "white",
                    backgroundColor: "var(--neuron-brand-green)",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  <Plus size={14} />
                  Add Category
                </button>

                {/* Inline Category Dropdown */}
                {showAddCategory && (
                  <CategoryDropdown
                    onAdd={handleAddCategory}
                    onClose={() => setShowAddCategory(false)}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: "20px", overflow: "visible" }}>
          {categories.length === 0 ? (
            <div style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "var(--neuron-ink-muted)",
              fontSize: "13px"
            }}>
              <DollarSign size={32} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
              <p style={{ margin: 0 }}>No charge categories yet.</p>
              <p style={{ margin: "4px 0 0 0" }}>
                {readOnly 
                  ? "No charges available." 
                  : "Click \"Add Category\" to start building your quotation."
                }
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "16px", overflow: "visible" }}>
              {categories.map(category => (
                <CategorySection
                  key={category.id}
                  category={category}
                  isExpanded={expandedCategories.has(category.id)}
                  onToggle={() => toggleCategory(category.id)}
                  onDelete={() => handleDeleteCategory(category.id)}
                  onAddBlankLineItem={() => handleAddBlankLineItem(category.id)}
                  onUpdateLineItem={handleUpdateLineItem}
                  onDeleteLineItem={handleDeleteLineItem}
                  currency={currency}
                  fieldVisibility={fieldVisibility}
                  readOnly={readOnly}
                  mode={mode}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
