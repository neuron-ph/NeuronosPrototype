import { useState, useEffect } from "react";
import { Loader2, ChevronDown, BookOpen } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../utils/supabase/client";
import { useUser } from "../../../hooks/useUser";
import { logActivity } from "../../../utils/activityLog";
import { toast } from "../../ui/toast-utils";
import { SidePanel } from "../../common/SidePanel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GLAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface CollectionRow {
  id: string;
  reference_number?: string;
  evoucher_number?: string;
  amount: number;
  customer_name?: string;
  collection_date?: string;
  payment_method?: string;
  description?: string;
  status?: string;
  journal_entry_id?: string | null;
}

interface JournalLine {
  account_id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  description: string;
}

export interface CollectionGLPostingSheetProps {
  isOpen: boolean;
  onClose: () => void;
  collectionId: string;
  onPosted?: () => void;
}

// ---------------------------------------------------------------------------
// Default account hints — DR Cash / CR Accounts Receivable
// ---------------------------------------------------------------------------

const DEBIT_HINT = "Cash";
const CREDIT_HINT = "Accounts Receivable";

const DEFAULT_DEBIT_CODE = "1000";
const DEFAULT_CREDIT_CODE = "1200";

// ---------------------------------------------------------------------------
// AccountSelect sub-component
// ---------------------------------------------------------------------------

function AccountSelect({
  label,
  accounts,
  value,
  onChange,
}: {
  label: string;
  accounts: GLAccount[];
  value: string;
  onChange: (id: string, account: GLAccount) => void;
}) {
  return (
    <div>
      <p
        style={{
          fontSize: "12px",
          fontWeight: 500,
          color: "var(--theme-text-muted)",
          marginBottom: "6px",
        }}
      >
        {label}
      </p>
      <div style={{ position: "relative" }}>
        <select
          value={value}
          onChange={(e) => {
            const acct = accounts.find((a) => a.id === e.target.value);
            if (acct) onChange(acct.id, acct);
          }}
          style={{
            width: "100%",
            height: "36px",
            border: "1px solid var(--neuron-ui-border)",
            borderRadius: "6px",
            padding: "0 32px 0 10px",
            fontSize: "13px",
            backgroundColor: "var(--theme-bg-surface)",
            color: "var(--theme-text-primary)",
            appearance: "none",
            cursor: "pointer",
            outline: "none",
            boxSizing: "border-box",
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
          size={14}
          style={{
            position: "absolute",
            right: "10px",
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--theme-text-muted)",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CollectionGLPostingSheet({
  isOpen,
  onClose,
  collectionId,
  onPosted,
}: CollectionGLPostingSheetProps) {
  const { user } = useUser();
  // ---- local form state ----
  const [debitAccountId, setDebitAccountId] = useState("");
  const [debitAccountName, setDebitAccountName] = useState("");
  const [debitAccountCode, setDebitAccountCode] = useState("");
  const [creditAccountId, setCreditAccountId] = useState("");
  const [creditAccountName, setCreditAccountName] = useState("");
  const [creditAccountCode, setCreditAccountCode] = useState("");
  const [postingAmount, setPostingAmount] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [posting, setPosting] = useState(false);

  // ---- fetch collection ----
  const {
    data: collection,
    isLoading: loadingCollection,
    error: collectionError,
  } = useQuery<CollectionRow | null>({
    queryKey: ["collection-gl-detail", collectionId],
    enabled: isOpen && Boolean(collectionId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("*")
        .eq("id", collectionId)
        .maybeSingle();
      if (error) throw error;
      return data as CollectionRow | null;
    },
  });

  // ---- fetch chart of accounts ----
  const {
    data: accounts = [],
    isLoading: loadingAccounts,
  } = useQuery<GLAccount[]>({
    queryKey: ["chart-of-accounts-active"],
    enabled: isOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, code, name, type")
        .eq("is_active", true)
        .order("code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as GLAccount[];
    },
  });

  // ---- seed form when data is ready ----
  useEffect(() => {
    if (!isOpen) return;

    // Reset on open
    setDebitAccountId("");
    setDebitAccountName("");
    setDebitAccountCode("");
    setCreditAccountId("");
    setCreditAccountName("");
    setCreditAccountCode("");
    setPosting(false);
  }, [isOpen]);

  useEffect(() => {
    if (collection) {
      setPostingAmount(collection.amount ?? 0);
      const ref =
        collection.reference_number ||
        collection.evoucher_number ||
        collectionId;
      setDescription(`Collection Receipt — ${ref}`);
    }
  }, [collection, collectionId]);

  useEffect(() => {
    if (!accounts.length) return;

    // Pre-fill by code first (most reliable), then fall back to name hint
    const debitByCode = accounts.find((a) => a.code === DEFAULT_DEBIT_CODE);
    const debitByName = accounts.find((a) =>
      a.name.toLowerCase().includes(DEBIT_HINT.toLowerCase())
    );
    const debitSuggestion = debitByCode ?? debitByName;

    const creditByCode = accounts.find((a) => a.code === DEFAULT_CREDIT_CODE);
    const creditByName = accounts.find((a) =>
      a.name.toLowerCase().includes(CREDIT_HINT.toLowerCase())
    );
    const creditSuggestion = creditByCode ?? creditByName;

    if (debitSuggestion && !debitAccountId) {
      setDebitAccountId(debitSuggestion.id);
      setDebitAccountName(debitSuggestion.name);
      setDebitAccountCode(debitSuggestion.code);
    }
    if (creditSuggestion && !creditAccountId) {
      setCreditAccountId(creditSuggestion.id);
      setCreditAccountName(creditSuggestion.name);
      setCreditAccountCode(creditSuggestion.code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  // ---- post handler ----
  const handlePost = async () => {
    if (!debitAccountId || !creditAccountId) {
      toast.error("Select both a debit and credit account");
      return;
    }
    if (debitAccountId === creditAccountId) {
      toast.error("Debit and credit accounts must be different");
      return;
    }
    if (!postingAmount || postingAmount <= 0) {
      toast.error("Amount must be greater than zero");
      return;
    }

    setPosting(true);
    try {
      const lines: JournalLine[] = [
        {
          account_id: debitAccountId,
          account_code: debitAccountCode,
          account_name: debitAccountName,
          debit: postingAmount,
          credit: 0,
          description,
        },
        {
          account_id: creditAccountId,
          account_code: creditAccountCode,
          account_name: creditAccountName,
          debit: 0,
          credit: postingAmount,
          description,
        },
      ];

      const entryId = `JE-COL-${Date.now()}`;
      const now = new Date().toISOString();

      // 1. Create journal entry
      const { error: jeError } = await supabase.from("journal_entries").insert({
        id: entryId,
        entry_number: entryId,
        entry_date: now,
        collection_id: collectionId,
        description,
        lines,
        total_debit: postingAmount,
        total_credit: postingAmount,
        status: "posted",
        created_at: now,
        updated_at: now,
      });

      if (jeError) throw jeError;

      if (user && collection) {
        const actor = { id: user.id, name: user.name, department: user.department ?? "" };
        logActivity("collection", collection.id, collection.reference_number ?? collection.id, "posted", actor);
      }

      // 2. Link journal entry + mark collection as posted
      const { error: colError } = await supabase
        .from("collections")
        .update({
          journal_entry_id: entryId,
          status: "posted",
          updated_at: now,
        })
        .eq("id", collectionId);

      if (colError) throw colError;

      toast.success("Collection posted to GL", `DR ${debitAccountName} / CR ${creditAccountName}`);
      onPosted?.();
      onClose();
    } catch (err) {
      console.error("GL posting error:", err);
      toast.error("Failed to post to GL");
    } finally {
      setPosting(false);
    }
  };

  // ---- helpers ----
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);

  const formatDate = (d?: string) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
  };

  const isAlreadyPosted = !!collection?.journal_entry_id;
  const isReady = !loadingAccounts && !loadingCollection;
  const canPost =
    isReady &&
    !isAlreadyPosted &&
    Boolean(debitAccountId) &&
    Boolean(creditAccountId) &&
    postingAmount > 0 &&
    !posting;

  // ---- footer ----
  const footer = (
    <div
      style={{
        padding: "16px 24px",
        borderTop: "1px solid var(--neuron-ui-border)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: "var(--neuron-bg-elevated)",
      }}
    >
      <button
        onClick={onClose}
        style={{
          height: "40px",
          padding: "0 20px",
          background: "none",
          border: "none",
          color: "var(--neuron-ink-muted)",
          fontSize: "13px",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Cancel
      </button>
      {isAlreadyPosted ? (
        <span style={{ fontSize: "13px", color: "var(--theme-status-success-fg)", fontWeight: 500 }}>
          Already posted to GL
        </span>
      ) : (
        <button
          onClick={handlePost}
          disabled={!canPost}
          style={{
            height: "40px",
            padding: "0 24px",
            borderRadius: "8px",
            backgroundColor: "var(--neuron-action-primary)",
            border: "none",
            color: "var(--neuron-action-primary-text)",
            fontSize: "13px",
            fontWeight: 600,
            cursor: canPost ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            opacity: canPost ? 1 : 0.6,
            transition: "opacity 0.15s",
          }}
        >
          {posting ? (
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <BookOpen size={16} />
          )}
          {posting ? "Posting…" : "Post to GL"}
        </button>
      )}
    </div>
  );

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title="Post Collection to GL"
      footer={footer}
      width="520px"
    >
      <div style={{ padding: "24px", overflowY: "auto", height: "100%" }}>

        {/* Collection summary card */}
        {loadingCollection ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "24px",
              marginBottom: "24px",
            }}
          >
            <Loader2
              size={20}
              style={{ animation: "spin 1s linear infinite", color: "var(--theme-text-muted)" }}
            />
          </div>
        ) : collectionError || !collection ? (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              backgroundColor: "var(--theme-status-danger-bg)",
              border: "1px solid var(--theme-status-danger-border)",
              marginBottom: "24px",
            }}
          >
            <p style={{ fontSize: "13px", color: "var(--theme-status-danger-fg)" }}>
              Could not load collection details.
            </p>
          </div>
        ) : (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              backgroundColor: "var(--theme-bg-surface-subtle)",
              border: "1px solid var(--neuron-ui-border)",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "6px",
              }}
            >
              <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Reference</span>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--theme-text-primary)",
                }}
              >
                {collection.reference_number ||
                  collection.evoucher_number ||
                  collectionId}
              </span>
            </div>
            {collection.customer_name && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "6px",
                }}
              >
                <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
                  Customer
                </span>
                <span
                  style={{ fontSize: "13px", color: "var(--theme-text-primary)" }}
                >
                  {collection.customer_name}
                </span>
              </div>
            )}
            {collection.collection_date && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "6px",
                }}
              >
                <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
                  Payment Date
                </span>
                <span
                  style={{ fontSize: "13px", color: "var(--theme-text-primary)" }}
                >
                  {formatDate(collection.collection_date)}
                </span>
              </div>
            )}
            {collection.payment_method && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "6px",
                }}
              >
                <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
                  Method
                </span>
                <span
                  style={{ fontSize: "13px", color: "var(--theme-text-primary)" }}
                >
                  {collection.payment_method}
                </span>
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingTop: "6px",
                borderTop: "1px solid var(--neuron-ui-border)",
                marginTop: "4px",
              }}
            >
              <span style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>Amount</span>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "var(--theme-text-primary)",
                }}
              >
                {formatCurrency(collection.amount)}
              </span>
            </div>
          </div>
        )}

        {/* Already-posted notice */}
        {isAlreadyPosted && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "6px",
              backgroundColor: "var(--theme-status-success-bg)",
              border: "1px solid var(--theme-status-success-border)",
              marginBottom: "20px",
            }}
          >
            <p style={{ fontSize: "12px", color: "var(--theme-status-success-fg)", fontWeight: 500 }}>
              This collection already has a linked journal entry and cannot be posted again.
            </p>
          </div>
        )}

        {/* Default entry hint */}
        {!isAlreadyPosted && (
        <div style={{ marginBottom: "16px" }}>
          <p
            style={{
              fontSize: "13px",
              color: "var(--theme-text-muted)",
              lineHeight: "1.5",
            }}
          >
            Default entry:{" "}
            <strong>DR {DEBIT_HINT}</strong> /{" "}
            <strong>CR {CREDIT_HINT}</strong>. Override below if needed.
          </p>
        </div>
        )}

        {/* Account pickers + amount + description */}
        {loadingAccounts ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
            <Loader2
              size={24}
              style={{
                animation: "spin 1s linear infinite",
                color: "var(--theme-text-muted)",
              }}
            />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* Debit row */}
            <div
              style={{
                padding: "16px",
                borderRadius: "8px",
                border: "1px solid var(--neuron-ui-border)",
                backgroundColor: "var(--theme-bg-surface)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--theme-text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Debit (DR)
                </span>
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "var(--theme-text-primary)",
                  }}
                >
                  {formatCurrency(postingAmount)}
                </span>
              </div>
              <AccountSelect
                label="Account"
                accounts={accounts}
                value={debitAccountId}
                onChange={(id, acct) => {
                  setDebitAccountId(id);
                  setDebitAccountName(acct.name);
                  setDebitAccountCode(acct.code);
                }}
              />
            </div>

            {/* Credit row */}
            <div
              style={{
                padding: "16px",
                borderRadius: "8px",
                border: "1px solid var(--neuron-ui-border)",
                backgroundColor: "var(--theme-bg-surface)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--theme-text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Credit (CR)
                </span>
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "var(--theme-text-primary)",
                  }}
                >
                  {formatCurrency(postingAmount)}
                </span>
              </div>
              <AccountSelect
                label="Account"
                accounts={accounts}
                value={creditAccountId}
                onChange={(id, acct) => {
                  setCreditAccountId(id);
                  setCreditAccountName(acct.name);
                  setCreditAccountCode(acct.code);
                }}
              />
            </div>

            {/* Amount override */}
            <div>
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--theme-text-muted)",
                  marginBottom: "6px",
                }}
              >
                Posting Amount (PHP)
              </p>
              <input
                type="number"
                min={0}
                step={0.01}
                value={postingAmount}
                onChange={(e) => setPostingAmount(parseFloat(e.target.value) || 0)}
                style={{
                  width: "100%",
                  height: "36px",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "6px",
                  padding: "0 10px",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                  color: "var(--theme-text-primary)",
                  backgroundColor: "var(--theme-bg-surface)",
                }}
              />
            </div>

            {/* Description / memo */}
            <div>
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--theme-text-muted)",
                  marginBottom: "6px",
                }}
              >
                Journal Entry Memo
              </p>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{
                  width: "100%",
                  height: "36px",
                  border: "1px solid var(--neuron-ui-border)",
                  borderRadius: "6px",
                  padding: "0 10px",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                  color: "var(--theme-text-primary)",
                  backgroundColor: "var(--theme-bg-surface)",
                }}
              />
            </div>

            {/* Balance indicator */}
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "6px",
                backgroundColor: "var(--theme-status-success-bg)",
                border: "1px solid var(--theme-status-success-border)",
              }}
            >
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--theme-status-success-fg)",
                  fontWeight: 500,
                }}
              >
                Balanced — DR {formatCurrency(postingAmount)} = CR{" "}
                {formatCurrency(postingAmount)}
              </p>
            </div>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
