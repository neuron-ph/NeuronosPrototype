/**
 * Shared constants, types, and micro-components for user form panels (Create + Edit).
 * Single source of truth for departments, roles, team roles, and service types.
 */

import type { TeamRole } from "../../hooks/useUser";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { TeamRole };

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
  team_role?: TeamRole | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEPARTMENTS = [
  "Business Development",
  "Pricing",
  "Operations",
  "Accounting",
  "HR",
  "Executive",
];

export const ROLES = [
  { value: "staff",       label: "Staff" },
  { value: "team_leader", label: "Team Leader" },
  { value: "supervisor",  label: "Supervisor" },
  { value: "manager",     label: "Manager" },
  { value: "executive",   label: "Executive" },
];

export const TEAM_ROLES: { value: TeamRole | ""; label: string }[] = [
  { value: "", label: "No team role" },
  { value: "Team Leader", label: "Team Leader" },
  { value: "Supervisor", label: "Supervisor" },
  { value: "Representative", label: "Representative" },
];

export const SERVICE_TYPE_OPTIONS = [
  { value: "", label: "Select service type" },
  { value: "Forwarding", label: "Forwarding" },
  { value: "Brokerage", label: "Brokerage" },
  { value: "Trucking", label: "Trucking" },
  { value: "Marine Insurance", label: "Marine Insurance" },
  { value: "Others", label: "Others" },
];

// ─── Field Components ─────────────────────────────────────────────────────────

interface FieldLabelProps {
  /** Wire to the matching input's id for proper a11y association on text inputs.
   *  Omit for CustomDropdown fields — use triggerAriaLabel on the dropdown instead. */
  htmlFor?: string;
  children: string;
  required?: boolean;
}

export function FieldLabel({ htmlFor, children, required }: FieldLabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[13px] font-medium text-[var(--neuron-ink-primary)] mb-[6px]"
    >
      {children}
      {required && (
        <span className="text-[var(--neuron-semantic-danger)]"> *</span>
      )}
    </label>
  );
}

export function FieldError({ message }: { message: string }) {
  return message ? (
    <p className="text-[12px] text-[var(--neuron-semantic-danger)] mt-1">
      {message}
    </p>
  ) : null;
}

/** Base Tailwind class for user form text inputs. */
export const INPUT_BASE =
  "w-full h-10 border border-[var(--neuron-ui-border)] rounded-lg px-3 text-[13px] text-[var(--neuron-ink-primary)] bg-[var(--neuron-bg-elevated)] outline-none focus-visible:border-[var(--theme-border-strong)] focus-visible:ring-[3px] focus-visible:ring-[rgba(95,196,161,0.18)]";

/** Tailwind class for user form text inputs in an error state. */
export const INPUT_ERROR =
  "w-full h-10 border border-[var(--neuron-semantic-danger)] rounded-lg px-3 text-[13px] text-[var(--neuron-ink-primary)] bg-[var(--neuron-bg-elevated)] outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(180,35,24,0.15)]";
