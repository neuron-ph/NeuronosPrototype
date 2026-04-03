import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../utils/supabase/client";
import { UnifiedExpensesTab } from "../../accounting/UnifiedExpensesTab";
import type { Expense as OperationsExpense } from "../../../types/operations";

interface ExpensesTabProps {
  bookingId: string;
  bookingType?: "forwarding" | "brokerage" | "trucking" | "marine-insurance" | "others";
  currentUserId?: string;
  currentUserName?: string;
  currentUserDepartment?: string;
  currentUser?: { name: string; email: string; department: string } | null;
  readOnly?: boolean;
  highlightId?: string | null;
  existingBillingItems?: { source_id?: string | null; [key: string]: any }[];
  onPendingCountChange?: (count: number) => void;
}

export function ExpensesTab({
  bookingId,
  bookingType,
  currentUser,
  readOnly = false,
  highlightId,
  existingBillingItems = [],
  onPendingCountChange,
}: ExpensesTabProps) {
  const queryClient = useQueryClient();

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["evouchers", "booking_expenses", bookingId],
    queryFn: async () => {
      const { data: allEVouchers, error } = await supabase.from("evouchers").select("*");

      if (error) throw error;

      // Filter for this specific booking
      const relevantEVouchers = (allEVouchers || []).filter((ev: any) => {
        if (ev.booking_id !== bookingId) return false;

        // Must be an Expense or Budget Request
        const type = (ev.transaction_type || "").toLowerCase();
        return type === "expense" || type === "budget_request";
      });

      // Map to OperationsExpense type
      const mappedExpenses: OperationsExpense[] = relevantEVouchers.map((ev: any) => {
        let status = "pending";
        const rawStatus = (ev.status || "").toLowerCase();
        if (rawStatus === "draft") status = "draft";
        else if (rawStatus === "approved") status = "approved";
        else if (rawStatus === "posted" || rawStatus === "paid") status = "posted";
        else if (rawStatus === "rejected" || rawStatus === "cancelled") status = "rejected";

        return {
          expenseId: ev.id,
          id: ev.id,
          bookingId: bookingId,
          projectNumber: ev.project_number,
          bookingType: bookingType || "Other",
          expenseName: ev.voucher_number || ev.id,
          expenseCategory: ev.expense_category || "Uncategorized",
          amount: ev.total_amount || ev.amount || 0,
          currency: ev.currency || "PHP",
          expenseDate: ev.request_date || ev.created_at,
          vendorName: ev.vendor_name || "—",
          description: ev.purpose || ev.description,
          notes: ev.description,
          createdBy: ev.requestor_name,
          createdAt: ev.created_at,
          status: status,
          vendor: ev.vendor_name,
          category: ev.expense_category,
          subCategory: ev.sub_category,
          lineItems: ev.line_items || [],
          isBillable: ev.is_billable,
        } as unknown as OperationsExpense;
      });

      // Sort by Date (Newest first)
      mappedExpenses.sort((a, b) => {
        const timeA = new Date(a.expenseDate || a.createdAt).getTime();
        const timeB = new Date(b.expenseDate || b.createdAt).getTime();
        return timeB - timeA;
      });

      return mappedExpenses;
    },
    enabled: !!bookingId,
    staleTime: 30_000,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["evouchers", "booking_expenses", bookingId] });
  };

  return (
    <div className="flex flex-col bg-[var(--theme-bg-surface)] p-12 min-h-[600px]">
      <UnifiedExpensesTab
        expenses={expenses as unknown as Record<string, unknown>[]}
        isLoading={isLoading}
        showHeader={true}
        linkedBookings={[]}
        context="booking"
        onRefresh={handleRefresh}
        bookingId={bookingId}
        bookingType={bookingType}
        highlightId={highlightId}
        existingBillingItems={existingBillingItems}
        onPendingCountChange={onPendingCountChange}
      />
    </div>
  );
}
