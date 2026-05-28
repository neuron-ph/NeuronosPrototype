import { useState, useEffect } from "react";
import { toast } from "../ui/toast-utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import type { Project } from "../../types/pricing";
import { ProjectsList } from "./ProjectsList";
import { ProjectDetail } from "./ProjectDetail";
import { fetchProjectsWithQuotation, fetchProjectWithQuotation, fetchProjectByNumberWithQuotation } from "../../utils/projectHydration";
import { useUrlSelection } from "../../hooks/useUrlSelection";
import { useRealtimeSync } from "../../hooks/useRealtimeSync";

export type ProjectsView = "list" | "detail";

interface ProjectsModuleProps {
  currentUser?: { 
    id: string;
    name: string; 
    email: string; 
    department: string;
  } | null;
  onCreateTicket?: (entity: { type: string; id: string; name: string }) => void;
  initialProject?: Project | null;
  departmentOverride?: "BD" | "Operations" | "Accounting";
}

export function ProjectsModule({ currentUser, onCreateTicket, initialProject, departmentOverride }: ProjectsModuleProps) {
  const [urlProjectId, setUrlProjectId] = useUrlSelection("project");
  const [view, setView] = useState<ProjectsView>(initialProject ? "detail" : "list");
  const [selectedProject, setSelectedProject] = useState<Project | null>(initialProject || null);
  const [initialTab, setInitialTab] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Update view if initialProject changes
  useEffect(() => {
    if (initialProject) {
      setSelectedProject(initialProject);
      setView("detail");
    }
  }, [initialProject]);

  // ── Projects fetch ────────────────────────────────────────
  const { data: projects = [], isLoading, refetch } = useQuery<Project[]>({
    queryKey: queryKeys.projects.list(),
    queryFn: fetchProjectsWithQuotation,
    // Inherits 5-minute staleTime from global QueryClient config
  });
  const refreshProjects = () => { refetch(); };

  useRealtimeSync({ table: "projects", queryKey: queryKeys.projects.all() });

  useEffect(() => {
    if (!selectedProject || projects.length === 0) return;

    const hydratedProject = projects.find((project) => project.id === selectedProject.id);
    if (hydratedProject) {
      setSelectedProject(hydratedProject);
    }
  }, [projects, selectedProject?.id]);

  // Deep-link: restore project from ?project= URL param (supports project_number or id)
  useEffect(() => {
    if (!urlProjectId || isLoading || selectedProject) return;

    // Try matching from already-loaded list first
    if (projects.length > 0) {
      const match = projects.find(
        (p) => p.project_number === urlProjectId || p.id === urlProjectId
      );
      if (match) {
        setSelectedProject(match);
        // Normalize URL to use project id for consistency
        if (urlProjectId !== match.id) setUrlProjectId(match.id);
        setView("detail");
        return;
      }
    }

    // Projects loaded but no match — try direct DB fetch (handles page refresh
    // before list is populated or when project is outside current scope)
    if (projects.length === 0) return; // wait for list to load
    (async () => {
      try {
        // urlProjectId may be a UUID (id) or a project_number — try both
        const isUuid = /^[0-9a-f]{8}-/.test(urlProjectId);
        const data = isUuid
          ? await fetchProjectWithQuotation(urlProjectId)
          : await fetchProjectByNumberWithQuotation(urlProjectId);
        if (data) {
          setSelectedProject(data);
          if (urlProjectId !== data.id) setUrlProjectId(data.id);
          setView("detail");
        } else {
          setUrlProjectId(null);
        }
      } catch {
        setUrlProjectId(null);
      }
    })();
  }, [urlProjectId, projects, isLoading, selectedProject, setUrlProjectId]);

  // Read tab/highlight params once on mount for deep-link navigation
  useEffect(() => {
    if (!urlProjectId) return;
    const params = new URLSearchParams(window.location.search);
    const targetTab = params.get("tab");
    const targetHighlight = params.get("highlight");
    if (targetTab) setInitialTab(targetTab);
    if (targetHighlight) setHighlightId(targetHighlight);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
    setUrlProjectId(project.id);
    setView("detail");
  };

  const handleBackToList = () => {
    setView("list");
    setSelectedProject(null);
    setUrlProjectId(null);
    setInitialTab(null);
    setHighlightId(null);
  };

  const handleProjectUpdated = async () => {
    console.log('handleProjectUpdated called — refreshing project data...');
    
    // If viewing a specific project, fetch fresh detail (includes linkedBookings)
    if (selectedProject) {
      try {
        const data = await fetchProjectWithQuotation(selectedProject.id);

        if (data) {
          setSelectedProject(data);
        } else {
          console.error('Failed to fetch project:', selectedProject.id);
        }
      } catch (error) {
        console.error('Error refreshing selected project:', error);
      }
    }

    // Invalidate the projects list cache so it's fresh when user navigates back to list
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() });
  };

  // Use the current user's department to determine which tabs to show
  // BD and Pricing users see: Overview, Specifications, Pricing, Bookings, Activity, Comments
  // Operations users see: Overview, Services & Bookings, Activity
  
  // Logic: 
  // 1. If override provided, use it.
  // 2. If user is BD/Pricing -> BD
  // 3. Else -> Operations
  
  let department: "BD" | "Operations" | "Accounting" = "Operations";
  
  if (departmentOverride) {
    department = departmentOverride;
  } else if (
    currentUser?.department === "BD" || 
    currentUser?.department === "Business Development" ||
    currentUser?.department === "Pricing"
  ) {
    department = "BD";
  }
  
  console.log("ProjectsModule - Department:", department, "- User:", currentUser?.department);

  return (
    <div className="h-full bg-[var(--theme-bg-surface)]">
      {view === "list" && (
        <ProjectsList
          projects={projects}
          onSelectProject={handleSelectProject}
          isLoading={isLoading}
          currentUser={currentUser}
          department={department}
          onRefresh={refreshProjects}
        />
      )}

      {view === "detail" && selectedProject && (
        <ProjectDetail
          project={selectedProject}
          onBack={handleBackToList}
          onUpdate={handleProjectUpdated}
          currentUser={currentUser}
          department={department}
          onCreateTicket={onCreateTicket}
          initialTab={initialTab}
          highlightId={highlightId}
        />
      )}
    </div>
  );
}
