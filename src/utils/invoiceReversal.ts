import { supabase } from "./supabase/client";
import { NON_APPLIED_COLLECTION_STATUSES } from "./collectionResolution";

const ACTIVE_INVOICE_STATUSES = new Set(["draft", "posted", "approved", "paid", "open", "partial", "sent"]);
const ACTIVE_INVOICE_PAYMENT_STATUSES = new Set(["paid", "partial"]);

export const REVERSAL_DRAFT_STATUS = "reversal_draft";
export const REVERSAL_POSTED_STATUS = "reversal_posted";
export const REVERSED_INVOICE_STATUS = "reversed";

export interface InvoiceCollectionSummary {
  collectionCount: number;
  totalCollected: number;
}

const getInvoiceStatus = (invoice: any): string => String(invoice?.status || "").toLowerCase();
const getInvoicePaymentStatus = (invoice: any): string => String(invoice?.payment_status || "").toLowerCase();

export const isInvoiceReversalDocument = (invoice: any): boolean => (
  Boolean(invoice?.metadata?.reversal_of_invoice_id)
);

export const isInvoiceReversalDraft = (invoice: any): boolean => (
  isInvoiceReversalDocument(invoice) && getInvoiceStatus(invoice) === REVERSAL_DRAFT_STATUS
);

export const isInvoiceReversalPosted = (invoice: any): boolean => (
  isInvoiceReversalDocument(invoice) && getInvoiceStatus(invoice) === REVERSAL_POSTED_STATUS
);

export const isInvoiceReversedOriginal = (invoice: any): boolean => (
  !isInvoiceReversalDocument(invoice) && getInvoiceStatus(invoice) === REVERSED_INVOICE_STATUS
);

export const isInvoiceFinanciallyActive = (invoice: any): boolean => {
  if (!invoice) return false;
  if (isInvoiceReversalDocument(invoice)) return false;
  if (getInvoiceStatus(invoice) === REVERSED_INVOICE_STATUS) return false;

  return (
    ACTIVE_INVOICE_STATUSES.has(getInvoiceStatus(invoice)) ||
    ACTIVE_INVOICE_PAYMENT_STATUSES.has(getInvoicePaymentStatus(invoice))
  );
};

export const isInvoiceVisibleDocument = (invoice: any): boolean => (
  isInvoiceFinanciallyActive(invoice) ||
  isInvoiceReversalDraft(invoice) ||
  isInvoiceReversalPosted(invoice) ||
  isInvoiceReversedOriginal(invoice)
);

export const getInvoiceLifecycleStatus = (invoice: any): "reversal_draft" | "reversed" | null => {
  if (isInvoiceReversalDraft(invoice)) return "reversal_draft";
  if (isInvoiceReversalPosted(invoice) || isInvoiceReversedOriginal(invoice)) return "reversed";
  return null;
};

export async function getInvoiceCollectionSummary(invoiceId: string): Promise<InvoiceCollectionSummary> {
  const { data, error } = await supabase
    .from("collections")
    .select("id,amount,status,invoice_id,linked_billings");

  if (error) throw error;

  const linkedCollections = (data || []).filter((row: any) => {
    const status = String(row.status || "").toLowerCase();
    if (NON_APPLIED_COLLECTION_STATUSES.has(status)) return false;

    if (row.invoice_id === invoiceId) return true;

    const linkedBillings = Array.isArray(row.linked_billings) ? row.linked_billings : [];
    return linkedBillings.some((entry: any) => {
      const linkedInvoiceId = entry?.id || entry?.invoice_id || entry?.invoiceId;
      return linkedInvoiceId === invoiceId;
    });
  });

  return {
    collectionCount: linkedCollections.length,
    totalCollected: linkedCollections.reduce((sum: number, row: any) => sum + (Number(row.amount) || 0), 0),
  };
}

export async function findInvoiceReversalDocument(originalInvoiceId: string): Promise<any | null> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).find((invoice: any) => (
    invoice?.metadata?.reversal_of_invoice_id === originalInvoiceId
  )) || null;
}

export async function findInvoiceReversalDraft(originalInvoiceId: string): Promise<any | null> {
  const reversalDocument = await findInvoiceReversalDocument(originalInvoiceId);
  return isInvoiceReversalDraft(reversalDocument) ? reversalDocument : null;
}

const toNegative = (value: unknown): number => -Math.abs(Number(value) || 0);

export async function createInvoiceReversalDraft(originalInvoice: any): Promise<any> {
  const existingDraft = await findInvoiceReversalDocument(originalInvoice.id);
  if (existingDraft) {
    return existingDraft;
  }

  const collectionSummary = await getInvoiceCollectionSummary(originalInvoice.id);
  if (collectionSummary.collectionCount > 0) {
    throw new Error("Collections already exist on this invoice. Resolve customer credit or refund handling before creating a reversal draft.");
  }

  const now = new Date().toISOString();
  const originalLineItems = Array.isArray(originalInvoice.line_items) ? originalInvoice.line_items : [];
  const lineItems = originalLineItems.map((item: any) => ({
    ...item,
    unit_price: toNegative(item.unit_price ?? item.price ?? item.amount),
    amount: toNegative(item.amount),
  }));

  const reversalDraft = {
    invoice_number: `REV-${Date.now().toString(36).toUpperCase()}`,
    project_number: originalInvoice.project_number || null,
    project_refs: Array.isArray(originalInvoice.project_refs) ? originalInvoice.project_refs : [],
    customer_id: originalInvoice.customer_id || null,
    customer_name: originalInvoice.customer_name || "",
    customer_address: originalInvoice.customer_address || null,
    billed_to_type: originalInvoice.billed_to_type || null,
    billed_to_consignee_id: originalInvoice.billed_to_consignee_id || null,
    booking_id: originalInvoice.booking_id || null,
    booking_ids: Array.isArray(originalInvoice.booking_ids) ? originalInvoice.booking_ids : [],
    contract_number: originalInvoice.contract_number || null,
    contract_refs: Array.isArray(originalInvoice.contract_refs) ? originalInvoice.contract_refs : [],
    billing_item_ids: [],
    invoice_date: now.split("T")[0],
    due_date: now.split("T")[0],
    notes: [
      `Reversal draft for ${originalInvoice.invoice_number || originalInvoice.id}`,
      originalInvoice.notes || "",
    ].filter(Boolean).join("\n\n"),
    user_id: originalInvoice.user_id || null,
    created_by_name: originalInvoice.created_by_name || "System",
    currency: originalInvoice.currency || "PHP",
    exchange_rate: originalInvoice.exchange_rate || 1,
    original_currency: originalInvoice.original_currency || originalInvoice.currency || "PHP",
    line_items: lineItems,
    subtotal: toNegative(originalInvoice.subtotal),
    total_amount: toNegative(originalInvoice.total_amount || originalInvoice.amount),
    tax_amount: toNegative(originalInvoice.tax_amount),
    revenue_account_id: originalInvoice.revenue_account_id || null,
    status: REVERSAL_DRAFT_STATUS,
    payment_status: "unpaid",
    metadata: {
      ...(originalInvoice.metadata || {}),
      reversal_of_invoice_id: originalInvoice.id,
      reversal_of_invoice_number: originalInvoice.invoice_number || null,
      reversal_type: "full",
      reversal_created_at: now,
    },
    created_at: now,
  };

  const { data, error } = await supabase
    .from("invoices")
    .insert(reversalDraft)
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function completeInvoiceReversalDraft(reversalDraft: any): Promise<{ originalInvoice: any; reversalInvoice: any }> {
  if (!isInvoiceReversalDraft(reversalDraft)) {
    throw new Error("Only reversal drafts can be completed.");
  }

  const originalInvoiceId = reversalDraft?.metadata?.reversal_of_invoice_id;
  if (!originalInvoiceId) {
    throw new Error("This reversal draft is missing its source invoice link.");
  }

  const collectionSummary = await getInvoiceCollectionSummary(originalInvoiceId);
  if (collectionSummary.collectionCount > 0) {
    throw new Error("Collections already exist on the original invoice. Resolve customer credit or refund handling before completing the reversal.");
  }

  const { data: originalInvoice, error: originalInvoiceError } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", originalInvoiceId)
    .maybeSingle();

  if (originalInvoiceError) throw originalInvoiceError;
  if (!originalInvoice) {
    throw new Error("The original invoice could not be found.");
  }

  const now = new Date().toISOString();

  const [originalUpdate, reversalUpdate] = await Promise.all([
    supabase
      .from("invoices")
      .update({
        status: REVERSED_INVOICE_STATUS,
        payment_status: REVERSED_INVOICE_STATUS,
        remaining_balance: 0,
        amount_due: 0,
        metadata: {
          ...(originalInvoice.metadata || {}),
          reversed_by_invoice_id: reversalDraft.id,
          reversed_by_invoice_number: reversalDraft.invoice_number || null,
          reversal_completed_at: now,
        },
      })
      .eq("id", originalInvoiceId)
      .select()
      .single(),
    supabase
      .from("invoices")
      .update({
        status: REVERSAL_POSTED_STATUS,
        payment_status: REVERSED_INVOICE_STATUS,
        remaining_balance: 0,
        amount_due: 0,
        metadata: {
          ...(reversalDraft.metadata || {}),
          reversal_completed_at: now,
          reversal_completed_from_invoice_id: originalInvoiceId,
          reversal_completed_from_invoice_number: originalInvoice.invoice_number || null,
        },
      })
      .eq("id", reversalDraft.id)
      .select()
      .single(),
  ]);

  if (originalUpdate.error) throw originalUpdate.error;
  if (reversalUpdate.error) throw reversalUpdate.error;

  return {
    originalInvoice: originalUpdate.data,
    reversalInvoice: reversalUpdate.data,
  };
}
