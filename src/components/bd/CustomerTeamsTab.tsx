import { useState } from "react";
import { Users, Plus, Edit2, Trash2, ChevronDown, ChevronRight, AlertTriangle, X, Check } from "lucide-react";
import { useCustomerTeamProfiles } from "../../hooks/useTeamProfiles";
import { useUser } from "../../hooks/useUser";
import { DepartmentTeamEditor } from "./DepartmentTeamEditor";
import { OperationsTeamProfileEditor } from "./OperationsTeamProfileEditor";
import { toast } from "../ui/toast-utils";
import type {
  CustomerTeamProfile,
  TeamProfileAssignment,
  UpsertCustomerTeamProfileInput,
} from "../../types/bd";

const DEPARTMENTS = [
  "Operations",
  "Pricing",
  "Business Development",
  "Accounting",
  "HR",
];

const SERVICE_TYPES = ["Forwarding", "Brokerage", "Trucking", "Marine Insurance", "Others"];

interface CustomerTeamsTabProps {
  customerId: string;
  canEdit: boolean;
}

interface EditingState {
  profileId?: string;  // undefined = new
  department: string;
  serviceType?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  assignments: TeamProfileAssignment[];
}

function ProfileRow({
  profile,
  canEdit,
  onEdit,
  onDelete,
}: {
  profile: CustomerTeamProfile;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ border: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold" style={{ color: "var(--neuron-ink-primary)" }}>
            {profile.department}
            {profile.service_type && (
              <span className="ml-1 font-normal" style={{ color: "var(--theme-text-muted)" }}>
                · {profile.service_type}
              </span>
            )}
            {profile.team_name && profile.service_type && (
              <span className="ml-1 font-normal" style={{ color: "var(--theme-text-muted)" }}>
                ({profile.team_name})
              </span>
            )}
          </span>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1">
            <button
              onClick={onEdit}
              className="p-1.5 rounded hover:bg-gray-100 transition-colors"
              style={{ color: "var(--theme-text-muted)" }}
              title="Edit"
            >
              <Edit2 size={13} />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded hover:bg-red-50 transition-colors"
              style={{ color: "var(--theme-text-muted)" }}
              title="Delete"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {profile.assignments.length === 0 ? (
        <p className="text-[12px]" style={{ color: "var(--theme-text-muted)" }}>No assignments saved.</p>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
          {profile.assignments.map((a) => (
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

function AddProfileForm({
  customerId,
  existingProfiles,
  onSave,
  onCancel,
  userId,
}: {
  customerId: string;
  existingProfiles: CustomerTeamProfile[];
  onSave: (input: UpsertCustomerTeamProfileInput) => Promise<void>;
  onCancel: () => void;
  userId: string;
}) {
  const [selectedDept, setSelectedDept] = useState("Operations");
  const [selectedServiceType, setSelectedServiceType] = useState<string | null>("Forwarding");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<TeamProfileAssignment[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (assignments.length === 0) {
      toast.error("Add at least one person before saving");
      return;
    }
    setIsSaving(true);
    try {
      await onSave({
        customer_id: customerId,
        department: selectedDept,
        service_type: selectedDept === "Operations" ? selectedServiceType : null,
        team_id: teamId,
        team_name: teamName,
        assignments,
        updated_by: userId,
      });
      toast.success("Team profile saved");
      onCancel();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save team profile");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="rounded-lg p-4 space-y-4"
      style={{ border: "1px solid var(--theme-action-primary-bg)", backgroundColor: "var(--theme-bg-surface)" }}
    >
      <p className="text-[13px] font-semibold" style={{ color: "var(--neuron-ink-primary)" }}>
        Add Team Profile
      </p>

      {/* Department */}
      <div>
        <label className="block text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: "var(--neuron-ink-muted)" }}>
          Department
        </label>
        <select
          value={selectedDept}
          onChange={(e) => {
            setSelectedDept(e.target.value);
            setAssignments([]);
            setTeamId(null);
            setTeamName(null);
            if (e.target.value === "Operations") setSelectedServiceType("Forwarding");
            else setSelectedServiceType(null);
          }}
          className="w-full px-3 py-2 rounded-lg text-[13px] focus:outline-none"
          style={{
            border: "1px solid var(--neuron-ui-border)",
            backgroundColor: "var(--theme-bg-surface)",
            color: "var(--neuron-ink-primary)",
          }}
        >
          {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Service type (Operations only) */}
      {selectedDept === "Operations" && (
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wide mb-1.5" style={{ color: "var(--neuron-ink-muted)" }}>
            Service Type
          </label>
          <select
            value={selectedServiceType ?? ""}
            onChange={(e) => {
              setSelectedServiceType(e.target.value || null);
              setAssignments([]);
              setTeamId(null);
              setTeamName(null);
            }}
            className="w-full px-3 py-2 rounded-lg text-[13px] focus:outline-none"
            style={{
              border: "1px solid var(--neuron-ui-border)",
              backgroundColor: "var(--theme-bg-surface)",
              color: "var(--neuron-ink-primary)",
            }}
          >
            {SERVICE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      {/* Assignments */}
      {selectedDept === "Operations" ? (
        <OperationsTeamProfileEditor
          serviceType={selectedServiceType}
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
          department={selectedDept}
          assignments={assignments}
          onChange={setAssignments}
        />
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-opacity"
          style={{ backgroundColor: "var(--theme-action-primary-bg)", opacity: isSaving ? 0.6 : 1 }}
        >
          {isSaving ? "Saving..." : "Save Profile"}
        </button>
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
          style={{ color: "var(--theme-text-muted)", border: "1px solid var(--neuron-ui-border)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function EditProfileForm({
  profile,
  onSave,
  onCancel,
  userId,
}: {
  profile: CustomerTeamProfile;
  onSave: (input: UpsertCustomerTeamProfileInput) => Promise<void>;
  onCancel: () => void;
  userId: string;
}) {
  const [teamId, setTeamId] = useState<string | null>(profile.team_id ?? null);
  const [teamName, setTeamName] = useState<string | null>(profile.team_name ?? null);
  const [assignments, setAssignments] = useState<TeamProfileAssignment[]>(profile.assignments);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        customer_id: profile.customer_id,
        department: profile.department,
        service_type: profile.service_type,
        team_id: teamId,
        team_name: teamName,
        assignments,
        updated_by: userId,
      });
      toast.success("Team profile updated");
      onCancel();
    } catch (err) {
      console.error(err);
      toast.error("Failed to update team profile");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="rounded-lg p-4 space-y-4"
      style={{ border: "1px solid var(--theme-action-primary-bg)", backgroundColor: "var(--theme-bg-surface)" }}
    >
      <p className="text-[13px] font-semibold" style={{ color: "var(--neuron-ink-primary)" }}>
        Edit: {profile.department}{profile.service_type ? ` · ${profile.service_type}` : ""}
      </p>

      {profile.department === "Operations" ? (
        <OperationsTeamProfileEditor
          serviceType={profile.service_type}
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
          department={profile.department}
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
          {isSaving ? "Saving..." : "Save Changes"}
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

export function CustomerTeamsTab({ customerId, canEdit }: CustomerTeamsTabProps) {
  const { user } = useUser();
  const { profiles, isLoading, upsertProfile, deleteProfile } = useCustomerTeamProfiles(customerId);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (profileId: string) => {
    setDeletingId(profileId);
    try {
      await deleteProfile(profileId);
      toast.success("Team profile removed");
    } catch {
      toast.error("Failed to remove team profile");
    } finally {
      setDeletingId(null);
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--neuron-ink-primary)" }}>
            Saved Team Profiles
          </h3>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--theme-text-muted)" }}>
            Saved team members auto-fill booking, quotation, and project forms for this customer.
          </p>
        </div>
        {canEdit && !isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-white transition-opacity"
            style={{ backgroundColor: "var(--theme-action-primary-bg)" }}
          >
            <Plus size={14} />
            Add Profile
          </button>
        )}
      </div>

      {/* Add form */}
      {isAdding && (
        <AddProfileForm
          customerId={customerId}
          existingProfiles={profiles}
          onSave={upsertProfile}
          onCancel={() => setIsAdding(false)}
          userId={user?.id ?? ""}
        />
      )}

      {/* Profile list */}
      {profiles.length === 0 && !isAdding ? (
        <div
          className="flex flex-col items-center justify-center py-12 rounded-lg text-center"
          style={{ border: "1px dashed var(--neuron-ui-border)" }}
        >
          <Users size={32} color="var(--theme-text-muted)" className="mb-3" />
          <p className="text-[13px] font-medium" style={{ color: "var(--neuron-ink-primary)" }}>
            No saved team profiles yet
          </p>
          <p className="text-[12px] mt-1" style={{ color: "var(--theme-text-muted)" }}>
            {canEdit
              ? "Add a profile to pre-assign team members for this customer's work."
              : "Team profiles will appear here once added."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map((profile) =>
            editingId === profile.id ? (
              <EditProfileForm
                key={profile.id}
                profile={profile}
                onSave={upsertProfile}
                onCancel={() => setEditingId(null)}
                userId={user?.id ?? ""}
              />
            ) : (
              <ProfileRow
                key={profile.id}
                profile={profile}
                canEdit={canEdit && deletingId !== profile.id}
                onEdit={() => setEditingId(profile.id)}
                onDelete={() => handleDelete(profile.id)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
