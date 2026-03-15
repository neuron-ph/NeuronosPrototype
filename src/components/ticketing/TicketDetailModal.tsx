import { useState, useEffect } from "react";
import { X, Send, ExternalLink, FileText, Building2, AlertCircle, MessageCircle, Clock, User, Activity } from "lucide-react";
import { useNavigate } from "react-router";
import { useUser } from "../../hooks/useUser";
import { apiFetch } from "../../utils/api";
import { toast } from "sonner@2.0.3";
import type { Ticket } from "../InboxPage";
import { CustomDropdown } from "../bd/CustomDropdown";

interface TicketDetailModalProps {
  ticket: Ticket;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

interface Comment {
  id: string;
  ticket_id: string;
  user_id: string;
  user_name: string;
  user_department: string;
  content: string;
  created_at: string;
}

interface TicketActivity {
  id: string;
  ticket_id: string;
  action_type: string;
  user_id: string;
  user_name: string;
  user_department: string;
  old_value: string | null;
  new_value: string | null;
  metadata: any;
  timestamp: string;
}

export function TicketDetailModal({ ticket, isOpen, onClose, onUpdate }: TicketDetailModalProps) {
  const { user, effectiveRole, effectiveDepartment } = useUser();
  const [comments, setComments] = useState<Comment[]>([]);
  const [activities, setActivities] = useState<TicketActivity[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(ticket.status);
  
  // Check if user can view activity log
  const canViewActivity = effectiveRole === "director" || effectiveRole === "manager";
  
  useEffect(() => {
    if (isOpen && ticket) {
      loadComments();
      setSelectedStatus(ticket.status);
      
      // Load activities only if user has permission
      if (canViewActivity) {
        loadActivities();
      }
    }
  }, [isOpen, ticket, canViewActivity]);
  
  const loadComments = async () => {
    setIsLoadingComments(true);
    try {
      const response = await apiFetch(`/tickets/${ticket.id}`);
      const result = await response.json();
      if (result.success && result.data.comments) {
        setComments(result.data.comments);
      }
    } catch (error) {
      console.error("Failed to load comments:", error);
    } finally {
      setIsLoadingComments(false);
    }
  };
  
  const loadActivities = async () => {
    setIsLoadingActivities(true);
    try {
      const response = await apiFetch(
        `/tickets/${ticket.id}/activity?role=${effectiveRole}&department=${effectiveDepartment}`
      );
      const result = await response.json();
      if (result.success) {
        setActivities(result.data);
      }
    } catch (error) {
      console.error("Failed to load activities:", error);
    } finally {
      setIsLoadingActivities(false);
    }
  };
  
  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    
    setIsAddingComment(true);
    try {
      const response = await apiFetch(`/tickets/${ticket.id}/comments`, {
        method: "POST",
        body: JSON.stringify({
          user_id: user?.id || "",
          user_name: user?.name || "",
          user_department: user?.department || "",
          content: newComment
        })
      });
      
      const result = await response.json();
      if (result.success) {
        toast.success("Comment added");
        setNewComment("");
        loadComments();
        if (canViewActivity) {
          loadActivities(); // Refresh activity log
        }
        onUpdate();
      }
    } catch (error) {
      console.error("Failed to add comment:", error);
      toast.error("Failed to add comment");
    } finally {
      setIsAddingComment(false);
    }
  };
  
  const handleUpdateStatus = async (newStatus: string) => {
    setIsUpdatingStatus(true);
    try {
      const response = await apiFetch(`/tickets/${ticket.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ 
          status: newStatus,
          user_id: user?.id || "",
          user_name: user?.name || "",
          user_department: user?.department || ""
        })
      });
      
      const result = await response.json();
      if (result.success) {
        toast.success("Status updated");
        setSelectedStatus(newStatus);
        if (canViewActivity) {
          loadActivities(); // Refresh activity log
        }
        onUpdate();
      }
    } catch (error) {
      console.error("Failed to update status:", error);
      toast.error("Failed to update status");
    } finally {
      setIsUpdatingStatus(false);
    }
  };
  
  const handleOpenEntity = (entity: { type: string; id: string }) => {
    // Navigate to the entity detail view
    if (entity.type === "quotation") {
      // Determine if BD or Pricing based on user department
      const basePath = user?.department === "Business Development" ? "/bd/inquiries" : "/pricing/quotations";
      navigate(`${basePath}/${entity.id}`);
      onClose();
    } else if (entity.type === "booking") {
      navigate(`/operations/${entity.id}`);
      onClose();
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "Urgent":
        return { color: "#E35858", bgColor: "#FEEAEA", borderColor: "#E35858" };
      case "High":
        return { color: "#E87A3D", bgColor: "#FEF0E6", borderColor: "#E87A3D" };
      case "Normal":
      default:
        return { color: "#16A67C", bgColor: "#E8F5F0", borderColor: "#16A67C" };
    }
  };

  const getDueTimeDisplay = (dueDate: string) => {
    const now = new Date();
    const due = new Date(dueDate);
    const diffMs = due.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffMs < 0) {
      return { text: "Overdue", color: "#DC2626", isUrgent: true };
    } else if (diffHours < 4) {
      return { text: `Due in ${diffHours}h`, color: "#DC2626", isUrgent: true };
    } else if (diffHours < 24) {
      return { text: `Due in ${diffHours}h`, color: "#D97706", isUrgent: false };
    } else if (diffDays === 1) {
      return { text: "Due tomorrow", color: "#667085", isUrgent: false };
    } else {
      return { text: `Due in ${diffDays} days`, color: "#667085", isUrgent: false };
    }
  };

  const formatActivityMessage = (activity: TicketActivity) => {
    switch (activity.action_type) {
      case "ticket_created":
        return "created this ticket";
      case "status_changed":
        return `changed status from "${activity.old_value}" to "${activity.new_value}"`;
      case "comment_added":
        return "added a comment";
      case "priority_changed":
        return `changed priority from "${activity.old_value}" to "${activity.new_value}"`;
      case "assigned_changed":
        return `assigned ticket to ${activity.new_value}`;
      default:
        return `performed action: ${activity.action_type}`;
    }
  };
  
  if (!isOpen) return null;

  const priorityColors = getPriorityColor(ticket.priority);
  const dueTime = getDueTimeDisplay(ticket.due_date);
  
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
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span style={{ 
                fontSize: "14px", 
                fontWeight: 600, 
                color: "#667085", 
                fontFamily: "monospace",
                letterSpacing: "0.5px"
              }}>
                {ticket.id}
              </span>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                background: priorityColors.bgColor,
                color: priorityColors.color,
                border: `1px solid ${priorityColors.borderColor}`
              }}>
                {ticket.priority}
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Status Dropdown */}
              <div style={{ minWidth: "200px" }}>
                <CustomDropdown
                  label=""
                  value={selectedStatus}
                  onChange={handleUpdateStatus}
                  options={[
                    { value: "Open", label: "Open" },
                    { value: "Assigned", label: "Assigned" },
                    { value: "In Progress", label: "In Progress" },
                    { value: "Waiting on Requester", label: "Waiting on Requester" },
                    { value: "Resolved", label: "Resolved" },
                    { value: "Closed", label: "Closed" }
                  ]}
                />
              </div>
              
              {/* Close Button */}
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
          </div>
          <h2 style={{ 
            fontSize: "24px", 
            fontWeight: 600, 
            color: "#12332B", 
            marginBottom: "8px",
            lineHeight: "1.3"
          }}>
            {ticket.subject}
          </h2>
          {ticket.description && (
            <p style={{ fontSize: "14px", color: "#667085", lineHeight: "1.5" }}>
              {ticket.description}
            </p>
          )}
        </div>
        
        {/* Content - Scrollable */}
        <div className="flex-1 overflow-auto px-12 py-8">
          {/* TICKET INFORMATION Section */}
          <div style={{ marginBottom: "32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
              <FileText size={16} style={{ color: "#0F766E" }} />
              <h3 style={{ 
                fontSize: "14px", 
                fontWeight: 600, 
                color: "#12332B", 
                textTransform: "uppercase", 
                letterSpacing: "0.5px" 
              }}>
                Ticket Information
              </h3>
            </div>

            <div className="space-y-4">
              {/* From */}
              <div>
                <label style={{ 
                  display: "block", 
                  fontSize: "13px", 
                  fontWeight: 500, 
                  color: "#667085", 
                  marginBottom: "6px" 
                }}>
                  From
                </label>
                <div style={{ fontSize: "14px", color: "#12332B", fontWeight: 500 }}>
                  {ticket.created_by_name} ({ticket.from_department})
                </div>
              </div>

              {/* To Department */}
              <div>
                <label style={{ 
                  display: "block", 
                  fontSize: "13px", 
                  fontWeight: 500, 
                  color: "#667085", 
                  marginBottom: "6px" 
                }}>
                  To Department
                </label>
                <div style={{ fontSize: "14px", color: "#12332B", fontWeight: 500 }}>
                  {ticket.to_department}
                </div>
              </div>

              {/* Assigned To */}
              <div>
                <label style={{ 
                  display: "block", 
                  fontSize: "13px", 
                  fontWeight: 500, 
                  color: "#667085", 
                  marginBottom: "6px" 
                }}>
                  Assigned To
                </label>
                <div style={{ 
                  fontSize: "14px", 
                  color: ticket.assigned_to_name ? "#0F766E" : "#667085", 
                  fontWeight: 500,
                  fontStyle: ticket.assigned_to_name ? "normal" : "italic"
                }}>
                  {ticket.assigned_to_name || "Unassigned"}
                </div>
              </div>

              {/* Due Date */}
              <div>
                <label style={{ 
                  display: "block", 
                  fontSize: "13px", 
                  fontWeight: 500, 
                  color: "#667085", 
                  marginBottom: "6px" 
                }}>
                  Due Date
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Clock size={14} style={{ color: dueTime.color }} />
                  <span style={{ 
                    fontSize: "14px", 
                    color: dueTime.color, 
                    fontWeight: dueTime.isUrgent ? 600 : 500 
                  }}>
                    {dueTime.text}
                  </span>
                  <span style={{ fontSize: "13px", color: "#9CA3AF" }}>
                    ({new Date(ticket.due_date).toLocaleDateString()})
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Related Entities Section */}
          {ticket.related_entities && ticket.related_entities.length > 0 && (
            <div style={{ marginBottom: "32px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
                <ExternalLink size={16} style={{ color: "#0F766E" }} />
                <h3 style={{ 
                  fontSize: "14px", 
                  fontWeight: 600, 
                  color: "#12332B", 
                  textTransform: "uppercase", 
                  letterSpacing: "0.5px" 
                }}>
                  Related To
                </h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {ticket.related_entities.map((entity, index) => (
                  <button
                    key={index}
                    onClick={() => handleOpenEntity(entity)}
                    style={{
                      padding: "16px",
                      borderRadius: "8px",
                      border: "1px solid var(--neuron-ui-border)",
                      background: "#FFFFFF",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "all 150ms ease"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#0F766E";
                      e.currentTarget.style.background = "#F9FAFB";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--neuron-ui-border)";
                      e.currentTarget.style.background = "#FFFFFF";
                    }}
                  >
                    <div>
                      <div style={{ 
                        fontSize: "11px", 
                        color: "#667085", 
                        marginBottom: "4px",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px"
                      }}>
                        {entity.type}
                      </div>
                      <div style={{ fontSize: "14px", color: "#12332B", fontWeight: 500 }}>
                        {entity.name || entity.id}
                      </div>
                    </div>
                    <ExternalLink size={16} style={{ color: "#667085" }} />
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* COMMENTS Section */}
          <div style={{ marginBottom: canViewActivity ? "32px" : "0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
              <MessageCircle size={16} style={{ color: "#0F766E" }} />
              <h3 style={{ 
                fontSize: "14px", 
                fontWeight: 600, 
                color: "#12332B", 
                textTransform: "uppercase", 
                letterSpacing: "0.5px" 
              }}>
                Comments ({comments.length})
              </h3>
            </div>
            
            {/* Comments List */}
            <div style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {isLoadingComments ? (
                <div style={{ 
                  textAlign: "center", 
                  padding: "32px", 
                  color: "#667085",
                  background: "#F9FAFB",
                  borderRadius: "8px",
                  border: "1px solid var(--neuron-ui-border)"
                }}>
                  Loading comments...
                </div>
              ) : comments.length === 0 ? (
                <div style={{ 
                  textAlign: "center", 
                  padding: "32px", 
                  color: "#667085", 
                  background: "#F9FAFB", 
                  borderRadius: "8px",
                  border: "1px solid var(--neuron-ui-border)"
                }}>
                  No comments yet. Be the first to comment!
                </div>
              ) : (
                comments.map(comment => (
                  <div
                    key={comment.id}
                    style={{
                      padding: "16px",
                      background: "#F9FAFB",
                      borderRadius: "8px",
                      border: "1px solid var(--neuron-ui-border)"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <div 
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "50%",
                          background: "#E8F2EE",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                      >
                        <User size={14} style={{ color: "#0F766E" }} />
                      </div>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#12332B" }}>
                        {comment.user_name}
                      </span>
                      <span style={{ fontSize: "12px", color: "#667085" }}>
                        ({comment.user_department})
                      </span>
                      <span style={{ fontSize: "12px", color: "#9CA3AF" }}>
                        • {new Date(comment.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p style={{ 
                      fontSize: "14px", 
                      color: "#374151", 
                      whiteSpace: "pre-wrap",
                      lineHeight: "1.5",
                      marginLeft: "36px"
                    }}>
                      {comment.content}
                    </p>
                  </div>
                ))
              )}
            </div>
            
            {/* Add Comment */}
            <div>
              <label style={{ 
                display: "block", 
                fontSize: "13px", 
                fontWeight: 500, 
                color: "#12332B", 
                marginBottom: "8px" 
              }}>
                Add a comment
              </label>
              <div style={{ display: "flex", gap: "12px" }}>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Type your comment here..."
                  rows={3}
                  className="flex-1 px-3.5 py-2.5 rounded-lg focus:outline-none focus:ring-2 text-[13px] resize-none"
                  style={{
                    border: "1px solid var(--neuron-ui-border)",
                    backgroundColor: "#FFFFFF",
                    color: "var(--neuron-ink-primary)"
                  }}
                />
                <button
                  onClick={handleAddComment}
                  disabled={isAddingComment || !newComment.trim()}
                  className="px-6 py-2.5 rounded-lg transition-all flex items-center gap-2"
                  style={{
                    backgroundColor: (newComment.trim() && !isAddingComment) ? "#0F766E" : "#D1D5DB",
                    color: "#FFFFFF",
                    fontSize: "14px",
                    fontWeight: 600,
                    border: "none",
                    cursor: (newComment.trim() && !isAddingComment) ? "pointer" : "not-allowed",
                    opacity: (newComment.trim() && !isAddingComment) ? 1 : 0.6,
                    alignSelf: "flex-end"
                  }}
                  onMouseEnter={(e) => {
                    if (newComment.trim() && !isAddingComment) {
                      e.currentTarget.style.backgroundColor = "#0D6560";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (newComment.trim() && !isAddingComment) {
                      e.currentTarget.style.backgroundColor = "#0F766E";
                    }
                  }}
                >
                  <Send size={16} />
                  {isAddingComment ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </div>
          
          {/* ACTIVITY LOG Section */}
          {canViewActivity && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
                <Activity size={16} style={{ color: "#0F766E" }} />
                <h3 style={{ 
                  fontSize: "14px", 
                  fontWeight: 600, 
                  color: "#12332B", 
                  textTransform: "uppercase", 
                  letterSpacing: "0.5px" 
                }}>
                  Activity Log ({activities.length})
                </h3>
              </div>
              
              {/* Activity List */}
              <div style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                {isLoadingActivities ? (
                  <div style={{ 
                    textAlign: "center", 
                    padding: "32px", 
                    color: "#667085",
                    background: "#F9FAFB",
                    borderRadius: "8px",
                    border: "1px solid var(--neuron-ui-border)"
                  }}>
                    Loading activities...
                  </div>
                ) : activities.length === 0 ? (
                  <div style={{ 
                    textAlign: "center", 
                    padding: "32px", 
                    color: "#667085", 
                    background: "#F9FAFB", 
                    borderRadius: "8px",
                    border: "1px solid var(--neuron-ui-border)"
                  }}>
                    No activities yet.
                  </div>
                ) : (
                  activities.map(activity => (
                    <div
                      key={activity.id}
                      style={{
                        padding: "16px",
                        background: "#F9FAFB",
                        borderRadius: "8px",
                        border: "1px solid var(--neuron-ui-border)"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                        <div 
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "50%",
                            background: "#E8F2EE",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                        >
                          <User size={14} style={{ color: "#0F766E" }} />
                        </div>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "#12332B" }}>
                          {activity.user_name}
                        </span>
                        <span style={{ fontSize: "12px", color: "#667085" }}>
                          ({activity.user_department})
                        </span>
                        <span style={{ fontSize: "12px", color: "#9CA3AF" }}>
                          • {new Date(activity.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p style={{ 
                        fontSize: "14px", 
                        color: "#374151", 
                        whiteSpace: "pre-wrap",
                        lineHeight: "1.5",
                        marginLeft: "36px"
                      }}>
                        {formatActivityMessage(activity)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
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