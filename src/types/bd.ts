// Business Development Module Types

export type LifecycleStage = "Lead" | "Customer" | "MQL" | "SQL";

export type LeadStatus = 
  | "New" 
  | "Open" 
  | "In Progress" 
  | "Unqualified" 
  | "Attempted to contact" 
  | "Connected" 
  | "Bad timing";

export type Industry = string;

export type CustomerStatus = "Prospect" | "Active" | "Inactive";

export type TaskType =
  | "To-do"
  | "Call"
  | "Email"
  | "Marketing Email"
  | "Meeting"
  | "SMS"
  | "Viber"
  | "WeChat"
  | "WhatsApp"
  | "LinkedIn";

export type TaskPriority = "Low" | "Medium" | "High";

export type TaskStatus = "Ongoing" | "Pending" | "Completed" | "Cancelled";

export type CancelReason = "Reschedule" | "Others";

export type ActivityType =
  | "Call"
  | "Call Logged"
  | "Email Logged"
  | "Meeting Logged"
  | "Marketing Email Logged"
  | "SMS Logged"
  | "Viber Logged"
  | "WeChat Logged"
  | "WhatsApp Logged"
  | "LinkedIn Logged"
  | "Note"
  | "System Update";

export type InquiryStatus = "Draft" | "Sent" | "Accepted" | "Rejected" | "Cancelled";

export interface Contact {
  id: string;
  name: string; // ✅ Backend uses single 'name' field, not first_name/last_name
  first_name?: string; // For frontend compatibility
  last_name?: string; // For frontend compatibility
  title: string | null; // ✅ Backend uses 'title', not 'job_title'
  job_title?: string; // For frontend compatibility
  email: string | null;
  phone: string | null; // ✅ Backend uses 'phone', not 'mobile_number'
  mobile_number?: string; // For frontend compatibility
  customer_id: string | null; // ✅ Backend uses 'customer_id', not 'company_id'
  company_id?: string | null; // For frontend compatibility
  lifecycle_stage?: LifecycleStage; // For frontend compatibility
  lead_status?: LeadStatus; // For frontend compatibility
  owner_id?: string; // For frontend compatibility
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string; // ✅ Primary field (backend uses 'name')
  company_name?: string; // alias used in some views
  type?: string; // customer classification (e.g. "Prospect")
  industry: Industry;
  registered_address?: string;
  status: CustomerStatus;
  lead_source?: string;
  owner_id?: string | null;
  client_type?: "Local" | "International";
  credit_terms?: string;
  phone?: string;
  email?: string;
  notes?: string | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// PD-specific minimal customer types (names only, no sensitive info)
export interface PDCustomer {
  id: string;
  name: string; // ✅ Updated to match backend
  contact_count: number;
}

export interface PDCustomerDetail {
  id: string;
  name: string; // ✅ Updated to match backend
  contacts: Array<{ id: string; name: string }>;
  quotations: any[];
}

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  due_date: string;
  priority: TaskPriority;
  status: TaskStatus;
  cancel_reason: CancelReason | null;
  remarks: string;
  notes?: string;
  description?: string;
  contact_id: string | null;
  customer_id: string | null;
  owner_id: string;
  assigned_to?: string;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  type: ActivityType;
  title?: string;
  description: string;
  date: string;
  contact_id: string | null;
  customer_id: string | null;
  task_id: string | null;
  user_id: string;
  created_at: string;
  updated_at?: string;
  attachments?: Array<{ name: string; size: number; type: string; url?: string }>;
}

export interface Inquiry {
  id: string;
  customer_id: string;
  contact_id: string | null;
  source_system_id: string | null;
  status: InquiryStatus;
  created_at: string;
  updated_at: string;
}

// ==================== CONSIGNEE ====================

export interface Consignee {
  id: string;
  customer_id: string;
  name: string;
  address?: string;
  tin?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  created_at: string;
  updated_at: string;
}

// ==================== TEAM PROFILES ====================

export interface TeamProfileAssignment {
  role_key: string;    // stable machine key: 'manager' | 'supervisor' | 'handler' | 'pricing_analyst' | etc.
  role_label: string;  // display label: 'Manager' | 'Pricing Analyst' | etc.
  user_id: string;
  user_name: string;
}

export interface TeamProfileScope {
  customer_id: string;
  department: string;
  service_type?: string | null;
  team_id?: string | null;
}

export interface CustomerTeamProfile extends TeamProfileScope {
  id: string;
  team_name?: string | null;
  assignments: TeamProfileAssignment[];
  notes: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactTeamOverride {
  id: string;
  contact_id: string;
  customer_id: string;
  department: string;
  service_type?: string | null;
  team_id?: string | null;
  team_name?: string | null;
  assignments: TeamProfileAssignment[];
  notes: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertCustomerTeamProfileInput {
  customer_id: string;
  department: string;
  service_type?: string | null;
  team_id?: string | null;
  team_name?: string | null;
  assignments: TeamProfileAssignment[];
  notes?: string | null;
  updated_by?: string | null;
}

export interface UpsertContactTeamOverrideInput {
  contact_id: string;
  customer_id: string;
  department: string;
  service_type?: string | null;
  team_id?: string | null;
  team_name?: string | null;
  assignments: TeamProfileAssignment[];
  notes?: string | null;
  updated_by?: string | null;
}

export interface ResolvedTeamProfile {
  department: string;
  service_type?: string | null;
  team_id?: string | null;
  team_name?: string | null;
  assignments: TeamProfileAssignment[];
  source: 'contact_override' | 'customer' | 'legacy' | 'none';
}
