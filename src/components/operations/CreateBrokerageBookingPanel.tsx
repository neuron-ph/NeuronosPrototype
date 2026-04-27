import React, { useState, useEffect } from "react";
import { FileCheck, Users } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { toast } from "../ui/toast-utils";
import {
  ServiceRoleAssignmentForm,
  type ServiceRoleAssignmentPayload,
} from "./assignments/ServiceRoleAssignmentForm";
import type { User } from "../../hooks/useUser";
import { BookingCreationPanel } from "./shared/BookingCreationPanel";
import { BookingDynamicForm } from "./shared/BookingDynamicForm";
import { useBookingFormState } from "./shared/useBookingFormState";
import { validateBookingForm, hasErrors } from "./shared/bookingFormValidation";
import { buildBookingPayload, toSupabaseRow } from "../../utils/bookings/bookingPayload";
import {
  legacyProjectionFromAssignment,
  persistAssignmentsForNewBooking,
} from "../../utils/assignments/applyAssignmentToBookingPayload";
import { ContractDetectionBanner } from "./shared/ContractDetectionBanner";
import { logCreation } from "../../utils/activityLog";
import { fireBookingAssignmentTickets } from "../../utils/workflowTickets";
import { generateBookingNumber } from "../../utils/bookingNumberUtils";

interface CreateBrokerageBookingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (bookingData?: Record<string, unknown>) => void;
  prefillData?: Record<string, unknown>;
  source?: "operations" | "pricing";
  customerId?: string;
  serviceType?: string;
  currentUser?: User | null;
}

export function CreateBrokerageBookingPanel({
  isOpen,
  onClose,
  onSuccess,
  prefillData,
  source = "operations",
  customerId,
  currentUser,
}: CreateBrokerageBookingPanelProps) {
  const [loading, setLoading] = useState(false);
  const [assignmentPayload, setAssignmentPayload] = useState<ServiceRoleAssignmentPayload | null>(null);
  const [detectedContractId, setDetectedContractId] = useState<string | null>(null);
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});

  const { formState, setField, initFromPrefill, context } = useBookingFormState("Brokerage", {
    status: "Draft",
    movement_type: "Import",
  });

  useEffect(() => {
    if (prefillData && isOpen) initFromPrefill(prefillData);
  }, [prefillData, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors = validateBookingForm(formState, "Brokerage", context);
    if (hasErrors(errors)) {
      setSubmitErrors(errors);
      toast.error("Please fill in all required fields");
      return;
    }
    if (assignmentPayload?.hasMissingRequired) {
      toast.error("Please fill in all required role assignments");
      return;
    }
    setSubmitErrors({});
    setLoading(true);

    try {
      const bookingNumber = await generateBookingNumber("Brokerage");
      const { topLevel, details } = buildBookingPayload(formState, "Brokerage");

      const row = toSupabaseRow(
        {
          id: crypto.randomUUID(),
          ...topLevel,
          booking_number: bookingNumber,
          ...(detectedContractId ? { contract_id: detectedContractId } : {}),
          ...legacyProjectionFromAssignment(assignmentPayload),
        },
        details,
      );

      const { data, error } = await supabase.from("bookings").insert(row).select().single();
      if (error) throw new Error(error.message);

      const assignRes = await persistAssignmentsForNewBooking({
        bookingId: data.id,
        payload: assignmentPayload,
        customerId: customerId ?? null,
        assignedBy: currentUser?.id ?? null,
      });
      if (!assignRes.ok) {
        await supabase.from("bookings").delete().eq("id", data.id);
        throw new Error(assignRes.error);
      }

      logCreation("booking", data.id, data.booking_number ?? data.id, {
        id: currentUser?.id ?? "",
        name: currentUser?.name ?? "",
        department: currentUser?.department ?? "",
      });

      if (assignmentPayload && assignmentPayload.assignments.length > 0) {
        const handler = assignmentPayload.assignments.find(
          (a) => a.role_key === "handler" || a.role_key === "customs_declarant",
        );
        const supervisor = assignmentPayload.assignments.find(
          (a) =>
            a.role_key === "team_leader" ||
            a.role_key === "operations_supervisor" ||
            a.role_key === "impex_supervisor",
        );
        void fireBookingAssignmentTickets({
          bookingId: data.id,
          bookingNumber: data.booking_number,
          serviceType: "Brokerage",
          customerName: String(formState.customer_name ?? ""),
          createdBy: currentUser?.id ?? "",
          createdByName: currentUser?.name ?? "",
          createdByDept: currentUser?.department ?? "",
          manager: assignmentPayload.service?.default_manager_id
            ? {
                id: assignmentPayload.service.default_manager_id,
                name: assignmentPayload.service.default_manager_name ?? "",
              }
            : { id: "", name: "" },
          supervisor: supervisor ? { id: supervisor.user_id, name: supervisor.user_name } : null,
          handler: handler ? { id: handler.user_id, name: handler.user_name } : null,
        });
      }

      toast.success("Brokerage booking created successfully");
      onSuccess(data);
      onClose();
    } catch (err) {
      console.error("CreateBrokerageBookingPanel:", err);
      toast.error("Failed to create booking. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const customerName = String(formState.customer_name ?? "");
  const isFormValid = customerName.trim() !== "";

  return (
    <BookingCreationPanel
      isOpen={isOpen}
      onClose={onClose}
      icon={<FileCheck size={20} />}
      title="New Brokerage Booking"
      subtitle={
        source === "pricing"
          ? "Create a new brokerage booking from project specifications"
          : "Create a new customs brokerage entry booking"
      }
      formId="create-brokerage-form"
      onSubmit={handleSubmit}
      isSubmitting={loading}
      isFormValid={isFormValid}
      submitLabel="Create Booking"
      submitIcon={<FileCheck size={16} />}
    >
      <BookingDynamicForm
        serviceType="Brokerage"
        formState={formState}
        onChange={setField}
        ctx={context}
        errors={submitErrors}
      />

      {/* Contract detection banner — triggers on customer name change */}
      {customerName && (
        <ContractDetectionBanner
          customerName={customerName}
          serviceType="Brokerage"
          onContractDetected={setDetectedContractId}
        />
      )}

      {/* Service-role assignment — rendered outside BookingDynamicForm to keep save logic here */}
      {customerName && (
        <div style={{ marginBottom: "32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <Users size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>
              Assignments
            </h3>
          </div>
          <div style={{ padding: "20px", backgroundColor: "var(--theme-bg-page)", border: "1px solid var(--neuron-ui-border)", borderRadius: "8px" }}>
            <ServiceRoleAssignmentForm
              customerId={customerId ?? null}
              serviceType="Brokerage"
              onChange={setAssignmentPayload}
            />
          </div>
        </div>
      )}
    </BookingCreationPanel>
  );
}
