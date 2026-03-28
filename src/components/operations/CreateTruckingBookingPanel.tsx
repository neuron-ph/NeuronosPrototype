import { supabase } from "../../utils/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "../ui/toast-utils";
import { Plus, X, Truck, MapPin, Package } from "lucide-react";
import { useState } from "react";
import { CustomDropdown } from "../bd/CustomDropdown";
import { SearchableDropdown } from "../shared/SearchableDropdown";
import { MovementToggle } from "./shared/MovementToggle";
import { ContractDetectionBanner } from "./shared/ContractDetectionBanner";
import { MultiInputField } from "../shared/MultiInputField";
import { BookingCreationPanel } from "./shared/BookingCreationPanel";
import { useCustomerOptions } from "./shared/useCustomerOptions";
import type { TruckingLineItem } from "../../types/pricing";
import { normalizeTruckingLineItems, extractContractDestinations } from "../../utils/contractQuantityExtractor";
import { fetchFullContract } from "../../utils/contractLookup";
import { FormComboBox } from "../pricing/quotations/FormComboBox";
import { ConsigneePicker } from "../shared/ConsigneePicker";

interface CreateTruckingBookingPanelProps {
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

export function CreateTruckingBookingPanel({
  isOpen,
  onClose,
  onSuccess,
}: CreateTruckingBookingPanelProps) {
  const [loading, setLoading] = useState(false);
  // ✨ CONTRACT: Detected contract ID for auto-linking
  const [detectedContractId, setDetectedContractId] = useState<string | null>(null);

  // ✨ DESTINATION COMBOBOX: Contract destinations for combobox dropdown
  const { data: contractDestinations = [] } = useQuery({
    queryKey: ["client_handler_preferences", detectedContractId],
    queryFn: async () => {
      if (!detectedContractId) return [];
      try {
        const fullContract = await fetchFullContract(detectedContractId);
        if (fullContract?.rate_matrices) {
          return extractContractDestinations(fullContract.rate_matrices);
        }
        return [];
      } catch (err) {
        console.error("[CreateTruckingBookingPanel] Error fetching contract destinations:", err);
        return [];
      }
    },
    enabled: !!detectedContractId,
    staleTime: 30_000,
  });
  const customerOptions = useCustomerOptions(isOpen);
  // ✨ Multi-line trucking: dispatch line items state
  const [truckingLineItems, setTruckingLineItems] = useState<TruckingLineItem[]>([
    { id: `li-init-${Date.now()}`, destination: "", truckType: "", quantity: 1 },
  ]);
  const [formData, setFormData] = useState({
    customerName: "",
    movement: "IMPORT",
    accountOwner: "",
    accountHandler: "",
    service: "",
    truckType: "",       // @deprecated — synced from first truckingLineItem on submit; kept for backward compat
    mode: "",
    preferredDeliveryDate: "",
    quotationReferenceNumber: "",
    status: "Draft",
    consignee: "",
    consignee_id: undefined as string | undefined,
    driver: "",
    helper: "",
    vehicleReferenceNumber: "",
    pullOut: "",
    deliveryAddress: "", // @deprecated — synced from first truckingLineItem on submit; kept for backward compat
    deliveryInstructions: "",
    dateDelivered: "",
    tabsBooking: "",
    emptyReturn: "",
    cyFee: "No",
    eirAvailability: "",
    earlyGateIn: "No",
    detDemValidity: "",
    storageValidity: "",
    shippingLine: "",
    warehouseAddress: "", // Export
    withGps: false, // Export
    gateIn: "", // Export
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
    if (!formData.consignee) {
      toast.error("Consignee is required");
      return;
    }
    
    setLoading(true);

    try {
      const insertPayload = {
        ...formData,
        trucking_line_items: truckingLineItems.filter(li => li.destination || li.truckType || li.quantity > 0),
        truckType: truckingLineItems[0]?.truckType || formData.truckType,
        deliveryAddress: truckingLineItems[0]?.destination || formData.deliveryAddress,
        ...(detectedContractId && { contract_id: detectedContractId }),
      };
      const { data, error } = await supabase.from('trucking_bookings').insert(insertPayload).select().single();

      if (error) throw new Error(error.message);

      toast.success("Trucking booking created successfully");
      onSuccess?.(data);
      onClose();
    } catch (error) {
      console.error("Error creating trucking booking:", error);
      toast.error("Failed to create booking. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isFormValid = formData.customerName.trim() !== "" && formData.consignee.trim() !== "";

  return (
    <BookingCreationPanel
      isOpen={isOpen}
      onClose={onClose}
      icon={<Truck size={20} />}
      title="New Trucking Booking"
      subtitle="Create a new trucking booking for inland transportation"
      formId="create-trucking-form"
      onSubmit={handleSubmit}
      isSubmitting={loading}
      isFormValid={isFormValid}
      submitLabel="Create Booking"
      submitIcon={<Truck size={16} />}
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
                    layoutIdPrefix="trucking-movement-pill"
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
                    serviceType="Trucking"
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
                      Service
                    </label>
                    <input
                      type="text"
                      name="service"
                      value={formData.service}
                      onChange={handleChange}
                      placeholder="e.g., Container Delivery"
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
                      Mode
                    </label>
                    <input
                      type="text"
                      name="mode"
                      value={formData.mode}
                      onChange={handleChange}
                      placeholder="e.g., FCL, LCL"
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
                    options={formData.movement === "EXPORT" ? [
                      { value: "Gate In (Origin)", label: "Gate In (Origin)" },
                      { value: "Waiting Loading", label: "Waiting Loading" },
                      { value: "Start Loading", label: "Start Loading" },
                      { value: "End Loading", label: "End Loading" },
                      { value: "Gate Out (Origin)", label: "Gate Out (Origin)" },
                      { value: "Ongoing Delivery", label: "Ongoing Delivery" },
                      { value: "Arrived Delivery", label: "Arrived Delivery" },
                      { value: "Gate In (Destination)", label: "Gate In (Destination)" },
                      { value: "Waiting Unloading", label: "Waiting Unloading" },
                      { value: "Ongoing Unloading", label: "Ongoing Unloading" },
                      { value: "Gate Out (Destination)", label: "Gate Out (Destination)" },
                      { value: "Return Empty", label: "Return Empty" },
                      { value: "Gate In (Depot)", label: "Gate In (Depot)" },
                      { value: "Completed", label: "Completed" },
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

            {/* Delivery Details */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <MapPin size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Delivery Details
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
                      Driver
                    </label>
                    <input
                      type="text"
                      name="driver"
                      value={formData.driver}
                      onChange={handleChange}
                      placeholder="Driver name"
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
                      Helper
                    </label>
                    <input
                      type="text"
                      name="helper"
                      value={formData.helper}
                      onChange={handleChange}
                      placeholder="Helper name"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>

                  <MultiInputField
                    label="Vehicle Reference Number"
                    value={formData.vehicleReferenceNumber}
                    onChange={(v) => setFormData(prev => ({ ...prev, vehicleReferenceNumber: v }))}
                    placeholder="Vehicle reference"
                    addButtonText="Add Vehicle Ref."
                    inputStyle={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "var(--theme-bg-surface)",
                      color: "var(--neuron-ink-primary)",
                    }}
                  />
                </div>

                <div>
                  <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                    Pull Out Location
                  </label>
                  <input
                    type="text"
                    name="pullOut"
                    value={formData.pullOut}
                    onChange={handleChange}
                    placeholder="Pull out location"
                    className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "var(--theme-bg-surface)",
                      color: "var(--neuron-ink-primary)",
                    }}
                  />
                </div>

                {/* ✨ Multi-line trucking: Destinations repeater */}
                <div>
                  <label className="block mb-3" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                    Destinations <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>
                  </label>

                  {/* Column headers — only when 2+ rows */}
                  {truckingLineItems.length > 1 && (
                    <div className="grid gap-2 mb-1.5" style={{ gridTemplateColumns: "5fr 3fr 2fr 28px" }}>
                      <span className="text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-wide pl-1">Destination</span>
                      <span className="text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-wide">Truck Type</span>
                      <span className="text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-wide">Qty</span>
                      <span />
                    </div>
                  )}

                  {/* Line item rows */}
                  <div className="space-y-1.5">
                    {truckingLineItems.map((li) => (
                      <div
                        key={li.id}
                        className="grid gap-2 items-center group/row"
                        style={{ gridTemplateColumns: truckingLineItems.length > 1 ? "5fr 3fr 2fr 28px" : "5fr 3fr 2fr" }}
                      >
                        {/* Destination — ComboBox when contract destinations available */}
                        {contractDestinations.length > 0 ? (
                          <FormComboBox
                            value={li.destination}
                            onChange={(value) => setTruckingLineItems(prev =>
                              prev.map(item => item.id === li.id ? { ...item, destination: value } : item)
                            )}
                            options={contractDestinations.map(d => ({ value: d, label: d }))}
                            placeholder="Select or type destination..."
                          />
                        ) : (
                          <input
                            type="text"
                            value={li.destination}
                            onChange={(e) => setTruckingLineItems(prev =>
                              prev.map(item => item.id === li.id ? { ...item, destination: e.target.value } : item)
                            )}
                            placeholder="Delivery address"
                            className="w-full px-3 py-2 rounded-lg text-[13px]"
                            style={{ border: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)", color: "var(--neuron-ink-primary)" }}
                          />
                        )}
                        <input
                          type="text"
                          value={li.truckType}
                          onChange={(e) => setTruckingLineItems(prev =>
                            prev.map(item => item.id === li.id ? { ...item, truckType: e.target.value } : item)
                          )}
                          placeholder="e.g., 40ft"
                          className="w-full px-3 py-2 rounded-lg text-[13px]"
                          style={{ border: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)", color: "var(--neuron-ink-primary)" }}
                        />
                        <input
                          type="number"
                          value={li.quantity || ""}
                          onChange={(e) => setTruckingLineItems(prev =>
                            prev.map(item => item.id === li.id ? { ...item, quantity: parseInt(e.target.value) || 0 } : item)
                          )}
                          placeholder="1"
                          min="0"
                          className="w-full px-2 py-2 rounded-lg text-[13px] text-center"
                          style={{ border: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)", color: "var(--neuron-ink-primary)" }}
                        />
                        {truckingLineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setTruckingLineItems(prev => prev.filter(item => item.id !== li.id))}
                            className="flex items-center justify-center w-7 h-7 rounded-md border border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] opacity-0 group-hover/row:opacity-100 hover:border-[var(--theme-status-danger-border)] hover:text-[var(--theme-status-danger-fg)] hover:bg-[var(--theme-status-danger-bg)] transition-all text-[var(--theme-text-muted)]"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Ghost row — "+ Add destination" */}
                  <button
                    type="button"
                    onClick={() => setTruckingLineItems(prev => [
                      ...prev,
                      { id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, destination: "", truckType: "", quantity: 1 },
                    ])}
                    className="flex items-center justify-center gap-1.5 w-full py-2.5 mt-1.5 rounded-md text-[13px] font-medium text-[var(--theme-text-muted)] bg-transparent border-[1.5px] border-dashed border-[var(--theme-border-default)] cursor-pointer transition-all hover:border-[var(--theme-action-primary-bg)] hover:text-[var(--theme-action-primary-bg)] hover:bg-[var(--theme-bg-surface-tint)]"
                  >
                    <Plus size={14} />
                    Add destination
                  </button>

                  {/* Total summary */}
                  {truckingLineItems.length > 1 && (
                    <div className="text-right mt-1.5 pr-10 text-[12px] text-[var(--theme-text-muted)]">
                      Total: <strong className="text-[var(--theme-text-primary)]">{truckingLineItems.reduce((sum, li) => sum + (li.quantity || 0), 0)}</strong> truck(s)
                    </div>
                  )}
                </div>

                {formData.movement === "EXPORT" && (
                  <>
                    <div>
                      <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                        Warehouse Address
                      </label>
                      <textarea
                        name="warehouseAddress"
                        value={formData.warehouseAddress}
                        onChange={handleChange}
                        rows={2}
                        placeholder="Enter warehouse address"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px] resize-none"
                        style={{
                          border: "1px solid var(--neuron-ui-border)",
                          backgroundColor: "var(--theme-bg-surface)",
                          color: "var(--neuron-ink-primary)",
                        }}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="withGps"
                        name="withGps"
                        checked={formData.withGps}
                        onChange={(e) => setFormData(prev => ({ ...prev, withGps: e.target.checked }))}
                        className="w-4 h-4 text-[var(--theme-action-primary-bg)] border-[var(--theme-border-default)] rounded focus:ring-[#0F766E]"
                      />
                      <label htmlFor="withGps" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                        With GPS
                      </label>
                    </div>
                  </>
                )}

                <div>
                  <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                    Delivery Instructions
                  </label>
                  <textarea
                    name="deliveryInstructions"
                    value={formData.deliveryInstructions}
                    onChange={handleChange}
                    rows={2}
                    placeholder="Special delivery instructions"
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
                    Date Delivered
                  </label>
                  <input
                    type="date"
                    name="dateDelivered"
                    value={formData.dateDelivered}
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

            {/* FCL Additional Details */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Truck size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Additional Details
                </h3>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      TABS Booking
                    </label>
                    <input
                      type="text"
                      name="tabsBooking"
                      value={formData.tabsBooking}
                      onChange={handleChange}
                      placeholder="TABS booking reference"
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
                      Empty Return
                    </label>
                    <input
                      type="text"
                      name="emptyReturn"
                      value={formData.emptyReturn}
                      onChange={handleChange}
                      placeholder="Empty return location"
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
                  <CustomDropdown
                    label="CY Fee"
                    value={formData.cyFee}
                    onChange={(value) => handleChange({ target: { name: "cyFee", value } } as any)}
                    options={[
                      { value: "No", label: "No" },
                      { value: "Yes", label: "Yes" },
                    ]}
                    placeholder="Select..."
                    fullWidth
                  />

                  <CustomDropdown
                    label="Early Gate In"
                    value={formData.earlyGateIn}
                    onChange={(value) => handleChange({ target: { name: "earlyGateIn", value } } as any)}
                    options={[
                      { value: "No", label: "No" },
                      { value: "Yes", label: "Yes" },
                    ]}
                    placeholder="Select..."
                    fullWidth
                  />
                </div>

                {formData.movement === "EXPORT" && (
                  <div>
                    <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      Gate In
                    </label>
                    <input
                      type="datetime-local"
                      name="gateIn"
                      value={formData.gateIn}
                      onChange={handleChange}
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-surface)",
                        color: "var(--neuron-ink-primary)",
                      }}
                    />
                  </div>
                )}

                <div>
                  <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                    EIR Availability
                  </label>
                  <input
                    type="date"
                    name="eirAvailability"
                    value={formData.eirAvailability}
                    onChange={handleChange}
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
                      Det/Dem Validity
                    </label>
                    <input
                      type="date"
                      name="detDemValidity"
                      value={formData.detDemValidity}
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
                      Storage Validity
                    </label>
                    <input
                      type="date"
                      name="storageValidity"
                      value={formData.storageValidity}
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

                <div>
                  <label className="block mb-1.5" style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}>
                    Shipping Line
                  </label>
                  <input
                    type="text"
                    name="shippingLine"
                    value={formData.shippingLine}
                    onChange={handleChange}
                    placeholder="Shipping line name"
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
    </BookingCreationPanel>
  );
}