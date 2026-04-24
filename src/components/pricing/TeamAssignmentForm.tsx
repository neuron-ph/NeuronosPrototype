import { useState, useEffect } from "react";
import { supabase } from "../../utils/supabase/client";
import { CustomDropdown } from "../bd/CustomDropdown";
import { Users } from "lucide-react";

export interface TeamAssignment {
  team: { id: string; name: string };
  manager: { id: string; name: string };
  supervisor: { id: string; name: string } | null;
  handler: { id: string; name: string } | null;
  saveAsDefault: boolean;
}

interface TeamAssignmentFormProps {
  customerId: string;
  serviceType?: string;
  onChange: (assignments: TeamAssignment) => void;
  initialAssignments?: TeamAssignment;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
}

interface Team {
  id: string;
  name: string;
}

export function TeamAssignmentForm({
  customerId,
  serviceType,
  onChange,
  initialAssignments,
}: TeamAssignmentFormProps) {
  const [selectedTeamId, setSelectedTeamId] = useState(initialAssignments?.team?.id ?? "");
  const [selectedSupervisorId, setSelectedSupervisorId] = useState(initialAssignments?.supervisor?.id ?? "");
  const [selectedHandlerId, setSelectedHandlerId] = useState(initialAssignments?.handler?.id ?? "");
  const [saveAsDefault, setSaveAsDefault] = useState(initialAssignments?.saveAsDefault ?? false);
  const [hasSavedPreference, setHasSavedPreference] = useState(false);

  const [teams, setTeams] = useState<Team[]>([]);
  const [manager, setManager] = useState<{ id: string; name: string } | null>(
    initialAssignments?.manager ?? null
  );
  const [supervisors, setSupervisors] = useState<TeamMember[]>([]);
  const [handlers, setHandlers] = useState<TeamMember[]>([]);

  const [isLoadingTeams, setIsLoadingTeams] = useState(true);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  // Fetch all Operations teams on mount
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

  // Fetch team members when team selection changes
  useEffect(() => {
    if (!selectedTeamId) {
      setManager(null);
      setSupervisors([]);
      setHandlers([]);
      setSelectedSupervisorId("");
      setSelectedHandlerId("");
      return;
    }

    setIsLoadingMembers(true);
    supabase
      .from("users")
      .select("id, name, role")
      .eq("department", "Operations")
      .eq("team_id", selectedTeamId)
      .then(({ data }) => {
        const members = data ?? [];
        const mgr = members.find((m) => m.role === "manager");
        const svs = members.filter((m) => m.role === "team_leader");
        const hds = members.filter((m) => m.role === "staff");
        setManager(mgr ? { id: mgr.id, name: mgr.name } : null);
        setSupervisors(svs);
        setHandlers(hds);
        setIsLoadingMembers(false);
      });
  }, [selectedTeamId]);

  // Load saved preference when team changes — prefer customer_team_profiles, fallback to legacy
  useEffect(() => {
    if (!customerId || !selectedTeamId) return;

    const effectiveServiceType = serviceType ?? null;

    supabase
      .from("customer_team_profiles")
      .select("assignments, team_id")
      .eq("customer_id", customerId)
      .eq("department", "Operations")
      .eq("team_id", selectedTeamId)
      .maybeSingle()
      .then(async ({ data: profileData }) => {
        if (profileData?.assignments?.length) {
          const assignments: { role_key: string; user_id: string }[] = profileData.assignments;
          const sv = assignments.find((a) => a.role_key === "supervisor");
          const hd = assignments.find((a) => a.role_key === "handler");
          if (sv?.user_id) setSelectedSupervisorId(sv.user_id);
          if (hd?.user_id) setSelectedHandlerId(hd.user_id);
          setHasSavedPreference(true);
          return;
        }
        // Fallback to legacy table
        const { data: legacyData } = await supabase
          .from("client_handler_preferences")
          .select("preferred_supervisor_id, preferred_handler_id")
          .eq("customer_id", customerId)
          .eq("preferred_team_id", selectedTeamId)
          .maybeSingle();
        if (legacyData) {
          if (legacyData.preferred_supervisor_id) setSelectedSupervisorId(legacyData.preferred_supervisor_id);
          if (legacyData.preferred_handler_id) setSelectedHandlerId(legacyData.preferred_handler_id);
          setHasSavedPreference(true);
        } else {
          setHasSavedPreference(false);
        }
      });
  }, [customerId, selectedTeamId, serviceType]);

  // Fire onChange once team + manager are set; supervisor/handler are optional
  useEffect(() => {
    if (!selectedTeamId || !manager) return;

    const team = teams.find((t) => t.id === selectedTeamId);
    if (!team) return;

    const supervisor = supervisors.find((s) => s.id === selectedSupervisorId);
    const handler = handlers.find((h) => h.id === selectedHandlerId);

    onChange({
      team: { id: team.id, name: team.name },
      manager,
      supervisor: supervisor ? { id: supervisor.id, name: supervisor.name } : null,
      handler: handler ? { id: handler.id, name: handler.name } : null,
      saveAsDefault,
    });
  }, [selectedTeamId, manager, selectedSupervisorId, selectedHandlerId, saveAsDefault, teams, supervisors, handlers, onChange]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Users size={16} color="var(--theme-action-primary-bg)" />
        <span
          style={{
            fontSize: "12px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: "var(--theme-action-primary-bg)",
          }}
        >
          Team Assignment
        </span>
      </div>

      {/* Team picker */}
      <CustomDropdown
        label="Team"
        value={selectedTeamId}
        onChange={(val) => {
          setSelectedTeamId(val);
          setSelectedSupervisorId("");
          setSelectedHandlerId("");
        }}
        options={teams.map((t) => ({ value: t.id, label: t.name }))}
        placeholder={isLoadingTeams ? "Loading teams..." : "Select team..."}
        disabled={isLoadingTeams}
        required
        fullWidth
      />

      {/* Members — only shown after a team is selected */}
      {selectedTeamId && (
        <>
          {/* Manager (auto-assigned, read-only) */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--theme-text-primary)",
                marginBottom: "6px",
              }}
            >
              Manager{" "}
              <span style={{ color: "var(--theme-action-primary-bg)", fontWeight: 400 }}>
                (Auto-assigned)
              </span>
            </label>
            <input
              type="text"
              value={
                isLoadingMembers
                  ? "Loading..."
                  : manager?.name ?? "No manager in this team"
              }
              disabled
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid var(--theme-border-default)",
                background: "var(--theme-bg-page)",
                fontSize: "13px",
                color: manager ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
                cursor: "not-allowed",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Supervisor */}
          <CustomDropdown
            label="Supervisor (Optional)"
            value={selectedSupervisorId}
            onChange={setSelectedSupervisorId}
            options={[
              { value: "", label: "None" },
              ...supervisors.map((s) => ({ value: s.id, label: s.name })),
            ]}
            placeholder={
              isLoadingMembers
                ? "Loading..."
                : supervisors.length === 0
                ? "No supervisors in this team"
                : "Select supervisor..."
            }
            disabled={isLoadingMembers || supervisors.length === 0}
            helperText={
              hasSavedPreference ? (
                <span style={{ fontSize: "11px", color: "var(--theme-action-primary-bg)" }}>
                  Saved preference
                </span>
              ) : undefined
            }
            fullWidth
          />

          {/* Handler */}
          <CustomDropdown
            label="Handler (Optional)"
            value={selectedHandlerId}
            onChange={setSelectedHandlerId}
            options={[
              { value: "", label: "None" },
              ...handlers.map((h) => ({ value: h.id, label: h.name })),
            ]}
            placeholder={
              isLoadingMembers
                ? "Loading..."
                : handlers.length === 0
                ? "No handlers in this team"
                : "Select handler..."
            }
            disabled={isLoadingMembers || handlers.length === 0}
            helperText={
              hasSavedPreference ? (
                <span style={{ fontSize: "11px", color: "var(--theme-action-primary-bg)" }}>
                  Saved preference
                </span>
              ) : undefined
            }
            fullWidth
          />

          {/* Save as default */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="save-as-default"
              checked={saveAsDefault}
              onChange={(e) => setSaveAsDefault(e.target.checked)}
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "4px",
                cursor: "pointer",
                appearance: "none",
                backgroundColor: saveAsDefault
                  ? "var(--theme-action-primary-bg)"
                  : "var(--theme-bg-surface)",
                border: "1px solid",
                borderColor: saveAsDefault
                  ? "var(--theme-action-primary-bg)"
                  : "var(--neuron-ui-muted)",
                backgroundImage: saveAsDefault
                  ? `url("data:image/svg+xml,%3Csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3E%3C/svg%3E")`
                  : "none",
                backgroundSize: "100% 100%",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                flexShrink: 0,
              }}
            />
            <label
              htmlFor="save-as-default"
              style={{
                fontSize: "13px",
                color: "var(--theme-text-secondary)",
                cursor: "pointer",
              }}
            >
              Save as default handler preference for this customer
            </label>
          </div>
        </>
      )}
    </div>
  );
}
