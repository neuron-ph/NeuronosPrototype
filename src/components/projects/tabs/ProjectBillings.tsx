import { useQuery } from "@tanstack/react-query";
import type { FinancialData } from "../../../hooks/useProjectFinancials";
import type { Project } from "../../../types/pricing";
import { supabase } from "../../../utils/supabase/client";
import { UnifiedBillingsTab } from "../../shared/billings/UnifiedBillingsTab";

interface ProjectBillingsProps {
  financials: FinancialData;
  project: Project;
  highlightId?: string | null;
}

export function ProjectBillings({ financials, project, highlightId }: ProjectBillingsProps) {
  const { billingItems, refresh, isLoading } = financials;
  const { data: liveLinkedBookings = [] } = useQuery({
    queryKey: ["project-billings-linked-bookings", project.id],
    queryFn: async () => {
      const { data: projectData } = await supabase
        .from("projects")
        .select("linked_bookings")
        .eq("id", project.id)
        .maybeSingle();

      const linkedBookings: any[] = projectData?.linked_bookings || [];
      if (linkedBookings.length === 0) {
        return [];
      }

      const verifiedBookings = await Promise.all(
        linkedBookings.map(async (booking) => {
          const bookingId = booking.bookingId || booking.id;
          if (!bookingId) {
            return null;
          }

          try {
            const { data: bookingData } = await supabase
              .from("bookings")
              .select("id, status, service_type, booking_number, name")
              .eq("id", bookingId)
              .maybeSingle();

            if (!bookingData) {
              return null;
            }

            return {
              ...booking,
              bookingId,
              status: bookingData.status || booking.status,
              serviceType: booking.serviceType || booking.service_type || bookingData.service_type,
              service_type: booking.service_type || booking.serviceType || bookingData.service_type,
              bookingNumber: booking.bookingNumber || booking.booking_number || bookingData.booking_number,
              booking_number: booking.booking_number || booking.bookingNumber || bookingData.booking_number,
              name: booking.name || bookingData.name || undefined,
            };
          } catch (error) {
            console.error(`Error verifying linked booking ${bookingId}:`, error);
            return null;
          }
        })
      );

      return verifiedBookings.filter(Boolean);
    },
    staleTime: 30_000,
  });

  const linkedBookings =
    liveLinkedBookings.length > 0 ? liveLinkedBookings : project.linkedBookings || [];

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
      />
    </div>
  );
}
