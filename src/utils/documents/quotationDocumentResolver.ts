// Convert a QuotationNew (plus settings + company settings) into a normalized
// PrintableDocument. No rendering happens here; rendering is the renderer's job.

import type {
  AddressStruct,
  FinancialSummary,
  InquiryService,
  Project,
  ContractRateMatrix,
  ContractRateCategory,
  ContractRateRow,
  QuotationChargeCategory,
  QuotationNew,
} from "../../types/pricing";
import { DEFAULT_COMPANY_SETTINGS, type CompanySettings } from "../../hooks/useCompanySettings";
import { normalizeCurrency, FUNCTIONAL_CURRENCY } from "../accountingCurrency";
import {
  DEFAULT_PRINTABLE_OPTIONS,
  type PrintableCompanyBlock,
  type PrintableContactFooter,
  type PrintableDocument,
  type PrintableField,
  type PrintableSection,
  type PrintableSignatory,
  type PrintableTable,
  type PrintableTableColumn,
  type PrintableTableGroup,
  type PrintableTableRow,
  type PrintableTotalRow,
  type PrintableTotals,
  type PrintableValue,
} from "./printableDocument";
import { isPrintableValue, normalizePrintableDocument } from "./printableDocumentNormalize";
import {
  resolveDocumentSettings,
  type DocumentSettings,
} from "./documentSettings";
import type { QuotationPrintOptions } from "../../components/projects/quotation/screen/useQuotationDocumentState";
import { joinNonEmpty } from "./printableDocumentFormat";

const DEFAULT_CONTACT_FOOTER: PrintableContactFooter = {
  callNumbers: DEFAULT_COMPANY_SETTINGS.phone_numbers,
  emails: DEFAULT_COMPANY_SETTINGS.email ? [DEFAULT_COMPANY_SETTINGS.email] : [],
  addressLines: [
    DEFAULT_COMPANY_SETTINGS.address_line1,
    DEFAULT_COMPANY_SETTINGS.address_line2,
    joinNonEmpty([DEFAULT_COMPANY_SETTINGS.city, DEFAULT_COMPANY_SETTINGS.country], ", "),
  ].filter((line): line is string => typeof line === "string" && line.trim().length > 0),
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtAddress(addr: string | AddressStruct | undefined | null): string | undefined {
  if (!addr) return undefined;
  if (typeof addr === "string") {
    const t = addr.trim();
    return t.length > 0 ? t : undefined;
  }
  const joined = joinNonEmpty(
    [addr.address, addr.city, addr.province, addr.country, addr.postal_code],
    ", ",
  );
  return joined || undefined;
}

function fmtWeight(val?: number | string | null): string | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  const num = Number(val);
  if (!Number.isFinite(num) || num === 0) return undefined;
  return `${num} kg`;
}

function fmtTransitRouting(quote: QuotationNew): string | undefined {
  const tt = quote.transit_time;
  const days = (quote as any).transit_days;
  const routing = quote.routing_info;
  if (tt) {
    return joinNonEmpty([tt, routing], " · ") || undefined;
  }
  if (days) {
    return joinNonEmpty([`${days} day(s)`, routing], " · ") || undefined;
  }
  if (routing) return routing;
  return undefined;
}

function effectiveItemAmount(item: any): number {
  if (item.amount !== undefined && item.amount !== null && item.amount !== 0) {
    return Number(item.amount);
  }
  const unitPrice = item.final_price ?? item.price ?? 0;
  return Number(unitPrice) * Number(item.quantity || 1) * Number(item.forex_rate || 1);
}

function calcSummary(
  categories: QuotationChargeCategory[],
  existing?: FinancialSummary,
): FinancialSummary {
  if (existing && existing.grand_total > 0) return existing;
  let taxable = 0;
  let nonTaxable = 0;
  categories.forEach((cat) => {
    cat.line_items?.forEach((item) => {
      const amt = effectiveItemAmount(item);
      if (item.is_taxed) taxable += amt;
      else nonTaxable += amt;
    });
  });
  const taxRate = existing?.tax_rate ?? 0.12;
  const taxAmt = taxable * taxRate;
  return {
    subtotal_non_taxed: nonTaxable,
    subtotal_taxed: taxable,
    tax_rate: taxRate,
    tax_amount: taxAmt,
    other_charges: existing?.other_charges ?? 0,
    grand_total: nonTaxable + taxable + taxAmt,
  };
}

// ─── Company / contact resolution ───────────────────────────────────────────

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : "";
    });
}

function cleanRichText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = Array.isArray(value) ? value.join("\n") : String(value);
  if (!raw.trim()) return undefined;

  const cleaned = decodeBasicHtmlEntities(raw)
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  return cleaned || undefined;
}

function cleanRichTextList(value: unknown): string[] | undefined {
  const source = Array.isArray(value) ? value : [value];
  const items = source.flatMap((entry) => (cleanRichText(entry) || "").split("\n"));
  const cleaned = items.map((entry) => entry.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

function resolveCompanyBlock(cs?: CompanySettings, fallbackLogo?: string): PrintableCompanyBlock | undefined {
  if (!cs) return undefined;
  const addressLines = [cs.address_line1, cs.address_line2, joinNonEmpty([cs.city, cs.country], ", ")]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return {
    name: cs.company_name || undefined,
    addressLines,
    phoneNumbers: Array.isArray(cs.phone_numbers) ? cs.phone_numbers.filter((p) => p && p.trim()) : [],
    email: cs.email || undefined,
    logoUrl: cs.logo_url || undefined,
    fallbackLogo,
  };
}

function resolveContactFooter(
  cs?: CompanySettings,
  override?: { callNumbers?: string[]; email?: string; officeAddress?: string },
): PrintableContactFooter | undefined {
  if (override) {
    const callNumbers = Array.isArray(override.callNumbers)
      ? override.callNumbers.map((p) => p?.trim()).filter((p): p is string => Boolean(p && p.length > 0))
      : [];
    const emails = override.email && override.email.trim().length > 0 ? [override.email.trim()] : [];
    const addressLines = typeof override.officeAddress === "string"
      ? override.officeAddress.split("\n").map((l) => l.trim()).filter(Boolean)
      : [];
    if (callNumbers.length > 0 || emails.length > 0 || addressLines.length > 0) {
      return { callNumbers, emails, addressLines };
    }
  }
  if (!cs) return DEFAULT_CONTACT_FOOTER;
  const callNumbers = Array.isArray(cs.phone_numbers)
    ? cs.phone_numbers.filter((p) => p && p.trim())
    : [];
  const emails = cs.email ? [cs.email] : [];
  const addressLines = [cs.address_line1, cs.address_line2, joinNonEmpty([cs.city, cs.country], ", ")]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  if (callNumbers.length === 0 && emails.length === 0 && addressLines.length === 0) return DEFAULT_CONTACT_FOOTER;
  return { callNumbers, emails, addressLines };
}

// ─── Service-specific section builders ──────────────────────────────────────
// Each builder maps known snake_case keys from `services_metadata[].service_details`
// to PrintableFields. Unknown keys are intentionally skipped (we never dump raw
// JSON onto a customer-facing PDF).

interface ServiceDetailKey {
  key: string;
  label: string;
  width?: PrintableField["width"];
  format?: PrintableField["format"];
}

function pick(details: any, key: string): unknown {
  if (!details || typeof details !== "object") return undefined;
  return details[key];
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatObjectDetail(value: Record<string, any>): string | undefined {
  const type = value.type || value.container_type || value.size || value.name;
  const qty = value.qty ?? value.quantity ?? value.count;
  if (type && qty !== undefined && qty !== null && qty !== "") {
    return `${qty} x ${type}`;
  }
  if (type) return String(type);

  const parts = Object.entries(value)
    .filter(([key, entry]) => key !== "id" && isPrintableValue(entry))
    .map(([key, entry]) => `${humanizeKey(key)}: ${String(entry).trim()}`);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function formatServiceDetailValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const cleaned = value
      .map((entry) => formatServiceDetailValue(entry))
      .flatMap((entry) => Array.isArray(entry) ? entry : [entry])
      .filter((entry) => isPrintableValue(entry));
    return cleaned.length > 0 ? cleaned : undefined;
  }
  if (typeof value === "string") return cleanRichText(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value && typeof value === "object") return formatObjectDetail(value as Record<string, any>);
  return value;
}

function buildServiceSection(
  id: string,
  title: string,
  details: any,
  keys: ServiceDetailKey[],
): PrintableSection {
  const fields: PrintableField[] = [];
  for (const k of keys) {
    const value = formatServiceDetailValue(pick(details, k.key));
    if (Array.isArray(value)) {
      fields.push({
        id: `${id}.${k.key}`,
        label: k.label,
        value: value.map((v) => String(v)),
        width: k.width,
        format: k.format,
      });
      continue;
    }
    fields.push({
      id: `${id}.${k.key}`,
      label: k.label,
      value: value as any,
      width: k.width,
      format: k.format,
    });
  }
  return { id, title, fields, layout: "grid" };
}

const BROKERAGE_KEYS: ServiceDetailKey[] = [
  { key: "subtype", label: "Brokerage Type" },
  { key: "shipment_type", label: "Shipment Type" },
  { key: "type_of_entry", label: "Type of Entry" },
  { key: "consumption", label: "Consumption" },
  { key: "warehousing", label: "Warehousing" },
  { key: "peza", label: "PEZA" },
  { key: "pod_aod", label: "Port of Discharge" },
  { key: "mode", label: "Mode" },
  { key: "cargo_type", label: "Cargo Type" },
  { key: "commodity", label: "Commodity", width: "wide" },
  { key: "declared_value", label: "Declared Value" },
  { key: "delivery_address", label: "Delivery Address", width: "full" },
  { key: "country_of_origin", label: "Country of Origin" },
  { key: "preferential_treatment", label: "Preferential Treatment" },
  { key: "psic", label: "PSIC" },
  { key: "aeo", label: "AEO" },
  { key: "containers", label: "Containers" },
  { key: "fcl_20ft", label: "FCL 20'" },
  { key: "fcl_40ft", label: "FCL 40'" },
  { key: "fcl_45ft", label: "FCL 45'" },
  { key: "fcl_qty", label: "FCL Qty" },
  { key: "lcl_gwt", label: "LCL GWT" },
  { key: "lcl_dims", label: "LCL DIMS" },
  { key: "air_gwt", label: "Air GWT" },
  { key: "air_cwt", label: "Air CWT" },
  { key: "booking_confirmation", label: "Booking Confirmation" },
  { key: "lct", label: "LCT" },
  { key: "vgm", label: "VGM" },
  { key: "tare_weight", label: "Tare Weight" },
  { key: "seal_number", label: "Seal Number" },
];

const FORWARDING_KEYS: ServiceDetailKey[] = [
  { key: "incoterms", label: "Incoterms" },
  { key: "cargo_type", label: "Cargo Type" },
  { key: "cargo_nature", label: "Cargo Nature" },
  { key: "commodity", label: "Commodity", width: "wide" },
  { key: "mode", label: "Mode" },
  { key: "pol_aol", label: "POL / AOL" },
  { key: "pod_aod", label: "POD / AOD" },
  { key: "carrier_airline", label: "Carrier / Airline" },
  { key: "transit_time", label: "Transit Time" },
  { key: "route", label: "Route" },
  { key: "stackable", label: "Stackable" },
  { key: "containers", label: "Containers" },
  { key: "lcl_gwt", label: "LCL GWT" },
  { key: "lcl_dims", label: "LCL DIMS" },
  { key: "air_gwt", label: "Air GWT" },
  { key: "air_cwt", label: "Air CWT" },
  { key: "collection_address", label: "Collection Address", width: "full" },
  { key: "delivery_address", label: "Delivery Address", width: "full" },
  { key: "booking_reference", label: "Booking Reference" },
  { key: "lct", label: "LCT" },
  { key: "vgm", label: "VGM" },
];

const TRUCKING_KEYS: ServiceDetailKey[] = [
  { key: "pull_out", label: "Pull-Out Location" },
  { key: "delivery_address", label: "Delivery Address", width: "wide" },
  { key: "truck_type", label: "Truck Type" },
  { key: "qty", label: "Quantity" },
  { key: "aol_pol", label: "AOL / POL" },
  { key: "delivery_instructions", label: "Delivery Instructions", width: "full" },
  { key: "shipper", label: "Shipper" },
  { key: "driver_name", label: "Driver" },
  { key: "helper_name", label: "Helper" },
  { key: "vehicle_ref", label: "Vehicle Ref" },
  { key: "with_gps", label: "GPS" },
  { key: "gate_in", label: "Gate-In" },
  { key: "cy_fee", label: "CY Fee" },
];

const MARINE_KEYS: ServiceDetailKey[] = [
  { key: "commodity", label: "Commodity", width: "wide" },
  { key: "hs_code", label: "HS Code" },
  { key: "pol_aol", label: "POL / AOL" },
  { key: "pod_aod", label: "POD / AOD" },
  { key: "invoice_value", label: "Invoice Value" },
];

const OTHERS_KEYS: ServiceDetailKey[] = [
  { key: "service_description", label: "Description", width: "full" },
  { key: "description", label: "Description", width: "full" },
];

const CONTRACT_SERVICE_KEYS: Record<string, ServiceDetailKey[]> = {
  Brokerage: [
    { key: "subtype", label: "Brokerage Type" },
    { key: "consumption", label: "Consumption" },
    { key: "pod_aod", label: "Port of Discharge" },
    { key: "mode", label: "Mode" },
    { key: "cargo_type", label: "Cargo Type" },
    { key: "commodity", label: "Commodity", width: "wide" },
  ],
  Forwarding: [
    { key: "mode", label: "Forwarding Mode" },
    { key: "pol_aol", label: "POL / AOL" },
    { key: "pod_aod", label: "POD / AOD" },
    { key: "carrier_airline", label: "Carrier / Airline" },
    { key: "transit_time", label: "Transit Time" },
    { key: "route", label: "Route" },
    { key: "commodity", label: "Commodity", width: "wide" },
  ],
  Trucking: [
    { key: "pull_out", label: "Pull-Out Location" },
    { key: "qty", label: "Quantity" },
    { key: "truck_type", label: "Truck Type" },
    { key: "delivery_address", label: "Delivery Address", width: "wide" },
  ],
  "Marine Insurance": [
    { key: "commodity", label: "Marine Commodity", width: "wide" },
    { key: "hs_code", label: "HS Code" },
    { key: "pol_aol", label: "POL / AOL" },
    { key: "pod_aod", label: "POD / AOD" },
    { key: "invoice_value", label: "Invoice Value" },
  ],
  Others: [
    { key: "service_description", label: "Other Service", width: "wide" },
    { key: "description", label: "Other Service", width: "wide" },
  ],
};

function serviceDetailValue(details: any, key: string): unknown {
  return formatServiceDetailValue(pick(details, key));
}

function buildServiceSections(quote: QuotationNew): PrintableSection[] {
  const meta = quote.services_metadata;
  if (!Array.isArray(meta) || meta.length === 0) return [];
  const sections: PrintableSection[] = [];
  meta.forEach((svc: InquiryService, idx: number) => {
    const type = svc?.service_type;
    const details = svc?.service_details;
    if (!type) return;
    switch (type) {
      case "Brokerage":
        sections.push(buildServiceSection(`svc-brokerage-${idx}`, "Brokerage Details", details, BROKERAGE_KEYS));
        break;
      case "Forwarding":
        sections.push(buildServiceSection(`svc-forwarding-${idx}`, "Forwarding Details", details, FORWARDING_KEYS));
        break;
      case "Trucking": {
        const sec = buildServiceSection(`svc-trucking-${idx}`, "Trucking Details", details, TRUCKING_KEYS);
        sections.push(sec);
        // Trucking line items (if present) appear as their own table elsewhere
        break;
      }
      case "Marine Insurance":
        sections.push(buildServiceSection(`svc-marine-${idx}`, "Marine Insurance Details", details, MARINE_KEYS));
        break;
      case "Others":
        sections.push(buildServiceSection(`svc-others-${idx}`, "Other Service Details", details, OTHERS_KEYS));
        break;
      default:
        break;
    }
  });
  return sections;
}

// ─── Shipment Details section ───────────────────────────────────────────────

function buildContractDetailsSection(
  quote: QuotationNew,
  args: {
    serviceNames: string[];
    validUntil?: PrintableValue;
    quoteReference?: PrintableValue;
  },
): PrintableSection {
  const fields: PrintableField[] = [
    { id: "contract_title", label: "Contract Title", value: quote.quotation_name, width: "wide" },
    { id: "contract_no", label: "Contract No.", value: args.quoteReference },
    { id: "date_issued", label: "Date Issued", value: quote.created_date || quote.created_at, format: "date" },
    { id: "valid_until", label: "Valid Until", value: args.validUntil, format: "date" },
    { id: "contract_start", label: "Contract Start", value: quote.contract_validity_start, format: "date" },
    { id: "contract_end", label: "Contract End", value: quote.contract_validity_end, format: "date" },
    { id: "services", label: "Services", value: args.serviceNames },
    { id: "status", label: "Status", value: quote.contract_status },
    { id: "currency", label: "Currency", value: quote.currency },
  ];

  const cgd = quote.contract_general_details;
  if (cgd) {
    fields.push(
      {
        id: "port_of_entry",
        label: "Port of Entry",
        value: Array.isArray(cgd.port_of_entry) && cgd.port_of_entry.length > 0
          ? cgd.port_of_entry
          : undefined,
      },
      {
        id: "transportation",
        label: "Transportation",
        value: Array.isArray(cgd.transportation) && cgd.transportation.length > 0
          ? cgd.transportation
          : undefined,
      },
      { id: "type_of_entry", label: "Type of Entry", value: cgd.type_of_entry },
      { id: "releasing", label: "Releasing", value: cgd.releasing },
    );
  }

  const meta = Array.isArray(quote.services_metadata) ? quote.services_metadata : [];
  meta.forEach((svc, idx) => {
    const serviceType = svc?.service_type;
    const keys = serviceType ? CONTRACT_SERVICE_KEYS[serviceType] : undefined;
    if (!serviceType || !keys) return;
    keys.forEach((key) => {
      fields.push({
        id: `contract.${idx}.${key.key}`,
        label: key.label,
        value: serviceDetailValue(svc.service_details, key.key) as any,
        width: key.width,
        format: key.format,
      });
    });
  });

  return {
    id: "contract_details",
    title: "Contract Details",
    layout: "grid",
    fields,
  };
}

function buildQuotationDetailsSection(
  quote: QuotationNew,
  args: {
    validUntil?: PrintableValue;
    quoteReference?: PrintableValue;
    projectNumber?: PrintableValue;
  },
): PrintableSection {
  return {
    id: "quotation_details",
    title: "Quotation Details",
    layout: "grid",
    fields: [
      { id: "quotation_title", label: "Quotation Title", value: quote.quotation_name, width: "wide" },
      { id: "reference", label: "Reference No.", value: args.quoteReference },
      { id: "date_issued", label: "Date Issued", value: quote.created_date || quote.created_at, format: "date" },
      { id: "valid_until", label: "Valid Until", value: args.validUntil, format: "date" },
      { id: "project_number", label: "Project No.", value: args.projectNumber },
      {
        id: "services",
        label: "Services",
        value: Array.isArray(quote.services) && quote.services.length > 0 ? quote.services : undefined,
      },
    ],
  };
}

function buildShipmentSection(quote: QuotationNew, project?: Project): PrintableSection {
  const src: any = project ? { ...quote, ...project, ...quote } : quote; // quote wins for explicit fields
  const fields: PrintableField[] = [
    { id: "movement", label: "Movement", value: src.movement },
    { id: "category", label: "Category", value: src.category },
    { id: "shipment_freight", label: "Freight Type", value: src.shipment_freight },
    {
      id: "services",
      label: "Services",
      value: Array.isArray(src.services) && src.services.length > 0 ? src.services.join(", ") : undefined,
    },
    { id: "incoterm", label: "Incoterm", value: src.incoterm },
    { id: "carrier", label: "Carrier", value: src.carrier },
    { id: "transit", label: "Transit & Routing", value: fmtTransitRouting(quote) },
    { id: "commodity", label: "Commodity", value: src.commodity },
    { id: "packaging_type", label: "Packaging", value: src.packaging_type },
    { id: "volume", label: "Volume", value: src.volume },
    { id: "gross_weight", label: "Gross Weight", value: fmtWeight(src.gross_weight) },
    { id: "chargeable_weight", label: "Chargeable Weight", value: fmtWeight(src.chargeable_weight) },
    { id: "dimensions", label: "Dimensions", value: src.dimensions },
    { id: "pol_aol", label: "Port of Loading", value: src.pol_aol, width: "wide" },
    { id: "pod_aod", label: "Port of Discharge", value: src.pod_aod, width: "wide" },
    {
      id: "collection_address",
      label: "Collection Address",
      value: fmtAddress(src.collection_address || src.pickup_address),
      width: "full",
    },
  ];
  return {
    id: "shipment",
    title: "Shipment Details",
    fields,
    layout: "grid",
  };
}

// ─── Charge categories table ────────────────────────────────────────────────

function buildChargeTable(
  categories: QuotationChargeCategory[],
  currency: string,
  options: { showTax: boolean; omitEmpty: boolean },
): PrintableTable {
  const columns: PrintableTableColumn[] = [
    { id: "description", label: "Description", widthHint: "32%" },
    { id: "price", label: "Price", align: "right", format: "money", widthHint: "12%" },
    { id: "currency", label: "Cur", align: "center", widthHint: "6%", hideWhenEmpty: true },
    { id: "quantity", label: "Qty", align: "center", widthHint: "6%", hideWhenEmpty: true },
    { id: "forex", label: "Forex", align: "center", widthHint: "6%", hideWhenEmpty: true },
    { id: "taxed", label: "Taxed", align: "center", widthHint: "6%", hideWhenEmpty: true },
    { id: "remarks", label: "Remarks", widthHint: "14%", hideWhenEmpty: true },
    { id: "amount", label: "Amount", align: "right", format: "money", widthHint: "18%" },
  ];

  const rows: PrintableTableRow[] = [];
  const groups: PrintableTableGroup[] = [];

  categories.forEach((cat, catIdx) => {
    const groupId = cat.id || `cat-${catIdx}`;
    let subtotal = 0;
    (cat.line_items || []).forEach((item: any, itemIdx: number) => {
      const itemCurrency = normalizeCurrency(item.currency, FUNCTIONAL_CURRENCY);
      const displayPrice = item.final_price ?? item.price ?? 0;
      const itemRate = Number(item.forex_rate) || 1;
      const amt = effectiveItemAmount(item);
      subtotal += amt;
      rows.push({
        id: item.id || `${groupId}-item-${itemIdx}`,
        groupId,
        cells: {
          description: item.description ?? "",
          price: Number(displayPrice) || 0,
          currency: itemCurrency,
          quantity: item.quantity ?? "",
          // Only show forex when not 1
          forex: itemRate && itemRate !== 1 ? itemRate : "",
          taxed: options.showTax && item.is_taxed ? "✓" : "",
          remarks: item.remarks || item.unit || "",
          amount: amt,
        },
      });
    });
    // Subtotal row
    const subtotalRow: PrintableTableRow = {
      id: `${groupId}-subtotal`,
      groupId,
      emphasis: "subtotal",
      cells: {
        description: "Subtotal",
        amount: cat.subtotal && cat.subtotal !== 0 ? cat.subtotal : subtotal,
      },
    };
    groups.push({
      id: groupId,
      title: cat.category_name || cat.name || "Charges",
      subtotal: subtotalRow,
    });
  });

  return {
    id: "charges",
    columns,
    rows,
    groups,
    hideWhenEmpty: options.omitEmpty,
    emptyMessage: "No charges added to this quotation.",
  };
}

function formatUnit(unit?: string): string | undefined {
  if (!unit) return undefined;
  const labels: Record<string, string> = {
    per_container: "Per Container",
    per_shipment: "Per Shipment",
    per_entry: "Per Entry",
    per_bl: "Per B/L",
    per_set: "Per Set",
    per_kg: "Per KG",
    per_cbm: "Per CBM",
    flat: "Flat Fee",
  };
  return labels[unit] || unit.replace(/_/g, " ");
}

function formatContractRate(row: ContractRateRow, column: string): string | number | undefined {
  if (row.is_at_cost) return "At Cost";
  const value = row.rates?.[column];
  if (value === null || value === undefined || Number(value) === 0) return undefined;
  return Number(value);
}

function formatSucceedingRule(row: ContractRateRow): string | undefined {
  if (!row.succeeding_rule) return undefined;
  const rate = Number(row.succeeding_rule.rate);
  const afterQty = Number(row.succeeding_rule.after_qty);
  if (!Number.isFinite(rate) || rate <= 0) return undefined;
  const formattedRate = new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rate);
  if (!Number.isFinite(afterQty) || afterQty <= 0) return `Succeeding: ${formattedRate}`;
  return `After ${afterQty}: ${formattedRate}`;
}

function matrixCategories(matrix: ContractRateMatrix): ContractRateCategory[] {
  if (Array.isArray(matrix.categories) && matrix.categories.length > 0) {
    return matrix.categories;
  }
  if (Array.isArray(matrix.rows) && matrix.rows.length > 0) {
    return [{
      id: `${matrix.id || matrix.service_type}-general`,
      category_name: "General",
      rows: matrix.rows,
    }];
  }
  return [];
}

function buildContractRateMatrixTables(matrices?: ContractRateMatrix[]): PrintableTable[] {
  if (!Array.isArray(matrices) || matrices.length === 0) return [];

  return matrices.map((matrix, matrixIdx): PrintableTable => {
    const matrixCurrency = matrix.currency || FUNCTIONAL_CURRENCY;
    const modeColumns = (Array.isArray(matrix.columns) ? matrix.columns : [])
      .filter((column) => typeof column === "string" && column.trim().length > 0);

    const columns: PrintableTableColumn[] = [
      { id: "particular", label: "Particular", widthHint: "34%" },
      ...modeColumns.map((column) => ({
        id: `rate:${column}`,
        label: column,
        align: "right" as const,
        format: "money" as const,
        hideWhenEmpty: true,
        widthHint: modeColumns.length > 2 ? "11%" : "13%",
      })),
      { id: "unit", label: "Unit", widthHint: "10%", hideWhenEmpty: true },
      { id: "succeeding", label: "Succeeding", widthHint: "13%", hideWhenEmpty: true },
      { id: "remarks", label: "Remarks", widthHint: "17%", hideWhenEmpty: true },
    ];

    const rows: PrintableTableRow[] = [];
    const groups: PrintableTableGroup[] = [];

    matrixCategories(matrix).forEach((category, categoryIdx) => {
      const groupId = category.id || `${matrix.id || matrixIdx}-cat-${categoryIdx}`;
      groups.push({
        id: groupId,
        title: category.category_name || "Charges",
      });

      (category.rows || []).forEach((row, rowIdx) => {
        const cells: Record<string, any> = {
          particular: row.group_label || row.particular,
          unit: row.group_label ? undefined : formatUnit(row.unit),
          succeeding: row.group_label ? undefined : formatSucceedingRule(row),
          remarks: row.group_label ? undefined : row.remarks,
        };

        modeColumns.forEach((column) => {
          cells[`rate:${column}`] = row.group_label ? undefined : formatContractRate(row, column);
        });

        rows.push({
          id: row.id || `${groupId}-row-${rowIdx}`,
          groupId,
          emphasis: row.group_label ? "subtotal" : "normal",
          cells,
        });
      });
    });

    return {
      id: `contract-rate-${matrix.id || matrixIdx}`,
      title: `${matrix.service_type} Charges${matrixCurrency ? ` (${matrixCurrency})` : ""}`,
      columns,
      rows,
      groups,
      hideWhenEmpty: true,
    };
  });
}

function buildTotals(summary: FinancialSummary, currency: string, showTax: boolean): PrintableTotals {
  const rows: PrintableTotalRow[] = [];
  const subtotal = (summary.subtotal_non_taxed || 0) + (summary.subtotal_taxed || 0);
  rows.push({
    id: "subtotal",
    label: "Subtotal",
    value: subtotal,
    currency,
    format: "money",
  });
  if (showTax && (summary.subtotal_taxed || 0) > 0) {
    rows.push({
      id: "taxable",
      label: "Taxable",
      value: summary.subtotal_taxed,
      currency,
      format: "money",
    });
    rows.push({
      id: "tax_rate",
      label: "Tax rate",
      value: summary.tax_rate ?? 0,
      format: "percent",
    });
    if ((summary.tax_amount || 0) > 0) {
      rows.push({
        id: "tax_due",
        label: "Tax due",
        value: summary.tax_amount,
        currency,
        format: "money",
      });
    }
  }
  if ((summary.other_charges || 0) > 0) {
    rows.push({
      id: "other",
      label: "Other",
      value: summary.other_charges,
      currency,
      format: "money",
    });
  }
  const grandTotal: PrintableTotalRow = {
    id: "grand_total",
    label: "TOTAL",
    value: summary.grand_total ?? 0,
    currency,
    format: "money",
    emphasis: "grand",
  };
  return { rows, grandTotal };
}

// ─── Public resolver ────────────────────────────────────────────────────────

export interface ResolveQuotationArgs {
  quotation: QuotationNew;
  project?: Project;
  options?: QuotationPrintOptions | DocumentSettings;
  companySettings?: CompanySettings;
  currentUser?: { name: string; email: string } | null;
  fallbackLogo?: string;
}

export function resolveQuotationPrintableDocument(
  args: ResolveQuotationArgs,
): PrintableDocument {
  const { quotation, project, companySettings, currentUser, fallbackLogo } = args;
  const settings = resolveDocumentSettings(args.options);
  const legacy = quotation as any;
  const legacyDetails = legacy?.details && typeof legacy.details === "object" ? legacy.details : {};

  const isContract = quotation.quotation_type === "contract";
  const title = isContract ? "CONTRACT QUOTATION" : "QUOTATION";
  const subtitle = undefined;

  const quoteReference = quotation.quote_number || (quotation as any).quotation_number || project?.quotation_number;
  const documentValidUntil = settings.validityOverride || quotation.valid_until || (quotation as any).expiry_date;
  const headerFields: PrintableField[] = [];

  // Party section: Prepared For
  const addressedName =
    settings.addressedTo?.name ||
    legacy?.pdf_addressed_to_name ||
    legacyDetails?.pdf_addressed_to_name ||
    quotation.addressed_to_name ||
    quotation.contact_person_name;
  const addressedTitle =
    settings.addressedTo?.title ||
    legacy?.pdf_addressed_to_title ||
    legacyDetails?.pdf_addressed_to_title ||
    quotation.addressed_to_title;

  const preparedFor: PrintableSection = {
    id: "prepared_for",
    title: "Prepared For",
    layout: "two-column",
    fields: [
      { id: "customer", label: "Customer", value: quotation.customer_name, width: "wide" },
      { id: "attention", label: "Attention", value: addressedName },
      { id: "position", label: "Position", value: addressedTitle },
      {
        id: "company",
        label: "Company",
        value:
          quotation.customer_company ||
          quotation.customer_organization ||
          (quotation.customer_company !== quotation.customer_name ? quotation.customer_name : undefined),
      },
      { id: "department", label: "Department", value: quotation.customer_department },
    ],
  };

  // Shipment + service-specific sections
  const sections: PrintableSection[] = [];
  if (!isContract) {
    sections.push(buildQuotationDetailsSection(quotation, {
      validUntil: documentValidUntil,
      quoteReference,
      projectNumber: project?.project_number,
    }));
    sections.push(buildShipmentSection(quotation, project));
  } else {
    const serviceNames = Array.isArray(quotation.services) && quotation.services.length > 0
      ? quotation.services
      : Array.isArray(quotation.rate_matrices)
        ? quotation.rate_matrices.map((m) => m.service_type).filter(Boolean)
        : [];
    sections.push(buildContractDetailsSection(quotation, {
      serviceNames,
      validUntil: documentValidUntil,
      quoteReference,
    }));

    const scopeItems = cleanRichTextList(quotation.scope_of_services);
    if (scopeItems) {
      sections.push({
        id: "scope",
        title: "Scope of Services",
        layout: "stack",
        fields: [
          { id: "scope_list", label: "", value: scopeItems, format: "multiline" },
        ],
      });
    }
  }
  if (!isContract) {
    sections.push(...buildServiceSections(quotation));
  }

  // Charge table
  const categories: QuotationChargeCategory[] =
    (Array.isArray(quotation.selling_price) && quotation.selling_price.length > 0
      ? (quotation.selling_price as any as QuotationChargeCategory[])
      : null) ??
    (Array.isArray(quotation.charge_categories) && quotation.charge_categories.length > 0
      ? quotation.charge_categories
      : null) ??
    (Array.isArray(project?.charge_categories) && project!.charge_categories.length > 0
      ? project!.charge_categories
      : []);

  const currency = quotation.currency || project?.currency || FUNCTIONAL_CURRENCY;
  const summary = calcSummary(
    categories,
    (project as any)?.financial_summary || quotation.financial_summary,
  );

  const chargeTable = buildChargeTable(categories, currency, {
    showTax: settings.display.showTaxSummary,
    omitEmpty: DEFAULT_PRINTABLE_OPTIONS.omitEmptyTables,
  });
  const contractRateTables = isContract
    ? buildContractRateMatrixTables(quotation.rate_matrices)
    : [];

  // Notes — only the persisted ones; do NOT inject default terms (the plan says
  // print what's in the document).
  const notesText = cleanRichText(
    settings.customNotes ||
    quotation.custom_notes ||
    legacy?.pdf_custom_notes ||
    legacyDetails?.pdf_custom_notes ||
    quotation.notes ||
    "",
  );

  const notes: PrintableSection[] = [];
  if (isPrintableValue(notesText)) {
    notes.push({
      id: "terms",
      title: "Terms and Conditions",
      layout: "stack",
      fields: [{ id: "terms_text", label: "", value: notesText, format: "multiline" }],
    });
  }
  const contractTerms = cleanRichTextList(quotation.terms_and_conditions);
  if (isContract && contractTerms) {
    notes.push({
      id: "contract_terms",
      title: "Terms and Conditions",
      layout: "stack",
      fields: [{ id: "contract_terms_list", label: "", value: contractTerms, format: "multiline" }],
    });
  }
  const paymentTerms = cleanRichText(
    settings.paymentTerms ||
    quotation.payment_terms ||
    legacy?.pdf_payment_terms ||
    legacyDetails?.pdf_payment_terms,
  );
  if (isPrintableValue(paymentTerms)) {
    notes.push({
      id: "payment_terms",
      title: "Payment Terms",
      layout: "stack",
      fields: [{ id: "payment_terms_text", label: "", value: paymentTerms, format: "multiline" }],
    });
  }

  // Signatories
  const preparedByName =
    settings.signatories?.preparedBy?.name ||
    quotation.prepared_by ||
    legacy?.pdf_prepared_by ||
    legacyDetails?.pdf_prepared_by ||
    currentUser?.name;
  const preparedByTitle =
    settings.signatories?.preparedBy?.title ||
    quotation.prepared_by_title ||
    legacy?.pdf_prepared_by_title ||
    legacyDetails?.pdf_prepared_by_title;
  const approvedByName =
    settings.signatories?.approvedBy?.name ||
    quotation.approved_by ||
    legacy?.pdf_approved_by ||
    legacyDetails?.pdf_approved_by;
  const approvedByTitle =
    settings.signatories?.approvedBy?.title ||
    quotation.approved_by_title ||
    legacy?.pdf_approved_by_title ||
    legacyDetails?.pdf_approved_by_title;

  const signatories: PrintableSignatory[] = [
    {
      id: "prepared_by",
      label: "Prepared by",
      name: preparedByName,
      title: preparedByTitle,
      includeSignatureLine: true,
    },
    {
      id: "approved_by",
      label: "Approved by",
      name: approvedByName,
      title: approvedByTitle,
      includeSignatureLine: true,
    },
    {
      id: "conforme",
      label: "Conforme",
      name: addressedName,
      title: addressedTitle,
      includeSignatureLine: true,
    },
  ];

  // Bank — sidebar override wins over company defaults
  const bankOverride = settings.bankOverride;
  const hasBankOverride = bankOverride && (bankOverride.bankName || bankOverride.accountName || bankOverride.accountNumber);
  const bank = hasBankOverride
    ? {
        bankName: bankOverride!.bankName?.trim() || undefined,
        accountName: bankOverride!.accountName?.trim() || undefined,
        accountNumber: bankOverride!.accountNumber?.trim() || undefined,
      }
    : companySettings && (companySettings.bank_name || companySettings.bank_account_number)
    ? {
        bankName: companySettings.bank_name || undefined,
        accountName: companySettings.bank_account_name || undefined,
        accountNumber: companySettings.bank_account_number || undefined,
      }
    : undefined;

  // Options derived from settings.display
  const options = {
    ...DEFAULT_PRINTABLE_OPTIONS,
    showBankDetails: settings.display.showBankDetails,
    showTaxSummary: settings.display.showTaxSummary,
    showNotes: settings.display.showNotes,
    showLetterhead: settings.display.showLetterhead,
    showSignatories: settings.display.showSignatories,
    showContactFooter: settings.display.showContactFooter,
  };

  const hasChargeRows = categories.some((cat) => Array.isArray(cat.line_items) && cat.line_items.length > 0);
  const hasNonZeroTotal = Number(summary.grand_total || 0) > 0;
  const totals = !isContract && (hasChargeRows || hasNonZeroTotal)
    ? buildTotals(summary, currency, settings.display.showTaxSummary)
    : undefined;

  const pageFooterText = joinNonEmpty([
    quotation.quote_number || (quotation as any).quotation_number,
    quotation.created_date || quotation.created_at,
  ], " · ") || undefined;

  const doc: PrintableDocument = {
    kind: isContract ? "contract_quotation" : "quotation",
    title,
    subtitle,
    company: resolveCompanyBlock(companySettings, fallbackLogo),
    headerFields,
    partySections: [preparedFor],
    sections,
    tables: isContract ? contractRateTables : [chargeTable],
    totals,
    notes,
    bank,
    signatories,
    contactFooter: resolveContactFooter(companySettings, settings.contactFooterOverride),
    footerFields: [],
    options,
    pageFooterText: pageFooterText || undefined,
  };

  return normalizePrintableDocument(doc);
}
