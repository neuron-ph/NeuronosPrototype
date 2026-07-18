import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../utils/supabase/client";
import { UnifiedExpensesTab } from "../../accounting/UnifiedExpensesTab";
import type { Expense as OperationsExpense } from "../../../types/operations";

interface ExpensesTabProps {
  bookingId: string;
  bookingNumber?: string;
  bookingType?: "forwarding" | "brokerage" | "trucking" | "marine-insurance" | "others";
  currentUserId?: string;
  currentUserName?: string;
  currentUserDepartment?: string;
  currentUser?: { name: string; email: string; department: string } | null;
  readOnly?: boolean;
  highlightId?: string | null;
  existingBillingItems?: { source_id?: string | null; [key: string]: any }[];
  onPendingCountChange?: (count: number) => void;
  /** NEU-020 DD-1: per-service door key forwarded to UnifiedExpensesTab. */
  permissionDoor?: string;
}

export function ExpensesTab({
  bookingId,
  bookingNumber,
  bookingType,
  currentUser,
  readOnly = false,
  highlightId,
  existingBillingItems = [],
  onPendingCountChange,
  permissionDoor,
}: ExpensesTabProps) {
  const queryClient = useQueryClient();

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["evouchers", "booking_expenses", bookingId],
    queryFn: async () => {
      // NEU-108 / D2: a booking's expenses = the LINE ITEMS charged to it
      // (booking now lives on the line, not the voucher). Read the line table,
      // group lines back to their parent voucher, and sum ONLY the amounts for
      // THIS booking — so a multi-booking voucher shows here with just its share.
      const { data: lines, error } = await supabase
        .from("evoucher_line_items")
        .select(`
          evoucher_id, amount, booking_id,
          evouchers!inner (
            id, evoucher_number, status, vendor_name, transaction_type,
            created_at, purpose, description, project_number,
            currency, details, attachments,
            gl_category, gl_sub_category
          )
        `)
        .eq("booking_id", bookingId);

      if (error) throw error;

      // Group lines by parent voucher; accumulate the booking-scoped amount.
      const byVoucher = new Map<string, { ev: any; amount: number }>();
      for (const row of (lines ?? []) as any[]) {
        const ev = row.evouchers;
        if (!ev) continue;
        const cur = byVoucher.get(ev.id) ?? { ev, amount: 0 };
        cur.amount += Number(row.amount) || 0;
        byVoucher.set(ev.id, cur);
      }

      const mappedExpenses: OperationsExpense[] = Array.from(byVoucher.values()).map(({ ev, amount }) => {
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
          expenseName: ev.evoucher_number || "—",
          expenseCategory: ev.gl_category || "Uncategorized",
          amount, // booking-scoped sum of this voucher's lines charged to this booking
          currency: ev.currency || "PHP",
          expenseDate: ev.details?.request_date || ev.created_at,
          vendorName: ev.vendor_name || "—",
          description: ev.purpose || ev.description,
          notes: ev.description,
          createdBy: ev.details?.requestor_name ?? null,
          createdAt: ev.created_at,
          status: status,
          vendor: ev.vendor_name,
          category: ev.gl_category,
          subCategory: ev.gl_sub_category,
          lineItems: [],
          isBillable: ev.details?.is_billable ?? false,
          transactionType: ev.transaction_type || ev.details?.transaction_type || "expense",
          attachments: ev.attachments || [],
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
        projectNumber={bookingNumber}
        bookingType={bookingType}
        highlightId={highlightId}
        existingBillingItems={existingBillingItems}
        onPendingCountChange={onPendingCountChange}
        permissionDoor={permissionDoor}
      />
    </div>
  );
}
