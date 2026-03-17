import { useState } from "react";
import { ArrowLeft, CheckCircle, CheckSquare, CircleCheckBig, Flag, User, Building2, Phone, Mail, Users, Send, MessageCircle, MessageSquare, Linkedin, Upload, Paperclip, Trash2 } from "lucide-react";
import { CustomDropdown } from "./CustomDropdown";
import { supabase } from '../../utils/supabase/client';
import { toast } from "../ui/toast-utils";
import type { Task, TaskPriority, TaskStatus, TaskType } from "../../types/bd";

interface TaskDetailInlineProps {
  task: Task;
  onBack: () => void;
  onUpdate?: () => void; // Callback to refresh parent list
  onDelete?: () => void; // Callback after delete
  customers?: any[]; // Optional customer data
  contacts?: any[]; // Optional contact data
}

interface Comment {
  id: string;
  user: string;
  text: string;
  timestamp: string;
}

export function TaskDetailInline({ task, onBack, onUpdate, onDelete, customers, contacts }: TaskDetailInlineProps) {
  const [editedTask, setEditedTask] = useState(task);
  const [newComment, setNewComment] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<string[]>([]);

  const isCompleted = editedTask.status === 'Completed';

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      day: 'numeric',
      month: 'short', 
      year: 'numeric'
    });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getOwnerName = (ownerId: string) => {
    // TODO: Fetch from users API when available
    return ownerId || "—";
  };

  const getContactInfo = (contactId: string | null) => {
    if (!contactId) return null;
    return contacts?.find(c => c.id === contactId);
  };

  const getCustomerInfo = (customerId: string | null) => {
    if (!customerId) return null;
    return customers?.find(c => c.id === customerId);
  };

  const contact = getContactInfo(task.contact_id);
  const customer = getCustomerInfo(task.customer_id);

  // Debug logs
  console.log('[TaskDetailInline] Task:', task);
  console.log('[TaskDetailInline] Contact found:', contact);
  console.log('[TaskDetailInline] Customer found:', customer);
  console.log('[TaskDetailInline] Available contacts:', contacts);
  console.log('[TaskDetailInline] Available customers:', customers);

  const getPriorityColor = (priority: TaskPriority) => {
    switch (priority) {
      case "High": return { bg: "#FFE5E5", text: "#C94F3D" };
      case "Medium": return { bg: "#FEF3E7", text: "#C88A2B" };
      case "Low": return { bg: "#F3F4F6", text: "#6B7A76" };
      default: return { bg: "#F3F4F6", text: "#6B7A76" };
    }
  };

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case "Completed": return { bg: "#E8F5F3", text: "#0F766E" };
      case "Cancelled": return { bg: "#FFE5E5", text: "#C94F3D" };
      case "Ongoing": return { bg: "#FEF3E7", text: "#C88A2B" };
      case "Pending": return { bg: "#F3F4F6", text: "#6B7A76" };
      default: return { bg: "#F3F4F6", text: "#6B7A76" };
    }
  };

  const handleSave = async () => {
    try {
      const { error } = await supabase.from('tasks').update(editedTask).eq('id', task.id);
      if (error) throw error;
      toast.success('Task updated successfully');
      setIsEditing(false);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Unable to update task. Please try again.');
    }
  };

  const handleAddComment = () => {
    if (newComment.trim()) {
      const comment: Comment = {
        id: Date.now().toString(),
        user: "Current User",
        text: newComment,
        timestamp: new Date().toISOString()
      };
      setComments([...comments, comment]);
      setNewComment("");
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase.from('tasks').delete().eq('id', task.id);
      if (error) throw error;
      toast.success('Task deleted successfully');
      if (onDelete) {
        onDelete(); // Callback will navigate back and refresh
      } else {
        onBack(); // Just go back if no callback provided
      }
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Unable to delete task. Please try again.');
    }
  };

  const handleMarkAsComplete = async () => {
    try {
      // Update task status to Completed
      const updatedTask = { ...editedTask, status: 'Completed' as TaskStatus };
      
      const { error: updateErr } = await supabase.from('tasks').update(updatedTask).eq('id', task.id);
      if (updateErr) throw updateErr;

      // Create activity record for completed task
      const activityData = {
        type: task.type,
        description: task.title,
        date: new Date().toISOString(),
        contact_id: task.contact_id,
        customer_id: task.customer_id,
        task_id: task.id,
        user_id: task.owner_id,
      };

      const { error: activityErr } = await supabase.from('crm_activities').insert({
        ...activityData,
        id: `act-${Date.now()}`,
        created_at: new Date().toISOString(),
      });
      if (activityErr) throw activityErr;

      // Update local state
      setEditedTask(updatedTask);
      
      toast.success('Task marked as complete and converted to activity!');
      
      if (onUpdate) onUpdate(); // Refresh parent list
    } catch (error) {
      console.error('Error marking task as complete:', error);
      toast.error('Unable to mark task as complete. Please try again.');
    }
  };

  const priorityColors = getPriorityColor(editedTask.priority);
  const statusColors = getStatusColor(editedTask.status);

  return (
    <div 
      className="h-full flex flex-col overflow-auto"
      style={{
        background: "#FFFFFF",
      }}
    >
      {/* Back Button - Top Left */}
      <div style={{ padding: "32px 48px 24px 48px" }}>
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[13px] transition-colors"
            style={{ color: "#0F766E" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#0D6560";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#0F766E";
            }}
          >
            <ArrowLeft size={16} />
            Back to Tasks
          </button>

          {/* Mark as Complete CTA - Only show if not already completed */}
          {editedTask.status !== 'Completed' ? (
            <button
              onClick={handleMarkAsComplete}
              className="px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-colors flex items-center gap-2"
              style={{ 
                backgroundColor: "#0F766E",
                cursor: "pointer"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#0D6560";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#0F766E";
              }}
            >
              <CheckCircle size={16} />
              Mark as Complete
            </button>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium"
              style={{
                backgroundColor: "#E8F5F3",
                color: "#0F766E",
                border: "1px solid #0F766E30"
              }}
            >
              <CircleCheckBig size={15} />
              Completed
            </span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto" style={{ padding: "0 48px 48px 48px" }}>
        {/* Task Header */}
        <div className="mb-8">
          <h1 
            className="text-[28px] font-semibold mb-3"
            style={{ color: "#12332B" }}
          >
            {task.title}
          </h1>
          <div className="flex items-center gap-2">
            <span 
              className="inline-flex items-center px-3 py-1 rounded text-[11px] font-medium"
              style={{ 
                backgroundColor: statusColors.bg,
                color: statusColors.text
              }}
            >
              {editedTask.status}
            </span>
            <span 
              className="inline-flex items-center px-3 py-1 rounded text-[11px] font-medium"
              style={{ 
                backgroundColor: priorityColors.bg,
                color: priorityColors.text
              }}
            >
              <Flag size={11} className="mr-1" />
              {editedTask.priority} Priority
            </span>
          </div>
        </div>

        {/* Task Details Section */}
        <div className="mb-8">
          <h3 
            className="text-[11px] font-semibold uppercase tracking-wide mb-4"
            style={{ color: "#667085" }}
          >
            Task Details
          </h3>

          <div 
            className="rounded-lg p-6"
            style={{
              border: "1px solid var(--neuron-ui-border)",
              backgroundColor: "#FFFFFF"
            }}
          >
            <div className="space-y-6">
              {/* Type */}
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "#667085" }}>
                  Type
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
                  value={editedTask.type}
                  onChange={(value) => {
                    setEditedTask({ ...editedTask, type: value as TaskType });
                    handleSave();
                  }}
                  disabled={isCompleted}
                />
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "#667085" }}>
                  Due Date
                </label>
                <input
                  type="date"
                  value={editedTask.due_date || ""}
                  onChange={(e) => {
                    setEditedTask({ ...editedTask, due_date: e.target.value });
                    handleSave();
                  }}
                  disabled={isCompleted}
                  className="w-full px-3 py-2.5 rounded-lg text-[13px] focus:outline-none focus:ring-2"
                  style={{
                    border: "1px solid var(--neuron-ui-border)",
                    backgroundColor: isCompleted ? "#F9FAFB" : "#FFFFFF",
                    color: isCompleted ? "#9CA3AF" : "#12332B",
                    cursor: isCompleted ? "not-allowed" : undefined
                  }}
                />
              </div>

              {/* Task Owner */}
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "#667085" }}>
                  Task Owner
                </label>
                <div 
                  className="px-3 py-2.5 rounded-lg text-[13px]" 
                  style={{ 
                    backgroundColor: "#F9FAFB", 
                    color: "#12332B",
                    border: "1px solid var(--neuron-ui-border)"
                  }}
                >
                  {getOwnerName(task.owner_id)}
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "#667085" }}>
                  Remarks
                </label>
                <textarea
                  value={editedTask.remarks || ""}
                  onChange={(e) => setEditedTask({ ...editedTask, remarks: e.target.value })}
                  onBlur={handleSave}
                  placeholder="Add remarks..."
                  rows={3}
                  disabled={isCompleted}
                  className="w-full px-3 py-2.5 rounded-lg text-[13px] focus:outline-none focus:ring-2 resize-none"
                  style={{
                    border: "1px solid var(--neuron-ui-border)",
                    backgroundColor: isCompleted ? "#F9FAFB" : "#FFFFFF",
                    color: isCompleted ? "#9CA3AF" : "#12332B",
                    cursor: isCompleted ? "not-allowed" : undefined
                  }}
                />
              </div>

              {/* Metadata */}
              <div className="pt-4 border-t space-y-3" style={{ borderColor: "var(--neuron-ui-divider)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wide" style={{ color: "#667085" }}>Created</span>
                  <span className="text-[13px]" style={{ color: "#12332B" }}>{formatDateTime(task.created_at)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wide" style={{ color: "#667085" }}>Last Updated</span>
                  <span className="text-[13px]" style={{ color: "#12332B" }}>{formatDateTime(task.updated_at)}</span>
                </div>
                {isCompleted && (
                  <div className="flex items-center gap-1.5 pt-2">
                    <CircleCheckBig size={12} style={{ color: "#0F766E" }} />
                    <span className="text-[11px]" style={{ color: "#0F766E" }}>
                      Converted to activity
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Related To Section */}
        {(contact || customer) && (
          <div className="mb-8">
            <h3 
              className="text-[11px] font-semibold uppercase tracking-wide mb-4"
              style={{ color: "#667085" }}
            >
              Related To
            </h3>

            <div 
              className="rounded-lg p-6"
              style={{
                border: "1px solid var(--neuron-ui-border)",
                backgroundColor: "#FFFFFF"
              }}
            >
              <div className="space-y-4">
                {contact && (
                  <div className="flex items-start gap-3">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: "#F3F4F6",
                        border: "1px solid var(--neuron-ui-divider)"
                      }}
                    >
                      <User size={16} style={{ color: "#9CA3AF" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5 className="text-[13px] font-medium mb-1" style={{ color: "#12332B" }}>
                        {contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown Contact'}
                      </h5>
                      <p className="text-[12px]" style={{ color: "#667085" }}>
                        {contact.job_title || contact.title || '—'}
                      </p>
                    </div>
                  </div>
                )}

                {customer && (
                  <div className="flex items-start gap-3">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: "#E8F5F3",
                        border: "1px solid #0F766E30"
                      }}
                    >
                      <Building2 size={16} style={{ color: "#0F766E" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5 className="text-[13px] font-medium mb-1" style={{ color: "#12332B" }}>
                        {customer.company_name || customer.name || 'Unknown Company'}
                      </h5>
                      <p className="text-[12px]" style={{ color: "#667085" }}>
                        {customer.industry || '—'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Attachments Section */}
        <div className="mb-8">
          <h3 
            className="text-[11px] font-semibold uppercase tracking-wide mb-4"
            style={{ color: "#667085" }}
          >
            Attachments
          </h3>

          <div 
            className="rounded-lg p-6"
            style={{
              border: "1px solid var(--neuron-ui-border)",
              backgroundColor: "#FFFFFF"
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <button
                className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors flex items-center gap-2"
                style={{
                  border: "1px solid var(--neuron-ui-border)",
                  color: "#0F766E",
                  backgroundColor: "#FFFFFF"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#F9FAFB";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#FFFFFF";
                }}
              >
                <Upload size={14} />
                Upload
              </button>
            </div>

            {attachments.length > 0 ? (
              <div className="space-y-2">
                {attachments.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-3 rounded-lg transition-colors"
                    style={{
                      border: "1px solid var(--neuron-ui-border)",
                      backgroundColor: "#FAFAFA"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#F3F4F6";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#FAFAFA";
                    }}
                  >
                    <Paperclip size={16} style={{ color: "#667085" }} />
                    <span className="text-[13px] flex-1" style={{ color: "#12332B" }}>
                      {file}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-[13px]" style={{ color: "#667085" }}>
                  No attachments yet
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Comments Section */}
        <div className="mb-8">
          <h3 
            className="text-[11px] font-semibold uppercase tracking-wide mb-4"
            style={{ color: "#667085" }}
          >
            Comments
          </h3>

          <div 
            className="rounded-lg p-6"
            style={{
              border: "1px solid var(--neuron-ui-border)",
              backgroundColor: "#FFFFFF"
            }}
          >
            {/* Comment List */}
            {comments.length > 0 ? (
              <div className="space-y-4 mb-6 pb-6" style={{ borderBottom: "1px solid var(--neuron-ui-divider)" }}>
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: "#E8F5F3",
                        border: "1px solid #0F766E30"
                      }}
                    >
                      <User size={14} style={{ color: "#0F766E" }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[12px] font-medium" style={{ color: "#12332B" }}>
                          {comment.user}
                        </span>
                        <span className="text-[11px]" style={{ color: "#667085" }}>
                          {formatDateTime(comment.timestamp)}
                        </span>
                      </div>
                      <p className="text-[13px]" style={{ color: "#475467" }}>
                        {comment.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Add Comment */}
            <div>
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                rows={3}
                className="w-full px-3 py-2.5 rounded-lg text-[13px] focus:outline-none focus:ring-2 resize-none mb-3"
                style={{
                  border: "1px solid var(--neuron-ui-border)",
                  backgroundColor: "#FFFFFF",
                  color: "#12332B"
                }}
              />
              <button
                onClick={handleAddComment}
                disabled={!newComment.trim()}
                className="w-full px-4 py-2.5 rounded-lg text-[13px] font-medium text-white transition-colors flex items-center justify-center gap-2"
                style={{ 
                  backgroundColor: newComment.trim() ? "#0F766E" : "#D1D5DB",
                  cursor: newComment.trim() ? "pointer" : "not-allowed"
                }}
                onMouseEnter={(e) => {
                  if (newComment.trim()) {
                    e.currentTarget.style.backgroundColor = "#0D6560";
                  }
                }}
                onMouseLeave={(e) => {
                  if (newComment.trim()) {
                    e.currentTarget.style.backgroundColor = "#0F766E";
                  }
                }}
              >
                <Send size={14} />
                Post Comment
              </button>
            </div>
          </div>
        </div>

        {/* Delete Section */}
        <div className="mb-8">
          <div 
            className="rounded-lg p-6"
            style={{
              border: "1px solid #FFE5E5",
              backgroundColor: "#FFFBFB"
            }}
          >
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h4 className="text-[13px] font-semibold mb-1" style={{ color: "#12332B" }}>
                  Delete this task
                </h4>
                <p className="text-[12px]" style={{ color: "#667085" }}>
                  Once you delete this task, there is no going back. Please be certain.
                </p>
              </div>
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-colors flex items-center gap-2 flex-shrink-0"
                style={{ 
                  backgroundColor: "#C94F3D",
                  cursor: "pointer"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#B91C1C";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#C94F3D";
                }}
              >
                <Trash2 size={14} />
                Delete Task
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}