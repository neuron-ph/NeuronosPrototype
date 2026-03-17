import { useState, useEffect } from "react";
import { Plus, Inbox } from "lucide-react";
import { useUser } from "../hooks/useUser";
import { supabase } from "../utils/supabase/client";
import type { Ticket, TicketStatus } from "./InboxPage";
import { CustomDropdown } from "./bd/CustomDropdown";
import { TicketManagementTable } from "./ticketing/TicketManagementTable";
import { TicketDetailModal } from "./ticketing/TicketDetailModal";
import { NewTicketPanel } from "./ticketing/NewTicketPanel";

type TabType = "all" | "my-tickets";

export function TicketQueuePage() {
  const { user, effectiveDepartment, effectiveRole } = useUser();
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  
  // Executive Department exception: Everyone in Executive gets director access
  const actualRole = effectiveDepartment === "Executive" ? "director" : effectiveRole;
  
  // Check if user is director (sees all tickets) or manager (sees only department)
  const isDirector = actualRole === 'director';
  const isManager = actualRole === 'manager' || isDirector;
  
  useEffect(() => {
    loadTickets();
  }, [user, effectiveDepartment, effectiveRole]);
  
  const loadTickets = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      let query = supabase.from('tickets').select('*');
      
      // Filter by department for non-directors
      if (actualRole !== 'Director') {
        query = query.eq('department', effectiveDepartment);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (!error && data) {
        setTickets(data);
      }
    } catch (error) {
      console.error("Failed to load tickets:", error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Filter tickets based on active tab
  const getFilteredTickets = (): Ticket[] => {
    let result: Ticket[] = [];
    
    switch (activeTab) {
      case "all":
        // All active tickets in department (or company-wide for directors)
        result = tickets.filter(t => 
          t.status !== "Resolved" && 
          t.status !== "Closed"
        );
        break;
      
      case "my-tickets":
        // Quick filter to see tickets assigned to me
        result = tickets.filter(t => 
          t.assigned_to === user?.id &&
          t.status !== "Resolved" &&
          t.status !== "Closed"
        );
        break;
      
      default:
        result = tickets;
    }
    
    // Apply department filter if Executive has selected a specific department
    if (isDirector && departmentFilter !== "all") {
      result = result.filter(t => t.to_department === departmentFilter);
    }
    
    return result;
  };
  
  const filteredTickets = getFilteredTickets();
  
  // Stats for dashboard
  const stats = {
    totalActive: tickets.filter(t => t.status !== "Resolved" && t.status !== "Closed").length,
    unassigned: tickets.filter(t => !t.assigned_to && t.status !== "Resolved" && t.status !== "Closed").length,
    urgent: tickets.filter(t => t.priority === "Urgent" && t.status !== "Resolved" && t.status !== "Closed").length,
    myTickets: tickets.filter(t => t.assigned_to === user?.id && t.status !== "Resolved" && t.status !== "Closed").length
  };
  
  const handleTicketClick = (ticket: Ticket) => {
    setSelectedTicket(ticket);
  };
  
  const handleTicketUpdate = () => {
    loadTickets();
    if (selectedTicket) {
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
              Tickets
            </h1>
            <p style={{ fontSize: "14px", color: "#667085" }}>
              {isDirector ? "Manage all tickets across departments" : `Manage ${effectiveDepartment} department tickets`}
            </p>
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
        
        {/* Tabs */}
        <div style={{ 
          display: "flex", 
          gap: "8px", 
          marginTop: "24px",
          borderBottom: "1px solid #E5E9F0",
          paddingBottom: "0"
        }}>
          <button
            onClick={() => setActiveTab("all")}
            style={{
              padding: "12px 20px",
              border: "none",
              background: "transparent",
              color: activeTab === "all" ? "#0F766E" : "#667085",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              borderBottom: activeTab === "all" ? "2px solid #0F766E" : "2px solid transparent",
              transition: "all 150ms ease"
            }}
          >
            All Active ({stats.totalActive})
          </button>
          
          <button
            onClick={() => setActiveTab("my-tickets")}
            style={{
              padding: "12px 20px",
              border: "none",
              background: "transparent",
              color: activeTab === "my-tickets" ? "#0F766E" : "#667085",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              borderBottom: activeTab === "my-tickets" ? "2px solid #0F766E" : "2px solid transparent",
              transition: "all 150ms ease"
            }}
          >
            My Tickets ({stats.myTickets})
          </button>
        </div>
        
        {/* Quick Link to My Inbox */}
        {stats.myTickets > 0 && activeTab !== "my-tickets" && (
          <div style={{
            marginTop: "16px",
            padding: "12px 16px",
            background: "#E0F2FE",
            border: "1px solid #BAE6FD",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Inbox size={16} style={{ color: "#075985" }} />
              <span style={{ fontSize: "13px", color: "#075985" }}>
                You have <strong>{stats.myTickets}</strong> ticket{stats.myTickets !== 1 ? 's' : ''} assigned to you personally
              </span>
            </div>
            <button
              onClick={() => setActiveTab("my-tickets")}
              style={{
                padding: "6px 12px",
                border: "1px solid #0369A1",
                borderRadius: "6px",
                background: "#FFFFFF",
                color: "#0369A1",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              View My Tickets
            </button>
          </div>
        )}
      </div>
      
      {/* Tickets Table */}
      <div style={{ padding: "32px 48px" }}>
        {/* Department Filter - Only for Executives */}
        {isDirector && (
          <div style={{ marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#12332B" }}>Filter by Department:</span>
            <div style={{ minWidth: "220px" }}>
              <CustomDropdown
                label=""
                value={departmentFilter}
                onChange={setDepartmentFilter}
                options={[
                  { value: "all", label: "All Departments" },
                  { value: "Executive", label: "Executive" },
                  { value: "Business Development", label: "Business Development" },
                  { value: "Pricing", label: "Pricing" },
                  { value: "Operations", label: "Operations" }
                ]}
              />
            </div>
          </div>
        )}
        
        <TicketManagementTable
          tickets={filteredTickets}
          isLoading={isLoading}
          onTicketClick={handleTicketClick}
          onTicketsUpdated={handleTicketUpdate}
          viewMode={isDirector ? "company-wide" : "department"}
          canAssignTickets={isManager}
          canBulkEdit={isManager}
          emptyMessage={
            activeTab === "all" ? "No active tickets" :
            activeTab === "my-tickets" ? "No tickets assigned to you" :
            "No tickets found"
          }
          showSearch={true}
          showFilters={true}
        />
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