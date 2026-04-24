/**
 * BookingTeamSection
 *
 * Shows and edits the Operations team assignment on any booking.
 * View mode: locked fields for Manager / Supervisor / Handler.
 * Edit mode: full TeamAssignmentForm (team → manager → supervisor → handler).
 *
 * Writes directly to the unified `bookings` table on save,
 * logs activity, and fires an inbox assignment notification to
 * the newly assigned handler (if changed).
 */

import { useState } from "react";
import { Lock, Users } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import { EditableSectionCard } from "../../shared/EditableSectionCard";
import { TeamAssignmentForm, type TeamAssignment } from "../../pricing/TeamAssignmentForm";
import { toast } from "../../ui/toast-utils";
import { appendBookingActivity } from "../../../utils/bookingActivityLog";
import { fireBookingAssignmentTickets } from "../../../utils/workflowTickets";
import { useUser } from "../../../hooks/useUser";
import { operationsAssignmentToProfileInput } from "../../../utils/teamProfileMapping";
import { upsertCustomerTeamProfile } from "../../../utils/teamProfilePersistence";

interface BookingTeamSectionProps {
  bookingId: string;
  bookingNumber: string;
  serviceType: string;
  customerName: string;
  /** Pass if available — enables saved-preference loading in TeamAssignmentForm */
  customerId?: string;
  teamId?: string;
  teamName?: string;
  managerId?: string;
  managerName?: string;
  supervisorId?: string;
  supervisorName?: string;
  handlerId?: string;
  handlerName?: string;
  currentUser?: { name: string; email: string; department: string } | null;
  onUpdate: () => void;
  addActivity: (fieldName: string, oldValue: string, newValue: string) => void;
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "13px",
          fontWeight: 500,
          color: "var(--neuron-ink-base)",
          marginBottom: "8px",
        }}
      >
        {label}
        <Lock size={12} color="var(--theme-text-muted)" style={{ cursor: "default" }} />
      </label>
      <div
        style={{
          padding: "10px 14px",
          backgroundColor: "var(--theme-bg-page)",
          border: "1px solid var(--theme-border-default)",
          borderRadius: "6px",
          fontSize: "14px",
          color: value ? "var(--neuron-ink-base)" : "var(--theme-text-muted)",
          cursor: "not-allowed",
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

export function BookingTeamSection({
  bookingId,
  bookingNumber,
  serviceType,
  customerName,
  customerId,
  teamId,
  teamName,
  managerId,
  managerName,
  supervisorId,
  supervisorName,
  handlerId,
  handlerName,
  currentUser,
  onUpdate,
  addActivity,
}: BookingTeamSectionProps) {
  const { user } = useUser();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAssignment, setPendingAssignment] = useState<TeamAssignment | null>(null);

  // Build initialAssignments for TeamAssignmentForm if we already have a team set
  const initialAssignment: TeamAssignment | undefined =
    teamId && managerId && managerName
      ? {
          team: { id: teamId, name: teamName ?? "" },
          manager: { id: managerId, name: managerName },
          supervisor:
            supervisorId && supervisorName
              ? { id: supervisorId, name: supervisorName }
              : null,
          handler:
            handlerId && handlerName
              ? { id: handlerId, name: handlerName }
              : null,
          saveAsDefault: false,
        }
      : undefined;

  const handleSave = async () => {
    if (!pendingAssignment) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      const updates: Record<string, any> = {
        team_id: pendingAssignment.team.id,
        team_name: pendingAssignment.team.name,
        manager_id: pendingAssignment.manager.id,
        manager_name: pendingAssignment.manager.name,
        supervisor_id: pendingAssignment.supervisor?.id ?? null,
        supervisor_name: pendingAssignment.supervisor?.name ?? null,
        handler_id: pendingAssignment.handler?.id ?? null,
        handler_name: pendingAssignment.handler?.name ?? null,
      };

      const { error } = await supabase.from("bookings").update(updates).eq("id", bookingId);
      if (error) throw error;

      // Log changed fields to activity stream
      const actorName = currentUser?.name || user?.name || "User";
      const actorDept = currentUser?.department || user?.department || "Operations";

      if (pendingAssignment.manager.name !== managerName) {
        addActivity("Assigned Manager", managerName || "(none)", pendingAssignment.manager.name);
      }
      if ((pendingAssignment.supervisor?.name ?? "") !== (supervisorName ?? "")) {
        addActivity(
          "Assigned Supervisor",
          supervisorName || "(none)",
          pendingAssignment.supervisor?.name || "(none)"
        );
      }
      if ((pendingAssignment.handler?.name ?? "") !== (handlerName ?? "")) {
        addActivity(
          "Assigned Handler",
          handlerName || "(none)",
          pendingAssignment.handler?.name || "(none)"
        );
      }

      appendBookingActivity(
        bookingId,
        {
          action: "field_updated",
          fieldName: "Team Assignment",
          oldValue: managerName || "(unassigned)",
          newValue: `${pendingAssignment.manager.name}${pendingAssignment.handler ? ` → ${pendingAssignment.handler.name}` : ""}`,
          user: actorName,
        },
        { name: actorName, department: actorDept }
      );

      // Fire inbox notification if handler is newly assigned or changed
      if (
        user?.id &&
        pendingAssignment.handler?.id &&
        pendingAssignment.handler.id !== handlerId
      ) {
        void fireBookingAssignmentTickets({
          bookingId,
          bookingNumber,
          serviceType,
          customerName,
          createdBy: user.id,
          createdByName: actorName,
          createdByDept: actorDept,
          manager: pendingAssignment.manager,
          supervisor: pendingAssignment.supervisor,
          handler: pendingAssignment.handler,
        });
      }

      // Save as default preference — write to canonical customer_team_profiles
      if (pendingAssignment.saveAsDefault && customerId && serviceType) {
        try {
          const profileInput = operationsAssignmentToProfileInput(
            pendingAssignment,
            customerId,
            serviceType
          );
          await upsertCustomerTeamProfile({
            ...profileInput,
            updated_by: user?.id ?? null,
          });
        } catch (prefErr) {
          console.error("BookingTeamSection: profile save failed", prefErr);
        }
      }

      toast.success("Team assignment saved");
      setIsEditing(false);
      setPendingAssignment(null);
      onUpdate();
    } catch (err) {
      console.error("BookingTeamSection save error:", err);
      toast.error("Failed to save team assignment");
    } finally {
      setIsSaving(false);
    }
  };

  const hasAssignment = !!(managerName || supervisorName || handlerName);

  return (
    <EditableSectionCard
      title="Team Assignment"
      subtitle={
        !isEditing && !hasAssignment
          ? "No team assigned yet"
          : undefined
      }
      isEditing={isEditing}
      isSaving={isSaving}
      onEdit={() => {
        setPendingAssignment(null);
        setIsEditing(true);
      }}
      onCancel={() => {
        setIsEditing(false);
        setPendingAssignment(null);
      }}
      onSave={handleSave}
    >
      {isEditing ? (
        <TeamAssignmentForm
          customerId={customerId || ""}
          onChange={setPendingAssignment}
          initialAssignments={initialAssignment}
        />
      ) : (
        <div>
          {!hasAssignment ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 16px",
                backgroundColor: "var(--theme-bg-page)",
                border: "1px dashed var(--theme-border-default)",
                borderRadius: "6px",
                color: "var(--theme-text-muted)",
                fontSize: "13px",
              }}
            >
              <Users size={16} color="var(--theme-text-muted)" />
              No team assigned. Click Edit to assign a manager, supervisor, or handler.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>
              <LockedField label="Manager" value={managerName || ""} />
              <LockedField label="Supervisor" value={supervisorName || ""} />
              <LockedField label="Handler" value={handlerName || ""} />
            </div>
          )}
        </div>
      )}
    </EditableSectionCard>
  );
}
