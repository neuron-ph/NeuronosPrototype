import { Check, ChevronDown, X } from "lucide-react";
import { normalizeRoleKey } from "../../utils/assignments/normalizeRoleKey";
import type { TeamMemberRoleInput } from "../../utils/teamMemberships";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

export interface TeamPoolAssignableUser {
  id: string;
  name: string;
}

export interface TeamPoolExistingMember {
  id: string;
  team_role?: string | null;
  team_roles?: Array<{ roleKey: string; roleLabel: string }>;
}

export type TeamMemberRoleSelections = Record<string, string[]>;

export function buildRoleInputsFromLabels(
  roleLabels: string[],
  roleOptions: TeamMemberRoleInput[],
): TeamMemberRoleInput[] {
  return roleLabels
    .filter(Boolean)
    .map((roleLabel) =>
      roleOptions.find((role) => role.roleLabel === roleLabel) ?? {
        roleKey: normalizeRoleKey(roleLabel),
        roleLabel,
      },
    );
}

export function mergeRoleOptions(
  roleOptions: TeamMemberRoleInput[],
  memberRoles: TeamMemberRoleSelections,
): TeamMemberRoleInput[] {
  const merged = new Map(roleOptions.map((role) => [role.roleLabel, role]));
  for (const roleLabel of Object.values(memberRoles).flat()) {
    if (!merged.has(roleLabel)) {
      merged.set(roleLabel, {
        roleKey: normalizeRoleKey(roleLabel),
        roleLabel,
      });
    }
  }
  return Array.from(merged.values());
}

export function buildInitialMemberRoleSelections(
  members: TeamPoolExistingMember[],
): TeamMemberRoleSelections {
  const initial: TeamMemberRoleSelections = {};
  for (const member of members) {
    initial[member.id] =
      member.team_roles?.map((role) => role.roleLabel) ??
      (member.team_role ? [member.team_role] : []);
  }
  return initial;
}

export function TeamAssignmentRoleChips({
  roles,
  fallbackLabel,
}: {
  roles?: Array<{ roleKey: string; roleLabel: string }>;
  fallbackLabel?: string | null;
}) {
  const labels = roles?.map((role) => role.roleLabel) ?? [];
  const visibleLabels = labels.length > 0 ? labels : fallbackLabel ? [fallbackLabel] : [];

  if (visibleLabels.length === 0) {
    return (
      <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>
        No assignment roles
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {visibleLabels.map((label) => (
        <span
          key={label}
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: 24,
            padding: "0 9px",
            borderRadius: 999,
            border: "1px solid rgba(148, 163, 184, 0.14)",
            background: "rgba(148, 163, 184, 0.08)",
            color: "var(--neuron-ink-secondary)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function RolePicker({
  selectedRoles,
  roleOptions,
  onRoleToggle,
}: {
  selectedRoles: string[];
  roleOptions: TeamMemberRoleInput[];
  onRoleToggle: (roleLabel: string, checked: boolean) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            height: 28,
            padding: "0 10px",
            borderRadius: 8,
            border: "1px solid rgba(148, 163, 184, 0.16)",
            background: "rgba(255,255,255,0.02)",
            color: "var(--neuron-ink-secondary)",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Assign roles
          <ChevronDown size={12} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        style={{
          width: 280,
          padding: 8,
          borderRadius: 12,
          border: "1px solid var(--neuron-ui-border)",
          background: "var(--theme-bg-surface)",
        }}
      >
        <div
          style={{
            padding: "6px 8px 8px",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--neuron-ink-muted)",
          }}
        >
          Assignment Roles
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {roleOptions.map((role) => {
            const checked = selectedRoles.includes(role.roleLabel);
            return (
              <button
                key={role.roleKey}
                type="button"
                onClick={() => onRoleToggle(role.roleLabel, !checked)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  width: "100%",
                  minHeight: 34,
                  padding: "0 10px",
                  borderRadius: 8,
                  border: "1px solid transparent",
                  background: checked ? "rgba(15, 118, 110, 0.10)" : "transparent",
                  color: "var(--neuron-ink-primary)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 500 }}>{role.roleLabel}</span>
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    border: checked
                      ? "1px solid rgba(15, 118, 110, 0.28)"
                      : "1px solid rgba(148, 163, 184, 0.22)",
                    background: checked ? "rgba(15, 118, 110, 0.16)" : "transparent",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    color: "var(--theme-action-primary-bg)",
                  }}
                >
                  {checked ? <Check size={10} /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TeamMemberRosterEditor({
  users,
  roleOptions,
  assignedIds,
  memberRoles,
  availableToAdd,
  onAddMember,
  onRemoveMember,
  onRoleToggle,
}: {
  users: TeamPoolAssignableUser[];
  roleOptions: TeamMemberRoleInput[];
  assignedIds: string[];
  memberRoles: TeamMemberRoleSelections;
  availableToAdd: TeamPoolAssignableUser[];
  onAddMember: (userId: string) => void;
  onRemoveMember: (userId: string) => void;
  onRoleToggle: (userId: string, roleLabel: string, checked: boolean) => void;
}) {
  const canAssignRoles = roleOptions.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Label
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--neuron-ink-muted)",
        }}
      >
        Members
      </Label>
      {!canAssignRoles && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--theme-text-muted)" }}>
          Add assignment roles for this department or service before assigning members.
        </p>
      )}
      <div
        style={{
          border: "1px solid var(--neuron-ui-border)",
          borderRadius: 12,
          overflow: "hidden",
          background: "rgba(255,255,255,0.015)",
        }}
      >
        {assignedIds.length === 0 && (
          <p
            style={{
              padding: "16px 18px",
              fontSize: 12,
              color: "var(--neuron-ink-muted)",
              margin: 0,
            }}
          >
            No members added yet.
          </p>
        )}
        {assignedIds.map((userId, index) => {
          const user = users.find((entry) => entry.id === userId);
          if (!user) return null;

          const selectedRoles = memberRoles[userId] ?? [];

          return (
            <div
              key={userId}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(220px, auto) auto",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderTop: index > 0 ? "1px solid var(--neuron-ui-border)" : undefined,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  minWidth: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--neuron-ink-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user.name}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 10,
                  minWidth: 0,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <TeamAssignmentRoleChips
                    roles={buildRoleInputsFromLabels(selectedRoles, roleOptions)}
                  />
                </div>
                <RolePicker
                  selectedRoles={selectedRoles}
                  roleOptions={roleOptions}
                  onRoleToggle={(roleLabel, checked) => onRoleToggle(userId, roleLabel, checked)}
                />
              </div>
              <button
                type="button"
                onClick={() => onRemoveMember(userId)}
                aria-label={`Remove ${user.name} from team`}
                style={{
                  width: 28,
                  height: 28,
                  padding: 0,
                  background: "transparent",
                  border: "1px solid transparent",
                  cursor: "pointer",
                  color: "var(--neuron-ink-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 4,
                  flexShrink: 0,
                }}
              >
                <X size={13} />
              </button>
            </div>
          );
        })}

        {availableToAdd.length > 0 && (
          <div
            style={{
              padding: "12px 16px",
              borderTop: assignedIds.length > 0 ? "1px solid var(--neuron-ui-border)" : undefined,
              background: "rgba(255,255,255,0.012)",
            }}
          >
            <Select value="" onValueChange={onAddMember} disabled={!canAssignRoles}>
              <SelectTrigger
                style={{
                  height: 34,
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--neuron-ink-secondary)",
                  border: "1px solid rgba(148, 163, 184, 0.16)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <SelectValue placeholder={canAssignRoles ? "Add team member" : "Add roles first"} />
              </SelectTrigger>
              <SelectContent>
                {availableToAdd.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}

export function TeamPoolEditor({
  contextLabel,
  contextValue,
  teamName,
  onTeamNameChange,
  teamNamePlaceholder,
  users,
  roleOptions,
  memberRoles,
  onAddMember,
  onRemoveMember,
  onRoleToggle,
  onCancel,
  onSubmit,
  submitLabel,
  submitPendingLabel,
  saving,
}: {
  contextLabel?: string;
  contextValue?: string;
  teamName: string;
  onTeamNameChange: (value: string) => void;
  teamNamePlaceholder?: string;
  users: TeamPoolAssignableUser[];
  roleOptions: TeamMemberRoleInput[];
  memberRoles: TeamMemberRoleSelections;
  onAddMember: (userId: string) => void;
  onRemoveMember: (userId: string) => void;
  onRoleToggle: (userId: string, roleLabel: string, checked: boolean) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitPendingLabel: string;
  saving: boolean;
}) {
  const assignedIds = Object.keys(memberRoles).filter((id) => (memberRoles[id] ?? []).length > 0);
  const availableToAdd = users.filter((user) => !assignedIds.includes(user.id));

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 12,
        border: "1px solid rgba(148, 163, 184, 0.12)",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {contextLabel && contextValue && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(148, 163, 184, 0.12)",
            background: "rgba(255,255,255,0.015)",
          }}
        >
          <Label
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--neuron-ink-muted)",
            }}
          >
            {contextLabel}
          </Label>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--neuron-ink-primary)",
            }}
          >
            {contextValue}
          </span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Label
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--neuron-ink-muted)",
          }}
        >
          Team Name
        </Label>
        <Input
          value={teamName}
          onChange={(event) => onTeamNameChange(event.target.value)}
          placeholder={teamNamePlaceholder}
          autoFocus
          style={{
            height: 38,
            fontSize: 13,
            borderRadius: 10,
            border: "1px solid rgba(148, 163, 184, 0.16)",
            background: "rgba(255,255,255,0.02)",
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSubmit();
          }}
        />
      </div>

      <TeamMemberRosterEditor
        users={users}
        roleOptions={roleOptions}
        assignedIds={assignedIds}
        memberRoles={memberRoles}
        availableToAdd={availableToAdd}
        onAddMember={onAddMember}
        onRemoveMember={onRemoveMember}
        onRoleToggle={onRoleToggle}
      />

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 2 }}>
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={saving}
          style={{
            height: 32,
            borderColor: "rgba(148, 163, 184, 0.16)",
            background: "transparent",
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          disabled={saving}
          style={{
            height: 32,
            background: "rgba(255,255,255,0.08)",
            color: "var(--neuron-ink-primary)",
            border: "1px solid rgba(148, 163, 184, 0.16)",
          }}
        >
          {saving ? submitPendingLabel : submitLabel}
        </Button>
      </div>
    </div>
  );
}
