import { CustomDropdown } from "./CustomDropdown";
import { CustomDatePicker } from "../common/CustomDatePicker";
import { useMemo, useState, useRef } from "react";
import type { Activity, ActivityType } from "../../types/bd";
import { X, Phone, Mail, Users, MessageSquare, Send, MessageCircle, Linkedin, StickyNote, Upload, FileText, Trash2 } from "lucide-react";
import { useCustomers } from "../../hooks/useCustomers";
import { useContacts } from "../../hooks/useContacts";

interface AddActivityPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (activityData: Partial<Activity>, files: File[]) => void | Promise<void>;
  inline?: boolean;
  lockedCustomerId?: string | null;
  lockedContactId?: string | null;
}

function getLocalDateTimeValue(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getDatePart(value: string) {
  return value.split("T")[0] || "";
}

function getTimePart(value: string) {
  return value.split("T")[1]?.slice(0, 5) || "09:00";
}

function combineDateTime(datePart: string, timePart: string) {
  if (!datePart) return "";
  return `${datePart}T${timePart || "09:00"}`;
}

export function AddActivityPanel({ isOpen, onClose, onSave, inline, lockedCustomerId, lockedContactId }: AddActivityPanelProps) {
  const { customers } = useCustomers();
  const { contacts } = useContacts();

  // Derive locked customer from locked contact if needed
  const lockedContact = lockedContactId ? contacts.find(c => c.id === lockedContactId) : null;
  const initialCustomerId = lockedCustomerId ?? lockedContact?.customer_id ?? null;
  const initialContactId = lockedContactId ?? null;

  const hideCustomer = !!(lockedCustomerId || lockedContactId);
  const hideContact = !!lockedContactId;

  // Default to current date/time
  const defaultDateTime = getLocalDateTimeValue();

  const [activityData, setActivityData] = useState<Partial<Activity>>({
    type: "Call Logged",
    date: defaultDateTime,
    description: "",
    contact_id: initialContactId,
    customer_id: initialCustomerId,
    task_id: null,
    user_id: "user-1" // Mock current user
  });

  const [attachments, setAttachments] = useState<File[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activityData.description && activityData.date) {
      await onSave(
        {
          ...activityData,
          id: `act-${Date.now()}`,
          created_at: new Date().toISOString(),
        },
        attachments,
      );
      handleClose();
    }
  };

  const handleClose = () => {
    const defaultDateTime = getLocalDateTimeValue();

    setActivityData({
      type: "Call Logged",
      date: defaultDateTime,
      description: "",
      contact_id: initialContactId,
      customer_id: initialCustomerId,
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
  const contactsByCustomer = useMemo<Record<string, typeof contacts>>(() => contacts.reduce((acc, contact) => {
    const customerId = contact.customer_id;
    if (!acc[customerId]) {
      acc[customerId] = [];
    }
    acc[customerId].push(contact);
    return acc;
  }, {} as Record<string, typeof contacts>), [contacts]);

  const formBody = (
    <>
      {/* Header */}
      <div
        className="flex items-center justify-between px-8 py-6 border-b"
        style={{ borderColor: "var(--neuron-ui-divider)" }}
      >
        <div>
          <h2 className="text-[24px] font-semibold" style={{ color: "var(--theme-text-primary)" }}>
            Log Activity
          </h2>
          <p className="text-[13px] mt-1" style={{ color: "var(--theme-text-muted)" }}>
            Record a completed interaction or event
          </p>
        </div>
        {!inline && (
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
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-8 py-6">
        <div className="space-y-6">
          {/* Activity Type */}
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
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
            <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
              Date & Time *
            </label>
            <div className="grid grid-cols-[1fr_150px] gap-3">
              <CustomDatePicker
                value={getDatePart(activityData.date || "")}
                onChange={(date) =>
                  setActivityData({
                    ...activityData,
                    date: combineDateTime(date, getTimePart(activityData.date || "")),
                  })
                }
                placeholder="Select date"
                minWidth="100%"
              />
              <input
                type="time"
                value={getTimePart(activityData.date || "")}
                onChange={(event) =>
                  setActivityData({
                    ...activityData,
                    date: combineDateTime(getDatePart(activityData.date || getLocalDateTimeValue()), event.target.value),
                  })
                }
                className="w-full px-3 py-2.5 rounded-lg text-[13px] font-medium focus:outline-none focus:ring-2"
                style={{
                  border: "1px solid var(--neuron-ui-border)",
                  backgroundColor: "var(--theme-bg-surface)",
                  color: "var(--theme-text-primary)",
                }}
              />
            </div>
            <p className="text-[11px] mt-1" style={{ color: "var(--theme-text-muted)" }}>
              When did this activity occur?
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
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
                backgroundColor: "var(--theme-bg-surface)",
                color: "var(--theme-text-primary)"
              }}
            />
            <p className="text-[11px] mt-1" style={{ color: "var(--theme-text-muted)" }}>
              Be specific about outcomes, next steps, or key points discussed
            </p>
          </div>

          {/* Customer Selection */}
          {!hideCustomer && (
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
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
          )}

          {/* Contact Selection - Only show contacts from selected customer */}
          {!hideContact && (
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
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
                <p className="text-[11px] mt-1" style={{ color: "var(--theme-text-muted)" }}>
                  Select a customer first to choose a contact
                </p>
              )}
            </div>
          )}

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--theme-text-muted)" }}>
                Attachments (Optional)
              </label>
              {attachments.length > 0 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors"
                  style={{
                    border: "1px solid var(--neuron-ui-border)",
                    backgroundColor: "var(--theme-bg-surface)",
                    color: "var(--theme-action-primary-bg)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)"; }}
                >
                  <Upload size={12} />
                  Add file
                </button>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
              multiple
            />

            {attachments.length === 0 ? (
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
                style={{ borderColor: "var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)" }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--theme-action-primary-bg)";
                  e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                  e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                }}
              >
                <Upload size={24} className="mx-auto mb-2" style={{ color: "var(--theme-text-muted)" }} />
                <p className="text-[13px]" style={{ color: "var(--theme-text-muted)" }}>
                  Click to upload or drag and drop files
                </p>
                <p className="text-[11px] mt-1" style={{ color: "var(--theme-text-muted)" }}>
                  Supported: PDF, DOC, XLS, images, screenshots
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {attachments.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 rounded-lg border border-[var(--theme-border-default)] bg-[var(--theme-bg-surface-subtle)]"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileText size={14} className="text-[var(--theme-text-muted)] flex-shrink-0" />
                      <span className="text-[12px] text-[var(--theme-text-secondary)] truncate">{file.name}</span>
                      <span className="text-[11px] text-[var(--theme-text-muted)] flex-shrink-0">
                        ({(file.size / 1024).toFixed(0)} KB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      className="text-[var(--theme-text-muted)] hover:text-[var(--theme-status-danger-fg)] transition-colors p-1"
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
            backgroundColor: "var(--theme-bg-surface)"
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
          onClick={handleSubmit}
          className="flex-1 px-4 py-2.5 rounded-lg text-[13px] font-medium text-white transition-colors"
          style={{ backgroundColor: "var(--theme-action-primary-bg)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--theme-action-primary-border)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--theme-action-primary-bg)";
          }}
        >
          Log Activity
        </button>
      </div>
    </>
  );

  if (inline) {
    return (
      <div
        className="w-full rounded-xl flex flex-col"
        style={{
          border: "1px solid var(--neuron-ui-border)",
          backgroundColor: "var(--theme-bg-surface)",
        }}
      >
        {formBody}
      </div>
    );
  }

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
        className="fixed right-0 top-0 h-full w-[600px] bg-[var(--theme-bg-surface)] shadow-2xl z-50 flex flex-col animate-slide-in"
        style={{
          borderLeft: "1px solid var(--neuron-ui-border)",
        }}
      >
        {formBody}
      </div>
    </>
  );
}
