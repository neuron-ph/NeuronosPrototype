import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import type { QuotationNew, QuotationChargeCategory, FinancialSummary, AddressStruct } from "../../types/pricing";
import type { QuotationPrintOptions } from "../projects/quotation/screen/useQuotationDocumentState";
import type { CompanySettings } from "../../hooks/useCompanySettings";
import logoImage from "figma:asset/28c84ed117b026fbf800de0882eb478561f37f4f.png";

// ─── Props ──────────────────────────────────────────────────────────────────

interface QuotationPDFDocumentProps {
  quotation: QuotationNew;
  options: QuotationPrintOptions;
  companySettings: CompanySettings;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8.5,
    color: "#111827",
    paddingTop: 32,
    paddingBottom: 48,
    paddingHorizontal: 36,
    backgroundColor: "#FFFFFF",
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 2.5,
    borderBottomColor: "#12332B",
    borderBottomStyle: "solid",
  },
  brandCol: { flexDirection: "column", gap: 4, width: "50%" },
  logo: { height: 32, objectFit: "contain", objectPosition: "left" },
  addressText: { fontSize: 7.5, color: "#6B7280", lineHeight: 1.3 },

  titleCol: { flexDirection: "column", alignItems: "flex-end", width: "50%" },
  docTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#12332B", letterSpacing: 1.5, marginBottom: 4 },
  quoteName: { fontSize: 8, color: "#475467", marginBottom: 6, textAlign: "right" },
  refGrid: { flexDirection: "row", gap: 20 },
  refItem: { flexDirection: "column", alignItems: "flex-end" },
  refLabel: { fontSize: 6.5, color: "#6B7280", textTransform: "uppercase", fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  refValue: { fontSize: 9, color: "#111827", fontFamily: "Helvetica-Bold", marginTop: 1 },

  // Customer section
  sectionHeader: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#0F766E",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  customerGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    borderBottomStyle: "dashed",
  },
  customerCol: { width: "48%" },
  custRow: { flexDirection: "row", marginBottom: 2, alignItems: "baseline" },
  custLabel: { width: 80, fontSize: 7, color: "#6B7280", fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  custVal: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#111827" },

  // Shipment Details
  shipHeader: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#12332B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E9F0",
    borderBottomStyle: "solid",
    paddingBottom: 4,
    marginBottom: 8,
    marginTop: 12,
  },
  shipGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 16 },
  shipCell: { width: "25%", marginBottom: 8 },
  shipCellWide: { width: "50%", marginBottom: 8 },
  shipCellFull: { width: "100%", marginBottom: 8 },
  shipLabel: { fontSize: 6.5, color: "#6B7280", textTransform: "uppercase", fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  shipValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#111827", marginTop: 1, lineHeight: 1.3 },

  // Rate Table
  table: { marginBottom: 12 },
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
    color: "#12332B",
    textTransform: "uppercase",
    paddingTop: 6,
    paddingBottom: 3,
    paddingHorizontal: 4,
  },
  tableRow: { flexDirection: "row", paddingVertical: 2, paddingHorizontal: 4 },
  tdText: { fontSize: 8, color: "#374151" },
  subtotalRow: {
    flexDirection: "row",
    paddingTop: 3,
    paddingBottom: 6,
    paddingHorizontal: 4,
  },
  subtotalLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    textAlign: "right",
    paddingRight: 8,
  },
  subtotalVal: {
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    borderTopWidth: 1,
    borderTopColor: "#111827",
    borderTopStyle: "solid",
    paddingTop: 2,
  },

  // Column widths (6 columns: desc, price, cur, qty, remarks, amount)
  colDesc: { width: "35%" },
  colPrice: { width: "13%", textAlign: "right" },
  colCur: { width: "8%", textAlign: "center" },
  colQty: { width: "8%", textAlign: "center" },
  colRemarks: { width: "18%" },
  colAmt: { width: "18%", textAlign: "right" },

  emptyRow: { paddingVertical: 16, textAlign: "center" },
  emptyText: { fontSize: 8, color: "#9CA3AF", fontStyle: "italic" },

  // Footer / Totals
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
  grandTotalLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#12332B" },
  grandTotalValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#12332B" },

  // Payment terms
  paymentLine: { fontSize: 8, color: "#111827", marginTop: 4 },

  // Bank details
  bankBox: { marginTop: 12, paddingTop: 4 },
  bankGrid: { flexDirection: "row", gap: 16 },
  bankItem: { flexDirection: "column", gap: 1 },
  bankLabel: { fontSize: 7, color: "#6B7280" },
  bankValue: { fontSize: 8, color: "#111827" },

  // Signatories
  sigGrid: { flexDirection: "row", justifyContent: "space-between", gap: 24, marginTop: 28 },
  sigBox: { flexDirection: "column", flex: 1 },
  sigAction: { fontSize: 7, color: "#6B7280", fontStyle: "italic", marginBottom: 28 },
  sigLine: { borderBottomWidth: 1, borderBottomColor: "#111827", borderBottomStyle: "solid", marginBottom: 6 },
  sigName: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#111827", textTransform: "uppercase" },
  sigTitle: { fontSize: 7, color: "#4B5563" },

  // Contact Footer
  contactFooter: {
    marginTop: 28,
    paddingTop: 12,
    borderTopWidth: 2.5,
    borderTopColor: "#12332B",
    borderTopStyle: "solid",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  contactCol: { flexDirection: "column" },
  contactLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#12332B", marginBottom: 3 },
  contactText: { fontSize: 7.5, color: "#111827", lineHeight: 1.4 },

  // Page footer
  pageFooter: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pageFooterText: { fontSize: 6.5, color: "#9CA3AF" },
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtMoney(val?: number, currency = "PHP"): string {
  if (val === undefined || val === null) return "0.00";
  const sym = currency === "PHP" ? "PHP " : currency === "USD" ? "USD " : `${currency} `;
  return `${sym}${val.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(val?: string): string {
  if (!val) return "—";
  return new Date(val).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function t(val: any, fallback = "—"): string {
  if (val === 0) return "0";
  return val || fallback;
}

function fmtWeight(val?: number): string {
  return val ? `${val} kg` : "—";
}

function fmtAddress(addr: string | AddressStruct | undefined): string {
  if (!addr) return "—";
  if (typeof addr === "string") return addr;
  return [addr.address, addr.city, addr.province, addr.country, addr.postal_code].filter(Boolean).join(", ");
}

function effectiveItemAmt(item: any): number {
  if (item.amount !== undefined && item.amount !== null && item.amount !== 0) return Number(item.amount);
  const unitPrice = item.final_price ?? item.price ?? 0;
  return Number(unitPrice) * Number(item.quantity || 1) * Number(item.forex_rate || 1);
}

function calcSummary(categories: QuotationChargeCategory[], existing?: FinancialSummary): FinancialSummary {
  if (existing && existing.grand_total > 0) return existing;

  let taxable = 0;
  let nonTaxable = 0;
  categories.forEach((cat) => {
    cat.line_items?.forEach((item) => {
      const amt = effectiveItemAmt(item);
      if (item.is_taxed) taxable += amt;
      else nonTaxable += amt;
    });
  });
  const taxAmt = taxable * 0.12;
  return {
    subtotal_non_taxed: nonTaxable,
    subtotal_taxed: taxable,
    tax_rate: 0.12,
    tax_amount: taxAmt,
    other_charges: 0,
    grand_total: nonTaxable + taxable + taxAmt,
  };
}

// ─── Document Component ─────────────────────────────────────────────────────

export function QuotationPDFDocument({ quotation, options, companySettings }: QuotationPDFDocumentProps) {
  const cs = companySettings;
  const q = quotation;
  const legacy = q as any;
  // Prefer selling_price (dual-section pricing) over legacy charge_categories
  const categories: QuotationChargeCategory[] =
    ((q as any).selling_price?.length ? (q as any).selling_price : null) ??
    (q.charge_categories?.length ? q.charge_categories : null) ??
    [];
  const summary = calcSummary(categories, q.financial_summary);
  const currency = q.currency || "PHP";

  // Resolved signatory values — never fall back to created_by (it is a raw auth UUID)
  const preparedBy = options.signatories.prepared_by.name || q.prepared_by || legacy?.pdf_prepared_by || "System User";
  const preparedByTitle = options.signatories.prepared_by.title || q.prepared_by_title || legacy?.pdf_prepared_by_title || "Sales Representative";
  const approvedBy = options.signatories.approved_by.name || q.approved_by || legacy?.pdf_approved_by || "Management";
  const approvedByTitle = options.signatories.approved_by.title || q.approved_by_title || legacy?.pdf_approved_by_title || "Authorized Signatory";

  // Resolved addressed-to
  const addressedName = options.addressed_to.name || legacy?.pdf_addressed_to_name || q.contact_person_name || "";
  const addressedTitle = options.addressed_to.title || legacy?.pdf_addressed_to_title || "";

  // Resolved validity
  const validUntil = options.validity_override || q.valid_until;

  const showBank = options.display.show_bank_details;
  const showTax = options.display.show_tax_summary;
  const customNotes = options.custom_notes;
  const paymentTerms = options.payment_terms;

  // Full company address
  const companyAddr = [cs.address_line1, cs.address_line2, cs.city, cs.country].filter(Boolean).join(", ");

  // Default terms
  const defaultTerms = [
    "Customer will be billed after indicating acceptance of this quote.",
    "Please mail the signed price quote to the address above.",
    "5% percent of the freight and the brokerage charges are both subject to 12% VAT.",
    "Rates are subject to change without prior notice.",
  ];

  return (
    <Document title={`Quotation ${q.quote_number || ""}`} author="Neuron OS">
      <Page size="A4" style={s.page}>

        {/* ── ZONE A: Header ── */}
        <View style={s.header}>
          <View style={s.brandCol}>
            {cs.logo_url ? (
              <Image src={cs.logo_url} style={s.logo} />
            ) : (
              <Image src={logoImage} style={s.logo} />
            )}
            <Text style={s.addressText}>
              {companyAddr}
              {cs.phone_numbers?.[0] ? `\n${cs.phone_numbers[0]}` : ""}
              {cs.email ? ` | ${cs.email}` : ""}
            </Text>
          </View>

          <View style={s.titleCol}>
            <Text style={s.docTitle}>QUOTATION</Text>
            {q.quotation_name ? <Text style={s.quoteName}>{q.quotation_name}</Text> : null}
            <View style={s.refGrid}>
              <View style={s.refItem}>
                <Text style={s.refLabel}>Reference No.</Text>
                <Text style={s.refValue}>{t(q.quote_number)}</Text>
              </View>
              <View style={s.refItem}>
                <Text style={s.refLabel}>Date Issued</Text>
                <Text style={s.refValue}>{fmtDate(q.created_date || q.created_at)}</Text>
              </View>
              <View style={s.refItem}>
                <Text style={s.refLabel}>Valid Until</Text>
                <Text style={s.refValue}>{fmtDate(validUntil) || "30 Days"}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── ZONE B: Prepared For ── */}
        <Text style={s.sectionHeader}>PREPARED FOR:</Text>
        <View style={s.customerGrid}>
          <View style={s.customerCol}>
            <View style={s.custRow}>
              <Text style={s.custLabel}>Customer:</Text>
              <Text style={s.custVal}>{t(q.customer_name)}</Text>
            </View>
            {addressedName ? (
              <View style={s.custRow}>
                <Text style={s.custLabel}>Attention:</Text>
                <Text style={s.custVal}>{addressedName}</Text>
              </View>
            ) : null}
            {addressedTitle ? (
              <View style={s.custRow}>
                <Text style={s.custLabel}>Position:</Text>
                <Text style={s.custVal}>{addressedTitle}</Text>
              </View>
            ) : null}
          </View>
          <View style={s.customerCol}>
            <View style={s.custRow}>
              <Text style={s.custLabel}>Company:</Text>
              <Text style={s.custVal}>{t(q.customer_company || q.customer_organization || q.customer_name)}</Text>
            </View>
          </View>
        </View>

        {/* ── ZONE C: Shipment Details ── */}
        <Text style={s.shipHeader}>SHIPMENT DETAILS</Text>
        <View style={s.shipGrid}>
          {/* Row 1 */}
          <View style={s.shipCell}>
            <Text style={s.shipLabel}>Movement</Text>
            <Text style={s.shipValue}>{t(q.movement)}</Text>
          </View>
          <View style={s.shipCell}>
            <Text style={s.shipLabel}>Category</Text>
            <Text style={s.shipValue}>{t(q.category)}</Text>
          </View>
          <View style={s.shipCell}>
            <Text style={s.shipLabel}>Freight Type</Text>
            <Text style={s.shipValue}>{t(q.shipment_freight)}</Text>
          </View>
          <View style={s.shipCell}>
            <Text style={s.shipLabel}>Services</Text>
            <Text style={s.shipValue}>{t(q.services?.join(", "))}</Text>
          </View>

          {/* Row 2 */}
          <View style={s.shipCell}>
            <Text style={s.shipLabel}>Incoterm</Text>
            <Text style={s.shipValue}>{t(q.incoterm)}</Text>
          </View>
          <View style={s.shipCell}>
            <Text style={s.shipLabel}>Carrier</Text>
            <Text style={s.shipValue}>{t(q.carrier, "TBA")}</Text>
          </View>
          <View style={s.shipCell}>
            <Text style={s.shipLabel}>Transit & Routing</Text>
            <Text style={s.shipValue}>{t(
              q.transit_time
                ? `${q.transit_time} ${q.routing_info || ""}`.trim()
                : (q as any).transit_days
                  ? `${(q as any).transit_days} days ${q.routing_info || ""}`.trim()
                  : q.routing_info
            )}</Text>
          </View>
          <View style={s.shipCell}>
            <Text style={s.shipLabel}>Commodity</Text>
            <Text style={s.shipValue}>{t(q.commodity)}</Text>
          </View>

          {/* Row 3 */}
          <View style={s.shipCell}>
            <Text style={s.shipLabel}>Gross Weight</Text>
            <Text style={s.shipValue}>{fmtWeight(q.gross_weight)}</Text>
          </View>
          <View style={s.shipCell}>
            <Text style={s.shipLabel}>Chg. Weight</Text>
            <Text style={s.shipValue}>{fmtWeight(q.chargeable_weight)}</Text>
          </View>
          <View style={s.shipCell}>
            <Text style={s.shipLabel}>Dims</Text>
            <Text style={s.shipValue}>{t(q.dimensions)}</Text>
          </View>
          <View style={s.shipCell}>
            <Text style={s.shipLabel}>Volume</Text>
            <Text style={s.shipValue}>{t(q.volume)}</Text>
          </View>

          {/* Row 4 */}
          <View style={s.shipCellWide}>
            <Text style={s.shipLabel}>Port of Loading</Text>
            <Text style={s.shipValue}>{t(q.pol_aol)}</Text>
          </View>
          <View style={s.shipCellWide}>
            <Text style={s.shipLabel}>Port of Discharge</Text>
            <Text style={s.shipValue}>{t(q.pod_aod)}</Text>
          </View>

          {/* Row 5 */}
          <View style={s.shipCellFull}>
            <Text style={s.shipLabel}>Collection Address</Text>
            <Text style={{ ...s.shipValue, fontFamily: "Helvetica" }}>
              {fmtAddress(q.collection_address || q.pickup_address)}
            </Text>
          </View>
        </View>

        {/* ── ZONE D: Rate Table ── */}
        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={[s.colDesc, s.thText]}>Description</Text>
            <Text style={[s.colPrice, s.thText, { textAlign: "right" }]}>Price</Text>
            <Text style={[s.colCur, s.thText, { textAlign: "center" }]}>Cur</Text>
            <Text style={[s.colQty, s.thText, { textAlign: "center" }]}>Qty</Text>
            <Text style={[s.colRemarks, s.thText]}>Remarks</Text>
            <Text style={[s.colAmt, s.thText, { textAlign: "right" }]}>Amount</Text>
          </View>

          {categories.length > 0 ? (
            categories.map((cat, catIdx) => {
              // Recompute subtotal when stored value is 0 or missing
              const catSubtotal = (cat.subtotal && cat.subtotal > 0)
                ? cat.subtotal
                : (cat.line_items || []).reduce((sum, item) => sum + effectiveItemAmt(item), 0);
              return (
                <View key={cat.id || catIdx}>
                  {/* Category Header */}
                  <Text style={s.catHeader}>{cat.category_name}</Text>

                  {/* Line Items */}
                  {cat.line_items?.map((item, itemIdx) => (
                    <View key={(item as any).id || itemIdx} style={s.tableRow} wrap={false}>
                      <Text style={[s.colDesc, s.tdText]}>{(item as any).description}</Text>
                      <Text style={[s.colPrice, s.tdText, { textAlign: "right" }]}>
                        {val((item as any).final_price ?? item.price)}
                      </Text>
                      <Text style={[s.colCur, s.tdText, { textAlign: "center" }]}>{item.currency}</Text>
                      <Text style={[s.colQty, s.tdText, { textAlign: "center" }]}>{item.quantity}</Text>
                      <Text style={[s.colRemarks, s.tdText]}>{(item as any).remarks || (item as any).unit || ""}</Text>
                      <Text style={[s.colAmt, s.tdText, { textAlign: "right", fontFamily: "Helvetica-Bold" }]}>
                        {val(effectiveItemAmt(item))}
                      </Text>
                    </View>
                  ))}

                  {/* Category Subtotal */}
                  <View style={s.subtotalRow}>
                    <Text style={[{ width: "82%" }, s.subtotalLabel]}>Subtotal</Text>
                    <Text style={[{ width: "18%" }, s.subtotalVal, s.tdText]}>{val(catSubtotal)}</Text>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={s.emptyRow}>
              <Text style={s.emptyText}>No charges added to this quotation.</Text>
            </View>
          )}
        </View>

        {/* ── ZONE E: Footer & Totals ── */}
        <View style={s.footerGrid}>
          {/* Left: Terms */}
          <View style={s.termsCol}>
            <Text style={s.termsHeader}>TERMS AND CONDITIONS</Text>
            {customNotes ? (
              <Text style={s.termsText}>{customNotes}</Text>
            ) : (
              defaultTerms.map((term, i) => (
                <Text key={i} style={s.termsBullet}>{"• "}{term}</Text>
              ))
            )}

            {/* Bank Details */}
            {showBank && cs.bank_name ? (
              <View style={s.bankBox}>
                <Text style={s.termsHeader}>BANK DETAILS</Text>
                <View style={s.bankGrid}>
                  <View style={s.bankItem}>
                    <Text style={s.bankLabel}>Bank</Text>
                    <Text style={[s.bankValue, { fontFamily: "Helvetica-Bold" }]}>{cs.bank_name}</Text>
                  </View>
                  <View style={s.bankItem}>
                    <Text style={s.bankLabel}>Acct Name</Text>
                    <Text style={[s.bankValue, { fontFamily: "Helvetica-Bold" }]}>{cs.bank_account_name}</Text>
                  </View>
                  <View style={s.bankItem}>
                    <Text style={s.bankLabel}>Acct No</Text>
                    <Text style={[s.bankValue, { fontFamily: "Helvetica-Bold" }]}>{cs.bank_account_number}</Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>

          {/* Right: Totals */}
          <View style={s.totalsCol}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Subtotal</Text>
              <Text style={s.totalValue}>{fmtMoney(summary.subtotal_non_taxed + summary.subtotal_taxed, currency)}</Text>
            </View>

            {showTax ? (
              <>
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>Taxable</Text>
                  <Text style={s.totalValue}>{fmtMoney(summary.subtotal_taxed, currency)}</Text>
                </View>
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>Tax rate</Text>
                  <Text style={s.totalValue}>{(summary.tax_rate * 100).toFixed(2)}%</Text>
                </View>
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>Tax due</Text>
                  <Text style={s.totalValue}>{fmtMoney(summary.tax_amount, currency)}</Text>
                </View>
              </>
            ) : null}

            {summary.other_charges > 0 ? (
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Other</Text>
                <Text style={s.totalValue}>{fmtMoney(summary.other_charges, currency)}</Text>
              </View>
            ) : null}

            <View style={s.grandTotal}>
              <Text style={s.grandTotalLabel}>TOTAL</Text>
              <Text style={s.grandTotalValue}>{fmtMoney(summary.grand_total, currency)}</Text>
            </View>

            {paymentTerms ? (
              <Text style={s.paymentLine}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>Payment Terms: </Text>
                {paymentTerms}
              </Text>
            ) : null}
          </View>
        </View>

        {/* ── ZONE F: Signatories ── */}
        <View style={s.sigGrid}>
          <View style={s.sigBox}>
            <Text style={s.sigAction}>Prepared by:</Text>
            <View style={s.sigLine} />
            <Text style={s.sigName}>{preparedBy}</Text>
            <Text style={s.sigTitle}>{preparedByTitle}</Text>
          </View>
          <View style={s.sigBox}>
            <Text style={s.sigAction}>Approved by:</Text>
            <View style={s.sigLine} />
            <Text style={s.sigName}>{approvedBy}</Text>
            <Text style={s.sigTitle}>{approvedByTitle}</Text>
          </View>
          <View style={s.sigBox}>
            <Text style={s.sigAction}>Conforme:</Text>
            <View style={s.sigLine} />
            <Text style={s.sigName}>{addressedName}</Text>
            <Text style={s.sigTitle}>Date: _________________</Text>
          </View>
        </View>

        {/* ── ZONE G: Contact Footer ── */}
        <View style={s.contactFooter}>
          <View style={s.contactCol}>
            <Text style={s.contactLabel}>Call</Text>
            {cs.phone_numbers?.map((phone, i) => (
              <Text key={i} style={s.contactText}>{phone}</Text>
            ))}
          </View>
          <View style={s.contactCol}>
            <Text style={s.contactLabel}>Message</Text>
            <Text style={s.contactText}>{cs.email || "—"}</Text>
          </View>
          <View style={[s.contactCol, { width: "40%" }]}>
            <Text style={s.contactLabel}>Office Address</Text>
            <Text style={s.contactText}>
              {[cs.address_line1, cs.address_line2, cs.city, cs.country].filter(Boolean).join("\n")}
            </Text>
          </View>
        </View>

        {/* ── Page Footer ── */}
        <View style={s.pageFooter} fixed>
          <Text style={s.pageFooterText}>
            {t(q.quote_number, "Quotation")} · {fmtDate(q.created_date || q.created_at)}
          </Text>
          <Text style={s.pageFooterText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          <Text style={s.pageFooterText}>Generated by Neuron OS</Text>
        </View>

      </Page>
    </Document>
  );
}

// Helper to format line-item money values (no currency prefix, just number)
function val(n?: number): string {
  if (n === undefined || n === null) return "0.00";
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Download Utility ───────────────────────────────────────────────────────

export async function downloadQuotationPDF(
  quotation: QuotationNew,
  options: QuotationPrintOptions,
  companySettings: CompanySettings
): Promise<void> {
  const doc = (
    <QuotationPDFDocument
      quotation={quotation}
      options={options}
      companySettings={companySettings}
    />
  );
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Quotation-${quotation.quote_number || quotation.quotation_number || "untitled"}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
