import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, EyeOff, AlertCircle, AlertTriangle, ShieldCheck, Info, Loader2 } from "lucide-react";
import { toast } from "sonner@2.0.3";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { useTeams } from "../../hooks/useTeams";
import { queryKeys } from "../../lib/queryKeys";
import { logCreation } from "../../utils/activityLog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  DEPARTMENTS, ROLES, TEAM_ROLES, SERVICE_TYPE_OPTIONS,
  FieldLabel, FieldError, INPUT_BASE, INPUT_ERROR,
} from "./userFormShared";
import { getEffectivePermission } from "./permissionsConfig";
import type { ModuleId, ActionId } from "./permissionsConfig";
import type { AccessProfileSummary } from "./accessProfiles/accessProfileTypes";

// Matches INPUT_BASE visually so Radix Select looks identical to CustomDropdown
const ST = "h-10 rounded-lg border-[var(--neuron-ui-border)] bg-[var(--neuron-bg-elevated)] px-3 text-[13px] text-[var(--neuron-ink-primary)] data-[placeholder]:text-[var(--neuron-ink-muted)] focus-visible:ring-0 focus-visible:border-[var(--theme-border-strong)] dark:bg-[var(--neuron-bg-elevated)]";
// Override --accent to teal so item hover/selection uses the Neuron action color
const SC = "[--accent:var(--theme-action-primary-bg)] [--accent-foreground:var(--neuron-action-primary-text)]";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPT_COLOR: Record<string, { bg: string; text: string }> = {
  "Business Development": { bg: "var(--neuron-dept-bd-bg)",         text: "var(--neuron-dept-bd-text)" },
  "Pricing":              { bg: "var(--neuron-dept-pricing-bg)",     text: "var(--neuron-dept-pricing-text)" },
  "Operations":           { bg: "var(--neuron-dept-ops-bg)",         text: "var(--neuron-dept-ops-text)" },
  "Accounting":           { bg: "var(--neuron-dept-accounting-bg)",  text: "var(--neuron-dept-accounting-text)" },
  "HR":                   { bg: "var(--neuron-dept-hr-bg)",          text: "var(--neuron-dept-hr-text)" },
  "Executive":            { bg: "var(--neuron-dept-executive-bg)",   text: "var(--neuron-dept-executive-text)" },
};

const ROLE_SUMMARY: Record<string, string> = {
  staff:       "Read-only access to department data",
  team_leader: "Can view, create, and edit records",
  supervisor:  "Can view, create, edit, and approve",
  manager:     "Full access — including delete and export",
  executive:   "Full access across all departments",
};

// Curated subset of key modules per department used in the live preview
const DEPT_PREVIEW: Partial<Record<string, Array<{ id: ModuleId; label: string }>>> = {
  "Business Development": [
    { id: "bd_contacts",        label: "Contacts" },
    { id: "bd_customers",       label: "Customers" },
    { id: "bd_inquiries",       label: "Inquiries" },
    { id: "bd_budget_requests", label: "Budget Requests" },
  ],
  "Pricing": [
    { id: "pricing_quotations",       label: "Quotations" },
    { id: "pricing_contracts",        label: "Contracts" },
    { id: "pricing_network_partners", label: "Vendor" },
  ],
  "Operations": [
    { id: "ops_forwarding",            label: "Forwarding" },
    { id: "ops_brokerage",             label: "Brokerage" },
    { id: "ops_bookings",              label: "Bookings" },
    { id: "ops_bookings_billings_tab", label: "Billing visibility" },
    { id: "ops_projects",              label: "Projects" },
  ],
  "Accounting": [
    { id: "acct_financials",  label: "Finance Overview" },
    { id: "acct_evouchers",   label: "E-Vouchers" },
    { id: "acct_journal",     label: "General Journal" },
    { id: "acct_statements",  label: "Financial Statements" },
  ],
  "HR": [
    { id: "hr", label: "HR Module" },
  ],
};

const CAP_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  full:    { label: "Full access",   bg: "var(--theme-status-success-bg)", color: "var(--theme-status-success-fg)" },
  approve: { label: "Can approve",   bg: "var(--neuron-semantic-info-bg)", color: "var(--neuron-semantic-info)" },
  edit:    { label: "Create & edit", bg: "var(--neuron-bg-subtle)",        color: "var(--neuron-ink-secondary)" },
  view:    { label: "View only",     bg: "var(--theme-bg-page)",           color: "var(--neuron-ink-muted)" },
  none:    { label: "No access",     bg: "var(--theme-status-danger-bg)",  color: "var(--theme-status-danger-fg)" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capLevel(
  role: string,
  dept: string,
  moduleId: ModuleId,
  overrides: Record<string, boolean>
): "full" | "approve" | "edit" | "view" | "none" {
  const eff = (action: ActionId) =>
    getEffectivePermission(role, dept, moduleId, action, overrides).granted;
  if (eff("delete") || eff("export")) return "full";
  if (eff("approve")) return "approve";
  if (eff("edit") || eff("create")) return "edit";
  if (eff("view")) return "view";
  return "none";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateUserPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: currentUser } = useUser();

  const [name, setName]           = useState("");
  const [email, setEmail]         = useState("");
  const [position, setPosition]   = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole]           = useState("");
  const [accessProfileId, setAccessProfileId] = useState("");
  const [teamId, setTeamId]       = useState("");
  const [teamRole, setTeamRole]   = useState("");
  const [serviceType, setServiceType] = useState("");
  const [password, setPassword]   = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors]       = useState<Record<string, string>>({});
  const [profiles, setProfiles]   = useState<AccessProfileSummary[]>([]);

  const { teams } = useTeams(department === "Operations");

  useEffect(() => {
    supabase
      .from("access_profiles")
      .select("id, name, description, target_department, target_role, module_grants, updated_at")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => { if (data) setProfiles(data as AccessProfileSummary[]); });
  }, []);

  useEffect(() => {
    if (department !== "Operations") {
      setTeamId("");
      setServiceType("");
      setTeamRole("");
    }
  }, [department]);

  // ─── Derived ──────────────────────────────────────────────────────────────

  const selectedProfile = profiles.find(p => p.id === accessProfileId) ?? null;
  const profileOverrides: Record<string, boolean> = selectedProfile?.module_grants ?? {};

  const moduleRows = useMemo(() => {
    if (!department || !role) return [];
    const modules = DEPT_PREVIEW[department] ?? [];
    return modules.map(m => ({
      ...m,
      level: capLevel(role, department, m.id, profileOverrides),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department, role, accessProfileId]);

  const profileMismatch = selectedProfile && (
    (selectedProfile.target_department && selectedProfile.target_department !== department) ||
    (selectedProfile.target_role && selectedProfile.target_role !== role)
  );

  const profileGrantCount = selectedProfile
    ? Object.values(selectedProfile.module_grants).filter(Boolean).length : 0;
  const profileRestrictCount = selectedProfile
    ? Object.values(selectedProfile.module_grants).filter(v => !v).length : 0;

  // Compatible profiles first, then alphabetical
  const sortedProfiles = useMemo(() => [...profiles].sort((a, b) => {
    const aOk = (!a.target_department || a.target_department === department) &&
                (!a.target_role || a.target_role === role) ? 0 : 1;
    const bOk = (!b.target_department || b.target_department === department) &&
                (!b.target_role || b.target_role === role) ? 0 : 1;
    return aOk - bOk || a.name.localeCompare(b.name);
  }), [profiles, department, role]);

  // ─── Validation & Submit ──────────────────────────────────────────────────

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
          team_id: null,
          position: position.trim() || null,
          service_type: serviceType || null,
          team_role: null,
          status: "active",
          is_active: true,
          access_profile_id: accessProfileId || null,
        },
      });

      if (error || !data?.success) {
        toast.error(data?.error ?? error?.message ?? "Failed to create account.");
        return;
      }

      const actor = {
        id: currentUser?.id ?? "",
        name: currentUser?.name ?? "",
        department: currentUser?.department ?? "",
      };
      logCreation("user", data.user.id, name.trim() || data.user.email || data.user.id, actor);
      toast.success(`Account created for ${name.trim()}`);

      queryClient.invalidateQueries({ queryKey: queryKeys.users.list() });
      queryClient.invalidateQueries({ queryKey: ["permission_overrides"] });
      queryClient.invalidateQueries({ queryKey: ["permission_overrides", "access-summary"] });

      navigate(`/admin/users/${data.user.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const initials = name.trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?";
  const deptColor = DEPT_COLOR[department];
  const isExecutive = role === "executive" || department === "Executive";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--neuron-bg-elevated)" }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        padding: "14px 32px",
        borderBottom: "1px solid var(--neuron-ui-border)",
        backgroundColor: "var(--neuron-bg-elevated)",
        display: "flex",
        alignItems: "center",
        gap: "16px",
      }}>
        <button
          type="button"
          onClick={() => navigate("/admin/users")}
          aria-label="Back to Users"
          style={{
            width: 36, height: 36,
            borderRadius: 8,
            border: "none",
            background: "none",
            cursor: "pointer",
            color: "var(--neuron-ink-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--neuron-bg-subtle)"; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
            <span style={{ fontSize: "12px", color: "var(--neuron-ink-muted)" }}>Users</span>
            <span style={{ fontSize: "12px", color: "var(--neuron-ink-muted)" }}>/</span>
            <span style={{ fontSize: "12px", color: "var(--neuron-ink-secondary)", fontWeight: 500 }}>New Account</span>
          </div>
          <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--neuron-ink-primary)", margin: 0, letterSpacing: "-0.005em" }}>
            Create New Account
          </h1>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => navigate("/admin/users")}
            style={{
              height: 36,
              padding: "0 16px",
              background: "none",
              border: "1px solid var(--neuron-ui-border)",
              borderRadius: 8,
              color: "var(--neuron-ink-muted)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.12s ease",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--neuron-state-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              height: 36,
              padding: "0 20px",
              borderRadius: 8,
              background: "var(--neuron-action-primary)",
              border: "none",
              color: "var(--neuron-action-primary-text)",
              fontSize: 13,
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              opacity: submitting ? 0.8 : 1,
            }}
            onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = "var(--neuron-action-primary-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--neuron-action-primary)"; }}
          >
            {submitting && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
            {submitting ? "Creating…" : "Create Account →"}
          </button>
        </div>
      </div>

      {/* ── Body — single scroll container so CustomDropdown stays in sync ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px" }}>

        {/* Left: Form */}
        <div style={{ borderRight: "1px solid var(--neuron-ui-border)", padding: "32px 40px" }}>

            {/* ── Identity ──────────────────────────────────────────── */}
            <SectionLabel>Identity</SectionLabel>

            <div style={{ marginBottom: 20 }}>
              <FieldLabel htmlFor="cu-name" required>Full name</FieldLabel>
              <input
                id="cu-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Maria Santos"
                className={errors.name ? INPUT_ERROR : INPUT_BASE}
              />
              <FieldError message={errors.name ?? ""} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <FieldLabel htmlFor="cu-email" required>Email address</FieldLabel>
              <input
                id="cu-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@company.com"
                className={errors.email ? INPUT_ERROR : INPUT_BASE}
              />
              <FieldError message={errors.email ?? ""} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <FieldLabel htmlFor="cu-position">Position / Job Title</FieldLabel>
              <input
                id="cu-position"
                type="text"
                value={position}
                onChange={e => setPosition(e.target.value)}
                placeholder="e.g. Import Supervisor"
                className={INPUT_BASE}
              />
            </div>

            <FormDivider />

            {/* ── Access & Permissions ──────────────────────────────── */}
            <SectionLabel>Access & Permissions</SectionLabel>

            <div style={{ marginBottom: 20 }}>
              <FieldLabel required>Department</FieldLabel>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger className={ST}><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent className={SC}>
                  {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldError message={errors.department ?? ""} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <FieldLabel required>Role</FieldLabel>
              <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", marginBottom: 6, marginTop: 0 }}>
                Controls what this user can see and do in Neuron
              </p>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className={ST}><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent className={SC}>
                  {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldError message={errors.role ?? ""} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <FieldLabel>Access Profile</FieldLabel>
              <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", marginBottom: 6, marginTop: 0 }}>
                Optional permission template applied on top of the base role
              </p>
              <Select
                value={accessProfileId || "__none__"}
                onValueChange={v => setAccessProfileId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger className={ST}><SelectValue /></SelectTrigger>
                <SelectContent className={SC}>
                  <SelectItem value="__none__">None — use role defaults</SelectItem>
                  {sortedProfiles.map(p => {
                    const isMatch =
                      (!p.target_department || p.target_department === department) &&
                      (!p.target_role || p.target_role === role);
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {isMatch ? p.name : `${p.name}  ⚠`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {profileMismatch && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 6 }}>
                  <AlertTriangle size={13} style={{ color: "var(--neuron-semantic-warn)", flexShrink: 0, marginTop: 2 }} />
                  <p style={{ fontSize: 12, color: "var(--neuron-semantic-warn)", margin: 0 }}>
                    This profile targets{" "}
                    <strong>{selectedProfile?.target_department ?? "any department"}</strong>
                    {" / "}
                    <strong>{selectedProfile?.target_role ?? "any role"}</strong>.
                    It will still be applied.
                  </p>
                </div>
              )}
            </div>

            {/* ── Department Context (Operations only) ──────────────── */}
            {department === "Operations" && (
              <>
                <FormDivider />
                <SectionLabel>Department Context</SectionLabel>

                <div style={{
                  borderRadius: 10,
                  border: "1px solid var(--neuron-ui-border)",
                  overflow: "hidden",
                  marginBottom: 20,
                }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--neuron-bg-subtle)" }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "var(--neuron-ink-primary)", margin: 0 }}>Team Assignment</p>
                    <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", margin: "2px 0 0" }}>Operations team, title, and service lane</p>
                  </div>
                  <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16, backgroundColor: "var(--neuron-bg-elevated)" }}>
                    <div>
                      <FieldLabel>Team</FieldLabel>
                      <Select value={teamId || "__none__"} onValueChange={v => setTeamId(v === "__none__" ? "" : v)}>
                        <SelectTrigger className={ST}><SelectValue /></SelectTrigger>
                        <SelectContent className={SC}>
                          <SelectItem value="__none__">No team</SelectItem>
                          {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <FieldLabel>Team Title</FieldLabel>
                      <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", marginBottom: 6, marginTop: 0 }}>
                        Display label only — doesn't affect permissions
                      </p>
                      <Select value={teamRole || "__none__"} onValueChange={v => setTeamRole(v === "__none__" ? "" : v)}>
                        <SelectTrigger className={ST}><SelectValue /></SelectTrigger>
                        <SelectContent className={SC}>
                          {TEAM_ROLES.map(r => (
                            <SelectItem key={r.value || "__none__"} value={r.value || "__none__"}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <FieldLabel>Service Type</FieldLabel>
                      <Select value={serviceType || "__none__"} onValueChange={v => setServiceType(v === "__none__" ? "" : v)}>
                        <SelectTrigger className={ST}><SelectValue /></SelectTrigger>
                        <SelectContent className={SC}>
                          {SERVICE_TYPE_OPTIONS.map(o => (
                            <SelectItem key={o.value || "__none__"} value={o.value || "__none__"}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </>
            )}

            <FormDivider />

            {/* ── Security ──────────────────────────────────────────── */}
            <SectionLabel>Security</SectionLabel>

            <div style={{ marginBottom: 20 }}>
              <FieldLabel htmlFor="cu-password" required>Initial password</FieldLabel>
              <div style={{ position: "relative" }}>
                <input
                  id="cu-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  className={`${errors.password ? INPUT_ERROR : INPUT_BASE} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: 12,
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

            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <AlertCircle size={14} style={{ color: "var(--neuron-semantic-warn)", flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: 12, color: "var(--neuron-semantic-warn)", margin: 0 }}>
                Share this password securely. The employee can update it from their Settings.
              </p>
            </div>

        </div>

        {/* ── Right: Live Preview ────────────────────────────────────────── */}
        <div style={{ position: "sticky", top: 0, alignSelf: "start", padding: "32px 24px", backgroundColor: "var(--neuron-bg-elevated)" }}>
          <p style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--neuron-ink-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            margin: "0 0 16px",
          }}>
            Preview
          </p>

          {/* User card */}
          <div style={{
            borderRadius: 12,
            border: "1px solid var(--neuron-ui-border)",
            backgroundColor: "var(--neuron-bg-elevated)",
            padding: 20,
            marginBottom: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
              <div
                aria-hidden="true"
                style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                backgroundColor: deptColor?.bg ?? "var(--neuron-action-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: deptColor?.text ?? "white",
                fontSize: 15,
                fontWeight: 700,
                flexShrink: 0,
                letterSpacing: "-0.02em",
              }}>
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: name.trim() ? "var(--neuron-ink-primary)" : "var(--neuron-ink-muted)",
                  margin: "0 0 2px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {name.trim() || "Full name"}
                </p>
                <p style={{
                  fontSize: 12,
                  color: "var(--neuron-ink-muted)",
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {email.trim() || "email@example.com"}
                </p>
                {position.trim() && (
                  <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", margin: "2px 0 0" }}>
                    {position.trim()}
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {department && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 999,
                  backgroundColor: deptColor?.bg ?? "var(--neuron-bg-subtle)",
                  color: deptColor?.text ?? "var(--neuron-ink-muted)",
                }}>
                  {department}
                </span>
              )}
              {role && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 999,
                  backgroundColor: "var(--neuron-bg-subtle)",
                  color: "var(--neuron-ink-secondary)",
                }}>
                  {ROLES.find(r => r.value === role)?.label ?? role}
                </span>
              )}
              {selectedProfile && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 999,
                  backgroundColor: "var(--neuron-semantic-info-bg)",
                  color: "var(--neuron-semantic-info)",
                }}>
                  {selectedProfile.name}
                </span>
              )}
            </div>
          </div>

          {/* Access summary */}
          {role ? (
            <div style={{
              borderRadius: 12,
              border: "1px solid var(--neuron-ui-border)",
              backgroundColor: "var(--neuron-bg-elevated)",
              overflow: "hidden",
              marginBottom: selectedProfile ? 16 : 0,
            }}>
              <div style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--neuron-ui-border)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <ShieldCheck size={15} style={{ color: "var(--neuron-action-primary)" }} />
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--neuron-ink-primary)", margin: 0 }}>
                  Access Summary
                </p>
              </div>

              <div style={{ padding: "10px 16px", borderBottom: moduleRows.length > 0 ? "1px solid var(--neuron-ui-border)" : undefined }}>
                {isExecutive ? (
                  <p style={{ fontSize: 12, color: "var(--neuron-ink-secondary)", margin: 0 }}>
                    Full access across all departments and modules.
                  </p>
                ) : (
                  <>
                    <p style={{ fontSize: 11, color: "var(--neuron-ink-muted)", margin: "0 0 3px", fontWeight: 500 }}>
                      Base role capability
                    </p>
                    <p style={{ fontSize: 12, color: "var(--neuron-ink-secondary)", margin: 0 }}>
                      {ROLE_SUMMARY[role]}
                    </p>
                  </>
                )}
              </div>

              {moduleRows.length > 0 && (
                <div>
                  {moduleRows.map((m, i) => {
                    const badge = CAP_BADGE[m.level];
                    return (
                      <div
                        key={m.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 16px",
                          borderBottom: i < moduleRows.length - 1 ? "1px solid var(--neuron-ui-border)" : undefined,
                        }}
                      >
                        <span style={{ fontSize: 12, color: "var(--neuron-ink-secondary)" }}>{m.label}</span>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 999,
                          backgroundColor: badge.bg,
                          color: badge.color,
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                          marginLeft: 8,
                        }}>
                          {badge.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div style={{
              borderRadius: 12,
              border: "1px solid var(--neuron-ui-border)",
              padding: "24px 16px",
              textAlign: "center",
              backgroundColor: "var(--neuron-bg-elevated)",
            }}>
              <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", margin: 0 }}>
                Select a department and access level to preview what this user can do.
              </p>
            </div>
          )}

          {/* Profile override info */}
          {selectedProfile && (
            <div style={{
              borderRadius: 12,
              border: "1px solid var(--neuron-ui-border)",
              backgroundColor: "var(--neuron-bg-elevated)",
              padding: "14px 16px",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <Info size={14} style={{ color: "#0369A1", marginTop: 2, flexShrink: 0 }} />
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--neuron-ink-primary)", margin: 0 }}>
                  {selectedProfile.name}
                </p>
              </div>
              {selectedProfile.description && (
                <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", margin: "0 0 10px" }}>
                  {selectedProfile.description}
                </p>
              )}
              <div style={{ display: "flex", gap: 16 }}>
                {profileGrantCount > 0 && (
                  <span style={{ fontSize: 12, color: "var(--theme-status-success-fg)", fontWeight: 500 }}>
                    +{profileGrantCount} grant{profileGrantCount !== 1 ? "s" : ""}
                  </span>
                )}
                {profileRestrictCount > 0 && (
                  <span style={{ fontSize: 12, color: "var(--theme-status-danger-fg)", fontWeight: 500 }}>
                    -{profileRestrictCount} restriction{profileRestrictCount !== 1 ? "s" : ""}
                  </span>
                )}
                {profileGrantCount === 0 && profileRestrictCount === 0 && (
                  <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>No overrides defined</span>
                )}
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 11,
      fontWeight: 700,
      color: "var(--neuron-ink-muted)",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      margin: "0 0 16px",
    }}>
      {children}
    </p>
  );
}

function FormDivider() {
  return <div style={{ borderTop: "1px solid var(--neuron-ui-border)", margin: "28px 0" }} />;
}
