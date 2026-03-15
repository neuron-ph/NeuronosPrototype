import { useState, useEffect, useRef } from "react";
import { Activity, RefreshCw, Download, Filter, ExternalLink } from "lucide-react";
import { useUser } from "../hooks/useUser";
import { apiFetch } from "../utils/api";
import { useNavigate } from "react-router";
import { CustomDropdown } from "./bd/CustomDropdown";

interface ActivityLog {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  action_type: string;
  user_id: string;
  user_name: string;
  user_department: string;
  old_value: string | null;
  new_value: string | null;
  metadata: any;
  timestamp: string;
}

export function ActivityLogPage() {
  const { user, effectiveRole, effectiveDepartment } = useUser();
  const navigate = useNavigate();
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [hasNewActivities, setHasNewActivities] = useState(false);
  const [newActivityCount, setNewActivityCount] = useState(0);
  
  // baseUrl removed — using apiFetch() wrapper instead
  
  // Executive Department exception: Everyone in Executive gets director access
  const actualRole = effectiveDepartment === "Executive" ? "director" : effectiveRole;
  
  // Filters
  const [entityTypeFilter, setEntityTypeFilter] = useState("all");
  const [actionTypeFilter, setActionTypeFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState(actualRole === "director" ? "all" : effectiveDepartment);
  const [userFilter, setUserFilter] = useState("");
  const [usersInDepartment, setUsersInDepartment] = useState<Array<{id: string, name: string}>>([]);
  const [dateFrom, setDateFrom] = useState(() => {
    // Default: 24 hours ago
    const date = new Date();
    date.setHours(date.getHours() - 24);
    return date.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [searchTerm, setSearchTerm] = useState("");
  
  const intervalRef = useRef<number | null>(null);
  const latestTimestampRef = useRef<string | null>(null);
  
  // Check if user has access
  const hasAccess = actualRole === "director" || actualRole === "manager";
  
  // Fetch users when department filter changes
  useEffect(() => {
    // For managers, automatically fetch users from their own department
    if (actualRole === "manager") {
      fetchUsersInDepartment(effectiveDepartment);
    } else if (departmentFilter && departmentFilter !== "all") {
      // For executives, fetch users when they select a department
      fetchUsersInDepartment(departmentFilter);
    } else {
      setUsersInDepartment([]);
      setUserFilter("");
    }
  }, [departmentFilter, actualRole, effectiveDepartment]);
  
  const fetchUsersInDepartment = async (department: string) => {
    try {
      const response = await apiFetch(`/users?department=${department}`);
      
      const result = await response.json();
      
      if (result.success && result.data) {
        setUsersInDepartment(result.data.map((u: any) => ({ id: u.id, name: u.name })));
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
      setUsersInDepartment([]);
    }
  };
  
  useEffect(() => {
    if (hasAccess) {
      loadActivities();
      
      // Start auto-refresh every 45 seconds
      intervalRef.current = window.setInterval(() => {
        checkForNewActivities();
      }, 45000);
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [hasAccess, entityTypeFilter, actionTypeFilter, departmentFilter, userFilter, dateFrom, dateTo]);
  
  const loadActivities = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        role: actualRole,
        department: effectiveDepartment,
        limit: "50",
        offset: "0"
      });
      
      if (entityTypeFilter !== "all") {
        params.append("entity_type", entityTypeFilter);
      }
      
      if (actionTypeFilter !== "all") {
        params.append("action_type", actionTypeFilter);
      }
      
      if (departmentFilter !== "all") {
        params.append("department", departmentFilter);
      }
      
      if (userFilter) {
        params.append("user_id", userFilter);
      }
      
      if (dateFrom) {
        params.append("date_from", dateFrom);
      }
      
      if (dateTo) {
        params.append("date_to", dateTo);
      }
      
      const response = await apiFetch(`/activity-log?${params}`);
      
      const result = await response.json();
      
      if (result.success) {
        setActivities(result.data);
        setTotal(result.total);
        
        // Track latest timestamp for new activity detection
        if (result.data.length > 0) {
          latestTimestampRef.current = result.data[0].timestamp;
        }
        
        // Reset new activity indicator
        setHasNewActivities(false);
        setNewActivityCount(0);
      }
    } catch (error) {
      console.error("Failed to load activities:", error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const checkForNewActivities = async () => {
    if (!latestTimestampRef.current) return;
    
    try {
      const params = new URLSearchParams({
        role: actualRole,
        department: effectiveDepartment,
        limit: "10",
        offset: "0",
        date_from: latestTimestampRef.current
      });
      
      if (entityTypeFilter !== "all") {
        params.append("entity_type", entityTypeFilter);
      }
      
      const response = await apiFetch(`/activity-log?${params}`);
      
      const result = await response.json();
      
      if (result.success && result.data.length > 0) {
        // Check if there are actually new activities
        const newerActivities = result.data.filter((act: ActivityLog) => 
          new Date(act.timestamp) > new Date(latestTimestampRef.current!)
        );
        
        if (newerActivities.length > 0) {
          setHasNewActivities(true);
          setNewActivityCount(newerActivities.length);
        }
      }
    } catch (error) {
      console.error("Failed to check for new activities:", error);
    }
  };
  
  const handleRefresh = () => {
    loadActivities();
  };
  
  const handleExportCSV = () => {
    // Filter activities by search term for export
    const filtered = getFilteredActivities();
    
    // Create CSV content
    const headers = ["Timestamp", "User", "Department", "Entity Type", "Entity ID", "Entity Name", "Action", "Old Value", "New Value"];
    const rows = filtered.map(activity => [
      new Date(activity.timestamp).toLocaleString(),
      activity.user_name,
      activity.user_department,
      activity.entity_type,
      activity.entity_id,
      activity.entity_name,
      formatActivityAction(activity),
      activity.old_value || "",
      activity.new_value || ""
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");
    
    // Download CSV
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `activity-log-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const getFilteredActivities = () => {
    if (!searchTerm) return activities;
    
    const lower = searchTerm.toLowerCase();
    return activities.filter(activity =>
      activity.entity_id.toLowerCase().includes(lower) ||
      activity.entity_name.toLowerCase().includes(lower) ||
      activity.user_name.toLowerCase().includes(lower) ||
      activity.action_type.toLowerCase().includes(lower)
    );
  };
  
  const formatActivityAction = (activity: ActivityLog) => {
    switch (activity.action_type) {
      case "ticket_created":
      case "quotation_created":
      case "booking_created":
        return `Created ${activity.entity_type}`;
      case "status_changed":
        return `Changed status from "${activity.old_value}" to "${activity.new_value}"`;
      case "comment_added":
        return "Added a comment";
      case "priority_changed":
        return `Changed priority from "${activity.old_value}" to "${activity.new_value}"`;
      case "assigned_changed":
        return `Assigned to ${activity.new_value}`;
      case "converted":
        return `Converted to ${activity.new_value}`;
      default:
        return activity.action_type.replace(/_/g, " ");
    }
  };
  
  const getEntityBadgeColor = (entityType: string) => {
    switch (entityType) {
      case "ticket":
        return { bg: "#FEF0E6", color: "#E87A3D", border: "#E87A3D" };
      case "quotation":
        return { bg: "#E8F5F0", color: "#0F766E", border: "#0F766E" };
      case "booking":
        return { bg: "#EEF2FF", color: "#6366F1", border: "#6366F1" };
      default:
        return { bg: "#F3F4F6", color: "#6B7280", border: "#6B7280" };
    }
  };
  
  const getRelativeTime = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    return `${diffDays}d ago`;
  };
  
  const handleEntityClick = (activity: ActivityLog) => {
    // Navigate to the entity
    if (activity.entity_type === "ticket") {
      navigate("/inbox");
    } else if (activity.entity_type === "quotation") {
      const basePath = effectiveDepartment === "Business Development" ? "/bd/inquiries" : "/pricing/quotations";
      navigate(basePath);
    } else if (activity.entity_type === "booking") {
      navigate("/operations");
    }
  };
  
  if (!hasAccess) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: "#FEFEFE" }}>
        <div className="text-center" style={{ maxWidth: "400px" }}>
          <Activity size={48} style={{ color: "#E87A3D", margin: "0 auto 16px" }} />
          <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#12332B", marginBottom: "8px" }}>
            Access Denied
          </h2>
          <p style={{ fontSize: "14px", color: "#667085", lineHeight: "1.5" }}>
            The Activity Log is only available for Managers and Executives. This module provides system-wide visibility and audit trails.
          </p>
        </div>
      </div>
    );
  }
  
  const filteredActivities = getFilteredActivities();
  
  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: "#FEFEFE" }}>
      {/* Header */}
      <div 
        className="px-12 py-8 border-b"
        style={{ borderColor: "var(--neuron-ui-border)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Activity size={24} style={{ color: "#0F766E" }} />
            <h1 style={{ fontSize: "28px", fontWeight: 600, color: "#12332B" }}>
              Activity Log
            </h1>
            <span style={{
              padding: "4px 12px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 600,
              background: actualRole === "director" ? "#FEEAEA" : "#E8F5F0",
              color: actualRole === "director" ? "#E35858" : "#0F766E",
              border: `1px solid ${actualRole === "director" ? "#E35858" : "#0F766E"}`
            }}>
              {actualRole === "director" ? "EXECUTIVE" : "MANAGER"}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            {hasNewActivities && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                background: "#FEF0E6",
                border: "1px solid #E87A3D",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                color: "#E87A3D"
              }}>
                <Activity size={14} />
                {newActivityCount} new {newActivityCount === 1 ? "activity" : "activities"}
              </div>
            )}
            
            <button
              onClick={handleRefresh}
              className="px-4 py-2 rounded-lg transition-all flex items-center gap-2"
              style={{
                backgroundColor: "#FFFFFF",
                color: "#0F766E",
                fontSize: "14px",
                fontWeight: 600,
                border: "1px solid var(--neuron-ui-border)"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#F9FAFB";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#FFFFFF";
              }}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 rounded-lg transition-all flex items-center gap-2"
              style={{
                backgroundColor: "#0F766E",
                color: "#FFFFFF",
                fontSize: "14px",
                fontWeight: 600,
                border: "none"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#0D6560";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#0F766E";
              }}
            >
              <Download size={16} />
              Export CSV
            </button>
          </div>
        </div>
        <p style={{ fontSize: "14px", color: "#667085" }}>
          {actualRole === "director" 
            ? "System-wide activity log with full visibility across all departments"
            : `Activity log for ${effectiveDepartment} department`
          }
        </p>
      </div>
      
      {/* Filters */}
      <div 
        className="px-12 py-6 border-b"
        style={{ borderColor: "var(--neuron-ui-border)", backgroundColor: "#FFFFFF" }}
      >
        <div className="flex flex-col gap-3">
          {/* First row - Dropdowns */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Filter size={16} style={{ color: "#667085" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#12332B" }}>Filters:</span>
            </div>
            
            <div style={{ minWidth: "160px" }}>
              <CustomDropdown
                label=""
                value={entityTypeFilter}
                onChange={setEntityTypeFilter}
                options={[
                  { value: "all", label: "All Entity Types" },
                  { value: "ticket", label: "Tickets" },
                  { value: "quotation", label: "Quotations" },
                  { value: "booking", label: "Bookings" }
                ]}
              />
            </div>
            
            <div style={{ minWidth: "140px" }}>
              <CustomDropdown
                label=""
                value={actionTypeFilter}
                onChange={setActionTypeFilter}
                options={[
                  { value: "all", label: "All Actions" },
                  { value: "ticket_created", label: "Created" },
                  { value: "status_changed", label: "Status Changed" },
                  { value: "comment_added", label: "Comment Added" },
                  { value: "converted", label: "Converted" }
                ]}
              />
            </div>
            
            {/* Show Department filter only for Executives */}
            {actualRole === "director" && (
              <div style={{ minWidth: "160px" }}>
                <CustomDropdown
                  label=""
                  value={departmentFilter}
                  onChange={(value) => {
                    setDepartmentFilter(value);
                    setUserFilter(""); // Reset user filter when department changes
                  }}
                  options={[
                    { value: "all", label: "All Departments" },
                    { value: "Executive", label: "Executive" },
                    { value: "Business Development", label: "Business Development" },
                    { value: "Pricing", label: "Pricing" },
                    { value: "Operations", label: "Operations" }
                  ]}
                />
              </div>
            )}
            
            {/* Show User filter when department is selected (not "all") */}
            {(departmentFilter !== "all" || actualRole === "manager") && (
              <div style={{ minWidth: "150px" }}>
                <CustomDropdown
                  label=""
                  value={userFilter}
                  onChange={setUserFilter}
                  options={[
                    { value: "", label: "All Users" },
                    ...usersInDepartment.map(user => ({ value: user.id, label: user.name }))
                  ]}
                  disabled={usersInDepartment.length === 0}
                />
              </div>
            )}
          </div>
          
          {/* Second row - Search bar */}
          <div className="flex items-center">
            <input
              type="text"
              placeholder="Search by entity ID, name, user..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg text-sm"
              style={{
                border: "1px solid var(--neuron-ui-border)",
                backgroundColor: "#FFFFFF",
                color: "#12332B"
              }}
            />
          </div>
        </div>
      </div>
      
      {/* Activity Table */}
      <div className="flex-1 overflow-auto px-12 py-6">
        {isLoading ? (
          <div style={{ 
            textAlign: "center", 
            padding: "64px", 
            color: "#667085" 
          }}>
            Loading activities...
          </div>
        ) : filteredActivities.length === 0 ? (
          <div style={{ 
            textAlign: "center", 
            padding: "64px", 
            color: "#667085" 
          }}>
            <Activity size={48} style={{ color: "#D1D5DB", margin: "0 auto 16px" }} />
            <p style={{ fontSize: "16px", fontWeight: 500 }}>No activities found</p>
            <p style={{ fontSize: "14px", marginTop: "8px" }}>Try adjusting your filters</p>
          </div>
        ) : (
          <div style={{ 
            border: "1px solid var(--neuron-ui-border)", 
            borderRadius: "12px",
            overflow: "hidden",
            backgroundColor: "#FFFFFF"
          }}>
            {/* Table Header */}
            <div 
              className="grid grid-cols-12 gap-4 px-6 py-3 border-b"
              style={{ 
                borderColor: "var(--neuron-ui-border)",
                backgroundColor: "#F9FAFB"
              }}
            >
              <div className="col-span-2" style={{ fontSize: "12px", fontWeight: 600, color: "#667085", textTransform: "uppercase" }}>
                Time
              </div>
              <div className="col-span-2" style={{ fontSize: "12px", fontWeight: 600, color: "#667085", textTransform: "uppercase" }}>
                User
              </div>
              <div className="col-span-1" style={{ fontSize: "12px", fontWeight: 600, color: "#667085", textTransform: "uppercase" }}>
                Type
              </div>
              <div className="col-span-2" style={{ fontSize: "12px", fontWeight: 600, color: "#667085", textTransform: "uppercase" }}>
                Entity
              </div>
              <div className="col-span-4" style={{ fontSize: "12px", fontWeight: 600, color: "#667085", textTransform: "uppercase" }}>
                Action
              </div>
              <div className="col-span-1"></div>
            </div>
            
            {/* Table Rows */}
            {filteredActivities.map((activity, index) => {
              const badgeColors = getEntityBadgeColor(activity.entity_type);
              
              return (
                <div
                  key={activity.id}
                  className="grid grid-cols-12 gap-4 px-6 py-4 border-b hover:bg-gray-50 transition-colors cursor-pointer"
                  style={{ 
                    borderColor: index === filteredActivities.length - 1 ? "transparent" : "var(--neuron-ui-border)"
                  }}
                  onClick={() => handleEntityClick(activity)}
                >
                  {/* Time */}
                  <div className="col-span-2 flex flex-col">
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#12332B" }}>
                      {getRelativeTime(activity.timestamp)}
                    </span>
                    <span style={{ fontSize: "11px", color: "#9CA3AF" }}>
                      {new Date(activity.timestamp).toLocaleString()}
                    </span>
                  </div>
                  
                  {/* User */}
                  <div className="col-span-2 flex flex-col">
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#12332B" }}>
                      {activity.user_name}
                    </span>
                    <span style={{ fontSize: "11px", color: "#667085" }}>
                      {activity.user_department}
                    </span>
                  </div>
                  
                  {/* Entity Type Badge */}
                  <div className="col-span-1 flex items-center">
                    <span style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: badgeColors.bg,
                      color: badgeColors.color,
                      border: `1px solid ${badgeColors.border}`,
                      textTransform: "uppercase"
                    }}>
                      {activity.entity_type}
                    </span>
                  </div>
                  
                  {/* Entity */}
                  <div className="col-span-2 flex flex-col">
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#0F766E", fontFamily: "monospace" }}>
                      {activity.entity_id}
                    </span>
                    <span style={{ fontSize: "12px", color: "#667085", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {activity.entity_name}
                    </span>
                  </div>
                  
                  {/* Action */}
                  <div className="col-span-4 flex items-center">
                    <span style={{ fontSize: "13px", color: "#374151" }}>
                      {formatActivityAction(activity)}
                    </span>
                  </div>
                  
                  {/* Link Icon */}
                  <div className="col-span-1 flex items-center justify-end">
                    <ExternalLink size={16} style={{ color: "#9CA3AF" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        {/* Pagination Info */}
        {!isLoading && filteredActivities.length > 0 && (
          <div style={{ 
            marginTop: "24px", 
            textAlign: "center", 
            fontSize: "13px", 
            color: "#667085" 
          }}>
            Showing {filteredActivities.length} of {total} activities
          </div>
        )}
      </div>
    </div>
  );
}