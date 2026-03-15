import { X, Building2, MapPin, Target, Briefcase } from "lucide-react";
import { useState, useEffect } from "react";
import type { CustomerStatus } from "../../types/bd";
import { CustomSelect } from "./CustomSelect";
import { useUsers } from "../../hooks/useUsers";

interface AddCustomerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (customerData: any) => void;
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

const INDUSTRIES = [
  "Garments",
  "Automobile",
  "Energy",
  "Food & Beverage",
  "Heavy Equipment",
  "Construction",
  "Agricultural",
  "Pharmaceutical",
  "IT",
  "Electronics",
  "General Merchandise"
];

export function AddCustomerPanel({ isOpen, onClose, onSave }: AddCustomerPanelProps) {
  const [formData, setFormData] = useState({
    company_name: "",
    client_type: "Local", // Default to Local
    industry: "",
    registered_address: "",
    status: "Prospect" as CustomerStatus,
    lead_source: "",
    owner_id: "",
    notes: "",
  });

  // Direct Supabase query for BD users (replaces Edge Function fetch)
  const { users } = useUsers({ department: 'Business Development', enabled: isOpen });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // ✅ Map company_name to 'name' field for backend compatibility
    const { company_name, ...rest } = formData;
    onSave({
      ...rest,
      name: company_name, // Backend expects 'name' field
      id: `customer-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    onClose();
    // Reset form
    setFormData({
      company_name: "",
      client_type: "Local",
      industry: "",
      registered_address: "",
      status: "Prospect",
      lead_source: "",
      owner_id: "",
      notes: "",
    });
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleClose = () => {
    onClose();
    // Reset form on close
    setFormData({
      company_name: "",
      client_type: "Local",
      industry: "",
      registered_address: "",
      status: "Prospect",
      lead_source: "",
      owner_id: "",
      notes: "",
    });
  };

  if (!isOpen) return null;

  const isFormValid = 
    formData.company_name.trim() !== "" &&
    formData.industry !== "" &&
    formData.registered_address.trim() !== "" &&
    formData.owner_id !== "";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black z-40"
        onClick={handleClose}
        style={{ 
          backdropFilter: "blur(2px)",
          backgroundColor: "rgba(18, 51, 43, 0.15)"
        }}
      />

      {/* Slide-out Panel */}
      <div
        className="fixed right-0 top-0 h-full w-[680px] bg-white shadow-2xl z-50 flex flex-col animate-slide-in"
        style={{
          borderLeft: "1px solid var(--neuron-ui-border)",
        }}
      >
        {/* Header */}
        <div
          className="px-12 py-8 border-b"
          style={{
            borderColor: "var(--neuron-ui-border)",
            backgroundColor: "#FFFFFF",
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "#E8F2EE" }}
              >
                <Building2 size={20} style={{ color: "#0F766E" }} />
              </div>
              <h2 style={{ fontSize: "24px", fontWeight: 600, color: "#12332B" }}>
                Add New Customer
              </h2>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{
                color: "var(--neuron-ink-muted)",
                backgroundColor: "transparent",
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
            Create a new customer company record for your business development pipeline
          </p>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-auto px-12 py-8">
          <form onSubmit={handleSubmit} id="add-customer-form">
            {/* Company Information Section */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={16} style={{ color: "#0F766E" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#12332B", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Company Information
                </h3>
              </div>

              <div className="space-y-4">
                {/* Company Name */}
                <div>
                  <label
                    htmlFor="company_name"
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    Company Name <span style={{ color: "#C94F3D" }}>*</span>
                  </label>
                  <input
                    id="company_name"
                    type="text"
                    value={formData.company_name}
                    onChange={(e) => handleChange("company_name", e.target.value)}
                    placeholder="Acme Corporation Philippines"
                    className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none focus:ring-2 text-[13px]"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "#FFFFFF",
                      color: "var(--neuron-ink-primary)",
                    }}
                    required
                  />
                </div>

                {/* Client Type */}
                <div>
                  <label
                    htmlFor="client_type"
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    Client Type
                  </label>
                  <CustomSelect
                    id="client_type"
                    value={formData.client_type || "Local"}
                    onChange={(value) => handleChange("client_type", value)}
                    options={[
                      { value: "Local", label: "Local" },
                      { value: "International", label: "International" }
                    ]}
                  />
                </div>

                {/* Industry */}
                <div>
                  <label
                    htmlFor="industry"
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    Industry <span style={{ color: "#C94F3D" }}>*</span>
                  </label>
                  <CustomSelect
                    id="industry"
                    value={formData.industry}
                    onChange={(value) => handleChange("industry", value)}
                    options={[
                      { value: "", label: "Select an industry..." },
                      ...INDUSTRIES.map(industry => ({ value: industry, label: industry }))
                    ]}
                    placeholder="Select an industry..."
                    required
                  />
                </div>

                {/* Registered Address */}
                <div>
                  <label
                    htmlFor="registered_address"
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    Registered Address <span style={{ color: "#C94F3D" }}>*</span>
                  </label>
                  <textarea
                    id="registered_address"
                    value={formData.registered_address}
                    onChange={(e) => handleChange("registered_address", e.target.value)}
                    placeholder="123 Makati Ave, Makati City, Metro Manila, Philippines"
                    rows={3}
                    className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none focus:ring-2 text-[13px] resize-none"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "#FFFFFF",
                      color: "var(--neuron-ink-primary)",
                    }}
                    required
                  />
                </div>
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
                {/* Status */}
                <div>
                  <label
                    htmlFor="status"
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    Status
                  </label>
                  <CustomSelect
                    id="status"
                    value={formData.status}
                    onChange={(value) => handleChange("status", value)}
                    options={[
                      { value: "Prospect", label: "Prospect" },
                      { value: "Active", label: "Active" },
                      { value: "Inactive", label: "Inactive" }
                    ]}
                  />
                </div>

                {/* Lead Source */}
                <div>
                  <label
                    htmlFor="lead_source"
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    Lead Source
                  </label>
                  <input
                    id="lead_source"
                    type="text"
                    value={formData.lead_source}
                    onChange={(e) => handleChange("lead_source", e.target.value)}
                    placeholder="Website, Referral, Trade Show, etc."
                    className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none focus:ring-2 text-[13px]"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "#FFFFFF",
                      color: "var(--neuron-ink-primary)",
                    }}
                  />
                </div>

                {/* Owner */}
                <div>
                  <label
                    htmlFor="owner_id"
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "#12332B" }}
                  >
                    Account Owner <span style={{ color: "#C94F3D" }}>*</span>
                  </label>
                  <CustomSelect
                    id="owner_id"
                    value={formData.owner_id}
                    onChange={(value) => handleChange("owner_id", value)}
                    options={[
                      { value: "", label: "Assign to..." },
                      ...users.map(user => ({ value: user.id, label: user.name }))
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
                    placeholder="Additional information about the customer..."
                    rows={3}
                    className="w-full px-3.5 py-2.5 rounded-lg focus:outline-none focus:ring-2 text-[13px] resize-none"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "#FFFFFF",
                      color: "var(--neuron-ink-primary)",
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
            backgroundColor: "#FFFFFF",
          }}
        >
          <button
            type="button"
            onClick={handleClose}
            className="px-6 py-2.5 rounded-lg transition-colors"
            style={{
              border: "1px solid var(--neuron-ui-border)",
              backgroundColor: "#FFFFFF",
              color: "var(--neuron-ink-secondary)",
              fontSize: "14px",
              fontWeight: 500,
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
            form="add-customer-form"
            disabled={!isFormValid}
            className="px-6 py-2.5 rounded-lg transition-all flex items-center gap-2"
            style={{
              backgroundColor: isFormValid ? "#0F766E" : "#D1D5DB",
              color: "#FFFFFF",
              fontSize: "14px",
              fontWeight: 600,
              border: "none",
              cursor: isFormValid ? "pointer" : "not-allowed",
              opacity: isFormValid ? 1 : 0.6,
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
            <Building2 size={16} />
            Create Customer
          </button>
        </div>
      </div>
    </>
  );
}