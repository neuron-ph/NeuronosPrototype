import { useState, useEffect } from "react";
import { X, User, Building2, Target, UserPlus } from "lucide-react";
import type { LifecycleStage, LeadStatus } from "../../types/bd";
import { apiFetch } from "../../utils/api";
import { CustomSelect } from "./CustomSelect";
import { CustomDropdown } from "./CustomDropdown";
import { useUsers } from "../../hooks/useUsers";

interface AddContactPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (contactData: any) => void;
  prefilledCustomerId?: string; // Pre-fill and lock customer when adding from Customer Detail page
  prefilledCustomerName?: string; // Display name of pre-filled customer
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

interface BackendUser {
  id: string;
  email: string;
  name: string;
  department: string;
  role: string;
  created_at: string;
  is_active: boolean;
}

export function AddContactPanel({ isOpen, onClose, onSave, prefilledCustomerId, prefilledCustomerName }: AddContactPanelProps) {
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    title: "", // ✅ Backend uses 'title', not 'job_title'
    email: "",
    phone: "", // ✅ Backend uses 'phone', not 'mobile_number'
    customer_id: "", // ✅ Backend uses 'customer_id', not 'company_id'
    owner_id: "", // Owner field
    lifecycle_stage: "Lead", // Default lifecycle stage
    lead_status: "New", // Default lead status
    notes: "",
  });

  const [customers, setCustomers] = useState<BackendCustomer[]>([]);

  // Direct Supabase query for BD users (replaces Edge Function fetch)
  const { users: bdUsers } = useUsers({ department: 'Business Development', enabled: isOpen });

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch customers
        const customersResponse = await apiFetch(`/customers`);
        
        if (customersResponse.ok) {
          const customersResult = await customersResponse.json();
          if (customersResult.success) {
            setCustomers(customersResult.data);
          }
        }
      } catch (error) {
        console.error('Error fetching data for AddContactPanel:', error);
      }
    };
    
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  // Pre-fill customer_id when opening from Customer Detail page
  useEffect(() => {
    if (isOpen && prefilledCustomerId) {
      setFormData(prev => ({ ...prev, customer_id: prefilledCustomerId }));
    }
  }, [isOpen, prefilledCustomerId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      id: `contact-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    onClose();
    // Reset form
    setFormData({
      first_name: "",
      last_name: "",
      title: "",
      email: "",
      phone: "",
      customer_id: "",
      owner_id: "",
      lifecycle_stage: "Lead",
      lead_status: "New",
      notes: "",
    });
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  const isFormValid = 
    formData.first_name.trim() !== "" &&
    formData.last_name.trim() !== "" &&
    formData.email.trim() !== "" &&
    formData.phone.trim() !== "" &&
    formData.customer_id !== "" &&
    formData.owner_id !== "";

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black z-40 transition-opacity"
        onClick={onClose}
        style={{ 
          backdropFilter: "blur(2px)",
          backgroundColor: "rgba(18, 51, 43, 0.15)"
        }}
      />

      {/* Side Panel */}
      <div 
        className="fixed right-0 top-0 h-full w-[680px] bg-white z-50 shadow-2xl overflow-hidden flex flex-col"
        style={{
          animation: "slideIn 0.3s ease-out",
          border: "1px solid var(--neuron-ui-border)",
        }}
      >
        {/* Header */}
        <div 
          className="px-12 py-8 border-b"
          style={{ 
            borderColor: "var(--neuron-ui-border)",
            backgroundColor: "#FFFFFF"
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "#E8F2EE" }}
              >
                <UserPlus size={20} style={{ color: "#0F766E" }} />
              </div>
              <h2 style={{ fontSize: "24px", fontWeight: 600, color: "#12332B" }}>
                Add New Contact
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ 
                color: "var(--neuron-ink-muted)",
                backgroundColor: "transparent"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <X size={20} />
            </button>
          </div>
          <p style={{ fontSize: "14px", color: "#667085" }}>
            Create a new contact record for your business development pipeline
          </p>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-auto px-12 py-8">
          <form onSubmit={handleSubmit} id="add-contact-form">
            {/* Contact Information Section */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <User size={16} style={{ color: "#0F766E" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#12332B", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Contact Information
                </h3>
              </div>

              <div className="space-y-4">
                {/* First Name */}
                <div>
                  <label 
                    htmlFor="first_name" 
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    First Name <span style={{ color: "#C94F3D" }}>*</span>
                  </label>
                  <input
                    id="first_name"
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => handleChange("first_name", e.target.value)}
                    placeholder="Juan"
                    className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none focus:ring-2 text-[13px]"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "#FFFFFF",
                      color: "var(--neuron-ink-primary)"
                    }}
                    required
                  />
                </div>

                {/* Last Name */}
                <div>
                  <label 
                    htmlFor="last_name" 
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    Last Name <span style={{ color: "#C94F3D" }}>*</span>
                  </label>
                  <input
                    id="last_name"
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => handleChange("last_name", e.target.value)}
                    placeholder="Dela Cruz"
                    className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none focus:ring-2 text-[13px]"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "#FFFFFF",
                      color: "var(--neuron-ink-primary)"
                    }}
                    required
                  />
                </div>

                {/* Title */}
                <div>
                  <label 
                    htmlFor="title" 
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    Title
                  </label>
                  <input
                    id="title"
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleChange("title", e.target.value)}
                    placeholder="Logistics Manager"
                    className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none focus:ring-2 text-[13px]"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "#FFFFFF",
                      color: "var(--neuron-ink-primary)"
                    }}
                  />
                </div>

                {/* Email */}
                <div>
                  <label 
                    htmlFor="email" 
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    Email Address <span style={{ color: "#C94F3D" }}>*</span>
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="juan.delacruz@company.com"
                    className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none focus:ring-2 text-[13px]"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "#FFFFFF",
                      color: "var(--neuron-ink-primary)"
                    }}
                    required
                  />
                </div>

                {/* Mobile Number */}
                <div>
                  <label 
                    htmlFor="phone" 
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    Mobile Number <span style={{ color: "#C94F3D" }}>*</span>
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    placeholder="+63 912 345 6789"
                    className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none focus:ring-2 text-[13px]"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "#FFFFFF",
                      color: "var(--neuron-ink-primary)"
                    }}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Company Section */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={16} style={{ color: "#0F766E" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#12332B", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Company
                </h3>
              </div>

              <div>
                <label 
                  htmlFor="customer_id" 
                  className="block mb-1.5"
                  style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                >
                  Company <span style={{ color: "#C94F3D" }}>*</span>
                </label>
                {prefilledCustomerId && prefilledCustomerName ? (
                  // Show locked field when adding from Customer Detail page
                  <>
                    <div
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{ 
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "#F9FAFB",
                        color: "var(--neuron-ink-primary)"
                      }}
                    >
                      {prefilledCustomerName}
                    </div>
                    <p className="mt-1.5 text-[12px]" style={{ color: "#667085" }}>
                      Adding contact to {prefilledCustomerName}
                    </p>
                  </>
                ) : (
                  // Show dropdown when adding from main Contacts page
                  <CustomSelect
                    id="customer_id"
                    value={formData.customer_id}
                    onChange={(value) => handleChange("customer_id", value)}
                    options={[
                      { value: "", label: "Select a company..." },
                      ...customers.map(company => ({ value: company.id, label: company.name }))
                    ]}
                    placeholder="Select a company..."
                    required
                  />
                )}
              </div>
            </div>

            {/* Lead Details Section */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Target size={16} style={{ color: "#0F766E" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#12332B", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Lead Details
                </h3>
              </div>

              <div className="space-y-4">
                {/* Lifecycle Stage & Lead Status Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label 
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                    >
                      Lifecycle Stage
                    </label>
                    <CustomSelect
                      id="lifecycle_stage"
                      value={formData.lifecycle_stage}
                      onChange={(value) => handleChange("lifecycle_stage", value)}
                      options={[
                        { value: "Lead", label: "Lead" },
                        { value: "MQL", label: "MQL" },
                        { value: "SQL", label: "SQL" },
                        { value: "Customer", label: "Customer" }
                      ]}
                      placeholder="Select stage..."
                    />
                  </div>
                  <div>
                    <label 
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                    >
                      Lead Status
                    </label>
                    <CustomSelect
                      id="lead_status"
                      value={formData.lead_status}
                      onChange={(value) => handleChange("lead_status", value)}
                      options={[
                        { value: "New", label: "New" },
                        { value: "Open", label: "Open" },
                        { value: "In Progress", label: "In Progress" },
                        { value: "Unqualified", label: "Unqualified" },
                        { value: "Attempted to contact", label: "Attempted to contact" },
                        { value: "Connected", label: "Connected" },
                        { value: "Bad timing", label: "Bad timing" }
                      ]}
                      placeholder="Select status..."
                    />
                  </div>
                </div>

                {/* Owner */}
                <div>
                  <label 
                    htmlFor="owner_id" 
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    Contact Owner <span style={{ color: "#C94F3D" }}>*</span>
                  </label>
                  <CustomSelect
                    id="owner_id"
                    value={formData.owner_id}
                    onChange={(value) => handleChange("owner_id", value)}
                    options={[
                      { value: "", label: "Assign to..." },
                      ...bdUsers.map(user => ({ value: user.id, label: user.name }))
                    ]}
                    placeholder="Assign to..."
                    required
                  />
                </div>

                {/* Notes */}
                <div>
                  <label 
                    htmlFor="notes" 
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    Notes
                  </label>
                  <textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => handleChange("notes", e.target.value)}
                    placeholder="Add any additional notes about this contact..."
                    rows={4}
                    className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none focus:ring-2 text-[13px] resize-none"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "#FFFFFF",
                      color: "var(--neuron-ink-primary)"
                    }}
                  />
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer Actions */}
        <div 
          className="px-12 py-6 border-t flex items-center justify-end gap-3"
          style={{ 
            borderColor: "var(--neuron-ui-border)",
            backgroundColor: "#FFFFFF"
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg transition-colors"
            style={{
              border: "1px solid var(--neuron-ui-border)",
              backgroundColor: "#FFFFFF",
              color: "var(--neuron-ink-secondary)",
              fontSize: "14px",
              fontWeight: 500
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#FFFFFF";
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-contact-form"
            disabled={!isFormValid}
            className="px-6 py-2.5 rounded-lg transition-all flex items-center gap-2"
            style={{
              backgroundColor: isFormValid ? "#0F766E" : "#D1D5DB",
              color: "#FFFFFF",
              fontSize: "14px",
              fontWeight: 600,
              border: "none",
              cursor: isFormValid ? "pointer" : "not-allowed",
              opacity: isFormValid ? 1 : 0.6
            }}
            onMouseEnter={(e) => {
              if (isFormValid) {
                e.currentTarget.style.backgroundColor = "#0D6560";
              }
            }}
            onMouseLeave={(e) => {
              if (isFormValid) {
                e.currentTarget.style.backgroundColor = "#0F766E";
              }
            }}
          >
            <UserPlus size={16} />
            Create Contact
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}