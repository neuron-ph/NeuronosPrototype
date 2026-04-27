import { supabase } from '../supabase/client';
import { projectAssignmentsToBooking } from './projectAssignmentsToBooking';
import { replaceBookingAssignments, saveAssignmentsAsDefault } from './persistBookingAssignments';
import type { ServiceRoleAssignmentPayload } from '../../components/operations/assignments/ServiceRoleAssignmentForm';

/**
 * Returns the legacy {team,manager,supervisor,handler}_{id,name} fields to
 * merge into the bookings row at insert time. The caller spreads these into
 * the row payload alongside the rest of the booking data.
 */
export function legacyProjectionFromAssignment(payload: ServiceRoleAssignmentPayload | null) {
  if (!payload) return {};
  return projectAssignmentsToBooking({
    serviceType: payload.serviceType,
    assignments: payload.assignments,
    serviceManager: payload.service
      ? {
          id: payload.service.default_manager_id,
          name: payload.service.default_manager_name,
        }
      : null,
    teamPool: payload.teamPool,
  });
}

/**
 * After a booking has been inserted, write its booking_assignments rows and —
 * if the user asked — save the assignments as a customer or trade-party
 * default. Returns { ok: false, error } if the assignments insert fails.
 *
 * The caller should treat assignment failure as fatal: surface the error and
 * do NOT report the booking as successfully created. Saving as default is
 * best-effort and never throws.
 */
export async function persistAssignmentsForNewBooking(params: {
  bookingId: string;
  payload: ServiceRoleAssignmentPayload | null;
  customerId: string | null | undefined;
  tradePartyProfileId?: string | null;
  assignedBy: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { bookingId, payload, customerId, tradePartyProfileId, assignedBy } = params;
  if (!payload || payload.assignments.length === 0) return { ok: true };

  const projection = legacyProjectionFromAssignment(payload);

  const replaceRes = await replaceBookingAssignments({
    bookingId,
    serviceType: payload.serviceType,
    assignments: payload.assignments,
    assignedBy,
    projection,
  });
  if (!replaceRes.ok) return replaceRes;

  if (payload.saveAsDefault === 'customer' && customerId) {
    try {
      await saveAssignmentsAsDefault({
        subjectType: 'customer',
        subjectId: customerId,
        customerId,
        serviceType: payload.serviceType,
        teamId: payload.teamPool.id,
        assignments: payload.assignments,
        updatedBy: assignedBy,
      });
    } catch (err) {
      console.error('persistAssignmentsForNewBooking: save-as-default failed', err);
    }
  } else if (payload.saveAsDefault === 'trade_party' && tradePartyProfileId) {
    try {
      await saveAssignmentsAsDefault({
        subjectType: 'trade_party',
        subjectId: tradePartyProfileId,
        customerId: customerId ?? null,
        serviceType: payload.serviceType,
        teamId: payload.teamPool.id,
        assignments: payload.assignments,
        updatedBy: assignedBy,
      });
    } catch (err) {
      console.error('persistAssignmentsForNewBooking: save-as-default failed', err);
    }
  }

  return { ok: true };
}

// Re-export the supabase client lazily so test mocks can intercept easily.
export { supabase };
