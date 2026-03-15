import { X, Upload, Phone, Mail, Users, MessageSquare, Send, MessageCircle, Linkedin, StickyNote, FileText, Trash2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import type { Activity, ActivityType } from "../../types/bd";
import { CustomDropdown } from "./CustomDropdown";
import { apiFetch } from "../../utils/api";

interface AddActivityPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (activityData: Partial<Activity>) => void;
}

interface BackendContact {
  id: string;
  name: string;
  title: string;
  customer_id: string;
  email: string;
  phone: string;
  first_name: string;
  last_name: string;
}

interface BackendCustomer {
  id: string;
  name: string;
  industry: string | null;
}

export function AddActivityPanel({ isOpen, onClose, onSave }: AddActivityPanelProps) {
  // Default to current date/time
  const now = new Date();
  const defaultDateTime = now.toISOString().slice(0, 16); // Format for datetime-local input

  const [activityData, setActivityData] = useState<Partial<Activity>>({
    type: "Call Logged",
    date: defaultDateTime,
    description: "",
    contact_id: null,
    customer_id: null,
    task_id: null,
    user_id: "user-1" // Mock current user
  });

  const [attachments, setAttachments] = useState<File[]>([]);
  const [contacts, setContacts] = useState<BackendContact[]>([]);
  const [customers, setCustomers] = useState<BackendCustomer[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch dropdown data when panel opens
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch contacts
        const contactsResponse = await apiFetch(`/contacts`);
        if (contactsResponse.ok) {
          const result = await contactsResponse.json();
          if (result.success) setContacts(result.data);
        }

        // Fetch customers
        const customersResponse = await apiFetch(`/customers`);
        if (customersResponse.ok) {
          const result = await customersResponse.json();
          if (result.success) setCustomers(result.data);
        }
        
        console.log('[AddActivityPanel] Fetched dropdown data');
      } catch (error) {
        console.error('Error fetching data for AddActivityPanel:', error);
      }
    };

    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activityData.description && activityData.date) {
      onSave({
        ...activityData,
        id: `act-${Date.now()}`,
        created_at: new Date().toISOString(),
        attachments: attachments.map(file => ({
          name: file.name,
          size: file.size,
          type: file.type
        }))
      });
      handleClose();
    }
  };

  const handleClose = () => {
    const now = new Date();
    const defaultDateTime = now.toISOString().slice(0, 16);
    
    setActivityData({
      type: "Call Logged",
      date: defaultDateTime,
      description: "",
      contact_id: null,
      customer_id: null,
      task_id: null,
      user_id: "user-1"
    });
    setAttachments([]);
    onClose();
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setAttachments(prev => [...prev, ...newFiles]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      const newFiles = Array.from(e.dataTransfer.files);
      setAttachments(prev => [...prev, ...newFiles]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Group contacts by customer for better UX
  const contactsByCustomer = contacts.reduce((acc, contact) => {
    const customerId = contact.customer_id; // ✅ Use 'customer_id' instead of 'company_id'
    if (!acc[customerId]) {
      acc[customerId] = [];
    }
    acc[customerId].push(contact);
    return acc;
  }, {} as Record<string, typeof contacts>);

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
        className="fixed right-0 top-0 h-full w-[600px] bg-white shadow-2xl z-50 flex flex-col animate-slide-in"
        style={{
          borderLeft: "1px solid var(--neuron-ui-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-8 py-6 border-b"
          style={{ borderColor: "var(--neuron-ui-divider)" }}
        >
          <div>
            <h2 className="text-[24px] font-semibold" style={{ color: "#12332B" }}>
              Log Activity
            </h2>
            <p className="text-[13px] mt-1" style={{ color: "#667085" }}>
              Record a completed interaction or event
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg transition-colors"
            style={{ color: "var(--neuron-ink-muted)" }}
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-8 py-6">
          <div className="space-y-6">
            {/* Activity Type */}
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "#667085" }}>
                Activity Type *
              </label>
              <CustomDropdown
                options={[
                  { value: "Call Logged", label: "Call Logged", icon: <Phone size={16} /> },
                  { value: "Email Logged", label: "Email Logged", icon: <Mail size={16} /> },
                  { value: "Meeting Logged", label: "Meeting Logged", icon: <Users size={16} /> },
                  { value: "Marketing Email Logged", label: "Marketing Email Logged", icon: <MessageSquare size={16} /> },
                  { value: "SMS Logged", label: "SMS Logged", icon: <Send size={16} /> },
                  { value: "Viber Logged", label: "Viber Logged", icon: <MessageCircle size={16} /> },
                  { value: "WeChat Logged", label: "WeChat Logged", icon: <MessageCircle size={16} /> },
                  { value: "WhatsApp Logged", label: "WhatsApp Logged", icon: <MessageCircle size={16} /> },
                  { value: "LinkedIn Logged", label: "LinkedIn Logged", icon: <Linkedin size={16} /> },
                  { value: "Note", label: "Note", icon: <StickyNote size={16} /> }
                ]}
                value={activityData.type || "Call Logged"}
                onChange={(value) => setActivityData({ ...activityData, type: value as ActivityType })}
              />
            </div>

            {/* Date & Time */}
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "#667085" }}>
                Date & Time *
              </label>
              <input
                type="datetime-local"
                value={activityData.date || ""}
                onChange={(e) => setActivityData({ ...activityData, date: e.target.value })}
                required
                className="w-full px-3 py-2.5 rounded-lg text-[13px] focus:outline-none focus:ring-2"
                style={{
                  border: "1px solid var(--neuron-ui-border)",
                  backgroundColor: "#FFFFFF",
                  color: "#12332B"
                }}
              />
              <p className="text-[11px] mt-1" style={{ color: "#667085" }}>
                When did this activity occur?
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "#667085" }}>
                Description *
              </label>
              <textarea
                value={activityData.description || ""}
                onChange={(e) => setActivityData({ ...activityData, description: e.target.value })}
                placeholder="Describe what happened during this activity..."
                required
                className="w-full px-3 py-2.5 rounded-lg text-[13px] resize-none focus:outline-none focus:ring-2"
                rows={6}
                style={{
                  border: "1px solid var(--neuron-ui-border)",
                  backgroundColor: "#FFFFFF",
                  color: "#12332B"
                }}
              />
              <p className="text-[11px] mt-1" style={{ color: "#667085" }}>
                Be specific about outcomes, next steps, or key points discussed
              </p>
            </div>

            {/* Customer Selection */}
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "#667085" }}>
                Related Customer (Optional)
              </label>
              <CustomDropdown
                value={activityData.customer_id || ""}
                onChange={(value) => setActivityData({ ...activityData, customer_id: value || null, contact_id: null })}
                options={[
                  { value: "", label: "Select a customer" },
                  ...customers.map(customer => ({
                    value: customer.id,
                    label: customer.name
                  }))
                ]}
              />
            </div>

            {/* Contact Selection - Only show contacts from selected customer */}
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "#667085" }}>
                Related Contact (Optional)
              </label>
              <div style={{ opacity: activityData.customer_id ? 1 : 0.6, pointerEvents: activityData.customer_id ? 'auto' : 'none' }}>
                <CustomDropdown
                  value={activityData.contact_id || ""}
                  onChange={(value) => setActivityData({ ...activityData, contact_id: value || null })}
                  options={[
                    { value: "", label: "Select a contact..." },
                    ...(activityData.customer_id && contactsByCustomer[activityData.customer_id]
                      ? contactsByCustomer[activityData.customer_id].map(contact => ({
                          value: contact.id,
                          label: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() + (contact.title ? ` - ${contact.title}` : '')
                        }))
                      : [])
                  ]}
                />
              </div>
              {!activityData.customer_id && (
                <p className="text-[11px] mt-1" style={{ color: "#667085" }}>
                  Select a customer first to choose a contact
                </p>
              )}
            </div>

            {/* Attachments */}
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "#667085" }}>
                Attachments (Optional)
              </label>
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                className="hidden" 
                multiple 
              />
              
              <div 
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
                style={{ borderColor: "var(--neuron-ui-border)", backgroundColor: "#FFFFFF" }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#0F766E";
                  e.currentTarget.style.backgroundColor = "#E8F5F3";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                  e.currentTarget.style.backgroundColor = "#FFFFFF";
                }}
              >
                <Upload size={24} className="mx-auto mb-2" style={{ color: "#667085" }} />
                <p className="text-[13px]" style={{ color: "#667085" }}>
                  Click to upload or drag and drop files
                </p>
                <p className="text-[11px] mt-1" style={{ color: "#9CA3AF" }}>
                  Supported: PDF, DOC, XLS, images, screenshots
                </p>
              </div>

              {/* Attachments List */}
              {attachments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {attachments.map((file, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between p-2 rounded-lg border border-gray-200 bg-gray-50"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileText size={14} className="text-gray-500 flex-shrink-0" />
                        <span className="text-[12px] text-gray-700 truncate">{file.name}</span>
                        <span className="text-[11px] text-gray-400 flex-shrink-0">
                          ({(file.size / 1024).toFixed(0)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div
          className="px-8 py-4 border-t flex gap-3"
          style={{ borderColor: "var(--neuron-ui-divider)" }}
        >
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 px-4 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
            style={{
              border: "1px solid var(--neuron-ui-border)",
              color: "var(--neuron-ink-secondary)",
              backgroundColor: "#FFFFFF"
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
            onClick={handleSubmit}
            className="flex-1 px-4 py-2.5 rounded-lg text-[13px] font-medium text-white transition-colors"
            style={{ backgroundColor: "#0F766E" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#0D6560";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#0F766E";
            }}
          >
            Log Activity
          </button>
        </div>
      </div>
    </>
  );
}