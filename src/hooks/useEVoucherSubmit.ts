import { useState } from 'react';
import { supabase } from '../utils/supabase/client';
import { toast } from '../components/ui/toast-utils';

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
}

export function useEVoucherSubmit(context: EVoucherContext = "bd") {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Map context to transaction_type (Default fallback)
  const getTransactionType = (data?: EVoucherData) => {
    // If explicit transaction type provided, use it
    if (data?.transactionType) {
      return data.transactionType;
    }
    
    // Fallback based on context
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

  // Map context to source_module
  const getSourceModule = () => {
    return context; // Already matches the backend enum
  };

  const assertBookingLinkedWhenRequired = (data: EVoucherData) => {
    const transactionType = getTransactionType(data);
    const requiresBookingLink =
      context === "operations" &&
      (transactionType === "expense" || transactionType === "budget_request");

    if (requiresBookingLink && !data.bookingId?.trim()) {
      throw new Error("A real booking is required for Operations expenses.");
    }
  };

  /**
   * Creates an E-Voucher in DRAFT status
   * Saves to database but doesn't submit for approval
   */
  const createDraft = async (data: EVoucherData) => {
    setIsSaving(true);
    setError(null);

    try {
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

      if (insertErr) {
        throw new Error(insertErr.message);
      }

      console.log('E-Voucher draft created:', created);
      toast.success(`Draft saved successfully! Ref: ${created.voucher_number}`);
      return created;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      console.error('Error creating E-Voucher draft:', err);
      setError(errorMessage);
      toast.error(`Failed to save draft: ${errorMessage}`);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Creates an E-Voucher and immediately submits for approval
   * Two-step process: Create → Submit
   */
  const submitForApproval = async (data: EVoucherData) => {
    setIsSaving(true);
    setError(null);

    try {
      assertBookingLinkedWhenRequired(data);

      // Validate required fields
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
      
      // Step 1: Create the E-Voucher in draft status
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
        amount: data.totalAmount, // Backend expects 'amount' field too
        payment_method: data.preferredPayment,
        vendor_name: data.vendor,
        credit_terms: data.creditTerms,
        due_date: data.paymentSchedule || null,
        notes: data.notes || '',
        requestor_name: data.requestor,
        requestor_id: data.requestor, // Use requestor as ID for now
        requestor_department: context, // Add department context
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

      if (insertErr) {
        throw new Error(insertErr.message);
      }

      const createdId = created.id;
      const createdVoucherNumber = created.voucher_number;

      console.log('E-Voucher created:', createdVoucherNumber);

      // Step 2: Submit for approval (update status)
      console.log('Submitting E-Voucher for approval...');

      const { error: submitErr } = await supabase
        .from('evouchers')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', createdId);

      if (submitErr) {
        throw new Error(submitErr.message);
      }

      // Insert history record
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
      
      // Context-aware success message
      const successMessage = 
        context === "bd" ? `Budget Request ${createdVoucherNumber} submitted successfully!` :
        context === "collection" ? `Collection ${createdVoucherNumber} recorded successfully!` :
        context === "billing" ? `Invoice ${createdVoucherNumber} created successfully!` :
        `Expense ${createdVoucherNumber} submitted successfully!`;
      
      toast.success(successMessage);
      return { ...created, status: 'pending' };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      console.error('Error submitting E-Voucher:', err);
      setError(errorMessage);
      toast.error(`Failed to submit: ${errorMessage}`);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Creates an E-Voucher and immediately approves and posts it
   * (Accounting only feature)
   */
  const autoApprove = async (data: EVoucherData) => {
    setIsSaving(true);
    setError(null);

    try {
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
        // Auto-approve endpoint usually handles status, but we send user info
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

      if (insertErr) {
        throw new Error(insertErr.message);
      }

      // Insert history records for create + auto-approve
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
      toast.success(`Voucher ${created.voucher_number} posted successfully!`);
      return created;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      console.error('Error auto-approving E-Voucher:', err);
      setError(errorMessage);
      toast.error(`Failed to auto-approve: ${errorMessage}`);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Deletes an E-Voucher
   */
  const deleteEVoucher = async (id: string) => {
    setIsSaving(true);
    setError(null);

    try {
      console.log('🗑️ Deleting E-Voucher:', id);

      const { error: deleteErr } = await supabase
        .from('evouchers')
        .delete()
        .eq('id', id);

      if (deleteErr) {
        throw new Error(deleteErr.message);
      }

      console.log('E-Voucher deleted:', id);
      toast.success(`Expense deleted successfully`);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      console.error('Error deleting expense:', err);
      setError(errorMessage);
      toast.error(`Failed to delete: ${errorMessage}`);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    createDraft,
    submitForApproval,
    autoApprove,
    deleteEVoucher,
    isSaving,
    error,
  };
}
