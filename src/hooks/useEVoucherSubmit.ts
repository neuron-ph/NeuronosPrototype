import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from '../utils/supabase/client';
import { toast } from '../components/ui/toast-utils';
import { queryKeys } from "../lib/queryKeys";
import { logCreation, logStatusChange, logDeletion, type ActivityActor } from '../utils/activityLog';

type EVoucherContext = "bd" | "accounting" | "operations" | "collection" | "billing";

interface LineItem {
  id: string;
  particular: string;
  description: string;
  amount: number;
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
  isBillable?: boolean;
  sourceAccountId?: string;
  linkedBillings?: { id: string; amount: number }[];
}

export function useEVoucherSubmit(context: EVoucherContext = "bd", actor?: ActivityActor) {
  const queryClient = useQueryClient();

  const getTransactionType = (data?: EVoucherData) => {
    if (data?.transactionType) {
      return data.transactionType;
    }
    switch (context) {
      case "bd":
        return "budget_request";
      case "accounting":
        return "expense";
      case "operations":
        return "expense";
      case "collection":
        return "collection";
      case "billing":
        return "billing";
      default:
        return "expense";
    }
  };

  const getSourceModule = () => context;

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

  const draftMutation = useMutation({
    mutationFn: async (data: EVoucherData) => {
      assertBookingLinkedWhenRequired(data);

      const descriptionPrefix = data.isBillable ? "[BILLABLE] " : "";

      const payload = {
        transaction_type: getTransactionType(data),
        source_module: getSourceModule(),
        purpose: data.requestName,
        description: descriptionPrefix + data.requestName,
        expense_category: data.expenseCategory,
        sub_category: data.subCategory,
        project_number: data.projectNumber || null,
        invoice_id: data.invoiceId || null,
        booking_id: data.bookingId || null,
        line_items: data.lineItems,
        linked_billings: data.transactionType === "collection" ? (data as any).linkedBillings : undefined,
        total_amount: data.totalAmount,
        payment_method: data.preferredPayment,
        vendor_name: data.vendor,
        credit_terms: data.creditTerms,
        due_date: data.paymentSchedule || null,
        notes: data.notes || null,
        requestor_name: data.requestor,
        is_billable: data.isBillable,
        source_account_id: data.sourceAccountId,
        status: "draft",
      };

      console.log('Creating E-Voucher draft:', payload);

      const voucherNumber = `EV-${Date.now()}`;
      const evoucherId = `evoucher-${Date.now()}`;
      const newEVoucher = {
        ...payload,
        id: evoucherId,
        voucher_number: voucherNumber,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: created, error: insertErr } = await supabase
        .from('evouchers')
        .insert(newEVoucher)
        .select()
        .single();

      if (insertErr) throw new Error(insertErr.message);

      if (actor) logCreation("evoucher", created.id, created.voucher_number ?? created.id, actor);
      console.log('E-Voucher draft created:', created);
      return created;
    },
    onSuccess: (created) => {
      toast.success(`Draft saved successfully! Ref: ${created.voucher_number}`);
      invalidate();
    },
    onError: (err) => {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      console.error('Error creating E-Voucher draft:', err);
      toast.error(`Failed to save draft: ${errorMessage}`);
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: EVoucherData) => {
      assertBookingLinkedWhenRequired(data);

      if (!data.requestName || data.requestName.trim() === '') {
        throw new Error('Request name is required');
      }
      if (!data.expenseCategory) {
        throw new Error('Expense category is required');
      }
      if (!data.lineItems || data.lineItems.length === 0) {
        throw new Error('At least one line item is required');
      }
      if (!data.vendor || data.vendor.trim() === '') {
        throw new Error('Vendor is required');
      }

      const descriptionPrefix = data.isBillable ? "[BILLABLE] " : "";

      const payload = {
        transaction_type: getTransactionType(data),
        source_module: getSourceModule(),
        purpose: data.requestName,
        description: descriptionPrefix + data.requestName,
        expense_category: data.expenseCategory,
        sub_category: data.subCategory || '',
        project_number: data.projectNumber || null,
        invoice_id: data.invoiceId || null,
        booking_id: data.bookingId || null,
        line_items: data.lineItems,
        linked_billings: data.transactionType === "collection" ? (data as any).linkedBillings : undefined,
        total_amount: data.totalAmount,
        amount: data.totalAmount,
        payment_method: data.preferredPayment,
        vendor_name: data.vendor,
        credit_terms: data.creditTerms,
        due_date: data.paymentSchedule || null,
        notes: data.notes || '',
        requestor_name: data.requestor,
        requestor_id: data.requestor,
        requestor_department: context,
        is_billable: data.isBillable,
        source_account_id: data.sourceAccountId,
        status: "draft",
      };

      console.log('📤 Creating E-Voucher for submission:', JSON.stringify(payload, null, 2));

      const voucherNumber = `EV-${Date.now()}`;
      const evoucherId = `evoucher-${Date.now()}`;
      const newEVoucher = {
        ...payload,
        id: evoucherId,
        voucher_number: voucherNumber,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: created, error: insertErr } = await supabase
        .from('evouchers')
        .insert(newEVoucher)
        .select()
        .single();

      if (insertErr) throw new Error(insertErr.message);

      const createdId = created.id;
      const createdVoucherNumber = created.voucher_number;

      if (actor) logCreation("evoucher", createdId, createdVoucherNumber ?? createdId, actor);
      console.log('E-Voucher created:', createdVoucherNumber);
      console.log('Submitting E-Voucher for approval...');

      const { error: submitErr } = await supabase
        .from('evouchers')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', createdId);

      if (submitErr) throw new Error(submitErr.message);
      if (actor) logStatusChange("evoucher", createdId, createdVoucherNumber ?? createdId, "draft", "pending", actor);

      await supabase.from('evoucher_history').insert({
        id: `EH-${Date.now()}`,
        evoucher_id: createdId,
        action: 'Submitted for Approval',
        previous_status: 'draft',
        new_status: 'pending',
        performed_by: data.requestor,
        performed_by_name: data.requestor,
        performed_by_role: 'User',
        created_at: new Date().toISOString()
      });

      console.log('E-Voucher submitted for approval');
      return { ...created, status: 'pending' };
    },
    onSuccess: (created) => {
      const successMessage =
        context === "bd" ? `Budget Request ${created.voucher_number} submitted successfully!` :
        context === "collection" ? `Collection ${created.voucher_number} recorded successfully!` :
        context === "billing" ? `Invoice ${created.voucher_number} created successfully!` :
        `Expense ${created.voucher_number} submitted successfully!`;
      toast.success(successMessage);
      invalidate();
    },
    onError: (err) => {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      console.error('Error submitting E-Voucher:', err);
      toast.error(`Failed to submit: ${errorMessage}`);
    },
  });

  const autoApproveMutation = useMutation({
    mutationFn: async (data: EVoucherData) => {
      assertBookingLinkedWhenRequired(data);

      const descriptionPrefix = data.isBillable ? "[BILLABLE] " : "";

      const payload = {
        transaction_type: getTransactionType(data),
        source_module: getSourceModule(),
        purpose: data.requestName,
        description: descriptionPrefix + data.requestName,
        expense_category: data.expenseCategory,
        sub_category: data.subCategory || '',
        project_number: data.projectNumber || null,
        invoice_id: data.invoiceId || null,
        booking_id: data.bookingId || null,
        line_items: data.lineItems,
        linked_billings: data.transactionType === "collection" ? (data as any).linkedBillings : undefined,
        total_amount: data.totalAmount,
        amount: data.totalAmount,
        payment_method: data.preferredPayment,
        vendor_name: data.vendor,
        credit_terms: data.creditTerms,
        due_date: data.paymentSchedule || null,
        notes: data.notes || '',
        requestor_name: data.requestor,
        requestor_id: data.requestor,
        requestor_department: context,
        is_billable: data.isBillable,
        source_account_id: data.sourceAccountId,
        user_id: data.requestor,
        user_name: data.requestor,
        user_role: context
      };

      console.log('⚡ Auto-approving E-Voucher:', payload);

      const voucherNumber = `EV-${Date.now()}`;
      const evoucherId = `evoucher-${Date.now()}`;
      const newEVoucher = {
        ...payload,
        id: evoucherId,
        voucher_number: voucherNumber,
        status: 'Approved',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: created, error: insertErr } = await supabase
        .from('evouchers')
        .insert(newEVoucher)
        .select()
        .single();

      if (insertErr) throw new Error(insertErr.message);

      if (actor) logCreation("evoucher", created.id, created.voucher_number ?? created.id, actor);
      await supabase.from('evoucher_history').insert([
        {
          id: `EH-${Date.now()}-1`,
          evoucher_id: created.id,
          action: 'Created',
          new_status: 'draft',
          performed_by: data.requestor,
          performed_by_name: data.requestor,
          performed_by_role: context,
          created_at: new Date().toISOString()
        },
        {
          id: `EH-${Date.now()}-2`,
          evoucher_id: created.id,
          action: 'Auto-Approved',
          previous_status: 'draft',
          new_status: 'Approved',
          performed_by: data.requestor,
          performed_by_name: data.requestor,
          performed_by_role: context,
          created_at: new Date().toISOString()
        }
      ]);

      console.log('E-Voucher auto-approved:', created);
      return created;
    },
    onSuccess: (created) => {
      toast.success(`Voucher ${created.voucher_number} posted successfully!`);
      invalidate();
    },
    onError: (err) => {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      console.error('Error auto-approving E-Voucher:', err);
      toast.error(`Failed to auto-approve: ${errorMessage}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      console.log('🗑️ Deleting E-Voucher:', id);

      const { error: deleteErr } = await supabase
        .from('evouchers')
        .delete()
        .eq('id', id);

      if (deleteErr) throw new Error(deleteErr.message);

      if (actor) logDeletion("evoucher", id, id, actor);
      console.log('E-Voucher deleted:', id);
      return true;
    },
    onSuccess: () => {
      toast.success(`Expense deleted successfully`);
      invalidate();
    },
    onError: (err) => {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      console.error('Error deleting expense:', err);
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
