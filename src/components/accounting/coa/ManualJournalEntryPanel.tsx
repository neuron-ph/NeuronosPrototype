import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, BookOpen, Loader2, ChevronDown } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import { useUser } from "../../../hooks/useUser";
import { logCreation } from "../../../utils/activityLog";
import { toast } from "../../ui/toast-utils";
import { SidePanel } from "../../common/SidePanel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface COAAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface LineItem {
  id: string; // client-side only key
  account_id: string;
  description: string;
  debit: string; // string so the input stays controlled without numeric quirks
  credit: string;
}

export interface ManualJournalEntryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PHP = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeLineItem(): LineItem {
  return { id: crypto.randomUUID(), account_id: "", description: "", debit: "", credit: "" };
}

function parseAmount(raw: string): number {
  const n = parseFloat(raw);
  return isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------------------
// Sub-component: account combobox (native select for consistency with GL sheet)
// ---------------------------------------------------------------------------

function AccountSelect({
  accounts,
  value,
  onChange,
}: {
  accounts: COAAccount[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{ position: "relative", flex: "1 1 0", minWidth: 0 }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          height: "34px",
          border: "1px solid #E5E9F0",
          borderRadius: "6px",
          padding: "0 28px 0 8px",
          fontSize: "13px",
          color: value ? "#12332B" : "#667085",
          backgroundColor: "#FFFFFF",
          appearance: "none",
          cursor: "pointer",
          outline: "none",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        <option value="">Select account…</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.code} — {a.name}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        style={{
          position: "absolute",
          right: "8px",
          top: "50%",
          transform: "translateY(-50%)",
          color: "#667085",
          pointerEvents: "none",
          flexShrink: 0,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ManualJournalEntryPanel({
  isOpen,
  onClose,
  onCreated,
}: ManualJournalEntryPanelProps) {
  const { user } = useUser();

  // Form state
  const [entryDate, setEntryDate] = useState<string>(today());
  const [memo, setMemo] = useState<string>("");
  const [lines, setLines] = useState<LineItem[]>([makeLineItem(), makeLineItem()]);

  // Remote data
  const [accounts, setAccounts] = useState<COAAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);

  // Reset form when panel opens
  useEffect(() => {
    if (isOpen) {
      setEntryDate(today());
      setMemo("");
      setLines([makeLineItem(), makeLineItem()]);
    }
  }, [isOpen]);

  // Load accounts when panel opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const load = async () => {
      setLoadingAccounts(true);
      const { data, error } = await supabase
        .from("accounts")
        .select("id, code, name, type")
        .eq("is_active", true)
        .order("code", { ascending: true });

      if (cancelled) return;
      if (error) {
        toast.error("Failed to load chart of accounts");
      } else {
        setAccounts((data ?? []) as COAAccount[]);
      }
      setLoadingAccounts(false);
    };

    load();
    return () => { cancelled = true; };
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // Line item mutations
  // ---------------------------------------------------------------------------

  const updateLine = useCallback(
    (id: string, patch: Partial<Omit<LineItem, "id">>) => {
      setLines((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...patch } : l))
      );
    },
    []
  );

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, makeLineItem()]);
  }, []);

  const removeLine = useCallback((id: string) => {
    setLines((prev) => {
      if (prev.length <= 2) return prev; // keep minimum of 2 rows
      return prev.filter((l) => l.id !== id);
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Derived totals
  // ---------------------------------------------------------------------------

  const totalDebits = lines.reduce((sum, l) => sum + parseAmount(l.debit), 0);
  const totalCredits = lines.reduce((sum, l) => sum + parseAmount(l.credit), 0);
  const difference = Math.abs(totalDebits - totalCredits);
  const isBalanced = totalDebits > 0 && totalCredits > 0 && difference < 0.005;

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!isBalanced) return;
    if (!user?.id) {
      toast.error("Cannot determine current user");
      return;
    }

    // Basic validation: every line must have an account selected
    const hasBlankAccounts = lines.some((l) => !l.account_id);
    if (hasBlankAccounts) {
      toast.error("All line items must have an account selected");
      return;
    }

    setSubmitting(true);
    try {
      const entryId = `JE-MAN-${Date.now()}`;
      const activeLines = lines.filter(
        (l) => parseAmount(l.debit) > 0 || parseAmount(l.credit) > 0
      );

      // Build JSONB lines — resolve account code/name from loaded accounts list
      const jsonbLines = activeLines.map((l) => {
        const acct = accounts.find((a) => a.id === l.account_id);
        return {
          account_id: l.account_id,
          account_code: acct?.code ?? "",
          account_name: acct?.name ?? "",
          debit: parseAmount(l.debit),
          credit: parseAmount(l.credit),
          description: l.description.trim() || memo.trim() || "",
        };
      });

      const { error: jeError } = await supabase
        .from("journal_entries")
        .insert({
          id: entryId,
          entry_number: entryId,
          entry_date: entryDate,
          description: memo.trim() || null,
          lines: jsonbLines,
          total_debit: totalDebits,
          total_credit: totalCredits,
          status: "posted",
          created_by: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (jeError) throw jeError;

      const actor = { id: user.id, name: user.name, department: user.department ?? "" };
      logCreation("journal_entry", entryId, memo.trim() || entryId, actor);
      toast.success("Journal entry created");
      onCreated?.();
      onClose();
    } catch (err: unknown) {
      console.error("ManualJournalEntryPanel submit error:", err);
      const msg = err instanceof Error ? err.message : "Failed to create journal entry";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const footer = (
    <div
      style={{
        padding: "16px 24px",
        borderTop: "1px solid #E5E9F0",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: "#FFFFFF",
        gap: "12px",
      }}
    >
      <button
        onClick={onClose}
        style={{
          height: "36px",
          padding: "0 16px",
          background: "none",
          border: "none",
          color: "#667085",
          fontSize: "13px",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Cancel
      </button>

      <button
        onClick={handleSubmit}
        disabled={!isBalanced || submitting}
        style={{
          height: "36px",
          padding: "0 20px",
          borderRadius: "8px",
          backgroundColor: "#0F766E",
          border: "none",
          color: "#FFFFFF",
          fontSize: "13px",
          fontWeight: 600,
          cursor: !isBalanced || submitting ? "not-allowed" : "pointer",
          opacity: !isBalanced || submitting ? 0.55 : 1,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          transition: "opacity 150ms",
        }}
      >
        {submitting && <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />}
        {submitting ? "Creating…" : "Create Entry"}
      </button>
    </div>
  );

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <BookOpen size={18} style={{ color: "#0F766E" }} />
          <span style={{ fontSize: "15px", fontWeight: 600, color: "#12332B" }}>
            New Journal Entry
          </span>
        </div>
      }
      footer={footer}
      width="760px"
    >
      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px", overflowY: "auto", height: "100%" }}>

        {/* Header fields row */}
        <div style={{ display: "flex", gap: "16px" }}>
          {/* Date */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "160px" }}>
            <label style={{ fontSize: "12px", fontWeight: 500, color: "#667085" }}>
              Entry Date
            </label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              style={{
                height: "36px",
                border: "1px solid #E5E9F0",
                borderRadius: "6px",
                padding: "0 10px",
                fontSize: "13px",
                color: "#12332B",
                outline: "none",
                boxSizing: "border-box",
                backgroundColor: "#FFFFFF",
              }}
            />
          </div>

          {/* Memo */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
            <label style={{ fontSize: "12px", fontWeight: 500, color: "#667085" }}>
              Description / Memo
            </label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="e.g. Period-end accrual adjustment"
              style={{
                height: "36px",
                border: "1px solid #E5E9F0",
                borderRadius: "6px",
                padding: "0 10px",
                fontSize: "13px",
                color: "#12332B",
                outline: "none",
                boxSizing: "border-box",
                backgroundColor: "#FFFFFF",
                width: "100%",
              }}
            />
          </div>
        </div>

        {/* Line items section */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 180px 110px 110px 32px",
              gap: "8px",
              padding: "8px 10px",
              backgroundColor: "#F9FAFB",
              borderRadius: "6px 6px 0 0",
              border: "1px solid #E5E9F0",
              borderBottom: "none",
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#667085", textTransform: "uppercase", letterSpacing: "0.4px" }}>Account</span>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#667085", textTransform: "uppercase", letterSpacing: "0.4px" }}>Description</span>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#667085", textTransform: "uppercase", letterSpacing: "0.4px", textAlign: "right" }}>Debit (DR)</span>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#667085", textTransform: "uppercase", letterSpacing: "0.4px", textAlign: "right" }}>Credit (CR)</span>
            <span />
          </div>

          {/* Loading state */}
          {loadingAccounts ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                padding: "32px",
                border: "1px solid #E5E9F0",
                borderTop: "none",
              }}
            >
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "#667085" }} />
              <span style={{ marginLeft: "8px", fontSize: "13px", color: "#667085" }}>Loading accounts…</span>
            </div>
          ) : (
            <>
              {/* Line rows */}
              {lines.map((line, idx) => (
                <div
                  key={line.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 180px 110px 110px 32px",
                    gap: "8px",
                    padding: "8px 10px",
                    border: "1px solid #E5E9F0",
                    borderTop: idx === 0 ? "1px solid #E5E9F0" : "none",
                    backgroundColor: "#FFFFFF",
                    alignItems: "center",
                  }}
                >
                  {/* Account picker */}
                  <AccountSelect
                    accounts={accounts}
                    value={line.account_id}
                    onChange={(id) => updateLine(line.id, { account_id: id })}
                  />

                  {/* Line description */}
                  <input
                    type="text"
                    value={line.description}
                    onChange={(e) => updateLine(line.id, { description: e.target.value })}
                    placeholder="Optional note"
                    style={{
                      height: "34px",
                      border: "1px solid #E5E9F0",
                      borderRadius: "6px",
                      padding: "0 8px",
                      fontSize: "13px",
                      color: "#12332B",
                      outline: "none",
                      boxSizing: "border-box",
                      width: "100%",
                      backgroundColor: "#FFFFFF",
                    }}
                  />

                  {/* Debit */}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.debit}
                    onChange={(e) => {
                      updateLine(line.id, { debit: e.target.value, credit: e.target.value ? "" : line.credit });
                    }}
                    placeholder="0.00"
                    style={{
                      height: "34px",
                      border: "1px solid #E5E9F0",
                      borderRadius: "6px",
                      padding: "0 8px",
                      fontSize: "13px",
                      color: "#12332B",
                      textAlign: "right",
                      outline: "none",
                      boxSizing: "border-box",
                      width: "100%",
                      backgroundColor: line.debit ? "#F7FAF8" : "#FFFFFF",
                    }}
                  />

                  {/* Credit */}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.credit}
                    onChange={(e) => {
                      updateLine(line.id, { credit: e.target.value, debit: e.target.value ? "" : line.debit });
                    }}
                    placeholder="0.00"
                    style={{
                      height: "34px",
                      border: "1px solid #E5E9F0",
                      borderRadius: "6px",
                      padding: "0 8px",
                      fontSize: "13px",
                      color: "#12332B",
                      textAlign: "right",
                      outline: "none",
                      boxSizing: "border-box",
                      width: "100%",
                      backgroundColor: line.credit ? "#F7FAF8" : "#FFFFFF",
                    }}
                  />

                  {/* Remove button */}
                  <button
                    onClick={() => removeLine(line.id)}
                    disabled={lines.length <= 2}
                    title={lines.length <= 2 ? "Minimum 2 lines required" : "Remove line"}
                    style={{
                      width: "28px",
                      height: "28px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "none",
                      border: "none",
                      borderRadius: "4px",
                      cursor: lines.length <= 2 ? "not-allowed" : "pointer",
                      color: lines.length <= 2 ? "#D1D5DB" : "#667085",
                      padding: 0,
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      if (lines.length > 2) {
                        (e.currentTarget as HTMLButtonElement).style.color = "#DC2626";
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#FEF2F2";
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = lines.length <= 2 ? "#D1D5DB" : "#667085";
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {/* Add line button row */}
              <div
                style={{
                  border: "1px solid #E5E9F0",
                  borderTop: "none",
                  borderRadius: "0 0 6px 6px",
                  padding: "8px 10px",
                  backgroundColor: "#F9FAFB",
                }}
              >
                <button
                  onClick={addLine}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "none",
                    border: "none",
                    padding: "4px 0",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "#0F766E",
                    cursor: "pointer",
                  }}
                >
                  <Plus size={15} />
                  Add Line
                </button>
              </div>
            </>
          )}
        </div>

        {/* Totals footer */}
        <div
          style={{
            borderRadius: "8px",
            border: "1px solid #E5E9F0",
            overflow: "hidden",
          }}
        >
          {/* Totals row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 110px 110px 40px",
              gap: "8px",
              padding: "10px 10px 10px 10px",
              backgroundColor: "#F9FAFB",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#667085", textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Totals
            </span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#12332B", textAlign: "right" }}>
              {PHP.format(totalDebits)}
            </span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#12332B", textAlign: "right" }}>
              {PHP.format(totalCredits)}
            </span>
            <span />
          </div>

          {/* Balance status bar */}
          <div
            style={{
              padding: "10px 14px",
              borderTop: "1px solid #E5E9F0",
              backgroundColor: isBalanced ? "#F0FDF4" : totalDebits === 0 && totalCredits === 0 ? "#F9FAFB" : "#FFF7ED",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            {isBalanced ? (
              <span style={{ fontSize: "12px", fontWeight: 500, color: "#15803D" }}>
                Entry is balanced — debits equal credits.
              </span>
            ) : totalDebits === 0 && totalCredits === 0 ? (
              <span style={{ fontSize: "12px", color: "#667085" }}>
                Enter debit and credit amounts to validate balance.
              </span>
            ) : (
              <span style={{ fontSize: "12px", fontWeight: 500, color: "#B45309" }}>
                Out of balance — difference: {PHP.format(difference)}
              </span>
            )}
          </div>
        </div>

      </div>
    </SidePanel>
  );
}
