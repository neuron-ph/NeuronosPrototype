import { useState } from "react";
import { Users, Edit2, X, ArrowRight, AlertTriangle } from "lucide-react";
import { useContactTeamProfiles } from "../../hooks/useTeamProfiles";
import { useUser } from "../../hooks/useUser";
import { DepartmentTeamEditor } from "./DepartmentTeamEditor";
import { OperationsTeamProfileEditor } from "./OperationsTeamProfileEditor";
import { toast } from "../ui/toast-utils";
import type {
  ResolvedTeamProfile,
  TeamProfileAssignment,
  ContactTeamOverride,
  UpsertContactTeamOverrideInput,
} from "../../types/bd";

interface ContactTeamsTabProps {
  contactId: string;
  customerId: string;
  customerName: string;
  canEdit: boolean;
}

function ResolvedProfileCard({
  resolved,
  override,
  canEdit,
  onOverride,
  onClearOverride,
}: {
  resolved: ResolvedTeamProfile;
  override?: ContactTeamOverride;
  canEdit: boolean;
  onOverride: () => void;
  onClearOverride: () => void;
}) {
  const isOverridden = resolved.source === "contact_override";
  const label = resolved.service_type
    ? `${resolved.department} · ${resolved.service_type}`
    : resolved.department;

  return (
    <div
      className="rounded-lg p-4"
      style={{
        border: `1px solid ${isOverridden ? "var(--theme-action-primary-bg)" : "var(--neuron-ui-border)"}`,
        backgroundColor: "var(--theme-bg-surface)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold" style={{ color: "var(--neuron-ink-primary)" }}>
            {label}
          </span>
          <span
            className="text-[11px] px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: isOverridden ? "rgba(15,118,110,0.08)" : "var(--theme-bg-page)",
              color: isOverridden ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
              border: `1px solid ${isOverridden ? "var(--theme-action-primary-bg)" : "var(--neuron-ui-border)"}`,
            }}
          >
            {isOverridden ? "Overridden" : "Inherited"}
          </span>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1">
            <button
              onClick={onOverride}
              className="flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium transition-colors"
              style={{
                color: "var(--theme-action-primary-bg)",
                border: "1px solid var(--theme-action-primary-bg)",
              }}
            >
              <Edit2 size={11} />
              {isOverridden ? "Edit Override" : "Override"}
            </button>
            {isOverridden && override && (
              <button
                onClick={onClearOverride}
                className="flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium transition-colors"
                style={{ color: "var(--theme-text-muted)", border: "1px solid var(--neuron-ui-border)" }}
                title="Clear override — revert to customer default"
              >
                <X size={11} />
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {resolved.assignments.length === 0 ? (
        <p className="text-[12px]" style={{ color: "var(--theme-text-muted)" }}>No assignments.</p>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
          {resolved.assignments.map((a) => (
            <div key={a.role_key}>
              <p className="text-[11px] font-medium uppercase tracking-wide mb-0.5" style={{ color: "var(--neuron-ink-muted)" }}>
                {a.role_label}
              </p>
              <p className="text-[13px]" style={{ color: "var(--neuron-ink-primary)" }}>
                {a.user_name || <span style={{ color: "var(--theme-text-muted)" }}>—</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OverrideForm({
  contactId,
  customerId,
  resolved,
  existingOverride,
  onSave,
  onCancel,
  userId,
}: {
  contactId: string;
  customerId: string;
  resolved: ResolvedTeamProfile;
  existingOverride?: ContactTeamOverride;
  onSave: (input: UpsertContactTeamOverrideInput) => Promise<void>;
  onCancel: () => void;
  userId: string;
}) {
  const [teamId, setTeamId] = useState<string | null>(
    existingOverride?.team_id ?? resolved.team_id ?? null
  );
  const [teamName, setTeamName] = useState<string | null>(
    existingOverride?.team_name ?? resolved.team_name ?? null
  );
  const [assignments, setAssignments] = useState<TeamProfileAssignment[]>(
    existingOverride?.assignments ?? resolved.assignments
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (assignments.length === 0) {
      toast.error("Add at least one person");
      return;
    }
    setIsSaving(true);
    try {
      await onSave({
        contact_id: contactId,
        customer_id: customerId,
        department: resolved.department,
        service_type: resolved.service_type,
        team_id: teamId,
        team_name: teamName,
        assignments,
        updated_by: userId,
      });
      toast.success("Override saved");
      onCancel();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save override");
    } finally {
      setIsSaving(false);
    }
  };

  const label = resolved.service_type
    ? `${resolved.department} · ${resolved.service_type}`
    : resolved.department;

  return (
    <div
      className="rounded-lg p-4 space-y-4"
      style={{ border: "1px solid var(--theme-action-primary-bg)", backgroundColor: "var(--theme-bg-surface)" }}
    >
      <p className="text-[13px] font-semibold" style={{ color: "var(--neuron-ink-primary)" }}>
        Override: {label}
      </p>

      {resolved.department === "Operations" ? (
        <OperationsTeamProfileEditor
          serviceType={resolved.service_type}
          initialTeamId={teamId}
          initialAssignments={assignments}
          onTeamChange={(team) => {
            setTeamId(team?.id ?? null);
            setTeamName(team?.name ?? null);
          }}
          onAssignmentsChange={setAssignments}
        />
      ) : (
        <DepartmentTeamEditor
          department={resolved.department}
          assignments={assignments}
          onChange={setAssignments}
        />
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg text-[13px] font-medium text-white"
          style={{ backgroundColor: "var(--theme-action-primary-bg)", opacity: isSaving ? 0.6 : 1 }}
        >
          {isSaving ? "Saving..." : "Save Override"}
        </button>
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg text-[13px] font-medium"
          style={{ color: "var(--theme-text-muted)", border: "1px solid var(--neuron-ui-border)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ContactTeamsTab({
  contactId,
  customerId,
  customerName,
  canEdit,
}: ContactTeamsTabProps) {
  const { user } = useUser();
  const { resolvedProfiles, overrides, isLoading, upsertOverride, clearOverride } =
    useContactTeamProfiles({ contactId, customerId });
  const [overridingDeptKey, setOverridingDeptKey] = useState<string | null>(null);

  const getDeptKey = (r: ResolvedTeamProfile) =>
    `${r.department}::${r.service_type ?? ""}`;

  const handleClearOverride = async (deptKey: string) => {
    const resolved = resolvedProfiles.find((r) => getDeptKey(r) === deptKey);
    if (!resolved) return;
    const override = overrides.find(
      (o) =>
        o.department === resolved.department &&
        (o.service_type ?? null) === (resolved.service_type ?? null)
    );
    if (!override) return;
    try {
      await clearOverride(override.id);
      toast.success("Override cleared — inheriting from customer");
    } catch {
      toast.error("Failed to clear override");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8" style={{ color: "var(--theme-text-muted)" }}>
        <Users size={16} />
        <span className="text-[13px]">Loading team profiles...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-[14px] font-semibold" style={{ color: "var(--neuron-ink-primary)" }}>
          Team Profiles
        </h3>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--theme-text-muted)" }}>
          Profiles inherited from <span className="font-medium">{customerName}</span>. Override any
          department to set contact-specific assignments.
        </p>
      </div>

      {resolvedProfiles.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-12 rounded-lg text-center"
          style={{ border: "1px dashed var(--neuron-ui-border)" }}
        >
          <Users size={32} color="var(--theme-text-muted)" className="mb-3" />
          <p className="text-[13px] font-medium" style={{ color: "var(--neuron-ink-primary)" }}>
            No team profiles saved for {customerName}
          </p>
          <p className="text-[12px] mt-1" style={{ color: "var(--theme-text-muted)" }}>
            Add team profiles on the Customer page first.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {resolvedProfiles.map((resolved) => {
            const key = getDeptKey(resolved);
            const override = overrides.find(
              (o) =>
                o.department === resolved.department &&
                (o.service_type ?? null) === (resolved.service_type ?? null)
            );
            return overridingDeptKey === key ? (
              <OverrideForm
                key={key}
                contactId={contactId}
                customerId={customerId}
                resolved={resolved}
                existingOverride={override}
                onSave={upsertOverride}
                onCancel={() => setOverridingDeptKey(null)}
                userId={user?.id ?? ""}
              />
            ) : (
              <ResolvedProfileCard
                key={key}
                resolved={resolved}
                override={override}
                canEdit={canEdit}
                onOverride={() => setOverridingDeptKey(key)}
                onClearOverride={() => handleClearOverride(key)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
