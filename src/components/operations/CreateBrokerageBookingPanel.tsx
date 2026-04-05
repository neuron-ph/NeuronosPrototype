import React, { useState, useEffect } from "react";
import { FileCheck, Package, FileText, Users } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { toast } from "../ui/toast-utils";
import { CustomDropdown } from "../bd/CustomDropdown";
import { SearchableDropdown } from "../shared/SearchableDropdown";
import { MovementToggle } from "./shared/MovementToggle";
import { ContractDetectionBanner } from "./shared/ContractDetectionBanner";
import { MultiInputField } from "../shared/MultiInputField";
import { TeamAssignmentForm, type TeamAssignment } from "../pricing/TeamAssignmentForm";
import type { User } from "../../hooks/useUser";
import { BookingCreationPanel } from "./shared/BookingCreationPanel";
import { useCustomerOptions } from "./shared/useCustomerOptions";
import { ConsigneePicker } from "../shared/ConsigneePicker";
import { logCreation } from "../../utils/activityLog";

// Brokerage Booking Form Data Interface
interface BrokerageBookingFormData {
  // New: Brokerage Type
  brokerageType: "Standard" | "All-Inclusive" | "Non-Regular" | "";
  movement: "IMPORT" | "EXPORT";
  
  // General Information
  customerName: string;
  accountOwner: string;
  accountHandler: string;
  customsEntryType: string;
  assessmentType: string;
  releaseType: string;
  declarationType: string;
  quotationReferenceNumber: string;
  projectNumber?: string;
  status: string;
  
  // Entry Details
  consignee: string;
  consignee_id?: string;
  accountNumber: string;
  registryNumber: string;
  mblMawb: string;
  bookingConfirmationNumber?: string; // Export
  hblHawb: string;
  invoiceNumber: string;
  invoiceValue: string;
  shipmentOrigin: string;
  entryNumber: string;
  releaseDate: string;
  lct?: string; // Export
  deliveryAddress: string;
  broker: string;
  commodityDescription: string;
  hsCode: string;
  dutyRate: string;
  vatRate: string;
  otherCharges: string;
  remarks: string;
  
  // New: Quotation Builder fields
  pod?: string;
  mode?: string;
  cargoType?: string;
  countryOfOrigin?: string;
  preferentialTreatment?: string;

  // FCL Specific (Export)
  tareWeight?: string;
  vgm?: string;
  truckingName?: string;
  plateNumber?: string;
  pickupLocation?: string;
  
  // Team assignments (for Pricing module)
  assigned_manager_id?: string;
  assigned_manager_name?: string;
  assigned_supervisor_id?: string;
  assigned_supervisor_name?: string;
  assigned_handler_id?: string;
  assigned_handler_name?: string;
}

interface CreateBrokerageBookingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (bookingData?: any) => void; // Updated to accept optional booking data
  prefillData?: Partial<BrokerageBookingFormData>; // NEW: For auto-fill from project
  source?: "operations" | "pricing"; // NEW: Indicates where the panel is being used
  customerId?: string; // NEW: For team assignment
  serviceType?: string; // NEW: For team assignment
  currentUser?: User | null; // NEW: Current user for team assignment
}

export function CreateBrokerageBookingPanel({
  isOpen,
  onClose,
  onSuccess,
  prefillData,
  source = "operations",
  customerId,
  serviceType = "Brokerage",
  currentUser,
}: CreateBrokerageBookingPanelProps) {
  const [loading, setLoading] = useState(false);
  const [hoveredType, setHoveredType] = useState<string | null>(null);
  const [teamAssignment, setTeamAssignment] = useState<TeamAssignment | null>(null);
  const customerOptions = useCustomerOptions(isOpen);
  
  // ✨ CONTRACT: Detected contract ID for auto-linking
  const [detectedContractId, setDetectedContractId] = useState<string | null>(null);
  
  // Initialize form data with prefill if provided
  const [formData, setFormData] = useState<BrokerageBookingFormData>({
    brokerageType: "",
    movement: "IMPORT",
    customerName: "",
    accountOwner: "",
    accountHandler: "",
    customsEntryType: "",
    assessmentType: "",
    releaseType: "",
    declarationType: "",
    quotationReferenceNumber: "",
    status: "Draft",
    consignee: "",
    accountNumber: "",
    registryNumber: "",
    mblMawb: "",
    hblHawb: "",
    invoiceNumber: "",
    invoiceValue: "",
    shipmentOrigin: "",
    entryNumber: "",
    releaseDate: "",
    deliveryAddress: "",
    broker: "",
    commodityDescription: "",
    hsCode: "",
    dutyRate: "",
    vatRate: "",
    otherCharges: "",
    remarks: "",
    pod: "",
    mode: "",
    cargoType: "",
    countryOfOrigin: "",
    preferentialTreatment: "",
    bookingConfirmationNumber: "",
    lct: "",
    tareWeight: "",
    vgm: "",
    truckingName: "",
    plateNumber: "",
    pickupLocation: "",
  });

  // Apply prefill data when component mounts or prefillData changes
  useEffect(() => {
    if (prefillData) {
      setFormData(prev => ({
        ...prev,
        ...prefillData,
      }));
    }
  }, [prefillData]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleBrokerageTypeChange = (type: "Standard" | "All-Inclusive" | "Non-Regular") => {
    setFormData((prev) => ({ ...prev, brokerageType: type }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.customerName) {
      toast.error("Customer Name is required");
      return;
    }
    if (!formData.consignee) {
      toast.error("Consignee is required");
      return;
    }

    // If from Pricing module, require team assignments
    if (source === "pricing" && !teamAssignment) {
      toast.error("Please complete team assignments");
      return;
    }
    
    setLoading(true);

    try {
      // Prepare submission data
      const submissionData = { ...formData };
      
      // ✨ CONTRACT: Include contract_id if detected
      if (detectedContractId) {
        (submissionData as any).contract_id = detectedContractId;
      }
      
      // Add team assignments if from Pricing
      if (source === "pricing" && teamAssignment) {
        submissionData.assigned_manager_id = teamAssignment.manager.id;
        submissionData.assigned_manager_name = teamAssignment.manager.name;
        submissionData.assigned_supervisor_id = teamAssignment.supervisor?.id;
        submissionData.assigned_supervisor_name = teamAssignment.supervisor?.name;
        submissionData.assigned_handler_id = teamAssignment.handler?.id;
        submissionData.assigned_handler_name = teamAssignment.handler?.name;
      }

      const { data, error } = await supabase.from('brokerage_bookings').insert(submissionData).select().single();

      if (error) {
        throw new Error(error.message);
      }

      logCreation("booking", data.id, data.booking_number ?? data.id, { id: currentUser?.id ?? "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" });
      toast.success("Brokerage booking created successfully");

      // Save team preference if requested and from Pricing
      if (source === "pricing" && teamAssignment?.saveAsDefault && customerId) {
        try {
          await supabase.from('client_handler_preferences').upsert({
            client_id: customerId,
            service_type: serviceType,
            preferred_supervisor_id: teamAssignment.supervisor?.id,
            preferred_handler_id: teamAssignment.handler?.id,
          });
        } catch (error) {
          console.error("Error saving team preference:", error);
        }
      }
      
      onSuccess(data);
      onClose();
    } catch (error) {
      console.error("Error creating brokerage booking:", error);
      toast.error("Failed to create booking. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isFormValid = formData.customerName.trim() !== "" &&
    formData.consignee.trim() !== "" &&
    (source === "operations" || (source === "pricing" && teamAssignment !== null));
  
  // Helper function to get input style
  const getInputStyle = (_fieldName: keyof BrokerageBookingFormData) => {
    return {
      border: "1px solid var(--theme-border-default)",
      color: "var(--neuron-ink-primary)",
      backgroundColor: "var(--theme-bg-surface)",
    };
  };

  return (
    <BookingCreationPanel
      isOpen={isOpen}
      onClose={onClose}
      icon={<FileCheck size={20} />}
      title="New Brokerage Booking"
      subtitle={source === "pricing" 
        ? "Create a new brokerage booking from project specifications" 
        : "Create a new customs brokerage entry booking"}
      formId="create-brokerage-form"
      onSubmit={handleSubmit}
      isSubmitting={loading}
      isFormValid={isFormValid}
      submitLabel="Create Booking"
      submitIcon={<FileCheck size={16} />}
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
                    value={formData.movement}
                    onChange={(value) => handleChange({ target: { name: "movement", value } } as any)}
                    layoutIdPrefix="brokerage-movement-pill"
                  />
                </div>

                <div>
                  <SearchableDropdown
                    label="Customer Name"
                    required
                    value={formData.customerName}
                    onChange={(value) => {
                      setFormData(prev => ({ ...prev, customerName: value }));
                    }}
                    options={customerOptions}
                    placeholder="Search customer..."
                    fullWidth
                  />
                  {/* ✨ CONTRACT: Detection banner */}
                  <ContractDetectionBanner
                    customerName={formData.customerName}
                    serviceType="Brokerage"
                    onContractDetected={setDetectedContractId}
                  />

                </div>

                {formData.projectNumber && (
                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Project Number
                    </label>
                    <input
                      type="text"
                      name="projectNumber"
                      value={formData.projectNumber}
                      onChange={handleChange}
                      placeholder="Project reference"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={getInputStyle("projectNumber")}
                    />
                  </div>
                )}

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
                      style={getInputStyle("accountOwner")}
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
                      style={getInputStyle("accountHandler")}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Customs Entry Type
                    </label>
                    <input
                      type="text"
                      name="customsEntryType"
                      value={formData.customsEntryType}
                      onChange={handleChange}
                      placeholder="e.g., Formal, Informal"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={getInputStyle("customsEntryType")}
                    />
                  </div>

                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Assessment Type
                    </label>
                    <input
                      type="text"
                      name="assessmentType"
                      value={formData.assessmentType}
                      onChange={handleChange}
                      placeholder="e.g., Green, Yellow, Red"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={getInputStyle("assessmentType")}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Release Type
                    </label>
                    <input
                      type="text"
                      name="releaseType"
                      value={formData.releaseType}
                      onChange={handleChange}
                      placeholder="e.g., Full, Partial"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={getInputStyle("releaseType")}
                    />
                  </div>

                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Declaration Type
                    </label>
                    <input
                      type="text"
                      name="declarationType"
                      value={formData.declarationType}
                      onChange={handleChange}
                      placeholder="e.g., Import, Export"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={getInputStyle("declarationType")}
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
                      style={getInputStyle("quotationReferenceNumber")}
                    />
                  </div>

                  <CustomDropdown
                    label="Status"
                    value={formData.status}
                    onChange={(value) => handleChange({ target: { name: "status", value } } as any)}
                    options={formData.movement === "EXPORT" ? [
                      { value: "Draft", label: "Draft" },
                      { value: "Waiting Arrival", label: "Waiting Arrival" },
                      { value: "Gate In", label: "Gate In" },
                      { value: "Inspected", label: "Inspected" },
                      { value: "Payment", label: "Payment" },
                      { value: "Gate Out", label: "Gate Out" },
                      { value: "Final Assessed", label: "Final Assessed" },
                      { value: "Completed", label: "Completed" },
                      { value: "Cancelled", label: "Cancelled" },
                    ] : [
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

            {/* Brokerage Type Selection */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Package size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Brokerage Type
                </h3>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                {["Standard", "All-Inclusive", "Non-Regular"].map(type => {
                  const isSelected = formData.brokerageType === type;
                  const isHovered = hoveredType === type;
                  
                  let backgroundColor = "var(--theme-bg-surface)";
                  let borderColor = "var(--neuron-ui-border)";
                  let textColor = "var(--neuron-ink-base)";

                  if (isSelected) {
                    backgroundColor = "var(--theme-action-primary-bg)";
                    borderColor = "var(--theme-action-primary-bg)";
                    textColor = "white";
                  } else if (isHovered) {
                    backgroundColor = "var(--theme-bg-surface-tint)";
                    borderColor = "var(--theme-action-primary-bg)";
                  }
                  
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleBrokerageTypeChange(type as any)}
                      onMouseEnter={() => setHoveredType(type)}
                      onMouseLeave={() => setHoveredType(null)}
                      style={{
                        padding: "10px 20px",
                        fontSize: "13px",
                        fontWeight: 500,
                        color: textColor,
                        backgroundColor: backgroundColor,
                        border: `1px solid ${borderColor}`,
                        borderRadius: "6px",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        flex: 1
                      }}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Shipment Details - Conditional based on Brokerage Type */}
            {formData.brokerageType && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Package size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                  <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Shipment Details
                  </h3>
                </div>

                <div className="space-y-4">
                  {/* POD */}
                  <div className="grid grid-cols-2 gap-4">
                    <CustomDropdown
                      label="POD (Port of Discharge)"
                      value={formData.pod || ""}
                      onChange={(value) => handleChange({ target: { name: "pod", value } } as any)}
                      options={[
                        { value: "NAIA", label: "NAIA" },
                        { value: "MICP", label: "MICP" },
                        { value: "POM", label: "POM" },
                      ]}
                      placeholder="Select POD..."
                      fullWidth
                    />

                    <CustomDropdown
                      label="Mode"
                      value={formData.mode || ""}
                      onChange={(value) => handleChange({ target: { name: "mode", value } } as any)}
                      options={[
                        { value: "FCL", label: "FCL" },
                        { value: "LCL", label: "LCL" },
                        { value: "AIR", label: "AIR" },
                        { value: "Multi-modal", label: "Multi-modal" },
                      ]}
                      placeholder="Select Mode..."
                      fullWidth
                    />
                  </div>

                  {/* Cargo Type */}
                  <CustomDropdown
                    label="Cargo Type"
                    value={formData.cargoType || ""}
                    onChange={(value) => handleChange({ target: { name: "cargoType", value } } as any)}
                    options={[
                      { value: "Dry", label: "Dry" },
                      { value: "Reefer", label: "Reefer" },
                      { value: "Breakbulk", label: "Breakbulk" },
                      { value: "RORO", label: "RORO" },
                    ]}
                    placeholder="Select Cargo Type..."
                    fullWidth
                  />

                  {/* All-Inclusive Specific Fields */}
                  {formData.brokerageType === "All-Inclusive" && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                            Country of Origin
                          </label>
                          <input
                            type="text"
                            name="countryOfOrigin"
                            value={formData.countryOfOrigin}
                            onChange={handleChange}
                            placeholder="Enter country of origin"
                            className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                            style={getInputStyle("countryOfOrigin")}
                          />
                        </div>

                        <CustomDropdown
                          label="Preferential Treatment"
                          value={formData.preferentialTreatment || ""}
                          onChange={(value) => handleChange({ target: { name: "preferentialTreatment", value } } as any)}
                          options={[
                            { value: "Form E", label: "Form E" },
                            { value: "Form D", label: "Form D" },
                            { value: "Form AI", label: "Form AI" },
                            { value: "Form AK", label: "Form AK" },
                            { value: "Form JP", label: "Form JP" },
                          ]}
                          placeholder="Select treatment..."
                          fullWidth
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Entry Details */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <FileCheck size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Entry Details
                </h3>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Consignee
                    </label>
                    <ConsigneePicker
                      value={formData.consignee}
                      onChange={(val) => setFormData(prev => ({ ...prev, consignee: val }))}
                      onConsigneeIdChange={(id) => setFormData(prev => ({ ...prev, consignee_id: id }))}
                      customerName={formData.customerName}
                      customerId={customerId}
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={getInputStyle("consignee")}
                    />
                  </div>

                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Account Number
                    </label>
                    <input
                      type="text"
                      name="accountNumber"
                      value={formData.accountNumber}
                      onChange={handleChange}
                      placeholder="Account number"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={getInputStyle("accountNumber")}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <MultiInputField
                    label="Registry Number"
                    value={formData.registryNumber}
                    onChange={(v) => setFormData(prev => ({ ...prev, registryNumber: v }))}
                    placeholder="Registry number"
                    addButtonText="Add Registry"
                    inputStyle={getInputStyle("registryNumber")}
                  />

                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Entry Number
                    </label>
                    <input
                      type="text"
                      name="entryNumber"
                      value={formData.entryNumber}
                      onChange={handleChange}
                      placeholder="Entry number"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={getInputStyle("entryNumber")}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <MultiInputField
                    label={formData.movement === "EXPORT" ? "Booking Confirmation No." : "MBL/MAWB"}
                    value={formData.movement === "EXPORT" ? (formData.bookingConfirmationNumber || "") : formData.mblMawb}
                    onChange={(v) => setFormData(prev => ({
                      ...prev,
                      [formData.movement === "EXPORT" ? "bookingConfirmationNumber" : "mblMawb"]: v
                    }))}
                    placeholder={formData.movement === "EXPORT" ? "Booking confirmation number" : "Master bill of lading"}
                    addButtonText={formData.movement === "EXPORT" ? "Add Confirmation No." : "Add MBL/MAWB"}
                    inputStyle={getInputStyle(formData.movement === "EXPORT" ? "bookingConfirmationNumber" : "mblMawb")}
                  />

                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      HBL/HAWB
                    </label>
                    <input
                      type="text"
                      name="hblHawb"
                      value={formData.hblHawb}
                      onChange={handleChange}
                      placeholder="House bill of lading"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={getInputStyle("hblHawb")}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Invoice Number
                    </label>
                    <input
                      type="text"
                      name="invoiceNumber"
                      value={formData.invoiceNumber}
                      onChange={handleChange}
                      placeholder="Invoice number"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={getInputStyle("invoiceNumber")}
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
                      placeholder="e.g., USD 50,000"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={getInputStyle("invoiceValue")}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Shipment Origin
                    </label>
                    <input
                      type="text"
                      name="shipmentOrigin"
                      value={formData.shipmentOrigin}
                      onChange={handleChange}
                      placeholder="Origin country"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={getInputStyle("shipmentOrigin")}
                    />
                  </div>

                  {formData.movement === "EXPORT" ? (
                    <div>
                      <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                        LCT (Last Cargo Time)
                      </label>
                      <input
                        type="datetime-local"
                        name="lct"
                        value={formData.lct}
                        onChange={handleChange}
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={getInputStyle("lct")}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                        Release Date
                      </label>
                      <input
                        type="date"
                        name="releaseDate"
                        value={formData.releaseDate}
                        onChange={handleChange}
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={getInputStyle("releaseDate")}
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Broker
                    </label>
                    <input
                      type="text"
                      name="broker"
                      value={formData.broker}
                      onChange={handleChange}
                      placeholder="Broker name"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={getInputStyle("broker")}
                    />
                  </div>
                </div>

                <div>
                  <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                    Delivery Address
                  </label>
                  <textarea
                    name="deliveryAddress"
                    value={formData.deliveryAddress}
                    onChange={handleChange}
                    rows={2}
                    placeholder="Enter delivery address"
                    className="w-full px-3.5 py-2.5 rounded-lg text-[13px] resize-none"
                    style={getInputStyle("deliveryAddress")}
                  />
                </div>
              </div>
            </div>

            {/* Export FCL Specific Fields */}
            {formData.movement === "EXPORT" && formData.mode === "FCL" && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Package size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                  <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    FCL Details
                  </h3>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                        Tare Weight
                      </label>
                      <input
                        type="text"
                        name="tareWeight"
                        value={formData.tareWeight}
                        onChange={handleChange}
                        placeholder="Tare weight"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={getInputStyle("tareWeight")}
                      />
                    </div>

                    <div>
                      <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                        VGM (Verified Gross Mass)
                      </label>
                      <input
                        type="text"
                        name="vgm"
                        value={formData.vgm}
                        onChange={handleChange}
                        placeholder="VGM"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={getInputStyle("vgm")}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                        Trucking Name
                      </label>
                      <input
                        type="text"
                        name="truckingName"
                        value={formData.truckingName}
                        onChange={handleChange}
                        placeholder="Trucking company"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={getInputStyle("truckingName")}
                      />
                    </div>

                    <div>
                      <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                        Plate Number
                      </label>
                      <input
                        type="text"
                        name="plateNumber"
                        value={formData.plateNumber}
                        onChange={handleChange}
                        placeholder="Vehicle plate number"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={getInputStyle("plateNumber")}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Collection Address (For Empties/Cargo)
                    </label>
                    <textarea
                      name="pickupLocation"
                      value={formData.pickupLocation}
                      onChange={handleChange}
                      rows={2}
                      placeholder="Address to pick up empties or cargo"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px] resize-none"
                      style={getInputStyle("pickupLocation")}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Commodity & Charges */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <FileText size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Commodity & Charges
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
                    placeholder="Describe the commodity"
                    className="w-full px-3.5 py-2.5 rounded-lg text-[13px] resize-none"
                    style={getInputStyle("commodityDescription")}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      HS Code
                    </label>
                    <input
                      type="text"
                      name="hsCode"
                      value={formData.hsCode}
                      onChange={handleChange}
                      placeholder="Harmonized System code"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={getInputStyle("hsCode")}
                    />
                  </div>

                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Duty Rate
                    </label>
                    <input
                      type="text"
                      name="dutyRate"
                      value={formData.dutyRate}
                      onChange={handleChange}
                      placeholder="e.g., 5%"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={getInputStyle("dutyRate")}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      VAT Rate
                    </label>
                    <input
                      type="text"
                      name="vatRate"
                      value={formData.vatRate}
                      onChange={handleChange}
                      placeholder="e.g., 12%"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={getInputStyle("vatRate")}
                    />
                  </div>

                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Other Charges
                    </label>
                    <input
                      type="text"
                      name="otherCharges"
                      value={formData.otherCharges}
                      onChange={handleChange}
                      placeholder="Other charges"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={getInputStyle("otherCharges")}
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
                    style={getInputStyle("remarks")}
                  />
                </div>
              </div>
            </div>

            {/* Team Assignment - Only show when from Pricing */}
            {source === "pricing" && customerId && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Users size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                  <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Team Assignment
                  </h3>
                </div>
                
                <div style={{
                  padding: "20px",
                  backgroundColor: "var(--theme-bg-page)",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "8px"
                }}>
                  <TeamAssignmentForm
                    serviceType={serviceType as any}
                    customerId={customerId}
                    onChange={setTeamAssignment}
                  />
                </div>
              </div>
            )}
    </BookingCreationPanel>
  );
}