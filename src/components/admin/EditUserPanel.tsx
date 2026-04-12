import { useState, useEffect } from "react";
import { useTeams } from "../../hooks/useTeams";
import { Loader2 } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { logActivity } from "../../utils/activityLog";
import { SidePanel } from "../common/SidePanel";
import { CustomDropdown } from "../bd/CustomDropdown";
import {
  DEPARTMENTS,
  ROLES,
  TEAM_ROLES,
  SERVICE_TYPE_OPTIONS,
  FieldLabel,
  INPUT_BASE,
} from "./userFormShared";

// Re-exported for consumers that import these types from this file
export type { TeamRole, UserRow } from "./userFormShared";

interface Props {
  isOpen: boolean;
  user: import("./userFormShared").UserRow;
  onClose: () => void;
  onSaved: () => void;
}

export function EditUserPanel({ isOpen, user, onClose, onSaved }: Props) {
  const { user: currentUser } = useUser();
  const [department, setDepartment] = useState(user.department);
  const [role, setRole] = useState(user.role);
  const [position, setPosition] = useState(user.position || "");
  const [teamId, setTeamId] = useState(user.team_id || "");
  const [serviceType, setServiceType] = useState(user.service_type || "");
  const [teamRole, setTeamRole] = useState<import("./userFormShared").TeamRole | "">(
    user.team_role || ""
  );
  const [evApprovalAuthority, setEvApprovalAuthority] = useState(
    user.ev_approval_authority ?? false
  );
  const [isActive, setIsActive] = useState(user.is_active);
  const [saving, setSaving] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  // Only fetch teams when Operations is selected
  const { teams } = useTeams(department === "Operations");

  // Reset Operations-specific fields when department changes away from Operations
  useEffect(() => {
    if (department !== "Operations") {
      setTeamId("");
      setServiceType("");
      setTeamRole("");
    }
  }, [department]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({
          department,
          role,
          position: position.trim() || null,
          team_id: teamId || null,
          // team_role and service_type are Operations-only — clear for other departments
          service_type: department === "Operations" ? (serviceType || null) : null,
          team_role: department === "Operations" ? (teamRole || null) : null,
          ev_approval_authority: evApprovalAuthority,
          is_active: isActive,
        })
        .eq("id", user.id);

      if (error) throw new Error(error.message);
      const actor = {
        id: currentUser?.id ?? "",
        name: currentUser?.name ?? "",
        department: currentUser?.department ?? "",
      };
      logActivity("user", user.id, user.name ?? user.email ?? user.id, "updated", actor, {
        description: "User profile updated",
      });
      toast.success("User updated");
      onSaved();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save changes";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    setDeactivating(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({ is_active: false })
        .eq("id", user.id);

      if (error) throw new Error(error.message);
      const actor = {
        id: currentUser?.id ?? "",
        name: currentUser?.name ?? "",
        department: currentUser?.department ?? "",
      };
      logActivity("user", user.id, user.name ?? user.email ?? user.id, "deactivated", actor);
      toast.success(`${user.name} has been deactivated`);
      onSaved();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to deactivate account";
      toast.error(message);
    } finally {
      setDeactivating(false);
    }
  };

  const initials = (user.name || user.email || "U").charAt(0).toUpperCase();

  const pillStyle = (selected: boolean, variant: "active" | "inactive"): React.CSSProperties => {
    if (selected) {
      return variant === "active"
        ? {
            backgroundColor: "var(--neuron-semantic-success-bg)",
            color: "var(--neuron-semantic-success-text)",
            border: "1px solid var(--neuron-semantic-success-border)",
          }
        : {
            backgroundColor: "var(--neuron-semantic-danger-bg)",
            color: "var(--neuron-semantic-danger)",
            border: "1px solid var(--neuron-semantic-danger-border)",
          };
    }
    return {
      backgroundColor: "var(--neuron-bg-elevated)",
      color: "var(--neuron-ink-muted)",
      border: "1px solid var(--neuron-ui-border)",
    };
  };

  const panelTitle = (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "50%",
          backgroundColor: "var(--neuron-brand-green-100)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span
            style={{ fontSize: "11px", fontWeight: 600, color: "var(--neuron-action-primary)" }}
          >
            {initials}
          </span>
        )}
      </div>
      <div>
        <p
          style={{
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--neuron-ink-primary)",
            lineHeight: "1.2",
          }}
        >
          {user.name}
        </p>
        <p style={{ fontSize: "12px", color: "var(--neuron-ink-muted)" }}>{user.department}</p>
      </div>
    </div>
  );

  const footer = (
    <div
      style={{
        padding: "16px 24px",
        borderTop: "1px solid var(--neuron-ui-border)",
        display: "flex",
        justifyContent: "space-between",
        backgroundColor: "var(--neuron-bg-elevated)",
      }}
    >
      <button
        onClick={onClose}
        style={{
          height: "40px",
          padding: "0 20px",
          background: "none",
          border: "none",
          color: "var(--neuron-ink-muted)",
          fontSize: "13px",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Cancel
      </button>
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          height: "40px",
          padding: "0 20px",
          borderRadius: "8px",
          background: "var(--neuron-action-primary)",
          border: "none",
          color: "var(--neuron-action-primary-text)",
          fontSize: "13px",
          fontWeight: 600,
          cursor: saving ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          opacity: saving ? 0.8 : 1,
        }}
      >
        {saving && (
          <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
        )}
        {saving ? "Saving\u2026" : "Save Changes"}
      </button>
    </div>
  );

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title={panelTitle} footer={footer} width="480px">
      <div className="p-6 overflow-y-auto h-full">

        {/* Read-only identity */}
        <div className="mb-5">
          <p className="text-[12px] font-medium text-[var(--neuron-ink-muted)] mb-1">Email</p>
          <p className="text-[13px] text-[var(--neuron-ink-primary)]">{user.email}</p>
        </div>

        <div className="border-t border-[var(--neuron-ui-border)] my-6" />

        {/* ── Account Access ───────────────────────────────────────── */}
        <div className="mb-5">
          <FieldLabel>Department</FieldLabel>
          <CustomDropdown
            label=""
            value={department}
            onChange={setDepartment}
            fullWidth
            triggerAriaLabel="Department"
            options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
          />
        </div>

        <div className="mb-5">
          <FieldLabel>Access Level</FieldLabel>
          <p className="text-[12px] text-[var(--neuron-ink-muted)] mb-2">
            Controls what this user can see and do in Neuron
          </p>
          <CustomDropdown
            label=""
            value={role}
            onChange={setRole}
            fullWidth
            triggerAriaLabel="Access Level"
            options={ROLES}
          />
        </div>

        <div className="mb-5">
          <FieldLabel htmlFor="edit-user-position">Position / Job Title</FieldLabel>
          <input
            id="edit-user-position"
            type="text"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="e.g. Import Supervisor"
            className={INPUT_BASE}
          />
        </div>

        {/* Operations-only: grouped into a card so Team, Team Title, and Service Type
            read as one cohesive assignment rather than three unrelated fields. */}
        {department === "Operations" && (
          <div className="mb-5 rounded-xl border border-[var(--neuron-ui-border)] overflow-hidden">
            {/* Card header */}
            <div
              className="px-4 py-3 border-b border-[var(--neuron-ui-border)]"
              style={{ backgroundColor: "var(--neuron-bg-subtle)" }}
            >
              <p className="text-[13px] font-medium text-[var(--neuron-ink-primary)]">
                Team Assignment
              </p>
              <p className="text-[12px] text-[var(--neuron-ink-muted)]">
                Operations team, position, and service lane
              </p>
            </div>

            {/* Card body */}
            <div
              className="p-4 flex flex-col gap-4"
              style={{ backgroundColor: "var(--neuron-bg-elevated)" }}
            >
              <div>
                <FieldLabel>Team</FieldLabel>
                <CustomDropdown
                  label=""
                  value={teamId}
                  onChange={setTeamId}
                  fullWidth
                  triggerAriaLabel="Team"
                  options={[
                    { value: "", label: "No team" },
                    ...teams.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                />
              </div>

              <div>
                <FieldLabel>Team Title</FieldLabel>
                <p className="text-[12px] text-[var(--neuron-ink-muted)] mb-2">
                  Display label only — doesn't affect permissions
                </p>
                <CustomDropdown
                  label=""
                  value={teamRole}
                  onChange={(v) => setTeamRole(v as import("./userFormShared").TeamRole | "")}
                  fullWidth
                  triggerAriaLabel="Team Title"
                  options={TEAM_ROLES}
                />
              </div>

              <div>
                <FieldLabel>Service Type</FieldLabel>
                <CustomDropdown
                  label=""
                  value={serviceType}
                  onChange={setServiceType}
                  fullWidth
                  triggerAriaLabel="Service Type"
                  options={SERVICE_TYPE_OPTIONS}
                />
              </div>
            </div>
          </div>
        )}

        {/* EV Approval Authority — visible for team_leader role only */}
        {role === "team_leader" && (
          <div
            className="mb-5"
            style={{
              padding: "16px",
              borderRadius: "10px",
              border: "1px solid var(--neuron-ui-border)",
              backgroundColor: "var(--neuron-bg-subtle)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-primary)",
                    marginBottom: "2px",
                  }}
                >
                  Independent EV Approval Authority
                </p>
                <p style={{ fontSize: "12px", color: "var(--neuron-ink-muted)" }}>
                  When enabled, this team leader's approvals close the voucher without CEO
                  escalation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEvApprovalAuthority(!evApprovalAuthority)}
                aria-pressed={evApprovalAuthority}
                aria-label="Independent EV Approval Authority"
                style={{
                  width: "44px",
                  height: "24px",
                  borderRadius: "12px",
                  border: "none",
                  backgroundColor: evApprovalAuthority
                    ? "var(--neuron-action-primary)"
                    : "var(--neuron-ui-border)",
                  cursor: "pointer",
                  position: "relative",
                  flexShrink: 0,
                  transition: "background-color 0.2s",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "3px",
                    left: evApprovalAuthority ? "23px" : "3px",
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    // Use theme token instead of hard-coded #FFFFFF so dark mode works
                    backgroundColor: "var(--neuron-bg-elevated)",
                    transition: "left 0.2s",
                  }}
                />
              </button>
            </div>
          </div>
        )}

        <div className="mb-6">
          <FieldLabel>Status</FieldLabel>
          <div role="group" aria-label="Account status" className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsActive(true)}
              aria-pressed={isActive}
              style={{
                height: "36px",
                padding: "0 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                ...pillStyle(isActive, "active"),
              }}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setIsActive(false)}
              aria-pressed={!isActive}
              style={{
                height: "36px",
                padding: "0 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                ...pillStyle(!isActive, "inactive"),
              }}
            >
              Inactive
            </button>
          </div>
        </div>

        {/* ── Danger zone ──────────────────────────────────────────── */}
        <div className="border-t border-[var(--neuron-ui-border)] pt-6">
          {!showDeactivateConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeactivateConfirm(true)}
              style={{
                background: "none",
                border: "none",
                color: "var(--neuron-semantic-danger)",
                fontSize: "13px",
                cursor: "pointer",
                fontWeight: 500,
                padding: 0,
              }}
            >
              Deactivate Account
            </button>
          ) : (
            <div>
              <p
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--neuron-ink-primary)",
                  marginBottom: "6px",
                }}
              >
                Deactivate {user.name}?
              </p>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--neuron-ink-muted)",
                  marginBottom: "16px",
                }}
              >
                This will prevent them from logging in. Their data will not be deleted.
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setShowDeactivateConfirm(false)}
                  style={{
                    height: "36px",
                    padding: "0 16px",
                    borderRadius: "8px",
                    background: "var(--neuron-bg-elevated)",
                    border: "1px solid var(--neuron-ui-border)",
                    color: "var(--neuron-ink-muted)",
                    fontSize: "13px",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeactivate}
                  disabled={deactivating}
                  style={{
                    height: "36px",
                    padding: "0 16px",
                    borderRadius: "8px",
                    background: "var(--neuron-semantic-danger)",
                    border: "none",
                    color: "var(--neuron-action-primary-text)",
                    fontSize: "13px",
                    cursor: deactivating ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    opacity: deactivating ? 0.8 : 1,
                  }}
                >
                  {deactivating && (
                    <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                  )}
                  {deactivating ? "Deactivating\u2026" : "Deactivate"}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </SidePanel>
  );
}
