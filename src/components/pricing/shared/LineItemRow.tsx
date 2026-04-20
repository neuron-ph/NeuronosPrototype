import { useRef } from "react";
import { Trash2 } from "lucide-react";
import type { QuotationLineItemNew } from "../../../types/pricing";
import { CatalogItemCombobox } from "../../shared/pricing/CatalogItemCombobox";
import { NaturalNumberInput } from "../../shared/pricing/NaturalNumberInput";
import type { ChargeCategoriesMode } from "./ChargeCategoriesManager";

interface FieldVisibility {
  quantity: boolean;
  forex: boolean;
  tax: boolean;
  remarks: boolean;
}

interface LineItemRowProps {
  item: QuotationLineItemNew;
  categoryId: string;
  categoryName: string;
  catalogCategoryId?: string;
  onUpdate: (categoryId: string, itemId: string, lineItem: Omit<QuotationLineItemNew, "id" | "amount">) => void;
  onDelete: (categoryId: string, lineItemId: string) => void;
  currency: string;
  fieldVisibility: FieldVisibility;
  readOnly?: boolean;
  mode: ChargeCategoriesMode;
}

export function LineItemRow({ 
  item, 
  categoryId, 
  categoryName,
  catalogCategoryId,
  onUpdate, 
  onDelete,
  currency,
  fieldVisibility,
  readOnly = false,
  mode
}: LineItemRowProps) {
  
  const descriptionRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const unitRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const forexRef = useRef<HTMLInputElement>(null);
  const remarksRef = useRef<HTMLInputElement>(null);

  const handleFieldsChange = (updates: Partial<Omit<QuotationLineItemNew, "id" | "amount">>) => {
    const updatedItem = {
      description: item.description,
      price: item.price,
      currency: item.currency || currency,
      charge_currency: item.charge_currency || item.currency || currency,
      quantity: item.quantity,
      unit: item.unit || "",
      forex_rate: item.forex_rate,
      is_taxed: item.is_taxed ?? item.taxed ?? false,
      taxed: item.taxed ?? item.is_taxed ?? false,
      remarks: item.remarks,
      catalog_item_id: item.catalog_item_id,
      ...updates
    };
    onUpdate(categoryId, item.id, updatedItem);
  };

  const handleFieldChange = (field: keyof Omit<QuotationLineItemNew, "id" | "amount">, value: any) => {
    handleFieldsChange({ [field]: value });
  };

  const handleKeyDown = (e: React.KeyboardEvent, nextRef?: React.RefObject<HTMLInputElement | null>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nextRef?.current?.focus();
      nextRef?.current?.select();
    }
  };

  const calculatedAmount = item.price * (item.quantity || 1) * (item.forex_rate || 1);

  // Input style for consistent design
  const inputStyle = {
    width: "100%",
    padding: "6px 8px",
    fontSize: "12px",
    color: "var(--neuron-ink-primary)",
    border: "1px solid transparent",
    borderRadius: "4px",
    backgroundColor: readOnly ? "var(--neuron-pill-inactive-bg)" : "transparent",
    outline: "none",
    transition: "all 0.15s ease",
    cursor: readOnly ? "not-allowed" : "text"
  };

  const inputFocusStyle = readOnly ? {} : {
    border: "1px solid var(--neuron-brand-green)",
    backgroundColor: "var(--theme-bg-page)"
  };

  return (
    <tr style={{ 
      borderBottom: "1px solid var(--theme-border-subtle)",
      backgroundColor: "var(--theme-bg-surface)"
    }}>
      {/* Description */}
      <td style={{ padding: "4px", overflow: "visible" }}>
        {readOnly ? (
          <div style={{ 
            padding: "6px 8px", 
            fontSize: "12px",
            color: "var(--neuron-ink-primary)" 
          }}>
            {item.description}
          </div>
        ) : (
          <CatalogItemCombobox
            value={item.description}
            catalogItemId={item.catalog_item_id}
            side="revenue"
            categoryId={catalogCategoryId}
            onChange={(description, catalogItemId) => handleFieldsChange({ description, catalog_item_id: catalogItemId })}
            placeholder="Select or type charge..."
          />
        )}
      </td>

      {/* Price */}
      <td style={{ padding: "4px" }}>
        <NaturalNumberInput
          ref={priceRef}
          value={item.price}
          onChange={(value) => handleFieldChange("price", value)}
          onKeyDown={(e) => handleKeyDown(e, mode === "simplified" ? unitRef : qtyRef)}
          decimals={2}
          step="0.01"
          disabled={readOnly}
          style={inputStyle}
          onFocus={(e) => !readOnly && Object.assign(e.target.style, inputFocusStyle)}
          onBlur={(e) => !readOnly && Object.assign(e.target.style, { 
            border: "1px solid transparent", 
            backgroundColor: "transparent" 
          })}
        />
      </td>

      {/* Unit (Simplified mode only) */}
      {mode === "simplified" && (
        <td style={{ padding: "4px" }}>
          <input
            ref={unitRef}
            type="text"
            value={item.unit || ""}
            onChange={(e) => handleFieldChange("unit", e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, remarksRef)}
            placeholder="e.g., per container"
            disabled={readOnly}
            style={inputStyle}
            onFocus={(e) => !readOnly && Object.assign(e.target.style, inputFocusStyle)}
            onBlur={(e) => !readOnly && Object.assign(e.target.style, { 
              border: "1px solid transparent", 
              backgroundColor: "transparent" 
            })}
          />
        </td>
      )}

      {/* Quantity (Full mode only) */}
      {fieldVisibility.quantity && (
        <td style={{ padding: "4px" }}>
          <NaturalNumberInput
            ref={qtyRef}
            value={item.quantity}
            onChange={(value) => handleFieldChange("quantity", value)}
            onKeyDown={(e) => handleKeyDown(e, forexRef)}
            decimals={2}
            step="0.01"
            disabled={readOnly}
            style={inputStyle}
            onFocus={(e) => !readOnly && Object.assign(e.target.style, inputFocusStyle)}
            onBlur={(e) => !readOnly && Object.assign(e.target.style, { 
              border: "1px solid transparent", 
              backgroundColor: "transparent" 
            })}
          />
        </td>
      )}

      {/* Forex Rate (Full mode only) */}
      {fieldVisibility.forex && (
        <td style={{ padding: "4px" }}>
          <NaturalNumberInput
            ref={forexRef}
            value={item.forex_rate}
            onChange={(value) => handleFieldChange("forex_rate", value)}
            onKeyDown={(e) => handleKeyDown(e, remarksRef)}
            decimals={4}
            step="0.0001"
            disabled={readOnly}
            style={inputStyle}
            onFocus={(e) => !readOnly && Object.assign(e.target.style, inputFocusStyle)}
            onBlur={(e) => !readOnly && Object.assign(e.target.style, { 
              border: "1px solid transparent", 
              backgroundColor: "transparent" 
            })}
          />
        </td>
      )}

      {/* Tax Checkbox (Full mode only) */}
      {fieldVisibility.tax && (
        <td style={{ padding: "4px", textAlign: "center" }}>
          <input
            type="checkbox"
            checked={item.is_taxed ?? item.taxed ?? false}
            onChange={(e) => {
              handleFieldChange("is_taxed", e.target.checked);
              handleFieldChange("taxed", e.target.checked);
            }}
            disabled={readOnly}
            style={{
              width: "16px",
              height: "16px",
              cursor: readOnly ? "not-allowed" : "pointer",
              accentColor: "var(--neuron-brand-green)"
            }}
          />
        </td>
      )}

      {/* Remarks */}
      {fieldVisibility.remarks && (
        <td style={{ padding: "4px" }}>
          <input
            ref={remarksRef}
            type="text"
            value={item.remarks}
            onChange={(e) => handleFieldChange("remarks", e.target.value)}
            placeholder={mode === "simplified" ? "Notes" : "Additional notes"}
            disabled={readOnly}
            style={inputStyle}
            onFocus={(e) => !readOnly && Object.assign(e.target.style, inputFocusStyle)}
            onBlur={(e) => !readOnly && Object.assign(e.target.style, { 
              border: "1px solid transparent", 
              backgroundColor: "transparent" 
            })}
          />
        </td>
      )}

      {/* Amount (Calculated) */}
      <td style={{ 
        padding: "4px", 
        textAlign: "right",
        fontSize: "12px",
        fontWeight: 500,
        color: "var(--neuron-ink-primary)"
      }}>
        {calculatedAmount.toFixed(2)}
      </td>

      {/* Delete Button */}
      {!readOnly && (
        <td style={{ padding: "4px", textAlign: "center" }}>
          <button
            onClick={() => onDelete(categoryId, item.id)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              color: "var(--neuron-ink-muted)"
            }}
            title="Delete line item"
          >
            <Trash2 size={14} />
          </button>
        </td>
      )}
    </tr>
  );
}
