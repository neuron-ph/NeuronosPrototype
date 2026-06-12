import { useQuery } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { usePaginatedList } from "./usePaginatedList";
import { sanitizeSearch } from "../utils/pagination";
import type { DataScope } from "./useDataScope";
import type { AssignmentVisibilityIndex } from "../utils/assignments/applyAssignmentVisibility";

/**
 * Server-side bookings pagination for the Operations list pages
 * (Brokerage / Forwarding / Trucking).
 *
 * RLS (`can_access_booking`) is the security boundary — it already restricts the
 * rows the query can return. The `scope` translation here only mirrors the list
 * page's "My / All / team" UX refinement (see filterBookingsByScope), so an
 * imperfect translation can never leak a booking, only narrow the view.
 *
 * Movement / entry-type live in the `details` JSONB and are filtered with the
 * PostgREST `details->>key` syntax; owner / handler are the real
 * `manager_name` / `handler_name` columns.
 */

const ARCHIVED_STATUSES = ["Cancelled", "Closed", "Paid"];

/** Booking ids where any of `userIds` is assigned via booking_assignments. */
function assignedBookingIds(index: AssignmentVisibilityIndex, userIds: string[]): string[] {
  const ids: string[] = [];
  for (const [bookingId, set] of index.byBooking) {
    if (userIds.some((u) => set.has(u))) ids.push(bookingId);
  }
  return ids;
}

/** Builds the PostgREST `or=` group mirroring filterBookingsByScope (UUID values, no quoting needed). */
function scopeOrClause(userIds: string[], bookingIds: string[]): string {
  const list = userIds.join(",");
  const parts = [
    `created_by.in.(${list})`,
    `manager_id.in.(${list})`,
    `supervisor_id.in.(${list})`,
    `handler_id.in.(${list})`,
  ];
  if (bookingIds.length) parts.push(`id.in.(${bookingIds.join(",")})`);
  return parts.join(",");
}

/** Quote a value for use inside an `or=` clause (names contain spaces / periods). */
function q(v: string): string {
  return `"${v.replace(/"/g, "")}"`;
}

function timePeriodLowerBound(period: string): string | null {
  if (period === "all") return null;
  const days = period === "7days" ? 7 : period === "30days" ? 30 : period === "90days" ? 90 : 0;
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/**
 * A filterable field whose source differs per service — either a real top-level
 * column (`kind: "column"`) or a key inside the `details` JSONB (`kind: "json"`).
 */
export interface FieldSpec {
  value: string; // "all" = no filter
  kind: "column" | "json";
  name: string;
}

export interface BookingsQueryParams {
  serviceType: string;
  scope: DataScope;
  assignmentIndex: AssignmentVisibilityIndex;
  currentUserName?: string | null;
  tab: string; // all | my | draft | in-progress | completed | cancelled
  search: string;
  status: string; // "all" or a status value
  owner: string; // "all" or manager_name
  handler: string; // "all" | "unassigned" | handler_name
  timePeriod: string; // all | 7days | 30days | 90days
  /** Movement filter (Brokerage: JSONB & display-defaults-to-IMPORT; others: column). */
  movementField?: FieldSpec;
  /** Service-specific type filter (Brokerage entry_type/JSONB, Forwarding mode/column, Trucking truck_type/JSONB). */
  typeField?: FieldSpec;
}

/** Applies every list filter (tab + controls) to a bookings query builder. */
function applyBookingFilters(b: any, p: BookingsQueryParams): any {
  b = b.eq("service_type", p.serviceType);

  // Scope refinement (RLS still enforces security underneath)
  if (p.scope.type === "own") {
    b = b.or(scopeOrClause([p.scope.userId], assignedBookingIds(p.assignmentIndex, [p.scope.userId])));
  } else if (p.scope.type === "userIds" && p.scope.ids.length) {
    b = b.or(scopeOrClause(p.scope.ids, assignedBookingIds(p.assignmentIndex, p.scope.ids)));
  }

  // Tab
  if (p.tab === "my" && p.currentUserName) {
    b = b.or(`manager_name.eq.${q(p.currentUserName)},handler_name.eq.${q(p.currentUserName)}`);
  } else if (p.tab === "draft") {
    b = b.eq("status", "Draft");
  } else if (p.tab === "in-progress") {
    b = b.eq("status", "In Progress");
  } else if (p.tab === "completed") {
    b = b.eq("status", "Completed");
  } else if (p.tab === "cancelled") {
    b = b.in("status", ARCHIVED_STATUSES);
  }

  // Status dropdown
  if (p.status !== "all") b = b.eq("status", p.status);

  // Movement
  if (p.movementField && p.movementField.value !== "all") {
    const { kind, name, value } = p.movementField;
    if (kind === "json") {
      // Display defaults a missing JSONB movement to IMPORT, so IMPORT also matches null.
      b = value === "IMPORT" ? b.or(`details->>${name}.eq.IMPORT,details->>${name}.is.null`) : b.eq(`details->>${name}`, value);
    } else {
      b = b.eq(name, value);
    }
  }

  // Owner / handler (real columns)
  if (p.owner !== "all") b = b.eq("manager_name", p.owner);
  if (p.handler === "unassigned") b = b.is("handler_name", null);
  else if (p.handler !== "all") b = b.eq("handler_name", p.handler);

  // Service-specific type filter (entry_type / mode / truck_type)
  if (p.typeField && p.typeField.value !== "all") {
    const { kind, name, value } = p.typeField;
    b = kind === "json" ? b.eq(`details->>${name}`, value) : b.eq(name, value);
  }

  // Time period
  const lb = timePeriodLowerBound(p.timePeriod);
  if (lb) b = b.gte("created_at", lb);

  // Search (real columns + JSONB)
  const s = sanitizeSearch(p.search);
  if (s) {
    b = b.or(
      [
        `booking_number.ilike.${q(`%${s}%`)}`,
        `customer_name.ilike.${q(`%${s}%`)}`,
        `project_id.ilike.${q(`%${s}%`)}`,
        `details->>mbl_mawb.ilike.${q(`%${s}%`)}`,
        `details->>entry_number.ilike.${q(`%${s}%`)}`,
      ].join(","),
    );
  }

  return b;
}

/** Server-paginated bookings page. Returns raw rows (caller maps `details`). */
export function useBookingsPaginated(params: BookingsQueryParams & { page: number; enabled?: boolean }) {
  const { page, enabled = true, ...p } = params;
  return usePaginatedList<any>({
    table: "bookings",
    queryKey: ["bookings", "paginated", p, page],
    page,
    enabled,
    buildQuery: (base) =>
      applyBookingFilters(base, p).order("created_at", { ascending: false }).order("id"),
  });
}

/** Tab counts honoring scope only (not the other filter controls) — mirrors the old in-memory counts. */
export function useBookingTabCounts(params: {
  serviceType: string;
  scope: DataScope;
  assignmentIndex: AssignmentVisibilityIndex;
  currentUserName?: string | null;
  enabled?: boolean;
}) {
  const { serviceType, scope, assignmentIndex, currentUserName, enabled = true } = params;
  return useQuery({
    queryKey: ["bookings", "tab-counts", { serviceType, scope, currentUserName }],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      // Base scope applied to every count
      const scoped = () => {
        let b = supabase.from("bookings").select("id", { count: "exact", head: true }).eq("service_type", serviceType);
        if (scope.type === "own") {
          b = b.or(scopeOrClause([scope.userId], assignedBookingIds(assignmentIndex, [scope.userId])));
        } else if (scope.type === "userIds" && scope.ids.length) {
          b = b.or(scopeOrClause(scope.ids, assignedBookingIds(assignmentIndex, scope.ids)));
        }
        return b;
      };
      const [all, mine, draft, inProgress, completed, archived] = await Promise.all([
        scoped(),
        currentUserName
          ? scoped().or(`manager_name.eq.${q(currentUserName)},handler_name.eq.${q(currentUserName)}`)
          : scoped().eq("id", "__none__"),
        scoped().eq("status", "Draft"),
        scoped().eq("status", "In Progress"),
        scoped().eq("status", "Completed"),
        scoped().in("status", ARCHIVED_STATUSES),
      ]);
      return {
        all: all.count ?? 0,
        my: mine.count ?? 0,
        draft: draft.count ?? 0,
        inProgress: inProgress.count ?? 0,
        completed: completed.count ?? 0,
        cancelled: archived.count ?? 0,
      };
    },
  });
}

/** Distinct dropdown options (owners / handlers + a service-specific type field). */
export function useBookingFilterOptions(params: {
  serviceType: string;
  /** Where the type-filter values live (column vs `details` JSONB key). */
  typeField?: { kind: "column" | "json"; name: string };
  enabled?: boolean;
}) {
  const { serviceType, typeField, enabled = true } = params;
  return useQuery({
    queryKey: ["bookings", "filter-options", { serviceType, typeField }],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const colNames = ["manager_name", "handler_name", "details"];
      if (typeField?.kind === "column") colNames.push(typeField.name);
      const { data, error } = await supabase.from("bookings").select(colNames.join(", ")).eq("service_type", serviceType);
      if (error) throw error;
      const uniq = (vals: any[]) => Array.from(new Set(vals.filter(Boolean))) as string[];
      const typeValues = typeField
        ? uniq((data ?? []).map((r: any) => (typeField.kind === "column" ? r[typeField.name] : r.details?.[typeField.name])))
        : [];
      return {
        owners: uniq((data ?? []).map((r: any) => r.manager_name)),
        handlers: uniq((data ?? []).map((r: any) => r.handler_name)),
        types: typeValues,
      };
    },
  });
}
