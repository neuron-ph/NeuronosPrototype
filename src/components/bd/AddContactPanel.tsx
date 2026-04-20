import { useState, useEffect } from "react";
import { UserPlus, X, User, Building2, Target } from "lucide-react";
import type { LifecycleStage, LeadStatus } from "../../types/bd";
import { CustomSelect } from "./CustomSelect";
import { useUsers } from "../../hooks/useUsers";
import { useCustomers } from "../../hooks/useCustomers";

interface AddContactPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (contactData: any) => Promise<void>;
  prefilledCustomerId?: string; // Pre-fill and lock customer when adding from Customer Detail page
  prefilledCustomerName?: string; // Display name of pre-filled customer
}


export function AddContactPanel({ isOpen, onClose, onSave, prefilledCustomerId, prefilledCustomerName }: AddContactPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  // Direct Supabase query for BD users
  const { users: bdUsers } = useUsers({ department: 'Business Development', enabled: isOpen });
  const { customers } = useCustomers({ enabled: isOpen });

  // Pre-fill customer_id when opening from Customer Detail page
  useEffect(() => {
    if (isOpen && prefilledCustomerId) {
      setFormData(prev => ({ ...prev, customer_id: prefilledCustomerId }));
    }
  }, [isOpen, prefilledCustomerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave({
        ...formData,
        id: `contact-${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      // Parent closes the panel on success via setIsAddContactOpen(false)
    } finally {
      setIsSubmitting(false);
    }
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
        className="fixed right-0 top-0 h-full w-[680px] bg-[var(--theme-bg-surface)] z-50 shadow-2xl overflow-hidden flex flex-col"
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
            backgroundColor: "var(--theme-bg-surface)"
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "var(--theme-bg-surface-tint)" }}
              >
                <UserPlus size={20} style={{ color: "var(--theme-action-primary-bg)" }} />
              </div>
              <h2 style={{ fontSize: "24px", fontWeight: 600, color: "var(--theme-text-primary)" }}>
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
          <p style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>
            Create a new contact record for your business development pipeline
          </p>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-auto px-12 py-8">
          <form onSubmit={handleSubmit} id="add-contact-form">
            {/* Contact Information Section */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <User size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Contact Information
                </h3>
              </div>

              <div className="space-y-4">
                {/* First Name */}
                <div>
                  <label 
                    htmlFor="first_name" 
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                  >
                    First Name <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>
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
                      backgroundColor: "var(--theme-bg-surface)",
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
                    style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                  >
                    Last Name <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>
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
                      backgroundColor: "var(--theme-bg-surface)",
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
                    style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
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
                      backgroundColor: "var(--theme-bg-surface)",
                      color: "var(--neuron-ink-primary)"
                    }}
                  />
                </div>

                {/* Email */}
                <div>
                  <label 
                    htmlFor="email" 
                    className="block mb-1.5"
                    style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                  >
                    Email Address <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>
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
                      backgroundColor: "var(--theme-bg-surface)",
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
                    style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                  >
                    Mobile Number <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>
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
                      backgroundColor: "var(--theme-bg-surface)",
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
                <Building2 size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Company
                </h3>
              </div>

              <div>
                <label
                  htmlFor="customer_id"
                  className="block mb-1.5"
                  style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                >
                  Company <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--theme-text-muted)" }}>(optional)</span>
                </label>
                {prefilledCustomerId && prefilledCustomerName ? (
                  // Show locked field when adding from Customer Detail page
                  <>
                    <div
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px]"
                      style={{ 
                        border: "1px solid var(--neuron-ui-border)",
                        backgroundColor: "var(--theme-bg-page)",
                        color: "var(--neuron-ink-primary)"
                      }}
                    >
                      {prefilledCustomerName}
                    </div>
                    <p className="mt-1.5 text-[12px]" style={{ color: "var(--theme-text-muted)" }}>
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
                      { value: "", label: "No company (standalone contact)" },
                      ...customers.map(company => ({ value: company.id, label: company.name }))
                    ]}
                    placeholder="No company (standalone contact)"
                  />
                )}
              </div>
            </div>

            {/* Lead Details Section */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Target size={16} style={{ color: "var(--theme-action-primary-bg)" }} />
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--theme-text-primary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Lead Details
                </h3>
              </div>

              <div className="space-y-4">
                {/* Lifecycle Stage & Lead Status Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label 
                      className="block mb-1.5"
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
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
                      style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
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
                    style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
                  >
                    Contact Owner <span style={{ color: "var(--theme-status-danger-fg)" }}>*</span>
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
                    style={{ fontSize: "13px", fontWeight: 500, color: "var(--theme-text-primary)" }}
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
                      backgroundColor: "var(--theme-bg-surface)",
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
            backgroundColor: "var(--theme-bg-surface)"
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg transition-colors"
            style={{
              border: "1px solid var(--neuron-ui-border)",
              backgroundColor: "var(--theme-bg-surface)",
              color: "var(--neuron-ink-secondary)",
              fontSize: "14px",
              fontWeight: 500
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-contact-form"
            disabled={!isFormValid || isSubmitting}
            className="px-6 py-2.5 rounded-lg transition-all flex items-center gap-2"
            style={{
              backgroundColor: isFormValid && !isSubmitting ? "var(--theme-action-primary-bg)" : "var(--neuron-ui-muted)",
              color: "#FFFFFF",
              fontSize: "14px",
              fontWeight: 600,
              border: "none",
              cursor: isFormValid && !isSubmitting ? "pointer" : "not-allowed",
              opacity: isFormValid && !isSubmitting ? 1 : 0.6
            }}
            onMouseEnter={(e) => {
              if (isFormValid && !isSubmitting) {
                e.currentTarget.style.backgroundColor = "var(--theme-action-primary-border)";
              }
            }}
            onMouseLeave={(e) => {
              if (isFormValid && !isSubmitting) {
                e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
              }
            }}
          >
            <UserPlus size={16} />
            {isSubmitting ? "Saving..." : "Create Contact"}
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