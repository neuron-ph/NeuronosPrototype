// AggregateInvoicesPage — Renders UnifiedInvoicesTab with ALL invoices (system-wide)
// Constructs a FinancialData object and minimal Project for the Unified component

import { useState, useEffect, useCallback } from "react";
import { UnifiedInvoicesTab } from "../shared/invoices/UnifiedInvoicesTab";
import type { FinancialData } from "../../hooks/useProjectFinancials";
import { calculateFinancialTotals } from "../../utils/financialCalculations";
import { isInvoiceVisibleDocument } from "../../utils/invoiceReversal";
import { supabase } from "../../utils/supabase/client";

export function AggregateInvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [billingItems, setBillingItems] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      setIsLoading(true);
      const [
        { data: invoiceRows, error: invoiceErr },
        { data: billingRows, error: billingErr },
        { data: collectionRows, error: collectionErr },
      ] = await Promise.all([
        supabase.from('invoices').select('*'),
        supabase.from('billing_line_items').select('*'),
        supabase.from('collections').select('*'),
      ]);

      if (!invoiceErr && invoiceRows) {
        setInvoices(invoiceRows.filter((invoice: any) => isInvoiceVisibleDocument(invoice)));
      }

      if (!billingErr && billingRows) {
        setBillingItems(billingRows);
      }

      if (!collectionErr && collectionRows) {
        setCollections(collectionRows);
      }
    } catch (error) {
      console.error("Error fetching aggregate invoices data:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

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
    <div className="flex flex-col h-full bg-white p-12">
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
