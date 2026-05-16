// Shared style tokens for printable documents.
//
// PDF-safe colors only — react-pdf doesn't reliably resolve CSS variables, so
// we keep concrete values here and reuse them in both the HTML preview and
// the @react-pdf/renderer document.

export const PRINTABLE_COLORS = {
  ink: "#111827",
  inkSoft: "#374151",
  muted: "#6B7280",
  mutedSoft: "#4B5563",
  border: "#E5E9F0",
  borderSoft: "#E5E7EB",
  brandDark: "#12332B",
  brandTeal: "#0F766E",
  surface: "#FFFFFF",
  emptyText: "#9CA3AF",
} as const;

export const PRINTABLE_TYPE = {
  // PDF font sizes (pt-ish, react-pdf uses px). Mirrored in HTML using pt.
  body: 8.5,
  bodySm: 7.5,
  label: 6.5,
  title: 22,
  sectionHeader: 9,
  customerHeader: 8,
  grandTotal: 10,
} as const;
