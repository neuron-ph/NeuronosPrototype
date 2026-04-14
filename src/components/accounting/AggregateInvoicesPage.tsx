// AggregateInvoicesPage — Renders UnifiedInvoicesTab with ALL invoices (system-wide)
// Constructs a FinancialData object and minimal Project for the Unified component

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UnifiedInvoicesTab } from "../shared/invoices/UnifiedInvoicesTab";
import type { FinancialData } from "../../hooks/useProjectFinancials";
import { calculateFinancialTotals } from "../../utils/financialCalculations";
import { isInvoiceVisibleDocument } from "../../utils/invoiceReversal";
import { supabase } from "../../utils/supabase/client";

export function AggregateInvoicesPage() {
  const queryClient = useQueryClient();

  const { data: rawInvoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ["invoices", "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from('invoices').select('*');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: billingItems = [], isLoading: billingLoading } = useQuery({
    queryKey: ["billing_line_items", "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from('billing_line_items').select('*');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: collections = [], isLoading: collectionsLoading } = useQuery({
    queryKey: ["collections", "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from('collections').select('*');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const isLoading = invoicesLoading || billingLoading || collectionsLoading;
  const invoices = rawInvoices.filter((invoice: any) => isInvoiceVisibleDocument(invoice));

  const fetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ["invoices", "list"] });
    queryClient.invalidateQueries({ queryKey: ["billing_line_items", "list"] });
    queryClient.invalidateQueries({ queryKey: ["collections", "list"] });
  };

  // Construct FinancialData for UnifiedInvoicesTab
  const financials: FinancialData = {
    invoices,
    billingItems,
    collections,
    expenses: [],
    isLoading,
    refresh: fetchAll,
    totals: calculateFinancialTotals(invoices, billingItems, [], collections),
  };

  // Minimal dummy project — UnifiedInvoicesTab uses project.quotation (for billing merge),
  // project.id, and project.customer_name (for panel header text).
  // In aggregate readOnly mode, the create panel is hidden so customer_name is unused.
  const dummyProject: any = {
    id: "",
    customer_name: "All Customers",
    quotation: undefined,
  };

  return (
    <div className="flex flex-col h-full bg-[var(--theme-bg-surface)]">
      <UnifiedInvoicesTab
        financials={financials}
        project={dummyProject}
        readOnly={true}
        title="All Invoices"
        subtitle="System-wide view of all invoices across projects and contracts."
      />
    </div>
  );
}
