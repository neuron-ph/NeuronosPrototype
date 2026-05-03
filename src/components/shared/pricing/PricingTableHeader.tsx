import { memo } from "react";

interface PricingTableHeaderProps {
  showCost?: boolean;
  showMarkup?: boolean;
  showTax?: boolean;
  showForex?: boolean;
  simpleMode?: boolean; // Kept for backward compat, but we'll use flags primarily
  firstCellContent?: React.ReactNode; // Optional override for the first cell (default: "Item")
}

export function PricingTableHeader({
  showCost = true,
  showMarkup = true,
  showTax = true,
  showForex = true,
  simpleMode = false,
  firstCellContent
}: PricingTableHeaderProps) {

  // Dynamic Grid Template Generator
  const getGridTemplate = () => {
    // If simpleMode is true, we might want to override defaults if not explicitly passed?
    // But better to just respect the flags.
    // If simpleMode was intended to hide Cost/Markup, the parent should pass showCost={false}.
    // But for safety, let's assume if simpleMode is true, we ignore Cost/Markup unless forced?
    // No, let's make it purely based on the flags provided.
    // However, the caller might still be passing simpleMode=true expecting hidden columns.
    
    // Effective Visibility
    const showC = !simpleMode && showCost;
    const showM = !simpleMode && showMarkup;
    // For Forex and Tax, we now WANT them in simpleMode (Billing), so we trust the prop.
    // But previously `!simpleMode && showForex` hid them.
    // We will now allow them if showForex is true, regardless of simpleMode.
    const showF = showForex; 
    const showT = showTax;

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

  const showC = !simpleMode && showCost;
  const showM = !simpleMode && showMarkup;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: getGridTemplate(),
      gap: "8px",
      padding: "10px 16px",
      backgroundColor: "var(--theme-bg-surface-subtle)",
      fontSize: "11px",
      fontWeight: 600,
      color: "var(--theme-text-muted)",
      letterSpacing: "0.02em",
      borderBottom: "1px solid var(--theme-border-subtle)"
    }}>
      <div>{firstCellContent ?? "Item"}</div>
      
      <div style={{ textAlign: "right" }}>Qty</div>
      
      {showC && <div style={{ textAlign: "right" }}>Cost</div>}
      
      {showM && <div style={{ textAlign: "right" }}>Markup ₱</div>}
      
      {showM && <div style={{ textAlign: "right" }}>Markup %</div>}
      
      <div style={{ textAlign: "center" }}>Curr</div>
      
      {showForex && <div style={{ textAlign: "right" }} title="Foreign currency rate to PHP (e.g. 58 means 1 USD = ₱58)">Rate →PHP</div>}
      
      {showTax && <div style={{ textAlign: "center" }}>Tax</div>}
      
      <div style={{ textAlign: "right" }}>Price</div>
    </div>
  );
}