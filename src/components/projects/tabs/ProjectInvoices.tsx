import { UnifiedInvoicesTab } from "../../shared/invoices/UnifiedInvoicesTab";
import type { FinancialData } from "../../../hooks/useProjectFinancials";
import type { Project } from "../../../types/pricing";

interface ProjectInvoicesProps {
  financials: FinancialData;
  project: Project;
  currentUser?: { 
    id: string;
    name: string; 
    email: string; 
    department: string;
  } | null;
  highlightId?: string | null;
}

export function ProjectInvoices({ financials, project, currentUser, highlightId }: ProjectInvoicesProps) {
  // Logic is now delegated to the UnifiedInvoicesTab for DRY compliance
  return (
    <div className="flex flex-col bg-[var(--theme-bg-surface)] min-h-[600px]">
      <UnifiedInvoicesTab 
        financials={financials}
        project={project}
        currentUser={currentUser}
        onRefresh={financials.refresh}
        highlightId={highlightId}
      />
    </div>
  );
}
