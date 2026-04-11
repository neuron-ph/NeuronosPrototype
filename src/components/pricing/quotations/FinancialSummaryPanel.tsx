import { Calculator, DollarSign, Info } from "lucide-react";
import type { FinancialSummary } from "../../../types/pricing";
import { useState } from "react";

interface FinancialSummaryPanelProps {
  financialSummary: FinancialSummary;
  currency: string;
  taxRate: number;
  setTaxRate: (rate: number) => void;
  otherCharges: number;
  setOtherCharges: (amount: number) => void;
}

export function FinancialSummaryPanel({
  financialSummary,
  currency, // Note: This should ideally be PHP now, but we'll override display
  taxRate,
  setTaxRate,
  otherCharges,
  setOtherCharges
}: FinancialSummaryPanelProps) {
  
  // Local state for USD reference rate (default 58 PHP/USD)
  const [usdRefRate, setUsdRefRate] = useState(58.00);
  
  const formatAmount = (amount: number) => {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const calculateApproxUSD = () => {
    if (usdRefRate <= 0) return 0;
    return financialSummary.grand_total / usdRefRate;
  };

  return (
    <div style={{
      border: "1px solid var(--neuron-ui-border)",
      borderRadius: "8px",
      backgroundColor: "var(--theme-bg-surface)",
      overflow: "hidden",
      marginBottom: "24px"
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--neuron-ui-border)",
        backgroundColor: "var(--theme-bg-surface-subtle)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Calculator size={16} style={{ color: "var(--neuron-brand-green)" }} />
          <h3 style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--neuron-ink-primary)",
            margin: 0
          }}>
            FINANCIAL SUMMARY (PHP)
          </h3>
        </div>
      </div>

      {/* Summary Content */}
      <div style={{ padding: "16px" }}>
        <div style={{ display: "grid", gap: "12px" }}>
          
          {/* Non-Taxed Subtotal */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 12px",
            backgroundColor: "var(--theme-bg-surface-subtle)",
            borderRadius: "6px"
          }}>
            <span style={{
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--neuron-ink-secondary)"
            }}>
              Subtotal (PHP Non-Taxed)
            </span>
            <span style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--neuron-ink-primary)"
            }}>
              ₱ {formatAmount(financialSummary.subtotal_non_taxed)}
            </span>
          </div>

          {/* Taxed Subtotal */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 12px",
            backgroundColor: "var(--theme-bg-surface-subtle)",
            borderRadius: "6px"
          }}>
            <span style={{
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--neuron-ink-secondary)"
            }}>
              Subtotal (PHP Taxable)
            </span>
            <span style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--neuron-ink-primary)"
            }}>
              ₱ {formatAmount(financialSummary.subtotal_taxed)}
            </span>
          </div>

          {/* Tax Rate Control */}
          <div style={{
            padding: "12px",
            backgroundColor: "var(--theme-status-warning-bg)",
            border: "1px solid var(--theme-status-warning-fg)",
            borderRadius: "6px"
          }}>
            <label style={{
              display: "block",
              marginBottom: "6px",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--theme-status-warning-fg)",
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}>
              Tax Rate (%)
            </label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="number"
                value={Number((taxRate * 100).toFixed(2))}
                onChange={(e) => setTaxRate(Number(e.target.value) / 100)}
                step="0.01"
                min="0"
                max="100"
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  fontSize: "14px",
                  fontWeight: 600,
                  border: "1px solid var(--theme-status-warning-fg)",
                  borderRadius: "4px",
                  backgroundColor: "var(--theme-bg-surface)"
                }}
              />
              <span style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--theme-status-warning-fg)"
              }}>
                %
              </span>
            </div>
            <div style={{
              marginTop: "8px",
              fontSize: "11px",
              color: "var(--theme-status-warning-fg)"
            }}>
              Tax Amount: ₱ {formatAmount(financialSummary.tax_amount)}
            </div>
          </div>

          {/* Other Charges */}
          <div style={{
            padding: "12px",
            backgroundColor: "var(--theme-bg-surface-subtle)",
            borderRadius: "6px"
          }}>
            <label style={{
              display: "block",
              marginBottom: "6px",
              fontSize: "11px",
              fontWeight: 500,
              color: "var(--neuron-ink-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}>
              Other Charges (PHP)
            </label>
            <input
              type="number"
              value={otherCharges || ""}
              onChange={(e) => setOtherCharges(Number(e.target.value) || 0)}
              placeholder="0.00"
              step="0.01"
              min="0"
              style={{
                width: "100%",
                padding: "6px 10px",
                fontSize: "14px",
                border: "1px solid var(--neuron-ui-border)",
                borderRadius: "4px",
                backgroundColor: "var(--theme-bg-surface)"
              }}
            />
          </div>

          {/* Divider */}
          <div style={{
            height: "2px",
            backgroundColor: "var(--neuron-ui-border)",
            margin: "8px 0"
          }} />

          {/* Grand Total (PHP) */}
          <div style={{
            padding: "16px",
            backgroundColor: "var(--theme-bg-surface-tint)",
            border: "2px solid var(--neuron-brand-green)",
            borderRadius: "6px"
          }}>
            <div style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--neuron-ink-secondary)",
              marginBottom: "6px",
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}>
              TOTAL (PHP)
            </div>
            <div style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "var(--neuron-brand-green)",
              lineHeight: 1
            }}>
              ₱ {formatAmount(financialSummary.grand_total)}
            </div>
          </div>

          {/* Approx USD Total */}
          <div style={{
            padding: "12px 16px",
            backgroundColor: "var(--theme-bg-surface)", 
            border: "1px solid var(--theme-border-default)", // Subtle grey
            borderRadius: "6px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--neuron-semantic-info)",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                APPROX. TOTAL (USD)
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "11px", color: "var(--theme-text-muted)", fontWeight: 500 }}>@ Rate:</span>
                <input 
                  type="number"
                  value={usdRefRate}
                  onChange={(e) => setUsdRefRate(Number(e.target.value) || 1)}
                  style={{
                    width: "50px",
                    padding: "2px 4px",
                    fontSize: "11px",
                    border: "1px solid var(--theme-border-default)",
                    borderRadius: "4px",
                    textAlign: "right",
                    color: "var(--neuron-semantic-info)",
                    fontWeight: 600
                  }}
                />
              </div>
            </div>
            <div style={{
              fontSize: "20px",
              fontWeight: 700,
              color: "var(--neuron-semantic-info)",
              lineHeight: 1
            }}>
              $ {formatAmount(calculateApproxUSD())}
            </div>
            <div style={{ marginTop: "6px", fontSize: "10px", color: "var(--theme-text-muted)" }}>
              * Reference only based on manual rate
            </div>
          </div>

          {/* Breakdown Info */}
          <div style={{
            padding: "12px",
            backgroundColor: "var(--theme-bg-surface-subtle)",
            borderRadius: "6px",
            fontSize: "11px",
            color: "var(--neuron-ink-muted)"
          }}>
            <div style={{ display: "grid", gap: "4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Non-Taxed:</span>
                <span>{formatAmount(financialSummary.subtotal_non_taxed)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Taxable:</span>
                <span>{formatAmount(financialSummary.subtotal_taxed)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Tax ({(taxRate * 100).toFixed(1)}%):</span>
                <span>{formatAmount(financialSummary.tax_amount)}</span>
              </div>
              {otherCharges > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Other:</span>
                  <span>{formatAmount(otherCharges)}</span>
                </div>
              )}
              <div style={{
                height: "1px",
                backgroundColor: "var(--neuron-ui-border)",
                margin: "4px 0"
              }} />
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 600,
                color: "var(--neuron-ink-primary)"
              }}>
                <span>Total:</span>
                <span>{formatAmount(financialSummary.grand_total)}</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Info Footer */}
      <div style={{
        padding: "12px 16px",
        borderTop: "1px solid var(--neuron-ui-border)",
        backgroundColor: "var(--theme-status-warning-bg)",
        fontSize: "11px",
        color: "var(--theme-status-warning-fg)",
        lineHeight: 1.5
      }}>
        <strong>Note:</strong> Mark line items as "Taxed" to include them in tax calculation. 
        Tax rate can be adjusted above.
      </div>
    </div>
  );
}