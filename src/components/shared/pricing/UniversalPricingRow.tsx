import { Trash2 } from "lucide-react";
import { useState } from "react";
import { CustomCheckbox } from "../../bd/CustomCheckbox";
import { CustomDropdown } from "../../bd/CustomDropdown";
import { FormattedNumberInput } from "./FormattedNumberInput";
import { CatalogItemCombobox } from "./CatalogItemCombobox";
import { DualCurrencyAmount } from "./DualCurrencyAmount";

export interface PricingItemData {
  id: string;
  description: string;
  quantity: number;
  base_cost: number;
  amount_added: number;
  percentage_added: number;
  currency: string;
  forex_rate: number;
  forex_rate_date?: string | null;
  is_taxed: boolean;
  final_price: number;
  amount?: number; // Calculated PHP Total
  remarks?: string;
  service?: string;
  service_tag?: string; // For compatibility
  status?: string; // For Billing (unbilled/billed/paid)
  created_at?: string; // For Billing
  catalog_item_id?: string; // Catalog linkage (Item Master reference)
}

export interface UniversalPricingRowProps {
  data: PricingItemData;
  mode?: "edit" | "view";
  config?: {
    showCost?: boolean;
    showMarkup?: boolean;
    showTax?: boolean;
    showForex?: boolean;
    simpleMode?: boolean; // For Billing (hides extra columns)
    priceEditable?: boolean; // Allow direct editing of final price
    showPHPConversion?: boolean; // ✨ NEW: Force display of PHP converted amount (for Selling Price)
  };
  handlers?: {
    onFieldChange: (field: string, value: any) => void;
    onAmountChange?: (value: number) => void;
    onPercentageChange?: (value: number) => void;
    onPriceChange?: (value: number) => void; // Direct price edit
    onRemove?: () => void;
  };
  customActions?: React.ReactNode;
  serviceType?: string; // For CatalogItemCombobox (reserved for future smart-sort)
  categoryId?: string; // Filters combobox to items in this catalog category
}

export function buildCatalogSelectionPatch(description: string, catalogItemId?: string | null) {
  return {
    description,
    catalog_item_id: catalogItemId ?? null,
  };
}

export function UniversalPricingRow({
  data,
  mode = "view",
  config = {
    showCost: true,
    showMarkup: true,
    showTax: true,
    showForex: true,
    simpleMode: false,
    priceEditable: false
  },
  handlers,
  customActions,
  serviceType,
  categoryId,
}: UniversalPricingRowProps) {
  const { simpleMode, showCost, showMarkup, showTax, showForex, priceEditable, showPHPConversion } = config;
  const isViewMode = mode === "view";
  const percentageMarkupDisabled = data.base_cost < 0;

  // Draft state for numeric inputs — allows typing "2." without losing the decimal
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const draftVal = (field: string, numericVal: number): string | number =>
    drafts[field] !== undefined ? drafts[field] : numericVal;

  const onDraftChange = (field: string, val: string, commit: (n: number) => void, pattern = /^-?\d*\.?\d*$/) => {
    if (val === '' || pattern.test(val)) {
      setDrafts(prev => ({ ...prev, [field]: val }));
      const num = parseFloat(val);
      if (!isNaN(num)) commit(num);
    }
  };

  const onDraftFocus = (field: string, numericVal: number) => {
    setDrafts(prev => ({ ...prev, [field]: String(numericVal) }));
  };

  const onDraftBlur = (field: string, commit: (n: number) => void, e: React.FocusEvent<HTMLInputElement>, styleClear?: () => void) => {
    const draft = drafts[field];
    commit(draft === undefined || draft === '' ? 0 : parseFloat(draft) || 0);
    setDrafts(prev => { const n = { ...prev }; delete n[field]; return n; });
    styleClear?.();
  };

  // Effective Visibility Logic (Matches PricingTableHeader)
  const showC = !simpleMode && showCost;
  const showM = !simpleMode && showMarkup;
  const showF = showForex; // Always respect flag
  const showT = showTax;   // Always respect flag

  // Define Grid Columns based on visibility
  const getGridTemplate = () => {
    const parts = [
      "minmax(140px, 3fr)", // Item
      "minmax(50px, 0.8fr)" // Qty
    ];

    if (showC) parts.push("minmax(80px, 1.2fr)"); // Cost
    if (showM) {
      parts.push("minmax(70px, 1fr)"); // Markup $
      parts.push("minmax(65px, 1fr)"); // Markup %
    }

    parts.push("minmax(58px, 0.7fr)"); // Curr

    if (showF) parts.push("minmax(55px, 0.8fr)"); // Forex
    if (showT) parts.push("40px"); // Tax

    parts.push("minmax(90px, 1.5fr)"); // Price

    return parts.join(" ");
  };

  const handleFieldChange = (field: string, value: any) => {
    if (handlers?.onFieldChange) {
      handlers.onFieldChange(field, value);
      // Stamp the FX lock date whenever a non-PHP rate is captured. Gives the
      // audit trail a "rate as of" timestamp without requiring a separate UI.
      if (field === "forex_rate" && Number.isFinite(value) && value > 0 && value !== 1) {
        handlers.onFieldChange("forex_rate_date", new Date().toISOString().slice(0, 10));
      }
      if (field === "currency" && value !== "PHP" && (data.forex_rate ?? 1) !== 1 && !data.forex_rate_date) {
        handlers.onFieldChange("forex_rate_date", new Date().toISOString().slice(0, 10));
      }
    }
  };

  return (
    <div>
      {/* Main Row - Pricing Data */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: getGridTemplate(),
          gap: "8px",
          padding: "12px 16px",
          fontSize: "13px",
          color: "var(--theme-text-primary)",
          backgroundColor: "var(--theme-bg-surface)",
          alignItems: "center"
        }}
      >
        {/* Item — CatalogItemCombobox in edit mode, plain text in view mode */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {isViewMode ? (
            <div
              title={data.description}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontSize: "13px",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                backgroundColor: "var(--theme-bg-surface-subtle)",
                fontWeight: 500,
                color: "var(--theme-text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                cursor: "default",
              }}
            >
              {data.description || "\u00A0"}
            </div>
          ) : (
            <CatalogItemCombobox
              value={data.description}
              catalogItemId={data.catalog_item_id}
              serviceType={serviceType}
              side="revenue"
              categoryId={categoryId}
              onChange={(description, catalogItemId) => {
                const patch = buildCatalogSelectionPatch(description, catalogItemId);
                handleFieldChange('description', patch.description);
                handleFieldChange('catalog_item_id', patch.catalog_item_id);
              }}
              placeholder="Item description"
            />
          )}
          {/* Date Subtitle for Billing Mode */}
          {simpleMode && data.created_at && (
             <span style={{ fontSize: "11px", color: "var(--theme-text-muted)", marginTop: "4px", paddingLeft: "4px" }}>
               {new Date(data.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
             </span>
          )}
        </div>
        
        {/* Qty */}
        {isViewMode ? (
          <div style={{ 
            textAlign: "right", 
            fontSize: "13px", 
            color: "var(--theme-text-muted)",
            fontWeight: 500
          }}>
            {data.quantity.toFixed(2)}
          </div>
        ) : (
          <input
            type="text"
            inputMode="decimal"
            value={draftVal('quantity', data.quantity)}
            onChange={(e) => onDraftChange('quantity', e.target.value, (n) => handleFieldChange('quantity', n), /^\d*\.?\d*$/)}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: "13px",
              textAlign: "right",
              border: "1px solid var(--theme-border-default)",
              borderRadius: "6px",
              backgroundColor: "var(--theme-bg-surface)",
              color: "var(--theme-text-primary)",
              fontWeight: 500,
              outline: "none",
              transition: "all 0.15s ease",
              MozAppearance: "textfield",
              WebkitAppearance: "none"
            }}
            onFocus={(e) => {
              onDraftFocus('quantity', data.quantity);
              e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(15, 118, 110, 0.08)";
            }}
            onBlur={(e) => {
              onDraftBlur('quantity', (n) => handleFieldChange('quantity', n), e, () => {
                e.currentTarget.style.borderColor = "var(--theme-border-default)";
                e.currentTarget.style.boxShadow = "none";
              });
            }}
          />
        )}
        
        {/* Cost (Base Cost) */}
        {showC && (
          isViewMode ? (
            <div style={{ 
              textAlign: "right", 
              fontSize: "13px", 
              color: "var(--theme-text-muted)",
              fontWeight: 500
            }}>
              {data.currency} {data.base_cost.toFixed(2)}
            </div>
          ) : (
            <input
              type="text"
              inputMode="decimal"
              value={draftVal('base_cost', data.base_cost)}
              onChange={(e) => onDraftChange('base_cost', e.target.value, (n) => handleFieldChange('base_cost', n))}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontSize: "13px",
                textAlign: "right",
                border: "1px solid var(--theme-border-default)",
                borderRadius: "6px",
                backgroundColor: "var(--theme-bg-surface)",
                color: "var(--theme-text-primary)",
                fontWeight: 500,
                outline: "none",
                transition: "all 0.15s ease",
                MozAppearance: "textfield",
                WebkitAppearance: "none"
              }}
              onFocus={(e) => {
                onDraftFocus('base_cost', data.base_cost);
                e.currentTarget.style.borderColor = "var(--neuron-brand-teal)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(15, 118, 110, 0.08)";
              }}
              onBlur={(e) => {
                onDraftBlur('base_cost', (n) => handleFieldChange('base_cost', n), e, () => {
                  e.currentTarget.style.borderColor = "var(--theme-border-default)";
                  e.currentTarget.style.boxShadow = "none";
                });
              }}
            />
          )
        )}
        
        {/* Markup Amount Input */}
        {showM && (
          <input
            type="text"
            inputMode="decimal"
            value={isViewMode ? data.amount_added.toFixed(2) : draftVal('amount_added', data.amount_added)}
            onChange={(e) => onDraftChange('amount_added', e.target.value, (n) => handlers?.onAmountChange?.(n))}
            disabled={isViewMode}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: "13px",
              textAlign: "right",
              border: isViewMode ? "1px solid var(--theme-border-default)" : "1px solid var(--theme-markup-border)",
              borderRadius: "6px",
              backgroundColor: isViewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-markup-bg)",
              color: isViewMode ? "var(--theme-text-muted)" : "var(--neuron-brand-teal)",
              fontWeight: 600,
              outline: "none",
              transition: "all 0.15s ease",
              cursor: isViewMode ? "default" : "text"
            }}
            onFocus={(e) => {
              if (isViewMode) return;
              onDraftFocus('amount_added', data.amount_added);
              e.currentTarget.style.borderColor = "var(--theme-markup-focus)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(245, 158, 11, 0.1)";
            }}
            onBlur={(e) => {
              if (isViewMode) return;
              onDraftBlur('amount_added', (n) => handlers?.onAmountChange?.(n), e, () => {
                e.currentTarget.style.borderColor = "var(--theme-markup-border)";
                e.currentTarget.style.boxShadow = "none";
              });
            }}
          />
        )}
        
        {/* Markup Percentage Input */}
        {showM && (
          <input
            type="text"
            inputMode="decimal"
            value={
              percentageMarkupDisabled
                ? "0.0"
                : isViewMode
                  ? data.percentage_added.toFixed(1)
                  : draftVal('percentage_added', data.percentage_added)
            }
            onChange={(e) => onDraftChange('percentage_added', e.target.value, (n) => handlers?.onPercentageChange?.(n))}
            disabled={isViewMode || percentageMarkupDisabled}
            title={percentageMarkupDisabled ? "Percentage markup is disabled for negative costs. Use amount added instead." : undefined}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: "13px",
              textAlign: "right",
              border: isViewMode ? "1px solid var(--theme-border-default)" : "1px solid var(--theme-markup-border)",
              borderRadius: "6px",
              backgroundColor: isViewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-markup-bg)",
              color: isViewMode ? "var(--theme-text-muted)" : "var(--neuron-brand-teal)",
              fontWeight: 600,
              outline: "none",
              transition: "all 0.15s ease",
              opacity: percentageMarkupDisabled ? 0.55 : 1,
              cursor: isViewMode || percentageMarkupDisabled ? "not-allowed" : "text"
            }}
            onFocus={(e) => {
              if (isViewMode || percentageMarkupDisabled) return;
              onDraftFocus('percentage_added', data.percentage_added);
              e.currentTarget.style.borderColor = "var(--theme-markup-focus)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(245, 158, 11, 0.1)";
            }}
            onBlur={(e) => {
              if (isViewMode || percentageMarkupDisabled) return;
              onDraftBlur('percentage_added', (n) => handlers?.onPercentageChange?.(n), e, () => {
                e.currentTarget.style.borderColor = "var(--theme-markup-border)";
                e.currentTarget.style.boxShadow = "none";
              });
            }}
          />
        )}
        
        {/* Currency */}
        <div style={{ fontSize: "12px", textAlign: "center" }}>
          {isViewMode && simpleMode ? (
             // Simple text for Billing View Mode
             <span style={{ fontWeight: 600, color: "var(--theme-text-muted)" }}>{data.currency}</span>
          ) : (
            <CustomDropdown
              value={data.currency || "USD"}
              onChange={(value) => handleFieldChange('currency', value)}
              options={[
                { value: "PHP", label: "PHP" },
                { value: "USD", label: "USD" },
              ]}
              placeholder="USD"
              size="sm"
              disabled={isViewMode}
            />
          )}
        </div>
        
        {/* Forex */}
        {showF && (
          <FormattedNumberInput
            value={data.forex_rate}
            onChange={(val) => handleFieldChange('forex_rate', val)}
            decimals={2}
            disabled={isViewMode}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: "12px",
              textAlign: "right",
              border: "1px solid var(--theme-border-default)",
              borderRadius: "6px",
              backgroundColor: isViewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-input-subtle-bg)",
              outline: "none",
              cursor: isViewMode ? "default" : "text"
            }}
          />
        )}
        
        {/* Tax Checkbox */}
        {showT && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <CustomCheckbox
              checked={data.is_taxed}
              onChange={(checked) => handleFieldChange('is_taxed', checked)}
              disabled={isViewMode}
            />
          </div>
        )}
        
        {/* Final Selling Price */}
        <div style={{ 
          textAlign: "right", 
          fontWeight: 700, 
          color: "var(--neuron-brand-green)",
          fontSize: "14px",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          justifyContent: "center"
        }}>
          {priceEditable && !isViewMode ? (
            (() => {
              const isForeign = data.currency && data.currency !== "PHP";
              const rate = Number(data.forex_rate) || 1;
              const phpEquivalent = (Number(data.final_price) || 0) * (Number(data.quantity) || 1) * rate;
              return (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", width: "100%" }}>
                  <div style={{ position: "relative", width: "100%" }}>
                    {isForeign && (
                      <span style={{
                        position: "absolute",
                        left: "8px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: "10px",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        color: "var(--neuron-semantic-info)",
                        pointerEvents: "none",
                      }}>
                        {data.currency}
                      </span>
                    )}
                    <input
                      type="number"
                      value={data.final_price}
                      onChange={(e) => handlers?.onPriceChange && handlers.onPriceChange(parseFloat(e.target.value) || 0)}
                      step="0.01"
                      placeholder="Price"
                      style={{
                        width: "100%",
                        padding: isForeign ? "6px 8px 6px 38px" : "6px 8px",
                        fontSize: "14px",
                        textAlign: "right",
                        border: "1px solid var(--theme-border-default)",
                        borderRadius: "6px",
                        color: "var(--neuron-brand-green)",
                        fontWeight: 700,
                        outline: "none",
                      }}
                    />
                  </div>
                  {isForeign && rate !== 1 && (
                    <span
                      style={{
                        marginTop: "2px",
                        fontSize: "11px",
                        fontWeight: 500,
                        color: "var(--theme-text-muted)",
                        whiteSpace: "nowrap",
                      }}
                      title={`Locked at ${rate} ${data.currency}/PHP${data.forex_rate_date ? ` on ${data.forex_rate_date}` : ""}`}
                    >
                      ≈ ₱{phpEquivalent.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
              );
            })()
          ) : simpleMode && isViewMode ? (
            // Billing view — single amount, dual-currency aware
            <DualCurrencyAmount
              originalAmount={(data.final_price || 0) * (data.quantity || 1)}
              currency={data.currency}
              forexRate={data.forex_rate || 1}
              baseAmount={data.amount}
              rateDate={data.forex_rate_date ?? null}
            />
          ) : showPHPConversion ? (
            // Selling Price total — Pattern A: USD primary, PHP equivalent secondary (USD-origin only)
            <DualCurrencyAmount
              originalAmount={(data.final_price || 0) * (data.quantity || 1)}
              currency={data.currency}
              forexRate={data.forex_rate || 1}
              baseAmount={data.amount}
              rateDate={data.forex_rate_date ?? null}
            />
          ) : (
            // Standard Mode (Buying Price): Show Unit Price in Original Currency
            <span>{data.currency} {data.final_price.toFixed(2)}</span>
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
        borderTop: "1px solid var(--theme-border-default)",
        fontSize: "12px",
        color: "var(--theme-text-muted)",
        borderBottom: "1px solid var(--theme-border-default)" // Always border bottom for safety
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
            value={data.remarks || ""}
            onChange={(e) => handleFieldChange('remarks', e.target.value)}
            placeholder="Add optional notes..."
            disabled={isViewMode}
            style={{
              flex: 1,
              padding: "5px 8px",
              fontSize: "12px",
              border: "1px solid var(--theme-border-default)",
              borderRadius: "6px",
              backgroundColor: isViewMode ? "var(--neuron-pill-inactive-bg)" : "var(--theme-bg-surface)",
              color: "var(--theme-text-primary)",
              outline: "none",
              transition: "all 0.15s ease",
              cursor: isViewMode ? "default" : "text"
            }}
            onFocus={(e) => {
              if (isViewMode) return;
              e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(15, 118, 110, 0.06)";
            }}
            onBlur={(e) => {
              if (isViewMode) return;
              e.currentTarget.style.borderColor = "var(--theme-border-default)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>

        {/* Service Tag */}
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
              value={data.service || data.service_tag || ""}
              onChange={(value) => handleFieldChange('service', value)}
              options={[
                { value: "Forwarding", label: "Forwarding" },
                { value: "Brokerage", label: "Brokerage" },
                { value: "Trucking", label: "Trucking" },
                { value: "Marine Insurance", label: "Marine Insurance" },
                { value: "Others", label: "Others" }
              ]}
              placeholder="General"
              size="sm"
              disabled={isViewMode}
            />
          </div>
        </div>

        {/* Action Area: Status Badge (View Mode) OR Remove Button (Edit Mode) */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Status Badge (Only show in view mode if in billing simple mode, OR if editing but user wants to see status)
              Actually, per request "remove button... copy exact design".
              In Selling Price design, there is NO status badge, just Remove button.
              So in Edit Mode (!isViewMode), we prioritize Remove Button.
              In View Mode, we show Status Badge.
          */}
          
          {simpleMode && data.status && isViewMode && (
             <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium border
               ${data.status === 'paid' ? "bg-[var(--theme-status-success-bg)] text-[var(--theme-status-success-fg)] border-[var(--theme-status-success-border)]" : 
                 (data.status === 'billed' || data.status === 'invoiced') ? "bg-[var(--neuron-semantic-info-bg)] text-[var(--neuron-semantic-info)] border-[var(--neuron-semantic-info-border)]" : 
                 "bg-[var(--theme-bg-surface-subtle)] text-[var(--theme-text-muted)] border-[var(--theme-border-default)]"}`}>
               {data.status === 'paid' ? "Paid" : (data.status === 'billed' || data.status === 'invoiced') ? "Invoiced" : "Unbilled"}
             </span>
          )}

          {/* Custom Actions (Save/Cancel buttons) */}
          {customActions && customActions}

          {/* Remove Button - Hidden in viewMode */}
          {!isViewMode && handlers?.onRemove && !customActions && (
          <button
            onClick={handlers.onRemove}
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
    </div>
  );
}
