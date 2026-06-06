// NEU-012 Contract #1 (eliminate ops_bookings umbrella), Step 0 — STRICT.
//
// Client mirror of the DB helper `current_user_can_act_on_booking`. "Can do X
// with a booking" = OR of the REAL, VISIBLE grants that legitimately touch
// bookings. This is enforcement LOGIC over visible grants, not a hidden grant.
// The UI gate and the DB rule read the SAME real grants, so they never disagree.
//
// (acct_bookings:view is intentionally NOT here — Accounting's view-only access
//  is its own grant, handled separately where it applies.)

import type { ModuleId, ActionId } from "../components/admin/permissionsConfig";

const BOOKING_ACTION_MODULES: ModuleId[] = [
  "ops_forwarding",
  "ops_brokerage",
  "ops_trucking",
  "ops_marine_insurance",
  "ops_others",
  "ops_projects_bookings_tab",
];

export function canActOnBooking(
  can: (moduleId: ModuleId, action: ActionId) => boolean,
  action: ActionId,
): boolean {
  return BOOKING_ACTION_MODULES.some((moduleId) => can(moduleId, action));
}
