import { ChevronRight, Package, DollarSign, Plus } from "lucide-react";
import { useState } from "react";
import type { SellingPriceCategory } from "../../../types/pricing";
import { CustomCheckbox } from "../../bd/CustomCheckbox";
import { CustomDropdown } from "../../bd/CustomDropdown";
import { PhilippinePeso } from "../../icons/PhilippinePeso";

interface FinalizedPriceSectionProps {
  categories: SellingPriceCategory[];
  currency: string;
}

export function FinalizedPriceSection({ 
  categories, 
  currency
}: FinalizedPriceSectionProps) {
  
  // Default all to expanded
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(categories.map(c => c.id))
  );

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };
  
  // Calculate total from all categories
  const total = categories.reduce((sum, cat) => sum + cat.subtotal, 0);
  
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
        borderBottom: "2px solid var(--theme-bg-surface-tint)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <PhilippinePeso size={18} style={{ color: "var(--theme-action-primary-bg)" }} />
          <h2 style={{
            fontSize: "17px",
            fontWeight: 600,
            color: "var(--theme-action-primary-bg)",
            margin: 0,
            letterSpacing: "-0.01em"
          }}>
            Charge Categories
          </h2>
        </div>

        {/* Action Buttons - Removed for read-only view, but keeping structure if needed */}
      </div>

      {/* Categories Display */}
      {categories.length === 0 ? (
        <div style={{
          padding: "48px 24px",
          textAlign: "center",
          backgroundColor: "var(--theme-bg-surface)",
          border: "1px solid var(--theme-border-default)",
          borderRadius: "10px"
        }}>
          <DollarSign 
            size={48} 
            strokeWidth={1.2}
            style={{ 
              color: "var(--theme-text-muted)",
              margin: "0 auto 12px auto",
              display: "block",
              opacity: 0.75
            }} 
          />
          <h3 style={{ 
            color: "var(--theme-text-primary)",
            fontSize: "16px",
            fontWeight: 500,
            marginBottom: "4px"
          }}>
            No charges added
          </h3>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {categories.map((category) => {
            const isCategoryExpanded = expandedCategories.has(category.id);
            const itemCount = category.line_items.length;
            const itemLabel = itemCount === 1 ? "item" : "items";

            return (
              <div key={category.id} style={{
                border: "1px solid var(--theme-border-default)",
                borderRadius: "10px",
                overflow: "hidden",
                backgroundColor: "var(--theme-bg-surface)"
              }}>
                {/* Category Header (Inline Implementation matching CategoryHeader.tsx look) */}
                <div
                  style={{
                    backgroundColor: "var(--theme-bg-page)",
                    border: "none",
                    padding: "12px 16px",
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                  onClick={() => toggleCategory(category.id)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {/* Chevron Icon */}
                    <ChevronRight
                      size={16}
                      style={{
                        color: "var(--theme-text-muted)",
                        transform: isCategoryExpanded ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 0.2s ease",
                        flexShrink: 0
                      }}
                    />

                    {/* Package Icon */}
                    <Package size={16} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} />

                    {/* Category Name */}
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "var(--theme-text-primary)",
                          letterSpacing: "0.01em"
                        }}
                      >
                        {category.category_name || category.name}
                      </span>
                      
                      {/* Item Count Badge */}
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 500,
                          color: "var(--theme-text-muted)",
                          backgroundColor: "var(--theme-bg-surface)",
                          padding: "2px 6px",
                          borderRadius: "4px"
                        }}
                      >
                        {itemCount} {itemLabel}
                      </span>
                    </div>

                    {/* Right Side - Subtotal instead of Actions */}
                     <div style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "var(--theme-action-primary-bg)",
                      fontFamily: "monospace"
                    }}>
                      {currency} {category.subtotal?.toFixed(2) || "0.00"}
                    </div>
                  </div>
                </div>

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
                        {/* Table Header */}
                        <div style={{
                          display: "grid",
                          // Removed Cost, Markup P, Markup % columns
                          gridTemplateColumns: "minmax(250px, 4fr) minmax(60px, 0.8fr) minmax(70px, 0.8fr) minmax(70px, 0.8fr) 40px minmax(120px, 1.5fr)",
                          gap: "8px",
                          padding: "10px 16px",
                          backgroundColor: "var(--theme-bg-page)",
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "var(--theme-text-muted)",
                          letterSpacing: "0.02em",
                          borderBottom: "1px solid #EDF2F1"
                        }}>
                          <div>Item</div>
                          <div style={{ textAlign: "right" }}>Qty</div>
                          {/* Cost removed */}
                          {/* Markup P removed */}
                          {/* Markup % removed */}
                          <div style={{ textAlign: "center" }}>Curr</div>
                          <div style={{ textAlign: "right" }}>Forex</div>
                          <div style={{ textAlign: "center" }}>Tax</div>
                          <div style={{ textAlign: "right" }}>Price</div>
                        </div>

                        {/* Table Body */}
                        {category.line_items.map((item, idx) => (
                          <div key={item.id || idx}>
                            {/* Main Row - Pricing Data */}
                            <div
                              style={{
                                display: "grid",
                                // Matched header columns
                                gridTemplateColumns: "minmax(250px, 4fr) minmax(60px, 0.8fr) minmax(70px, 0.8fr) minmax(70px, 0.8fr) 40px minmax(120px, 1.5fr)",
                                gap: "8px",
                                padding: "12px 16px",
                                fontSize: "13px",
                                color: "var(--theme-text-primary)",
                                backgroundColor: "var(--theme-bg-surface)",
                                alignItems: "center"
                              }}
                            >
                              {/* Item - Disabled Input */}
                              <input
                                type="text"
                                value={item.description}
                                disabled
                                style={{
                                  width: "100%",
                                  padding: "6px 8px",
                                  fontSize: "13px",
                                  border: "1px solid var(--theme-border-default)",
                                  borderRadius: "6px",
                                  backgroundColor: "var(--theme-bg-page)", // Slightly gray for disabled
                                  fontWeight: 500,
                                   color: "var(--theme-text-primary)",
                                   overflow: "hidden",
                                   textOverflow: "ellipsis",
                                   whiteSpace: "nowrap"
                                }}
                              />
                              
                              {/* Qty */}
                              <div style={{ 
                                textAlign: "right", 
                                fontSize: "13px", 
                                color: "var(--theme-text-muted)", 
                                fontWeight: 500 
                              }}>
                                {item.quantity?.toFixed(2)}
                              </div>
                              
                              {/* Cost removed */}
                              {/* Markup P removed */}
                              {/* Markup % removed */}
                              
                              {/* Currency - Disabled Dropdown (simulated with div) */}
                              <div style={{ fontSize: "12px" }}>
                                <div style={{
                                  padding: "6px 8px",
                                  border: "1px solid var(--theme-border-default)",
                                  borderRadius: "6px",
                                  backgroundColor: "var(--theme-bg-page)",
                                  color: "var(--theme-text-muted)",
                                  textAlign: "center"
                                }}>
                                  {item.currency || currency}
                                </div>
                              </div>
                              
                              {/* Forex - Disabled Input */}
                              <input
                                type="number"
                                value={item.forex_rate?.toFixed(2)}
                                disabled
                                style={{
                                  width: "100%",
                                  padding: "6px 8px",
                                  fontSize: "12px",
                                  textAlign: "right",
                                  border: "1px solid var(--theme-border-default)",
                                  borderRadius: "6px",
                                  backgroundColor: "var(--theme-bg-page)",
                                  outline: "none"
                                }}
                              />
                              
                              {/* Tax Checkbox */}
                              <div style={{ display: "flex", justifyContent: "center" }}>
                                <div style={{ pointerEvents: "none", opacity: 0.7 }}>
                                  <CustomCheckbox
                                    checked={item.is_taxed || false}
                                    onChange={() => {}}
                                  />
                                </div>
                              </div>
                              
                              {/* Final Selling Price (Unit Price) */}
                              <div style={{ 
                                textAlign: "right", 
                                fontWeight: 700, 
                                color: "var(--theme-action-primary-bg)",
                                fontSize: "14px"
                              }}>
                                {item.currency} {item.final_price?.toFixed(2) || item.price?.toFixed(2)}
                              </div>
                            </div>

                            {/* Metadata Row - Remarks, Service Tag */}
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "14px",
                              padding: "10px 16px 12px 28px",
                              backgroundColor: "var(--theme-bg-page)",
                              borderTop: "1px solid #EDF2F1",
                              fontSize: "12px",
                              color: "var(--theme-text-muted)",
                              borderBottom: idx < category.line_items.length - 1 ? "1px solid #EDF2F1" : "none"
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
                                  disabled
                                  placeholder=""
                                  style={{
                                    flex: 1,
                                    padding: "5px 8px",
                                    fontSize: "12px",
                                    border: "1px solid var(--theme-border-default)",
                                    borderRadius: "6px",
                                    backgroundColor: "var(--theme-bg-surface)", // Keep white or slightly gray? Original input is white.
                                    color: "var(--theme-text-primary)",
                                    outline: "none"
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
                                  <div style={{
                                    padding: "5px 8px",
                                    border: "1px solid var(--theme-border-default)",
                                    borderRadius: "6px",
                                    backgroundColor: "var(--theme-bg-surface)",
                                    color: "var(--theme-text-primary)",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis"
                                  }}>
                                    {item.service || item.service_tag || "General"}
                                  </div>
                                </div>
                              </div>
                              
                              {/* Remove Button removed */}
                            </div>
                          </div>
                        ))}

                        {/* Category Subtotal */}
                        <div style={{
                          display: "grid",
                          // Matched columns
                          gridTemplateColumns: "minmax(250px, 4fr) minmax(60px, 0.8fr) minmax(70px, 0.8fr) minmax(70px, 0.8fr) 40px minmax(120px, 1.5fr)",
                          gap: "8px",
                          padding: "12px 16px",
                          backgroundColor: "var(--theme-bg-surface-tint)",
                          borderTop: "2px solid var(--neuron-brand-teal)",
                          fontSize: "13px",
                          fontWeight: 600
                        }}>
                          {/* Empty cells for Item, Qty, Cur, Forex, Tax */}
                          <div></div>
                          <div></div>
                          <div></div>
                          <div></div>
                          <div style={{ textAlign: "right", color: "var(--theme-text-muted)", fontSize: "12px" }}>
                            Subtotal:
                          </div>
                          <div style={{ 
                            textAlign: "right", 
                            color: "var(--neuron-brand-teal)",
                            fontWeight: 700
                          }}>
                            {currency} {category.subtotal?.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
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
                color: "var(--theme-text-primary)",
                letterSpacing: "-0.01em"
              }}>
                Total Selling Price:
              </div>
              <div style={{
                fontSize: "22px",
                fontWeight: 700,
                color: "var(--neuron-brand-teal)",
                textAlign: "right",
                letterSpacing: "-0.02em"
              }}>
                {currency} {total.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}