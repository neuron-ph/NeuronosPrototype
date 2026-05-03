import React, { useState, useEffect, useMemo } from 'react';
import { toast } from "sonner@2.0.3";
import { ArrowLeft, Search, Download, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { Account } from '../../../types/accounting-core';
import { supabase } from '../../../utils/supabase/client';
import { DataTable, ColumnDef } from '../../common/DataTable';

interface AccountLedgerProps {
  account: Account;
  onBack: () => void;
}

interface JournalLineRaw {
  account_id: string;
  debit?: number;
  credit?: number;
  description?: string;
  foreign_debit?: number;
  foreign_credit?: number;
  currency?: string;
}

interface JournalEntryRaw {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string | null;
  reference: string | null;
  status: string;
  evoucher_id: string | null;
  invoice_id: string | null;
  collection_id: string | null;
  booking_id: string | null;
  lines: JournalLineRaw[] | null;
}

type LedgerRow = {
  id: string;
  date: string;
  entry_number: string;
  source_type: string;
  description: string;
  reference: string | null;
  debit: number | null;
  credit: number | null;
  running_balance: number;
  // For USD accounts only: parallel PHP-base running balance for cross-currency context.
  running_balance_base?: number;
};

function sourceTypeOf(e: JournalEntryRaw): string {
  if (e.evoucher_id) return "E-Voucher";
  if (e.invoice_id) return "Invoice";
  if (e.collection_id) return "Collection";
  return "Journal";
}

export function AccountLedger({ account, onBack }: AccountLedgerProps) {
  const [transactions, setTransactions] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        // Fetch posted journal entries that touch this account.
        // jsonb `cs` (contains) lets Postgres filter at the DB.
        const { data, error } = await supabase
          .from('journal_entries')
          .select('id, entry_number, entry_date, description, reference, status, evoucher_id, invoice_id, collection_id, booking_id, lines')
          .eq('status', 'posted')
          .filter('lines', 'cs', JSON.stringify([{ account_id: account.id }]))
          .order('entry_date', { ascending: true });

        if (error) throw error;
        if (cancelled) return;

        const useForeign = account.currency === "USD";
        const isDebitNormal = ['Asset', 'Expense'].includes(account.type);

        let balance = account.starting_amount ?? 0;
        let baseBalance = 0; // PHP-base parallel ledger for USD accounts
        const rows: LedgerRow[] = [];

        for (const entry of (data ?? []) as JournalEntryRaw[]) {
          const lines = (entry.lines ?? []).filter(l => l.account_id === account.id);
          for (const line of lines) {
            const debit = useForeign
              ? (line.foreign_debit ?? line.debit ?? 0)
              : (line.debit ?? 0);
            const credit = useForeign
              ? (line.foreign_credit ?? line.credit ?? 0)
              : (line.credit ?? 0);

            const impact = isDebitNormal ? (debit - credit) : (credit - debit);
            balance += impact;

            // For USD accounts also track PHP-base running balance using the
            // line's locked posting amount.
            let baseRow: number | undefined;
            if (useForeign) {
              const baseDebit = Number(line.debit ?? 0);
              const baseCredit = Number(line.credit ?? 0);
              const baseImpact = isDebitNormal ? (baseDebit - baseCredit) : (baseCredit - baseDebit);
              baseBalance += baseImpact;
              baseRow = baseBalance;
            }

            rows.push({
              id: `${entry.id}:${rows.length}`,
              date: entry.entry_date,
              entry_number: entry.entry_number,
              source_type: sourceTypeOf(entry),
              description: line.description || entry.description || entry.entry_number,
              reference: entry.reference,
              debit: debit > 0 ? debit : null,
              credit: credit > 0 ? credit : null,
              running_balance: balance,
              running_balance_base: baseRow,
            });
          }
        }

        setTransactions(rows.reverse());
      } catch (error) {
        console.error("Failed to load ledger:", error);
        if (!cancelled) toast.error("Failed to load ledger transactions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [account]);

  const filteredData = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return transactions;
    return transactions.filter(t =>
      t.description.toLowerCase().includes(q) ||
      t.entry_number.toLowerCase().includes(q) ||
      (t.reference && t.reference.toLowerCase().includes(q))
    );
  }, [transactions, searchQuery]);

  const formatCurrency = (val: number | null) => {
    if (val === null) return "-";
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: account.currency || 'PHP',
      minimumFractionDigits: 2
    }).format(val);
  };

  const columns: ColumnDef<LedgerRow>[] = [
    {
      header: "Date",
      accessorKey: "date",
      cell: (item) => <span className="text-[var(--theme-text-secondary)]">{format(new Date(item.date), 'MMM dd, yyyy')}</span>
    },
    {
      header: "Type",
      accessorKey: "source_type",
      cell: (item) => (
        <span className="capitalize px-2 py-1 bg-[var(--theme-bg-surface-subtle)] rounded text-xs text-[var(--theme-text-secondary)] font-medium">
          {item.source_type}
        </span>
      )
    },
    {
      header: "Description / Payee",
      accessorKey: "description",
      cell: (item) => (
         <div className="flex flex-col">
            <span className="font-medium text-[var(--theme-text-primary)]">{item.description}</span>
            <span className="text-xs text-[var(--theme-text-muted)]">
              {item.entry_number}{item.reference ? ` • Ref: ${item.reference}` : ''}
            </span>
         </div>
      )
    },
    {
      header: "Debit",
      align: "right",
      cell: (item) => (
        <span className={`font-mono ${item.debit ? 'text-[var(--theme-text-primary)]' : 'text-[var(--theme-text-muted)]'}`}>
          {formatCurrency(item.debit)}
        </span>
      )
    },
    {
      header: "Credit",
      align: "right",
      cell: (item) => (
        <span className={`font-mono ${item.credit ? 'text-[var(--theme-text-primary)]' : 'text-[var(--theme-text-muted)]'}`}>
          {formatCurrency(item.credit)}
        </span>
      )
    },
    {
      header: "Balance",
      align: "right",
      cell: (item) => (
        <span className="font-mono font-medium text-[var(--theme-text-primary)]">
          {formatCurrency(item.running_balance)}
        </span>
      )
    }
  ];

  return (
    <div className="flex flex-col h-full bg-[var(--theme-bg-surface)]">
      {/* Header */}
      <div className="px-8 py-6 border-b border-[var(--theme-border-default)]">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-[var(--theme-bg-surface-subtle)] rounded-full transition-colors text-[var(--theme-text-muted)]"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[var(--theme-text-primary)] tracking-tight flex items-center gap-3">
              {account.name}
              <span className={`text-sm font-normal px-2.5 py-0.5 rounded-full 
                ${['Asset', 'Expense'].includes(account.type) ? 'bg-emerald-50 text-emerald-700' : 'bg-[var(--theme-status-warning-bg)] text-[var(--theme-status-warning-fg)]'}`}>
                {account.type}
              </span>
            </h1>
            <p className="text-[var(--theme-text-muted)] text-sm mt-1 font-mono">
              Code: {account.code || "N/A"} • Currency: {account.currency}
            </p>
          </div>
          <div className="ml-auto flex items-end flex-col">
             <span className="text-sm text-[var(--theme-text-muted)]">Current Balance</span>
             <span className="text-3xl font-bold text-[var(--theme-text-primary)] tracking-tight font-mono">
                {formatCurrency(account.balance)}
             </span>
             {account.currency === "USD" && transactions.length > 0 && transactions[0].running_balance_base != null && (
               <span className="text-xs text-[var(--theme-text-muted)] font-mono mt-1">
                 ≈ {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(transactions[0].running_balance_base ?? 0)}
               </span>
             )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4">
           <div className="flex items-center gap-2 flex-1">
              <div className="relative w-full max-w-sm">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--theme-text-muted)]" />
                 <input
                   type="text"
                   placeholder="Search transactions..."
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   className="w-full pl-10 pr-4 py-2 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-action-primary-bg)]/20 focus:border-[var(--theme-action-primary-bg)] transition-all placeholder:text-[var(--theme-text-muted)]"
                 />
              </div>
           </div>
           <div className="flex gap-2">
              <button className="h-9 px-3 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] text-[var(--theme-text-secondary)] rounded-lg font-medium text-sm hover:bg-[var(--theme-bg-surface-subtle)] transition-colors flex items-center gap-2">
                 <Filter size={16} />
                 Filter
              </button>
              <button className="h-9 px-3 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] text-[var(--theme-text-secondary)] rounded-lg font-medium text-sm hover:bg-[var(--theme-bg-surface-subtle)] transition-colors flex items-center gap-2">
                 <Download size={16} />
                 Export
              </button>
           </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="flex-1 overflow-auto p-6">
        <DataTable
          data={filteredData}
          columns={columns}
          isLoading={loading}
          emptyMessage="There are no transactions matching the selected criteria"
          renderTableOnEmpty={true}
          rowClassName={() => "hover:bg-[var(--theme-bg-surface-subtle)]"}
        />
      </div>
    </div>
  );
}