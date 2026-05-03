import { isInvoiceVisibleDocument } from "./invoiceReversal";

/** Raw DB row type — used for Supabase query results */
type RawRow = Record<string, unknown>;

type LinkedBookingInput = string | { bookingId?: string; id?: string };

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const collectLinkedBookingIds = (linkedBookings: LinkedBookingInput[] = []): string[] => {
  const ids = linkedBookings
    .map((entry) => {
      if (typeof entry === "string") return asString(entry);
      return asString(entry.bookingId) ?? asString(entry.id);
    })
    .filter((entry): entry is string => Boolean(entry));

  return [...new Set(ids)];
};

const normalizeServiceKey = (value: unknown): string | null => {
  const normalized = asString(value);
  return normalized ? normalized.toLowerCase() : null;
};

export const buildServiceToBookingMap = (
  linkedBookings: Array<{ bookingId?: string; id?: string; serviceType?: string; service_type?: string }> = [],
): Map<string, string> => {
  const map = new Map<string, string>();

  linkedBookings.forEach((entry) => {
    const serviceKey = normalizeServiceKey(entry.serviceType ?? entry.service_type);
    const bookingId = asString(entry.bookingId) ?? asString(entry.id);

    if (serviceKey && bookingId) {
      map.set(serviceKey, bookingId);
    }
  });

  return map;
};

export const resolveBookingIdForService = ({
  serviceType,
  bookingId,
  linkedBookings,
}: {
  serviceType?: string;
  bookingId?: string;
  linkedBookings?: Array<{ bookingId?: string; id?: string; serviceType?: string; service_type?: string }>;
}): string | null => {
  const directBookingId = asString(bookingId);
  if (directBookingId) return directBookingId;

  const serviceKey = normalizeServiceKey(serviceType);
  if (!serviceKey || !linkedBookings?.length) return null;

  return buildServiceToBookingMap(linkedBookings).get(serviceKey) ?? null;
};

const hasBookingMatch = (row: RawRow, bookingIds: Set<string>): boolean => {
  const directBookingId = asString(row.booking_id) ?? asString(row.bookingId);
  const sourceBookingId = asString(row.source_booking_id) ?? asString(row.sourceBookingId);
  const bookingIdsList = Array.isArray(row.booking_ids) ? row.booking_ids : row.bookingIds;

  if (directBookingId && bookingIds.has(directBookingId)) return true;
  if (sourceBookingId && bookingIds.has(sourceBookingId)) return true;
  if (Array.isArray(bookingIdsList)) {
    return bookingIdsList.some((entry: unknown) => {
      const normalized = asString(entry);
      return normalized ? bookingIds.has(normalized) : false;
    });
  }

  return false;
};

const hasLegacyContainerMatch = (row: RawRow, containerReference?: string): boolean => {
  if (!containerReference) return false;

  return (
    asString(row.project_number) === containerReference ||
    asString(row.projectNumber) === containerReference ||
    asString(row.quotation_number) === containerReference ||
    asString(row.contract_number) === containerReference ||
    asString(row.quote_number) === containerReference
  );
};

export const isActiveInvoice = (row: RawRow): boolean => {
  return isInvoiceVisibleDocument(row);
};

export const filterBillingItemsForScope = (
  rows: RawRow[],
  linkedBookingIds: string[],
  containerReference?: string,
): RawRow[] => {
  const bookingIds = new Set(linkedBookingIds);

  return rows.filter((row) => hasBookingMatch(row, bookingIds) || hasLegacyContainerMatch(row, containerReference));
};

export const filterInvoicesForScope = (
  rows: RawRow[],
  linkedBookingIds: string[],
  containerReference?: string,
): RawRow[] => {
  const bookingIds = new Set(linkedBookingIds);

  return rows.filter((row) => {
    if (!isActiveInvoice(row)) return false;
    return hasBookingMatch(row, bookingIds) || hasLegacyContainerMatch(row, containerReference);
  });
};

export const filterCollectionsForScope = (
  rows: RawRow[],
  invoiceIds: string[],
  containerReference?: string,
): RawRow[] => {
  const invoiceIdSet = new Set(invoiceIds.filter(Boolean));

  return rows.filter((row) => {
    const invoiceId = asString(row.invoice_id) ?? asString(row.invoiceId);
    if (invoiceId && invoiceIdSet.has(invoiceId)) return true;

    const linkedBillings = Array.isArray(row.linked_billings)
      ? row.linked_billings
      : Array.isArray(row.linkedBillings)
        ? row.linkedBillings
        : [];

    const hasLinkedInvoiceMatch = (linkedBillings as RawRow[]).some((entry) => {
      const linkedInvoiceId =
        asString(entry?.id) ??
        asString(entry?.invoice_id) ??
        asString(entry?.invoiceId);
      return linkedInvoiceId ? invoiceIdSet.has(linkedInvoiceId) : false;
    });

    if (hasLinkedInvoiceMatch) return true;
    return hasLegacyContainerMatch(row, containerReference);
  });
};

export const mapExpenseRowsForScope = (
  rows: RawRow[],
  linkedBookingIds: string[],
  containerReference?: string,
): RawRow[] => {
  const bookingIds = new Set(linkedBookingIds);

  return rows
    .filter((row) => {
      const status = ((row.status as string) || "").toLowerCase();
      const isRelevant = hasBookingMatch(row, bookingIds) || hasLegacyContainerMatch(row, containerReference);
      if (!isRelevant) return false;
      return ["approved", "posted", "paid", "partial"].includes(status);
    })
    .map((row): RawRow => ({
      id: row.id,
      expenseName: row.receipt_number || row.expense_name || row.id,
      expenseCategory: row.category || row.expense_category || "General",
      vendorName: row.vendor_name || row.payee_name || "—",
      description: row.description || row.purpose || "",
      bookingId: row.booking_id || "",
      expenseDate: row.expense_date || row.created_at,
      createdAt: row.created_at,
      status: row.status || "draft",
      // `amount` keeps the original-currency value so the existing tables and
      // edit forms render and round-trip correctly. Aggregations should read
      // `base_amount` (PHP) instead — see baseAmt() in financialCalculations.
      amount: row.amount ?? row.total_amount ?? 0,
      currency: row.currency || "PHP",
      base_amount: row.base_amount ?? row.amount ?? row.total_amount ?? 0,
      base_currency: row.base_currency ?? "PHP",
      exchange_rate: row.exchange_rate ?? 1,
      isBillable: row.is_billable || (row.details as any)?.is_billable || false,
      serviceType: row.service_type,
      projectNumber: row.project_number,
      contractId: row.contract_id || null,
    }));
};

export const mapEvoucherExpensesForScope = (
  rows: RawRow[],
  linkedBookingIds: string[],
  containerReference?: string,
): RawRow[] => {
  const bookingIds = new Set(linkedBookingIds);

  return rows
    .filter((row) => {
      const type = ((row.transaction_type as string) || "").toLowerCase();
      if (!["expense", "budget_request"].includes(type)) return false;

      const status = ((row.status as string) || "").toLowerCase();
      const isRelevant = hasBookingMatch(row, bookingIds) || hasLegacyContainerMatch(row, containerReference);
      if (!isRelevant) return false;

      return ["approved", "posted", "paid", "partial"].includes(status);
    })
    .map((row): RawRow => ({
      id: row.id,
      evoucher_id: row.id,
      created_at: row.created_at || row.request_date,
      description: row.purpose || row.description,
      // amount/currency stay in original units so display and edit flows are
      // consistent. base_amount (PHP) is what reports should aggregate on.
      amount: row.total_amount ?? row.amount ?? 0,
      total_amount: row.total_amount ?? row.amount ?? 0,
      currency: row.currency || "PHP",
      base_amount: row.base_amount ?? row.total_amount ?? row.amount ?? 0,
      base_currency: row.base_currency ?? "PHP",
      exchange_rate: row.exchange_rate ?? 1,
      status: row.status,
      expense_category: row.expense_category,
      is_billable: row.is_billable,
      project_number: row.project_number,
      booking_id: row.booking_id || "",
      vendor_name: row.vendor_name,
      contract_id: row.contract_id || null,
      payment_status: ((row.status as string) || "").toLowerCase() === "paid" ? "paid" : "unpaid",
    }));
};
