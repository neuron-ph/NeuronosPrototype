import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabase/client";
import { isCollectionAppliedToInvoice } from "../utils/collectionResolution";

export interface ProjectFinancialRow {
  projectNumber: string;
  projectDate: string;
  customerName: string;
  invoiceNumbers: string[];
  billingTotal: number;
  expensesTotal: number;
  adminCost: number;
  totalExpenses: number;
  collectedAmount: number;
  grossProfit: number;
}

export interface FinancialHealthSummary {
  totalBillings: number;
  totalExpenses: number;
  totalCollected: number;
  totalGrossProfit: number;
  projectCount: number;
}

interface InvoiceShare {
  amountByKey: Map<string, number>;
  totalAmount: number;
  fromLineItems: boolean;
  invoiceNumber: string;
  customerName: string;
  date: string;
}

interface FinancialAccumulator {
  projectNumber: string;
  projectDate: string;
  customerName: string;
  invoiceNumbers: Set<string>;
  billingTotal: number;
  expensesTotal: number;
  collectedAmount: number;
  latestActivityMs: number;
}

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => normalizeString(entry))
    .filter((entry): entry is string => Boolean(entry));
};

const getProjectRefs = (row: any): string[] => {
  return [
    ...new Set(
      [
        normalizeString(row.project_number),
        normalizeString(row.projectNumber),
        ...normalizeStringArray(row.project_refs),
        ...normalizeStringArray(row.project_numbers),
      ].filter((entry): entry is string => Boolean(entry)),
    ),
  ];
};

const getContractRefs = (row: any): string[] => {
  return [
    ...new Set(
      [
        normalizeString(row.contract_number),
        normalizeString(row.contractNumber),
        normalizeString(row.quotation_number),
        normalizeString(row.quote_number),
        ...normalizeStringArray(row.contract_refs),
        ...normalizeStringArray(row.contract_ids),
      ].filter((entry): entry is string => Boolean(entry)),
    ),
  ];
};

const getDisplayKeys = (row: any): string[] => {
  const projectRefs = getProjectRefs(row);
  if (projectRefs.length > 0) return projectRefs;

  const contractRefs = getContractRefs(row);
  if (contractRefs.length > 0) {
    return contractRefs.map((ref) => `Contract: ${ref}`);
  }

  return ["Unlinked"];
};

const getRecordDate = (row: any): string => {
  return (
    normalizeString(row.invoice_date) ||
    normalizeString(row.collection_date) ||
    normalizeString(row.expense_date) ||
    normalizeString(row.request_date) ||
    normalizeString(row.created_at) ||
    ""
  );
};

const isExpenseEvoucher = (row: any): boolean => {
  const type = (row.transaction_type || "").toLowerCase();
  const status = (row.status || "").toLowerCase();

  return (
    ["expense", "budget_request"].includes(type) &&
    ["approved", "posted", "paid", "partial"].includes(status)
  );
};

const isInMonth = (dateValue: string, monthFilter?: string): boolean => {
  if (!monthFilter) return true;
  if (!dateValue) return false;

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;

  const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return yearMonth === monthFilter;
};

const buildInvoiceShares = (
  invoices: any[],
  billingItems: any[],
): Map<string, InvoiceShare> => {
  const invoiceByNumber = new Map<string, any>();
  invoices.forEach((invoice) => {
    const invoiceNumber = normalizeString(invoice.invoice_number);
    if (invoiceNumber) {
      invoiceByNumber.set(invoiceNumber, invoice);
    }
  });

  const shareMap = new Map<string, InvoiceShare>();

  billingItems.forEach((item) => {
    const invoiceId =
      normalizeString(item.invoice_id) ||
      normalizeString(invoiceByNumber.get(normalizeString(item.invoice_number) || "")?.id);
    if (!invoiceId) return;

    const amount = Number(item.amount) || 0;
    if (amount <= 0) return;

    const displayKeys = getDisplayKeys(item);
    const invoice = invoices.find((candidate) => candidate.id === invoiceId);
    const existing = shareMap.get(invoiceId) || {
      amountByKey: new Map<string, number>(),
      totalAmount: 0,
      fromLineItems: true,
      invoiceNumber: normalizeString(invoice?.invoice_number) || normalizeString(item.invoice_number) || invoiceId,
      customerName: normalizeString(invoice?.customer_name) || normalizeString(item.customer_name) || "—",
      date: getRecordDate(invoice || item),
    };

    const sharePerKey = amount / displayKeys.length;
    displayKeys.forEach((key) => {
      existing.amountByKey.set(key, (existing.amountByKey.get(key) || 0) + sharePerKey);
    });
    existing.totalAmount += amount;

    shareMap.set(invoiceId, existing);
  });

  invoices.forEach((invoice) => {
    if (shareMap.has(invoice.id)) return;

    const totalAmount = Number(invoice.total_amount) || Number(invoice.amount) || 0;
    const displayKeys = getDisplayKeys(invoice);
    const sharePerKey = displayKeys.length > 0 ? totalAmount / displayKeys.length : totalAmount;
    const amountByKey = new Map<string, number>();

    displayKeys.forEach((key) => {
      amountByKey.set(key, sharePerKey);
    });

    shareMap.set(invoice.id, {
      amountByKey,
      totalAmount,
      fromLineItems: false,
      invoiceNumber: normalizeString(invoice.invoice_number) || invoice.id,
      customerName: normalizeString(invoice.customer_name) || "—",
      date: getRecordDate(invoice),
    });
  });

  return shareMap;
};

export function useFinancialHealthReport(monthFilter?: string) {
  const [projects, setProjects] = useState<any[]>([]);
  const [billingItems, setBillingItems] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      setIsLoading(true);

      const [
        { data: projectRows },
        { data: billingRows },
        { data: evoucherRows },
        { data: invoiceRows },
        { data: collectionRows },
      ] = await Promise.all([
        supabase.from("projects").select("*"),
        supabase.from("billing_line_items").select("*"),
        supabase.from("evouchers").select("*"),
        supabase.from("invoices").select("*"),
        supabase.from("collections").select("*"),
      ]);

      setProjects(projectRows || []);
      setBillingItems(billingRows || []);
      setExpenses((evoucherRows || []).filter(isExpenseEvoucher));
      setInvoices(invoiceRows || []);
      setCollections(collectionRows || []);
    } catch (error) {
      console.error("Error fetching financial health data:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const { rows, summary } = useMemo(() => {
    const projectByNumber = new Map<string, any>();
    projects.forEach((project) => {
      const projectNumber = normalizeString(project.project_number);
      if (projectNumber) {
        projectByNumber.set(projectNumber, project);
      }
    });

    const invoiceShares = buildInvoiceShares(invoices, billingItems);
    const rowsByKey = new Map<string, FinancialAccumulator>();

    const ensureAccumulator = (key: string) => {
      const existing = rowsByKey.get(key);
      if (existing) return existing;

      const project = projectByNumber.get(key);
      const seededDate = getRecordDate(project || {});
      const seededMs = seededDate ? new Date(seededDate).getTime() : 0;

      const next: FinancialAccumulator = {
        projectNumber: key,
        projectDate: seededDate,
        customerName: normalizeString(project?.customer_name) || "—",
        invoiceNumbers: new Set<string>(),
        billingTotal: 0,
        expensesTotal: 0,
        collectedAmount: 0,
        latestActivityMs: seededMs,
      };

      rowsByKey.set(key, next);
      return next;
    };

    const touchAccumulator = (
      accumulator: FinancialAccumulator,
      {
        amountField,
        amount = 0,
        dateValue,
        customerName,
        invoiceNumber,
      }: {
        amountField?: "billingTotal" | "expensesTotal" | "collectedAmount";
        amount?: number;
        dateValue?: string;
        customerName?: string | null;
        invoiceNumber?: string | null;
      },
    ) => {
      if (amountField) {
        accumulator[amountField] += amount;
      }

      const normalizedCustomer = normalizeString(customerName);
      if (normalizedCustomer && accumulator.customerName === "—") {
        accumulator.customerName = normalizedCustomer;
      }

      if (invoiceNumber) {
        accumulator.invoiceNumbers.add(invoiceNumber);
      }

      const effectiveDate = normalizeString(dateValue);
      if (!effectiveDate) return;

      const nextMs = new Date(effectiveDate).getTime();
      if (Number.isNaN(nextMs)) return;

      if (!accumulator.projectDate || nextMs > accumulator.latestActivityMs) {
        accumulator.projectDate = effectiveDate;
        accumulator.latestActivityMs = nextMs;
      }
    };

    billingItems.forEach((item) => {
      const displayKeys = getDisplayKeys(item);
      const amount = Number(item.amount) || 0;
      const dateValue = getRecordDate(item);
      const customerName = normalizeString(item.customer_name);
      const invoiceNumber = normalizeString(item.invoice_number);

      displayKeys.forEach((key) => {
        const accumulator = ensureAccumulator(key);
        touchAccumulator(accumulator, {
          amountField: "billingTotal",
          amount: amount / displayKeys.length,
          dateValue,
          customerName,
          invoiceNumber,
        });
      });
    });

    expenses.forEach((expense) => {
      const displayKeys = getDisplayKeys(expense);
      const amount = Number(expense.total_amount) || Number(expense.amount) || 0;
      const dateValue = getRecordDate(expense);
      const customerName = normalizeString(expense.customer_name);

      displayKeys.forEach((key) => {
        const accumulator = ensureAccumulator(key);
        touchAccumulator(accumulator, {
          amountField: "expensesTotal",
          amount: amount / displayKeys.length,
          dateValue,
          customerName,
        });
      });
    });

    invoiceShares.forEach((share) => {
      share.amountByKey.forEach((amount, key) => {
        const accumulator = ensureAccumulator(key);
        touchAccumulator(accumulator, {
          dateValue: share.date,
          customerName: share.customerName,
          invoiceNumber: share.invoiceNumber,
        });

        if (!share.fromLineItems && amount > 0) {
          accumulator.billingTotal += amount;
        }
      });
    });

    collections.forEach((collection) => {
      if (!isCollectionAppliedToInvoice(collection)) {
        return;
      }

      const applications = Array.isArray(collection.linked_billings) && collection.linked_billings.length > 0
        ? collection.linked_billings
            .map((link: any) => ({
              invoiceId: normalizeString(link?.id),
              amount: Number(link?.amount) || 0,
            }))
            .filter((entry: { invoiceId: string | null; amount: number }) => entry.invoiceId && entry.amount > 0)
        : normalizeString(collection.invoice_id)
          ? [{ invoiceId: normalizeString(collection.invoice_id), amount: Number(collection.amount) || 0 }]
          : [];

      if (applications.length === 0) {
        const fallbackKeys = getDisplayKeys(collection);
        fallbackKeys.forEach((key) => {
          const accumulator = ensureAccumulator(key);
          touchAccumulator(accumulator, {
            amountField: "collectedAmount",
            amount: (Number(collection.amount) || 0) / fallbackKeys.length,
            dateValue: getRecordDate(collection),
            customerName: normalizeString(collection.customer_name),
          });
        });
        return;
      }

      applications.forEach(({ invoiceId, amount }) => {
        if (!invoiceId) return;

        const share = invoiceShares.get(invoiceId);
        if (!share || share.totalAmount <= 0) {
          const accumulator = ensureAccumulator("Unlinked");
          touchAccumulator(accumulator, {
            amountField: "collectedAmount",
            amount,
            dateValue: getRecordDate(collection),
            customerName: normalizeString(collection.customer_name),
          });
          return;
        }

        share.amountByKey.forEach((containerAmount, key) => {
          const ratio = containerAmount / share.totalAmount;
          const accumulator = ensureAccumulator(key);
          touchAccumulator(accumulator, {
            amountField: "collectedAmount",
            amount: amount * ratio,
            dateValue: getRecordDate(collection),
            customerName: normalizeString(collection.customer_name) || share.customerName,
            invoiceNumber: share.invoiceNumber,
          });
        });
      });
    });

    const computedRows = Array.from(rowsByKey.values())
      .map((row): ProjectFinancialRow => {
        const expensesTotal = row.expensesTotal;
        const adminCost = expensesTotal * 0.03;
        const totalExpenses = expensesTotal + adminCost;

        return {
          projectNumber: row.projectNumber,
          projectDate: row.projectDate,
          customerName: row.customerName,
          invoiceNumbers: Array.from(row.invoiceNumbers),
          billingTotal: row.billingTotal,
          expensesTotal,
          adminCost,
          totalExpenses,
          collectedAmount: row.collectedAmount,
          grossProfit: row.billingTotal - totalExpenses,
        };
      })
      .filter((row) => {
        if (!monthFilter) return true;
        return isInMonth(row.projectDate, monthFilter);
      })
      .sort((a, b) => {
        const left = new Date(b.projectDate).getTime() || 0;
        const right = new Date(a.projectDate).getTime() || 0;
        return left - right;
      });

    const nextSummary: FinancialHealthSummary = {
      totalBillings: computedRows.reduce((sum, row) => sum + row.billingTotal, 0),
      totalExpenses: computedRows.reduce((sum, row) => sum + row.totalExpenses, 0),
      totalCollected: computedRows.reduce((sum, row) => sum + row.collectedAmount, 0),
      totalGrossProfit: computedRows.reduce((sum, row) => sum + row.grossProfit, 0),
      projectCount: computedRows.length,
    };

    return {
      rows: computedRows,
      summary: nextSummary,
    };
  }, [projects, billingItems, expenses, invoices, collections, monthFilter]);

  return {
    rows,
    summary,
    isLoading,
    refresh: fetchAll,
  };
}
