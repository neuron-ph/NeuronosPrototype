import { ChevronDown, ChevronRight, Trash2, Plus } from "lucide-react";
import type { QuotationChargeCategory, QuotationLineItemNew } from "../../../types/pricing";
import { LineItemRow } from "./LineItemRow";
import type { ChargeCategoriesMode } from "./ChargeCategoriesManager";

interface FieldVisibility {
  quantity: boolean;
  forex: boolean;
  tax: boolean;
  remarks: boolean;
}

interface CategorySectionProps {
  category: QuotationChargeCategory;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onAddBlankLineItem: () => void;
  onUpdateLineItem: (categoryId: string, itemId: string, lineItem: Omit<QuotationLineItemNew, "id" | "amount">) => void;
  onDeleteLineItem: (categoryId: string, lineItemId: string) => void;
  currency: string;
  fieldVisibility: FieldVisibility;
  readOnly?: boolean;
  mode: ChargeCategoriesMode;
}

export function CategorySection({
  category,
  isExpanded,
  onToggle,
  onDelete,
  onAddBlankLineItem,
  onUpdateLineItem,
  onDeleteLineItem,
  currency,
  fieldVisibility,
  readOnly = false,
  mode
}: CategorySectionProps) {
  
  const categoryName = category.category_name || category.name || "Untitled Category";

  return (
    <div
      style={{
        border: "1px solid var(--neuron-ui-border)",
        borderRadius: "6px",
        overflow: "visible"
      }}
    >
      {/* Category Header */}
      <div style={{
        padding: "12px 16px",
        backgroundColor: "var(--theme-bg-page)",
        borderBottom: isExpanded ? "1px solid var(--neuron-ui-border)" : "none",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
          <button
            onClick={onToggle}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              color: "var(--neuron-ink-secondary)"
            }}
          >
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          
          <span style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--neuron-ink-primary)",
            textTransform: "uppercase",
            letterSpacing: "0.3px"
          }}>
            {categoryName}
          </span>

          <span style={{
            fontSize: "11px",
            color: "var(--neuron-ink-muted)",
            marginLeft: "8px"
          }}>
            ({category.line_items?.length || 0} {(category.line_items?.length || 0) === 1 ? 'item' : 'items'})
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--neuron-brand-green)"
          }}>
            {currency} {category.subtotal?.toFixed(2) || "0.00"}
          </span>

          {!readOnly && (
            <button
              onClick={onDelete}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
                color: "var(--neuron-ink-muted)"
              }}
              title="Delete category"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Category Content (Collapsed when not expanded) */}
      {isExpanded && (
        <div style={{ padding: "12px" }}>
          {/* Line Items Table */}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ 
                backgroundColor: "var(--theme-bg-page)", 
                borderBottom: "1px solid var(--neuron-ui-border)"
              }}>
                <th style={{
                  padding: "8px 4px",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--neuron-ink-muted)",
                  textAlign: "left",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  width: mode === "simplified" ? "35%" : "25%"
                }}>
                  Description
                </th>
                <th style={{
                  padding: "8px 4px",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--neuron-ink-muted)",
                  textAlign: "left",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  width: mode === "simplified" ? "20%" : "12%"
                }}>
                  Price
                </th>
                {mode === "simplified" && (
                  <th style={{
                    padding: "8px 4px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--neuron-ink-muted)",
                    textAlign: "left",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    width: "15%"
                  }}>
                    Unit
                  </th>
                )}
                {fieldVisibility.quantity && (
                  <th style={{
                    padding: "8px 4px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--neuron-ink-muted)",
                    textAlign: "left",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    width: "10%"
                  }}>
                    Qty
                  </th>
                )}
                {fieldVisibility.forex && (
                  <th style={{
                    padding: "8px 4px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--neuron-ink-muted)",
                    textAlign: "left",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    width: "10%"
                  }}>
                    Forex
                  </th>
                )}
                {fieldVisibility.tax && (
                  <th style={{
                    padding: "8px 4px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--neuron-ink-muted)",
                    textAlign: "center",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    width: "8%"
                  }}>
                    Tax
                  </th>
                )}
                {fieldVisibility.remarks && (
                  <th style={{
                    padding: "8px 4px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--neuron-ink-muted)",
                    textAlign: "left",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    width: mode === "simplified" ? "20%" : "15%"
                  }}>
                    Remarks
                  </th>
                )}
                <th style={{
                  padding: "8px 4px",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--neuron-ink-muted)",
                  textAlign: "right",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  width: "10%"
                }}>
                  Amount
                </th>
                {!readOnly && (
                  <th style={{
                    padding: "8px 4px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--neuron-ink-muted)",
                    textAlign: "center",
                    width: "40px"
                  }}>
                    
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {category.line_items?.length === 0 ? (
                <tr>
                  <td
                    colSpan={100}
                    style={{
                      padding: "24px",
                      textAlign: "center",
                      color: "var(--neuron-ink-muted)",
                      fontSize: "12px"
                    }}
                  >
                    No line items yet. Click "Add Item" to add charges.
                  </td>
                </tr>
              ) : (
                category.line_items?.map(item => (
                  <LineItemRow
                    key={item.id}
                    item={item}
                    categoryId={category.id}
                    categoryName={categoryName}
                    catalogCategoryId={category.catalog_category_id}
                    onUpdate={onUpdateLineItem}
                    onDelete={onDeleteLineItem}
                    currency={currency}
                    fieldVisibility={fieldVisibility}
                    readOnly={readOnly}
                    mode={mode}
                  />
                ))
              )}
            </tbody>
          </table>

          {/* Add Item Button */}
          {!readOnly && (
            <button
              onClick={onAddBlankLineItem}
              style={{
                marginTop: "12px",
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--neuron-brand-green)",
                backgroundColor: "transparent",
                border: "1px solid var(--neuron-brand-green)",
                borderRadius: "4px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              <Plus size={14} />
              Add Item
            </button>
          )}
        </div>
      )}
    </div>
  );
}
