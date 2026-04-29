import { supabase } from "./supabase/client";

/**
 * Generates a sequential, human-readable booking number for the given service type.
 * Calls the `generate_booking_number` Postgres RPC which atomically increments
 * the per-type counter and returns a formatted string.
 *
 * Format: {PREFIX}-{YYYY}-{NNNN}
 * Examples: FWD-2026-0001, BRK-2026-0042, TRK-2026-0007, MIP-2026-0003, OTH-2026-0011
 *
 * The counter is global-per-type (not year-resetting). The year is cosmetic.
 */
export async function generateBookingNumber(serviceType: string): Promise<string> {
  const { data, error } = await supabase.rpc("generate_booking_number", {
    p_service_type: serviceType,
  });

  if (error) {
    throw new Error(`Failed to generate booking number: ${error.message}`);
  }

  return data as string;
}

/**
 * Preview of the next booking number for a service type WITHOUT allocating it.
 * Calls `peek_next_booking_number` (migration 077). On failure (e.g. RPC not yet
 * deployed), returns null so the caller can quietly omit the preview.
 *
 * The displayed value is best-effort: a concurrent booking create between
 * preview and save will shift the actual assigned number.
 */
export async function peekNextBookingNumber(
  serviceType: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("peek_next_booking_number", {
      p_service_type: serviceType,
    });
    if (error) return null;
    return (data as string) ?? null;
  } catch {
    return null;
  }
}
