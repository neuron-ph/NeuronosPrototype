import React, { useState, useEffect } from "react";
import { Shield, Users } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { toast } from "../ui/toast-utils";
import {
  ServiceRoleAssignmentForm,
  type ServiceRoleAssignmentPayload,
} from "./assignments/ServiceRoleAssignmentForm";
import { BookingCreationPanel } from "./shared/BookingCreationPanel";
import { BookingDynamicForm } from "./shared/BookingDynamicForm";
import { useBookingFormState } from "./shared/useBookingFormState";
import {
  getMinimalCreateRequiredFields,
  validateBookingForm,
  hasErrors,
} from "./shared/bookingFormValidation";
import { buildBookingPayload, toSupabaseRow } from "../../utils/bookings/bookingPayload";
import {
  legacyProjectionFromAssignment,
  persistAssignmentsForNewBooking,
} from "../../utils/assignments/applyAssignmentToBookingPayload";
import { ContractDetectionBanner } from "./shared/ContractDetectionBanner";
import { logCreation } from "../../utils/activityLog";
import { fireBookingAssignmentTickets } from "../../utils/workflowTickets";
import { generateBookingNumber, peekNextBookingNumber } from "../../utils/bookingNumberUtils";
import { getSelectedCustomer } from "../../utils/bookings/selectedCustomer";
import { useCustomerAccountOwnerAutofill } from "./shared/useCustomerAccountOwnerAutofill";

interface CreateMarineInsuranceBookingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (bookingData?: Record<string, unknown>) => void;
  onBookingCreated?: (bookingData?: Record<string, unknown>) => void;
  prefillData?: Record<string, unknown>;
  source?: string;
  customerId?: string;
  serviceType?: string;
  currentUser?: { id?: string; name?: string; department?: string } | null;
}

export function CreateMarineInsuranceBookingPanel({
  isOpen,
  onClose,
  onSuccess,
  onBookingCreated,
  prefillData,
  source = "operations",
  customerId,
  currentUser,
}: CreateMarineInsuranceBookingPanelProps) {
  const [loading, setLoading] = useState(false);
  const [assignmentPayload, setAssignmentPayload] = useState<ServiceRoleAssignmentPayload | null>(null);
  const [detectedContractId, setDetectedContractId] = useState<string | null>(null);
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});

  const { formState, setField, initFromPrefill, context } = useBookingFormState("Marine Insurance", {
    status: "Draft",
  });
  const selectedCustomer = getSelectedCustomer(formState, customerId ?? null);
  useCustomerAccountOwnerAutofill(selectedCustomer.customerId, setField);

  useEffect(() => {
    if (prefillData && isOpen) initFromPrefill(prefillData);
  }, [prefillData, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;
    if (formState.booking_number) return;
    let cancelled = false;
    void (async () => {
      const preview = await peekNextBookingNumber("Marine Insurance");
      if (!cancelled && preview) setField("booking_number", preview);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors = validateBookingForm(formState, "Marine Insurance", context, {
      requiredFieldKeys: getMinimalCreateRequiredFields("Marine Insurance"),
    });
    if (hasErrors(errors)) {
      setSubmitErrors(errors);
      toast.error("Please fill in all required fields");
      return;
    }
    setSubmitErrors({});
    setLoading(true);

    try {
      const bookingNumber = await generateBookingNumber("Marine Insurance");
      const { topLevel, details } = buildBookingPayload(formState, "Marine Insurance");

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
        customerId: selectedCustomer.customerId,
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
        const handler = assignmentPayload.assignments.find((a) => a.role_key === "handler");
        const supervisor = assignmentPayload.assignments.find(
          (a) => a.role_key === "operations_supervisor",
        );
        void fireBookingAssignmentTickets({
          bookingId: data.id,
          bookingNumber: data.booking_number,
          serviceType: "Marine Insurance",
          customerName: selectedCustomer.customerName,
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

      toast.success("Marine Insurance booking created successfully");
      onSuccess?.(data);
      onBookingCreated?.(data);
      onClose();
    } catch (err) {
      console.error("CreateMarineInsuranceBookingPanel:", err);
      toast.error("Failed to create booking. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const customerName = selectedCustomer.customerName;
  const bookingName = String(formState.booking_name ?? "");
  const isFormValid = customerName.trim() !== "" && bookingName.trim() !== "";

  return (
    <BookingCreationPanel
      isOpen={isOpen}
      onClose={onClose}
      icon={<Shield size={20} />}
      title="New Marine Insurance Booking"
      subtitle={
        source === "pricing"
          ? "Create a marine insurance booking from project specifications"
          : "Create a new marine cargo insurance booking"
      }
      formId="create-marine-form"
      onSubmit={handleSubmit}
      isSubmitting={loading}
      isFormValid={isFormValid}
      submitLabel="Create Booking"
      submitIcon={<Shield size={16} />}
    >
      <BookingDynamicForm
        serviceType="Marine Insurance"
        formState={formState}
        onChange={setField}
        ctx={context}
        errors={submitErrors}
        requiredFieldKeys={getMinimalCreateRequiredFields("Marine Insurance")}
      />

      {customerName && (
        <ContractDetectionBanner
          customerName={customerName}
          serviceType="Marine Insurance"
          onContractDetected={setDetectedContractId}
        />
      )}

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
              key={`Marine Insurance:${selectedCustomer.customerId ?? "no-customer"}`}
              customerId={selectedCustomer.customerId}
              serviceType="Marine Insurance"
              onChange={setAssignmentPayload}
            />
          </div>
        </div>
      )}
    </BookingCreationPanel>
  );
}
