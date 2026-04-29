import { useState } from "react";
import { Search, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import type { Project } from "../../../types/pricing";
import { fetchProjectByNumber } from "../../../utils/projectAutofill";

interface ProjectAutofillSectionProps {
  projectNumber?: string;
  onProjectNumberChange: (value: string) => void;
  onAutofill: (project: Project) => void;
  serviceType: string; // For validation
}

export function ProjectAutofillSection({
  projectNumber,
  onProjectNumberChange,
  onAutofill,
  serviceType,
}: ProjectAutofillSectionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [fetchedProject, setFetchedProject] = useState<Project | null>(null);
  const normalizedProjectNumber = projectNumber ?? "";

  const handleAutofill = async () => {
    if (!normalizedProjectNumber.trim()) {
      setError("Please enter a project number");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const result = await fetchProjectByNumber(
        normalizedProjectNumber.trim(),
      );

      if (result.success && result.data) {
        const project = result.data;

        // Validate project status
        if (project.status === "Completed") {
          setError("This project is already completed. Cannot create new bookings.");
          setLoading(false);
          return;
        }

        // Check if service type matches
        const hasService = project.services.some(
          (s) => s.toUpperCase() === serviceType.toUpperCase()
        );

        if (!hasService) {
          // Warning but don't block
          console.warn(
            `Project ${projectNumber} doesn't include ${serviceType} service`
          );
        }

        // Success - trigger autofill
        setFetchedProject(project);
        setSuccess(true);
        onAutofill(project);
      } else {
        setError(result.error || "Project not found");
      }
    } catch (err) {
      setError("Failed to fetch project. Please try again.");
      console.error("Error fetching project:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAutofill();
    }
  };

  return (
    <div className="bg-[var(--theme-action-primary-bg)]/5 border border-[var(--theme-action-primary-bg)]/20 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <label className="block text-[var(--theme-text-primary)] mb-2 text-sm">
            Project Number{" "}
            <span className="text-[var(--theme-text-primary)]/40">(Optional - for autofill)</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={normalizedProjectNumber}
              onChange={(e) => {
                onProjectNumberChange(e.target.value);
                setError("");
                setSuccess(false);
              }}
              onKeyPress={handleKeyPress}
              placeholder="e.g., PROJ-2025-001"
              className="flex-1 px-3 py-2 border border-[var(--theme-text-primary)]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)] bg-[var(--theme-bg-surface)]"
              disabled={loading}
            />
            <button
              type="button"
              onClick={handleAutofill}
              disabled={loading || !normalizedProjectNumber.trim()}
              className="px-4 py-2 bg-[var(--theme-action-primary-bg)] text-white rounded-lg hover:bg-[var(--theme-action-primary-bg)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Autofill
                </>
              )}
            </button>
          </div>

          {/* Success Message */}
          {success && fetchedProject && (
            <div className="mt-3 flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">
                  Project loaded: {fetchedProject.project_number}
                </p>
                <p className="text-emerald-600 text-xs mt-1">
                  Customer: {fetchedProject.customer_name} •{" "}
                  {fetchedProject.services.join(", ")}
                </p>
                {/* Show warning if service type doesn't match */}
                {!fetchedProject.services.some(
                  (s) => s.toUpperCase() === serviceType.toUpperCase()
                ) && (
                  <p className="text-amber-600 text-xs mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Note: This project doesn't include {serviceType} service
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-3 flex items-start gap-2 text-sm text-red-700 bg-[var(--theme-status-danger-bg)] border border-[var(--theme-status-danger-border)] rounded-lg p-3">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Info Message */}
          {!normalizedProjectNumber && !error && !success && (
            <p className="mt-2 text-xs text-[var(--theme-text-primary)]/60">
              Enter a project number to automatically populate customer details and service information from the quotation.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
