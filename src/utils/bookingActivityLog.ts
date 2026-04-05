import { supabase } from "./supabase/client";
import { logActivity } from "./activityLog";

export interface BookingActivityEntry {
  id: string;
  timestamp: Date;
  user: string;
  action: "field_updated" | "status_changed" | "created" | "note_added";
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  statusFrom?: string;
  statusTo?: string;
}

function mapActionType(actionType: string): BookingActivityEntry["action"] {
  switch (actionType) {
    case "status_change": return "status_changed";
    case "created":       return "created";
    case "note_added":    return "note_added";
    default:              return "field_updated";
  }
}

export async function loadBookingActivityLog(
  bookingId: string,
): Promise<BookingActivityEntry[]> {
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, action_type, old_value, new_value, user_name, user_department, metadata, created_at")
    .eq("entity_type", "booking")
    .eq("entity_id", bookingId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    timestamp: new Date(row.created_at),
    user: row.user_name || "System",
    action: mapActionType(row.action_type),
    fieldName: row.metadata?.fieldName ?? undefined,
    oldValue: row.old_value ?? row.metadata?.oldValue ?? undefined,
    newValue: row.new_value ?? row.metadata?.newValue ?? undefined,
    statusFrom: row.metadata?.statusFrom ?? undefined,
    statusTo: row.metadata?.statusTo ?? undefined,
  }));
}

export function appendBookingActivity(
  bookingId: string,
  entry: Omit<BookingActivityEntry, "id" | "timestamp">,
  actor: { name: string; department: string },
): void {
  const actionType =
    entry.action === "status_changed" ? "status_change"
    : entry.action === "created"      ? "created"
    : entry.action === "note_added"   ? "note_added"
    : "updated";

  // Delegate to the shared logActivity utility (fire-and-forget)
  logActivity(
    "booking",
    bookingId,
    bookingId,
    actionType,
    { id: "", name: actor.name, department: actor.department },
    {
      oldValue: entry.oldValue ?? entry.statusFrom ?? undefined,
      newValue: entry.newValue ?? entry.statusTo ?? undefined,
      description: entry.fieldName ? `Updated ${entry.fieldName}` : undefined,
    },
  );
}
