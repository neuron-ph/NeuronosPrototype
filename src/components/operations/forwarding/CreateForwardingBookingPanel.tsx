import { Package, Ship, Box, Warehouse, Link as LinkIcon, Users } from "lucide-react";
import { useState, useEffect } from "react";
import type { ForwardingBooking, ExecutionStatus } from "../../../types/operations";
import type { Project } from "../../../types/pricing";
import { supabase } from "../../../utils/supabase/client";
import { toast } from "../../ui/toast-utils";
import { ProjectAutofillSection } from "../shared/ProjectAutofillSection";
import { ServicesMultiSelect } from "../shared/ServicesMultiSelect";
import { autofillForwardingFromProject, linkBookingToProject } from "../../../utils/projectAutofill";
import { TeamAssignmentForm, type TeamAssignment } from "../../pricing/TeamAssignmentForm";
import type { User } from "../../../hooks/useUser";
import { CustomDropdown } from "../../bd/CustomDropdown";
import { SearchableDropdown } from "../../shared/SearchableDropdown";
import { MovementToggle } from "../shared/MovementToggle";
import { ContractDetectionBanner } from "../shared/ContractDetectionBanner";
import { MultiInputField } from "../../shared/MultiInputField";
import { BookingCreationPanel } from "../shared/BookingCreationPanel";
import { useCustomerOptions } from "../shared/useCustomerOptions";
import { ConsigneePicker } from "../../shared/ConsigneePicker";
import { logCreation } from "../../../utils/activityLog";

interface CreateForwardingBookingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onBookingCreated: (bookingData?: any) => void; // Updated to accept optional booking data
  currentUser?: { id?: string; name: string; email: string; department: string } | null;
  prefillData?: any; // NEW: For auto-fill from project
  source?: "operations" | "pricing"; // NEW: Indicates where the panel is being used
  customerId?: string; // NEW: For team assignment
  serviceType?: string; // NEW: For team assignment
}


export function CreateForwardingBookingPanel({
  isOpen,
  onClose,
  onBookingCreated,
  currentUser,
  prefillData,
  source = "operations",
  customerId,
  serviceType = "Forwarding",
}: CreateForwardingBookingPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingNumber, setBookingNumber] = useState("");
  const [projectNumber, setProjectNumber] = useState("");
  const [fetchedProject, setFetchedProject] = useState<Project | null>(null);
  const [teamAssignment, setTeamAssignment] = useState<TeamAssignment | null>(null);
  
  // ✨ CONTRACT: Detected contract ID for auto-linking
  const [detectedContractId, setDetectedContractId] = useState<string | null>(null);
  const customerOptions = useCustomerOptions(isOpen);
  
  // General Information
  const [customerName, setCustomerName] = useState("");
  const [movement, setMovement] = useState<"IMPORT" | "EXPORT">("IMPORT");
  const [accountOwner, setAccountOwner] = useState(currentUser?.name || "");
  const [accountHandler, setAccountHandler] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [subServices, setSubServices] = useState<string[]>([]);
  const [mode, setMode] = useState<"FCL" | "LCL" | "AIR">("FCL");
  const [typeOfEntry, setTypeOfEntry] = useState("");
  const [cargoType, setCargoType] = useState("");
  const [stackability, setStackability] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [quotationReferenceNumber, setQuotationReferenceNumber] = useState("");
  const [status, setStatus] = useState<ExecutionStatus>("Draft");
  
  // Expected Volume
  const [qty20ft, setQty20ft] = useState("");
  const [qty40ft, setQty40ft] = useState("");
  const [qty45ft, setQty45ft] = useState("");
  const [volumeGrossWeight, setVolumeGrossWeight] = useState("");
  const [volumeDimensions, setVolumeDimensions] = useState("");
  const [volumeChargeableWeight, setVolumeChargeableWeight] = useState("");

  // Status-dependent fields
  const [pendingReason, setPendingReason] = useState("");
  const [completionDate, setCompletionDate] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancelledDate, setCancelledDate] = useState("");

  // Shipment Information
  const [consignee, setConsignee] = useState("");
  const [consigneeId, setConsigneeId] = useState<string | undefined>(undefined);
  const [shipper, setShipper] = useState("");
  const [mblMawb, setMblMawb] = useState("");
  const [hblHawb, setHblHawb] = useState("");
  const [registryNumber, setRegistryNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [aolPol, setAolPol] = useState("");
  const [aodPod, setAodPod] = useState("");
  const [forwarder, setForwarder] = useState("");
  const [commodityDescription, setCommodityDescription] = useState("");
  const [countryOfOrigin, setCountryOfOrigin] = useState("");
  const [preferentialTreatment, setPreferentialTreatment] = useState("");
  const [grossWeight, setGrossWeight] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [eta, setEta] = useState("");

  // Export Specific Fields
  const [incoterms, setIncoterms] = useState("");
  const [cargoNature, setCargoNature] = useState("");
  const [bookingReferenceNumber, setBookingReferenceNumber] = useState("");
  const [lct, setLct] = useState("");
  const [transitTime, setTransitTime] = useState("");
  const [route, setRoute] = useState("");
  const [tareWeight, setTareWeight] = useState("");
  const [vgm, setVgm] = useState("");
  const [truckingName, setTruckingName] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [warehouseAddress, setWarehouseAddress] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");

  // FCL-specific
  const [containerNumbers, setContainerNumbers] = useState("");
  const [containerDeposit, setContainerDeposit] = useState(false);
  const [emptyReturn, setEmptyReturn] = useState("");
  const [detDemValidity, setDetDemValidity] = useState("");
  const [storageValidity, setStorageValidity] = useState("");
  const [croAvailability, setCroAvailability] = useState("");

  // LCL/AIR-specific
  const [warehouseLocation, setWarehouseLocation] = useState("");

  // Apply prefill data when component mounts or prefillData changes
  useEffect(() => {
    if (prefillData && source === "pricing") {
      // Auto-populate fields from prefillData
      if (prefillData.customerName) setCustomerName(prefillData.customerName);
      if (prefillData.movement) setMovement(prefillData.movement);
      if (prefillData.projectNumber) setProjectNumber(prefillData.projectNumber);
      if (prefillData.quotationReferenceNumber) setQuotationReferenceNumber(prefillData.quotationReferenceNumber);
      if (prefillData.commodityDescription) setCommodityDescription(prefillData.commodityDescription);
      if (prefillData.deliveryAddress) setDeliveryAddress(prefillData.deliveryAddress);
      if (prefillData.aolPol) setAolPol(prefillData.aolPol);
      if (prefillData.aodPod) setAodPod(prefillData.aodPod);
      if (prefillData.cargoType) setCargoType(prefillData.cargoType);
      if (prefillData.mode) setMode(prefillData.mode as "FCL" | "LCL" | "AIR");
    }
  }, [prefillData, source]);

  const handleProjectAutofill = (project: Project) => {
    setFetchedProject(project);
    
    // Autofill fields from project
    const autofilled = autofillForwardingFromProject(project);
    
    setCustomerName(autofilled.customerName || "");
    if (autofilled.movement) setMovement(autofilled.movement);
    setQuotationReferenceNumber(autofilled.quotationReferenceNumber || "");
    setCommodityDescription(autofilled.commodityDescription || "");
    setDeliveryAddress(autofilled.deliveryAddress || "");
    setAolPol(autofilled.aolPol || "");
    setAodPod(autofilled.aodPod || "");
    
    if (autofilled.cargoType) {
      setCargoType(autofilled.cargoType);
    }
    
    if (autofilled.mode) {
      setMode(autofilled.mode as "FCL" | "LCL" | "AIR");
    }
    
    toast.success(`Autofilled from project ${project.project_number}`);
  };

  const validateForm = () => {
    if (!customerName) {
      toast.error("Customer Name is required");
      return false;
    }
    if (!consignee) {
      toast.error("Consignee is required");
      return false;
    }
    if (!aolPol) {
      toast.error("Port of Loading is required");
      return false;
    }
    if (!aodPod) {
      toast.error("Port of Discharge is required");
      return false;
    }

    // If from Pricing module, require team assignments
    if (source === "pricing" && !teamAssignment) {
      toast.error("Please complete team assignments");
      return false;
    }

    if (status === "Pending" && !pendingReason) {
      toast.error("Pending Reason is required for Pending status");
      return false;
    }
    if (status === "Completed" && !completionDate) {
      toast.error("Completion Date is required for Completed status");
      return false;
    }
    if (status === "Cancelled") {
      if (!cancellationReason) {
        toast.error("Cancellation Reason is required for Cancelled status");
        return false;
      }
      if (!cancelledDate) {
        toast.error("Cancelled Date is required for Cancelled status");
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const autoBookingNumber = bookingNumber.trim() || `FWD-${Date.now()}`;

      const details: Record<string, any> = {
        project_number: projectNumber || undefined,
        account_owner: accountOwner,
        account_handler: accountHandler,
        services,
        sub_services: subServices,
        type_of_entry: typeOfEntry,
        cargo_type: cargoType,
        stackability,
        delivery_address: deliveryAddress,
        quotation_reference_number: quotationReferenceNumber,
        consignee,
        consignee_id: consigneeId,
        shipper,
        mbl_mawb: mblMawb,
        hbl_hawb: hblHawb,
        registry_number: registryNumber,
        carrier,
        aol_pol: aolPol,
        aod_pod: aodPod,
        forwarder,
        commodity_description: commodityDescription,
        country_of_origin: countryOfOrigin,
        preferential_treatment: preferentialTreatment,
        gross_weight: grossWeight,
        dimensions,
        eta,
        pending_reason: status === "Pending" ? pendingReason : undefined,
        completion_date: status === "Completed" ? completionDate : undefined,
        cancellation_reason: status === "Cancelled" ? cancellationReason : undefined,
        cancelled_date: status === "Cancelled" ? cancelledDate : undefined,
        ...(movement === "EXPORT" && {
          incoterms,
          cargo_nature: cargoNature,
          booking_reference_number: bookingReferenceNumber,
          lct,
          transit_time: transitTime,
          route,
        }),
        ...(movement === "EXPORT" && mode === "FCL" && {
          tare_weight: tareWeight,
          vgm,
          trucking_name: truckingName,
          plate_number: plateNumber,
          warehouse_address: warehouseAddress,
          pickup_location: pickupLocation,
        }),
        ...(mode === "FCL" && {
          container_numbers: containerNumbers.split(",").map((c: string) => c.trim()).filter(Boolean),
          container_deposit: containerDeposit,
          empty_return: emptyReturn,
          det_dem_validity: detDemValidity,
          storage_validity: storageValidity,
          cro_availability: croAvailability,
          qty_20ft: qty20ft,
          qty_40ft: qty40ft,
          qty_45ft: qty45ft,
          volume_gross_weight: volumeGrossWeight,
          volume_dimensions: volumeDimensions,
          volume_chargeable_weight: volumeChargeableWeight,
        }),
        ...((mode === "LCL" || mode === "AIR") && {
          warehouse_location: warehouseLocation,
        }),
      };

      const insertPayload: Record<string, any> = {
        id: crypto.randomUUID(),
        booking_number: autoBookingNumber,
        service_type: 'Forwarding',
        customer_name: customerName,
        movement_type: movement,
        mode,
        status,
        details,
        ...(fetchedProject?.id && { project_id: fetchedProject.id }),
        ...(detectedContractId && { contract_id: detectedContractId }),
      };

      if (source === "pricing" && teamAssignment) {
        insertPayload.manager_id = teamAssignment.manager.id;
        insertPayload.manager_name = teamAssignment.manager.name;
        if (teamAssignment.supervisor) {
          insertPayload.supervisor_id = teamAssignment.supervisor.id;
          insertPayload.supervisor_name = teamAssignment.supervisor.name;
        }
        if (teamAssignment.handler) {
          insertPayload.handler_id = teamAssignment.handler.id;
          insertPayload.handler_name = teamAssignment.handler.name;
        }
      }

      const { data: createdBooking, error } = await supabase.from('bookings').insert(insertPayload).select().single();

      if (error) throw new Error(error.message);

      if (fetchedProject && projectNumber) {
        try {
          await linkBookingToProject(
            fetchedProject.id,
            createdBooking.id,
            createdBooking.booking_number,
            "Forwarding",
            createdBooking.status,
          );
        } catch (linkError) {
          console.error("Error linking booking to project:", linkError);
        }
      }

      if (source === "pricing" && teamAssignment?.saveAsDefault && customerId) {
        try {
          await supabase.from('client_handler_preferences').upsert({
            client_id: customerId,
            service_type: serviceType,
            preferred_supervisor_id: teamAssignment.supervisor?.id,
            preferred_handler_id: teamAssignment.handler?.id,
          });
        } catch (prefError) {
          console.error("Error saving team preference:", prefError);
        }
      }

      logCreation("booking", createdBooking.id, createdBooking.booking_number ?? createdBooking.id, { id: currentUser?.id ?? "", name: currentUser?.name ?? "", department: currentUser?.department ?? "" });
      toast.success(`Forwarding booking ${createdBooking.booking_number} created successfully`);
      onBookingCreated(createdBooking);
      onClose();
    } catch (error) {
      console.error('Error creating booking:', error);
      toast.error('Unable to create booking');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  if (!isOpen) return null;

  const isFormValid = customerName.trim() !== "" &&
    consignee.trim() !== "" &&
    aolPol.trim() !== "" &&
    aodPod.trim() !== "" &&
    (source === "operations" || (source === "pricing" && teamAssignment !== null));

  return (
    <BookingCreationPanel
      isOpen={isOpen}
      onClose={handleClose}
      icon={<Ship size={20} />}
      title="New Forwarding Booking"
      subtitle="Create a new freight forwarding booking for shipment management"
      formId="create-forwarding-form"
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      isFormValid={isFormValid}
      submitLabel="Create Booking"
      submitIcon={<Ship size={16} />}
    >
            {/* Project Reference - Autofill Section - Only show when from Operations */}
            {source === "operations" && (
              <ProjectAutofillSection
                projectNumber={projectNumber}
                onProjectNumberChange={setProjectNumber}
                onAutofill={handleProjectAutofill}
                serviceType="Forwarding"
              />
            )}

            {/* Booking Number */}
            <div className="mb-8">
              <label
                className="block mb-1.5"
                style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
              >
                Booking Number (Auto-generated)
              </label>
              <input
                type="text"
                value={bookingNumber}
                onChange={(e) => setBookingNumber(e.target.value)}
                placeholder="Leave blank for auto-generation or enter custom"
                className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                style={{
                  border: "1px solid var(--neuron-ui-border)",
                  backgroundColor: "var(--theme-bg-surface)",
                  color: "var(--neuron-ink-primary)",
                }}
              />
              <p className="text-xs mt-1" style={{ color: "var(--theme-text-muted)" }}>
                Leave blank to auto-generate (e.g., FWD-2025-001) or enter a custom booking number
              </p>
            </div>

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
                    value={movement}
                    onChange={setMovement}
                    layoutIdPrefix="forwarding-movement-pill"
                  />
                </div>

                <div>
                  <SearchableDropdown
                    label="Customer Name"
                    required
                    value={customerName}
                    onChange={(value) => setCustomerName(value)}
                    options={customerOptions}
                    placeholder="Search customer..."
                    fullWidth
                  />
                  {/* ✨ CONTRACT: Detection banner */}
                  <ContractDetectionBanner
                    customerName={customerName}
                    serviceType="Forwarding"
                    onContractDetected={setDetectedContractId}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                    >
                      Account Owner
                    </label>
                    <input
                      type="text"
                      value={accountOwner}
                      onChange={(e) => setAccountOwner(e.target.value)}
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
                    <label
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                    >
                      Account Handler
                    </label>
                    <input
                      type="text"
                      value={accountHandler}
                      onChange={(e) => setAccountHandler(e.target.value)}
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

                {/* Services/Sub-services Multi-select */}
                <div className="grid grid-cols-2 gap-4">
                  <ServicesMultiSelect
                    label="Services"
                    selectedServices={services}
                    onServicesChange={setServices}
                    availableServices={[
                      "Freight Forwarding",
                      "Documentation",
                      "Cargo Insurance",
                      "Port Handling",
                      "Custom Clearance",
                    ]}
                    placeholder="Select services..."
                  />
                  
                  <ServicesMultiSelect
                    label="Sub-services"
                    selectedServices={subServices}
                    onServicesChange={setSubServices}
                    availableServices={[
                      "Door-to-Door",
                      "Port-to-Port",
                      "Warehouse Storage",
                      "Container Stuffing",
                      "Palletization",
                    ]}
                    placeholder="Select sub-services..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <CustomDropdown
                    label="Mode"
                    value={mode}
                    onChange={(value) => setMode(value as "FCL" | "LCL" | "AIR")}
                    options={[
                      { value: "FCL", label: "FCL" },
                      { value: "LCL", label: "LCL" },
                      { value: "AIR", label: "AIR" },
                    ]}
                    placeholder="Select Mode..."
                    fullWidth
                  />

                  <div>
                    <label
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                    >
                      Type of Entry
                    </label>
                    <input
                      type="text"
                      value={typeOfEntry}
                      onChange={(e) => setTypeOfEntry(e.target.value)}
                      placeholder="e.g., Import, Export"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>
                </div>

                {movement === "EXPORT" && (
                  <div className="grid grid-cols-2 gap-4">
                    <CustomDropdown
                      label="Incoterms"
                      value={incoterms}
                      onChange={setIncoterms}
                      options={[
                        { value: "EXW", label: "EXW - Ex Works" },
                        { value: "FCA", label: "FCA - Free Carrier" },
                        { value: "CPT", label: "CPT - Carriage Paid To" },
                        { value: "CIP", label: "CIP - Carriage and Insurance Paid To" },
                        { value: "DAP", label: "DAP - Delivered at Place" },
                        { value: "DPU", label: "DPU - Delivered at Place Unloaded" },
                        { value: "DDP", label: "DDP - Delivered Duty Paid" },
                        { value: "FAS", label: "FAS - Free Alongside Ship" },
                        { value: "FOB", label: "FOB - Free on Board" },
                        { value: "CFR", label: "CFR - Cost and Freight" },
                        { value: "CIF", label: "CIF - Cost, Insurance and Freight" },
                      ]}
                      placeholder="Select Incoterms..."
                      fullWidth
                    />

                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        Cargo Nature
                      </label>
                      <input
                        type="text"
                        value={cargoNature}
                        onChange={(e) => setCargoNature(e.target.value)}
                        placeholder="e.g. Hazardous, Perishable"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                  >
                    Cargo Type
                  </label>
                  <input
                    type="text"
                    value={cargoType}
                    onChange={(e) => setCargoType(e.target.value)}
                    placeholder="e.g., General, Hazardous"
                    className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "var(--theme-bg-surface)",
                      color: "var(--neuron-ink-primary)",
                    }}
                  />
                </div>

                <div>
                  <label
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                  >
                    Stackability
                  </label>
                  <input
                    type="text"
                    value={stackability}
                    onChange={(e) => setStackability(e.target.value)}
                    placeholder="e.g., Stackable, Non-Stackable"
                    className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "var(--theme-bg-surface)",
                      color: "var(--neuron-ink-primary)",
                    }}
                  />
                </div>

                <div>
                  <label
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                  >
                    Delivery Address
                  </label>
                  <textarea
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    rows={2}
                    placeholder="Enter delivery address"
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
                    <label
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                    >
                      Quotation Reference
                    </label>
                    <input
                      type="text"
                      value={quotationReferenceNumber}
                      onChange={(e) => setQuotationReferenceNumber(e.target.value)}
                      placeholder="Quotation reference number"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>

                  <div>
                    <CustomDropdown
                      label="Status"
                      value={status}
                      onChange={(value) => setStatus(value as ExecutionStatus)}
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

                {/* Status-dependent fields */}
                {status === "Pending" && (
                  <div>
                    <label
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                    >
                      Pending Reason <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>
                    </label>
                    <textarea
                      required
                      value={pendingReason}
                      onChange={(e) => setPendingReason(e.target.value)}
                      rows={2}
                      placeholder="Explain why this booking is pending..."
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px] resize-none"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>
                )}

                {status === "Completed" && (
                  <div>
                    <label
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                    >
                      Completion Date <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={completionDate}
                      onChange={(e) => setCompletionDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>
                )}

                {status === "Cancelled" && (
                  <>
                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        Cancellation Reason <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>
                      </label>
                      <textarea
                        required
                        value={cancellationReason}
                        onChange={(e) => setCancellationReason(e.target.value)}
                        rows={2}
                        placeholder="Explain why this booking was cancelled..."
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px] resize-none"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>
                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        Cancelled Date <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={cancelledDate}
                        onChange={(e) => setCancelledDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Expected Volume */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Box size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Expected Volume
                </h3>
              </div>

              <div className="space-y-4">
                {mode === "FCL" && (
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        20ft Quantity
                      </label>
                      <input
                        type="text"
                        value={qty20ft}
                        onChange={(e) => setQty20ft(e.target.value)}
                        placeholder="e.g., 2"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>

                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        40ft Quantity
                      </label>
                      <input
                        type="text"
                        value={qty40ft}
                        onChange={(e) => setQty40ft(e.target.value)}
                        placeholder="e.g., 1"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>

                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        45ft Quantity
                      </label>
                      <input
                        type="text"
                        value={qty45ft}
                        onChange={(e) => setQty45ft(e.target.value)}
                        placeholder="e.g., 0"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>
                  </div>
                )}

                {(mode === "LCL" || mode === "AIR") && (
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        Gross Weight (kg)
                      </label>
                      <input
                        type="text"
                        value={volumeGrossWeight}
                        onChange={(e) => setVolumeGrossWeight(e.target.value)}
                        placeholder="e.g., 1000"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>

                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        {mode === "LCL" ? "Dimensions (CBM)" : "Chargeable Weight (kg)"}
                      </label>
                      <input
                        type="text"
                        value={mode === "LCL" ? volumeDimensions : volumeChargeableWeight}
                        onChange={(e) => mode === "LCL" ? setVolumeDimensions(e.target.value) : setVolumeChargeableWeight(e.target.value)}
                        placeholder={mode === "LCL" ? "e.g., 10" : "e.g., 1200"}
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Shipment Information */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Ship size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Shipment Information
                </h3>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                    >
                      Consignee
                    </label>
                    <ConsigneePicker
                      value={consignee}
                      onChange={setConsignee}
                      onConsigneeIdChange={setConsigneeId}
                      customerName={customerName}
                      customerId={customerId}
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                    >
                      Shipper
                    </label>
                    <input
                      type="text"
                      value={shipper}
                      onChange={(e) => setShipper(e.target.value)}
                      placeholder="Shipper name"
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
                  <MultiInputField
                    label={movement === "EXPORT" ? "Booking Reference No." : "MBL/MAWB"}
                    value={movement === "EXPORT" ? bookingReferenceNumber : mblMawb}
                    onChange={(v) => movement === "EXPORT" ? setBookingReferenceNumber(v) : setMblMawb(v)}
                    placeholder={movement === "EXPORT" ? "Booking reference" : "Master bill of lading"}
                    addButtonText={movement === "EXPORT" ? "Add Reference No." : "Add MBL/MAWB"}
                    inputStyle={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "var(--theme-bg-surface)",
                      color: "var(--neuron-ink-primary)",
                    }}
                  />

                  <div>
                    <label
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                    >
                      HBL/HAWB
                    </label>
                    <input
                      type="text"
                      value={hblHawb}
                      onChange={(e) => setHblHawb(e.target.value)}
                      placeholder="House bill of lading"
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
                    <label
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                    >
                      Registry Number
                    </label>
                    <input
                      type="text"
                      value={registryNumber}
                      onChange={(e) => setRegistryNumber(e.target.value)}
                      placeholder="Registry number"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                    >
                      Carrier
                    </label>
                    <input
                      type="text"
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value)}
                      placeholder="Carrier name"
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
                    <label
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                    >
                      AOL/POL
                    </label>
                    <input
                      type="text"
                      value={aolPol}
                      onChange={(e) => setAolPol(e.target.value)}
                      placeholder="Airport/Port of Loading"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                    >
                      AOD/POD
                    </label>
                    <input
                      type="text"
                      value={aodPod}
                      onChange={(e) => setAodPod(e.target.value)}
                      placeholder="Airport/Port of Discharge"
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
                    <label
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                    >
                      Forwarder
                    </label>
                    <input
                      type="text"
                      value={forwarder}
                      onChange={(e) => setForwarder(e.target.value)}
                      placeholder="Forwarder name"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                    >
                      Country of Origin
                    </label>
                    <input
                      type="text"
                      value={countryOfOrigin}
                      onChange={(e) => setCountryOfOrigin(e.target.value)}
                      placeholder="Country of origin"
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
                  <label
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                  >
                    Commodity Description
                  </label>
                  <textarea
                    value={commodityDescription}
                    onChange={(e) => setCommodityDescription(e.target.value)}
                    rows={2}
                    placeholder="Describe the commodity"
                    className="w-full px-3.5 py-2.5 rounded-lg text-[13px] resize-none"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "var(--theme-bg-surface)",
                      color: "var(--neuron-ink-primary)",
                    }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                    >
                      Preferential Treatment
                    </label>
                    <input
                      type="text"
                      value={preferentialTreatment}
                      onChange={(e) => setPreferentialTreatment(e.target.value)}
                      placeholder="e.g., GSP"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                    >
                      Gross Weight
                    </label>
                    <input
                      type="text"
                      value={grossWeight}
                      onChange={(e) => setGrossWeight(e.target.value)}
                      placeholder="e.g., 1000 kg"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                    >
                      Dimensions
                    </label>
                    <input
                      type="text"
                      value={dimensions}
                      onChange={(e) => setDimensions(e.target.value)}
                      placeholder="e.g., 10x5x3 m"
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
                    <label
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                    >
                      ETA (Estimated Time of Arrival)
                    </label>
                    <input
                      type="date"
                      value={eta}
                      onChange={(e) => setEta(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>

                  {movement === "EXPORT" && (
                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        LCT (Last Cargo Time)
                      </label>
                      <input
                        type="datetime-local"
                        value={lct}
                        onChange={(e) => setLct(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>
                  )}
                </div>

                {movement === "EXPORT" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        Transit Time
                      </label>
                      <input
                        type="text"
                        value={transitTime}
                        onChange={(e) => setTransitTime(e.target.value)}
                        placeholder="e.g., 25 days"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>

                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        Route
                      </label>
                      <input
                        type="text"
                        value={route}
                        onChange={(e) => setRoute(e.target.value)}
                        placeholder="e.g., Direct / Transshipment"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* FCL Container Details */}
            {mode === "FCL" && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Box size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                  <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Container Details (FCL)
                  </h3>
                </div>

                <div className="space-y-4">
                  {movement === "EXPORT" && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label
                            className="block mb-1.5"
                            style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                          >
                            Tare Weight
                          </label>
                          <input
                            type="text"
                            value={tareWeight}
                            onChange={(e) => setTareWeight(e.target.value)}
                            placeholder="Tare weight"
                            className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                            style={{
                              border: "1px solid var(--neuron-ui-border)",
                              backgroundColor: "var(--theme-bg-surface)",
                              color: "var(--neuron-ink-primary)",
                            }}
                          />
                        </div>

                        <div>
                          <label
                            className="block mb-1.5"
                            style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                          >
                            VGM
                          </label>
                          <input
                            type="text"
                            value={vgm}
                            onChange={(e) => setVgm(e.target.value)}
                            placeholder="Verified Gross Mass"
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
                          <label
                            className="block mb-1.5"
                            style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                          >
                            Trucking Name
                          </label>
                          <input
                            type="text"
                            value={truckingName}
                            onChange={(e) => setTruckingName(e.target.value)}
                            placeholder="Trucking company"
                            className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                            style={{
                              border: "1px solid var(--neuron-ui-border)",
                              backgroundColor: "var(--theme-bg-surface)",
                              color: "var(--neuron-ink-primary)",
                            }}
                          />
                        </div>

                        <div>
                          <label
                            className="block mb-1.5"
                            style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                          >
                            Plate Number
                          </label>
                          <input
                            type="text"
                            value={plateNumber}
                            onChange={(e) => setPlateNumber(e.target.value)}
                            placeholder="Vehicle plate number"
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
                        <label
                          className="block mb-1.5"
                          style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                        >
                          Warehouse Address
                        </label>
                        <textarea
                          value={warehouseAddress}
                          onChange={(e) => setWarehouseAddress(e.target.value)}
                          rows={2}
                          placeholder="Warehouse address"
                          className="w-full px-3.5 py-2.5 rounded-lg text-[13px] resize-none"
                          style={{
                            border: "1px solid var(--neuron-ui-border)",
                            backgroundColor: "var(--theme-bg-surface)",
                            color: "var(--neuron-ink-primary)",
                          }}
                        />
                      </div>
                      
                      {incoterms === "EXW" && (
                        <div>
                          <label
                            className="block mb-1.5"
                            style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                          >
                            Collection Address (EXW)
                          </label>
                          <textarea
                            value={pickupLocation}
                            onChange={(e) => setPickupLocation(e.target.value)}
                            rows={2}
                            placeholder="Address for pickup"
                            className="w-full px-3.5 py-2.5 rounded-lg text-[13px] resize-none"
                            style={{
                              border: "1px solid var(--neuron-ui-border)",
                              backgroundColor: "var(--theme-bg-surface)",
                              color: "var(--neuron-ink-primary)",
                            }}
                          />
                        </div>
                      )}
                    </>
                  )}

                  <MultiInputField
                    label="Container Number/s"
                    value={containerNumbers}
                    onChange={(v) => setContainerNumbers(v)}
                    placeholder="Container number"
                    addButtonText="Add Container"
                    inputStyle={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "var(--theme-bg-surface)",
                      color: "var(--neuron-ink-primary)",
                    }}
                  />

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="containerDeposit"
                      checked={containerDeposit}
                      onChange={(e) => setContainerDeposit(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <label
                      htmlFor="containerDeposit"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)", cursor: "pointer" }}
                    >
                      Container Deposit Required
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        Empty Return
                      </label>
                      <input
                        type="text"
                        value={emptyReturn}
                        onChange={(e) => setEmptyReturn(e.target.value)}
                        placeholder="Empty return location"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>

                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        Det/Dem Validity
                      </label>
                      <input
                        type="date"
                        value={detDemValidity}
                        onChange={(e) => setDetDemValidity(e.target.value)}
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
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        Storage Validity
                      </label>
                      <input
                        type="date"
                        value={storageValidity}
                        onChange={(e) => setStorageValidity(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>

                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        CRO Availability
                      </label>
                      <input
                        type="date"
                        value={croAvailability}
                        onChange={(e) => setCroAvailability(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        20ft Quantity
                      </label>
                      <input
                        type="text"
                        value={qty20ft}
                        onChange={(e) => setQty20ft(e.target.value)}
                        placeholder="e.g., 2"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>

                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        40ft Quantity
                      </label>
                      <input
                        type="text"
                        value={qty40ft}
                        onChange={(e) => setQty40ft(e.target.value)}
                        placeholder="e.g., 1"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>

                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        45ft Quantity
                      </label>
                      <input
                        type="text"
                        value={qty45ft}
                        onChange={(e) => setQty45ft(e.target.value)}
                        placeholder="e.g., 0"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        Volume Gross Weight
                      </label>
                      <input
                        type="text"
                        value={volumeGrossWeight}
                        onChange={(e) => setVolumeGrossWeight(e.target.value)}
                        placeholder="e.g., 1000 kg"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>

                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        Volume Dimensions
                      </label>
                      <input
                        type="text"
                        value={volumeDimensions}
                        onChange={(e) => setVolumeDimensions(e.target.value)}
                        placeholder="e.g., 10x5x3 m"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>

                    <div>
                      <label
                        className="block mb-1.5"
                        style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                      >
                        Volume Chargeable Weight
                      </label>
                      <input
                        type="text"
                        value={volumeChargeableWeight}
                        onChange={(e) => setVolumeChargeableWeight(e.target.value)}
                        placeholder="e.g., 1000 kg"
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
            )}

            {/* LCL/AIR Warehouse Details */}
            {(mode === "LCL" || mode === "AIR") && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Warehouse size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                  <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Warehouse Details ({mode})
                  </h3>
                </div>

                <div>
                  <label
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                  >
                    Warehouse Location
                  </label>
                  <input
                    type="text"
                    value={warehouseLocation}
                    onChange={(e) => setWarehouseLocation(e.target.value)}
                    placeholder="Warehouse location"
                    className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "var(--theme-bg-surface)",
                      color: "var(--neuron-ink-primary)",
                    }}
                  />
                </div>
              </div>
            )}

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