import type { Project } from "../../types/pricing";
import type { FinancialData } from "../../hooks/useProjectFinancials";
import { UnifiedCollectionsTab } from "../../components/shared/collections/UnifiedCollectionsTab";

interface ProjectCollectionsTabProps {
  financials: FinancialData;
  project: Project;
  currentUser: any;
  highlightId?: string | null;
  /** NEU-020 2.6: project-door collections key (PROJECT_MODULE_IDS[door].collections). */
  permissionDoor?: string;
}

export function ProjectCollectionsTab({
  financials,
  project,
  currentUser,
  highlightId,
  permissionDoor
}: ProjectCollectionsTabProps) {
  // Simple wrapper around the unified component with consistent padding
  return (
    <div className="flex flex-col bg-[var(--theme-bg-surface)] p-12 min-h-[600px]">
      <UnifiedCollectionsTab
        financials={financials}
        project={project}
        currentUser={currentUser}
        onRefresh={financials.refresh}
        highlightId={highlightId}
        permissionDoor={permissionDoor}
      />
    </div>
  );
}
