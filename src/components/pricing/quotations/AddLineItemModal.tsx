import { useState, useEffect } from "react";
import { X, Plus, Edit2 } from "lucide-react";
import type { QuotationLineItemNew } from "../../../types/pricing";

interface AddLineItemModalProps {
  categoryId: string;
  onClose: () => void;
  onAdd: (categoryId: string, lineItem: Omit<QuotationLineItemNew, "id" | "amount">) => void;
  defaultCurrency: string;
  initialData?: QuotationLineItemNew;
  mode?: "add" | "edit";
}

export function AddLineItemModal({ 
  categoryId, 
  onClose, 
  onAdd, 
  defaultCurrency,
  initialData,
  mode = "add"
}: AddLineItemModalProps) {
  
  const [description, setDescription] = useState(initialData?.description || "");
  const [price, setPrice] = useState(initialData?.price || 0);
  const [currency, setCurrency] = useState(initialData?.currency || defaultCurrency);
  const [quantity, setQuantity] = useState(initialData?.quantity || 1);
  const [forexRate, setForexRate] = useState(initialData?.forex_rate || 1);
  const [isTaxed, setIsTaxed] = useState(initialData?.is_taxed || false);
  const [remarks, setRemarks] = useState(initialData?.remarks || "");
  const [buyingPrice, setBuyingPrice] = useState(initialData?.buying_price || 0);
  const [vendorId, setVendorId] = useState(initialData?.vendor_id || "");

  // Calculate amount in real-time
  const calculatedAmount = price * quantity * forexRate;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const lineItem: Omit<QuotationLineItemNew, "id" | "amount"> = {
      description: description.trim(),
      price,
      currency,
      quantity,
      forex_rate: forexRate,
      is_taxed: isTaxed,
      remarks: remarks.trim(),
      buying_price: buyingPrice || undefined,
      vendor_id: vendorId || undefined,
      buying_amount: buyingPrice ? buyingPrice * quantity * forexRate : undefined
    };

    onAdd(categoryId, lineItem);
  };

  const isFormValid = () => {
    return description.trim() && price > 0 && quantity > 0 && forexRate > 0;
  };

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2000,
      padding: "20px"
    }}>
      <div style={{
        backgroundColor: "var(--theme-bg-surface)",
        borderRadius: "8px",
        width: "100%",
        maxWidth: "600px",
        maxHeight: "90vh",
        overflow: "auto",
        border: "1px solid var(--neuron-ui-border)"
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--neuron-ui-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "var(--theme-bg-surface-subtle)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {mode === "add" ? (
              <Plus size={18} style={{ color: "var(--neuron-brand-green)" }} />
            ) : (
              <Edit2 size={18} style={{ color: "var(--neuron-brand-green)" }} />
            )}
            <h3 style={{
              margin: 0,
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--neuron-ink-primary)"
            }}>
              {mode === "add" ? "Add Line Item" : "Edit Line Item"}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              color: "var(--neuron-ink-muted)"
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: "20px" }}>
            <div style={{ display: "grid", gap: "16px" }}>
              
              {/* Description */}
              <div>
                <label style={{
                  display: "block",
                  marginBottom: "6px",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-primary)"
                }}>
                  Description *
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., O/F, CFS, LCL CHARGES, Documentation Fee"
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "6px",
                    backgroundColor: "var(--theme-bg-surface)"
                  }}
                />
              </div>

              {/* Price, Currency, Quantity Row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 1fr", gap: "12px" }}>
                <div>
                  <label style={{
                    display: "block",
                    marginBottom: "6px",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-primary)"
                  }}>
                    Price *
                  </label>
                  <input
                    type="number"
                    value={price || ""}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "14px",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      backgroundColor: "var(--theme-bg-surface)"
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: "block",
                    marginBottom: "6px",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-primary)"
                  }}>
                    Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "14px",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      backgroundColor: "var(--theme-bg-surface)"
                    }}
                  >
                    <option value="USD">USD</option>
                    <option value="PHP">PHP</option>
                    <option value="EUR">EUR</option>
                    <option value="CNY">CNY</option>
                  </select>
                </div>

                <div>
                  <label style={{
                    display: "block",
                    marginBottom: "6px",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-primary)"
                  }}>
                    Quantity *
                  </label>
                  <input
                    type="number"
                    value={quantity || ""}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    placeholder="1"
                    step="0.01"
                    min="0"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "14px",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      backgroundColor: "var(--theme-bg-surface)"
                    }}
                  />
                </div>
              </div>

              {/* Forex Rate */}
              <div>
                <label style={{
                  display: "block",
                  marginBottom: "6px",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-primary)"
                }}>
                  Forex Rate *
                </label>
                <input
                  type="number"
                  value={forexRate || ""}
                  onChange={(e) => setForexRate(Number(e.target.value))}
                  placeholder="1.0"
                  step="0.0001"
                  min="0"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "6px",
                    backgroundColor: "var(--theme-bg-surface)"
                  }}
                />
                <span style={{
                  display: "block",
                  marginTop: "4px",
                  fontSize: "11px",
                  color: "var(--neuron-ink-muted)"
                }}>
                  Use 1.0 for no conversion. Amount will be: {calculatedAmount.toFixed(2)}
                </span>
              </div>

              {/* Tax Checkbox */}
              <div>
                <label style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-primary)"
                }}>
                  <input
                    type="checkbox"
                    checked={isTaxed}
                    onChange={(e) => setIsTaxed(e.target.checked)}
                    style={{
                      width: "16px",
                      height: "16px",
                      cursor: "pointer"
                    }}
                  />
                  This item is subject to VAT/Tax
                </label>
              </div>

              {/* Remarks */}
              <div>
                <label style={{
                  display: "block",
                  marginBottom: "6px",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-primary)"
                }}>
                  Remarks
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g., PER W/M, PER BL, PER SET, PER CONTAINER"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "6px",
                    backgroundColor: "var(--theme-bg-surface)"
                  }}
                />
              </div>

              {/* Divider */}
              <div style={{
                height: "1px",
                backgroundColor: "var(--neuron-ui-border)",
                margin: "8px 0"
              }} />

              {/* Optional: Buying Price (for cost tracking) */}
              <div>
                <label style={{
                  display: "block",
                  marginBottom: "6px",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--neuron-ink-secondary)"
                }}>
                  Buying Price (Optional - for cost tracking)
                </label>
                <input
                  type="number"
                  value={buyingPrice || ""}
                  onChange={(e) => setBuyingPrice(Number(e.target.value))}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "6px",
                    backgroundColor: "var(--theme-bg-surface-subtle)"
                  }}
                />
                {buyingPrice > 0 && (
                  <span style={{
                    display: "block",
                    marginTop: "4px",
                    fontSize: "11px",
                    color: "var(--neuron-ink-muted)"
                  }}>
                    Buying amount: {(buyingPrice * quantity * forexRate).toFixed(2)} | 
                    Margin: {((price - buyingPrice) * quantity * forexRate).toFixed(2)}
                  </span>
                )}
              </div>

              {/* Calculated Amount Display */}
              <div style={{
                padding: "12px 16px",
                backgroundColor: "var(--theme-bg-surface-tint)",
                border: "1px solid var(--theme-action-primary-bg)",
                borderRadius: "6px"
              }}>
                <div style={{
                  fontSize: "11px",
                  color: "var(--neuron-ink-secondary)",
                  marginBottom: "4px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px"
                }}>
                  Calculated Amount
                </div>
                <div style={{
                  fontSize: "20px",
                  fontWeight: 600,
                  color: "var(--neuron-brand-green)"
                }}>
                  {currency} {calculatedAmount.toFixed(2)}
                </div>
                <div style={{
                  fontSize: "11px",
                  color: "var(--neuron-ink-muted)",
                  marginTop: "2px"
                }}>
                  {price} × {quantity} × {forexRate} = {calculatedAmount.toFixed(2)}
                </div>
              </div>

            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: "16px 20px",
            borderTop: "1px solid var(--neuron-ui-border)",
            backgroundColor: "var(--theme-bg-surface-subtle)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px"
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--neuron-ink-muted)",
                backgroundColor: "var(--theme-bg-surface)",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "6px",
                cursor: "pointer"
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormValid()}
              style={{
                padding: "8px 24px",
                fontSize: "13px",
                fontWeight: 600,
                color: "white",
                backgroundColor: isFormValid() ? "var(--neuron-brand-green)" : "var(--neuron-ui-muted)",
                border: "none",
                borderRadius: "6px",
                cursor: isFormValid() ? "pointer" : "not-allowed"
              }}
            >
              {mode === "add" ? "Add Item" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
