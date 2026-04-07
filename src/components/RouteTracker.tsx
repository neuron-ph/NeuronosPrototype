/**
 * RouteTracker — mounts once inside the router and records entity-level
 * navigation to the "Continue Work" localStorage store.
 *
 * Only URL-routed detail pages are tracked here (UUID params).
 * Panel/drawer opens inside list views are tracked directly in those components
 * via trackRecent() at the handleView* call site.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { trackRecent, type RecentItem } from "../lib/recents";
import { supabase } from "../utils/supabase/client";

// Paths that should never be recorded
const SKIP_PATHS = new Set([
  "/", "/dashboard", "/login", "/settings", "/supabase-debug", "/diagnostics",
]);

// ── Dynamic routes — UUID-based detail pages ──────────────────────────────────

type Resolver = (match: RegExpMatchArray, path: string) => Promise<RecentItem | null>;

const DYNAMIC_ROUTES: Array<[RegExp, Resolver]> = [
  // BD inquiry detail
  [
    /^\/bd\/inquiries\/([^/]+)$/,
    async ([, id], path) => {
      const { data } = await supabase
        .from("quotations")
        .select("quotation_number, customer_name")
        .eq("id", id)
        .maybeSingle();
      if (!data) return null;
      return {
        label: data.quotation_number || "Inquiry",
        sub: `BD · ${data.customer_name || ""}`,
        path,
        type: "inquiry",
        time: new Date().toISOString(),
      };
    },
  ],

  // BD contact detail
  [
    /^\/bd\/contacts\/([^/]+)$/,
    async ([, id], path) => {
      const { data } = await supabase
        .from("contacts")
        .select("name, first_name, last_name")
        .eq("id", id)
        .maybeSingle();
      if (!data) return null;
      const label =
        data.name ||
        [data.first_name, data.last_name].filter(Boolean).join(" ") ||
        "Contact";
      return {
        label,
        sub: "BD · Contact",
        path,
        type: "inquiry",
        time: new Date().toISOString(),
      };
    },
  ],

  // Pricing quotation detail
  [
    /^\/pricing\/quotations\/([^/]+)$/,
    async ([, id], path) => {
      const { data } = await supabase
        .from("quotations")
        .select("quotation_number, customer_name")
        .eq("id", id)
        .maybeSingle();
      if (!data) return null;
      return {
        label: data.quotation_number || "Quotation",
        sub: `Pricing · ${data.customer_name || ""}`,
        path,
        type: "quotation",
        time: new Date().toISOString(),
      };
    },
  ],

  // Operations booking detail (only actual UUIDs — list sub-paths are not tracked here)
  [
    /^\/operations\/([^/]+)$/,
    async ([, id], path) => {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const { data } = await supabase
        .from("bookings")
        .select("booking_number, service_type, customer_name")
        .eq("id", id)
        .maybeSingle();
      if (!data) return null;
      return {
        label: data.booking_number || "Booking",
        sub: `Operations · ${data.service_type || ""}`,
        path,
        type: "booking",
        time: new Date().toISOString(),
      };
    },
  ],
];

// ── Component ─────────────────────────────────────────────────────────────────

export function RouteTracker() {
  const location = useLocation();
  const lastTracked = useRef<string>("");

  useEffect(() => {
    const { pathname } = location;

    if (SKIP_PATHS.has(pathname)) return;

    // Dedupe: skip if same path as last tracked
    if (pathname === lastTracked.current) return;
    lastTracked.current = pathname;

    // Dynamic route match
    for (const [pattern, resolve] of DYNAMIC_ROUTES) {
      const match = pathname.match(pattern);
      if (match) {
        resolve(match, pathname).then((item) => {
          if (item) trackRecent(item);
        });
        return;
      }
    }
  }, [location]);

  return null;
}
