import { useState } from "react";
import { useTeams } from "../../hooks/useTeams";
import { Loader2 } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { logActivity } from "../../utils/activityLog";
import { SidePanel } from "../common/SidePanel";
import { CustomDropdown } from "../bd/CustomDropdown";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  department: string;
  role: string;
  position?: string | null;
  team_id: string | null;
  is_active: boolean;
  status?: "active" | "inactive" | "suspended" | null;
  avatar_url?: string | null;
  created_at?: string;
  teams: { name: string } | null;
  service_type?: string | null;
  ev_approval_authority?: boolean | null;
};

interface Props {
  isOpen: boolean;
  user: UserRow;
  onClose: () => void;
  onSaved: () => void;
}

const DEPARTMENTS = [
  "Business Development", "Pricing", "Operations", "Accounting", "HR", "Executive",
];

const ROLES = [
  { value: "staff", label: "Staff" },
  { value: "team_leader", label: "Team Leader" },
  { value: "manager", label: "Manager" },
];

function FieldLabel({ children }: { children: string }) {
  return (
    <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--neuron-ink-primary)", marginBottom: "6px" }}>
      {children}
    </label>
  );
}

export function EditUserPanel({ isOpen, user, onClose, onSaved }: Props) {
  const { user: currentUser } = useUser();
  const [department, setDepartment] = useState(user.department);
  const [role, setRole] = useState(user.role);
  const [position, setPosition] = useState(user.position || "");
  const [teamId, setTeamId] = useState(user.team_id || "");
  const [serviceType, setServiceType] = useState(user.service_type || "");
  const [evApprovalAuthority, setEvApprovalAuthority] = useState(user.ev_approval_authority ?? false);
  const [isActive, setIsActive] = useState(user.is_active);
  const [saving, setSaving] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const { teams } = useTeams();

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
          service_type: department === "Operations" ? (serviceType || null) : null,
          ev_approval_authority: evApprovalAuthority,
          is_active: isActive,
        })
        .eq("id", user.id);

      if (error) throw new Error(error.message);
      const actor = { id: currentUser?.id ?? "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" };
      logActivity("user", user.id, user.name ?? user.email ?? user.id, "updated", actor, { description: "User profile updated" });
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
      const actor = { id: currentUser?.id ?? "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" };
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
        ? { backgroundColor: "var(--neuron-semantic-success-bg)", color: "var(--neuron-semantic-success-text)", border: "1px solid var(--neuron-semantic-success-border)" }
        : { backgroundColor: "var(--neuron-semantic-danger-bg)", color: "var(--neuron-semantic-danger)", border: "1px solid var(--neuron-semantic-danger-border)" };
    }
    return { backgroundColor: "var(--neuron-bg-elevated)", color: "var(--neuron-ink-muted)", border: "1px solid var(--neuron-ui-border)" };
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
          <img src={user.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--neuron-action-primary)" }}>{initials}</span>
        )}
      </div>
      <div>
        <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--neuron-ink-primary)", lineHeight: "1.2" }}>{user.name}</p>
        <p style={{ fontSize: "12px", color: "var(--neuron-ink-muted)" }}>{user.department}</p>
      </div>
    </div>
  );

  const footer = (
    <div style={{ padding: "16px 24px", borderTop: "1px solid var(--neuron-ui-border)", display: "flex", justifyContent: "space-between", backgroundColor: "var(--neuron-bg-elevated)" }}>
      <button
        onClick={onClose}
        style={{ height: "40px", padding: "0 20px", background: "none", border: "none", color: "var(--neuron-ink-muted)", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}
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
        {saving && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
        {saving ? "Saving\u2026" : "Save Changes"}
      </button>
    </div>
  );

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title={panelTitle} footer={footer} width="480px">
      <div style={{ padding: "24px", overflowY: "auto", height: "100%" }}>

        {/* Read-only email */}
        <div style={{ marginBottom: "20px" }}>
          <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--neuron-ink-muted)", marginBottom: "4px" }}>Email</p>
          <p style={{ fontSize: "13px", color: "var(--neuron-ink-primary)" }}>{user.email}</p>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <FieldLabel>Department</FieldLabel>
          <CustomDropdown
            label=""
            value={department}
            onChange={setDepartment}
            options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
          />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <FieldLabel>Role</FieldLabel>
          <CustomDropdown
            label=""
            value={role}
            onChange={setRole}
            options={ROLES}
          />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <FieldLabel>Position / Job Title</FieldLabel>
          <input
            type="text"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="e.g. Import Supervisor"
            style={{
              width: "100%",
              height: "40px",
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: "8px",
              padding: "0 12px",
              fontSize: "13px",
              color: "var(--neuron-ink-primary)",
              backgroundColor: "var(--neuron-bg-elevated)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {department === "Operations" && (
          <>
            <div style={{ marginBottom: "20px" }}>
              <FieldLabel>Team</FieldLabel>
              <CustomDropdown
                label=""
                value={teamId}
                onChange={setTeamId}
                options={[
                  { value: "", label: "No team" },
                  ...teams.map((t) => ({ value: t.id, label: t.name })),
                ]}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <FieldLabel>Service Type</FieldLabel>
              <CustomDropdown
                label=""
                value={serviceType}
                onChange={setServiceType}
                options={[
                  { value: "", label: "No service type" },
                  { value: "Forwarding", label: "Forwarding" },
                  { value: "Brokerage", label: "Brokerage" },
                  { value: "Trucking", label: "Trucking" },
                  { value: "Marine Insurance", label: "Marine Insurance" },
                  { value: "Others", label: "Others" },
                ]}
              />
            </div>
          </>
        )}

        {/* EV Approval Authority — visible for team_leader role only */}
        {role === "team_leader" && (
          <div style={{ marginBottom: "20px", padding: "16px", borderRadius: "10px", border: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--neuron-bg-subtle)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--neuron-ink-primary)", marginBottom: "2px" }}>
                  Independent EV Approval Authority
                </p>
                <p style={{ fontSize: "12px", color: "var(--neuron-ink-muted)" }}>
                  When enabled, this team leader's approvals close the voucher without CEO escalation.
                </p>
              </div>
              <button
                onClick={() => setEvApprovalAuthority(!evApprovalAuthority)}
                style={{
                  width: "44px",
                  height: "24px",
                  borderRadius: "12px",
                  border: "none",
                  backgroundColor: evApprovalAuthority ? "var(--neuron-action-primary)" : "var(--neuron-ui-border)",
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
                    backgroundColor: "#FFFFFF",
                    transition: "left 0.2s",
                  }}
                />
              </button>
            </div>
          </div>
        )}

        <div style={{ marginBottom: "24px" }}>
          <FieldLabel>Status</FieldLabel>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setIsActive(true)}
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
              onClick={() => setIsActive(false)}
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

        {/* Deactivate section */}
        <div style={{ borderTop: "1px solid var(--neuron-ui-border)", paddingTop: "24px", marginTop: "8px" }}>
          {!showDeactivateConfirm ? (
            <button
              onClick={() => setShowDeactivateConfirm(true)}
              style={{ background: "none", border: "none", color: "var(--neuron-semantic-danger)", fontSize: "13px", cursor: "pointer", fontWeight: 500, padding: 0 }}
            >
              Deactivate Account
            </button>
          ) : (
            <div>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--neuron-ink-primary)", marginBottom: "6px" }}>
                Deactivate {user.name}?
              </p>
              <p style={{ fontSize: "13px", color: "var(--neuron-ink-muted)", marginBottom: "16px" }}>
                This will prevent them from logging in. Their data will not be deleted.
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setShowDeactivateConfirm(false)}
                  style={{
                    height: "36px", padding: "0 16px", borderRadius: "8px",
                    background: "var(--neuron-bg-elevated)", border: "1px solid var(--neuron-ui-border)",
                    color: "var(--neuron-ink-muted)", fontSize: "13px", cursor: "pointer", fontWeight: 500,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeactivate}
                  disabled={deactivating}
                  style={{
                    height: "36px", padding: "0 16px", borderRadius: "8px",
                    background: "var(--neuron-semantic-danger)", border: "none",
                    color: "var(--neuron-action-primary-text)", fontSize: "13px", cursor: deactivating ? "not-allowed" : "pointer",
                    fontWeight: 600, display: "flex", alignItems: "center", gap: "6px",
                    opacity: deactivating ? 0.8 : 1,
                  }}
                >
                  {deactivating && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
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
