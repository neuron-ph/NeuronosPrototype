import type {
  BookingChargeLine,
  BookingCollectionAllocation,
  BookingExpense,
  BookingFinancialContext,
  BookingInvoiceLink,
  CollectionFinancialRecord,
  InvoiceFinancialDocument,
} from "../types/financials";

const PROJECT_NUMBER_PATTERN = /^(PRJ|PROJ)-/i;

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const asNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const asBoolean = (value: unknown): boolean => Boolean(value);

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry));
};

export const isLegacyProjectBookingFallback = (
  rawBookingId: string | null,
  rawProjectNumber: string | null,
): boolean => {
  if (!rawBookingId) return false;
  if (rawProjectNumber && rawBookingId === rawProjectNumber) return true;
  return PROJECT_NUMBER_PATTERN.test(rawBookingId);
};

export const normalizeBookingContext = (row: Record<string, unknown>): BookingFinancialContext => {
  const rawBookingId =
    asString(row.booking_id) ??
    asString(row.bookingId) ??
    asString(row.source_booking_id) ??
    asString(row.sourceBookingId);
  const rawProjectNumber = asString(row.project_number) ?? asString(row.projectNumber);

  if (!rawBookingId) {
    return {
      bookingId: null,
      bookingResolution: "missing",
      legacyBookingFallback: null,
      pricingBasis: (asString(row.pricing_basis) as "spot" | "contract" | null) ?? null,
      projectId: asString(row.project_id) ?? asString(row.projectId),
      projectNumber: rawProjectNumber,
      contractId: asString(row.contract_id) ?? asString(row.contractId),
      contractNumber: asString(row.contract_number) ?? asString(row.contractNumber),
      customerId: asString(row.customer_id) ?? asString(row.customerId),
      customerName: asString(row.customer_name) ?? asString(row.customerName),
      serviceType: asString(row.service_type) ?? asString(row.serviceType),
    };
  }

  if (isLegacyProjectBookingFallback(rawBookingId, rawProjectNumber)) {
    return {
      bookingId: null,
      bookingResolution: "legacy-project-fallback",
      legacyBookingFallback: rawBookingId,
      pricingBasis: (asString(row.pricing_basis) as "spot" | "contract" | null) ?? null,
      projectId: asString(row.project_id) ?? asString(row.projectId),
      projectNumber: rawProjectNumber,
      contractId: asString(row.contract_id) ?? asString(row.contractId),
      contractNumber: asString(row.contract_number) ?? asString(row.contractNumber),
      customerId: asString(row.customer_id) ?? asString(row.customerId),
      customerName: asString(row.customer_name) ?? asString(row.customerName),
      serviceType: asString(row.service_type) ?? asString(row.serviceType),
    };
  }

  return {
    bookingId: rawBookingId,
    bookingResolution: "resolved",
    legacyBookingFallback: null,
    pricingBasis: (asString(row.pricing_basis) as "spot" | "contract" | null) ?? null,
    projectId: asString(row.project_id) ?? asString(row.projectId),
    projectNumber: rawProjectNumber,
    contractId: asString(row.contract_id) ?? asString(row.contractId),
    contractNumber: asString(row.contract_number) ?? asString(row.contractNumber),
    customerId: asString(row.customer_id) ?? asString(row.customerId),
    customerName: asString(row.customer_name) ?? asString(row.customerName),
    serviceType: asString(row.service_type) ?? asString(row.serviceType),
  };
};

export const normalizeBookingChargeLine = (row: Record<string, unknown>): BookingChargeLine => {
  const context = normalizeBookingContext(row);

  return {
    ...context,
    id: asString(row.id) ?? "",
    description: asString(row.description) ?? "",
    amount: asNumber(row.amount),
    currency: asString(row.currency) ?? "PHP",
    status: asString(row.status) ?? "unbilled",
    createdAt: asString(row.created_at) ?? asString(row.createdAt),
    invoiceId: asString(row.invoice_id) ?? asString(row.invoiceId),
    invoiceNumber: asString(row.invoice_number) ?? asString(row.invoiceNumber),
    category: asString(row.category) ?? asString(row.quotation_category),
    chargeType: asString(row.charge_type),
    sourceId: asString(row.source_id) ?? asString(row.sourceId),
    sourceQuotationItemId:
      asString(row.source_quotation_item_id) ?? asString(row.sourceQuotationItemId),
    sourceBookingId: asString(row.source_booking_id) ?? asString(row.sourceBookingId),
    sourceType: asString(row.source_type) ?? asString(row.sourceType),
    isVirtual: asBoolean(row.is_virtual ?? row.isVirtual),
    catalogItemId: asString(row.catalog_item_id) ?? asString(row.catalogItemId),
    quantity: row.quantity == null ? null : asNumber(row.quantity),
    forexRate: row.forex_rate == null ? null : asNumber(row.forex_rate),
    isTaxed: row.is_taxed == null ? null : asBoolean(row.is_taxed),
  };
};

export const normalizeBookingExpense = (row: Record<string, unknown>): BookingExpense => {
  const context = normalizeBookingContext(row);
  const amount = asNumber(row.amount ?? row.total_amount);

  return {
    ...context,
    id: asString(row.id) ?? "",
    amount,
    currency: asString(row.currency) ?? "PHP",
    status: asString(row.status) ?? "draft",
    createdAt: asString(row.created_at) ?? asString(row.createdAt),
    expenseDate:
      asString(row.expense_date) ??
      asString(row.expenseDate) ??
      asString(row.request_date) ??
      asString(row.created_at) ??
      asString(row.createdAt),
    description: asString(row.description) ?? asString(row.purpose),
    vendorName: asString(row.vendor_name) ?? asString(row.vendorName) ?? asString(row.vendor),
    category:
      asString(row.expense_category) ??
      asString(row.expenseCategory) ??
      asString(row.category),
    isBillable: asBoolean(row.is_billable ?? row.isBillable),
    paymentStatus: asString(row.payment_status) ?? asString(row.paymentStatus),
  };
};

export const normalizeInvoiceFinancialDocument = (
  row: Record<string, unknown>,
): InvoiceFinancialDocument => {
  const totalAmount = asNumber(row.total_amount ?? row.amount ?? row.subtotal);
  const remainingBalance =
    row.remaining_balance == null ? totalAmount : asNumber(row.remaining_balance);

  return {
    id: asString(row.id) ?? "",
    invoiceNumber: asString(row.invoice_number) ?? asString(row.invoiceNumber),
    customerId: asString(row.customer_id) ?? asString(row.customerId),
    customerName: asString(row.customer_name) ?? asString(row.customerName),
    status: asString(row.status) ?? "draft",
    invoiceDate: asString(row.invoice_date) ?? asString(row.created_at),
    dueDate: asString(row.due_date),
    totalAmount,
    remainingBalance,
    projectNumbers: [
      ...new Set(
        [
          asString(row.project_number) ?? asString(row.projectNumber),
          ...asStringArray(row.project_numbers),
        ].filter((entry): entry is string => Boolean(entry)),
      ),
    ],
    contractIds: asStringArray(row.contract_ids),
    bookingIds: [
      ...new Set(
        [
          asString(row.booking_id) ?? asString(row.bookingId),
          ...asStringArray(row.booking_ids),
          ...asStringArray(row.bookingIds),
        ].filter((entry): entry is string => Boolean(entry)),
      ),
    ],
  };
};

export const normalizeBookingInvoiceLink = (
  row: Record<string, unknown>,
  context: BookingFinancialContext,
): BookingInvoiceLink => {
  const normalizedInvoice = normalizeInvoiceFinancialDocument(row);

  return {
    ...context,
    invoiceId: normalizedInvoice.id,
    invoiceNumber: normalizedInvoice.invoiceNumber,
    invoiceDate: normalizedInvoice.invoiceDate,
    dueDate: normalizedInvoice.dueDate,
    totalAmount: normalizedInvoice.totalAmount,
    remainingBalance: normalizedInvoice.remainingBalance,
  };
};

export const normalizeCollectionFinancialRecord = (
  row: Record<string, unknown>,
): CollectionFinancialRecord => ({
  id: asString(row.id) ?? "",
  invoiceId: asString(row.invoice_id) ?? asString(row.invoiceId),
  invoiceNumber: asString(row.invoice_number) ?? asString(row.invoiceNumber),
  customerId: asString(row.customer_id) ?? asString(row.customerId),
  customerName: asString(row.customer_name) ?? asString(row.customerName),
  amount: asNumber(row.amount),
  status: asString(row.status) ?? "posted",
  collectionDate:
    asString(row.collection_date) ?? asString(row.collectionDate) ?? asString(row.created_at),
  projectNumbers: [
    ...new Set(
      [
        asString(row.project_number) ?? asString(row.projectNumber),
        ...asStringArray(row.project_numbers),
      ].filter((entry): entry is string => Boolean(entry)),
    ),
  ],
});

export const normalizeBookingCollectionAllocation = (
  row: Record<string, unknown>,
  context: BookingFinancialContext,
): BookingCollectionAllocation => {
  const collection = normalizeCollectionFinancialRecord(row);

  return {
    ...context,
    collectionId: collection.id,
    invoiceId: collection.invoiceId ?? "",
    invoiceNumber: collection.invoiceNumber,
    collectionDate: collection.collectionDate,
    amount: collection.amount,
  };
};
