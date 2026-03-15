import { useState, useMemo } from "react";
import { Search, Filter, ChevronDown, ChevronUp, User, Clock, AlertCircle, CheckCircle2, MoreVertical, X, RefreshCw, Flag, Trash2 } from "lucide-react";
import type { Ticket, TicketStatus, TicketPriority } from "../InboxPage";
import { useUser } from "../../hooks/useUser";
import { apiFetch } from "../../utils/api";
import { toast } from "sonner@2.0.3";
import { CustomDropdown } from "../bd/CustomDropdown";

interface TicketManagementTableProps {
  tickets: Ticket[];
  isLoading: boolean;
  onTicketClick: (ticket: Ticket) => void;
  onTicketsUpdated: () => void;
  viewMode: "personal" | "department" | "company-wide";
  canAssignTickets?: boolean;
  canBulkEdit?: boolean;
  emptyMessage?: string;
  title?: string;
  showSearch?: boolean;
  showFilters?: boolean;
}

type SortField = "id" | "subject" | "priority" | "status" | "due_date" | "created_at";
type SortDirection = "asc" | "desc";

const PRIORITY_ORDER: Record<TicketPriority, number> = {
  "Urgent": 3,
  "High": 2,
  "Normal": 1
};

const STATUS_ORDER: Record<TicketStatus, number> = {
  "Open": 1,
  "Assigned": 2,
  "In Progress": 3,
  "Waiting on Requester": 4,
  "Resolved": 5,
  "Closed": 6
};

export function TicketManagementTable({
  tickets,
  isLoading,
  onTicketClick,
  onTicketsUpdated,
  viewMode,
  canAssignTickets = false,
  canBulkEdit = false,
  emptyMessage = "No tickets found",
  title,
  showSearch = true,
  showFilters = true
}: TicketManagementTableProps) {
  const { user, effectiveDepartment } = useUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<TicketStatus | "all">("all");
  const [selectedPriority, setSelectedPriority] = useState<TicketPriority | "all">("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedTickets, setSelectedTickets] = useState<Set<string>>(new Set());
  const [assigningTicketId, setAssigningTicketId] = useState<string | null>(null);
  const [bulkStatusValue, setBulkStatusValue] = useState<string>("");
  const [bulkPriorityValue, setBulkPriorityValue] = useState<string>("");

  // Filter and sort tickets
  const filteredAndSortedTickets = useMemo(() => {
    let result = [...tickets];

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(ticket =>
        ticket.id.toLowerCase().includes(query) ||
        ticket.subject.toLowerCase().includes(query) ||
        ticket.description.toLowerCase().includes(query) ||
        ticket.created_by_name.toLowerCase().includes(query) ||
        ticket.assigned_to_name?.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (selectedStatus !== "all") {
      result = result.filter(ticket => ticket.status === selectedStatus);
    }

    // Apply priority filter
    if (selectedPriority !== "all") {
      result = result.filter(ticket => ticket.priority === selectedPriority);
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "id":
          comparison = a.id.localeCompare(b.id);
          break;
        case "subject":
          comparison = a.subject.localeCompare(b.subject);
          break;
        case "priority":
          comparison = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
          break;
        case "status":
          comparison = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
          break;
        case "due_date":
          comparison = new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
          break;
        case "created_at":
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [tickets, searchQuery, selectedStatus, selectedPriority, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const handleSelectAll = () => {
    if (selectedTickets.size === filteredAndSortedTickets.length) {
      setSelectedTickets(new Set());
    } else {
      setSelectedTickets(new Set(filteredAndSortedTickets.map(t => t.id)));
    }
  };

  const handleSelectTicket = (ticketId: string) => {
    const newSelected = new Set(selectedTickets);
    if (newSelected.has(ticketId)) {
      newSelected.delete(ticketId);
    } else {
      newSelected.add(ticketId);
    }
    setSelectedTickets(newSelected);
  };

  const handleAssignTicket = async (ticketId: string, assignToUserId: string | null) => {
    setAssigningTicketId(ticketId);
    try {
      const response = await apiFetch(
        `/tickets/${ticketId}/assign`,
        {
          method: "PATCH",
          body: JSON.stringify({
            assigned_to: assignToUserId,
            assigned_by: user?.id
          })
        }
      );

      if (response.ok) {
        toast.success("Ticket assigned successfully");
        onTicketsUpdated();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to assign ticket");
      }
    } catch (error) {
      console.error("Error assigning ticket:", error);
      toast.error("Failed to assign ticket");
    } finally {
      setAssigningTicketId(null);
    }
  };

  // Bulk action handlers
  const handleBulkDelete = async () => {
    if (selectedTickets.size === 0) return;
    
    // Confirm before deleting
    if (!confirm(`Are you sure you want to delete ${selectedTickets.size} ticket(s)? This action cannot be undone.`)) {
      return;
    }
    
    try {
      const ticketIds = Array.from(selectedTickets);
      let successCount = 0;
      let failCount = 0;

      for (const ticketId of ticketIds) {
        try {
          const response = await apiFetch(
            `/tickets/${ticketId}`,
            {
              method: "DELETE",
            }
          );

          if (response.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} ticket(s) deleted successfully`);
        setSelectedTickets(new Set());
        onTicketsUpdated();
      }
      if (failCount > 0) {
        toast.error(`Failed to delete ${failCount} ticket(s)`);
      }
    } catch (error) {
      console.error("Bulk delete error:", error);
      toast.error("Failed to delete tickets");
    }
  };

  const handleBulkStatusChange = async (newStatus: TicketStatus) => {
    if (selectedTickets.size === 0) return;
    
    try {
      const ticketIds = Array.from(selectedTickets);
      let successCount = 0;
      let failCount = 0;

      for (const ticketId of ticketIds) {
        try {
          const response = await apiFetch(
            `/tickets/${ticketId}/status`,
            {
              method: "PATCH",
              body: JSON.stringify({
                status: newStatus,
                user_id: user?.id,
                user_name: user?.name || "Unknown"
              })
            }
          );

          if (response.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} ticket(s) updated to ${newStatus}`);
        setSelectedTickets(new Set());
        onTicketsUpdated();
      }
      if (failCount > 0) {
        toast.error(`Failed to update ${failCount} ticket(s)`);
      }
    } catch (error) {
      console.error("Bulk status change error:", error);
      toast.error("Failed to update tickets");
    }
  };

  const handleBulkPriorityChange = async (newPriority: TicketPriority) => {
    if (selectedTickets.size === 0) return;
    
    try {
      const ticketIds = Array.from(selectedTickets);
      let successCount = 0;
      let failCount = 0;

      for (const ticketId of ticketIds) {
        try {
          const response = await apiFetch(
            `/tickets/${ticketId}/priority`,
            {
              method: "PATCH",
              body: JSON.stringify({
                priority: newPriority
              })
            }
          );

          if (response.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} ticket(s) priority updated to ${newPriority}`);
        setSelectedTickets(new Set());
        onTicketsUpdated();
      }
      if (failCount > 0) {
        toast.error(`Failed to update ${failCount} ticket(s)`);
      }
    } catch (error) {
      console.error("Bulk priority change error:", error);
      toast.error("Failed to update ticket priorities");
    }
  };

  const getPriorityColor = (priority: TicketPriority) => {
    switch (priority) {
      case "Urgent":
        return { bg: "#FEE2E2", text: "#DC2626" };
      case "High":
        return { bg: "#FEF3C7", text: "#D97706" };
      case "Normal":
      default:
        return { bg: "#E0F2FE", text: "#0369A1" };
    }
  };

  const getStatusColor = (status: TicketStatus) => {
    switch (status) {
      case "Open":
        return { bg: "#DBEAFE", text: "#1E40AF" };
      case "Assigned":
        return { bg: "#E0E7FF", text: "#5B21B6" };
      case "In Progress":
        return { bg: "#FEF3C7", text: "#D97706" };
      case "Waiting on Requester":
        return { bg: "#FFEDD5", text: "#C2410C" };
      case "Resolved":
        return { bg: "#D1FAE5", text: "#047857" };
      case "Closed":
        return { bg: "#F3F4F6", text: "#4B5563" };
      default:
        return { bg: "#F3F4F6", text: "#6B7280" };
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
      return { text: `${diffHours}h`, color: "#DC2626", isUrgent: true };
    } else if (diffHours < 24) {
      return { text: `${diffHours}h`, color: "#D97706", isUrgent: false };
    } else if (diffDays === 1) {
      return { text: "1d", color: "#667085", isUrgent: false };
    } else {
      return { text: `${diffDays}d`, color: "#667085", isUrgent: false };
    }
  };

  if (isLoading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "400px"
      }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "16px"
        }}>
          <div style={{
            width: "40px",
            height: "40px",
            border: "3px solid #E5E9F0",
            borderTop: "3px solid #0F766E",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite"
          }} />
          <p style={{ color: "#667085", fontSize: "14px" }}>Loading tickets...</p>
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Checkbox styling */}
      <style>{`
        input[type="checkbox"] {
          width: 18px;
          height: 18px;
          border: 2px solid #E5E9F0;
          border-radius: 4px;
          background: #FFFFFF;
          cursor: pointer;
          appearance: none;
          position: relative;
          transition: all 150ms ease;
        }
        
        input[type="checkbox"]:checked {
          background: #0F766E;
          border-color: #0F766E;
        }
        
        input[type="checkbox"]:checked::after {
          content: '';
          position: absolute;
          left: 5px;
          top: 2px;
          width: 4px;
          height: 8px;
          border: solid white;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }
        
        input[type="checkbox"]:hover {
          border-color: #0F766E;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Search and Filters Bar */}
      {(showSearch || showFilters) && (
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {/* Search */}
          {showSearch && (
            <div style={{ flex: 1, position: "relative", maxWidth: "480px" }}>
              <Search
                size={18}
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#667085"
                }}
              />
              <input
                type="text"
                placeholder="Search tickets by ID, subject, or assignee..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  height: "40px",
                  paddingLeft: "40px",
                  paddingRight: "12px",
                  border: "1px solid #E5E9F0",
                  borderRadius: "8px",
                  fontSize: "14px",
                  color: "#12332B",
                  outline: "none"
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = "#0F766E"}
                onBlur={(e) => e.currentTarget.style.borderColor = "#E5E9F0"}
              />
            </div>
          )}

          {/* Filters Group */}
          {showFilters && (
            <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
              {/* Status Filter */}
              <div style={{ minWidth: "200px" }}>
                <CustomDropdown
                  label="STATUS"
                  value={selectedStatus}
                  onChange={(value) => setSelectedStatus(value as TicketStatus | "all")}
                  options={[
                    { value: "all", label: "All Statuses" },
                    { value: "Open", label: "Open" },
                    { value: "Assigned", label: "Assigned" },
                    { value: "In Progress", label: "In Progress" },
                    { value: "Waiting on Requester", label: "Waiting on Requester" },
                    { value: "Resolved", label: "Resolved" },
                    { value: "Closed", label: "Closed" }
                  ]}
                />
              </div>

              {/* Priority Filter */}
              <div style={{ minWidth: "180px" }}>
                <CustomDropdown
                  label="PRIORITY"
                  value={selectedPriority}
                  onChange={(value) => setSelectedPriority(value as TicketPriority | "all")}
                  options={[
                    { value: "all", label: "All Priorities" },
                    { value: "Urgent", label: "Urgent" },
                    { value: "High", label: "High" },
                    { value: "Normal", label: "Normal" }
                  ]}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk Actions Bar - Sticky */}
      {canBulkEdit && selectedTickets.size > 0 && (
        <div style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          padding: "16px 24px",
          background: "#FFFFFF",
          border: "1px solid #0F766E",
          borderRadius: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          {/* Left side - Selection info */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <CheckCircle2 size={20} style={{ color: "#0F766E" }} />
              <span style={{ color: "#12332B", fontWeight: 600, fontSize: "14px" }}>
                {selectedTickets.size} ticket{selectedTickets.size !== 1 ? 's' : ''} selected
              </span>
            </div>
            <button
              onClick={() => setSelectedTickets(new Set())}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "6px 12px",
                background: "#FFFFFF",
                border: "1px solid #E5E9F0",
                borderRadius: "6px",
                color: "#667085",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 150ms ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#F9FAFB";
                e.currentTarget.style.borderColor = "#0F766E";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#FFFFFF";
                e.currentTarget.style.borderColor = "#E5E9F0";
              }}
            >
              <X size={14} />
              Clear Selection
            </button>
          </div>

          {/* Right side - Action buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Change Status */}
            <div style={{ minWidth: "180px" }}>
              <CustomDropdown
                label=""
                value={bulkStatusValue}
                onChange={(value) => {
                  if (value) {
                    handleBulkStatusChange(value as TicketStatus);
                    setBulkStatusValue(""); // Reset after action
                  }
                }}
                options={[
                  { value: "", label: "Change Status" },
                  { value: "Open", label: "→ Open" },
                  { value: "Assigned", label: "→ Assigned" },
                  { value: "In Progress", label: "→ In Progress" },
                  { value: "Waiting on Requester", label: "→ Waiting on Requester" },
                  { value: "Resolved", label: "→ Resolved" },
                  { value: "Closed", label: "→ Closed" }
                ]}
                placeholder="Change Status"
              />
            </div>

            {/* Change Priority */}
            <div style={{ minWidth: "180px" }}>
              <CustomDropdown
                label=""
                value={bulkPriorityValue}
                onChange={(value) => {
                  if (value) {
                    handleBulkPriorityChange(value as TicketPriority);
                    setBulkPriorityValue(""); // Reset after action
                  }
                }}
                options={[
                  { value: "", label: "Change Priority" },
                  { value: "Urgent", label: "→ Urgent" },
                  { value: "High", label: "→ High" },
                  { value: "Normal", label: "→ Normal" }
                ]}
                placeholder="Change Priority"
              />
            </div>

            {/* Delete */}
            <button
              onClick={handleBulkDelete}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                background: "#FFFFFF",
                border: "1px solid #E5E9F0",
                borderRadius: "8px",
                color: "#DC2626",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 150ms ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#FEE2E2";
                e.currentTarget.style.borderColor = "#DC2626";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#FFFFFF";
                e.currentTarget.style.borderColor = "#E5E9F0";
              }}
            >
              <Trash2 size={16} />
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {filteredAndSortedTickets.length === 0 ? (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "400px",
          background: "#F9FAFB",
          borderRadius: "16px",
          border: "1px solid #E5E9F0"
        }}>
          <div style={{
            textAlign: "center",
            color: "#667085",
            fontSize: "14px"
          }}>
            <p>{emptyMessage}</p>
          </div>
        </div>
      ) : (
        <div style={{
          border: "1px solid #E5E9F0",
          borderRadius: "12px",
          overflow: "hidden",
          background: "#FFFFFF"
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E9F0" }}>
                {canBulkEdit && (
                  <th style={{ width: "40px", padding: "12px 16px", textAlign: "left" }}>
                    <input
                      type="checkbox"
                      checked={selectedTickets.size === filteredAndSortedTickets.length && filteredAndSortedTickets.length > 0}
                      onChange={handleSelectAll}
                      style={{ cursor: "pointer" }}
                    />
                  </th>
                )}
                <th
                  onClick={() => handleSort("id")}
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#667085",
                    cursor: "pointer",
                    userSelect: "none"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    ID
                    {sortField === "id" && (
                      sortDirection === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("subject")}
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#667085",
                    cursor: "pointer",
                    userSelect: "none"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    Subject
                    {sortField === "subject" && (
                      sortDirection === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("priority")}
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#667085",
                    cursor: "pointer",
                    userSelect: "none",
                    width: "120px"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    Priority
                    {sortField === "priority" && (
                      sortDirection === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort("status")}
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#667085",
                    cursor: "pointer",
                    userSelect: "none",
                    width: "140px"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    Status
                    {sortField === "status" && (
                      sortDirection === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th style={{
                  padding: "12px 16px",
                  textAlign: "left",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#667085",
                  width: "160px"
                }}>
                  Assignee
                </th>
                <th
                  onClick={() => handleSort("due_date")}
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#667085",
                    cursor: "pointer",
                    userSelect: "none",
                    width: "100px"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    Due
                    {sortField === "due_date" && (
                      sortDirection === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                {canAssignTickets && (
                  <th style={{
                    padding: "12px 16px",
                    textAlign: "center",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#667085",
                    width: "80px"
                  }}>
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedTickets.map((ticket, index) => {
                const priorityColors = getPriorityColor(ticket.priority);
                const statusColors = getStatusColor(ticket.status);
                const dueTime = getDueTimeDisplay(ticket.due_date);

                return (
                  <tr
                    key={ticket.id}
                    style={{
                      borderBottom: index < filteredAndSortedTickets.length - 1 ? "1px solid #E5E9F0" : "none",
                      cursor: "pointer",
                      transition: "background 150ms ease"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#F9FAFB"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "#FFFFFF"}
                    onClick={() => onTicketClick(ticket)}
                  >
                    {canBulkEdit && (
                      <td
                        style={{ padding: "12px 16px" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTickets.has(ticket.id)}
                          onChange={() => handleSelectTicket(ticket.id)}
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                    )}
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "#667085"
                      }}>
                        {ticket.id}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "#12332B",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "400px"
                        }}>
                          {ticket.subject}
                        </span>
                        <span style={{
                          fontSize: "13px",
                          color: "#667085",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "400px"
                        }}>
                          From: {ticket.created_by_name} ({ticket.from_department})
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "4px 10px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        background: priorityColors.bg,
                        color: priorityColors.text
                      }}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "4px 10px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 500,
                        background: statusColors.bg,
                        color: statusColors.text
                      }}>
                        {ticket.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {ticket.assigned_to_name ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <User size={14} style={{ color: "#0F766E" }} />
                          <span style={{ fontSize: "13px", color: "#0F766E", fontWeight: 500 }}>
                            {ticket.assigned_to_name}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: "13px", color: "#667085", fontStyle: "italic" }}>
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        {dueTime.isUrgent && <AlertCircle size={14} style={{ color: dueTime.color }} />}
                        <span style={{
                          fontSize: "13px",
                          color: dueTime.color,
                          fontWeight: dueTime.isUrgent ? 600 : 400
                        }}>
                          {dueTime.text}
                        </span>
                      </div>
                    </td>
                    {canAssignTickets && (
                      <td
                        style={{ padding: "12px 16px", textAlign: "center" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => {
                            // For now, just assign to current user or unassign
                            // In production, this would open an assignment modal
                            if (ticket.assigned_to === user?.id) {
                              handleAssignTicket(ticket.id, null);
                            } else {
                              handleAssignTicket(ticket.id, user?.id || null);
                            }
                          }}
                          disabled={assigningTicketId === ticket.id}
                          style={{
                            padding: "6px 12px",
                            border: "1px solid #E5E9F0",
                            borderRadius: "6px",
                            background: "#FFFFFF",
                            color: "#0F766E",
                            fontSize: "12px",
                            fontWeight: 500,
                            cursor: "pointer"
                          }}
                        >
                          {assigningTicketId === ticket.id ? "..." : (ticket.assigned_to === user?.id ? "Unassign" : "Assign Me")}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}