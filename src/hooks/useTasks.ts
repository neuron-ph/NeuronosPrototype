import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { queryKeys } from "../lib/queryKeys";

interface UseTasksOptions {
  customerId?: string;
  contactId?: string;
  ownerIds?: string[];
  enabled?: boolean;
}

export function useTasks({ customerId, contactId, ownerIds, enabled = true }: UseTasksOptions = {}) {
  const queryClient = useQueryClient();
  const filters = { customerId, contactId, ownerIds };

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: queryKeys.tasks.list(filters),
    queryFn: async () => {
      let query = supabase.from("tasks").select("*").order("due_date", { ascending: true });
      if (customerId) query = query.eq("customer_id", customerId);
      if (contactId) query = query.eq("contact_id", contactId);
      if (ownerIds && ownerIds.length > 0) query = query.in("owner_id", ownerIds);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled,
    staleTime: 30_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
  return { tasks, isLoading, invalidate };
}
