import { useState, useEffect } from "react";
import type { Project } from "../../types/pricing";
import { apiFetch } from "../../utils/api";
import type { Expense as OperationsExpense } from "../../types/operations";
import { UnifiedExpensesTab } from "../accounting/UnifiedExpensesTab";

interface ProjectExpensesTabProps {
  project: Project;
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
  // Data State
  const [expenses, setExpenses] = useState<OperationsExpense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const linkedBookings = project.linkedBookings || [];

  useEffect(() => {
    fetchAllExpenses();
  }, [project.id]);

  const fetchAllExpenses = async () => {
    try {
      setIsLoading(true);
      const response = await apiFetch(`/evouchers`);
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const allEVouchers = result.data || [];
          
          const validIds = new Set([
            project.id,
            project.project_number,
            ...(linkedBookings.map(b => b.bookingId))
          ]);

          const relevantEVouchers = allEVouchers.filter((ev: any) => {
            const isRelevant = validIds.has(ev.project_number) || validIds.has(ev.booking_id);
            if (!isRelevant) return false;

            const type = (ev.transaction_type || "").toLowerCase();
            return type === "expense" || type === "budget_request";
          });

          const mappedExpenses: OperationsExpense[] = relevantEVouchers.map((ev: any) => {
            const targetId = ev.project_number || ev.booking_id;
            const linkedBooking = linkedBookings.find(b => b.bookingId === targetId);
            const bookingType = linkedBooking ? linkedBooking.serviceType : (targetId === project.id ? "Project" : "Other");

            let status = "pending";
            const rawStatus = (ev.status || "").toLowerCase();
            if (rawStatus === "draft") status = "draft";
            else if (rawStatus === "approved") status = "approved";
            else if (rawStatus === "posted" || rawStatus === "paid") status = "posted";
            else if (rawStatus === "rejected" || rawStatus === "cancelled") status = "rejected";

            return {
              expenseId: ev.id,
              id: ev.id,
              bookingId: targetId,
              bookingType: bookingType,
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
              isBillable: ev.is_billable
            } as OperationsExpense;
          });

          // Deduplicate by ID to handle potential backend data overlaps
          const uniqueExpenses = Array.from(
            new Map(mappedExpenses.map(item => [item.id, item])).values()
          );

          uniqueExpenses.sort((a, b) => {
            // Helper to get pure date timestamp (midnight)
            const getDayTimestamp = (dateStr: string | undefined) => {
                if (!dateStr) return 0;
                const d = new Date(dateStr);
                d.setHours(0, 0, 0, 0);
                return d.getTime();
            };

            // Primary Sort: Expense Date (Date Only)
            const dayA = getDayTimestamp(a.expenseDate || a.createdAt);
            const dayB = getDayTimestamp(b.expenseDate || b.createdAt);
            
            if (dayA !== dayB) {
              return dayB - dayA; // Newer dates first
            }
            
            // Secondary Sort: Created At (Full Timestamp) for tie-breaking
            const createdA = new Date(a.createdAt).getTime();
            const createdB = new Date(b.createdAt).getTime();
            return createdB - createdA; // Newer creation first
          });
          setExpenses(uniqueExpenses);
        }
      }
    } catch (error) {
      console.error("Error fetching expenses:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`flex flex-col bg-white ${!title ? 'p-12 min-h-[600px]' : ''}`}>
      <UnifiedExpensesTab 
        expenses={expenses}
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