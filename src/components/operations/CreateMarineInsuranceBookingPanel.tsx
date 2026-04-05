import { Shield, Package, FileText } from "lucide-react";
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
import { useUser } from "../../hooks/useUser";

interface CreateMarineInsuranceBookingPanelProps {
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

export function CreateMarineInsuranceBookingPanel({
  isOpen,
  onClose,
  onSuccess,
}: CreateMarineInsuranceBookingPanelProps) {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  // ✨ CONTRACT: Detected contract ID for auto-linking
  const [detectedContractId, setDetectedContractId] = useState<string | null>(null);
  const customerOptions = useCustomerOptions(isOpen);
  const [formData, setFormData] = useState({
    customerName: "",
    movement: "IMPORT",
    accountOwner: "",
    accountHandler: "",
    policyNumber: "",
    insuranceProvider: "",
    coverageType: "",
    sumInsured: "",
    premium: "",
    quotationReferenceNumber: "",
    status: "Draft",
    insuredParty: "",
    commodityDescription: "",
    invoiceValue: "",
    voyage: "",
    vesselName: "",
    departurePort: "",
    arrivalPort: "",
    departureDate: "",
    arrivalDate: "",
    policyStartDate: "",
    policyEndDate: "",
    claimStatus: "",
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
    if (!formData.commodityDescription) {
      toast.error("Commodity description is required");
      return;
    }
    if (!formData.sumInsured) {
      toast.error("Sum insured is required");
      return;
    }
    
    setLoading(true);

    try {
      const insertPayload = {
        ...formData,
        ...(detectedContractId && { contract_id: detectedContractId }),
      };
      const { data, error } = await supabase.from('marine_insurance_bookings').insert(insertPayload).select().single();

      if (error) throw new Error(error.message);

      logCreation("booking", data.id, data.booking_number ?? data.id, { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" });
      toast.success("Marine insurance booking created successfully");
      onSuccess?.(data);
      onClose();
    } catch (error) {
      console.error("Error creating marine insurance booking:", error);
      toast.error("Failed to create booking. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isFormValid = formData.customerName.trim() !== "" &&
    formData.commodityDescription.trim() !== "" &&
    formData.sumInsured.trim() !== "";

  return (
    <BookingCreationPanel
      isOpen={isOpen}
      onClose={onClose}
      icon={<Shield size={20} />}
      title="New Marine Insurance Booking"
      subtitle="Create a new marine insurance policy for cargo coverage"
      formId="create-marine-insurance-form"
      onSubmit={handleSubmit}
      isSubmitting={loading}
      isFormValid={isFormValid}
      submitLabel="Create Booking"
      submitIcon={<Shield size={16} />}
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
                    layoutIdPrefix="marine-movement-pill"
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
                    serviceType="Marine Insurance"
                    onContractDetected={setDetectedContractId}
                  />
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

            {/* Policy Details */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Shield size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Policy Details
                </h3>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Policy Number
                    </label>
                    <input
                      type="text"
                      name="policyNumber"
                      value={formData.policyNumber}
                      onChange={handleChange}
                      placeholder="Policy number"
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
                      Insurance Provider
                    </label>
                    <input
                      type="text"
                      name="insuranceProvider"
                      value={formData.insuranceProvider}
                      onChange={handleChange}
                      placeholder="Insurance provider"
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
                      Coverage Type
                    </label>
                    <input
                      type="text"
                      name="coverageType"
                      value={formData.coverageType}
                      onChange={handleChange}
                      placeholder="e.g., All Risks, WA, FPA"
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
                      Insured Party
                    </label>
                    <input
                      type="text"
                      name="insuredParty"
                      value={formData.insuredParty}
                      onChange={handleChange}
                      placeholder="Insured party name"
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
                      Sum Insured
                    </label>
                    <input
                      type="text"
                      name="sumInsured"
                      value={formData.sumInsured}
                      onChange={handleChange}
                      placeholder="e.g., USD 100,000"
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
                      Premium
                    </label>
                    <input
                      type="text"
                      name="premium"
                      value={formData.premium}
                      onChange={handleChange}
                      placeholder="e.g., USD 500"
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
                      Policy Start Date
                    </label>
                    <input
                      type="date"
                      name="policyStartDate"
                      value={formData.policyStartDate}
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
                      Policy End Date
                    </label>
                    <input
                      type="date"
                      name="policyEndDate"
                      value={formData.policyEndDate}
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
              </div>
            </div>

            {/* Cargo & Voyage Details */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <FileText size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Cargo & Voyage Details
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                    Commodity Description
                  </label>
                  <textarea
                    name="commodityDescription"
                    value={formData.commodityDescription}
                    onChange={handleChange}
                    rows={2}
                    placeholder="Describe the insured cargo"
                    className="w-full px-3.5 py-2.5 rounded-lg text-[13px] resize-none"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "var(--theme-bg-surface)",
                      color: "var(--neuron-ink-primary)",
                    }}
                  />
                </div>

                <div>
                  <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                    Invoice Value
                  </label>
                  <input
                    type="text"
                    name="invoiceValue"
                    value={formData.invoiceValue}
                    onChange={handleChange}
                    placeholder="e.g., USD 95,000"
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
                      Voyage
                    </label>
                    <input
                      type="text"
                      name="voyage"
                      value={formData.voyage}
                      onChange={handleChange}
                      placeholder="Voyage number/name"
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
                      Vessel Name
                    </label>
                    <input
                      type="text"
                      name="vesselName"
                      value={formData.vesselName}
                      onChange={handleChange}
                      placeholder="Vessel name"
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
                      Departure Port
                    </label>
                    <input
                      type="text"
                      name="departurePort"
                      value={formData.departurePort}
                      onChange={handleChange}
                      placeholder="Port of departure"
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
                      Arrival Port
                    </label>
                    <input
                      type="text"
                      name="arrivalPort"
                      value={formData.arrivalPort}
                      onChange={handleChange}
                      placeholder="Port of arrival"
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
                      Departure Date
                    </label>
                    <input
                      type="date"
                      name="departureDate"
                      value={formData.departureDate}
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
                      Arrival Date
                    </label>
                    <input
                      type="date"
                      name="arrivalDate"
                      value={formData.arrivalDate}
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
                      Claim Status
                    </label>
                    <input
                      type="text"
                      name="claimStatus"
                      value={formData.claimStatus}
                      onChange={handleChange}
                      placeholder="e.g., No Claim, Pending, Settled"
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
    </BookingCreationPanel>
  );
}