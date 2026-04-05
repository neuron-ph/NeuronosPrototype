import { useState, useEffect } from "react";
import { useTeams } from "../../hooks/useTeams";
import { Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { logCreation } from "../../utils/activityLog";
import { SidePanel } from "../common/SidePanel";
import { CustomDropdown } from "../bd/CustomDropdown";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const DEPARTMENTS = [
  "Business Development",
  "Pricing",
  "Operations",
  "Accounting",
  "HR",
  "Executive",
];

const ROLES = [
  { value: "staff", label: "Staff" },
  { value: "team_leader", label: "Team Leader" },
  { value: "manager", label: "Manager" },
];

const inputStyle: React.CSSProperties = {
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
};

function FieldLabel({ children, required }: { children: string; required?: boolean }) {
  return (
    <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--neuron-ink-primary)", marginBottom: "6px" }}>
      {children}{required && <span style={{ color: "var(--neuron-semantic-danger)" }}> *</span>}
    </label>
  );
}

function FieldError({ message }: { message: string }) {
  return message ? <p style={{ fontSize: "12px", color: "var(--neuron-semantic-danger)", marginTop: "4px" }}>{message}</p> : null;
}

export function CreateUserPanel({ isOpen, onClose, onCreated }: Props) {
  const { user } = useUser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("");
  const [position, setPosition] = useState("");
  const [teamId, setTeamId] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Teams list (all teams — filtered to Operations in the UI)
  const { teams: allTeams } = useTeams();
  const teams = department === "Operations" ? allTeams : [];

  // Reset Operations-specific fields when department changes away from Operations
  useEffect(() => {
    if (department !== "Operations") {
      setTeamId("");
      setServiceType("");
    }
  }, [department]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    if (!email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Enter a valid email address";
    if (!department) errs.department = "Department is required";
    if (!role) errs.role = "Role is required";
    if (!password) errs.password = "Password is required";
    else if (password.length < 8) errs.password = "Password must be at least 8 characters";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          department,
          role,
          team_id: teamId || null,
        },
      });

      if (error || !data?.success) {
        toast.error(data?.error ?? error?.message ?? "Failed to create account.");
        return;
      }

      // Edge Function sets name/dept/role/team_id. Apply remaining fields via follow-up update.
      if (data.user?.id && (position.trim() || serviceType || status !== "active")) {
        await supabase
          .from("users")
          .update({
            position: position.trim() || null,
            service_type: serviceType || null,
            status,
            is_active: status === "active",
          })
          .eq("id", data.user.id);
      }

      const actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
      logCreation("user", data.user.id, name.trim() ?? data.user.email ?? data.user.id, actor);
      toast.success(`Account created for ${name.trim()}`);
      onCreated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const footer = (
    <div
      style={{
        padding: "16px 24px",
        borderTop: "1px solid var(--neuron-ui-border)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
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
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          height: "40px",
          padding: "0 20px",
          borderRadius: "8px",
          background: "var(--neuron-action-primary)",
          border: "none",
          color: "var(--neuron-action-primary-text)",
          fontSize: "13px",
          fontWeight: 600,
          cursor: submitting ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          opacity: submitting ? 0.8 : 1,
        }}
      >
        {submitting && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
        {submitting ? "Creating\u2026" : "Create Account \u2192"}
      </button>
    </div>
  );

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title="New Account"
      footer={footer}
      width="480px"
    >
      <div style={{ padding: "24px", overflowY: "auto", height: "100%" }}>

        <div style={{ marginBottom: "20px" }}>
          <FieldLabel required>Full name</FieldLabel>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ ...inputStyle, ...(errors.name ? { border: "1px solid var(--neuron-semantic-danger)" } : {}) }}
          />
          <FieldError message={errors.name ?? ""} />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <FieldLabel required>Email address</FieldLabel>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ ...inputStyle, ...(errors.email ? { border: "1px solid var(--neuron-semantic-danger)" } : {}) }}
          />
          <FieldError message={errors.email ?? ""} />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <FieldLabel required>Department</FieldLabel>
          <CustomDropdown
            label=""
            value={department}
            onChange={setDepartment}
            options={[
              { value: "", label: "Select department" },
              ...DEPARTMENTS.map((d) => ({ value: d, label: d })),
            ]}
          />
          <FieldError message={errors.department ?? ""} />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <FieldLabel required>Role</FieldLabel>
          <CustomDropdown
            label=""
            value={role}
            onChange={setRole}
            options={[
              { value: "", label: "Select role" },
              ...ROLES,
            ]}
          />
          <FieldError message={errors.role ?? ""} />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <FieldLabel>Position / Job Title</FieldLabel>
          <input
            type="text"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="e.g. Import Supervisor"
            style={inputStyle}
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
                  { value: "", label: "Select service type" },
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

        <div style={{ marginBottom: "20px" }}>
          <FieldLabel>Status</FieldLabel>
          <div style={{ display: "flex", gap: 8 }}>
            {(["active", "inactive"] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                style={{
                  height: 36, padding: "0 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
                  border: status === s ? "1px solid var(--neuron-action-primary)" : "1px solid var(--neuron-ui-border)",
                  background: status === s ? "var(--theme-status-success-bg)" : "var(--neuron-bg-elevated)",
                  color: status === s ? "var(--neuron-action-primary)" : "var(--neuron-ink-muted)",
                }}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: "8px" }}>
          <FieldLabel required>Initial password</FieldLabel>
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                ...inputStyle,
                paddingRight: "44px",
                ...(errors.password ? { border: "1px solid var(--neuron-semantic-danger)" } : {}),
              }}
            />
            <button
              onClick={() => setShowPassword((v) => !v)}
              style={{
                position: "absolute",
                right: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--neuron-ink-muted)",
                display: "flex",
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <FieldError message={errors.password ?? ""} />
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "8px" }}>
          <AlertCircle size={14} style={{ color: "var(--neuron-semantic-warn)", flexShrink: 0, marginTop: "2px" }} />
          <p style={{ fontSize: "12px", color: "var(--neuron-semantic-warn)" }}>
            Share this password securely. The employee can update it from their Settings.
          </p>
        </div>

      </div>
    </SidePanel>
  );
}
