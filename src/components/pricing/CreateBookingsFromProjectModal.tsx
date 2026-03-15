import { toast } from "sonner@2.0.3";

interface CreateBookingsFromProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  currentUser: User;
  onSuccess: () => void;
}

interface ServiceBookingState {
  serviceType: ServiceType;
  serviceData: any;
  assignment: TeamAssignment | null;
  isCreating: boolean;
  isCreated: boolean;
  bookingId?: string;
  error?: string;
}

export function CreateBookingsFromProjectModal({
  isOpen,
  onClose,
  project,
  currentUser,
  onSuccess,
}: CreateBookingsFromProjectModalProps) {
  const [serviceStates, setServiceStates] = useState<Record<string, ServiceBookingState>>(() => {
    // Initialize state for each service in project
    const initial: Record<string, ServiceBookingState> = {};
    
    if (project.services_metadata) {
      project.services_metadata.forEach((service: any, index: number) => {
        const key = `${service.service_type}-${index}`;
        initial[key] = {
          serviceType: service.service_type as ServiceType,
          serviceData: service,
          assignment: null,
          isCreating: false,
          isCreated: false,
        };
      });
    }
    
    return initial;
  });

  const handleAssignmentChange = (key: string, assignment: TeamAssignment) => {
    setServiceStates(prev => ({
      ...prev,
      [key]: { ...prev[key], assignment },
    }));
  };

  const getBookingEndpoint = (serviceType: ServiceType): string => {
    const endpoints: Record<ServiceType, string> = {
      "Forwarding": "forwarding-bookings",
      "Brokerage": "brokerage-bookings",
      "Trucking": "trucking-bookings",
      "Marine Insurance": "marine-insurance-bookings",
      "Others": "others-bookings",
    };
    return endpoints[serviceType];
  };

  const buildBookingPayload = (serviceState: ServiceBookingState) => {
    const { serviceType, serviceData, assignment } = serviceState;
    
    if (!assignment) return null;

    // Common fields for all booking types
    const commonFields = {
      projectNumber: project.project_number,
      customerName: project.customer_name,
      accountOwner: currentUser.name,
      accountHandler: currentUser.name,
      quotationReferenceNumber: project.quotation_number,
      status: "Draft" as const,
      
      // Team assignments
      assigned_manager_id: assignment.manager.id,
      assigned_manager_name: assignment.manager.name,
      assigned_supervisor_id: assignment.supervisor?.id,
      assigned_supervisor_name: assignment.supervisor?.name,
      assigned_handler_id: assignment.handler?.id,
      assigned_handler_name: assignment.handler?.name,
    };

    // Service-specific payload construction
    switch (serviceType) {
      case "Forwarding":
        return {
          ...commonFields,
          services: serviceData.services || [],
          subServices: serviceData.subServices || [],
          mode: serviceData.mode || "FCL",
          typeOfEntry: serviceData.typeOfEntry || project.movement || "IMPORT",
          cargoType: serviceData.cargoType || project.cargo_type || "General Cargo",
          stackability: serviceData.stackability || project.stackability,
          deliveryAddress: serviceData.deliveryAddress || project.collection_address || "",
          
          // Expected Volume
          qty20ft: serviceData.qty20ft || "",
          qty40ft: serviceData.qty40ft || "",
          qty45ft: serviceData.qty45ft || "",
          volumeGrossWeight: project.gross_weight?.toString() || "",
          volumeDimensions: project.dimensions || "",
          volumeChargeableWeight: project.chargeable_weight?.toString() || "",
          
          // Shipment Information
          consignee: serviceData.consignee || project.customer_name,
          shipper: serviceData.shipper || "",
          commodity: project.commodity || "",
          pol: project.pol_aol || "",
          pod: project.pod_aod || "",
          carrier: project.carrier || "",
          vesselVoyage: serviceData.vesselVoyage || "",
          etd: project.requested_etd || "",
          eta: project.eta || "",
        };

      case "Brokerage":
        return {
          ...commonFields,
          service: serviceData.service || "Customs Brokerage",
          incoterms: project.incoterm || "",
          mode: serviceData.mode || project.category || "",
          cargoType: project.cargo_type || "",
          cargoNature: serviceData.cargoNature || "",
          
          // Shipment Information
          shipper: serviceData.shipper || "",
          consignee: serviceData.consignee || project.customer_name,
          entryType: serviceData.entryType || project.movement || "",
          portOfDischarge: project.pod_aod || "",
          arrivalDate: project.eta || "",
          commodity: project.commodity || "",
        };

      case "Trucking":
        return {
          ...commonFields,
          service: serviceData.service || "Trucking",
          truckType: serviceData.truckType || "",  // @deprecated — synced from first truckingLineItem; kept for backward compat
          mode: serviceData.mode || "Domestic",
          preferredDeliveryDate: project.shipment_ready_date || "",
          
          // ✨ Multi-line trucking: pass through line items if available
          ...(serviceData.trucking_line_items && { trucking_line_items: serviceData.trucking_line_items }),
          // Sync legacy deliveryAddress from first line item when available
          deliveryAddress: serviceData.trucking_line_items?.[0]?.destination
            || serviceData.deliveryLocation || "",

          // Shipment Information
          pickupLocation: serviceData.pickupLocation || project.collection_address || "",
          deliveryLocation: serviceData.deliveryLocation || "",
          commodity: project.commodity || "",
          grossWeight: project.gross_weight?.toString() || "",
          dimensions: project.dimensions || "",
        };

      case "Marine Insurance":
        return {
          ...commonFields,
          service: serviceData.service || "Marine Insurance",
          
          // Policy Information
          invoiceValue: serviceData.invoiceValue || project.total?.toString() || "",
          currency: project.currency || "PHP",
          commodity: project.commodity || "",
          conveyance: serviceData.conveyance || "",
          from: project.pol_aol || "",
          to: project.pod_aod || "",
          riskType: serviceData.riskType || "All Risk",
        };

      case "Others":
        return {
          ...commonFields,
          service: serviceData.service || "Other Service",
          serviceDescription: serviceData.serviceDescription || "",
        };

      default:
        return commonFields;
    }
  };

  const handleCreateBooking = async (key: string) => {
    const serviceState = serviceStates[key];
    
    if (!serviceState.assignment) {
      toast.error("Please complete team assignments");
      return;
    }

    setServiceStates(prev => ({
      ...prev,
      [key]: { ...prev[key], isCreating: true, error: undefined },
    }));

    try {
      const payload = buildBookingPayload(serviceState);
      if (!payload) {
        throw new Error("Invalid booking payload");
      }

      const endpoint = getBookingEndpoint(serviceState.serviceType);
      
      // Create booking
      const response = await apiFetch(`/${endpoint}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || "Failed to create booking");
      }

      // Save handler preference if checkbox was checked
      if (serviceState.assignment.saveAsDefault) {
        try {
          await apiFetch(`/client-handler-preferences`, {
            method: "POST",
            body: JSON.stringify({
              customer_id: project.customer_id,
              service_type: serviceState.serviceType,
              preferred_manager_id: serviceState.assignment.manager.id,
              preferred_manager_name: serviceState.assignment.manager.name,
              preferred_supervisor_id: serviceState.assignment.supervisor?.id,
              preferred_supervisor_name: serviceState.assignment.supervisor?.name,
              preferred_handler_id: serviceState.assignment.handler?.id,
              preferred_handler_name: serviceState.assignment.handler?.name,
            }),
          });
        } catch (error) {
          console.error("Error saving preference:", error);
          // Don't fail the booking creation if preference save fails
        }
      }

      setServiceStates(prev => ({
        ...prev,
        [key]: { 
          ...prev[key], 
          isCreating: false, 
          isCreated: true,
          bookingId: result.data.bookingId,
        },
      }));

      toast.success(`${serviceState.serviceType} booking created successfully!`);
    } catch (error) {
      console.error("Error creating booking:", error);
      setServiceStates(prev => ({
        ...prev,
        [key]: { 
          ...prev[key], 
          isCreating: false, 
          error: error instanceof Error ? error.message : "Failed to create booking",
        },
      }));
      toast.error(`Failed to create ${serviceState.serviceType} booking`);
    }
  };

  const allServicesBooked = Object.values(serviceStates).every(state => state.isCreated);
  const someServicesBooked = Object.values(serviceStates).some(state => state.isCreated);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-12 py-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-['Inter:SemiBold',sans-serif] font-semibold text-[#12332B]">
              Create Bookings for Project
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Project: {project.project_number} • Customer: {project.customer_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-12 py-6 space-y-6">
          {Object.entries(serviceStates).map(([key, state]) => (
            <div
              key={key}
              className="border border-gray-200 rounded-xl p-6 bg-gray-50"
            >
              {/* Service Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#0F766E]/10 flex items-center justify-center">
                    <Package className="w-5 h-5 text-[#0F766E]" />
                  </div>
                  <div>
                    <h3 className="font-['Inter:SemiBold',sans-serif] font-semibold text-[#12332B]">
                      {state.serviceType}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {state.serviceData.mode || state.serviceData.service || "Service booking"}
                    </p>
                  </div>
                </div>
                
                {state.isCreated && (
                  <div className="flex items-center gap-2 text-green-600">
                    <Check className="w-5 h-5" />
                    <span className="text-sm font-['Inter:Medium',sans-serif] font-medium">
                      Booking Created
                    </span>
                  </div>
                )}
              </div>

              {/* Team Assignment Form */}
              {!state.isCreated && (
                <>
                  <TeamAssignmentForm
                    serviceType={state.serviceType}
                    customerId={project.customer_id}
                    onChange={(assignment) => handleAssignmentChange(key, assignment)}
                  />

                  {/* Error Message */}
                  {state.error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700">{state.error}</p>
                    </div>
                  )}

                  {/* Create Booking Button */}
                  <button
                    onClick={() => handleCreateBooking(key)}
                    disabled={!state.assignment || state.isCreating}
                    className="mt-6 w-full px-6 py-3 bg-[#0F766E] text-white rounded-lg font-['Inter:Medium',sans-serif] font-medium hover:bg-[#0d6860] transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {state.isCreating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Creating Booking...
                      </>
                    ) : (
                      <>Create {state.serviceType} Booking</>
                    )}
                  </button>
                </>
              )}

              {/* Booking Created State */}
              {state.isCreated && state.bookingId && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800">
                    <span className="font-['Inter:Medium',sans-serif] font-medium">Booking ID:</span> {state.bookingId}
                  </p>
                  <p className="text-sm text-green-800 mt-1">
                    <span className="font-['Inter:Medium',sans-serif] font-medium">Handler:</span> {state.assignment?.handler?.name}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-12 py-6 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {allServicesBooked 
              ? "All bookings created successfully" 
              : someServicesBooked 
              ? `${Object.values(serviceStates).filter(s => s.isCreated).length} of ${Object.keys(serviceStates).length} bookings created`
              : "Create bookings for each service above"}
          </div>
          <button
            onClick={() => {
              if (allServicesBooked) {
                onSuccess();
              } else {
                onClose();
              }
            }}
            className="px-6 py-3 bg-[#12332B] text-white rounded-lg font-['Inter:Medium',sans-serif] font-medium hover:bg-[#1a4a3f] transition-colors"
          >
            {allServicesBooked ? "Complete" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}