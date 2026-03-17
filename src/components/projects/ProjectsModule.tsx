import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import { supabase } from "../../utils/supabase/client";
import { toast } from "../ui/toast-utils";
import { useCachedFetch, useInvalidateCache } from "../../hooks/useNeuronCache";
import type { Project } from "../../types/pricing";
import { ProjectsList } from "./ProjectsList";
import { ProjectDetail } from "./ProjectDetail";

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
  const [view, setView] = useState<ProjectsView>(initialProject ? "detail" : "list");
  const [selectedProject, setSelectedProject] = useState<Project | null>(initialProject || null);
  const [initialTab, setInitialTab] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const invalidateCache = useInvalidateCache();
  const [searchParams, setSearchParams] = useSearchParams();

  // Update view if initialProject changes
  useEffect(() => {
    if (initialProject) {
      setSelectedProject(initialProject);
      setView("detail");
    }
  }, [initialProject]);

  // ── Cached projects fetch ────────────────────────────────
  const projectsFetcher = async (): Promise<Project[]> => {
    const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  };

  const { data: projects, isLoading, refresh: refreshProjects } = useCachedFetch<Project[]>(
    "projects",
    projectsFetcher,
    [],
  );

  // Deep-link: auto-select project from ?project=PROJECT_NUMBER query param
  useEffect(() => {
    const projectNumber = searchParams.get("project");
    const targetTab = searchParams.get("tab");
    const targetHighlight = searchParams.get("highlight");
    if (!projectNumber || projects.length === 0 || isLoading) return;

    const match = projects.find(
      (p) => p.project_number === projectNumber || p.id === projectNumber
    );
    if (match) {
      setSelectedProject(match);
      setInitialTab(targetTab || null);
      setHighlightId(targetHighlight || null);
      setView("detail");
      // Clean the query param so back-navigation doesn't re-trigger
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, projects, isLoading, setSearchParams]);

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
    setView("detail");
  };

  const handleBackToList = () => {
    setView("list");
    setSelectedProject(null);
    setInitialTab(null);
    setHighlightId(null);
  };

  const handleProjectUpdated = async () => {
    console.log('handleProjectUpdated called — refreshing project data...');
    
    // If viewing a specific project, fetch fresh detail (includes linkedBookings)
    if (selectedProject) {
      try {
        const { data, error } = await supabase.from('projects').select('*').eq('id', selectedProject.id).single();
        
        if (!error && data) {
          setSelectedProject(data);
        } else {
          console.error('Failed to fetch project:', error?.message);
        }
      } catch (error) {
        console.error('Error refreshing selected project:', error);
      }
    }

    // Invalidate the projects list cache so it's fresh when user navigates back to list
    invalidateCache("projects");
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
    <div className="h-full bg-white">
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
          // If in Accounting mode, we might want to pass "Operations" or "BD" to the detail view 
          // depending on what's appropriate, or update ProjectDetail to handle "Accounting" too.
          // For now, let's treat Accounting users as "Operations" level access in Detail View
          // or just pass "Accounting" if ProjectDetail supports it.
          // Let's coerce it to "Operations" for Detail View if it's Accounting to be safe for now,
          // as ProjectDetail might not expect "Accounting".
          department={department === "Accounting" ? "Operations" : department}
          onCreateTicket={onCreateTicket}
          initialTab={initialTab}
          highlightId={highlightId}
        />
      )}
    </div>
  );
}