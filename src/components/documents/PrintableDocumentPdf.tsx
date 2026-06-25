// @react-pdf/renderer counterpart to PrintableDocumentHtml.
//
// Both renderers consume the same normalized PrintableDocument so the actual
// downloaded PDF matches the browser preview byte-for-byte (modulo font
// rendering differences between HTML and react-pdf).

import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type {
  PrintableCompanyBlock,
  PrintableDocument,
  PrintableField,
  PrintableSection,
  PrintableSignatory,
  PrintableTable,
  PrintableTableColumn,
  PrintableTableGroup,
  PrintableTableRow,
  PrintableTotals,
} from "../../utils/documents/printableDocument";
import { formatPrintableValue } from "../../utils/documents/printableDocumentFormat";
import { FUNCTIONAL_CURRENCY } from "../../utils/accountingCurrency";
import { isPrintableValue } from "../../utils/documents/printableDocumentNormalize";

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8.5,
    color: "#111827",
    paddingTop: 32,
    paddingBottom: 100,
    paddingHorizontal: 36,
    backgroundColor: "#FFFFFF",
  },
  pageBranded: {
    fontFamily: "Helvetica",
    fontSize: 8.5,
    color: "#111827",
    paddingTop: 96,
    paddingBottom: 110,
    paddingHorizontal: 36,
    backgroundColor: "#FFFFFF",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 2.5,
    borderBottomColor: "#172A4D",
    borderBottomStyle: "solid",
  },
  brandCol: { flexDirection: "column", gap: 4, width: "47%" },
  logo: { height: 48, objectFit: "contain", objectPosition: "left" },
  addressText: { fontSize: 7.5, color: "#6B7280", lineHeight: 1.3 },
  titleCol: { flexDirection: "column", alignItems: "flex-end", width: "53%" },
  docTitle: { fontSize: 21, fontFamily: "Helvetica-Bold", color: "#172A4D", letterSpacing: 1.2, marginBottom: 4, textAlign: "right" },
  subtitle: { fontSize: 8, color: "#475467", marginBottom: 6, textAlign: "right" },
  refGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end", maxWidth: 280 },
  refItem: { flexDirection: "column", alignItems: "flex-end", width: 54, marginBottom: 3 },
  refLabel: { fontSize: 6, color: "#6B7280", textTransform: "uppercase", fontFamily: "Helvetica-Bold", letterSpacing: 0.3, textAlign: "right" },
  refValue: { fontSize: 8, color: "#111827", fontFamily: "Helvetica-Bold", marginTop: 1, textAlign: "right" },

  partyHeader: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#172A4D",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  partyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    borderBottomStyle: "dashed",
  },
  partyCell: { width: "48%", marginBottom: 3 },
  partyCellWide: { width: "100%", marginBottom: 3 },
  partyRow: { flexDirection: "row", marginBottom: 1, alignItems: "baseline" },
  partyLabel: { width: 72, fontSize: 7, color: "#6B7280", fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  partyVal: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#111827", flex: 1 },

  sectionHeader: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#172A4D",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
    marginTop: 7,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E9F0",
  },
  gridWrap: { flexDirection: "row", flexWrap: "wrap", marginBottom: 4 },
  cell: { width: "33.33%", marginBottom: 3, paddingRight: 8, flexDirection: "row", alignItems: "baseline" },
  cellWide: { width: "66.66%", marginBottom: 3, paddingRight: 8, flexDirection: "row", alignItems: "baseline" },
  cellFull: { width: "100%", marginBottom: 3, flexDirection: "row", alignItems: "baseline" },
  cellLabel: { width: 88, fontSize: 6, color: "#475467", textTransform: "uppercase", fontFamily: "Helvetica-Bold", letterSpacing: 0.2, flexShrink: 0 },
  cellValue: { fontSize: 8, fontFamily: "Helvetica", color: "#111827", marginLeft: 6, flex: 1, lineHeight: 1.24 },
  cellValueCaps: { letterSpacing: 0.4 },

  table: { marginBottom: 6 },
  tableTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#172A4D",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E9F0",
    borderBottomStyle: "solid",
    paddingBottom: 2,
    marginBottom: 5,
    marginTop: 6,
  },
  tableHeader: {
    flexDirection: "row",
    borderTopWidth: 2,
    borderTopColor: "#111827",
    borderTopStyle: "solid",
    borderBottomWidth: 2,
    borderBottomColor: "#111827",
    borderBottomStyle: "solid",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  thText: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#111827", textTransform: "uppercase", letterSpacing: 0.5 },
  catHeader: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#172A4D",
    textTransform: "uppercase",
    paddingTop: 4,
    paddingBottom: 2,
    paddingHorizontal: 4,
  },
  tableRow: { flexDirection: "row", paddingVertical: 2, paddingHorizontal: 4 },
  tableRowEmphasis: { paddingTop: 5 },
  tdText: { fontSize: 8, color: "#374151" },
  tdTextEmphasis: { fontFamily: "Helvetica-Bold", color: "#111827", textTransform: "uppercase" },
  subtotalRow: { flexDirection: "row", paddingTop: 3, paddingBottom: 6, paddingHorizontal: 4 },
  subtotalLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", textAlign: "right", paddingRight: 8 },
  subtotalVal: { fontFamily: "Helvetica-Bold", textAlign: "right", borderTopWidth: 1, borderTopColor: "#111827", borderTopStyle: "solid", paddingTop: 2 },
  emptyRow: { paddingVertical: 16, paddingHorizontal: 4 },
  emptyText: { fontSize: 8, color: "#9CA3AF", fontStyle: "italic", textAlign: "center" },

  footerGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 2,
    borderTopColor: "#111827",
    borderTopStyle: "solid",
  },
  termsCol: { width: "58%", paddingRight: 20 },
  termsHeader: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", marginBottom: 4, color: "#111827" },
  termsText: { fontSize: 7.5, color: "#4B5563", lineHeight: 1.4 },
  termsBullet: { fontSize: 7.5, color: "#4B5563", lineHeight: 1.4, marginBottom: 1 },

  totalsCol: { width: "38%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  totalLabel: { fontSize: 8.5, color: "#4B5563" },
  totalValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#111827" },
  grandTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 2,
    borderTopColor: "#111827",
    borderTopStyle: "solid",
    marginTop: 4,
    paddingTop: 5,
  },
  grandTotalLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#172A4D" },
  grandTotalValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#172A4D" },

  bankBox: { marginTop: 8, paddingTop: 3 },
  bankGrid: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
  bankItem: { flexDirection: "column", gap: 1 },
  bankLabel: { fontSize: 7, color: "#6B7280" },
  bankValue: { fontSize: 8, color: "#111827", fontFamily: "Helvetica-Bold" },

  sigGrid: { flexDirection: "row", justifyContent: "space-between", gap: 20, marginTop: 18, minHeight: 56 },
  sigBox: { flexDirection: "column", flex: 1 },
  sigAction: { fontSize: 7, color: "#6B7280", fontStyle: "italic", marginBottom: 18 },
  sigLine: { borderBottomWidth: 1, borderBottomColor: "#111827", borderBottomStyle: "solid", marginBottom: 5 },
  sigName: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#111827", textTransform: "uppercase" },
  sigTitle: { fontSize: 7, color: "#4B5563" },

  contactFooter: {
    position: "absolute",
    left: 36,
    right: 36,
    bottom: 36,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: "#172A4D",
    borderTopStyle: "solid",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 18,
  },
  refBar: { flexDirection: "row", justifyContent: "flex-end", gap: 16, marginBottom: 4 },
  refBarItem: { flexDirection: "row", alignItems: "baseline" },
  refBarLabel: { fontSize: 6.5, color: "#6B7280", fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  refBarValue: { fontSize: 7.5, color: "#111827", fontFamily: "Helvetica-Bold" },
  continuationHeader: {
    position: "absolute",
    top: 92,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E5E9F0",
    borderBottomStyle: "solid",
  },
  continuationTitle: { fontSize: 7, color: "#6B7280", fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  continuationPage: { fontSize: 6.5, color: "#9CA3AF" },

  brandedHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 88,
    overflow: "hidden",
  },
  brandedHeaderImg: {
    width: "100%",
  },
  brandedFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 82,
    overflow: "hidden",
  },
  brandedFooterImg: {
    width: "100%",
    marginTop: -760,
  },
  contactCol: { flexDirection: "column" },
  contactLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#172A4D", marginBottom: 3 },
  contactText: { fontSize: 7.5, color: "#111827", lineHeight: 1.4 },

  pageFooter: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pageFooterText: { fontSize: 6.5, color: "#9CA3AF" },

  stackText: { fontSize: 7.5, color: "#4B5563", lineHeight: 1.4 },

  postTableBlock: {
    marginTop: 8,
    marginBottom: 4,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: "#111827",
    borderTopStyle: "solid",
  },
  postTableTitle: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: "#172A4D",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 5,
  },
  postTableText: {
    fontSize: 7.5,
    color: "#4B5563",
    lineHeight: 1.4,
    marginBottom: 1,
  },
});

function widthStyle(width?: PrintableField["width"]) {
  if (width === "full") return s.cellFull;
  if (width === "wide") return s.cellWide;
  return s.cell;
}

function HeaderBlock({ company, title, subtitle, headerFields }: {
  company?: PrintableCompanyBlock;
  title: string;
  subtitle?: string;
  headerFields: PrintableField[];
}) {
  const logoSrc = company?.logoUrl || company?.fallbackLogo;
  return (
    <View style={s.header}>
      <View style={s.brandCol}>
        {logoSrc ? <Image src={logoSrc} style={s.logo} /> : null}
      </View>
      <View style={s.titleCol}>
        <Text style={s.docTitle}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        <View style={s.refGrid}>
          {headerFields.map((f) => {
            const formatted = formatPrintableValue(f.value, f.format, f.currency);
            if (!formatted) return null;
            return (
              <View style={s.refItem} key={f.id}>
                <Text style={s.refLabel}>{f.label}</Text>
                <Text style={s.refValue}>{formatted}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function PartySection({ section }: { section: PrintableSection }) {
  if (section.fields.length === 0) return null;
  return (
    <>
      {section.title ? <Text style={s.partyHeader}>{section.title.toUpperCase()}:</Text> : null}
      <View style={s.partyGrid}>
        {section.fields.map((f) => {
          const formatted = formatPrintableValue(f.value, f.format, f.currency);
          if (!formatted) return null;
          const cellStyle = f.width === "full" ? s.partyCellWide : s.partyCell;
          return (
            <View style={cellStyle} key={f.id}>
              <View style={s.partyRow}>
                <Text style={s.partyLabel}>{f.label}:</Text>
                <Text style={s.partyVal}>{formatted}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </>
  );
}

function GridSection({ section }: { section: PrintableSection }) {
  if (section.fields.length === 0) return null;
  return (
    <>
      {section.title ? <Text style={s.sectionHeader}>{section.title.toUpperCase()}</Text> : null}
      <View style={s.gridWrap}>
        {section.fields.map((f) => {
          const formatted = formatPrintableValue(f.value, f.format, f.currency);
          if (!formatted) return null;
          const isAllCaps = /[A-Za-z]/.test(formatted) && formatted === formatted.toUpperCase();
          return (
            <View style={widthStyle(f.width)} key={f.id}>
              <Text style={s.cellLabel}>{f.label}</Text>
              <Text style={isAllCaps ? [s.cellValue, s.cellValueCaps] : s.cellValue}>{formatted}</Text>
            </View>
          );
        })}
      </View>
    </>
  );
}

function StackSection({ section }: { section: PrintableSection }) {
  if (section.fields.length === 0) return null;
  return (
    <>
      {section.title ? <Text style={s.sectionHeader}>{section.title.toUpperCase()}</Text> : null}
      {section.fields.map((f) => {
        if (Array.isArray(f.value)) {
          return (f.value as string[]).map((v, i) => (
            <Text key={`${f.id}-${i}`} style={s.termsBullet}>{`• ${v}`}</Text>
          ));
        }
        const formatted = formatPrintableValue(f.value, f.format);
        if (!formatted) return null;
        return (
          <Text key={f.id} style={s.stackText}>
            {formatted}
          </Text>
        );
      })}
    </>
  );
}

function PostTableSectionBlock({ section }: { section: PrintableSection }) {
  if (section.fields.length === 0) return null;
  return (
    <View style={s.postTableBlock} minPresenceAhead={80}>
      {section.title ? <Text style={s.postTableTitle}>{section.title.toUpperCase()}</Text> : null}
      {section.fields.map((f) => {
        if (Array.isArray(f.value)) {
          return (f.value as string[]).map((v, i) => (
            <Text key={`${f.id}-${i}`} style={s.postTableText}>{v}</Text>
          ));
        }
        const formatted = formatPrintableValue(f.value, f.format);
        if (!formatted) return null;
        return (
          <Text key={f.id} style={s.postTableText}>{formatted}</Text>
        );
      })}
    </View>
  );
}

function SectionBlock({ section }: { section: PrintableSection }) {
  if (section.layout === "two-column") return <PartySection section={section} />;
  if (section.layout === "stack") return <StackSection section={section} />;
  return <GridSection section={section} />;
}

function colFlex(col: PrintableTableColumn): number {
  // Convert widthHint percent to a flex value; default 1
  if (!col.widthHint) return 1;
  const match = col.widthHint.match(/(\d+(?:\.\d+)?)%/);
  if (match) return parseFloat(match[1]);
  return 1;
}

function TableBlock({ table }: { table: PrintableTable }) {
  const totalFlex = table.columns.reduce((a, c) => a + colFlex(c), 0) || 1;
  const colStyle = (c: PrintableTableColumn) => ({
    width: `${(colFlex(c) / totalFlex) * 100}%`,
    textAlign: (c.align || "left") as any,
  });

  if (table.rows.length === 0) {
    if (table.hideWhenEmpty !== false) return null;
    return (
      <View style={s.table}>
        <View style={s.emptyRow}>
          <Text style={s.emptyText}>{table.emptyMessage || ""}</Text>
        </View>
      </View>
    );
  }

  const groups = table.groups || [];
  const grouped: Array<{ group: PrintableTableGroup | null; rows: PrintableTableRow[] }> =
    groups.length > 0
      ? groups.map((g) => ({ group: g, rows: table.rows.filter((r) => r.groupId === g.id) }))
      : [{ group: null, rows: table.rows }];

  return (
    <View style={s.table}>
      {table.title ? <Text style={s.tableTitle}>{table.title.toUpperCase()}</Text> : null}
      <View style={s.tableHeader}>
        {table.columns.map((c) => (
          <Text key={c.id} style={[s.thText, colStyle(c)]}>{c.label}</Text>
        ))}
      </View>
      {grouped.map(({ group, rows }) => (
        <View key={group?.id || "g0"} minPresenceAhead={42}>
          {group ? <Text style={s.catHeader}>{group.title}</Text> : null}
          {rows.map((row) => (
            <View
              key={row.id}
              style={[s.tableRow, row.emphasis === "subtotal" ? s.tableRowEmphasis : null]}
              wrap={false}
            >
              {table.columns.map((c, ci) => {
                const raw = row.cells[c.id];
                // NEU-032 (Option B): per-line money cells show the number only — the
                // currency lives in the "Cur" column and the symbol appears at the
                // subtotal/grand total, not on every line.
                const cellCurrency = undefined;
                const formatted = formatPrintableValue(raw, c.format, cellCurrency);
                const showSubtext = ci === 0 && row.subtext && row.emphasis !== "subtotal";
                return showSubtext ? (
                  <View key={c.id} style={colStyle(c)}>
                    <Text style={[s.tdText, row.emphasis === "subtotal" ? s.tdTextEmphasis : null]}>
                      {formatted}
                    </Text>
                    <Text style={{ fontSize: 7, color: "#667085", fontStyle: "italic", marginTop: 1 }}>
                      {row.subtext}
                    </Text>
                  </View>
                ) : (
                  <Text
                    key={c.id}
                    style={[s.tdText, row.emphasis === "subtotal" ? s.tdTextEmphasis : null, colStyle(c)]}
                  >
                    {formatted}
                  </Text>
                );
              })}
            </View>
          ))}
          {group?.subtotal ? (
            <View style={s.subtotalRow} wrap={false}>
              <Text style={[{ width: "82%" }, s.subtotalLabel]}>
                {String(group.subtotal.cells["description"] || "Subtotal").toUpperCase()}
              </Text>
              <View style={{ width: "18%" }}>
                <Text style={[s.subtotalVal, s.tdText]}>
                  {formatPrintableValue(group.subtotal.cells["amount"], "money", String(group.subtotal.cells["currency"] || "") || undefined)}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function TotalsBlock({ totals }: { totals?: PrintableTotals }) {
  if (!totals) return null;
  return (
    <View style={s.totalsCol}>
      {totals.rows.map((row) => {
        const formatted = formatPrintableValue(row.value, row.format || "money", row.currency);
        return (
          <View style={s.totalRow} key={row.id}>
            <Text style={s.totalLabel}>{row.label}</Text>
            <Text style={s.totalValue}>{formatted}</Text>
          </View>
        );
      })}
      {totals.grandTotal ? (
        <View style={s.grandTotal}>
          <Text style={s.grandTotalLabel}>{totals.grandTotal.label}</Text>
          <Text style={s.grandTotalValue}>
            {formatPrintableValue(totals.grandTotal.value, totals.grandTotal.format || "money", totals.grandTotal.currency)}
          </Text>
        </View>
      ) : null}
      {totals.convertedTotal ? (
        <Text style={{ fontSize: 8, color: "#667085", marginTop: 2, textAlign: "right" }}>
          {"≈ " + formatPrintableValue(totals.convertedTotal.value, "money", totals.convertedTotal.currency)}
        </Text>
      ) : null}
      {(totals.conversions || []).map((c) => (
        <Text key={c.currency} style={{ fontSize: 8, color: "#667085", marginTop: 2, textAlign: "right" }}>
          {`incl. ${c.currency} ${formatPrintableValue(c.originalAmount, "money")} ≈ ${formatPrintableValue(c.phpAmount, "money", FUNCTIONAL_CURRENCY)} @ ${formatPrintableValue(c.rate, "money", FUNCTIONAL_CURRENCY)}`}
        </Text>
      ))}
    </View>
  );
}

function Signatories({ list }: { list: PrintableSignatory[] }) {
  if (list.length === 0) return null;
  return (
    <View style={s.sigGrid} wrap={false} minPresenceAhead={90}>
      {list.map((sig) => (
        <View key={sig.id} style={s.sigBox}>
          <Text style={s.sigAction}>{sig.label}:</Text>
          <View style={s.sigLine} />
          <Text style={s.sigName}>{isPrintableValue(sig.name) ? sig.name : " "}</Text>
          {isPrintableValue(sig.title) ? <Text style={s.sigTitle}>{sig.title}</Text> : null}
        </View>
      ))}
    </View>
  );
}

interface PrintableDocumentPdfProps {
  document: PrintableDocument;
}

export function PrintableDocumentPdf({ document: doc }: PrintableDocumentPdfProps) {
  const pageFooter = doc.pageFooterText;
  const refLabel = doc.headerFields.map((f) => {
    const formatted = formatPrintableValue(f.value, f.format, f.currency);
    return formatted ? `${f.label}: ${formatted}` : "";
  }).filter(Boolean).join("  ·  ");

  return (
    <Document title={doc.title} author="Neuron OS">
      <Page size="A4" style={doc.brandedHeaderImage ? s.pageBranded : s.page}>
        {doc.brandedHeaderImage ? (
          <>
            {/* Branded header — repeats on every page as letterhead */}
            <View style={s.brandedHeader} fixed>
              <Image src={doc.brandedHeaderImage} style={s.brandedHeaderImg} />
            </View>
            {/* Continuation ref bar — visible on pages 2+ below the header */}
            <View style={s.continuationHeader} fixed>
              <Text style={s.continuationTitle} render={({ pageNumber }) =>
                pageNumber > 1 ? `${doc.title}${refLabel ? `  —  ${refLabel}` : ""}` : ""
              } />
              <Text style={s.continuationPage} render={({ pageNumber, totalPages }) =>
                pageNumber > 1 ? `Page ${pageNumber} of ${totalPages}` : ""
              } />
            </View>
            {doc.headerFields.length > 0 ? (
              <View style={s.refBar}>
                {doc.headerFields.map((f) => {
                  const formatted = formatPrintableValue(f.value, f.format, f.currency);
                  if (!formatted) return null;
                  return (
                    <View key={f.id} style={s.refBarItem}>
                      <Text style={s.refBarLabel}>{f.label}: </Text>
                      <Text style={s.refBarValue}>{formatted}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </>
        ) : (
          <HeaderBlock
            company={doc.company}
            title={doc.title}
            subtitle={doc.subtitle}
            headerFields={doc.headerFields}
          />
        )}

        {doc.partySections.map((sec) => (
          <SectionBlock key={sec.id} section={sec} />
        ))}

        {doc.sections.map((sec) => (
          <SectionBlock key={sec.id} section={sec} />
        ))}

        {doc.tables.map((t) => (
          <TableBlock key={t.id} table={t} />
        ))}

        {doc.postTableSections?.map((sec) => (
          <PostTableSectionBlock key={sec.id} section={sec} />
        ))}

        {(doc.notes.length > 0 || doc.bank || doc.totals) && (
          <View style={s.footerGrid} wrap={false}>
            <View style={s.termsCol}>
              {doc.notes.map((n) => (
                <View key={n.id} style={{ marginBottom: 8 }}>
                  {n.title ? <Text style={s.termsHeader}>{n.title.toUpperCase()}</Text> : null}
                  {n.fields.map((f) => {
                    if (Array.isArray(f.value)) {
                      return (f.value as string[]).map((v, i) => (
                        <Text key={`${f.id}-${i}`} style={s.termsBullet}>{`• ${v}`}</Text>
                      ));
                    }
                    const formatted = formatPrintableValue(f.value, f.format);
                    if (!formatted) return null;
                    return (
                      <Text key={f.id} style={s.termsText}>
                        {formatted}
                      </Text>
                    );
                  })}
                </View>
              ))}
              {doc.bank ? (
                <View style={s.bankBox}>
                  <Text style={s.termsHeader}>BANK DETAILS</Text>
                  <View style={s.bankGrid}>
                    {doc.bank.bankName ? (
                      <View style={s.bankItem}>
                        <Text style={s.bankLabel}>Bank</Text>
                        <Text style={s.bankValue}>{doc.bank.bankName}</Text>
                      </View>
                    ) : null}
                    {doc.bank.accountName ? (
                      <View style={s.bankItem}>
                        <Text style={s.bankLabel}>Acct Name</Text>
                        <Text style={s.bankValue}>{doc.bank.accountName}</Text>
                      </View>
                    ) : null}
                    {doc.bank.accountNumber ? (
                      <View style={s.bankItem}>
                        <Text style={s.bankLabel}>Acct No</Text>
                        <Text style={s.bankValue}>{doc.bank.accountNumber}</Text>
                      </View>
                    ) : null}
                    {doc.bank.swift ? (
                      <View style={s.bankItem}>
                        <Text style={s.bankLabel}>SWIFT</Text>
                        <Text style={s.bankValue}>{doc.bank.swift}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>
            <TotalsBlock totals={doc.totals} />
          </View>
        )}

        <Signatories list={doc.signatories} />

        {doc.options.showContactFooter && doc.brandedFooterImage ? (
          <View style={s.brandedFooter} fixed>
            <Image src={doc.brandedFooterImage} style={s.brandedFooterImg} />
          </View>
        ) : doc.options.showContactFooter && doc.contactFooter ? (
          <View style={s.contactFooter} fixed>
            {doc.contactFooter.callNumbers.length > 0 ? (
              <View style={s.contactCol}>
                <Text style={s.contactLabel}>Call</Text>
                {doc.contactFooter.callNumbers.map((p, i) => (
                  <Text key={i} style={s.contactText}>{p}</Text>
                ))}
              </View>
            ) : null}
            {doc.contactFooter.emails.length > 0 ? (
              <View style={s.contactCol}>
                <Text style={s.contactLabel}>Message</Text>
                {doc.contactFooter.emails.map((e, i) => (
                  <Text key={i} style={s.contactText}>{e}</Text>
                ))}
              </View>
            ) : null}
            {doc.contactFooter.addressLines.length > 0 ? (
              <View style={[s.contactCol, { width: "40%" }]}>
                <Text style={s.contactLabel}>Office Address</Text>
                <Text style={s.contactText}>
                  {doc.contactFooter.addressLines.join("\n")}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={s.pageFooter} fixed>
          <Text style={s.pageFooterText}>{pageFooter || ""}</Text>
          <Text
            style={s.pageFooterText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
          <Text style={s.pageFooterText}>Generated by Neuron OS</Text>
        </View>
      </Page>
    </Document>
  );
}
