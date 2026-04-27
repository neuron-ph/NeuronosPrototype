import type { TeamAssignment } from '../../components/pricing/TeamAssignmentForm';
import { operationsAssignmentToProfileInput } from '../teamProfileMapping';
import { upsertCustomerTeamProfile } from '../teamProfilePersistence';

/**
 * Persists a "Save as default crew" selection from any booking create panel.
 * Uses the canonical customer_team_profiles table via operationsAssignmentToProfileInput
 * + upsertCustomerTeamProfile — the same path used by BookingTeamSection (detail view).
 *
 * Errors are swallowed and logged so a preference save failure never blocks booking creation.
 */
export async function saveTeamPreference(
  assignment: TeamAssignment,
  customerId: string,
  serviceType: string,
  updatedById: string | null,
): Promise<void> {
  if (!assignment.saveAsDefault || !customerId || !serviceType) return;
  try {
    const profileInput = operationsAssignmentToProfileInput(assignment, customerId, serviceType);
    await upsertCustomerTeamProfile({ ...profileInput, updated_by: updatedById });
  } catch (err) {
    console.error('saveTeamPreference: failed to save default crew', err);
  }
}
