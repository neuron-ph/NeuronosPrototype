import { CheckSquare, Phone, Mail, Users, Send, MessageSquare, Linkedin, X, MessageCircle, Flag, UserCircle, Upload } from "lucide-react";
import { CustomDropdown } from "./CustomDropdown";
import { useState } from "react";
import type { Task, TaskType, TaskPriority } from "../../types/bd";
import { useCustomers } from "../../hooks/useCustomers";
import { useContacts } from "../../hooks/useContacts";
import { useUsers } from "../../hooks/useUsers";
import { useUser } from "../../hooks/useUser";
import { CustomDatePicker } from "../common/CustomDatePicker";

interface AddTaskPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskData: Partial<Task>) => void;
}


export function AddTaskPanel({ isOpen, onClose, onSave }: AddTaskPanelProps) {
  const [taskData, setTaskData] = useState<Partial<Task>>({
    type: "Call",
    priority: "Medium",
    status: "Pending",
    title: "",
    due_date: "",
    remarks: "",
    contact_id: null,
    customer_id: null,
    owner_id: ""
  });

  const [attachments, setAttachments] = useState<File[]>([]);

  const { user, effectiveRole, effectiveDepartment } = useUser();
  const canAssignToOthers = effectiveRole === 'manager' || effectiveDepartment === 'Executive';

  const { customers } = useCustomers({ enabled: isOpen });
  const { contacts } = useContacts({ enabled: isOpen });
  const { users: bdUsers } = useUsers({ department: 'Business Development', enabled: isOpen && canAssignToOthers });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (taskData.title && taskData.due_date) {
      onSave({
        ...taskData,
        id: `task-${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        cancel_reason: null
      });
      handleClose();
    }
  };

  const handleClose = () => {
    setTaskData({
      type: "Call",
      priority: "Medium",
      status: "Pending",
      title: "",
      due_date: "",
      remarks: "",
      contact_id: null,
      customer_id: null,
      owner_id: ""
    });
    setAttachments([]);
    onClose();
  };

  // Group contacts by customer for better UX
  const contactsByCustomer = contacts.reduce((acc, contact) => {
    const customerId = contact.customer_id;
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
        className="fixed right-0 top-0 h-full w-[600px] bg-[var(--theme-bg-surface)] shadow-2xl z-50 flex flex-col animate-slide-in"
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
            <h2 className="text-[24px] font-semibold" style={{ color: "var(--theme-text-primary)" }}>
              Create New Task
            </h2>
            <p className="text-[13px] mt-1" style={{ color: "var(--theme-text-muted)" }}>
              Add a follow-up task for your business development activities
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
            {/* Task Title */}
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                Task Title *
              </label>
              <input
                type="text"
                value={taskData.title || ""}
                onChange={(e) => setTaskData({ ...taskData, title: e.target.value })}
                placeholder="Enter task title..."
                required
                className="w-full px-3 py-2.5 rounded-lg text-[13px] focus:outline-none focus:ring-2"
                style={{
                  border: "1px solid var(--neuron-ui-border)",
                  backgroundColor: "var(--theme-bg-surface)",
                  color: "var(--theme-text-primary)"
                }}
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                Type *
              </label>
              <CustomDropdown
                options={[
                  { value: "To-do", label: "To-do", icon: <CheckSquare size={16} /> },
                  { value: "Call", label: "Call", icon: <Phone size={16} /> },
                  { value: "Email", label: "Email", icon: <Mail size={16} /> },
                  { value: "Meeting", label: "Meeting", icon: <Users size={16} /> },
                  { value: "SMS", label: "SMS", icon: <Send size={16} /> },
                  { value: "Viber", label: "Viber", icon: <MessageCircle size={16} /> },
                  { value: "WhatsApp", label: "WhatsApp", icon: <MessageSquare size={16} /> },
                  { value: "WeChat", label: "WeChat", icon: <MessageSquare size={16} /> },
                  { value: "LinkedIn", label: "LinkedIn", icon: <Linkedin size={16} /> },
                  { value: "Marketing Email", label: "Marketing Email", icon: <MessageSquare size={16} /> }
                ]}
                value={taskData.type || "Call"}
                onChange={(value) => setTaskData({ ...taskData, type: value as TaskType })}
              />
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                Due Date *
              </label>
              <CustomDatePicker
                value={taskData.due_date || ""}
                onChange={(value) => setTaskData({ ...taskData, due_date: value })}
                placeholder="Select due date"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                Priority *
              </label>
              <CustomDropdown
                options={[
                  { value: "Low", label: "Low", icon: <Flag size={16} style={{ color: "var(--theme-status-success-fg)" }} /> },
                  { value: "Medium", label: "Medium", icon: <Flag size={16} style={{ color: "var(--theme-status-warning-fg)" }} /> },
                  { value: "High", label: "High", icon: <Flag size={16} style={{ color: "var(--theme-status-danger-fg)" }} /> }
                ]}
                value={taskData.priority || "Medium"}
                onChange={(value) => setTaskData({ ...taskData, priority: value as TaskPriority })}
              />
            </div>

            {/* Customer Selection */}
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                Related Customer (Optional)
              </label>
              <CustomDropdown
                value={taskData.customer_id || ""}
                onChange={(value) => setTaskData({ ...taskData, customer_id: value || null, contact_id: null })}
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
              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                Related Contact (Optional)
              </label>
              <div style={{ opacity: taskData.customer_id ? 1 : 0.6, pointerEvents: taskData.customer_id ? 'auto' : 'none' }}>
                <CustomDropdown
                  value={taskData.contact_id || ""}
                  onChange={(value) => setTaskData({ ...taskData, contact_id: value || null })}
                  disabled={!taskData.customer_id}
                  options={[
                    { value: "", label: "Select a contact..." },
                    ...(taskData.customer_id && contactsByCustomer[taskData.customer_id]
                      ? contactsByCustomer[taskData.customer_id].map(contact => ({
                          value: contact.id,
                          label: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() + (contact.title ? ` - ${contact.title}` : '')
                        }))
                      : [])
                  ]}
                />
              </div>
              {!taskData.customer_id && (
                <p className="text-[11px] mt-1" style={{ color: "var(--theme-text-muted)" }}>
                  Select a customer first to choose a contact
                </p>
              )}
            </div>

            {/* Assigned To — managers/executives only */}
            {canAssignToOthers && (
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                  Assign To (Optional)
                </label>
                <CustomDropdown
                  value={taskData.assigned_to || ""}
                  onChange={(value) => setTaskData({ ...taskData, assigned_to: value || undefined })}
                  options={[
                    { value: "", label: "Assign to someone..." },
                    ...bdUsers.map(u => ({
                      value: u.id,
                      label: `${u.name} - ${u.role}`,
                      icon: <UserCircle size={16} />
                    }))
                  ]}
                />
              </div>
            )}

            {/* Remarks */}
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                Remarks (Optional)
              </label>
              <textarea
                value={taskData.remarks || ""}
                onChange={(e) => setTaskData({ ...taskData, remarks: e.target.value })}
                placeholder="Add any additional notes..."
                className="w-full px-3 py-2.5 rounded-lg text-[13px] resize-none focus:outline-none focus:ring-2"
                rows={4}
                style={{
                  border: "1px solid var(--neuron-ui-border)",
                  backgroundColor: "var(--theme-bg-surface)",
                  color: "var(--theme-text-primary)"
                }}
              />
            </div>

            {/* Attachments */}
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--theme-text-muted)" }}>
                Attachments (Optional)
              </label>
              <div 
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
                style={{ borderColor: "var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-surface)" }}
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
                  Supported: PDF, DOC, XLS, images
                </p>
              </div>
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
            Create Task
          </button>
        </div>
      </div>
    </>
  );
}