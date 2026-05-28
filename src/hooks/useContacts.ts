import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { queryKeys } from "../lib/queryKeys";
import { useRealtimeSync } from "./useRealtimeSync";

interface UseContactsOptions {
  customerId?: string;
  enabled?: boolean;
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
