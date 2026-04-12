import { Briefcase, Package, FileText } from "lucide-react";
import { useState } from "react";
import { supabase } from "../../utils/supabase/client";
import { toast } from "../ui/toast-utils";
import { CustomDropdown } from "../bd/CustomDropdown";
import { SearchableDropdown } from "../shared/SearchableDropdown";
import { MovementToggle } from "./shared/MovementToggle";
import { ContractDetectionBanner } from "./shared/ContractDetectionBanner";
import { BookingCreationPanel } from "./shared/BookingCreationPanel";
import { useCustomerOptions } from "./shared/useCustomerOptions";
import { logCreation } from "../../utils/activityLog";
import { fireBookingAssignmentTickets } from "../../utils/workflowTickets";
import { useUser } from "../../hooks/useUser";
import { TeamAssignmentForm, type TeamAssignment } from "../pricing/TeamAssignmentForm";

interface CreateOthersBookingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (bookingData?: any) => void;
  onBookingCreated?: (bookingData?: any) => void;
  prefillData?: any;
  source?: string;
  customerId?: string;
  serviceType?: string;
  currentUser?: any;
}

export function CreateOthersBookingPanel({
  isOpen,
  onClose,
  onSuccess,
  source = "operations",
  customerId,
}: CreateOthersBookingPanelProps) {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [teamAssignment, setTeamAssignment] = useState<TeamAssignment | null>(null);
  // ✨ CONTRACT: Detected contract ID for auto-linking
  const [detectedContractId, setDetectedContractId] = useState<string | null>(null);
  const customerOptions = useCustomerOptions(isOpen);
  const [formData, setFormData] = useState({
    customerName: "",
    name: "",
    movement: "IMPORT",
    accountOwner: "",
    accountHandler: "",
    serviceType: "",
    serviceDescription: "",
    quotationReferenceNumber: "",
    status: "Draft",
    deliveryLocation: "",
    scheduleDate: "",
    completionDate: "",
    contactPerson: "",
    contactNumber: "",
    specialInstructions: "",
    estimatedCost: "",
    actualCost: "",
    remarks: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.customerName) {
      toast.error("Customer Name is required");
      return;
    }
    
    setLoading(true);

    try {
      const insertPayload: any = {
        ...formData,
        ...(detectedContractId && { contract_id: detectedContractId }),
      };

      if (source === "pricing" && teamAssignment) {
        insertPayload.manager_id = teamAssignment.manager.id;
        insertPayload.manager_name = teamAssignment.manager.name;
        insertPayload.team_id = teamAssignment.team.id;
        insertPayload.team_name = teamAssignment.team.name;
        if (teamAssignment.supervisor) {
          insertPayload.supervisor_id = teamAssignment.supervisor.id;
          insertPayload.supervisor_name = teamAssignment.supervisor.name;
        }
        if (teamAssignment.handler) {
          insertPayload.handler_id = teamAssignment.handler.id;
          insertPayload.handler_name = teamAssignment.handler.name;
        }
      }

      const { data, error } = await supabase.from('bookings').insert(insertPayload).select().single();

      if (error) throw new Error(error.message);

      if (source === "pricing" && teamAssignment?.saveAsDefault && customerId) {
        try {
          await supabase.from('client_handler_preferences').upsert({
            customer_id: customerId,
            preferred_team_id: teamAssignment.team.id,
            preferred_team_name: teamAssignment.team.name,
            preferred_manager_id: teamAssignment.manager.id,
            preferred_manager_name: teamAssignment.manager.name,
            preferred_supervisor_id: teamAssignment.supervisor?.id,
            preferred_supervisor_name: teamAssignment.supervisor?.name,
            preferred_handler_id: teamAssignment.handler?.id,
            preferred_handler_name: teamAssignment.handler?.name,
          });
        } catch (prefError) {
          console.error("Error saving team preference:", prefError);
        }
      }

      logCreation("booking", data.id, data.booking_number ?? data.id, { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" });

      if (source === "pricing" && teamAssignment) {
        void fireBookingAssignmentTickets({
          bookingId: data.id,
          bookingNumber: data.booking_number,
          serviceType: "Others",
          customerName: formData.customerName,
          createdBy: user?.id ?? "",
          createdByName: user?.name ?? "",
          createdByDept: user?.department ?? "",
          manager: teamAssignment.manager,
          supervisor: teamAssignment.supervisor,
          handler: teamAssignment.handler,
        });
      }

      toast.success("Service booking created successfully");
      onSuccess?.(data);
      onClose();
    } catch (error) {
      console.error("Error creating others booking:", error);
      toast.error("Failed to create booking. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isFormValid = formData.customerName.trim() !== "";

  return (
    <BookingCreationPanel
      isOpen={isOpen}
      onClose={onClose}
      icon={<Briefcase size={20} />}
      title="New Service Booking"
      subtitle="Create a new booking for other services and specialized operations"
      formId="create-others-form"
      onSubmit={handleSubmit}
      isSubmitting={loading}
      isFormValid={isFormValid}
      submitLabel="Create Booking"
      submitIcon={<Briefcase size={16} />}
    >
            {/* General Information */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Package size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  General Information
                </h3>
              </div>

              <div className="space-y-4">
                {/* Movement Toggle */}
                <div>
                  <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                    Movement <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>
                  </label>
                  <MovementToggle
                    value={formData.movement as "IMPORT" | "EXPORT"}
                    onChange={(value) => handleChange({ target: { name: "movement", value } } as any)}
                    layoutIdPrefix="others-movement-pill"
                  />
                </div>

                <div>
                  <SearchableDropdown
                    label="Customer Name"
                    required
                    value={formData.customerName}
                    onChange={(value) => setFormData(prev => ({ ...prev, customerName: value }))}
                    options={customerOptions}
                    placeholder="Search customer..."
                    fullWidth
                  />
                  {/* ✨ CONTRACT: Detection banner */}
                  <ContractDetectionBanner
                    customerName={formData.customerName}
                    serviceType="Others"
                    onContractDetected={setDetectedContractId}
                  />

                </div>

                <div>
                  <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                    Booking Name <span style={{ color: "var(--theme-text-muted)", fontWeight: 400 }}>(Optional)</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g. Annual Survey, Special Inspection Run"
                    className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "var(--theme-bg-surface)",
                      color: "var(--neuron-ink-primary)",
                    }}
                  />
                  <p className="text-xs mt-1" style={{ color: "var(--theme-text-muted)" }}>
                    A short label to identify this booking, especially useful when a project has multiple bookings of the same type.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Account Owner
                    </label>
                    <input
                      type="text"
                      name="accountOwner"
                      value={formData.accountOwner}
                      onChange={handleChange}
                      placeholder="Account owner"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>

                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Account Handler
                    </label>
                    <input
                      type="text"
                      name="accountHandler"
                      value={formData.accountHandler}
                      onChange={handleChange}
                      placeholder="Account handler"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                    Service Type
                  </label>
                  <input
                    type="text"
                    name="serviceType"
                    value={formData.serviceType}
                    onChange={handleChange}
                    placeholder="e.g., Warehousing, Consulting, Documentation"
                    className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "var(--theme-bg-surface)",
                      color: "var(--neuron-ink-primary)",
                    }}
                  />
                </div>

                <div>
                  <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                    Service Description
                  </label>
                  <textarea
                    name="serviceDescription"
                    value={formData.serviceDescription}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Describe the service to be provided"
                    className="w-full px-3.5 py-2.5 rounded-lg text-[13px] resize-none"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "var(--theme-bg-surface)",
                      color: "var(--neuron-ink-primary)",
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Quotation Reference
                    </label>
                    <input
                      type="text"
                      name="quotationReferenceNumber"
                      value={formData.quotationReferenceNumber}
                      onChange={handleChange}
                      placeholder="Quotation reference"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>

                  <CustomDropdown
                    label="Status"
                    value={formData.status}
                    onChange={(value) => handleChange({ target: { name: "status", value } } as any)}
                    options={[
                      { value: "Draft", label: "Draft" },
                      { value: "Confirmed", label: "Confirmed" },
                      { value: "In Progress", label: "In Progress" },
                      { value: "Pending", label: "Pending" },
                      { value: "On Hold", label: "On Hold" },
                      { value: "Completed", label: "Completed" },
                      { value: "Cancelled", label: "Cancelled" },
                    ]}
                    placeholder="Select Status..."
                    fullWidth
                  />
                </div>
              </div>
            </div>

            {/* Service Details */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Service Details
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                    Delivery/Service Location
                  </label>
                  <input
                    type="text"
                    name="deliveryLocation"
                    value={formData.deliveryLocation}
                    onChange={handleChange}
                    placeholder="Location where service will be performed"
                    className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "var(--theme-bg-surface)",
                      color: "var(--neuron-ink-primary)",
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Schedule Date
                    </label>
                    <input
                      type="date"
                      name="scheduleDate"
                      value={formData.scheduleDate}
                      onChange={handleChange}
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>

                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Completion Date
                    </label>
                    <input
                      type="date"
                      name="completionDate"
                      value={formData.completionDate}
                      onChange={handleChange}
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Contact Person
                    </label>
                    <input
                      type="text"
                      name="contactPerson"
                      value={formData.contactPerson}
                      onChange={handleChange}
                      placeholder="Primary contact person"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>

                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Contact Number
                    </label>
                    <input
                      type="text"
                      name="contactNumber"
                      value={formData.contactNumber}
                      onChange={handleChange}
                      placeholder="Phone number"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                    Special Instructions
                  </label>
                  <textarea
                    name="specialInstructions"
                    value={formData.specialInstructions}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Any special requirements or instructions"
                    className="w-full px-3.5 py-2.5 rounded-lg text-[13px] resize-none"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "var(--theme-bg-surface)",
                      color: "var(--neuron-ink-primary)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Cost Information */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <FileText size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Cost Information
                </h3>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Estimated Cost
                    </label>
                    <input
                      type="text"
                      name="estimatedCost"
                      value={formData.estimatedCost}
                      onChange={handleChange}
                      placeholder="e.g., PHP 25,000"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>

                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Actual Cost
                    </label>
                    <input
                      type="text"
                      name="actualCost"
                      value={formData.actualCost}
                      onChange={handleChange}
                      placeholder="e.g., PHP 24,500"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                    Remarks
                  </label>
                  <textarea
                    name="remarks"
                    value={formData.remarks}
                    onChange={handleChange}
                    rows={2}
                    placeholder="Additional notes or remarks"
                    className="w-full px-3.5 py-2.5 rounded-lg text-[13px] resize-none"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "var(--theme-bg-surface)",
                      color: "var(--neuron-ink-primary)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Team Assignment — only shown when opened from Pricing */}
            {source === "pricing" && customerId && (
              <div className="mb-8">
                <div
                  style={{
                    background: "var(--theme-bg-page)",
                    border: "1px solid var(--theme-border-default)",
                    borderRadius: "12px",
                    padding: "20px",
                  }}
                >
                  <TeamAssignmentForm
                    customerId={customerId}
                    onChange={setTeamAssignment}
                  />
                </div>
              </div>
            )}
    </BookingCreationPanel>
  );
}