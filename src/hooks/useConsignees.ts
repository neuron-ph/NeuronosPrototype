import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Consignee } from "../types/bd";
import { supabase } from "../utils/supabase/client";
import { queryKeys } from "../lib/queryKeys";

export function useConsignees(customerId?: string) {
  const queryClient = useQueryClient();
  const qKey = queryKeys.customers.consignees(customerId ?? "");

  const { data: consignees = [], isLoading, error } = useQuery({
    queryKey: qKey,
    queryFn: async () => {
      const { data, error: fetchErr } = await supabase
        .from("consignees")
        .select("*")
        .eq("customer_id", customerId!);
      if (fetchErr) throw fetchErr;
      return (data || []) as Consignee[];
    },
    enabled: !!customerId,
    staleTime: 5 * 60 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qKey });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Consignee>) => {
      // consignees.id is text NOT NULL with no DB default — generate client-side.
      const payload = {
        id: data.id ?? crypto.randomUUID(),
        ...data,
        customer_id: customerId,
      };
      const { data: created, error } = await supabase
        .from("consignees")
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return created as Consignee;
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Consignee> }) => {
      const { data: updated, error } = await supabase
        .from("consignees")
        .update(data)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return updated as Consignee;
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("consignees").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  return {
    consignees,
    isLoading,
    error: error ? (error as Error).message : null,
    fetchConsignees: invalidate,
    createConsignee: (data: Partial<Consignee>) => createMutation.mutateAsync(data),
    updateConsignee: (id: string, data: Partial<Consignee>) =>
      updateMutation.mutateAsync({ id, data }),
    deleteConsignee: (id: string) => deleteMutation.mutateAsync(id),
  };
}
