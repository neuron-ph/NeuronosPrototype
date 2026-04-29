import React, { useState, useEffect } from "react";
import { Edit2, Check, X } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import { toast } from "../../ui/toast-utils";
import { useBookingFormState } from "./useBookingFormState";
import { buildBookingPayload } from "../../../utils/bookings/bookingPayload";
import { appendBookingActivity } from "../../../utils/bookingActivityLog";
import { getVisibleSections } from "../../../config/booking/bookingVisibilityRules";
import { getServiceSchema } from "../../../config/booking/bookingScreenSchema";
import { BookingAssignmentSection } from "../assignments/BookingAssignmentSection";
import { groupBookingSections } from "../../../utils/bookings/groupBookingSections";
import { BookingSectionGroupCard } from "./BookingSectionGroupCard";

interface BookingInfoTabProps {
  booking: Record<string, unknown>;
  serviceType: string;
  bookingId: string;
  onUpdate: () => void;
  currentUser?: { name: string; email: string; department: string } | null;
}

export function BookingInfoTab({
  booking,
  serviceType,
  bookingId,
  onUpdate,
  currentUser,
}: BookingInfoTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const errors = {};

  const { formState, setField, initFromRecord, context } = useBookingFormState(serviceType);

  useEffect(() => {
    initFromRecord(booking);
  }, [booking]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCancel() {
    initFromRecord(booking);
    setIsEditing(false);
  }

  async function handleSave() {
    // No required-field validation at the booking-edit stage — Ops fills info in
    // iteratively as the shipment progresses. Save freely.
    setIsSaving(true);
    try {
      const { topLevel, details } = buildBookingPayload(formState, serviceType);
      delete topLevel.status;

      const existingDetails = (booking.details as Record<string, unknown>) ?? {};
      const mergedDetails = { ...existingDetails, ...details };

      const actor = currentUser?.name ?? "User";
      const actorDept = currentUser?.department ?? "Operations";
      for (const [key, newVal] of Object.entries({ ...topLevel, ...details })) {
        const oldVal = booking[key] ?? existingDetails[key];
        if (String(oldVal ?? "") !== String(newVal ?? "") && newVal !== undefined) {
          appendBookingActivity(
            bookingId,
            { action: "field_updated", fieldName: key, oldValue: String(oldVal ?? ""), newValue: String(newVal ?? ""), user: actor },
            { name: actor, department: actorDept },
          );
        }
      }

      const { error } = await supabase
        .from("bookings")
        .update({ ...topLevel, details: mergedDetails })
        .eq("id", bookingId);

      if (error) throw error;

      toast.success("Booking updated");
      setIsEditing(false);
      onUpdate();
    } catch (err) {
      console.error("BookingInfoTab save error:", err);
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  }

  const schema = getServiceSchema(serviceType);
  if (!schema) return null;

  const visibleSections = getVisibleSections(schema.sections, context).map(section => ({
    ...section,
    fields: section.fields.filter(field => field.key !== "status"),
  }));
  const { generalSections, specificSections } = groupBookingSections(visibleSections);

  const actor = currentUser?.name ?? "User";
  const actorDept = currentUser?.department ?? "Operations";

  function addTeamActivity(fieldName: string, oldValue: string, newValue: string) {
    appendBookingActivity(
      bookingId,
      { action: "field_updated", fieldName, oldValue, newValue, user: actor },
      { name: actor, department: actorDept },
    );
  }

  const editControls = !isEditing ? (
    <button
      onClick={() => setIsEditing(true)}
      style={{
        display: "flex", alignItems: "center", gap: "5px",
        padding: "4px 10px", fontSize: "12px", fontWeight: 500,
        background: "none", border: "none", cursor: "pointer",
        color: "var(--theme-action-primary-bg)",
      }}
    >
      <Edit2 size={13} />
      Edit
    </button>
  ) : (
    <div style={{ display: "flex", gap: "6px" }}>
      <button
        onClick={handleCancel}
        disabled={isSaving}
        style={{
          display: "flex", alignItems: "center", gap: "4px",
          padding: "4px 10px", fontSize: "12px", fontWeight: 500,
          backgroundColor: "var(--theme-bg-page)",
          border: "1px solid var(--theme-border-default)",
          borderRadius: "6px", cursor: "pointer",
          color: "var(--neuron-ink-base)",
        }}
      >
        <X size={12} /> Cancel
      </button>
      <button
        onClick={handleSave}
        disabled={isSaving}
        style={{
          display: "flex", alignItems: "center", gap: "4px",
          padding: "4px 12px", fontSize: "12px", fontWeight: 500,
          backgroundColor: "var(--theme-action-primary-bg)",
          border: "none", borderRadius: "6px", cursor: "pointer",
          color: "white", opacity: isSaving ? 0.6 : 1,
        }}
      >
        <Check size={12} />
        {isSaving ? "Saving…" : "Save"}
      </button>
    </div>
  );

  return (
    <div style={{ padding: "24px" }}>
      <BookingAssignmentSection
        bookingId={bookingId}
        bookingNumber={String(booking.booking_number ?? booking.bookingId ?? bookingId)}
        serviceType={serviceType}
        customerName={String(booking.customer_name ?? booking.customerName ?? formState.customer_name ?? "")}
        customerId={String(booking.customer_id ?? "")}
        teamId={typeof booking.team_id === "string" ? booking.team_id : null}
        managerName={String(booking.manager_name ?? "")}
        supervisorName={String(booking.supervisor_name ?? "")}
        handlerId={String(booking.handler_id ?? "")}
        handlerName={String(booking.handler_name ?? "")}
        currentUser={currentUser}
        onUpdate={onUpdate}
        addActivity={addTeamActivity}
      />

      <BookingSectionGroupCard
        title="General Information"
        sections={generalSections}
        formState={formState}
        onChange={setField}
        ctx={context}
        errors={errors}
        disabled={!isEditing}
        headerAction={editControls}
      />

      <BookingSectionGroupCard
        title="Specific Booking Information"
        sections={specificSections}
        formState={formState}
        onChange={setField}
        ctx={context}
        errors={errors}
        disabled={!isEditing}
      />
    </div>
  );
}
