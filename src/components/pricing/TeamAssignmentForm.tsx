import { useState, useEffect } from "react";
import { apiFetch } from "../../utils/api";
import type { ServiceType } from "../../types/operations";
import type { User } from "../../hooks/useUser";
import { CustomDropdown } from "../bd/CustomDropdown";

export interface TeamAssignment {
  manager: { id: string; name: string };
  supervisor: { id: string; name: string } | null;
  handler: { id: string; name: string } | null;
  saveAsDefault: boolean;
}

interface TeamAssignmentFormProps {
  serviceType: ServiceType;
  customerId: string;
  onChange: (assignments: TeamAssignment) => void;
  initialAssignments?: TeamAssignment;
}

export function TeamAssignmentForm({ 
  serviceType, 
  customerId, 
  onChange, 
  initialAssignments 
}: TeamAssignmentFormProps) {
  const [manager, setManager] = useState<{ id: string; name: string } | null>(null);
  const [supervisors, setSupervisors] = useState<User[]>([]);
  const [handlers, setHandlers] = useState<User[]>([]);
  
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>("");
  const [selectedHandler, setSelectedHandler] = useState<string>("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  
  const [isLoadingManager, setIsLoadingManager] = useState(true);
  const [isLoadingSupervisors, setIsLoadingSupervisors] = useState(true);
  const [isLoadingHandlers, setIsLoadingHandlers] = useState(true);
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);
  
  const [hasSavedPreference, setHasSavedPreference] = useState(false);

  // Fetch manager on mount
  useEffect(() => {
    const fetchManager = async () => {
      setIsLoadingManager(true);
      try {
        const response = await apiFetch(
          `/users?department=Operations&service_type=${serviceType}&operations_role=Manager`
        );
        const result = await response.json();
        if (result.success && result.data.length > 0) {
          const mgr = result.data[0];
          setManager({ id: mgr.id, name: mgr.name });
        }
      } catch (error) {
        console.error("Error fetching manager:", error);
      } finally {
        setIsLoadingManager(false);
      }
    };

    fetchManager();
  }, [serviceType]);

  // Fetch supervisors on mount
  useEffect(() => {
    const fetchSupervisors = async () => {
      setIsLoadingSupervisors(true);
      try {
        const response = await apiFetch(
          `/users?department=Operations&service_type=${serviceType}&operations_role=Supervisor`
        );
        const result = await response.json();
        if (result.success) {
          setSupervisors(result.data);
        }
      } catch (error) {
        console.error("Error fetching supervisors:", error);
      } finally {
        setIsLoadingSupervisors(false);
      }
    };

    fetchSupervisors();
  }, [serviceType]);

  // Fetch handlers on mount
  useEffect(() => {
    const fetchHandlers = async () => {
      setIsLoadingHandlers(true);
      try {
        const response = await apiFetch(
          `/users?department=Operations&service_type=${serviceType}&operations_role=Handler`
        );
        const result = await response.json();
        if (result.success) {
          setHandlers(result.data);
        }
      } catch (error) {
        console.error("Error fetching handlers:", error);
      } finally {
        setIsLoadingHandlers(false);
      }
    };

    fetchHandlers();
  }, [serviceType]);

  // Load saved preference on mount
  useEffect(() => {
    const loadPreference = async () => {
      setIsLoadingPreference(true);
      try {
        const response = await apiFetch(
          `/client-handler-preferences/${customerId}/${serviceType}`
        );
        
        // Check if response is ok and is JSON before parsing
        if (!response.ok) {
          // 404 or other error - no preference exists, which is fine
          if (response.status === 404) {
            console.log(`No saved preference found for client ${customerId} and service ${serviceType}`);
          } else {
            console.warn(`Unexpected response status ${response.status} when loading preference`);
          }
          return;
        }
        
        // Check content type to ensure it's JSON
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          console.warn("Response is not JSON:", contentType);
          return;
        }
        
        const result = await response.json();
        if (result.success && result.data) {
          const pref = result.data;
          setSelectedSupervisor(pref.preferred_supervisor_id);
          setSelectedHandler(pref.preferred_handler_id);
          setHasSavedPreference(true);
        }
      } catch (error) {
        console.error("Error loading preference:", error);
        // Don't throw - just continue without preference
      } finally {
        setIsLoadingPreference(false);
      }
    };

    if (customerId && serviceType) {
      loadPreference();
    } else {
      // If no customerId or serviceType, skip loading preference
      setIsLoadingPreference(false);
    }
  }, [customerId, serviceType]);

  // Use initial assignments if provided
  useEffect(() => {
    if (initialAssignments) {
      if (initialAssignments.manager) {
        setManager(initialAssignments.manager);
      }
      if (initialAssignments.supervisor) {
        setSelectedSupervisor(initialAssignments.supervisor.id);
      }
      if (initialAssignments.handler) {
        setSelectedHandler(initialAssignments.handler.id);
      }
      setSaveAsDefault(initialAssignments.saveAsDefault);
    }
  }, [initialAssignments]);

  // Trigger onChange when selections change
  useEffect(() => {
    if (manager && selectedSupervisor && selectedHandler) {
      const supervisorUser = supervisors.find(s => s.id === selectedSupervisor);
      const handlerUser = handlers.find(h => h.id === selectedHandler);

      if (supervisorUser && handlerUser) {
        onChange({
          manager,
          supervisor: { id: supervisorUser.id, name: supervisorUser.name },
          handler: { id: handlerUser.id, name: handlerUser.name },
          saveAsDefault,
        });
      }
    }
  }, [manager, selectedSupervisor, selectedHandler, saveAsDefault, supervisors, handlers, onChange]);

  const isLoading = isLoadingManager || isLoadingSupervisors || isLoadingHandlers || isLoadingPreference;

  return (
    <div className="space-y-4">
      {/* Manager (auto-filled, disabled) */}
      <div>
        <label className="block text-sm font-['Inter:Medium',sans-serif] font-medium text-[#0a1d4d] mb-1.5">
          Manager <span className="text-[#0F766E]">(Auto-assigned)</span>
        </label>
        <input
          type="text"
          value={isLoadingManager ? "Loading..." : manager?.name || "No manager available"}
          disabled
          className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 font-['Inter:Regular',sans-serif] text-[#0a1d4d] cursor-not-allowed"
        />
      </div>

      {/* Supervisor dropdown */}
      <CustomDropdown
        label="Supervisor"
        value={selectedSupervisor}
        onChange={setSelectedSupervisor}
        options={supervisors.map(s => ({ value: s.id, label: s.name }))}
        placeholder={isLoadingSupervisors ? "Loading..." : "Select supervisor..."}
        disabled={isLoadingSupervisors}
        required
        helperText={
          hasSavedPreference ? (
            <span className="text-xs text-[#0F766E]">(Saved preference)</span>
          ) : undefined
        }
        fullWidth
      />

      {/* Handler dropdown */}
      <CustomDropdown
        label="Handler"
        value={selectedHandler}
        onChange={setSelectedHandler}
        options={handlers.map(h => ({ value: h.id, label: h.name }))}
        placeholder={isLoadingHandlers ? "Loading..." : "Select handler..."}
        disabled={isLoadingHandlers}
        required
        helperText={
          hasSavedPreference ? (
            <span className="text-xs text-[#0F766E]">(Saved preference)</span>
          ) : undefined
        }
        fullWidth
      />

      {/* Save as default checkbox */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="save-as-default"
          checked={saveAsDefault}
          onChange={(e) => setSaveAsDefault(e.target.checked)}
          className="w-4 h-4 rounded cursor-pointer appearance-none"
          style={{
            backgroundColor: saveAsDefault ? "#0F766E" : "#FFFFFF",
            border: "1px solid",
            borderColor: saveAsDefault ? "#0F766E" : "#D1D5DB",
            backgroundImage: saveAsDefault 
              ? `url("data:image/svg+xml,%3Csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3E%3C/svg%3E")` 
              : "none",
            backgroundSize: "100% 100%",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        />
        <label
          htmlFor="save-as-default"
          className="text-sm font-['Inter:Regular',sans-serif] text-[#0a1d4d] cursor-pointer"
        >
          Save as default handler preference for this customer
        </label>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="text-sm text-gray-500 italic">
          Loading team members...
        </div>
      )}
    </div>
  );
}