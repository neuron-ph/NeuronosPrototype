import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FinancialContainer } from "../../types/financials";
import { supabase } from "../../utils/supabase/client";
import type { Expense as OperationsExpense } from "../../types/operations";
import { UnifiedExpensesTab } from "../accounting/UnifiedExpensesTab";

interface ProjectExpensesTabProps {
  project: FinancialContainer;
  currentUser?: {
    id: string;
    name: string;
    email: string;
    department: string;
  } | null;
  title?: string;
  subtitle?: string;
}

export function ProjectExpensesTab({ project, currentUser, title, subtitle }: ProjectExpensesTabProps) {
  const queryClient = useQueryClient();
  const linkedBookings = project.linkedBookings || [];

  const expensesQueryKey = ["project_expenses", project.id];

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: expensesQueryKey,
    queryFn: async () => {
      const { data: allEVouchers, error } = await supabase.from('evouchers').select('*');
      if (error) throw error;
      if (!allEVouchers) return [] as OperationsExpense[];

      const validBookingIds = new Set(
        linkedBookings
          .map((booking) => booking.bookingId)
          .filter(Boolean)
      );

      const relevantEVouchers = allEVouchers.filter((ev: any) => {
        if (!ev.booking_id || !validBookingIds.has(ev.booking_id)) return false;
        const type = (ev.transaction_type || "").toLowerCase();
        return type === "expense" || type === "budget_request";
      });

      const mappedExpenses: OperationsExpense[] = relevantEVouchers.map((ev: any) => {
        const targetBookingId = ev.booking_id;
        const linkedBooking = linkedBookings.find((booking) => booking.bookingId === targetBookingId);
        const bookingType = linkedBooking?.serviceType || "Other";

        let status = "pending";
        const rawStatus = (ev.status || "").toLowerCase();
        if (rawStatus === "draft") status = "draft";
        else if (rawStatus === "approved") status = "approved";
        else if (rawStatus === "posted" || rawStatus === "paid") status = "posted";
        else if (rawStatus === "rejected" || rawStatus === "cancelled") status = "rejected";

        return {
          expenseId: ev.id,
          id: ev.id,
          bookingId: targetBookingId,
          projectNumber: ev.project_number || project.project_number,
          bookingType: bookingType,
          expenseName: ev.voucher_number || ev.id,
          expenseCategory: ev.expense_category || ev.gl_category || "Uncategorized",
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
          category: ev.expense_category || ev.gl_category,
          subCategory: ev.sub_category || ev.gl_sub_category,
          lineItems: ev.line_items || [],
          isBillable: ev.is_billable
        } as unknown as OperationsExpense;
      });

      // Deduplicate by ID to handle potential backend data overlaps
      const uniqueExpenses = Array.from(
        new Map(mappedExpenses.map(item => [(item as any).id, item])).values()
      );

      uniqueExpenses.sort((a, b) => {
        const getDayTimestamp = (dateStr: string | undefined) => {
          if (!dateStr) return 0;
          const d = new Date(dateStr);
          d.setHours(0, 0, 0, 0);
          return d.getTime();
        };

        const dayA = getDayTimestamp(a.expenseDate || a.createdAt);
        const dayB = getDayTimestamp(b.expenseDate || b.createdAt);

        if (dayA !== dayB) {
          return dayB - dayA;
        }

        const createdA = new Date(a.createdAt).getTime();
        const createdB = new Date(b.createdAt).getTime();
        return createdB - createdA;
      });

      return uniqueExpenses;
    },
    staleTime: 30_000,
  });

  const fetchAllExpenses = () => {
    queryClient.invalidateQueries({ queryKey: expensesQueryKey });
  };

  return (
    <div className={`flex flex-col bg-[var(--theme-bg-surface)] ${!title ? 'p-12 min-h-[600px]' : ''}`}>
      <UnifiedExpensesTab
        expenses={expenses as unknown as Record<string, unknown>[]}
        isLoading={isLoading}
        showHeader={true}
        linkedBookings={linkedBookings}
        context="project"
        onRefresh={fetchAllExpenses}
        projectNumber={project.project_number}
        title={title}
        subtitle={subtitle}
      />
    </div>
  );
}
