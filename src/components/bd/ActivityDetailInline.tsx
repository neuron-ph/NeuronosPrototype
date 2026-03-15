import { apiFetch } from '../../utils/api';
import { ArrowLeft, User, Building2, Calendar, MessageSquare, Upload, Paperclip, Send, Trash2, FileText, Download } from "lucide-react";
import { useState, useEffect } from "react";
import type { Activity, Contact, Customer } from "../../types/bd";
import { toast } from "../ui/toast-utils";

interface ActivityDetailInlineProps {
  activity: Activity;
  onBack: () => void;
  onUpdate?: () => void; // Callback to refresh parent list
  onDelete?: () => void; // Callback after delete
  contactInfo?: Contact | null; // Full contact object passed from parent
  customerInfo?: Customer | null; // Full customer object passed from parent
  userName?: string; // User name passed from parent
}

interface Comment {
  id: string;
  user: string;
  text: string;
  timestamp: string;
}

interface Attachment {
  name: string;
  size: number;
  type: string;
  url?: string;
}

export function ActivityDetailInline({ 
  activity, 
  onBack,
  onUpdate,
  onDelete,
  contactInfo = null,
  customerInfo = null,
  userName = "—"
}: ActivityDetailInlineProps) {
  const [newComment, setNewComment] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>(activity.attachments || []);

  // Update attachments if activity prop changes
  useEffect(() => {
    if (activity.attachments) {
      setAttachments(activity.attachments);
    }
  }, [activity.attachments]);

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

  const contact = contactInfo;
  const customer = customerInfo;

  const handleAddComment = () => {
    if (newComment.trim()) {
      const comment: Comment = {
        id: Date.now().toString(),
        user: userName || "Current User",
        text: newComment,
        timestamp: new Date().toISOString()
      };
      setComments([...comments, comment]);
      setNewComment("");
      toast.success('Comment added');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this activity? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await apiFetch(`/activities/${activity.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        toast.success('Activity deleted successfully');
        if (onDelete) {
          onDelete(); // Callback will navigate back and refresh
        } else {
          onBack(); // Just go back if no callback provided
        }
      } else {
        toast.error('Error deleting activity: ' + result.error);
      }
    } catch (error) {
      console.error('Error deleting activity:', error);
      toast.error('Unable to delete activity. Please try again.');
    }
  };

  const handleUpload = () => {
    // Placeholder for upload functionality
    // In a real app, this would trigger a file input and upload to storage
    toast.info("Upload functionality coming soon");
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-2 rounded-lg transition-colors"
          style={{
            border: "1px solid var(--neuron-ui-border)",
            backgroundColor: "#FFFFFF"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#F9FAFB";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#FFFFFF";
          }}
        >
          <ArrowLeft size={16} style={{ color: "#12332B" }} />
        </button>
        <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#12332B" }}>
          Activity Details
        </h3>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-auto space-y-4">
        {/* Activity Type & Date */}
        <div 
          className="rounded-lg p-4"
          style={{
            border: "1px solid var(--neuron-ui-border)",
            backgroundColor: "#FFFFFF"
          }}
        >
          <div className="mb-3">
            <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--neuron-ink-muted)" }}>
              Type
            </label>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: "#E8F5F3" }}>
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#0F766E" }} />
              <span className="text-[12px] font-medium uppercase tracking-wide" style={{ color: "#0F766E" }}>
                {activity.type}
              </span>
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--neuron-ink-muted)" }}>
              <Calendar size={11} className="inline mr-1" />
              Date
            </label>
            <span className="text-[13px]" style={{ color: "#12332B" }}>
              {formatDateTime(activity.date)}
            </span>
          </div>

          {/* Metadata */}
          <div className="pt-4 border-t space-y-3" style={{ borderColor: "var(--neuron-ui-divider)" }}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wide" style={{ color: "#667085" }}>Created</span>
              <span className="text-[13px]" style={{ color: "#12332B" }}>{formatDateTime(activity.created_at)}</span>
            </div>
            {activity.updated_at && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide" style={{ color: "#667085" }}>Last Updated</span>
                <span className="text-[13px]" style={{ color: "#12332B" }}>{formatDateTime(activity.updated_at)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        <div 
          className="rounded-lg p-4"
          style={{
            border: "1px solid var(--neuron-ui-border)",
            backgroundColor: "#FFFFFF"
          }}
        >
          <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--neuron-ink-muted)" }}>
            <MessageSquare size={11} className="inline mr-1" />
            Description
          </label>
          <p className="text-[13px]" style={{ color: "#12332B" }}>
            {activity.description}
          </p>
        </div>

        {/* Logged By */}
        <div 
          className="rounded-lg p-4"
          style={{
            border: "1px solid var(--neuron-ui-border)",
            backgroundColor: "#FFFFFF"
          }}
        >
          <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--neuron-ink-muted)" }}>
            Logged By
          </label>
          <span className="text-[13px]" style={{ color: "#12332B" }}>
            {userName}
          </span>
        </div>

        {/* Related Contact & Customer */}
        {(contact || customer) && (
          <div 
            className="rounded-lg p-4"
            style={{
              border: "1px solid var(--neuron-ui-border)",
              backgroundColor: "#FFFFFF"
            }}
          >
            <h4 className="text-[12px] font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--neuron-ink-muted)" }}>
              Related To
            </h4>

            <div className="space-y-3">
              {contact && (
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--neuron-ink-muted)" }}>
                    Related Contact
                  </label>
                  <div className="flex items-start gap-2">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: "#F3F4F6",
                        border: "1px solid var(--neuron-ui-divider)"
                      }}
                    >
                      <User size={14} style={{ color: "#9CA3AF" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5 className="text-[12px] font-medium" style={{ color: "var(--neuron-ink-primary)" }}>
                        {`${contact.first_name || ''} ${contact.last_name || ''}`.trim()}
                      </h5>
                      <p className="text-[11px]" style={{ color: "var(--neuron-ink-muted)" }}>
                        {contact.title}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {customer && (
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--neuron-ink-muted)" }}>
                    Related Customer
                  </label>
                  <div className="flex items-start gap-2">
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: "#E8F5F3",
                        border: "1px solid #0F766E30"
                      }}
                    >
                      <Building2 size={14} style={{ color: "#0F766E" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5 className="text-[12px] font-medium" style={{ color: "var(--neuron-ink-primary)" }}>
                        {customer.name}
                      </h5>
                      <p className="text-[11px]" style={{ color: "var(--neuron-ink-muted)" }}>
                        {customer.industry}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Attachments Section */}
        <div>
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
                onClick={handleUpload}
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
                    <div className="flex items-center justify-center w-8 h-8 rounded bg-gray-100 flex-shrink-0">
                      <FileText size={16} style={{ color: "#667085" }} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate" style={{ color: "#12332B" }}>
                        {file.name}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {(file.size / 1024).toFixed(0)} KB • {file.type.split('/').pop()?.toUpperCase() || 'FILE'}
                      </div>
                    </div>

                    <button
                      className="p-2 text-gray-400 hover:text-[#0F766E] transition-colors"
                      title="Download"
                    >
                      <Download size={16} />
                    </button>
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
        <div>
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
                  Delete this activity
                </h4>
                <p className="text-[12px]" style={{ color: "#667085" }}>
                  Once you delete this activity, there is no going back. Please be certain.
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
                Delete Activity
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}