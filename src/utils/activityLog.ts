import { supabase } from "./supabase/client";

export interface ActivityActor {
  id: string;
  name: string;
  department: string;
}

export interface ActivityDetails {
  oldValue?: string;
  newValue?: string;
  description?: string;
}

/**
 * Append-only event log — like a game event log.
 * Call this after every user action: create, update, delete, status change, approval.
 * Fire-and-forget: does not await, does not block the UI.
 */
export function logActivity(
  entityType: string,
  entityId: string,
  entityName: string,
  actionType: string,
  actor: ActivityActor,
  details?: ActivityDetails,
): void {
  const row = {
    entity_type: entityType,
    entity_id: entityId,
    entity_name: entityName,
    action_type: actionType,
    old_value: details?.oldValue ?? null,
    new_value: details?.newValue ?? null,
    user_id: actor.id || null,
    user_name: actor.name,
    user_department: actor.department,
    metadata: details?.description ? { description: details.description } : {},
  };

  supabase.from("activity_log").insert(row).then(({ error }) => {
    if (!error) return;

    // 23503 = foreign_key_violation. activity_log.user_id references users(id),
    // so an actor id that is not a live profile — a stale cached session, an id
    // from another environment — throws the whole insert away and the audit
    // entry is lost entirely. The column is ON DELETE SET NULL, so a null actor
    // is a legitimate row: keep the record, attribute it by name, and say
    // loudly which id was rejected so the caller can be found.
    if (error.code === "23503") {
      console.error(
        `[ActivityLog] actor id "${row.user_id}" is not a users.id — ` +
          `re-logging "${actionType} ${entityType}" without an actor link.`,
      );
      void supabase
        .from("activity_log")
        .insert({ ...row, user_id: null })
        .then(({ error: retryError }) => {
          if (retryError) console.error("[ActivityLog] Retry failed:", retryError.message);
        });
      return;
    }

    console.error("[ActivityLog] Insert failed:", error.message);
  });
}

/** Log a status transition: "In Progress → Delivered" */
export function logStatusChange(
  entityType: string,
  entityId: string,
  entityName: string,
  oldStatus: string,
  newStatus: string,
  actor: ActivityActor,
): void {
  logActivity(entityType, entityId, entityName, "status_change", actor, {
    oldValue: oldStatus,
    newValue: newStatus,
  });
}

/** Log an entity creation */
export function logCreation(
  entityType: string,
  entityId: string,
  entityName: string,
  actor: ActivityActor,
): void {
  logActivity(entityType, entityId, entityName, "created", actor);
}

/** Log an entity deletion */
export function logDeletion(
  entityType: string,
  entityId: string,
  entityName: string,
  actor: ActivityActor,
): void {
  logActivity(entityType, entityId, entityName, "deleted", actor);
}

/** Log an approval/rejection workflow transition */
export function logApproval(
  entityType: string,
  entityId: string,
  entityName: string,
  oldStatus: string,
  newStatus: string,
  actor: ActivityActor,
  approved: boolean,
): void {
  logActivity(entityType, entityId, entityName, approved ? "approved" : "rejected", actor, {
    oldValue: oldStatus,
    newValue: newStatus,
  });
}

/** Log a field update with old/new values */
export function logFieldUpdate(
  entityType: string,
  entityId: string,
  entityName: string,
  fieldName: string,
  oldValue: string,
  newValue: string,
  actor: ActivityActor,
): void {
  logActivity(entityType, entityId, entityName, "updated", actor, {
    oldValue,
    newValue,
    description: `Updated ${fieldName}`,
  });
}
