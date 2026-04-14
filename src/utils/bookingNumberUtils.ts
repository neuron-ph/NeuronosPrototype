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
