import { isProfileSelectionValue, profileValueToLabel } from './profileSerialize';

export interface SelectedCustomer {
  customerId: string | null;
  customerName: string;
}

/**
 * Reads the selected customer from a booking form state.
 *
 * `customer_name` is a profile-lookup field, so its runtime shape may be:
 * - a ProfileSelectionValue object
 * - a legacy plain string
 * - empty / null
 *
 * For create flows we want a normalized pair:
 * - `customerName` for banners / UI gating
 * - `customerId` for assignment-profile resolution and persistence
 */
export function getSelectedCustomer(
  formState: Record<string, unknown>,
  fallbackCustomerId?: string | null,
): SelectedCustomer {
  const rawCustomer = formState.customer_name;
  const customerName = profileValueToLabel(rawCustomer).trim();

  // Top-level customer_id column — the source of truth when the customer_name
  // profile object carries no id (e.g. handoff bookings hydrated as 'manual').
  const topLevelCustomerId =
    typeof formState.customer_id === 'string' && formState.customer_id.trim().length > 0
      ? formState.customer_id
      : null;

  if (isProfileSelectionValue(rawCustomer)) {
    return {
      customerId: rawCustomer.id ?? topLevelCustomerId ?? fallbackCustomerId ?? null,
      customerName,
    };
  }

  return {
    customerId: topLevelCustomerId ?? fallbackCustomerId ?? null,
    customerName,
  };
}
