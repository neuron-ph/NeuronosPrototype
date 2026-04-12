/**
 * QuotationTypeIcons.tsx
 * 
 * Shared module for quotation type visual distinction.
 * Exports Figma-matched SVG icons, type sub-labels, and row accent styles
 * used across all quotation list views (BD + Pricing).
 * 
 * Blueprint: /docs/blueprints/QUOTATION_TYPE_VISUAL_DISTINCTION_BLUEPRINT.md
 */

import svgPaths from "../../imports/svg-2wba7iju0v";
import type { QuotationType } from "../../types/pricing";

// ─── Figma-Matched SVG Icons ───────────────────────────────────────────

/** Document icon for Project quotations (from Figma import) */
export function ProjectIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      style={{ display: "block", flexShrink: 0, color: "var(--neuron-brand-teal, #0F766E)" }}
    >
      <path d={svgPaths.p3713e00} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66667" />
      <path d={svgPaths.pd2076c0} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66667" />
      <path d="M8.33333 7.5H6.66667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66667" />
      <path d="M13.3333 10.8333H6.66667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66667" />
      <path d="M13.3333 14.1667H6.66667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66667" />
    </svg>
  );
}

/** Contract-signing icon for Contract quotations (from Figma import) */
export function ContractIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      style={{ display: "block", flexShrink: 0, color: "var(--neuron-brand-teal, #0F766E)" }}
    >
      <path d={svgPaths.p1716b080} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66667" />
      <path d={svgPaths.p14fc3200} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66667" />
      <path d={svgPaths.p1d27c680} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66667" />
      <path d={svgPaths.pe244500} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66667" />
      <path d="M2.5 3.33333H9.16667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66667" />
    </svg>
  );
}

// ─── Quotation Type Icon Selector ──────────────────────────────────────

/** Returns the correct icon component based on quotation type */
export function QuotationTypeIcon({ type, size = 16 }: { type?: QuotationType; size?: number }) {
  if (type === "contract") {
    return <ContractIcon size={size} />;
  }
  return <ProjectIcon size={size} />;
}

// ─── Type Sub-Label ────────────────────────────────────────────────────

/**
 * Renders the quote number + type sub-label in muted text.
 * Example: "CQ2602213621 · Contract" or "QUO2602184004 · Project"
 */
export function QuotationTypeSubLabel({
  quoteNumber,
  type,
}: {
  quoteNumber: string;
  type?: QuotationType;
}) {
  const label = type === "contract" ? "Contract" : "Project";

  return (
    <span
      style={{
        fontSize: "12px",
        color: "var(--theme-text-muted)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        marginTop: "2px",
        display: "flex",
        alignItems: "center",
        gap: "4px",
      }}
    >
      <span>{quoteNumber}</span>
      <span style={{ color: "var(--theme-border-default)" }}>·</span>
      <span>{label}</span>
    </span>
  );
}

// ─── Row Accent Style ──────────────────────────────────────────────────

/**
 * Returns inline style for the left accent border on contract rows.
 * Currently returns empty style (accent strip removed by design decision).
 */
export function getQuotationTypeAccentStyle(_type?: QuotationType): React.CSSProperties {
  return {};
}