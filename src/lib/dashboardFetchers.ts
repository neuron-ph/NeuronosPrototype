/**
 * dashboardFetchers — async fetch functions for MyHomepage dashboard data.
 * Extracted so they can be used with TanStack Query (caching, deduplication).
 */
import { supabase } from "../utils/supabase/client";

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface TicketItem {
  id: string;
  subject: string;
  type: string;
  priority: string;
  linked_record_type: string;
  created_at: string;
}

export interface EVoucherItem {
  id: string;
  evoucher_number: string;
  description: string | null;
  amount: number;
  status: string;
  created_by_name: string;
  created_at: string;
}

export interface BookingItem {
  id: string;
  booking_number: string;
  service_type: string;
  customer_name: string;
  status: string;
  created_at: string;
}

export interface QuotationItem {
  id: string;
  quotation_number: string | null;
  customer_name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface MyWorkData {
  tickets: TicketItem[];
  approvals: EVoucherItem[];
}

export interface DeptQueueData {
  openInquiries: QuotationItem[];
  awaitingClient: QuotationItem[];
  pricingRequests: QuotationItem[];
  pricingInProgress: QuotationItem[];
  activeBookings: BookingItem[];
  acctTickets: TicketItem[];
  pendingEVs: EVoucherItem[];
  execCounts: {
    openInquiries: number;
    inProgressQuotations: number;
    activeBookings: number;
    openTickets: number;
    pendingEVs: number;
  };
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

export async function fetchMyWork(dept: string, role: string): Promise<MyWorkData> {
  const approvalStatuses: string[] = [];
  if (role.includes("tl") || role === "team_lead" || role === "manager") approvalStatuses.push("pending_manager");
  if (dept === "Executive" || role.includes("executive") || role === "ceo") approvalStatuses.push("pending_ceo");
  if (dept === "Accounting") approvalStatuses.push("pending_accounting");

  const evQuery = approvalStatuses.length > 0
    ? supabase
        .from("evouchers")
        .select("id, evoucher_number, description, amount, status, created_by_name, created_at")
        .in("status", approvalStatuses)
        .order("created_at", { ascending: false })
        .limit(5)
    : Promise.resolve({ data: [] as EVoucherItem[] });

  const [{ data: ticketRows }, { data: evRows }] = await Promise.all([
    supabase
      .from("tickets")
      .select("id, subject, type, priority, linked_record_type, created_at, ticket_participants!inner(participant_dept, role)")
      .eq("status", "open")
      .eq("ticket_participants.participant_dept", dept)
      .eq("ticket_participants.role", "to")
      .order("created_at", { ascending: false })
      .limit(8),
    evQuery,
  ]);

  return {
    tickets: (ticketRows ?? []) as TicketItem[],
    approvals: (evRows ?? []) as EVoucherItem[],
  };
}

export async function fetchDeptQueue(dept: string, userId: string): Promise<DeptQueueData> {
  const empty: DeptQueueData = {
    openInquiries: [],
    awaitingClient: [],
    pricingRequests: [],
    pricingInProgress: [],
    activeBookings: [],
    acctTickets: [],
    pendingEVs: [],
    execCounts: { openInquiries: 0, inProgressQuotations: 0, activeBookings: 0, openTickets: 0, pendingEVs: 0 },
  };

  if (dept === "Business Development") {
    const [inqRes, awaitRes] = await Promise.all([
      supabase.from("quotations").select("id, quotation_number, customer_name, status, created_at, updated_at").eq("quotation_type", "spot").in("status", ["New", "Pending", "Submitted"]).order("created_at", { ascending: false }).limit(6),
      supabase.from("quotations").select("id, quotation_number, customer_name, status, created_at, updated_at").eq("status", "Sent to Client").order("updated_at", { ascending: false }).limit(6),
    ]);
    return { ...empty, openInquiries: (inqRes.data ?? []) as QuotationItem[], awaitingClient: (awaitRes.data ?? []) as QuotationItem[] };
  }

  if (dept === "Pricing") {
    const [reqRes, inpRes] = await Promise.all([
      supabase.from("quotations").select("id, quotation_number, customer_name, status, created_at, updated_at").in("status", ["Pending", "Assigned to Pricing"]).order("created_at", { ascending: false }).limit(6),
      supabase.from("quotations").select("id, quotation_number, customer_name, status, created_at, updated_at").in("status", ["Pricing in Progress", "Draft"]).order("updated_at", { ascending: false }).limit(6),
    ]);
    return { ...empty, pricingRequests: (reqRes.data ?? []) as QuotationItem[], pricingInProgress: (inpRes.data ?? []) as QuotationItem[] };
  }

  if (dept === "Operations") {
    // RLS already constrains visible bookings for the current user using
    // booking_assignments and compatibility projections, so the dashboard can
    // rely on the main bookings query instead of legacy handler/supervisor/manager filters.
    const { data } = await supabase
      .from("bookings")
      .select("id, booking_number, service_type, customer_name, status, created_at")
      .not("status", "in", '("Completed","Cancelled")')
      .order("created_at", { ascending: false })
      .limit(10);
    return { ...empty, activeBookings: (data ?? []) as BookingItem[] };
  }

  if (dept === "Accounting") {
    const [tRes, evRes] = await Promise.all([
      supabase.from("tickets").select("id, subject, type, priority, linked_record_type, created_at, ticket_participants!inner(participant_dept, role)").eq("status", "open").eq("ticket_participants.participant_dept", "Accounting").eq("ticket_participants.role", "to").order("created_at", { ascending: false }).limit(10),
      supabase.from("evouchers").select("id, evoucher_number, description, amount, status, created_by_name, created_at").eq("status", "pending_accounting").order("created_at", { ascending: false }).limit(6),
    ]);
    return { ...empty, acctTickets: (tRes.data ?? []) as TicketItem[], pendingEVs: (evRes.data ?? []) as EVoucherItem[] };
  }

  if (dept === "Executive") {
    const [inqR, quotR, bkgR, tickR, evR] = await Promise.all([
      supabase.from("quotations").select("id", { count: "exact", head: true }).in("status", ["New", "Pending"]),
      supabase.from("quotations").select("id", { count: "exact", head: true }).in("status", ["Pricing in Progress", "Draft"]),
      supabase.from("bookings").select("id", { count: "exact", head: true }).not("status", "in", '("Completed","Cancelled")'),
      supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("evouchers").select("id", { count: "exact", head: true }).in("status", ["pending_manager", "pending_ceo", "pending_accounting"]),
    ]);
    return {
      ...empty,
      execCounts: {
        openInquiries: inqR.count ?? 0,
        inProgressQuotations: quotR.count ?? 0,
        activeBookings: bkgR.count ?? 0,
        openTickets: tickR.count ?? 0,
        pendingEVs: evR.count ?? 0,
      },
    };
  }

  return empty;
}
