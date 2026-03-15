// useReportsData — Shared data hook for the Reports module.
// Fetches all 5 raw data streams in parallel (projects, billing items, invoices,
// collections, expenses) and returns them as raw arrays. Each report component
// filters and computes what it needs from these streams.
//
// Pattern cloned from useFinancialHealthReport but returns raw arrays instead of
// pre-computed project rows.

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../utils/api";

export interface ReportsData {
  projects: any[];
  billingItems: any[];
  invoices: any[];
  collections: any[];
  expenses: any[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useReportsData(): ReportsData {
  const [projects, setProjects] = useState<any[]>([]);
  const [billingItems, setBillingItems] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [projRes, billRes, expRes, invRes, colRes] = await Promise.all([
        apiFetch(`/projects`),
        apiFetch(`/accounting/billing-items`),
        apiFetch(`/accounting/expenses`),
        apiFetch(`/accounting/invoices`),
        apiFetch(`/accounting/collections`),
      ]);

      // Parse each response, extracting the data array
      const parse = async (res: Response, label: string): Promise<any[]> => {
        if (!res.ok) {
          console.error(`Reports: Failed to fetch ${label} — ${res.status}`);
          return [];
        }
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) return json.data;
        if (Array.isArray(json)) return json;
        if (Array.isArray(json.data)) return json.data;
        return [];
      };

      const [p, b, e, i, c] = await Promise.all([
        parse(projRes, "projects"),
        parse(billRes, "billing-items"),
        parse(expRes, "expenses"),
        parse(invRes, "invoices"),
        parse(colRes, "collections"),
      ]);

      setProjects(p);
      setBillingItems(b);
      setExpenses(e);
      setInvoices(i);
      setCollections(c);
    } catch (err: any) {
      console.error("Reports: Error fetching data:", err);
      setError(err?.message || "Failed to load report data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    projects,
    billingItems,
    invoices,
    collections,
    expenses,
    isLoading,
    error,
    refresh: fetchAll,
  };
}
