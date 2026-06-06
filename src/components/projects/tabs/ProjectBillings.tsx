import { useQuery } from "@tanstack/react-query";
import type { FinancialData } from "../../../hooks/useProjectFinancials";
import type { Project } from "../../../types/pricing";
import { supabase } from "../../../utils/supabase/client";
import { UnifiedBillingsTab } from "../../shared/billings/UnifiedBillingsTab";

interface ProjectBillingsProps {
  financials: FinancialData;
  project: Project;
  highlightId?: string | null;
  /** NEU-020 2.6: project-door billings key (PROJECT_MODULE_IDS[door].billings). */
  permissionDoor?: string;
}

export function ProjectBillings({ financials, project, highlightId, permissionDoor }: ProjectBillingsProps) {
  const { billingItems, refresh, isLoading } = financials;
  const { data: liveLinkedBookings = [] } = useQuery({
    queryKey: ["project-billings-linked-bookings", project.id],
    queryFn: async () => {
      // Single source of truth: bookings.project_id (NEU-013).
      const { data, error } = await supabase
        .from("bookings")
        .select("id, status, service_type, booking_number, name")
        .eq("project_id", project.id);

      if (error) {
        console.error("[ProjectBillings] Failed to fetch project bookings:", error);
        return [];
      }

      return (data ?? []).map((b) => ({
        bookingId: b.id,
        id: b.id,
        status: b.status,
        serviceType: b.service_type,
        service_type: b.service_type,
        bookingNumber: b.booking_number,
        booking_number: b.booking_number,
        name: b.name ?? undefined,
      }));
    },
    staleTime: 30_000,
  });

  const linkedBookings = liveLinkedBookings;

  return (
    <div className="flex flex-col bg-[var(--theme-bg-surface)] p-12 min-h-[600px]">
      <UnifiedBillingsTab
          items={billingItems}
          quotation={project.quotation} // Pass the quotation for reflective billing
          projectId={project.project_number || project.id}
          bookingId={undefined} // Project level view
          onRefresh={refresh}
          isLoading={isLoading}
          enableGroupByToggle={false}
          linkedBookings={linkedBookings}
          highlightId={highlightId}
          permissionDoor={permissionDoor}
      />
    </div>
  );
}
