import { useState, useEffect } from "react";
import { X, FileText, Building2, User, Package, MapPin, Ship, Truck, Shield, MoreHorizontal, Plus, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { CustomDropdown } from "./CustomDropdown";
import { BrokerageFormV2 } from "../pricing/quotations/BrokerageFormV2";
import { ForwardingFormV2 } from "../pricing/quotations/ForwardingFormV2";
import { TruckingFormV2 } from "../pricing/quotations/TruckingFormV2";
import { MarineInsuranceFormV2 } from "../pricing/quotations/MarineInsuranceFormV2";
import { OthersFormV2 } from "../pricing/quotations/OthersFormV2";
import { apiFetch } from "../../utils/api";
import type { Customer } from "../../types/bd";
import type { 
  ServiceType, 
  InquiryService,
  Incoterm,
  BrokerageDetails,
  ForwardingDetails,
  TruckingDetails,
  MarineInsuranceDetails,
  OthersDetails
} from "../../types/pricing";

interface AddInquiryPanelProps {
  onClose: () => void;
  onSave: (data: any) => void;
}

interface BackendCustomer {
  id: string;
  name: string;
  industry: string | null;
  credit_terms: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

interface BackendContact {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  customer_id: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

const serviceOptions = [
  {
    id: "Brokerage",
    label: "Brokerage",
    icon: FileText,
    description: "Customs clearance services",
  },
  {
    id: "Forwarding",
    label: "Forwarding",
    icon: Ship,
    description: "International freight forwarding",
  },
  {
    id: "Trucking",
    label: "Trucking",
    icon: Truck,
    description: "Domestic delivery services",
  },
  {
    id: "Marine Insurance",
    label: "Marine Insurance",
    icon: Shield,
    description: "Cargo insurance coverage",
  },
  {
    id: "Others",
    label: "Others",
    icon: MoreHorizontal,
    description: "Additional services",
  },
];

export function AddInquiryPanel({ onClose, onSave }: AddInquiryPanelProps) {
  // Backend data
  const [customers, setCustomers] = useState<BackendCustomer[]>([]);
  const [allContacts, setAllContacts] = useState<BackendContact[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  // Basic inquiry information
  const [customerId, setCustomerId] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [cargoDescription, setCargoDescription] = useState("");
  const [estimatedWeight, setEstimatedWeight] = useState("");
  const [estimatedVolume, setEstimatedVolume] = useState("");
  const [incoterm, setIncoterm] = useState<Incoterm | "">("");
  const [notes, setNotes] = useState("");

  // Services - new detailed format
  const [selectedServices, setSelectedServices] = useState<InquiryService[]>([]);
  const [expandedServiceIndex, setExpandedServiceIndex] = useState<number | null>(null);

  // Fetch customers and contacts on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoadingData(true);
        
        // Fetch customers
        const customersResponse = await apiFetch(`/customers`);
        
        if (customersResponse.ok) {
          const customersResult = await customersResponse.json();
          if (customersResult.success) {
            setCustomers(customersResult.data);
          }
        }
        
        // Fetch all contacts
        const contactsResponse = await apiFetch(`/contacts`);
        
        if (contactsResponse.ok) {
          const contactsResult = await contactsResponse.json();
          if (contactsResult.success) {
            setAllContacts(contactsResult.data);
          }
        }
      } catch (error) {
        console.error('Error fetching customers/contacts:', error);
      } finally {
        setIsLoadingData(false);
      }
    };
    
    fetchData();
  }, []);
  
  // Filter contacts based on selected customer
  const availableContacts = customerId 
    ? allContacts.filter(contact => contact.customer_id === customerId)
    : [];
  
  // When customer changes, auto-fill contact if there's only one
  useEffect(() => {
    if (customerId && availableContacts.length === 1) {
      const contact = availableContacts[0];
      setContactPerson(contact.name);
      setContactEmail(contact.email || "");
      setContactPhone(contact.phone || "");
    } else if (customerId && availableContacts.length === 0) {
      // Customer selected but no contacts - allow free text entry
      // Don't clear existing values
    }
  }, [customerId]);

  const generateInquiryNumber = () => {
    const year = new Date().getFullYear();
    const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    return `INQ-${year}-${random}`;
  };

  const addService = (serviceType: ServiceType) => {
    // Check if service already exists
    if (selectedServices.some(s => s.service_type === serviceType)) {
      return;
    }

    const newService: InquiryService = {
      service_type: serviceType,
      service_details: {} as any, // Will be filled by form
    };

    setSelectedServices([...selectedServices, newService]);
    setExpandedServiceIndex(selectedServices.length); // Auto-expand newly added service
  };

  const removeService = (index: number) => {
    setSelectedServices(selectedServices.filter((_, i) => i !== index));
    if (expandedServiceIndex === index) {
      setExpandedServiceIndex(null);
    }
  };

  const updateServiceDetails = (index: number, details: any) => {
    const updatedServices = [...selectedServices];
    updatedServices[index] = {
      ...updatedServices[index],
      service_details: details,
    };
    setSelectedServices(updatedServices);
  };

  const toggleServiceExpanded = (index: number) => {
    setExpandedServiceIndex(expandedServiceIndex === index ? null : index);
  };

  const handleSave = () => {
    const selectedCustomer = customers.find(c => c.id === customerId);
    
    const inquiryData = {
      id: `inq-${Date.now()}`,
      inquiry_number: generateInquiryNumber(),
      customer_id: customerId,
      customer_name: selectedCustomer?.name || "",
      contact_person: contactPerson,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      services: selectedServices, // NEW FORMAT with detailed service specs
      origin,
      destination,
      cargo_description: cargoDescription,
      estimated_weight: estimatedWeight,
      estimated_volume: estimatedVolume,
      incoterm: incoterm || undefined,
      notes,
      status: "Pending" as const,
      created_by: "current-user-id", // TODO: Get from auth
      created_at: new Date().toISOString(),
    };

    onSave(inquiryData);
  };

  const isFormValid = () => {
    return (
      customerId &&
      origin &&
      destination &&
      cargoDescription &&
      selectedServices.length > 0
    );
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: "700px",
        height: "100vh",
        backgroundColor: "#FFFFFF",
        borderLeft: "1px solid var(--neuron-ui-border)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        boxShadow: "-4px 0 12px rgba(0, 0, 0, 0.08)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "24px 32px",
          borderBottom: "1px solid var(--neuron-ui-border)",
          backgroundColor: "#F8FBFB",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2
              style={{
                fontSize: "20px",
                fontWeight: 600,
                color: "var(--neuron-brand-green)",
                marginBottom: "4px",
              }}
            >
              Create New Inquiry
            </h2>
            <p style={{ fontSize: "13px", color: "var(--neuron-ink-muted)", margin: 0 }}>
              Capture customer requirements and service details for pricing
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              color: "var(--neuron-ink-muted)",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--neuron-ink-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--neuron-ink-muted)";
            }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Form Content - Scrollable */}
      <div style={{ flex: 1, overflow: "auto", padding: "24px 32px" }}>
        
        {/* SECTION 1: Customer Information */}
        <section style={{ marginBottom: "32px" }}>
          <div
            style={{
              borderLeft: "3px solid var(--neuron-brand-green)",
              backgroundColor: "#F8FBFB",
              borderRadius: "8px",
              border: "1px solid var(--neuron-ui-border)",
              borderLeft: "3px solid var(--neuron-brand-green)",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--neuron-ui-border)",
                backgroundColor: "white",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Building2 size={16} style={{ color: "var(--neuron-brand-green)" }} />
                <h3
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--neuron-ink-primary)",
                    margin: 0,
                  }}
                >
                  CUSTOMER INFORMATION
                </h3>
              </div>
            </div>

            <div style={{ padding: "16px", display: "grid", gap: "12px" }}>
              {/* Customer */}
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-primary)",
                  }}
                >
                  Customer *
                </label>
                {isLoadingData ? (
                  <div style={{
                    padding: "8px 12px",
                    fontSize: "14px",
                    color: "var(--neuron-ink-muted)",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "6px",
                    backgroundColor: "#F9FAFB",
                  }}>
                    Loading customers...
                  </div>
                ) : (
                  <CustomDropdown
                    value={customerId}
                    onChange={setCustomerId}
                    options={customers.map(c => ({ value: c.id, label: c.name, icon: <Building2 size={16} /> }))}
                    placeholder="Select customer"
                  />
                )}
              </div>

              {/* Contact Person - Hybrid dropdown/text input */}
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-primary)",
                  }}
                >
                  Contact Person
                  {customerId && availableContacts.length > 0 && (
                    <span style={{ marginLeft: "8px", fontSize: "11px", color: "var(--neuron-ink-muted)", fontStyle: "italic" }}>
                      ({availableContacts.length} contact{availableContacts.length > 1 ? 's' : ''} available)
                    </span>
                  )}
                </label>
                {customerId && availableContacts.length > 0 ? (
                  <CustomDropdown
                    value={contactPerson}
                    onChange={(value) => {
                      const contact = availableContacts.find(c => c.name === value);
                      if (contact) {
                        setContactPerson(contact.name);
                        setContactEmail(contact.email || "");
                        setContactPhone(contact.phone || "");
                      } else {
                        setContactPerson(value);
                      }
                    }}
                    options={availableContacts.map(c => ({ 
                      value: c.name,
                      icon: <User size={16} />, 
                      label: `${c.name}${c.title ? ` - ${c.title}` : ''}` 
                    }))} 
                    placeholder="Select or type a name"
                  />
                ) : (
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="e.g., Juan dela Cruz"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "14px",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      backgroundColor: "white",
                    }}
                  />
                )}
                {customerId && availableContacts.length === 0 && (
                  <span style={{ display: "block", marginTop: "4px", fontSize: "11px", color: "var(--neuron-ink-muted)", fontStyle: "italic" }}>
                    No contacts found for this customer. Enter name manually.
                  </span>
                )}
              </div>

              {/* Contact Email & Phone */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--neuron-ink-primary)",
                    }}
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="email@company.com"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "14px",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      backgroundColor: "white",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--neuron-ink-primary)",
                    }}
                  >
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+63 912 345 6789"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "14px",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      backgroundColor: "white",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: Shipment Details */}
        <section style={{ marginBottom: "32px" }}>
          <div
            style={{
              borderLeft: "3px solid var(--neuron-brand-green)",
              backgroundColor: "#F8FBFB",
              borderRadius: "8px",
              border: "1px solid var(--neuron-ui-border)",
              borderLeft: "3px solid var(--neuron-brand-green)",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--neuron-ui-border)",
                backgroundColor: "white",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Package size={16} style={{ color: "var(--neuron-brand-green)" }} />
                <h3
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--neuron-ink-primary)",
                    margin: 0,
                  }}
                >
                  SHIPMENT DETAILS
                </h3>
              </div>
            </div>

            <div style={{ padding: "16px", display: "grid", gap: "12px" }}>
              {/* Origin & Destination */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--neuron-ink-primary)",
                    }}
                  >
                    Origin *
                  </label>
                  <input
                    type="text"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    placeholder="e.g., Shanghai, China"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "14px",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      backgroundColor: "white",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--neuron-ink-primary)",
                    }}
                  >
                    Destination *
                  </label>
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="e.g., Manila, Philippines"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "14px",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      backgroundColor: "white",
                    }}
                  />
                </div>
              </div>

              {/* Cargo Description */}
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-primary)",
                  }}
                >
                  Cargo Description *
                </label>
                <textarea
                  value={cargoDescription}
                  onChange={(e) => setCargoDescription(e.target.value)}
                  placeholder="Describe the cargo being shipped"
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "6px",
                    backgroundColor: "white",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* Estimated Weight & Volume */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--neuron-ink-primary)",
                    }}
                  >
                    Est. Weight
                  </label>
                  <input
                    type="text"
                    value={estimatedWeight}
                    onChange={(e) => setEstimatedWeight(e.target.value)}
                    placeholder="e.g., 500 kg"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "14px",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      backgroundColor: "white",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--neuron-ink-primary)",
                    }}
                  >
                    Est. Volume
                  </label>
                  <input
                    type="text"
                    value={estimatedVolume}
                    onChange={(e) => setEstimatedVolume(e.target.value)}
                    placeholder="e.g., 15 CBM"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "14px",
                      border: "1px solid var(--neuron-ui-border)",
                      borderRadius: "6px",
                      backgroundColor: "white",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--neuron-ink-primary)",
                    }}
                  >
                    Incoterm
                  </label>
                  <CustomDropdown
                    value={incoterm}
                    onChange={(value) => setIncoterm(value as Incoterm)}
                    options={[
                      { value: "EXW", label: "EXW" },
                      { value: "FOB", label: "FOB" },
                      { value: "CIF", label: "CIF" },
                      { value: "FCA", label: "FCA" },
                      { value: "CPT", label: "CPT" },
                      { value: "CIP", label: "CIP" },
                      { value: "DAP", label: "DAP" },
                      { value: "DPU", label: "DPU" },
                      { value: "DDP", label: "DDP" }
                    ]}
                    placeholder="Select"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--neuron-ink-primary)",
                  }}
                >
                  Additional Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any special requirements or additional information"
                  rows={2}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "14px",
                    border: "1px solid var(--neuron-ui-border)",
                    borderRadius: "6px",
                    backgroundColor: "white",
                    resize: "vertical",
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: Services Required */}
        <section style={{ marginBottom: "32px" }}>
          <div
            style={{
              borderLeft: "3px solid var(--neuron-brand-green)",
              backgroundColor: "#F8FBFB",
              borderRadius: "8px",
              border: "1px solid var(--neuron-ui-border)",
              borderLeft: "3px solid var(--neuron-brand-green)",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--neuron-ui-border)",
                backgroundColor: "white",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Ship size={16} style={{ color: "var(--neuron-brand-green)" }} />
                  <h3
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--neuron-ink-primary)",
                      margin: 0,
                    }}
                  >
                    SERVICES REQUIRED *
                  </h3>
                </div>
                <span style={{ fontSize: "11px", color: "var(--neuron-ink-muted)", fontStyle: "italic" }}>
                  Fill in complete details to auto-populate pricing
                </span>
              </div>
            </div>

            {/* Service Selection Pills */}
            <div style={{ padding: "16px", borderBottom: "1px solid var(--neuron-ui-border)", backgroundColor: "white" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {serviceOptions.map((service) => {
                  const Icon = service.icon;
                  const isAdded = selectedServices.some(s => s.service_type === service.id);

                  return (
                    <button
                      key={service.id}
                      onClick={() => addService(service.id as ServiceType)}
                      disabled={isAdded}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        backgroundColor: isAdded ? "#E8F5F3" : "white",
                        border: isAdded ? "1.5px solid #0F766E" : "1px solid var(--neuron-ui-border)",
                        borderRadius: "6px",
                        cursor: isAdded ? "not-allowed" : "pointer",
                        transition: "all 0.15s ease",
                        color: isAdded ? "#0F766E" : "var(--neuron-ink-primary)",
                        fontSize: "13px",
                        fontWeight: isAdded ? 600 : 400,
                        opacity: isAdded ? 0.7 : 1,
                      }}
                    >
                      <Icon size={14} />
                      {service.label}
                      {isAdded && <span style={{ marginLeft: "2px" }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Services - Accordion */}
            {selectedServices.length > 0 && (
              <div>
                {selectedServices.map((service, index) => {
                  const serviceOption = serviceOptions.find(s => s.id === service.service_type);
                  if (!serviceOption) return null;

                  const Icon = serviceOption.icon;
                  const isExpanded = expandedServiceIndex === index;

                  return (
                    <div
                      key={`${service.service_type}-${index}`}
                      style={{
                        borderBottom: index < selectedServices.length - 1 ? "1px solid var(--neuron-ui-border)" : "none",
                      }}
                    >
                      {/* Service Header */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "12px 16px",
                          backgroundColor: isExpanded ? "#F8FBFB" : "white",
                        }}
                      >
                        <button
                          onClick={() => toggleServiceExpanded(index)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            display: "flex",
                            alignItems: "center",
                            color: "var(--neuron-ink-muted)",
                          }}
                        >
                          {isExpanded ? (
                            <ChevronDown size={16} style={{ color: "#0F766E" }} />
                          ) : (
                            <ChevronRight size={16} />
                          )}
                        </button>

                        <Icon size={16} style={{ color: "#0F766E" }} />
                        
                        <span
                          style={{
                            flex: 1,
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "var(--neuron-ink-primary)",
                          }}
                        >
                          {serviceOption.label}
                        </span>

                        <button
                          onClick={() => removeService(index)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "4px",
                            color: "#DC2626",
                            display: "flex",
                            alignItems: "center",
                            transition: "opacity 0.15s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = "0.7";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = "1";
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Service Details Form */}
                      {isExpanded && (
                        <div style={{ padding: "16px", backgroundColor: "#FAFBFC" }}>
                          {service.service_type === "Brokerage" && (
                            <BrokerageFormV2
                              data={service.service_details as BrokerageDetails}
                              onChange={(details) => updateServiceDetails(index, details)}
                            />
                          )}
                          {service.service_type === "Forwarding" && (
                            <ForwardingFormV2
                              data={service.service_details as ForwardingDetails}
                              onChange={(details) => updateServiceDetails(index, details)}
                            />
                          )}
                          {service.service_type === "Trucking" && (
                            <TruckingFormV2
                              data={service.service_details as TruckingDetails}
                              onChange={(details) => updateServiceDetails(index, details)}
                            />
                          )}
                          {service.service_type === "Marine Insurance" && (
                            <MarineInsuranceFormV2
                              data={service.service_details as MarineInsuranceDetails}
                              onChange={(details) => updateServiceDetails(index, details)}
                            />
                          )}
                          {service.service_type === "Others" && (
                            <OthersFormV2
                              data={service.service_details as OthersDetails}
                              onChange={(details) => updateServiceDetails(index, details)}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {selectedServices.length === 0 && (
              <div
                style={{
                  padding: "24px",
                  textAlign: "center",
                  color: "var(--neuron-ink-muted)",
                  fontSize: "13px",
                }}
              >
                Click on a service above to add it to this inquiry
              </div>
            )}
          </div>
        </section>

      </div>

      {/* Footer Actions */}
      <div
        style={{
          padding: "16px 32px",
          borderTop: "1px solid var(--neuron-ui-border)",
          backgroundColor: "white",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button
          onClick={onClose}
          style={{
            padding: "8px 16px",
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--neuron-ink-muted)",
            backgroundColor: "white",
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "6px",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#F9FAFB";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "white";
          }}
        >
          Cancel
        </button>

        <button
          onClick={handleSave}
          disabled={!isFormValid()}
          style={{
            padding: "8px 24px",
            fontSize: "13px",
            fontWeight: 600,
            color: "white",
            backgroundColor: isFormValid() ? "var(--neuron-brand-green)" : "#D1D5DB",
            border: "none",
            borderRadius: "6px",
            cursor: isFormValid() ? "pointer" : "not-allowed",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            if (isFormValid()) {
              e.currentTarget.style.backgroundColor = "#0F766E";
            }
          }}
          onMouseLeave={(e) => {
            if (isFormValid()) {
              e.currentTarget.style.backgroundColor = "var(--neuron-brand-green)";
            }
          }}
        >
          Create Inquiry
        </button>
      </div>
    </div>
  );
}