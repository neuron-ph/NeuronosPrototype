import { supabase } from '../supabase/client';
import type {
  BookingAssignmentInput,
  BookingAssignmentProjection,
} from '../../types/assignments';

/**
 * Replace the booking_assignments rows for a booking with the new set.
 * v1 enforces single-user-per-role, so we delete-then-insert in one round-trip.
 *
 * The booking row's legacy {manager,supervisor,handler}_{id,name} columns are
 * NOT updated here — the caller is expected to update them at the same time
 * via projectAssignmentsToBooking. Doing both in one place keeps the legacy
 * projection in sync with the new source-of-truth rows.
 *
 * Returns { ok: true } on success, or { ok: false, error } on failure.
 * Callers should treat assignment failure as fatal for booking creation —
 * surface an error and do not report success.
 */
export async function replaceBookingAssignments(params: {
  bookingId: string;
  serviceType: string;
  assignments: BookingAssignmentInput[];
  assignedBy: string | null;
  projection?: Partial<BookingAssignmentProjection> | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { bookingId, serviceType, assignments, assignedBy, projection } = params;

  const rows = assignments
    .filter((a) => a.user_id && a.role_key)
    .map((a) => ({
      role_key: a.role_key,
      role_label: a.role_label,
      user_id: a.user_id,
      user_name: a.user_name,
      source: a.source ?? 'manual',
    }));

  const { error } = await supabase.rpc('replace_booking_assignments_atomic', {
    p_booking_id: bookingId,
    p_service_type: serviceType,
    p_assignments: rows,
    p_assigned_by: assignedBy,
    p_team_id: projection?.team_id ?? null,
    p_team_name: projection?.team_name ?? null,
    p_manager_id: projection?.manager_id ?? null,
    p_manager_name: projection?.manager_name ?? null,
    p_supervisor_id: projection?.supervisor_id ?? null,
    p_supervisor_name: projection?.supervisor_name ?? null,
    p_handler_id: projection?.handler_id ?? null,
    p_handler_name: projection?.handler_name ?? null,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

/**
 * Save the current booking assignments as the customer (or trade-party) default
 * for this service. Replaces the existing default if one exists.
 */
export async function saveAssignmentsAsDefault(params: {
  subjectType: 'customer' | 'trade_party';
  subjectId: string;
  customerId: string | null;
  serviceType: string;
  teamId: string | null;
  assignments: BookingAssignmentInput[];
  updatedBy: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    subjectType,
    subjectId,
    customerId,
    serviceType,
    teamId,
    assignments,
    updatedBy,
  } = params;

  const rows = assignments
    .filter((a) => a.user_id && a.role_key)
    .map((a) => ({
      role_key: a.role_key,
      role_label: a.role_label,
      user_id: a.user_id,
      user_name: a.user_name,
    }));

  const { error } = await supabase.rpc('replace_assignment_default_atomic', {
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_customer_id: customerId,
    p_service_type: serviceType,
    p_team_id: teamId,
    p_assignments: rows,
    p_updated_by: updatedBy,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
