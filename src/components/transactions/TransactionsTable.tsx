import { useState } from "react";
import { ChevronDown, ChevronRight, Check, Search, AlertCircle, FileText } from "lucide-react";
import { formatCurrency } from "../../utils/accounting-math";
import type { UI_Transaction, ReviewStatus } from "./types";
export type { UI_Transaction, ReviewStatus };
import { CustomDropdown } from "../bd/CustomDropdown";

interface TransactionsTableProps {
  transactions: UI_Transaction[];
  isLoading?: boolean;
  onAction: (transaction: UI_Transaction, action: 'add' | 'match' | 'exclude') => void;
  // Options for dropdowns
  categories?: { value: string; label: string }[];
  payees?: { value: string; label: string }[];
}

interface TransactionRowProps {
  txn: UI_Transaction;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onAction: (transaction: UI_Transaction, action: 'add' | 'match' | 'exclude') => void;
  categories: { value: string; label: string }[];
  payees: { value: string; label: string }[];
}

function TransactionRow({
  txn,
  isExpanded,
  isSelected,
  onToggleExpand,
  onToggleSelect,
  onAction,
  categories,
  payees
}: TransactionRowProps) {
  const isMoneyOut = txn.amount < 0;
  const absAmount = Math.abs(txn.amount);
  
  // Local state for edits
  const [category, setCategory] = useState(txn.category_account_id || "");
  const [payee, setPayee] = useState(txn.payee || "");
  const [description, setDescription] = useState(txn.description || "");

  // Helper to trigger action with updated data
  const handleAction = (action: 'add' | 'match' | 'exclude') => {
    onAction({
        ...txn,
        category_account_id: category,
        payee: payee,
        description: description
    }, action);
  };

  return (
    <>
      {/* Main Row */}
      <tr 
        onClick={() => onToggleExpand(txn.id)}
        className={`
          group cursor-pointer transition-colors hover:bg-[var(--theme-bg-surface-subtle)]
          ${isExpanded ? "bg-[var(--theme-bg-surface-subtle)] border-l-4 border-l-[var(--theme-action-primary-bg)]" : "border-l-4 border-l-transparent"}
          ${isSelected ? "bg-[var(--theme-bg-surface-tint)]" : ""}
        `}
      >
        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
          <input 
            type="checkbox" 
            checked={isSelected}
            onChange={() => onToggleSelect(txn.id)}
            className="rounded border-[var(--theme-border-default)] text-[var(--theme-action-primary-bg)] focus:ring-[var(--theme-action-primary-bg)]"
          />
        </td>
        <td className="py-3 px-4 text-sm text-[var(--theme-text-secondary)]">
          {new Date(txn.date).toLocaleDateString()}
        </td>
        <td className="py-3 px-4 text-sm font-medium text-[var(--theme-text-primary)]">
          <div className="flex flex-col">
              <span>{txn.description}</span>
              {txn.reference && (
                  <span className="text-[10px] text-[var(--theme-text-muted)] font-mono">Ref: {txn.reference}</span>
              )}
          </div>
        </td>
        <td className="py-3 px-4 text-sm text-[var(--theme-text-secondary)]">
          {txn.payee || <span className="text-[var(--theme-text-muted)] italic">- Select -</span>}
        </td>
        <td className="py-3 px-4 text-sm">
          {txn.category_account_id ? (
                <span className="px-2 py-1 rounded bg-[var(--theme-status-success-bg)] text-[var(--theme-status-success-fg)] text-xs border border-[var(--theme-status-success-border)]">
                    Match Found
                </span>
          ) : (
              <span className="px-2 py-1 rounded bg-[var(--theme-bg-surface-subtle)] text-[var(--theme-text-muted)] text-xs border border-[var(--theme-border-default)]">
                  Uncategorized
              </span>
          )}
        </td>
        <td className="py-3 px-4 text-sm text-right font-medium text-[var(--theme-text-primary)]">
          {isMoneyOut ? formatCurrency(absAmount, txn.currency) : ""}
        </td>
        <td className="py-3 px-4 text-sm text-right font-medium text-[var(--theme-text-primary)]">
          {!isMoneyOut ? formatCurrency(absAmount, txn.currency) : ""}
        </td>
        <td className="py-3 px-4 text-right">
          <button 
              onClick={(e) => {
                  e.stopPropagation();
                  handleAction('add');
              }}
              className="px-3 py-1.5 bg-[var(--theme-action-primary-bg)] text-white text-xs font-medium rounded hover:bg-[var(--theme-action-primary-border)] transition-colors shadow-sm"
          >
              Add
          </button>
        </td>
      </tr>

      {/* Expanded Detail Row */}
      {isExpanded && (
        <tr className="bg-[var(--theme-bg-surface-subtle)] shadow-inner">
          <td colSpan={8} className="p-4 pl-14">
              <div className="bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-lg p-6 shadow-sm">
                <div className="flex gap-6 mb-6">
                    {/* Left: Input Form */}
                    <div className="flex-1 grid grid-cols-2 gap-4">
                      <div>
                          <label className="block text-xs font-medium text-[var(--theme-text-muted)] mb-1">From/To</label>
                          <input 
                              type="text" 
                              className="w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[var(--theme-action-primary-bg)]"
                              placeholder="Enter Name"
                              value={payee}
                              onChange={(e) => setPayee(e.target.value)}
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-medium text-[var(--theme-text-muted)] mb-1">Category</label>
                          <CustomDropdown 
                              value={category}
                              onChange={(val) => setCategory(val)}
                              options={categories}
                              placeholder="Select Category"
                              fullWidth
                          />
                      </div>
                      <div className="col-span-2">
                          <label className="block text-xs font-medium text-[var(--theme-text-muted)] mb-1">Memo</label>
                          <input 
                              type="text" 
                              className="w-full px-3 py-2 border border-[var(--theme-border-default)] rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[var(--theme-action-primary-bg)]"
                              placeholder="Add a memo..."
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                          />
                      </div>
                    </div>

                    {/* Right: Radio selection (Add / Find Match / Transfer) */}
                    <div className="w-64 border-l border-[var(--theme-border-subtle)] pl-6 space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name={`action-${txn.id}`} defaultChecked className="text-[var(--theme-action-primary-bg)] focus:ring-[var(--theme-action-primary-bg)]" />
                          <span className="text-sm font-medium text-[var(--theme-text-secondary)]">Add</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name={`action-${txn.id}`} className="text-[var(--theme-action-primary-bg)] focus:ring-[var(--theme-action-primary-bg)]" />
                          <span className="text-sm font-medium text-[var(--theme-text-secondary)]">Find match</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name={`action-${txn.id}`} className="text-[var(--theme-action-primary-bg)] focus:ring-[var(--theme-action-primary-bg)]" />
                          <span className="text-sm font-medium text-[var(--theme-text-secondary)]">Transfer</span>
                      </label>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-[var(--theme-border-subtle)]">
                    <div className="flex gap-2">
                      <button className="px-3 py-2 text-sm text-[var(--theme-action-primary-bg)] bg-[var(--theme-action-primary-bg)]/5 rounded hover:bg-[var(--theme-action-primary-bg)]/10 transition-colors">
                          Split
                      </button>
                      <button className="px-3 py-2 text-sm text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] transition-colors">
                          Exclude
                      </button>
                    </div>
                    <div className="flex gap-3">
                      <button 
                          onClick={() => onToggleExpand(txn.id)}
                          className="px-4 py-2 text-sm text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] border border-[var(--theme-border-default)] rounded hover:bg-[var(--theme-bg-surface-subtle)]"
                      >
                          Cancel
                      </button>
                      <button 
                          onClick={() => handleAction('add')}
                          className="px-4 py-2 text-sm text-white bg-[var(--theme-action-primary-bg)] rounded hover:bg-[var(--theme-action-primary-border)] shadow-sm font-medium"
                      >
                          Add
                      </button>
                    </div>
                </div>
              </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function TransactionsTable({ 
  transactions, 
  isLoading, 
  onAction,
  categories = [],
  payees = []
}: TransactionsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map(t => t.id)));
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--theme-action-primary-bg)] border-t-transparent rounded-full mx-auto mb-2" />
        <p className="text-sm text-[var(--theme-text-muted)]">Loading transactions...</p>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="p-12 text-center border-t border-[var(--theme-border-default)]">
        <div className="w-16 h-16 bg-[var(--theme-bg-surface-subtle)] rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={24} className="text-green-500" />
        </div>
        <h3 className="text-lg font-medium text-[var(--theme-text-primary)] mb-1">All caught up!</h3>
        <p className="text-[var(--theme-text-muted)] text-sm">No transactions to review.</p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--theme-bg-surface)] min-h-[500px]">
      <table className="w-full border-collapse">
        <thead className="bg-[var(--theme-bg-surface)] border-y border-[var(--theme-border-default)] sticky top-0 z-10">
          <tr>
            <th className="w-10 py-3 px-4">
              <input 
                type="checkbox" 
                checked={selectedIds.size === transactions.length && transactions.length > 0}
                onChange={toggleSelectAll}
                className="rounded border-[var(--theme-border-default)] text-[var(--theme-action-primary-bg)] focus:ring-[var(--theme-action-primary-bg)]"
              />
            </th>
            <th className="py-3 px-4 text-xs font-semibold text-[var(--theme-text-muted)] uppercase text-left w-24">Date</th>
            <th className="py-3 px-4 text-xs font-semibold text-[var(--theme-text-muted)] uppercase text-left">Description</th>
            <th className="py-3 px-4 text-xs font-semibold text-[var(--theme-text-muted)] uppercase text-left w-48">From/To</th>
            <th className="py-3 px-4 text-xs font-semibold text-[var(--theme-text-muted)] uppercase text-left w-48">Category</th>
            <th className="py-3 px-4 text-xs font-semibold text-[var(--theme-text-muted)] uppercase text-right w-32">Spent</th>
            <th className="py-3 px-4 text-xs font-semibold text-[var(--theme-text-muted)] uppercase text-right w-32">Received</th>
            <th className="py-3 px-4 text-xs font-semibold text-[var(--theme-text-muted)] uppercase text-right w-24">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {transactions.map((txn) => (
            <TransactionRow 
              key={txn.id}
              txn={txn}
              isExpanded={expandedId === txn.id}
              isSelected={selectedIds.has(txn.id)}
              onToggleExpand={toggleExpand}
              onToggleSelect={toggleSelect}
              onAction={onAction}
              categories={categories}
              payees={payees}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
