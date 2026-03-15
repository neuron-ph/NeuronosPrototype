import { useState, useEffect, useCallback } from "react";
import type { Consignee } from "../types/bd";
import { apiFetch } from "../utils/api";

export function useConsignees(customerId?: string) {
  const [consignees, setConsignees] = useState<Consignee[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConsignees = useCallback(async () => {
    if (!customerId) {
      setConsignees([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await apiFetch(`/consignees?customer_id=${encodeURIComponent(customerId)}`);

      // Gracefully handle non-200 (e.g. 404/403 from un-deployed edge function)
      if (!res.ok) {
        console.warn(`Consignees fetch returned ${res.status} — edge function may not be deployed yet`);
        setConsignees([]);
        setIsLoading(false);
        return;
      }

      const json = await safeJson(res);

      if (json.success) {
        setConsignees(json.data || []);
      } else {
        setError(json.error || "Failed to fetch consignees");
      }
    } catch (err) {
      console.warn("Consignees fetch failed (edge function may be unavailable):", err);
      setConsignees([]);
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchConsignees();
  }, [fetchConsignees]);

  const createConsignee = useCallback(
    async (data: Partial<Consignee>) => {
      if (!customerId) throw new Error("No customer_id");

      const res = await apiFetch(`/consignees`, {
        method: "POST",
        body: JSON.stringify({ ...data, customer_id: customerId }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`Create consignee failed (${res.status}):`, text.slice(0, 200));
        throw new Error(`Server returned ${res.status} — edge function may not be deployed`);
      }

      const json = await safeJson(res);

      if (!json.success) throw new Error(json.error);

      // Refresh list
      await fetchConsignees();
      return json.data as Consignee;
    },
    [customerId, fetchConsignees]
  );

  const updateConsignee = useCallback(
    async (id: string, data: Partial<Consignee>) => {
      const res = await apiFetch(`/consignees/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`Update consignee failed (${res.status}):`, text.slice(0, 200));
        throw new Error(`Server returned ${res.status} — edge function may not be deployed`);
      }

      const json = await safeJson(res);

      if (!json.success) throw new Error(json.error);

      await fetchConsignees();
      return json.data as Consignee;
    },
    [fetchConsignees]
  );

  const deleteConsignee = useCallback(
    async (id: string) => {
      const res = await apiFetch(`/consignees/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`Delete consignee failed (${res.status}):`, text.slice(0, 200));
        throw new Error(`Server returned ${res.status} — edge function may not be deployed`);
      }

      const json = await safeJson(res);

      if (!json.success) throw new Error(json.error);

      await fetchConsignees();
    },
    [fetchConsignees]
  );

  return {
    consignees,
    isLoading,
    error,
    fetchConsignees,
    createConsignee,
    updateConsignee,
    deleteConsignee,
  };
}