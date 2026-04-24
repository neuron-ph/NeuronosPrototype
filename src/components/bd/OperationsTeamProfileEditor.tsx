import { useState, useEffect } from "react";
import { supabase } from "../../utils/supabase/client";
import { CustomDropdown } from "./CustomDropdown";
import type { TeamProfileAssignment } from "../../types/bd";

interface Team {
  id: string;
  name: string;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
}

interface OperationsTeamProfileEditorProps {
  serviceType?: string | null;
  initialTeamId?: string | null;
  initialAssignments?: TeamProfileAssignment[];
  onTeamChange: (team: Team | null) => void;
  onAssignmentsChange: (assignments: TeamProfileAssignment[]) => void;
}

export function OperationsTeamProfileEditor({
  serviceType,
  initialTeamId,
  initialAssignments = [],
  onTeamChange,
  onAssignmentsChange,
}: OperationsTeamProfileEditorProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId ?? "");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string>(() => {
    return initialAssignments.find((a) => a.role_key === "supervisor")?.user_id ?? "";
  });
  const [selectedHandlerId, setSelectedHandlerId] = useState<string>(() => {
    return initialAssignments.find((a) => a.role_key === "handler")?.user_id ?? "";
  });
  const [isLoadingTeams, setIsLoadingTeams] = useState(true);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  useEffect(() => {
    supabase
      .from("teams")
      .select("id, name")
      .eq("department", "Operations")
      .order("name")
      .then(({ data }) => {
        setTeams(data ?? []);
        setIsLoadingTeams(false);
      });
  }, []);

  useEffect(() => {
    if (!serviceType || teams.length === 0) return;
    const matchingTeam = teams.find((t) => t.name === serviceType);
    if (matchingTeam && selectedTeamId !== matchingTeam.id) {
      setSelectedTeamId(matchingTeam.id);
    }
  }, [serviceType, teams, selectedTeamId]);

  useEffect(() => {
    if (!selectedTeamId) {
      setMembers([]);
      setSelectedSupervisorId("");
      setSelectedHandlerId("");
      onTeamChange(null);
      onAssignmentsChange([]);
      return;
    }

    setIsLoadingMembers(true);
    supabase
      .from("users")
      .select("id, name, role")
      .eq("department", "Operations")
      .eq("team_id", selectedTeamId)
      .eq("is_active", true)
      .then(({ data }) => {
        setMembers(data ?? []);
        setIsLoadingMembers(false);
      });

    const team = teams.find((t) => t.id === selectedTeamId);
    if (team) onTeamChange(team);
  }, [selectedTeamId, teams]);

  // Fire assignments whenever selections change
  useEffect(() => {
    if (!selectedTeamId) return;
    const manager = members.find((m) => m.role === "manager");
    const supervisor = members.find((m) => m.id === selectedSupervisorId);
    const handler = members.find((m) => m.id === selectedHandlerId);

    const assignments: TeamProfileAssignment[] = [];
    if (manager) {
      assignments.push({ role_key: "manager", role_label: "Manager", user_id: manager.id, user_name: manager.name });
    }
    if (supervisor) {
      assignments.push({ role_key: "supervisor", role_label: "Supervisor", user_id: supervisor.id, user_name: supervisor.name });
    }
    if (handler) {
      assignments.push({ role_key: "handler", role_label: "Handler", user_id: handler.id, user_name: handler.name });
    }
    onAssignmentsChange(assignments);
  }, [members, selectedSupervisorId, selectedHandlerId, selectedTeamId]);

  const manager = members.find((m) => m.role === "manager");
  const supervisors = members.filter((m) => m.role === "team_leader");
  const handlers = members.filter((m) => m.role === "staff");
  const availableTeams = serviceType ? teams.filter((t) => t.name === serviceType) : teams;

  return (
    <div className="space-y-3">
      <CustomDropdown
        label="Team"
        value={selectedTeamId}
        onChange={(val) => {
          setSelectedTeamId(val);
          setSelectedSupervisorId("");
          setSelectedHandlerId("");
        }}
        options={[
          { value: "", label: "Select team..." },
          ...availableTeams.map((t) => ({ value: t.id, label: t.name })),
        ]}
        placeholder={isLoadingTeams ? "Loading..." : "Select team..."}
        disabled={isLoadingTeams}
        required
        fullWidth
      />

      {selectedTeamId && (
        <>
          <div>
            <label
              className="block text-[11px] font-medium uppercase tracking-wide mb-1.5"
              style={{ color: "var(--neuron-ink-muted)" }}
            >
              Manager <span style={{ color: "var(--theme-action-primary-bg)", textTransform: "none" }}>(auto-assigned)</span>
            </label>
            <input
              type="text"
              value={isLoadingMembers ? "Loading..." : (manager?.name ?? "No manager in this team")}
              disabled
              className="w-full px-3 py-2 rounded-lg text-[13px]"
              style={{
                border: "1px solid var(--neuron-ui-border)",
                backgroundColor: "var(--theme-bg-page)",
                color: manager ? "var(--neuron-ink-primary)" : "var(--theme-text-muted)",
                cursor: "not-allowed",
              }}
            />
          </div>

          <CustomDropdown
            label="Supervisor (Optional)"
            value={selectedSupervisorId}
            onChange={setSelectedSupervisorId}
            options={[
              { value: "", label: "None" },
              ...supervisors.map((s) => ({ value: s.id, label: s.name })),
            ]}
            placeholder={isLoadingMembers ? "Loading..." : (supervisors.length === 0 ? "No supervisors" : "Select supervisor...")}
            disabled={isLoadingMembers || supervisors.length === 0}
            fullWidth
          />

          <CustomDropdown
            label="Handler (Optional)"
            value={selectedHandlerId}
            onChange={setSelectedHandlerId}
            options={[
              { value: "", label: "None" },
              ...handlers.map((h) => ({ value: h.id, label: h.name })),
            ]}
            placeholder={isLoadingMembers ? "Loading..." : (handlers.length === 0 ? "No handlers" : "Select handler...")}
            disabled={isLoadingMembers || handlers.length === 0}
            fullWidth
          />
        </>
      )}
    </div>
  );
}
