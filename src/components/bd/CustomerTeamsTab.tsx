import { useState, Fragment } from "react";
import { Users, Plus, Edit2, Trash2, Briefcase, Settings, Tag, BookOpen, Building2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCustomerTeamProfiles } from "../../hooks/useTeamProfiles";
import { useUser } from "../../hooks/useUser";
import { DepartmentTeamEditor } from "./DepartmentTeamEditor";
import { OperationsTeamProfileEditor } from "./OperationsTeamProfileEditor";
import { CustomDropdown } from "./CustomDropdown";
import { NeuronModal } from "../ui/NeuronModal";
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

const DEPT_OPTIONS = DEPARTMENTS.map((d) => ({ value: d, label: d }));
const SERVICE_TYPE_OPTIONS = SERVICE_TYPES.map((s) => ({ value: s, label: s }));

const FORM_SPRING = { type: "spring", stiffness: 420, damping: 42 } as const;

const DEPT_ICONS = {
  "Business Development": Briefcase,
  "Operations": Settings,
  "Pricing": Tag,
  "Accounting": BookOpen,
  "HR": Users,
} as const;

interface CustomerTeamsTabProps {
  customerId: string;
  canEdit: boolean;
}

function ProfileCard({
  profile,
  isFaded,
  isPendingDelete,
  onEdit,
  onDeleteRequest,
}: {
  profile: CustomerTeamProfile;
  isFaded: boolean;
  isPendingDelete: boolean;
  onEdit: () => void;
  onDeleteRequest: () => void;
}) {
  const assignedRoles = profile.assignments.filter((a) => a.user_name);
  const hasServiceInfo = profile.service_type || profile.team_name;

  return (
    <div
      className={`group flex rounded-lg overflow-hidden transition-opacity duration-200 ${isFaded || isPendingDelete ? "opacity-40" : "opacity-100"}`}
      style={{ border: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)" }}
    >
      {/* Service / Team metadata (Operations only) */}
      {hasServiceInfo && (
        <div
          className="w-52 shrink-0 px-5 py-3 flex flex-col justify-center gap-2.5"
          style={{ borderRight: "1px solid var(--neuron-ui-border)" }}
        >
          {profile.service_type && (
            <div className="flex items-baseline gap-3">
              <span
                className="text-[10px] font-medium uppercase tracking-wide shrink-0"
                style={{ color: "var(--neuron-ink-muted)", minWidth: "3.5rem" }}
              >
                Service
              </span>
              <span className="text-[12px]" style={{ color: "var(--neuron-ink-primary)" }}>
                {profile.service_type}
              </span>
            </div>
          )}
          {profile.team_name && (
            <div className="flex items-baseline gap-3">
              <span
                className="text-[10px] font-medium uppercase tracking-wide shrink-0"
                style={{ color: "var(--neuron-ink-muted)", minWidth: "3.5rem" }}
              >
                Team
              </span>
              <span className="text-[12px]" style={{ color: "var(--neuron-ink-primary)" }}>
                {profile.team_name}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Assignment columns — one column per person, divided */}
      <div className="flex-1 flex items-stretch min-w-0">
        {assignedRoles.length === 0 ? (
          <p className="px-4 text-[12px] self-center" style={{ color: "var(--theme-text-muted)" }}>
            No assignments saved.
          </p>
        ) : (
          assignedRoles.map((a, i) => (
            <Fragment key={a.role_key}>
              {i > 0 && (
                <div className="w-px self-stretch shrink-0" style={{ backgroundColor: "var(--neuron-ui-border)" }} />
              )}
              <div className="flex-1 px-5 py-3 min-w-[100px] overflow-hidden">
                <p
                  className="text-[10px] font-medium uppercase tracking-wide mb-1.5"
                  style={{ color: "var(--neuron-ink-muted)" }}
                >
                  {a.role_label}
                </p>
                <p className="text-[13px] truncate" style={{ color: "var(--neuron-ink-primary)" }}>
                  {a.user_name}
                </p>
              </div>
            </Fragment>
          ))
        )}
      </div>

      {/* Edit / delete — hover-revealed, also revealed on keyboard focus */}
      {!isPendingDelete && (
        <div className="flex items-center gap-0.5 px-2 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
          <button
            onClick={onEdit}
            className="p-1.5 rounded transition-colors duration-150"
            style={{ color: "var(--theme-text-muted)" }}
            title="Edit profile"
            aria-label="Edit team profile"
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--neuron-ui-border)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
          >
            <Edit2 size={13} />
          </button>
          <button
            onClick={onDeleteRequest}
            className="p-1.5 rounded transition-colors duration-150"
            style={{ color: "var(--theme-text-muted)" }}
            title="Remove profile"
            aria-label="Remove team profile"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#C94F3D";
              (e.currentTarget as HTMLElement).style.backgroundColor = "#FEF2F2";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--theme-text-muted)";
              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function AddProfileForm({
  customerId,
  onSave,
  onCancel,
  userId,
}: {
  customerId: string;
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

  const handleDeptChange = (dept: string) => {
    setSelectedDept(dept);
    setAssignments([]);
    setTeamId(null);
    setTeamName(null);
    setSelectedServiceType(dept === "Operations" ? "Forwarding" : null);
  };

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
      className="rounded-lg p-4 space-y-4 border"
      style={{
        borderColor: "var(--neuron-ui-border)",
        backgroundColor: "var(--theme-bg-surface)",
      }}
    >
      <p className="text-[13px] font-semibold" style={{ color: "var(--neuron-ink-primary)" }}>
        Add Team Profile
      </p>

      <div className={`grid gap-3 ${selectedDept === "Operations" ? "grid-cols-2" : "grid-cols-1"}`}>
        <CustomDropdown
          label="Department"
          value={selectedDept}
          options={DEPT_OPTIONS}
          onChange={handleDeptChange}
          fullWidth
        />
        {selectedDept === "Operations" && (
          <CustomDropdown
            label="Service Type"
            value={selectedServiceType ?? ""}
            options={SERVICE_TYPE_OPTIONS}
            onChange={(v) => {
              setSelectedServiceType(v || null);
              setAssignments([]);
              setTeamId(null);
              setTeamName(null);
            }}
            fullWidth
          />
        )}
      </div>

      <div style={{ borderTop: "1px solid var(--neuron-ui-border)", paddingTop: "16px" }}>
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
      </div>

      <div
        className="flex items-center justify-between pt-1"
        style={{ borderTop: "1px solid var(--neuron-ui-border)" }}
      >
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
          style={{ color: "var(--theme-text-muted)", border: "1px solid var(--neuron-ui-border)" }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-opacity"
          style={{ backgroundColor: "var(--theme-action-primary-bg)", opacity: isSaving ? 0.6 : 1 }}
        >
          {isSaving ? "Saving…" : "Save Profile"}
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
      className="rounded-lg p-4 space-y-4 border"
      style={{
        borderColor: "var(--neuron-ui-border)",
        backgroundColor: "var(--theme-bg-surface)",
      }}
    >
      <div>
        <p className="text-[13px] font-semibold" style={{ color: "var(--neuron-ink-primary)" }}>
          Edit Profile
        </p>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--theme-text-muted)" }}>
          <span style={{ color: "var(--theme-action-primary-bg)" }}>{profile.department}</span>
          {profile.service_type && ` · ${profile.service_type}`}
        </p>
      </div>

      <div style={{ borderTop: "1px solid var(--neuron-ui-border)", paddingTop: "16px" }}>
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
      </div>

      <div
        className="flex items-center justify-between pt-1"
        style={{ borderTop: "1px solid var(--neuron-ui-border)" }}
      >
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
          style={{ color: "var(--theme-text-muted)", border: "1px solid var(--neuron-ui-border)" }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg text-[13px] font-medium text-white"
          style={{ backgroundColor: "var(--theme-action-primary-bg)", opacity: isSaving ? 0.6 : 1 }}
        >
          {isSaving ? "Saving…" : "Save Changes"}
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const profileToDelete = profiles.find((p) => p.id === confirmDeleteId);

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setDeletingId(id);
    setConfirmDeleteId(null);
    try {
      await deleteProfile(id);
      toast.success("Team profile removed");
    } catch {
      toast.error("Failed to remove team profile");
    } finally {
      setDeletingId(null);
    }
  };

  // Sort and group by department
  const grouped = profiles
    .slice()
    .sort((a, b) => {
      const dc = a.department.localeCompare(b.department);
      return dc !== 0 ? dc : (a.service_type ?? "").localeCompare(b.service_type ?? "");
    })
    .reduce<Record<string, CustomerTeamProfile[]>>((acc, p) => {
      (acc[p.department] ??= []).push(p);
      return acc;
    }, {});

  const deptNames = Object.keys(grouped);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8" style={{ color: "var(--theme-text-muted)" }}>
        <Users size={16} />
        <span className="text-[13px]">Loading team profiles…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--neuron-ink-primary)" }}>
            Department Profiles (Legacy)
          </h3>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--theme-text-muted)" }}>
            Department-level team profiles used by Pricing, BD, Accounting, and HR. Operations defaults now live in Assignment Defaults above.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setIsAdding(true); setEditingId(null); }}
            disabled={isAdding}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-white transition-opacity"
            style={{ backgroundColor: "var(--theme-action-primary-bg)", opacity: isAdding ? 0.4 : 1 }}
          >
            <Plus size={14} />
            Add Profile
          </button>
        )}
      </div>

      {/* Inline add form — slides in from top */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={FORM_SPRING}
            style={{ overflow: "hidden" }}
          >
            <AddProfileForm
              customerId={customerId}
              onSave={upsertProfile}
              onCancel={() => setIsAdding(false)}
              userId={user?.id ?? ""}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {profiles.length === 0 && !isAdding && (
        <div
          className="flex flex-col items-center justify-center py-12 rounded-lg text-center"
          style={{ border: "1px dashed var(--neuron-ui-border)" }}
        >
          <Users size={32} color="var(--theme-text-muted)" className="mb-3" />
          <p className="text-[13px] font-medium" style={{ color: "var(--neuron-ink-primary)" }}>
            No team profiles saved yet
          </p>
          <p className="text-[12px] mt-1" style={{ color: "var(--theme-text-muted)" }}>
            {canEdit
              ? "Add a profile to pre-assign team members to this customer's work."
              : "Team profiles will appear here once added."}
          </p>
        </div>
      )}

      {/* Profile list grouped by department */}
      {profiles.length > 0 && (
        <div className="space-y-5">
          {deptNames.map((dept) => {
            const DeptIcon = DEPT_ICONS[dept as keyof typeof DEPT_ICONS] ?? Building2;
            return (
              <div key={dept} className="space-y-2">
                <div className="flex items-center gap-2">
                  <DeptIcon size={13} style={{ color: "var(--theme-action-primary-bg)" }} />
                  <span
                    className="text-[11px] font-semibold uppercase tracking-widest shrink-0"
                    style={{ color: "var(--theme-action-primary-bg)" }}
                  >
                    {dept}
                  </span>
                  <div className="flex-1 h-px" style={{ backgroundColor: "var(--neuron-ui-border)" }} />
                </div>
                {grouped[dept].map((profile) => (
                <AnimatePresence key={profile.id} mode="wait">
                  {editingId === profile.id ? (
                    <motion.div
                      key="edit"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <EditProfileForm
                        profile={profile}
                        onSave={upsertProfile}
                        onCancel={() => setEditingId(null)}
                        userId={user?.id ?? ""}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="card"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      <ProfileCard
                        profile={profile}
                        isFaded={!!editingId && editingId !== profile.id}
                        isPendingDelete={deletingId === profile.id}
                        onEdit={() => { setEditingId(profile.id); setIsAdding(false); }}
                        onDeleteRequest={() => setConfirmDeleteId(profile.id)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      <NeuronModal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="Remove team profile?"
        description={
          profileToDelete
            ? `The ${profileToDelete.department}${profileToDelete.service_type ? ` · ${profileToDelete.service_type}` : ""} profile will be removed. Existing bookings and projects won't be affected.`
            : "This profile will be removed."
        }
        confirmLabel="Remove Profile"
        confirmIcon={<Trash2 size={14} />}
        onConfirm={handleDelete}
        isLoading={!!deletingId}
        variant="danger"
      />
    </div>
  );
}
