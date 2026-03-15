import { useState, useEffect } from "react";
import { Mail, Plus, Filter } from "lucide-react";
import { TicketsList } from "./ticketing/TicketsList";
import { TicketManagementTable } from "./ticketing/TicketManagementTable";
import { TicketDetailModal } from "./ticketing/TicketDetailModal";
import { NewTicketPanel } from "./ticketing/NewTicketPanel";
import { useUser } from "../hooks/useUser";
import { apiFetch } from "../utils/api";

export type TicketStatus = "Open" | "Assigned" | "In Progress" | "Waiting on Requester" | "Resolved" | "Closed";
export type TicketPriority = "Normal" | "High" | "Urgent";

export interface Ticket {
  id: string;
  ticket_type: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  created_by: string;
  created_by_name: string;
  from_department: string;
  to_department: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_at: string | null;
  related_entities: Array<{ type: string; id: string; name?: string }>;
  due_date: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
}

type MainTabType = "tasks" | "requests";
type SubTabType = "todo" | "in-progress" | "completed";

export function InboxPage() {
  const { user, effectiveDepartment, effectiveRole } = useUser();
  const [activeMainTab, setActiveMainTab] = useState<MainTabType>("tasks");
  const [activeSubTab, setActiveSubTab] = useState<SubTabType>("todo");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  
  // Check if user is manager or director
  const isManager = effectiveRole === 'manager' || effectiveRole === 'director';
  
  useEffect(() => {
    loadTickets();
  }, [user, effectiveDepartment]); // Re-fetch when effective department changes
  
  const loadTickets = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const response = await apiFetch(
        `/tickets?user_id=${user.id}&role=${effectiveRole}&department=${effectiveDepartment}`
      );
      
      if (response.ok) {
        const data = await response.json();
        setTickets(data.data || []);
      }
    } catch (error) {
      console.error("Failed to load tickets:", error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Filter tickets based on active tab
  const getFilteredTickets = (): Ticket[] => {
    if (activeMainTab === "tasks") {
      // My Tasks - tickets where I'm the assignee
      const myTasks = tickets.filter(t => t.assigned_to === user?.id);
      
      switch (activeSubTab) {
        case "todo":
          return myTasks.filter(t => t.status === "Open" || t.status === "Assigned");
        case "in-progress":
          return myTasks.filter(t => t.status === "In Progress" || t.status === "Waiting on Requester");
        case "completed":
          return myTasks.filter(t => t.status === "Resolved" || t.status === "Closed");
        default:
          return [];
      }
    } else {
      // My Requests - tickets where I'm the requester
      const myRequests = tickets.filter(t => t.created_by === user?.id);
      
      switch (activeSubTab) {
        case "todo":
          return myRequests.filter(t => t.status === "Open" || t.status === "Assigned");
        case "in-progress":
          return myRequests.filter(t => t.status === "In Progress" || t.status === "Waiting on Requester");
        case "completed":
          return myRequests.filter(t => t.status === "Resolved" || t.status === "Closed");
        default:
          return [];
      }
    }
  };
  
  const filteredTickets = getFilteredTickets();
  
  const handleTicketClick = (ticket: Ticket) => {
    setSelectedTicket(ticket);
  };
  
  const handleTicketUpdate = () => {
    loadTickets();
    if (selectedTicket) {
      // Reload selected ticket
      const updated = tickets.find(t => t.id === selectedTicket.id);
      if (updated) {
        setSelectedTicket(updated);
      }
    }
  };
  
  const handleNewTicketCreated = () => {
    setShowCreatePanel(false);
    loadTickets();
  };
  
  // Calculate counts for sub-tabs based on active main tab
  const getSubTabCounts = () => {
    if (activeMainTab === "tasks") {
      const myTasks = tickets.filter(t => t.assigned_to === user?.id);
      return {
        todo: myTasks.filter(t => t.status === "Open" || t.status === "Assigned").length,
        inProgress: myTasks.filter(t => t.status === "In Progress" || t.status === "Waiting on Requester").length,
        completed: myTasks.filter(t => t.status === "Resolved" || t.status === "Closed").length,
      };
    } else {
      const myRequests = tickets.filter(t => t.created_by === user?.id);
      return {
        todo: myRequests.filter(t => t.status === "Open" || t.status === "Assigned").length,
        inProgress: myRequests.filter(t => t.status === "In Progress" || t.status === "Waiting on Requester").length,
        completed: myRequests.filter(t => t.status === "Resolved" || t.status === "Closed").length,
      };
    }
  };
  
  const subTabCounts = getSubTabCounts();

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF" }}>
      {/* Page Header */}
      <div style={{ padding: "32px 48px", borderBottom: "1px solid #E5E9F0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ 
              fontSize: "32px", 
              fontWeight: 600, 
              color: "#12332B", 
              marginBottom: "4px",
              letterSpacing: "-1.2px"
            }}>
              My Inbox
            </h1>
            <p style={{ fontSize: "14px", color: "#667085" }}>
              Manage your tickets and requests
            </p>
          </div>
          
          <div style={{ display: "flex", gap: "12px" }}>
            {/* View Toggle */}
            <div style={{
              display: "flex",
              border: "1px solid #E5E9F0",
              borderRadius: "8px",
              overflow: "hidden"
            }}>
              <button
                onClick={() => setViewMode("table")}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  background: viewMode === "table" ? "#0F766E" : "#FFFFFF",
                  color: viewMode === "table" ? "#FFFFFF" : "#667085",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer"
                }}
              >
                Table
              </button>
              <button
                onClick={() => setViewMode("cards")}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  borderLeft: "1px solid #E5E9F0",
                  background: viewMode === "cards" ? "#0F766E" : "#FFFFFF",
                  color: viewMode === "cards" ? "#FFFFFF" : "#667085",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer"
                }}
              >
                Cards
              </button>
            </div>
            
            <button
              onClick={() => setShowCreatePanel(true)}
              style={{
                height: "40px",
                padding: "0 20px",
                borderRadius: "12px",
                background: "#0F766E",
                border: "none",
                color: "#FFFFFF",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 150ms ease"
              }}
            >
              <Plus size={16} />
              New Ticket
            </button>
          </div>
        </div>
        
        {/* Tabs */}
        <div style={{ 
          display: "flex", 
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "24px",
          borderBottom: "1px solid #E5E9F0",
          paddingBottom: "0"
        }}>
          {/* Main Tabs - Left Side */}
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setActiveMainTab("tasks")}
              style={{
                padding: "12px 20px",
                border: "none",
                background: "transparent",
                color: activeMainTab === "tasks" ? "#0F766E" : "#667085",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                borderBottom: activeMainTab === "tasks" ? "2px solid #0F766E" : "2px solid transparent",
                transition: "all 150ms ease"
              }}
            >
              My Tasks
            </button>
            
            <button
              onClick={() => setActiveMainTab("requests")}
              style={{
                padding: "12px 20px",
                border: "none",
                background: "transparent",
                color: activeMainTab === "requests" ? "#0F766E" : "#667085",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                borderBottom: activeMainTab === "requests" ? "2px solid #0F766E" : "2px solid transparent",
                transition: "all 150ms ease"
              }}
            >
              My Requests
            </button>
          </div>
          
          {/* Status Segmented Control - Right Side */}
          <div style={{
            display: "flex",
            border: "1px solid #E5E9F0",
            borderRadius: "8px",
            overflow: "hidden",
            marginBottom: "12px"
          }}>
            <button
              onClick={() => setActiveSubTab("todo")}
              style={{
                padding: "8px 16px",
                border: "none",
                background: activeSubTab === "todo" ? "#0F766E" : "#FFFFFF",
                color: activeSubTab === "todo" ? "#FFFFFF" : "#667085",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              To-Do ({subTabCounts.todo})
            </button>
            <button
              onClick={() => setActiveSubTab("in-progress")}
              style={{
                padding: "8px 16px",
                border: "none",
                borderLeft: "1px solid #E5E9F0",
                background: activeSubTab === "in-progress" ? "#0F766E" : "#FFFFFF",
                color: activeSubTab === "in-progress" ? "#FFFFFF" : "#667085",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              In Progress ({subTabCounts.inProgress})
            </button>
            <button
              onClick={() => setActiveSubTab("completed")}
              style={{
                padding: "8px 16px",
                border: "none",
                borderLeft: "1px solid #E5E9F0",
                background: activeSubTab === "completed" ? "#0F766E" : "#FFFFFF",
                color: activeSubTab === "completed" ? "#FFFFFF" : "#667085",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              Completed ({subTabCounts.completed})
            </button>
          </div>
        </div>
      </div>
      
      {/* Tickets Display */}
      <div style={{ padding: "32px 48px" }}>
        {viewMode === "table" ? (
          <TicketManagementTable
            tickets={filteredTickets}
            isLoading={isLoading}
            onTicketClick={handleTicketClick}
            onTicketsUpdated={handleTicketUpdate}
            viewMode="personal"
            canAssignTickets={false}
            canBulkEdit={false}
            emptyMessage={
              activeMainTab === "tasks" ? (
                activeSubTab === "todo" ? "No tasks to do" :
                activeSubTab === "in-progress" ? "No tasks in progress" :
                "No completed tasks"
              ) : (
                activeSubTab === "todo" ? "No pending requests" :
                activeSubTab === "in-progress" ? "No requests in progress" :
                "No completed requests"
              )
            }
            showSearch={true}
            showFilters={true}
          />
        ) : (
          <TicketsList
            tickets={filteredTickets}
            isLoading={isLoading}
            onTicketClick={handleTicketClick}
            emptyMessage={
              activeMainTab === "tasks" ? (
                activeSubTab === "todo" ? "No tasks to do" :
                activeSubTab === "in-progress" ? "No tasks in progress" :
                "No completed tasks"
              ) : (
                activeSubTab === "todo" ? "No pending requests" :
                activeSubTab === "in-progress" ? "No requests in progress" :
                "No completed requests"
              )
            }
          />
        )}
      </div>
      
      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          isOpen={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onUpdate={handleTicketUpdate}
        />
      )}
      
      {/* New Ticket Panel */}
      <NewTicketPanel
        isOpen={showCreatePanel}
        onClose={() => setShowCreatePanel(false)}
        onSuccess={handleNewTicketCreated}
      />
    </div>
  );
}