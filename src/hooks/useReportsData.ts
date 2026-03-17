// useReportsData — Shared data hook for the Reports module.
// Fetches all 5 raw data streams in parallel (projects, billing items, invoices,
// collections, expenses) and returns them as raw arrays. Each report component
// filters and computes what it needs from these streams.
//
// Pattern cloned from useFinancialHealthReport but returns raw arrays instead of
// pre-computed project rows.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../utils/supabase/client";

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

      const [
        { data: p, error: e1 },
        { data: b, error: e2 },
        { data: e, error: e3 },
        { data: i, error: e4 },
        { data: c, error: e5 },
      ] = await Promise.all([
        supabase.from("projects").select("*, customers(id, name)"),
        supabase.from("billing_line_items").select("*"),
        supabase.from("expenses").select("*"),
        supabase.from("invoices").select("*"),
        supabase.from("collections").select("*"),
      ]);

      setProjects(p || []);
      setBillingItems(b || []);
      setExpenses(e || []);
      setInvoices(i || []);
      setCollections(c || []);
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