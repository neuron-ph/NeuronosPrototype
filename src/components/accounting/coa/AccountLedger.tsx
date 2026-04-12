import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from "sonner@2.0.3";
import { ArrowLeft, ArrowUpRight, ArrowDownLeft, FileText, Search, Download, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { Account } from '../../../types/accounting-core';
import { Transaction } from '../../../types/accounting';
import { getTransactions } from '../../../utils/accounting-api';
import { DataTable, ColumnDef } from '../../common/DataTable';

interface AccountLedgerProps {
  account: Account;
  onBack: () => void;
}

type LedgerRow = Transaction & {
  debit: number | null;
  credit: number | null;
  running_balance: number;
};

export function AccountLedger({ account, onBack }: AccountLedgerProps) {
  const [transactions, setTransactions] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        const allTxns = await getTransactions();
        if (cancelled) return;

        const accountTxns = allTxns.filter(t =>
          t.bank_account_id === account.id || t.category_account_id === account.id
        );

        const sorted = accountTxns.sort((a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        let balance = 0;
        const rows: LedgerRow[] = sorted.map(txn => {
          const isDebit = txn.category_account_id === account.id;
          const isCredit = txn.bank_account_id === account.id;

          let impact = 0;
          if (['Asset', 'Expense'].includes(account.type)) {
            if (isDebit) impact = txn.amount;
            if (isCredit) impact = -txn.amount;
          } else {
            if (isDebit) impact = -txn.amount;
            if (isCredit) impact = txn.amount;
          }

          balance += impact;

          return {
            ...txn,
            debit: isDebit ? txn.amount : null,
            credit: isCredit ? txn.amount : null,
            running_balance: balance,
          };
        });

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
    return transactions.filter(t => 
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.reference && t.reference.toLowerCase().includes(searchQuery.toLowerCase()))
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
      accessorKey: "status", // Using status as proxy for type, or maybe we need a type field
      cell: (item) => (
        <span className="capitalize px-2 py-1 bg-[var(--theme-bg-surface-subtle)] rounded text-xs text-[var(--theme-text-secondary)] font-medium">
          Transaction
        </span>
      )
    },
    {
      header: "Description / Payee",
      accessorKey: "description",
      cell: (item) => (
         <div className="flex flex-col">
            <span className="font-medium text-[var(--theme-text-primary)]">{item.description}</span>
            {item.reference && <span className="text-xs text-[var(--theme-text-muted)]">Ref: {item.reference}</span>}
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