/**
 * Cross-module red-dot notification helper.
 *
 * Call recordNotificationEvent at the write site for any meaningful change
 * (assignment, status transition, handoff, post, mention, etc.). Audience is
 * resolved by the caller and passed in as recipientIds.
 *
 * The DB function fan-out automatically:
 *   - dedupes recipientIds
 *   - excludes the actor (no self-notifications)
 *   - inserts into notification_recipients
 *   - triggers update notification_counters (used by sidebar)
 *
 * Realtime: clients subscribe via useNotifications() — no manual invalidation
 * needed when an event is recorded by another user.
 */
import { supabase } from "./supabase/client";

export type NotifModule =
  | "bd"
  | "pricing"
  | "operations"
  | "accounting"
  | "hr"
  | "executive";

/** Optional sub-section under a module — drives sub-nav badges. */
export type NotifSubSection =
  | "contacts"
  | "customers"
  | "inquiries"
  | "projects"
  | "contracts"
  | "tasks"
  | "activities"
  | "budget-requests"
  | "quotations"
  | "bookings"
  | "billings"
  | "invoices"
  | "collections"
  | "evouchers"
  | "expenses"
  | "leave-requests"
  | "comments"
  | "forwarding"
  | "brokerage"
  | "trucking"
  | "marine-insurance"
  | "others"
  | "";

/** Map a Service type to a sidebar sub_section under operations. */
export function operationsSubSectionFor(serviceType: string | null | undefined): NotifSubSection {
  switch ((serviceType || "").toLowerCase()) {
    case "forwarding":         return "forwarding";
    case "brokerage":          return "brokerage";
    case "trucking":           return "trucking";
    case "marine insurance":   return "marine-insurance";
    case "others":             return "others";
    default:                   return "";
  }
}

export type NotifEntityType =
  | "booking"
  | "billing"
  | "invoice"
  | "collection"
  | "evoucher"
  | "project"
  | "contract"
  | "quotation"
  | "inquiry"
  | "customer"
  | "task"
  | "leave_request"
  | "budget_request"
  | "comment"
  | "thread"
  | "user";

export type NotifEventKind =
  | "assigned"
  | "handoff"
  | "status_changed"
  | "submitted"
  | "approved"
  | "rejected"
  | "posted"
  | "issued"
  | "recorded"
  | "commented"
  | "mentioned"
  | "overdue"
  | "updated";

export interface NotifSummary {
  /** Short human label, e.g. "Booking BK-2026-0123 assigned to you" */
  label?: string;
  /** Optional fields denormalized for the UI without re-fetching */
  reference?: string;
  customer_name?: string;
  project_number?: string;
  amount?: number;
  currency?: string;
  from_status?: string;
  to_status?: string;
  [k: string]: unknown;
}

export interface RecordNotificationParams {
  actorUserId: string | null;
  module: NotifModule;
  subSection?: NotifSubSection | null;
  entityType: NotifEntityType;
  entityId: string;
  kind: NotifEventKind;
  summary?: NotifSummary;
  /** User IDs (text PK) of all recipients. Actor is auto-excluded by the DB. */
  recipientIds: Array<string | null | undefined>;
}

/**
 * Record a notification event and fan it out to recipients.
 * Safe to await or fire-and-forget. Errors are logged but never thrown
 * (notifications must never break the calling write path).
 */
export async function recordNotificationEvent(
  params: RecordNotificationParams,
): Promise<string | null> {
  const recipients = (params.recipientIds || [])
    .filter((r): r is string => !!r && r !== params.actorUserId);
  if (recipients.length === 0) return null;

  const { data, error } = await supabase.rpc("record_notification_event", {
    p_actor_user_id: params.actorUserId,
    p_module: params.module,
    p_sub_section: params.subSection || null,
    p_entity_type: params.entityType,
    p_entity_id: params.entityId,
    p_event_kind: params.kind,
    p_summary: params.summary || {},
    p_recipient_ids: Array.from(new Set(recipients)),
  });

  if (error) {
    // Non-fatal — surface in console, don't throw
    console.warn("[notifications] record failed", error.message, params);
    return null;
  }
  return (data as string) || null;
}

/** Mark all unread events for a single entity as read for the given user. */
export async function markEntityRead(
  userId: string,
  entityType: NotifEntityType,
  entityId: string,
): Promise<number> {
  if (!userId) return 0;
  const { data, error } = await supabase.rpc("mark_entity_read", {
    p_user_id: userId,
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) {
    console.warn("[notifications] mark_entity_read failed", error.message);
    return 0;
  }
  return (data as number) || 0;
}

/** Mark all unread for a user × module (or module + sub_section) as read. */
export async function markModuleRead(
  userId: string,
  module: NotifModule,
  subSection?: NotifSubSection | null,
): Promise<number> {
  if (!userId) return 0;
  const { data, error } = await supabase.rpc("mark_module_read", {
    p_user_id: userId,
    p_module: module,
    p_sub_section: subSection || null,
  });
  if (error) {
    console.warn("[notifications] mark_module_read failed", error.message);
    return 0;
  }
  return (data as number) || 0;
}
