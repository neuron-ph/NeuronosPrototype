import { useState, useEffect } from "react";
import { Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { logCreation } from "../../utils/activityLog";
import { SidePanel } from "../common/SidePanel";
import { CustomDropdown } from "../bd/CustomDropdown";
import {
  DEPARTMENTS,
  ROLES,
  TEAM_ROLES,
  SERVICE_TYPE_OPTIONS,
  FieldLabel,
  FieldError,
  INPUT_BASE,
  INPUT_ERROR,
} from "./userFormShared";

interface CreatedUser {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (user: CreatedUser) => void;
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
  const [teamRole, setTeamRole] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset Operations-specific fields when department changes away from Operations
  useEffect(() => {
    if (department !== "Operations") {
      setTeamId("");
      setServiceType("");
      setTeamRole("");
    }
  }, [department]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    if (!email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errs.email = "Enter a valid email address";
    if (!department) errs.department = "Department is required";
    if (!role) errs.role = "Role is required";
    if (!password) errs.password = "Password is required";
    else if (password.length < 8)
      errs.password = "Password must be at least 8 characters";
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
          team_id: null,
        },
      });

      if (error || !data?.success) {
        toast.error(data?.error ?? error?.message ?? "Failed to create account.");
        return;
      }

      // Edge Function sets name/dept/role. Apply remaining fields via follow-up update.
      if (data.user?.id && (position.trim() || serviceType || teamRole || status !== "active")) {
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

      const actor = {
        id: user?.id ?? "",
        name: user?.name ?? "",
        department: user?.department ?? "",
      };
      // Use || not ?? — trim() always returns a string, so ?? fallback is unreachable
      logCreation("user", data.user.id, name.trim() || data.user.email || data.user.id, actor);
      toast.success(`Account created for ${name.trim()}`);
      onCreated({ ...data.user, status } as CreatedUser & { status: string });
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
        {submitting && (
          <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
        )}
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
      <div className="p-6 overflow-y-auto h-full">

        {/* ── Identity ─────────────────────────────────────────────── */}
        <div className="mb-5">
          <FieldLabel htmlFor="new-user-name" required>Full name</FieldLabel>
          <input
            id="new-user-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={errors.name ? INPUT_ERROR : INPUT_BASE}
          />
          <FieldError message={errors.name ?? ""} />
        </div>

        <div className="mb-5">
          <FieldLabel htmlFor="new-user-email" required>Email address</FieldLabel>
          <input
            id="new-user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={errors.email ? INPUT_ERROR : INPUT_BASE}
          />
          <FieldError message={errors.email ?? ""} />
        </div>

        <div className="border-t border-[var(--neuron-ui-border)] my-6" />

        {/* ── Account Access ───────────────────────────────────────── */}
        <div className="mb-5">
          <FieldLabel required>Department</FieldLabel>
          <CustomDropdown
            label=""
            value={department}
            onChange={setDepartment}
            fullWidth
            triggerAriaLabel="Department"
            options={[
              { value: "", label: "Select department" },
              ...DEPARTMENTS.map((d) => ({ value: d, label: d })),
            ]}
          />
          <FieldError message={errors.department ?? ""} />
        </div>

        <div className="mb-5">
          <FieldLabel required>Access Level</FieldLabel>
          <p className="text-[12px] text-[var(--neuron-ink-muted)] mb-2">
            Controls what this user can see and do in Neuron
          </p>
          <CustomDropdown
            label=""
            value={role}
            onChange={setRole}
            fullWidth
            triggerAriaLabel="Access Level"
            options={[{ value: "", label: "Select access level" }, ...ROLES]}
          />
          <FieldError message={errors.role ?? ""} />
        </div>

        <div className="mb-5">
          <FieldLabel htmlFor="new-user-position">Position / Job Title</FieldLabel>
          <input
            id="new-user-position"
            type="text"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="e.g. Import Supervisor"
            className={INPUT_BASE}
          />
        </div>

        {/* Operations-only: service context lives here; team pool membership is managed from Teams. */}
        {department === "Operations" && (
          <div className="mb-5 rounded-xl border border-[var(--neuron-ui-border)] overflow-hidden">
            {/* Card header */}
            <div
              className="px-4 py-3 border-b border-[var(--neuron-ui-border)]"
              style={{ backgroundColor: "var(--neuron-bg-subtle)" }}
            >
              <p className="text-[13px] font-medium text-[var(--neuron-ink-primary)]">
                Operations Context
              </p>
              <p className="text-[12px] text-[var(--neuron-ink-muted)]">
                Service lane lives here. Team pool membership is managed from Users &gt; Teams &gt; Operations.
              </p>
            </div>

            {/* Card body */}
            <div
              className="p-4 flex flex-col gap-4"
              style={{ backgroundColor: "var(--neuron-bg-elevated)" }}
            >
              <p className="text-[12px] text-[var(--neuron-ink-muted)] m-0">
                Add the account first, then place them into a service team pool from the Teams tab.
              </p>

              <div>
                <FieldLabel>Team Title</FieldLabel>
                <p className="text-[12px] text-[var(--neuron-ink-muted)] mb-2">
                  Display label only — doesn't affect permissions
                </p>
                <CustomDropdown
                  label=""
                  value={teamRole}
                  onChange={setTeamRole}
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

        <div className="mb-5">
          <FieldLabel>Status</FieldLabel>
          <div role="group" aria-label="Account status" className="flex gap-2">
            {(["active", "inactive"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                aria-pressed={status === s}
                style={{
                  height: 36,
                  padding: "0 16px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  border:
                    status === s
                      ? "1px solid var(--neuron-action-primary)"
                      : "1px solid var(--neuron-ui-border)",
                  background:
                    status === s
                      ? "var(--theme-status-success-bg)"
                      : "var(--neuron-bg-elevated)",
                  color:
                    status === s
                      ? "var(--neuron-action-primary)"
                      : "var(--neuron-ink-muted)",
                }}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--neuron-ui-border)] my-6" />

        {/* ── Security ─────────────────────────────────────────────── */}
        <div className="mb-5">
          <FieldLabel htmlFor="new-user-password" required>Initial password</FieldLabel>
          <div className="relative">
            <input
              id="new-user-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${errors.password ? INPUT_ERROR : INPUT_BASE} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
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

        <div className="flex items-start gap-1.5">
          <AlertCircle
            size={14}
            style={{
              color: "var(--neuron-semantic-warn)",
              flexShrink: 0,
              marginTop: "2px",
            }}
          />
          <p className="text-[12px] text-[var(--neuron-semantic-warn)]">
            Share this password securely. The employee can update it from their
            Settings.
          </p>
        </div>

      </div>
    </SidePanel>
  );
}
