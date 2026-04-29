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
import { CustomDropdown } from "../bd/CustomDropdown";
import type { ContractSummary } from "../../types/pricing";
import { logCreation } from "../../utils/activityLog";
import { fireBookingAssignmentTickets } from "../../utils/workflowTickets";
import { generateBookingNumber, peekNextBookingNumber } from "../../utils/bookingNumberUtils";
import { getSelectedCustomer } from "../../utils/bookings/selectedCustomer";
import { useCustomerAccountOwnerAutofill } from "./shared/useCustomerAccountOwnerAutofill";

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
  const [contractsList, setContractsList] = useState<ContractSummary[]>([]);
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});

  const { formState, setField, initFromPrefill, context } = useBookingFormState("Brokerage", {
    status: "Draft",
    movement_type: "Import",
  });
  const selectedCustomer = getSelectedCustomer(formState, customerId ?? null);
  useCustomerAccountOwnerAutofill(selectedCustomer.customerId, setField);

  useEffect(() => {
    if (prefillData && isOpen) initFromPrefill(prefillData);
  }, [prefillData, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preview the upcoming booking number when the panel opens. Non-allocating —
  // the actual number is still assigned atomically on submit.
  useEffect(() => {
    if (!isOpen) return;
    if (formState.booking_number) return;
    let cancelled = false;
    void (async () => {
      const preview = await peekNextBookingNumber("Brokerage");
      if (!cancelled && preview) setField("booking_number", preview);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isStandardBrokerage = String(formState.brokerage_type ?? "") === "Standard";

    const errors = validateBookingForm(formState, "Brokerage", context, {
      requiredFieldKeys: getMinimalCreateRequiredFields("Brokerage"),
    });
    if (hasErrors(errors)) {
      setSubmitErrors(errors);
      toast.error("Please fill in all required fields");
      return;
    }
    if (isStandardBrokerage && !detectedContractId) {
      toast.error("Standard brokerage requires an active Brokerage contract");
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

  const customerName = selectedCustomer.customerName;
  const bookingName = String(formState.booking_name ?? "");
  const isStandardBrokerage = String(formState.brokerage_type ?? "") === "Standard";
  const isFormValid =
    customerName.trim() !== "" &&
    bookingName.trim() !== "" &&
    (!isStandardBrokerage || detectedContractId !== null);

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
        requiredFieldKeys={getMinimalCreateRequiredFields("Brokerage")}
        fieldOverrides={
          isStandardBrokerage && contractsList.length > 1
            ? {
                project_number: (
                  <CustomDropdown
                    label=""
                    value={detectedContractId ?? ""}
                    onChange={(id) => {
                      const picked = contractsList.find((c) => c.id === id);
                      if (!picked) return;
                      setDetectedContractId(picked.id);
                      setField("project_number", picked.quote_number ?? "");
                    }}
                    options={contractsList.map((c) => ({
                      value: c.id,
                      label: c.quotation_name
                        ? `${c.quote_number} — ${c.quotation_name}`
                        : c.quote_number ?? "(unnamed contract)",
                    }))}
                    placeholder="Select contract..."
                    fullWidth
                    portalZIndex={1125}
                  />
                ),
              }
            : undefined
        }
      />

      {/* Contract detection banner — only Standard brokerage links to a customer contract.
          All-Inclusive and Non-Regular are spot-priced and remain unlinked. */}
      {customerName && (
        <ContractDetectionBanner
          customerName={customerName}
          serviceType="Brokerage"
          onContractDetected={setDetectedContractId}
          onContractInfo={(contract) => {
            // Autofill the read-only Project / Contract Number with the contract's quote number.
            setField("project_number", contract?.quote_number ?? "");
          }}
          onContractsList={setContractsList}
          selectedContractId={detectedContractId}
          enabled={String(formState.brokerage_type ?? "") === "Standard"}
          requireContract={String(formState.brokerage_type ?? "") === "Standard"}
          requireContractLabel="Brokerage"
          strictServiceMatch={String(formState.brokerage_type ?? "") === "Standard"}
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
              key={`Brokerage:${selectedCustomer.customerId ?? "no-customer"}`}
              customerId={selectedCustomer.customerId}
              serviceType="Brokerage"
              onChange={setAssignmentPayload}
            />
          </div>
        </div>
      )}
    </BookingCreationPanel>
  );
}
