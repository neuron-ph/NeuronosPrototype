import type { FinancialData } from "../../../hooks/useProjectFinancials";
import type { Project } from "../../../types/pricing";
import { UnifiedBillingsTab } from "../../shared/billings/UnifiedBillingsTab";

interface ProjectBillingsProps {
  financials: FinancialData;
  project: Project;
  highlightId?: string | null;
}

export function ProjectBillings({ financials, project, highlightId }: ProjectBillingsProps) {
  const { billingItems, refresh, isLoading } = financials;

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
          linkedBookings={project.linkedBookings || []}
          highlightId={highlightId}
      />
    </div>
  );
}
