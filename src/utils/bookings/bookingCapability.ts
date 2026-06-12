import type { ModuleId, ActionId } from "../../components/admin/permissionsConfig";

/**
 * Doctrine: "While in [Module], they can [Action] [Record]."
 * "While in the Projects module, can Create Bookings" = <door>_projects_bookings_tab:create.
 *
 * A user may act on a booking if they hold the action on ANY Bookings record
 * surface — the per-door Projects/Contracts "Bookings" tab, OR the direct
 * Operations service module. This MUST mirror the DB helper
 * current_user_can_act_on_booking exactly (migration 202), so the client never
 * blocks what RLS allows (and never offers what RLS denies). NEU-006/NEU-012.
 *
 * NOT based on incidental service grants: a Pricing user authorised purely by
 * pricing_projects_bookings_tab:create must pass here even with every
 * ops_<service> module OFF.
 */
const BOOKING_ACTION_MODULES: ModuleId[] = [
  // Projects → Bookings (per door)
  "bd_projects_bookings_tab",
  "pricing_projects_bookings_tab",
  "ops_projects_bookings_tab",
  "acct_projects_bookings_tab",
  // Contracts → Bookings (per door)
  "bd_contracts_bookings_tab",
  "pricing_contracts_bookings_tab",
  "acct_contracts_bookings_tab",
  // Direct Operations booking service modules
  "ops_forwarding",
  "ops_brokerage",
  "ops_trucking",
  "ops_marine_insurance",
  "ops_others",
];

/** True if the user can perform `action` on a booking via ANY booking surface. */
export function canActOnBooking(
  can: (moduleId: ModuleId, action: ActionId) => boolean,
  action: Extract<ActionId, "create" | "edit">,
): boolean {
  return BOOKING_ACTION_MODULES.some((m) => can(m, action));
}

/** Backstop for the create/submit + save-draft handlers: create OR edit on any surface. */
export function canCreateOrEditBooking(
  can: (moduleId: ModuleId, action: ActionId) => boolean,
): boolean {
  return canActOnBooking(can, "create") || canActOnBooking(can, "edit");
}
