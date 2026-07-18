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
  /** NEU-020 2.6: project-door expenses key (PROJECT_MODULE_IDS[door].expenses). */
  permissionDoor?: string;
}

export function ProjectExpensesTab({ project, currentUser, title, subtitle, permissionDoor }: ProjectExpensesTabProps) {
  const queryClient = useQueryClient();
  const linkedBookings = project.linkedBookings || [];
  const validBookingIds = Array.from(
    new Set(
      linkedBookings
        .map((booking) => booking.bookingId)
        .filter(Boolean)
    )
  ) as string[];

  const expensesQueryKey = ["project_expenses", project.id];

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: expensesQueryKey,
    queryFn: async () => {
      if (validBookingIds.length === 0) return [] as OperationsExpense[];

      // NEU-108 / D2: a project's expenses = the LINE ITEMS charged to any of its
      // bookings (booking lives on the line now). Read the line table, group lines
      // back to their parent voucher, and sum the amounts for this project's bookings.
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
        .in("booking_id", validBookingIds)
        .in("evouchers.transaction_type", ["expense", "budget_request"]);
      if (error) throw error;
      if (!lines) return [] as OperationsExpense[];

      // Group lines by parent voucher; accumulate the project-scoped amount.
      const byVoucher = new Map<string, { ev: any; amount: number; firstBookingId: string | null }>();
      for (const row of lines as any[]) {
        const ev = row.evouchers;
        if (!ev) continue;
        const cur = byVoucher.get(ev.id) ?? { ev, amount: 0, firstBookingId: row.booking_id ?? null };
        cur.amount += Number(row.amount) || 0;
        byVoucher.set(ev.id, cur);
      }

      const uniqueExpenses: OperationsExpense[] = Array.from(byVoucher.values()).map(({ ev, amount, firstBookingId }) => {
        const linkedBooking = linkedBookings.find((booking) => booking.bookingId === firstBookingId);
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
          bookingId: firstBookingId,
          projectNumber: ev.project_number || project.project_number,
          bookingType: bookingType,
          expenseName: ev.evoucher_number || "—",
          expenseCategory: ev.gl_category || "Uncategorized",
          amount, // project-scoped sum of this voucher's lines charged to this project's bookings
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
    enabled: validBookingIds.length > 0,
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
        permissionDoor={permissionDoor}
      />
    </div>
  );
}
