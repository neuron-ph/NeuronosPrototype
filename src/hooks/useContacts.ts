import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { queryKeys } from "../lib/queryKeys";
import { useRealtimeSync } from "./useRealtimeSync";
import { usePaginatedList } from "./usePaginatedList";
import { sanitizeSearch } from "../utils/pagination";

interface UseContactsOptions {
  customerId?: string;
  enabled?: boolean;
}

type ContactScope =
  | { type: "all" }
  | { type: "own"; userId: string }
  | { type: "userIds"; ids: string[] };

interface UseContactsPaginatedOptions {
  page: number;
  search?: string;
  /** LifecycleStage label ("Lead" | "MQL" | "SQL" | "Customer") or "All". Mapped to the `status` column. */
  lifecycle?: string;
  /** Apply the owner_id scope filter (BD only — Pricing sees all). */
  applyScope?: boolean;
  scope?: ContactScope;
  enabled?: boolean;
}

/** Maps a lifecycle filter label to the `status` column value(s) it represents. */
function lifecycleStatusFilter(builder: any, lifecycle: string) {
  switch (lifecycle) {
    case "MQL":
      return builder.eq("status", "MQL");
    case "SQL":
      return builder.eq("status", "Prospect");
    case "Customer":
      return builder.eq("status", "Customer");
    case "Lead":
      // mapStatusToLifecycle treats null / unknown statuses as "Lead"
      return builder.or("status.eq.Lead,status.is.null");
    default:
      return builder;
  }
}

/** Server-paginated contacts for list views. Search covers name + email. */
export function useContactsPaginated({
  page,
  search = "",
  lifecycle = "All",
  applyScope = false,
  scope = { type: "all" },
  enabled = true,
}: UseContactsPaginatedOptions) {
  const result = usePaginatedList<any>({
    table: "contacts",
    select: "*, customers(name)",
    queryKey: [...queryKeys.contacts.list(), "paginated", { search, lifecycle, applyScope, scope }, page],
    page,
    enabled,
    buildQuery: (q) => {
      let b = q.order("created_at", { ascending: false }).order("id");
      if (applyScope) {
        if (scope.type === "userIds" && scope.ids.length) b = b.in("owner_id", scope.ids);
        else if (scope.type === "own") b = b.eq("owner_id", scope.userId);
      }
      if (lifecycle && lifecycle !== "All") b = lifecycleStatusFilter(b, lifecycle);
      const s = sanitizeSearch(search);
      if (s) b = b.or(`name.ilike.%${s}%,email.ilike.%${s}%`);
      return b;
    },
  });

  useRealtimeSync({ table: "contacts", queryKey: queryKeys.contacts.all(), enabled });

  return result;
}

export function useContacts({ customerId, enabled = true }: UseContactsOptions = {}) {
  const queryClient = useQueryClient();
  const filters = customerId ? { customerId } : {};

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: [...queryKeys.contacts.list(), filters],
    queryFn: async () => {
      let query = supabase.from("contacts").select("*").order("created_at", { ascending: false });
      if (customerId) query = query.eq("customer_id", customerId);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled,
    staleTime: 30_000,
  });

  useRealtimeSync({ table: "contacts", queryKey: queryKeys.contacts.all(), enabled });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all() });
  return { contacts, isLoading, invalidate };
}
