import { useState, useEffect, useRef } from "react";
import { supabase } from "../../utils/supabase/client";
import { CustomDropdown } from "../bd/CustomDropdown";
import { Checkbox } from "../ui/checkbox";
import { Users, Lock } from "lucide-react";
import { getTeamRoleLabel } from "../../config/booking/teamRoles";

export interface TeamAssignment {
  team: { id: string; name: string };
  manager: { id: string; name: string };
  supervisor: { id: string; name: string } | null;
  handler: { id: string; name: string } | null;
  saveAsDefault: boolean;
}

interface TeamAssignmentFormProps {
  customerId: string;
  customerName?: string;
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

// ── Sub-components ────────────────────────────────────────────────────────────

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "9px 0",
  borderTop: "1px solid var(--theme-border-default)",
};

const LABEL_STYLE: React.CSSProperties = {
  width: "84px",
  flexShrink: 0,
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--theme-text-muted)",
  letterSpacing: "0.01em",
};

const ACTION_BTN_STYLE: React.CSSProperties = {
  flexShrink: 0,
  fontSize: "12px",
  color: "var(--theme-action-primary-bg)",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "2px 6px",
  borderRadius: "4px",
  lineHeight: 1,
};

const DISABLED_ACTION_BTN_STYLE: React.CSSProperties = {
  ...ACTION_BTN_STYLE,
  color: "var(--theme-text-muted)",
  cursor: "default",
  opacity: 0.5,
};

function CrewDisplayRow({
  label,
  value,
  locked,
  optional,
  onEdit,
  editDisabled,
}: {
  label: string;
  value?: string;
  locked?: boolean;
  optional?: boolean;
  onEdit?: () => void;
  editDisabled?: boolean;
}) {
  return (
    <div style={ROW_STYLE}>
      <span style={LABEL_STYLE}>{label}</span>
      <span
        style={{
          flex: 1,
          fontSize: "13px",
          color: value ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
          fontStyle: !value ? "italic" : undefined,
        }}
      >
        {value || "—"}
      </span>
      {locked ? (
        <Lock size={12} color="var(--theme-text-muted)" style={{ flexShrink: 0 }} />
      ) : optional ? (
        <button
          type="button"
          onClick={editDisabled ? undefined : onEdit}
          style={editDisabled ? DISABLED_ACTION_BTN_STYLE : ACTION_BTN_STYLE}
          disabled={editDisabled}
        >
          {value ? "swap" : "+ add"}
        </button>
      ) : null}
    </div>
  );
}

function CrewEditRow({
  label,
  value,
  options,
  onConfirm,
  onCancel,
  disabled,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onConfirm: (val: string) => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <div style={ROW_STYLE}>
      <span style={LABEL_STYLE}>{label}</span>
      <select
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        value={value}
        onChange={(e) => onConfirm(e.target.value)}
        disabled={disabled}
        style={{
          flex: 1,
          padding: "5px 8px",
          border: "1px solid var(--theme-action-primary-bg)",
          borderRadius: "5px",
          fontSize: "13px",
          color: "var(--theme-text-primary)",
          background: "var(--theme-bg-elevated)",
          cursor: "pointer",
          outline: "none",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onCancel}
        title="Cancel"
        style={{
          flexShrink: 0,
          fontSize: "14px",
          color: "var(--theme-text-muted)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "2px 4px",
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TeamAssignmentForm({
  customerId,
  customerName,
  serviceType,
  onChange,
  initialAssignments,
}: TeamAssignmentFormProps) {
  const hasInitialAssignment = !!initialAssignments?.team?.id;
  const skippedInitialTeamPreferenceLoad = useRef(false);
  const [resolvedCustomerId, setResolvedCustomerId] = useState(customerId || "");
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

  // New UI state
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [isEditingSupervisor, setIsEditingSupervisor] = useState(false);
  const [isEditingHandler, setIsEditingHandler] = useState(false);

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

  // Resolve a usable customer id
  useEffect(() => {
    let cancelled = false;

    if (customerId) {
      setResolvedCustomerId(customerId);
      return;
    }

    if (!customerName?.trim()) {
      setResolvedCustomerId("");
      return;
    }

    supabase
      .from("customers")
      .select("id")
      .eq("name", customerName.trim())
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("TeamAssignmentForm: failed to resolve customer id", error);
          setResolvedCustomerId("");
          return;
        }
        setResolvedCustomerId(data?.id ?? "");
      });

    return () => {
      cancelled = true;
    };
  }, [customerId, customerName]);

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

  // Auto-load the saved team profile as soon as customer + service are known
  useEffect(() => {
    if (hasInitialAssignment || !resolvedCustomerId || !serviceType) return;

    let cancelled = false;

    const loadInitialPreference = async () => {
      const { data: canonicalProfile, error: canonicalError } = await supabase
        .from("customer_team_profiles")
        .select("team_id, assignments")
        .eq("customer_id", resolvedCustomerId)
        .eq("department", "Operations")
        .eq("service_type", serviceType)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (canonicalError) {
        console.error("TeamAssignmentForm: failed to load canonical profile", canonicalError);
      }

      if (canonicalProfile?.team_id) {
        const assignments: { role_key: string; user_id: string }[] = canonicalProfile.assignments ?? [];
        const sv = assignments.find((a) => a.role_key === "supervisor");
        const hd = assignments.find((a) => a.role_key === "handler");
        setSelectedTeamId(canonicalProfile.team_id);
        setSelectedSupervisorId(sv?.user_id ?? "");
        setSelectedHandlerId(hd?.user_id ?? "");
        setHasSavedPreference(assignments.length > 0);
        return;
      }

      const { data: legacyData, error: legacyError } = await supabase
        .from("client_handler_preferences")
        .select("preferred_team_id, preferred_supervisor_id, preferred_handler_id")
        .eq("customer_id", resolvedCustomerId)
        .eq("service_type", serviceType)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (legacyError) {
        console.error("TeamAssignmentForm: failed to load legacy preference", legacyError);
      }

      if (legacyData?.preferred_team_id) {
        setSelectedTeamId(legacyData.preferred_team_id);
        setSelectedSupervisorId(legacyData.preferred_supervisor_id ?? "");
        setSelectedHandlerId(legacyData.preferred_handler_id ?? "");
        setHasSavedPreference(true);
        return;
      }

      setSelectedTeamId("");
      setSelectedSupervisorId("");
      setSelectedHandlerId("");
      setHasSavedPreference(false);
    };

    void loadInitialPreference();

    return () => {
      cancelled = true;
    };
  }, [hasInitialAssignment, resolvedCustomerId, serviceType]);

  // Load saved preference when the user manually changes teams
  useEffect(() => {
    if (!resolvedCustomerId || !selectedTeamId) return;

    if (!skippedInitialTeamPreferenceLoad.current) {
      skippedInitialTeamPreferenceLoad.current = true;
      if (hasInitialAssignment) return;
    }

    let cancelled = false;

    const loadTeamPreference = async () => {
      let canonicalQuery = supabase
        .from("customer_team_profiles")
        .select("assignments")
        .eq("customer_id", resolvedCustomerId)
        .eq("department", "Operations")
        .eq("team_id", selectedTeamId)
        .limit(1);

      canonicalQuery = serviceType
        ? canonicalQuery.eq("service_type", serviceType)
        : canonicalQuery;

      const { data: profileData, error: canonicalError } = await canonicalQuery.maybeSingle();

      if (cancelled) return;
      if (canonicalError) {
        console.error("TeamAssignmentForm: failed to load team preference", canonicalError);
      }

      if (profileData?.assignments?.length) {
        const assignments: { role_key: string; user_id: string }[] = profileData.assignments;
        const sv = assignments.find((a) => a.role_key === "supervisor");
        const hd = assignments.find((a) => a.role_key === "handler");
        setSelectedSupervisorId(sv?.user_id ?? "");
        setSelectedHandlerId(hd?.user_id ?? "");
        setHasSavedPreference(true);
        return;
      }

      let legacyQuery = supabase
        .from("client_handler_preferences")
        .select("preferred_supervisor_id, preferred_handler_id")
        .eq("customer_id", resolvedCustomerId)
        .eq("preferred_team_id", selectedTeamId)
        .limit(1);

      legacyQuery = serviceType
        ? legacyQuery.eq("service_type", serviceType)
        : legacyQuery;

      const { data: legacyData, error: legacyError } = await legacyQuery.maybeSingle();

      if (cancelled) return;
      if (legacyError) {
        console.error("TeamAssignmentForm: failed to load legacy team preference", legacyError);
      }

      if (legacyData) {
        setSelectedSupervisorId(legacyData.preferred_supervisor_id ?? "");
        setSelectedHandlerId(legacyData.preferred_handler_id ?? "");
        setHasSavedPreference(true);
      } else {
        setSelectedSupervisorId("");
        setSelectedHandlerId("");
        setHasSavedPreference(false);
      }
    };

    void loadTeamPreference();

    return () => {
      cancelled = true;
    };
  }, [hasInitialAssignment, resolvedCustomerId, selectedTeamId, serviceType]);

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

  const handleClearPreference = () => {
    setSelectedSupervisorId("");
    setSelectedHandlerId("");
    setHasSavedPreference(false);
  };

  const handleTeamChange = (val: string) => {
    setSelectedTeamId(val);
    setSelectedSupervisorId("");
    setSelectedHandlerId("");
    setHasSavedPreference(false);
    setIsEditingSupervisor(false);
    setIsEditingHandler(false);
    if (val) setShowTeamPicker(false);
  };

  const currentTeamName = teams.find((t) => t.id === selectedTeamId)?.name;
  const currentSupervisorName = supervisors.find((s) => s.id === selectedSupervisorId)?.name;
  const currentHandlerName = handlers.find((h) => h.id === selectedHandlerId)?.name;

  // ── State 1: no team selected, show command trigger ───────────────────────
  if (!selectedTeamId && !showTeamPicker) {
    return (
      <button
        type="button"
        onClick={() => setShowTeamPicker(true)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "11px 14px",
          border: "1px dashed var(--theme-border-default)",
          borderRadius: "7px",
          background: "transparent",
          color: "var(--theme-text-muted)",
          fontSize: "13px",
          cursor: "pointer",
          transition: "border-color 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--theme-action-primary-bg)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--theme-action-primary-bg)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--theme-border-default)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--theme-text-muted)";
        }}
      >
        <Users size={15} />
        Assign a team...
      </button>
    );
  }

  // ── State: team picker open (initial select or changing) ──────────────────
  if (showTeamPicker) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <CustomDropdown
          label="Team"
          value={selectedTeamId}
          onChange={handleTeamChange}
          options={teams.map((t) => ({ value: t.id, label: t.name }))}
          placeholder={isLoadingTeams ? "Loading teams..." : "Select team..."}
          disabled={isLoadingTeams}
          required
          fullWidth
        />
        {selectedTeamId && (
          <button
            type="button"
            onClick={() => setShowTeamPicker(false)}
            style={{
              alignSelf: "flex-start",
              fontSize: "12px",
              color: "var(--theme-text-muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0",
            }}
          >
            Cancel
          </button>
        )}
      </div>
    );
  }

  // ── State 2: team selected — inline command view ──────────────────────────
  return (
    <div>
      {/* Header: team name + default badge + change action */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              fontWeight: 600,
              fontSize: "14px",
              color: "var(--theme-text-primary)",
            }}
          >
            {currentTeamName || "—"}
          </span>
          {hasSavedPreference && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                fontWeight: 500,
                color: "var(--theme-action-primary-bg)",
                background: "rgba(15, 118, 110, 0.08)",
                border: "1px solid rgba(15, 118, 110, 0.2)",
                borderRadius: "4px",
                padding: "1px 6px",
                lineHeight: "18px",
              }}
            >
              ★ Default
              <button
                type="button"
                onClick={handleClearPreference}
                title="Clear default"
                style={{
                  marginLeft: "2px",
                  fontSize: "13px",
                  lineHeight: 1,
                  color: "var(--theme-action-primary-bg)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0",
                  opacity: 0.7,
                }}
              >
                ×
              </button>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowTeamPicker(true)}
          style={{
            fontSize: "12px",
            color: "var(--theme-action-primary-bg)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 0",
            opacity: 0.8,
          }}
        >
          change
        </button>
      </div>

      {/* Crew table */}
      <div
        style={{
          border: "1px solid var(--theme-border-default)",
          borderRadius: "7px",
          overflow: "hidden",
        }}
      >
        {/* Manager — locked, derived from team */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "9px 12px",
            background: "var(--theme-bg-page)",
          }}
        >
          <span style={{ ...LABEL_STYLE }}>{getTeamRoleLabel('manager', serviceType)}</span>
          <span
            style={{
              flex: 1,
              fontSize: "13px",
              color: manager ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
              fontStyle: !manager ? "italic" : undefined,
            }}
          >
            {isLoadingMembers ? "Loading..." : manager?.name || "No manager assigned"}
          </span>
          <Lock size={12} color="var(--theme-text-muted)" style={{ flexShrink: 0 }} />
        </div>

        {/* Supervisor */}
        {isEditingSupervisor ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "7px 12px",
              borderTop: "1px solid var(--theme-border-default)",
              background: "var(--theme-bg-elevated)",
            }}
          >
            <span style={{ ...LABEL_STYLE }}>{getTeamRoleLabel('supervisor', serviceType)}</span>
            <select
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={selectedSupervisorId}
              onChange={(e) => {
                setSelectedSupervisorId(e.target.value);
                setIsEditingSupervisor(false);
              }}
              disabled={isLoadingMembers || supervisors.length === 0}
              style={{
                flex: 1,
                padding: "5px 8px",
                border: "1px solid var(--theme-action-primary-bg)",
                borderRadius: "5px",
                fontSize: "13px",
                color: "var(--theme-text-primary)",
                background: "var(--theme-bg-elevated)",
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="">None</option>
              {supervisors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setIsEditingSupervisor(false)}
              title="Cancel"
              style={{
                flexShrink: 0,
                fontSize: "15px",
                color: "var(--theme-text-muted)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "0 2px",
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "9px 12px",
              borderTop: "1px solid var(--theme-border-default)",
            }}
          >
            <span style={{ ...LABEL_STYLE }}>{getTeamRoleLabel('supervisor', serviceType)}</span>
            <span
              style={{
                flex: 1,
                fontSize: "13px",
                color: currentSupervisorName ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
                fontStyle: !currentSupervisorName ? "italic" : undefined,
              }}
            >
              {currentSupervisorName || "—"}
            </span>
            <button
              type="button"
              onClick={() => setIsEditingSupervisor(true)}
              disabled={isLoadingMembers || supervisors.length === 0}
              style={
                isLoadingMembers || supervisors.length === 0
                  ? DISABLED_ACTION_BTN_STYLE
                  : ACTION_BTN_STYLE
              }
            >
              {currentSupervisorName ? "swap" : "+ add"}
            </button>
          </div>
        )}

        {/* Handler */}
        {isEditingHandler ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "7px 12px",
              borderTop: "1px solid var(--theme-border-default)",
              background: "var(--theme-bg-elevated)",
            }}
          >
            <span style={{ ...LABEL_STYLE }}>{getTeamRoleLabel('handler', serviceType)}</span>
            <select
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={selectedHandlerId}
              onChange={(e) => {
                setSelectedHandlerId(e.target.value);
                setIsEditingHandler(false);
              }}
              disabled={isLoadingMembers || handlers.length === 0}
              style={{
                flex: 1,
                padding: "5px 8px",
                border: "1px solid var(--theme-action-primary-bg)",
                borderRadius: "5px",
                fontSize: "13px",
                color: "var(--theme-text-primary)",
                background: "var(--theme-bg-elevated)",
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="">None</option>
              {handlers.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setIsEditingHandler(false)}
              title="Cancel"
              style={{
                flexShrink: 0,
                fontSize: "15px",
                color: "var(--theme-text-muted)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "0 2px",
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "9px 12px",
              borderTop: "1px solid var(--theme-border-default)",
            }}
          >
            <span style={{ ...LABEL_STYLE }}>{getTeamRoleLabel('handler', serviceType)}</span>
            <span
              style={{
                flex: 1,
                fontSize: "13px",
                color: currentHandlerName ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
                fontStyle: !currentHandlerName ? "italic" : undefined,
              }}
            >
              {currentHandlerName || "—"}
            </span>
            <button
              type="button"
              onClick={() => setIsEditingHandler(true)}
              disabled={isLoadingMembers || handlers.length === 0}
              style={
                isLoadingMembers || handlers.length === 0
                  ? DISABLED_ACTION_BTN_STYLE
                  : ACTION_BTN_STYLE
              }
            >
              {currentHandlerName ? "swap" : "+ add"}
            </button>
          </div>
        )}
      </div>

      {/* Save as default */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginTop: "12px",
        }}
      >
        <Checkbox
          id="save-as-default"
          checked={saveAsDefault}
          onCheckedChange={(checked) => setSaveAsDefault(checked === true)}
          style={{
            borderColor: saveAsDefault
              ? "var(--theme-action-primary-bg)"
              : "var(--neuron-ui-muted)",
          }}
        />
        <label
          htmlFor="save-as-default"
          style={{
            fontSize: "12px",
            color: "var(--theme-text-secondary)",
            cursor: "pointer",
          }}
        >
          Save as default crew
        </label>
      </div>
    </div>
  );
}
