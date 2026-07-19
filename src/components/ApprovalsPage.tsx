import { useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabase/client";
import { useUser } from "../hooks/useUser";
import { usePermission } from "../context/PermissionProvider";
import { useEVouchers } from "../hooks/useEVouchers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner@2.0.3";
import { FileText, ReceiptText, ArrowRightLeft, Loader2, X, Check, Search } from "lucide-react";
import { EVoucherDetailView } from "./accounting/EVoucherDetailView";
import { DataTable, type ColumnDef } from "./common/DataTable";
import { TablePagination } from "./shared/TablePagination";
import { CustomDropdown } from "./bd/CustomDropdown";
import type { EVoucher } from "../types/evoucher";

const PAGE_SIZE = 15;

const PHP = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

function ago(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

type ApprovalRow = {
  kind: "evoucher" | "invoice";
  id: string;
  number: string;
  label: string; // type sub-label
  who: string;
  amount: number;
  date?: string;
  raw: any;
};

// E-voucher statuses that mean "awaiting an approval decision".
const EV_PENDING = ["pending_manager", "pending_ceo", "pending_accounting"];

export function ApprovalsPage() {
  const { user } = useUser();
  const { can } = usePermission();
  const queryClient = useQueryClient();

  const [openEV, setOpenEV] = useState<EVoucher | null>(null);
  const [openInvoice, setOpenInvoice] = useState<any | null>(null);

  const isExecutive = can("acct_evouchers", "approve");
  const department = user?.department ?? undefined;

  // ── E-Vouchers awaiting my approval ── (RLS + the view filter scope to me)
  const approvalView = isExecutive ? "pending-ceo" : "dept-pending-manager";
  const { evouchers: evPending, isLoading: evLoading } = useEVouchers(
    approvalView as any,
    user?.id,
    isExecutive ? undefined : department,
  );

  // ── Invoices awaiting my approval ── (invoices_select_approver RLS returns
  //    only invoices routed to me, so a plain pending query is already scoped).
  const { data: invPending = [], isLoading: invLoading } = useQuery({
    queryKey: ["approvals", "invoices", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, customer_name, total_amount, created_at, project_number, pending_approver_department, pending_approver_role")
        .eq("approval_status", "pending_approval")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 0,
  });

  const rows: ApprovalRow[] = useMemo(() => {
    const evRows: ApprovalRow[] = (evPending ?? []).map((ev: any) => ({
      kind: "evoucher",
      id: ev.id,
      number: ev.evoucher_number ?? ev.voucher_number ?? ev.id,
      label: ev.transaction_type === "fund_transfer" ? "Transfer of Funds" : "E-Voucher",
      who: ev.requestor_name ?? ev.details?.requestor_name ?? "—",
      amount: Number(ev.amount) || 0,
      date: ev.request_date ?? ev.created_at,
      raw: ev,
    }));
    const invRows: ApprovalRow[] = (invPending ?? []).map((inv: any) => ({
      kind: "invoice",
      id: inv.id,
      number: inv.invoice_number ?? inv.id,
      label: "Invoice",
      who: inv.customer_name ?? "—",
      amount: Number(inv.total_amount) || 0,
      date: inv.created_at,
      raw: inv,
    }));
    return [...evRows, ...invRows].sort(
      (a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime(),
    );
  }, [evPending, invPending]);

  const loading = evLoading || invLoading;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["approvals"] });
    queryClient.invalidateQueries({ queryKey: ["evouchers"] });
  };

  const iconFor = (row: ApprovalRow) =>
    row.kind === "invoice" ? ReceiptText : row.label === "Transfer of Funds" ? ArrowRightLeft : FileText;

  // ── Filter + paginate client-side, like the other module list pages ──
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "evoucher" | "invoice">("all");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== "all" && r.kind !== typeFilter) return false;
      if (!q) return true;
      return r.number.toLowerCase().includes(q) || r.who.toLowerCase().includes(q);
    });
  }, [rows, search, typeFilter]);

  useEffect(() => { setPage(0); }, [search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages - 1);
  const paged = filtered.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE);

  const openRow = (r: ApprovalRow) =>
    r.kind === "evoucher" ? setOpenEV(r.raw as EVoucher) : setOpenInvoice(r.raw);

  const columns: ColumnDef<ApprovalRow>[] = [
    {
      header: "Type", width: "150px",
      cell: (r) => {
        const Icon = iconFor(r);
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon size={15} style={{ color: "var(--theme-action-primary-bg)", flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--theme-text-secondary)" }}>{r.label}</span>
          </div>
        );
      },
    },
    {
      header: "Reference",
      cell: (r) => (
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--theme-action-primary-bg)", fontVariantNumeric: "tabular-nums" }}>{r.number}</span>
      ),
    },
    {
      header: "From",
      cell: (r) => (
        <span style={{ fontSize: 13, color: "var(--theme-text-secondary)" }}>{r.who}</span>
      ),
    },
    {
      header: "Amount", align: "right", width: "160px",
      cell: (r) => (
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--theme-text-primary)", fontVariantNumeric: "tabular-nums" }}>{PHP.format(r.amount)}</span>
      ),
    },
    {
      header: "Age", align: "right", width: "90px", mobileHidden: true,
      cell: (r) => (<span style={{ fontSize: 12, color: "var(--theme-text-muted)" }}>{ago(r.date)} ago</span>),
    },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "auto", background: "var(--theme-bg-surface)" }}>
      <div style={{ padding: "32px 48px" }}>
        {/* Header — matches the standard Neuron module shell: full-width,
            left-aligned title + subtitle (no centered column). */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-1.2px", color: "var(--theme-text-primary)", margin: "0 0 4px" }}>
              Approvals
            </h1>
            <p style={{ fontSize: 14, color: "var(--theme-text-muted)", margin: 0 }}>
              Everything across Neuron that needs your sign-off, in one place.
            </p>
          </div>
          {!loading && rows.length > 0 && (
            <span style={{ fontSize: 13, color: "var(--theme-text-muted)", flexShrink: 0, marginTop: 6 }}>
              {rows.length} waiting on you
            </span>
          )}
        </div>

        {/* Search + type filter — like the other module list pages */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--theme-text-muted)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by number or requestor…"
              style={{ width: "100%", height: 40, padding: "0 12px 0 38px", borderRadius: 8, border: "1px solid var(--theme-border-default)", fontSize: 13, outline: "none", backgroundColor: "var(--theme-bg-surface)", color: "var(--theme-text-primary)", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ width: 200 }}>
            <CustomDropdown
              value={typeFilter}
              options={[
                { value: "all", label: "All types" },
                { value: "evoucher", label: "E-Vouchers" },
                { value: "invoice", label: "Invoices" },
              ]}
              onChange={(v) => setTypeFilter((v as "all" | "evoucher" | "invoice") || "all")}
            />
          </div>
        </div>

        <DataTable
          data={paged}
          columns={columns}
          isLoading={loading}
          onRowClick={openRow}
          emptyMessage={rows.length === 0
            ? "All clear — nothing is pending your approval right now."
            : "No approvals match your search."}
        />

        {filtered.length > PAGE_SIZE && (
          <TablePagination
            page={pageSafe}
            totalPages={totalPages}
            total={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </div>

      {/* E-Voucher review — reuse the existing slide-over (approve/reject live inside) */}
      {openEV && (
        <EVoucherDetailView
          evoucher={openEV}
          onClose={() => setOpenEV(null)}
          currentUser={
            user
              ? { id: user.id, name: user.name, email: user.email || "", role: user.role, department: user.department }
              : undefined
          }
          onStatusChange={() => { setOpenEV(null); refresh(); }}
        />
      )}

      {/* Invoice review — lightweight in-module drawer */}
      {openInvoice && (
        <InvoiceReviewDrawer
          invoice={openInvoice}
          onClose={() => setOpenInvoice(null)}
          onApproved={() => { setOpenInvoice(null); refresh(); }}
        />
      )}
    </div>
  );
}

// ── Lightweight invoice review + approve, in a right-side drawer ──────────────
function InvoiceReviewDrawer({ invoice, onClose, onApproved }: {
  invoice: any;
  onClose: () => void;
  onApproved: () => void;
}) {
  const [approving, setApproving] = useState(false);

  const approve = async () => {
    setApproving(true);
    try {
      const { error } = await supabase.rpc("approve_invoice", { p_invoice_id: invoice.id });
      if (error) throw error;
      toast.success(`Invoice ${invoice.invoice_number} approved — ready to finalize`);
      onApproved();
    } catch (err: any) {
      console.error("[approvals] invoice approve failed:", err);
      toast.error(err?.message || "Couldn't approve the invoice");
    } finally {
      setApproving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(18,51,43,0.35)" }} />
      <div style={{
        position: "relative", width: "min(520px, 92vw)", height: "100%", backgroundColor: "var(--theme-bg-surface)",
        boxShadow: "-8px 0 32px rgba(18,51,43,0.18)", display: "flex", flexDirection: "column",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid var(--theme-border-default)" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--theme-text-primary)" }}>{invoice.invoice_number}</div>
            <div style={{ fontSize: 12, color: "var(--theme-text-muted)" }}>Invoice · pending your approval</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--theme-text-muted)" }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 22 }}>
          <Field label="Customer" value={invoice.customer_name ?? "—"} />
          {invoice.project_number && <Field label="Project / Booking" value={invoice.project_number} />}
          <Field label="Amount" value={PHP.format(Number(invoice.total_amount) || 0)} strong />
          <div style={{
            marginTop: 18, padding: "12px 14px", borderRadius: 8, fontSize: 12, lineHeight: 1.5,
            color: "var(--theme-text-muted)", backgroundColor: "var(--theme-bg-surface-subtle)",
            border: "1px solid var(--theme-border-subtle)",
          }}>
            Approving lets this invoice be finalized and posted to the ledger (Dr Accounts Receivable / Cr Revenue).
          </div>
        </div>

        <div style={{ padding: "16px 22px", borderTop: "1px solid var(--theme-border-default)" }}>
          <button
            onClick={approve}
            disabled={approving}
            style={{
              width: "100%", height: 44, borderRadius: 8, border: "none", cursor: approving ? "not-allowed" : "pointer",
              backgroundColor: "var(--theme-action-primary-bg)", color: "#fff", fontSize: 13, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {approving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {approving ? "Approving…" : "Approve Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--theme-text-muted)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: strong ? 18 : 13, fontWeight: strong ? 700 : 500, color: "var(--theme-text-primary)" }}>{value}</div>
    </div>
  );
}
