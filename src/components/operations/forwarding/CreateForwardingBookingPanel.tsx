import React, { useState, useEffect, useRef } from "react";
import { Package, Users } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import { toast } from "../../ui/toast-utils";
import {
  ServiceRoleAssignmentForm,
  type ServiceRoleAssignmentPayload,
} from "../assignments/ServiceRoleAssignmentForm";
import { BookingCreationPanel } from "../shared/BookingCreationPanel";
import { BookingDynamicForm } from "../shared/BookingDynamicForm";
import { useBookingFormState } from "../shared/useBookingFormState";
import {
  getMinimalCreateRequiredFields,
  validateBookingForm,
  hasErrors,
} from "../shared/bookingFormValidation";
import { buildBookingPayload, toSupabaseRow } from "../../../utils/bookings/bookingPayload";
import {
  legacyProjectionFromAssignment,
  persistAssignmentsForNewBooking,
} from "../../../utils/assignments/applyAssignmentToBookingPayload";
import { ContractDetectionBanner } from "../shared/ContractDetectionBanner";
import { ProjectAutofillSection } from "../shared/ProjectAutofillSection";
import { autofillForwardingFromProject, linkBookingToProject } from "../../../utils/projectAutofill";
import type { Project } from "../../../types/pricing";
import { logCreation } from "../../../utils/activityLog";
import { fireBookingAssignmentTickets } from "../../../utils/workflowTickets";
import { generateBookingNumber, peekNextBookingNumber } from "../../../utils/bookingNumberUtils";
import { getSelectedCustomer } from "../../../utils/bookings/selectedCustomer";
import { useCustomerAccountOwnerAutofill } from "../shared/useCustomerAccountOwnerAutofill";
import { saveBookingDraft } from "../shared/saveBookingDraft";

interface CreateForwardingBookingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onBookingCreated: (bookingData?: Record<string, unknown>) => void;
  currentUser?: { id?: string; name: string; email: string; department: string } | null;
  prefillData?: Record<string, unknown>;
  source?: "operations" | "pricing";
  customerId?: string;
  serviceType?: string;
  draftBookingId?: string;
  draftData?: Record<string, unknown>;
}

export function CreateForwardingBookingPanel({
  isOpen,
  onClose,
  onBookingCreated,
  currentUser,
  prefillData,
  source = "operations",
  customerId,
  draftBookingId,
  draftData,
}: CreateForwardingBookingPanelProps) {
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(draftBookingId ?? null);
  const [assignmentPayload, setAssignmentPayload] = useState<ServiceRoleAssignmentPayload | null>(null);
  const [detectedContractId, setDetectedContractId] = useState<string | null>(null);
  const [fetchedProject, setFetchedProject] = useState<Project | null>(null);
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});
  const hasHydratedDraft = useRef(false);

  const { formState, setField, initFromPrefill, initFromRecord, context } = useBookingFormState("Forwarding", {
    status: "Draft",
    movement_type: "Import",
    mode: "FCL",
  });
  const selectedCustomer = getSelectedCustomer(formState, customerId ?? null);
  useCustomerAccountOwnerAutofill(selectedCustomer.customerId, setField);

  useEffect(() => {
    if (!isOpen) {
      hasHydratedDraft.current = false;
      return;
    }
    if (draftData && !hasHydratedDraft.current) {
      hasHydratedDraft.current = true;
      initFromRecord(draftData);
      const existingContract = (draftData as { contract_id?: string }).contract_id;
      if (existingContract) setDetectedContractId(existingContract);
    }
  }, [draftData, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (prefillData && isOpen && !draftData) initFromPrefill(prefillData);
  }, [prefillData, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;
    if (formState.booking_number) return;
    let cancelled = false;
    void (async () => {
      const preview = await peekNextBookingNumber("Forwarding");
      if (!cancelled && preview) setField("booking_number", preview);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Project autofill: when a project is selected, pre-fill form from project data
  function handleProjectAutofill(project: Project) {
    setFetchedProject(project);
    const autofillData = autofillForwardingFromProject(project);
    initFromPrefill(autofillData as Record<string, unknown>);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors = validateBookingForm(formState, "Forwarding", context, {
      requiredFieldKeys: getMinimalCreateRequiredFields("Forwarding"),
    });
    if (hasErrors(errors)) {
      setSubmitErrors(errors);
      toast.error("Please fill in all required fields");
      return;
    }
    setSubmitErrors({});
    setLoading(true);

    try {
      const existingBookingNumber = String((draftData as { booking_number?: string } | undefined)?.booking_number ?? "");
      const bookingNumber = existingBookingNumber || (await generateBookingNumber("Forwarding"));
      const { topLevel, details } = buildBookingPayload(formState, "Forwarding");

      const rowBody = toSupabaseRow(
        {
          ...topLevel,
          status: "Created",
          booking_number: bookingNumber,
          ...(detectedContractId ? { contract_id: detectedContractId } : {}),
          ...(fetchedProject ? { project_id: fetchedProject.id } : {}),
          ...legacyProjectionFromAssignment(assignmentPayload),
        },
        details,
      );

      let data: any = null;
      if (editingId) {
        const res = await supabase.from("bookings").update(rowBody).eq("id", editingId).select().single();
        if (res.error) throw new Error(res.error.message);
        data = res.data;
      } else {
        const res = await supabase.from("bookings").insert({ id: crypto.randomUUID(), ...rowBody }).select().single();
        if (res.error) throw new Error(res.error.message);
        data = res.data;
      }
      if (!data) throw new Error("Booking save returned no row");

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

      // Link to project if autofilled from one
      if (fetchedProject) {
        await linkBookingToProject(
          fetchedProject.id,
          data.id,
          data.booking_number ?? data.id,
          "Forwarding",
          String(formState.status ?? "Draft"),
        ).catch(console.error);
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
          serviceType: "Forwarding",
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

      toast.success("Forwarding booking created successfully");
      onBookingCreated(data);
      onClose();
    } catch (err) {
      console.error("CreateForwardingBookingPanel:", err);
      toast.error("Failed to create booking. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      const result = await saveBookingDraft(formState, "Forwarding", {
        bookingId: editingId,
        currentUser: currentUser
          ? { id: currentUser.id ?? "", name: currentUser.name, department: currentUser.department }
          : null,
        detectedContractId,
        projectId: fetchedProject?.id ?? null,
      });
      if (!result) return;
      setEditingId(result.id);
      toast.success(result.isNew ? "Draft saved" : "Draft updated");
      onBookingCreated({ id: result.id, status: "Draft" });
      onClose();
    } catch (err) {
      console.error("CreateForwardingBookingPanel saveDraft:", err);
      toast.error("Failed to save draft. Please try again.");
    } finally {
      setSavingDraft(false);
    }
  };

  if (!isOpen) return null;

  const isEditingDraft = editingId !== null;
  const customerName = selectedCustomer.customerName;
  const bookingName = String(formState.booking_name ?? "");
  const isFormValid = customerName.trim() !== "" && bookingName.trim() !== "";

  return (
    <BookingCreationPanel
      isOpen={isOpen}
      onClose={onClose}
      icon={<Package size={20} />}
      title={isEditingDraft ? "Edit Draft Forwarding Booking" : "New Forwarding Booking"}
      subtitle={
        isEditingDraft
          ? "Finish the draft and submit, or keep saving as draft"
          : source === "pricing"
          ? "Create a forwarding booking from project specifications"
          : "Create a new freight forwarding booking"
      }
      formId="create-forwarding-form"
      onSubmit={handleSubmit}
      isSubmitting={loading}
      isFormValid={isFormValid}
      submitLabel={isEditingDraft ? "Submit Booking" : "Create Booking"}
      submitIcon={<Package size={16} />}
      onSaveDraft={handleSaveDraft}
      isSavingDraft={savingDraft}
    >
      {/* Project autofill — operations source only */}
      {source === "operations" && (
        <ProjectAutofillSection
          projectNumber={String(formState.project_number ?? "")}
          onProjectNumberChange={(value) => setField("project_number", value)}
          onAutofill={handleProjectAutofill}
          serviceType="Forwarding"
        />
      )}

      <BookingDynamicForm
        serviceType="Forwarding"
        formState={formState}
        onChange={setField}
        ctx={context}
        errors={submitErrors}
        requiredFieldKeys={getMinimalCreateRequiredFields("Forwarding")}
      />

      {customerName && (
        <ContractDetectionBanner
          customerName={customerName}
          serviceType="Forwarding"
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
              key={`Forwarding:${selectedCustomer.customerId ?? "no-customer"}`}
              customerId={selectedCustomer.customerId}
              serviceType="Forwarding"
              onChange={setAssignmentPayload}
            />
          </div>
        </div>
      )}
    </BookingCreationPanel>
  );
}
