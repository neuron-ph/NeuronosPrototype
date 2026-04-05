import { useState } from "react";
import { Search, Plus, Calendar, Flag, Phone, Mail, Send, Users, MessageSquare, MessageCircle, Linkedin, ListTodo, CheckCircle2 } from "lucide-react";
import { supabase } from '../../utils/supabase/client';
import { useUser } from "../../hooks/useUser";
import { logCreation } from "../../utils/activityLog";
import { toast } from "../ui/toast-utils";
import { useDataScope } from '../../hooks/useDataScope';
import type { Task, TaskPriority, TaskStatus, TaskType } from "../../types/bd";
import { CustomDropdown } from "./CustomDropdown";
import { AddTaskPanel } from "./AddTaskPanel";
import { useTasks } from "../../hooks/useTasks";
import { useCustomers } from "../../hooks/useCustomers";
import { useContacts } from "../../hooks/useContacts";

interface TasksListProps {
  onViewTask: (task: Task) => void;
}

export function TasksList({ onViewTask }: TasksListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TaskType | "All">("All");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "All">("All");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "All">("All");
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);

  const { user } = useUser();

  const { scope, isLoaded } = useDataScope();

  // Build scope-aware filters for useTasks
  const scopeFilter = isLoaded && scope.type === 'own' ? { assigneeId: scope.userId } : {};
  const { tasks, isLoading, invalidate: invalidateTasks } = useTasks({ ...scopeFilter, enabled: isLoaded });
  const { customers } = useCustomers();
  const { contacts } = useContacts();

  const handleSaveTask = async (taskData: Partial<Task>) => {
    try {
      const newTask = { ...taskData, id: `task-${Date.now()}`, created_at: new Date().toISOString() };
      const { error } = await supabase.from('tasks').insert(newTask);
      if (error) throw error;
      const _actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
      logCreation("task", newTask.id, newTask.title ?? newTask.id, _actor);
      toast.success('Task created successfully');
      invalidateTasks();
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Unable to create task. Please try again.');
    }
  };

  // Filter tasks
  const filteredTasks = tasks.filter(task => {
    // Exclude completed tasks - they should only appear in Activities
    if (task.status === "Completed") return false;
    
    const matchesSearch = 
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.remarks && task.remarks.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesType = typeFilter === "All" || task.type === typeFilter;
    const matchesStatus = statusFilter === "All" || task.status === statusFilter;
    const matchesPriority = priorityFilter === "All" || task.priority === priorityFilter;

    return matchesSearch && matchesType && matchesStatus && matchesPriority;
  });

  // Sort by due date
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  // Group tasks by priority
  const tasksByPriority = {
    High: sortedTasks.filter(task => task.priority === "High"),
    Medium: sortedTasks.filter(task => task.priority === "Medium"),
    Low: sortedTasks.filter(task => task.priority === "Low"),
  };

  const getContactName = (contactId: string | null) => {
    if (!contactId) return null;
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return null;
    return contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || null;
  };

  const getCustomerName = (customerId: string | null) => {
    if (!customerId) return null;
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || null; // ✅ Changed from company_name to name
  };

  const getLinkedEntity = (task: Task) => {
    const contactName = getContactName(task.contact_id);
    const customerName = getCustomerName(task.customer_id);
    
    if (customerName && contactName) {
      return `${customerName} (${contactName})`;
    }
    return customerName || contactName || "—";
  };

  const getOwnerName = (ownerId: string) => {
    // TODO: Fetch from users API when available
    return ownerId || "—";
  };

  const getPriorityColor = (priority: TaskPriority) => {
    switch (priority) {
      case "High": return "text-[var(--theme-status-danger-fg)]";
      case "Medium": return "text-[#C88A2B]";
      case "Low": return "text-[var(--theme-text-muted)]";
      default: return "text-[var(--theme-text-muted)]";
    }
  };

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case "Completed": return "bg-[var(--theme-bg-surface-tint)] text-[#2B8A6E]";
      case "Ongoing": return "bg-[var(--theme-bg-surface-tint)] text-[#237F66]";
      case "Pending": return "bg-[#FEF3E0] text-[#C88A2B]";
      case "Cancelled": return "bg-[#FCE8E6] text-[var(--theme-status-danger-fg)]";
      default: return "bg-[#F1F6F4] text-[var(--theme-text-muted)]";
    }
  };

  const getTaskTypeIcon = (type: TaskType) => {
    const iconProps = { className: "w-4 h-4", style: { color: "var(--neuron-ink-muted)" } };
    
    switch (type) {
      case "To-do": return <ListTodo {...iconProps} />;
      case "Call": return <Phone {...iconProps} />;
      case "Email": return <Mail {...iconProps} />;
      case "Marketing Email": return <Send {...iconProps} />;
      case "Meeting": return <Users {...iconProps} />;
      case "SMS": return <MessageSquare {...iconProps} />;
      case "Viber": return <MessageCircle {...iconProps} />;
      case "WeChat": return <MessageCircle {...iconProps} />;
      case "WhatsApp": return <MessageCircle {...iconProps} />;
      case "LinkedIn": return <Linkedin {...iconProps} />;
      default: return <ListTodo {...iconProps} />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Check if overdue
    const isOverdue = date < now && date.toDateString() !== now.toDateString();
    
    // Check if today
    const isToday = date.toDateString() === now.toDateString();
    
    // Check if tomorrow
    const isTomorrow = date.toDateString() === tomorrow.toDateString();
    
    const formatted = date.toLocaleDateString('en-PH', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    if (isOverdue) return <span className="text-[var(--theme-status-danger-fg)]">{formatted} (Overdue)</span>;
    if (isToday) return <span className="text-[#C88A2B]">{formatted} (Today)</span>;
    if (isTomorrow) return <span className="text-[#237F66]">{formatted} (Tomorrow)</span>;
    
    return formatted;
  };

  return (
    <div 
      className="h-full flex flex-col"
      style={{
        background: "var(--theme-bg-surface)",
      }}
    >
      {/* Page Header */}
      <div style={{ padding: "32px 48px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "24px",
          }}
        >
          <div>
            <h1 style={{ fontSize: "32px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "4px", letterSpacing: "-1.2px" }}>
              Tasks
            </h1>
            <p style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>
              Manage follow-ups and business development activities
            </p>
          </div>
          <button
            style={{
              height: "48px",
              padding: "0 24px",
              borderRadius: "16px",
              background: "#0F766E",
              border: "none",
              color: "#FFFFFF",
              fontSize: "14px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--theme-action-primary-border)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--theme-action-primary-bg)";
            }}
            onClick={() => setIsAddTaskOpen(true)}
          >
            <Plus size={20} />
            Add Task
          </button>
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--neuron-ink-muted)" }} />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 text-[13px]"
              style={{
                border: "1px solid var(--neuron-ui-border)",
                backgroundColor: "var(--theme-bg-surface)",
                color: "var(--neuron-ink-primary)"
              }}
            />
          </div>

          <CustomDropdown
            label=""
            value={typeFilter}
            onChange={(value) => setTypeFilter(value as TaskType | "All")}
            options={[
              { value: "All", label: "All Types" },
              { value: "To-do", label: "To-do", icon: <ListTodo className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
              { value: "Call", label: "Call", icon: <Phone className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
              { value: "Email", label: "Email", icon: <Mail className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
              { value: "Marketing Email", label: "Marketing Email", icon: <Send className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
              { value: "Meeting", label: "Meeting", icon: <Users className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
              { value: "SMS", label: "SMS", icon: <MessageSquare className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
              { value: "Viber", label: "Viber", icon: <MessageCircle className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
              { value: "WeChat", label: "WeChat", icon: <MessageCircle className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
              { value: "WhatsApp", label: "WhatsApp", icon: <MessageCircle className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> },
              { value: "LinkedIn", label: "LinkedIn", icon: <Linkedin className="w-3.5 h-3.5" style={{ color: "var(--neuron-ink-muted)" }} /> }
            ]}
          />

          <CustomDropdown
            label=""
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as TaskStatus | "All")}
            options={[
              { value: "All", label: "All Statuses" },
              { value: "Ongoing", label: "Ongoing", icon: <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#237F66" }} /> },
              { value: "Pending", label: "Pending", icon: <Calendar className="w-3.5 h-3.5" style={{ color: "#C88A2B" }} /> },
              { value: "Cancelled", label: "Cancelled", icon: <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "var(--theme-status-danger-fg)" }} /> }
            ]}
          />

          <CustomDropdown
            label=""
            value={priorityFilter}
            onChange={(value) => setPriorityFilter(value as TaskPriority | "All")}
            options={[
              { value: "All", label: "All Priorities" },
              { value: "High", label: "High", icon: <Flag className="w-3.5 h-3.5" style={{ color: "var(--theme-status-danger-fg)" }} /> },
              { value: "Medium", label: "Medium", icon: <Flag className="w-3.5 h-3.5" style={{ color: "#C88A2B" }} /> },
              { value: "Low", label: "Low", icon: <Flag className="w-3.5 h-3.5" style={{ color: "var(--theme-text-muted)" }} /> }
            ]}
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-12 pb-6">
        {sortedTasks.length === 0 ? (
          <div className="rounded-[10px] overflow-hidden" style={{ 
            backgroundColor: "var(--theme-bg-surface)",
            border: "1px solid var(--neuron-ui-border)"
          }}>
            <div className="px-6 py-12 text-center">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--neuron-ink-muted)" }} />
              <h3 style={{ color: "var(--neuron-ink-primary)" }} className="mb-1">No tasks found</h3>
              <p style={{ color: "var(--neuron-ink-muted)" }}>Try adjusting your filters or search query</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* High Priority Section */}
            {tasksByPriority.High.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Flag className="w-3.5 h-3.5" style={{ color: "var(--theme-status-danger-fg)" }} />
                  <h3 style={{ fontSize: "12px", fontWeight: 600, color: "var(--theme-status-danger-fg)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    High Priority
                  </h3>
                  <span 
                    className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px]" 
                    style={{ backgroundColor: "#FCE8E6", color: "var(--theme-status-danger-fg)", fontWeight: 600 }}
                  >
                    {tasksByPriority.High.length}
                  </span>
                </div>
                <div className="rounded-[10px] overflow-hidden" style={{ 
                  backgroundColor: "var(--theme-bg-surface)",
                  border: "1px solid var(--neuron-ui-border)"
                }}>
                  {/* Table Header */}
                  <div className="grid grid-cols-[32px_minmax(160px,1fr)_140px_90px_140px_100px] gap-3 px-4 py-2 border-b" style={{ 
                    backgroundColor: "var(--neuron-bg-page)",
                    borderColor: "var(--neuron-ui-divider)"
                  }}>
                    <div></div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Title</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Due Date</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Status</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Linked To</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Owner</div>
                  </div>

                  {/* Task Rows */}
                  <div className="divide-y" style={{ borderColor: "var(--neuron-ui-divider)" }}>
                    {tasksByPriority.High.map(task => (
                      <div
                        key={task.id}
                        className="grid grid-cols-[32px_minmax(160px,1fr)_140px_90px_140px_100px] gap-3 px-4 py-3 cursor-pointer transition-colors"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                        onClick={() => onViewTask(task)}
                      >
                        <div className="flex items-center justify-center">
                          {getTaskTypeIcon(task.type)}
                        </div>

                        <div>
                          <div className="mb-0.5 text-[12px]" style={{ color: "var(--neuron-ink-primary)", fontWeight: 600 }}>{task.title}</div>
                          {task.remarks && (
                            <div className="text-[11px] line-clamp-1" style={{ color: "var(--neuron-ink-muted)" }}>{task.remarks}</div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--neuron-ink-secondary)" }}>
                          <Calendar className="w-3 h-3" style={{ color: "var(--neuron-ink-muted)" }} />
                          {formatDate(task.due_date)}
                        </div>

                        <div>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.002em] ${getStatusColor(task.status)}`}>
                            {task.status}
                          </span>
                        </div>

                        <div className="truncate text-[12px]" style={{ color: "var(--neuron-ink-secondary)" }}>
                          {getLinkedEntity(task)}
                        </div>

                        <div className="text-[12px]" style={{ color: "var(--neuron-ink-secondary)" }}>
                          {getOwnerName(task.owner_id)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Medium Priority Section */}
            {tasksByPriority.Medium.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Flag className="w-3.5 h-3.5" style={{ color: "#C88A2B" }} />
                  <h3 style={{ fontSize: "12px", fontWeight: 600, color: "#C88A2B", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Medium Priority
                  </h3>
                  <span 
                    className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px]" 
                    style={{ backgroundColor: "#FEF3E0", color: "#C88A2B", fontWeight: 600 }}
                  >
                    {tasksByPriority.Medium.length}
                  </span>
                </div>
                <div className="rounded-[10px] overflow-hidden" style={{ 
                  backgroundColor: "var(--theme-bg-surface)",
                  border: "1px solid var(--neuron-ui-border)"
                }}>
                  {/* Table Header */}
                  <div className="grid grid-cols-[32px_minmax(160px,1fr)_140px_90px_140px_100px] gap-3 px-4 py-2 border-b" style={{ 
                    backgroundColor: "var(--neuron-bg-page)",
                    borderColor: "var(--neuron-ui-divider)"
                  }}>
                    <div></div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Title</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Due Date</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Status</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Linked To</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Owner</div>
                  </div>

                  {/* Task Rows */}
                  <div className="divide-y" style={{ borderColor: "var(--neuron-ui-divider)" }}>
                    {tasksByPriority.Medium.map(task => (
                      <div
                        key={task.id}
                        className="grid grid-cols-[32px_minmax(160px,1fr)_140px_90px_140px_100px] gap-3 px-4 py-3 cursor-pointer transition-colors"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                        onClick={() => onViewTask(task)}
                      >
                        <div className="flex items-center justify-center">
                          {getTaskTypeIcon(task.type)}
                        </div>

                        <div>
                          <div className="mb-0.5 text-[12px]" style={{ color: "var(--neuron-ink-primary)", fontWeight: 600 }}>{task.title}</div>
                          {task.remarks && (
                            <div className="text-[11px] line-clamp-1" style={{ color: "var(--neuron-ink-muted)" }}>{task.remarks}</div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--neuron-ink-secondary)" }}>
                          <Calendar className="w-3 h-3" style={{ color: "var(--neuron-ink-muted)" }} />
                          {formatDate(task.due_date)}
                        </div>

                        <div>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.002em] ${getStatusColor(task.status)}`}>
                            {task.status}
                          </span>
                        </div>

                        <div className="truncate text-[12px]" style={{ color: "var(--neuron-ink-secondary)" }}>
                          {getLinkedEntity(task)}
                        </div>

                        <div className="text-[12px]" style={{ color: "var(--neuron-ink-secondary)" }}>
                          {getOwnerName(task.owner_id)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Low Priority Section */}
            {tasksByPriority.Low.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Flag className="w-3.5 h-3.5" style={{ color: "var(--theme-text-muted)" }} />
                  <h3 style={{ fontSize: "12px", fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Low Priority
                  </h3>
                  <span 
                    className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px]" 
                    style={{ backgroundColor: "#F1F6F4", color: "var(--theme-text-muted)", fontWeight: 600 }}
                  >
                    {tasksByPriority.Low.length}
                  </span>
                </div>
                <div className="rounded-[10px] overflow-hidden" style={{ 
                  backgroundColor: "var(--theme-bg-surface)",
                  border: "1px solid var(--neuron-ui-border)"
                }}>
                  {/* Table Header */}
                  <div className="grid grid-cols-[32px_minmax(160px,1fr)_140px_90px_140px_100px] gap-3 px-4 py-2 border-b" style={{ 
                    backgroundColor: "var(--neuron-bg-page)",
                    borderColor: "var(--neuron-ui-divider)"
                  }}>
                    <div></div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Title</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Due Date</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Status</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Linked To</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.002em]" style={{ color: "var(--neuron-ink-muted)" }}>Owner</div>
                  </div>

                  {/* Task Rows */}
                  <div className="divide-y" style={{ borderColor: "var(--neuron-ui-divider)" }}>
                    {tasksByPriority.Low.map(task => (
                      <div
                        key={task.id}
                        className="grid grid-cols-[32px_minmax(160px,1fr)_140px_90px_140px_100px] gap-3 px-4 py-3 cursor-pointer transition-colors"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                        onClick={() => onViewTask(task)}
                      >
                        <div className="flex items-center justify-center">
                          {getTaskTypeIcon(task.type)}
                        </div>

                        <div>
                          <div className="mb-0.5 text-[12px]" style={{ color: "var(--neuron-ink-primary)", fontWeight: 600 }}>{task.title}</div>
                          {task.remarks && (
                            <div className="text-[11px] line-clamp-1" style={{ color: "var(--neuron-ink-muted)" }}>{task.remarks}</div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--neuron-ink-secondary)" }}>
                          <Calendar className="w-3 h-3" style={{ color: "var(--neuron-ink-muted)" }} />
                          {formatDate(task.due_date)}
                        </div>

                        <div>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.002em] ${getStatusColor(task.status)}`}>
                            {task.status}
                          </span>
                        </div>

                        <div className="truncate text-[12px]" style={{ color: "var(--neuron-ink-secondary)" }}>
                          {getLinkedEntity(task)}
                        </div>

                        <div className="text-[12px]" style={{ color: "var(--neuron-ink-secondary)" }}>
                          {getOwnerName(task.owner_id)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Task Panel */}
      {isAddTaskOpen && (
        <AddTaskPanel
          isOpen={isAddTaskOpen}
          onSave={handleSaveTask}
          onClose={() => setIsAddTaskOpen(false)}
        />
      )}
    </div>
  );
}