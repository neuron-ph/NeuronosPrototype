import type { DataScope } from '../../hooks/useDataScope';

/**
 * Centralized booking visibility filter for list pages.
 *
 * RLS already filters bookings server-side via can_access_booking, but the
 * client also filters again to honor a list page's user-scope (e.g. "My
 * bookings only"). Before v1 the client-side filter only checked legacy
 * columns: created_by, manager_id, supervisor_id, handler_id. That meant a
 * user assigned via booking_assignments — but absent from those columns —
 * would see the booking in the "All" view but disappear in their personal
 * list.
 *
 * This helper closes that gap by additionally consulting a
 * booking_id → assigned-user-ids map. Pass an empty map and behavior matches
 * the pre-v1 filter exactly, so list pages can adopt this incrementally.
 */

interface BookingShape {
  bookingId?: string;
  id?: string;
  created_by?: string | null;
  manager_id?: string | null;
  supervisor_id?: string | null;
  handler_id?: string | null;
}

export interface AssignmentVisibilityIndex {
  /** Map booking_id -> set of user_ids assigned via booking_assignments. */
  byBooking: Map<string, Set<string>>;
}

export function buildAssignmentVisibilityIndex(
  rows: Array<{ booking_id: string; user_id: string }> | null | undefined,
): AssignmentVisibilityIndex {
  const byBooking = new Map<string, Set<string>>();
  for (const row of rows ?? []) {
    const set = byBooking.get(row.booking_id) ?? new Set<string>();
    set.add(row.user_id);
    byBooking.set(row.booking_id, set);
  }
  return { byBooking };
}

function getBookingId<T extends BookingShape>(b: T): string | null {
  return b.bookingId ?? b.id ?? null;
}

function isAssigned(
  index: AssignmentVisibilityIndex,
  bookingId: string | null,
  userId: string,
): boolean {
  if (!bookingId) return false;
  const set = index.byBooking.get(bookingId);
  return !!set && set.has(userId);
}

function anyAssignmentInIds(
  index: AssignmentVisibilityIndex,
  bookingId: string | null,
  ids: string[],
): boolean {
  if (!bookingId) return false;
  const set = index.byBooking.get(bookingId);
  if (!set) return false;
  for (const id of ids) {
    if (set.has(id)) return true;
  }
  return false;
}

export function filterBookingsByScope<T extends BookingShape>(
  rows: T[],
  scope: DataScope,
  index: AssignmentVisibilityIndex,
): T[] {
  if (scope.type === 'all') return rows;
  if (scope.type === 'userIds') {
    const ids = scope.ids;
    return rows.filter((b) => {
      const bid = getBookingId(b);
      return (
        ids.includes(b.created_by ?? '') ||
        ids.includes(b.manager_id ?? '') ||
        ids.includes(b.supervisor_id ?? '') ||
        ids.includes(b.handler_id ?? '') ||
        anyAssignmentInIds(index, bid, ids)
      );
    });
  }
  // 'own'
  const me = scope.userId;
  return rows.filter((b) => {
    const bid = getBookingId(b);
    return (
      b.created_by === me ||
      b.manager_id === me ||
      b.supervisor_id === me ||
      b.handler_id === me ||
      isAssigned(index, bid, me)
    );
  });
}
