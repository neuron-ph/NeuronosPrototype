import { supabase } from "./client";

// Supabase idles connections after ~5 minutes of inactivity.
// Ping every 4 minutes to stay within that window.
const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000;

async function ping(): Promise<void> {
  try {
    // Lightest possible DB touch — single row, single column, no joins.
    await supabase.from("users").select("id").limit(1);
  } catch {
    // Keepalive failures are silent — they must never surface to users.
  }
}

/**
 * Fire a single warmup ping immediately on app boot.
 * Call this as early as possible (before createRoot) so the connection
 * is established in parallel with the React render.
 */
export function warmupSupabase(): void {
  ping();
}

/**
 * Start a recurring keepalive ping to prevent Supabase from idling.
 * Also fires one immediate ping.
 * Returns a cleanup function (call it if you ever need to stop the interval).
 */
export function startKeepalive(): () => void {
  ping();
  const intervalId = setInterval(ping, KEEPALIVE_INTERVAL_MS);
  return () => clearInterval(intervalId);
}
