import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../utils/api";
import { toast } from "../components/ui/toast-utils";
import type { EVoucher, EVoucherStatus, EVoucherTransactionType, EVoucherSourceModule } from "../types/evoucher";
import { useCachedFetch, useInvalidateCache } from "./useNeuronCache";

type EVoucherView = "pending" | "my-evouchers" | "all";

export function useEVouchers(view: EVoucherView, userId?: string) {
  const invalidateCache = useInvalidateCache();

  const refresh = useCallback(() => {
    invalidateCache("evouchers");
  }, [invalidateCache]);

  // Build cache key based on view + userId so different views cache independently
  const cacheKey = view === "my-evouchers" && userId 
    ? `evouchers-${view}-${userId}`
    : `evouchers-${view}`;

  const fetcher = useCallback(async (): Promise<EVoucher[]> => {
    let path = `/evouchers`;
    
    if (view === "pending") {
      path = `/evouchers/pending`;
    } else if (view === "my-evouchers" && userId) {
      path = `/evouchers/my-evouchers?requestor_id=${userId}`;
    } else if (view === "my-evouchers" && !userId) {
      return [];
    }

    const response = await apiFetch(path);

    if (!response.ok) throw new Error(`Failed to fetch ${view} e-vouchers`);

    const result = await response.json();
    
    let data: EVoucher[] = [];
    if (result.success && Array.isArray(result.data)) {
      data = result.data;
    } else if (Array.isArray(result.data)) {
      data = result.data;
    } else if (Array.isArray(result)) {
      data = result;
    }

    // NEURON-DRY-2411: E-Vouchers Module is now strictly "Money Out".
    return data.filter(item => 
      item.transaction_type !== "collection" && 
      item.transaction_type !== "billing"
    );
  }, [view, userId]);

  const { data: evouchers, isLoading } = useCachedFetch<EVoucher[]>(
    cacheKey,
    fetcher,
    [],
    { deps: [view, userId] }
  );

  return {
    evouchers,
    isLoading,
    refresh
  };
}