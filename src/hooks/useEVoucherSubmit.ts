import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { buildCatalogSnapshot } from "../utils/catalogSnapshot";
import { toast } from "../components/ui/toast-utils";
import { queryKeys } from "../lib/queryKeys";
import {
  logCreation,
  logStatusChange,
  logDeletion,
  type ActivityActor,
} from "../utils/activityLog";
import { determineSubmittedEVoucherStatus } from "../utils/evoucherApproval";

type EVoucherContext =
  | "bd"
  | "accounting"
  | "operations"
  | "collection"
  | "billing"
  | "personal";

interface LineItem {
  id: string;
  particular: string;
  description: string;
  amount: number;
  catalog_item_id?: string | null;
  expense_category?: string;
}

interface EVoucherData {
  requestName: string;
  expenseCategory: string;
  subCategory: string;
  projectNumber?: string;
  invoiceId?: string;
  lineItems: LineItem[];
  totalAmount: number;
  preferredPayment: string;
  vendor: string;
  creditTerms: string;
  paymentSchedule?: string;
  notes?: string;
  requestor: string;
  bookingId?: string;
  transactionType?: string;
  transaction_type?: string;
  isBillable?: boolean;
  sourceAccountId?: string;
  linkedBillings?: { id: string; amount: number }[];
  parentVoucherId?: string;
  parent_voucher_id?: string;
}

type CreatedVoucher = {
  id: string;
  evoucher_number?: string | null;
  voucher_number?: string | null;
  status?: string;
  details?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export function useEVoucherSubmit(
  context: EVoucherContext = "bd",
  actor?: ActivityActor,
) {
  const queryClient = useQueryClient();

  const createId = (prefix: string) =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const getTransactionType = (data?: EVoucherData) => {
    const explicitTransactionType =
      data?.transactionType || data?.transaction_type;

    if (explicitTransactionType) {
      return explicitTransactionType;
    }

    switch (context) {
      case "bd":
        return "budget_request";
      case "accounting":
        return "expense";
      case "operations":
        return "expense";
      case "personal":
        return "reimbursement";
      case "collection":
        return "collection";
      case "billing":
        return "billing";
      default:
        return "expense";
    }
  };

  const getSourceModule = () =>
    context === "personal" ? "accounting" : context;

  const assertBookingLinkedWhenRequired = (data: EVoucherData) => {
    const transactionType = getTransactionType(data);
    const requiresBookingLink =
      context === "operations" &&
      (transactionType === "expense" || transactionType === "budget_request");

    if (requiresBookingLink && !data.bookingId?.trim()) {
      throw new Error("A real booking is required for Operations expenses.");
    }
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.evouchers.all() });
  };

  const cleanupVoucherOnFailure = async (evoucherId: string) => {
    const { error } = await supabase.from("evouchers").delete().eq("id", evoucherId);

    if (error) {
      console.error("Failed to clean up partially-created E-Voucher:", {
        evoucherId,
        error,
      });
    }
  };

  const buildVoucherDetails = (data: EVoucherData) => ({
    invoice_id: data.invoiceId || null,
    requestor_name: data.requestor || null,
    requestor_id: actor?.id || data.requestor || null,
    requestor_department: actor?.department || context,
    parent_voucher_id: data.parentVoucherId || data.parent_voucher_id || null,
    due_date: data.paymentSchedule || null,
    is_billable: data.isBillable ?? false,
    source_account_id: data.sourceAccountId || null,
    linked_billings:
      data.transactionType === "collection" ? data.linkedBillings || [] : [],
    line_items: data.lineItems || [],
  });

  const buildVoucherInsert = (data: EVoucherData, status: string) => {
    const now = new Date().toISOString();
    const descriptionPrefix = data.isBillable ? "[BILLABLE] " : "";

    return {
      id: createId("evoucher"),
      evoucher_number: `EV-${Date.now()}`,
      transaction_type: getTransactionType(data),
      source_module: getSourceModule(),
      booking_id: data.bookingId || null,
      project_number: data.projectNumber || null,
      vendor_name: data.vendor || null,
      amount: data.totalAmount,
      currency: "PHP",
      payment_method: data.preferredPayment || null,
      credit_terms: data.creditTerms || null,
      description: descriptionPrefix + data.requestName,
      purpose: data.requestName,
      status,
      gl_category: data.expenseCategory,
      gl_sub_category: data.subCategory || "",
      notes: data.notes || null,
      created_by: actor?.id || null,
      created_by_name: actor?.name || data.requestor || null,
      details: buildVoucherDetails(data),
      created_at: now,
      updated_at: now,
    };
  };

  const normalizeCreatedVoucher = (created: CreatedVoucher) => {
    const details = created.details || {};

    return {
      ...created,
      voucher_number: created.voucher_number ?? created.evoucher_number ?? null,
      requestor_name:
        created.requestor_name ??
        (typeof details.requestor_name === "string"
          ? details.requestor_name
          : null),
      requestor_id:
        created.requestor_id ??
        (typeof details.requestor_id === "string"
          ? details.requestor_id
          : null),
      requestor_department:
        created.requestor_department ??
        (typeof details.requestor_department === "string"
          ? details.requestor_department
          : null),
      due_date:
        created.due_date ??
        (typeof details.due_date === "string" ? details.due_date : null),
      is_billable:
        created.is_billable ??
        (typeof details.is_billable === "boolean"
          ? details.is_billable
          : false),
      source_account_id:
        created.source_account_id ??
        (typeof details.source_account_id === "string"
          ? details.source_account_id
          : null),
      invoice_id:
        created.invoice_id ??
        (typeof details.invoice_id === "string" ? details.invoice_id : null),
      linked_billings:
        created.linked_billings ??
        (Array.isArray(details.linked_billings) ? details.linked_billings : []),
      line_items:
        created.line_items ??
        (Array.isArray(details.line_items) ? details.line_items : []),
    };
  };

  const buildHistoryEntry = (
    evoucherId: string,
    action: string,
    newStatus: string,
    previousStatus?: string,
    notes?: string,
  ) => ({
    id: createId("EH"),
    evoucher_id: evoucherId,
    action,
    status: newStatus,
    user_id: actor?.id || null,
    user_name: actor?.name || null,
    user_role: actor?.department || context,
    remarks: notes || null,
    metadata: {
      previous_status: previousStatus || null,
      new_status: newStatus,
      notes: notes || null,
    },
    created_at: new Date().toISOString(),
  });

  const insertHistoryEntries = async (
    entries: ReturnType<typeof buildHistoryEntry>[],
  ) => {
    const { error } = await supabase.from("evoucher_history").insert(entries);

    if (error) {
      console.warn("Voucher history logging failed:", error);
      toast.warning(`Voucher created, but history logging failed: ${error.message}`);
      return false;
    }

    return true;
  };

  const insertLineItems = async (evoucherId: string, lineItems: LineItem[]) => {
    if (!lineItems || lineItems.length === 0) return;

    const rows = lineItems.map((item, index) => ({
      evoucher_id: evoucherId,
      particular: item.particular,
      description: item.description,
      amount: item.amount,
      catalog_item_id: item.catalog_item_id || null,
      catalog_snapshot: item.catalog_item_id
        ? buildCatalogSnapshot(
            { description: item.particular, amount: item.amount },
            item.expense_category || null
          )
        : null,
      sort_order: index,
    }));

    const { error } = await supabase.from("evoucher_line_items").insert(rows);
    if (error) throw new Error(`Line items failed: ${error.message}`);
  };

  const draftMutation = useMutation({
    mutationFn: async (data: EVoucherData) => {
      assertBookingLinkedWhenRequired(data);

      const payload = buildVoucherInsert(data, "draft");

      console.log("Creating E-Voucher draft:", payload);

      const { data: created, error: insertErr } = await supabase
        .from("evouchers")
        .insert(payload)
        .select()
        .single();

      if (insertErr) throw new Error(insertErr.message);
      try {
        await insertLineItems(created.id, data.lineItems);
      } catch (lineItemError) {
        await cleanupVoucherOnFailure(created.id);
        throw lineItemError;
      }

      const normalized = normalizeCreatedVoucher(created);
      if (actor) {
        logCreation(
          "evoucher",
          normalized.id,
          normalized.voucher_number ?? normalized.id,
          actor,
        );
      }

      console.log("E-Voucher draft created:", normalized);
      return normalized;
    },
    onSuccess: (created) => {
      toast.success(`Draft saved successfully! Ref: ${created.voucher_number}`);
      invalidate();
    },
    onError: (err) => {
      const errorMessage =
        err instanceof Error ? err.message : "An unexpected error occurred";
      console.error("Error creating E-Voucher draft:", err);
      toast.error(`Failed to save draft: ${errorMessage}`);
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: EVoucherData) => {
      assertBookingLinkedWhenRequired(data);

      if (!data.requestName || data.requestName.trim() === "") {
        throw new Error("Request name is required");
      }
      if (!data.expenseCategory) {
        throw new Error("Expense category is required");
      }
      if (!data.lineItems || data.lineItems.length === 0) {
        throw new Error("At least one line item is required");
      }
      if (!data.vendor || data.vendor.trim() === "") {
        throw new Error("Vendor is required");
      }

      const payload = buildVoucherInsert(data, "draft");

      console.log(
        "Creating E-Voucher for submission:",
        JSON.stringify(payload, null, 2),
      );

      const { data: created, error: insertErr } = await supabase
        .from("evouchers")
        .insert(payload)
        .select()
        .single();

      if (insertErr) throw new Error(insertErr.message);
      try {
        await insertLineItems(created.id, data.lineItems);
      } catch (lineItemError) {
        await cleanupVoucherOnFailure(created.id);
        throw lineItemError;
      }

      const normalized = normalizeCreatedVoucher(created);
      const createdId = normalized.id;
      const createdVoucherNumber =
        normalized.voucher_number ?? normalized.evoucher_number;

      if (actor) {
        logCreation(
          "evoucher",
          createdId,
          createdVoucherNumber ?? createdId,
          actor,
        );
      }

      // Accounting and Executive-created e-vouchers skip manager/CEO approval
      // and go straight to the disbursement queue.
      const submittedStatus = determineSubmittedEVoucherStatus(context, actor);

      const { error: submitErr } = await supabase
        .from("evouchers")
        .update({ status: submittedStatus, updated_at: new Date().toISOString() })
        .eq("id", createdId);

      if (submitErr) throw new Error(submitErr.message);

      if (actor) {
        logStatusChange(
          "evoucher",
          createdId,
          createdVoucherNumber ?? createdId,
          "draft",
          submittedStatus,
          actor,
        );
      }

      await insertHistoryEntries([
        buildHistoryEntry(createdId, "Submitted for Approval", submittedStatus, "draft"),
      ]);

      console.log("E-Voucher submitted for approval");
      return { ...normalized, status: submittedStatus };
    },
    onSuccess: (created) => {
      const successMessage =
        context === "bd"
          ? `Budget Request ${created.voucher_number} submitted successfully!`
          : context === "collection"
            ? `Collection ${created.voucher_number} recorded successfully!`
            : context === "billing"
              ? `Invoice ${created.voucher_number} created successfully!`
              : `Expense ${created.voucher_number} submitted successfully!`;
      toast.success(successMessage);
      invalidate();
    },
    onError: (err) => {
      const errorMessage =
        err instanceof Error ? err.message : "An unexpected error occurred";
      console.error("Error submitting E-Voucher:", err);
      toast.error(`Failed to submit: ${errorMessage}`);
    },
  });

  const autoApproveMutation = useMutation({
    mutationFn: async (data: EVoucherData) => {
      assertBookingLinkedWhenRequired(data);

      const payload = buildVoucherInsert(data, "Approved");

      console.log("Auto-approving E-Voucher:", payload);

      const { data: created, error: insertErr } = await supabase
        .from("evouchers")
        .insert(payload)
        .select()
        .single();

      if (insertErr) throw new Error(insertErr.message);
      try {
        await insertLineItems(created.id, data.lineItems);
      } catch (lineItemError) {
        await cleanupVoucherOnFailure(created.id);
        throw lineItemError;
      }

      const normalized = normalizeCreatedVoucher(created);
      if (actor) {
        logCreation(
          "evoucher",
          normalized.id,
          normalized.voucher_number ?? normalized.id,
          actor,
        );
      }

      await insertHistoryEntries([
        buildHistoryEntry(normalized.id, "Created", "draft"),
        buildHistoryEntry(normalized.id, "Auto-Approved", "Approved", "draft"),
      ]);

      console.log("E-Voucher auto-approved:", normalized);
      return normalized;
    },
    onSuccess: (created) => {
      toast.success(`Voucher ${created.voucher_number} posted successfully!`);
      invalidate();
    },
    onError: (err) => {
      const errorMessage =
        err instanceof Error ? err.message : "An unexpected error occurred";
      console.error("Error auto-approving E-Voucher:", err);
      toast.error(`Failed to auto-approve: ${errorMessage}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      console.log("Deleting E-Voucher:", id);

      // Clear dependent rows first — avoids FK violations if CASCADE is not set
      await supabase.from("evoucher_line_items").delete().eq("evoucher_id", id);
      await supabase.from("evoucher_history").delete().eq("evoucher_id", id);

      const { error: deleteErr, count } = await supabase
        .from("evouchers")
        .delete({ count: "exact" })
        .eq("id", id);

      if (deleteErr) throw new Error(deleteErr.message);

      // Supabase returns no error but count=0 when RLS silently blocks the delete
      if (!count || count === 0) {
        throw new Error("Delete failed — the record could not be removed. Check database permissions.");
      }

      if (actor) logDeletion("evoucher", id, id, actor);
      console.log("E-Voucher deleted:", id);
      return true;
    },
    onSuccess: () => {
      toast.success("Expense deleted successfully");
      invalidate();
    },
    onError: (err) => {
      const errorMessage =
        err instanceof Error ? err.message : "An unexpected error occurred";
      console.error("Error deleting expense:", err);
      toast.error(`Failed to delete: ${errorMessage}`);
    },
  });

  const isSaving =
    draftMutation.isPending ||
    submitMutation.isPending ||
    autoApproveMutation.isPending ||
    deleteMutation.isPending;

  const activeError =
    draftMutation.error ||
    submitMutation.error ||
    autoApproveMutation.error ||
    deleteMutation.error;

  const error = activeError ? (activeError as Error).message : null;

  return {
    createDraft: draftMutation.mutateAsync,
    submitForApproval: submitMutation.mutateAsync,
    autoApprove: autoApproveMutation.mutateAsync,
    deleteEVoucher: deleteMutation.mutateAsync,
    isSaving,
    error,
  };
}
