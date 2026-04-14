import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import {
  ArrowLeft, Building2, MapPin, Briefcase, Edit, Users,
  Search, FileText, CreditCard, Layout, Receipt, Package, ArrowRight,
} from "lucide-react";
import type { Customer, CustomerStatus } from "../../types/bd";
import { UnifiedExpensesTab } from "./UnifiedExpensesTab";
import { supabase } from "../../utils/supabase/client";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";

// ─── helpers ────────────────────────────────────────────────────────────────

const getCompanyInitials = (name: string) => {
  if (!name) return "??";
  const words = name.split(" ");
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

const getCompanyLogoColor = (name: string) => {
  if (!name) return "#0F766E";
  const palette = ["#0F766E", "#2B8A6E", "#237F66", "#1E6D59", "#C88A2B", "#6B7A76", "#C94F3D"];
  return palette[name.charCodeAt(0) % palette.length];
};

const getStatusStyle = (status: CustomerStatus): { bg: string; fg: string } => {
  switch (status) {
    case "Active":   return { bg: "var(--theme-status-success-bg)",  fg: "var(--theme-status-success-fg)" };
    case "Prospect": return { bg: "var(--theme-status-warning-bg)",  fg: "var(--theme-status-warning-fg)" };
    case "Inactive": return { bg: "var(--theme-bg-surface-subtle)",  fg: "var(--theme-text-secondary)" };
    default:         return { bg: "var(--theme-bg-surface-subtle)",  fg: "var(--theme-text-secondary)" };
  }
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
};

// ─── types ───────────────────────────────────────────────────────────────────

interface CustomerLedgerDetailProps {
  customer: Customer;
  onClose: () => void;
  contactCount?: number;
}

type TabType = "overview" | "projects" | "billings" | "collections" | "expenses";

const TABS: { id: TabType; label: string; icon: typeof Layout }[] = [
  { id: "overview",    label: "Overview",           icon: Layout },
  { id: "projects",    label: "Projects",            icon: Briefcase },
  { id: "billings",    label: "Billings & Invoices", icon: FileText },
  { id: "collections", label: "Collections",         icon: CreditCard },
  { id: "expenses",    label: "Expenses",            icon: Receipt },
];

// ─── component ───────────────────────────────────────────────────────────────

export function CustomerLedgerDetail({ customer, onClose, contactCount }: CustomerLedgerDetailProps) {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [projectSearch,    setProjectSearch]    = useState("");
  const [billingSearch,    setBillingSearch]    = useState("");
  const [collectionSearch, setCollectionSearch] = useState("");

  const customerId = customer.id;

  // ── Data fetching ─────────────────────────────────────────────────────

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: [...queryKeys.projects.list(), { customerId }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("customer_id", customerId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!customerId,
    staleTime: 30_000,
  });

  // Billing line items scoped to this customer's projects
  const { data: billings = [], isLoading: billingsLoading } = useQuery({
    queryKey: ["billing_line_items", "by_customer", customerId],
    queryFn: async () => {
      const { data: projData } = await supabase
        .from("projects")
        .select("project_number")
        .eq("customer_id", customerId);
      const projectNumbers = (projData ?? []).map(p => p.project_number).filter(Boolean);
      if (projectNumbers.length === 0) return [];
      const { data, error } = await supabase
        .from("billing_line_items")
        .select("*")
        .in("project_number", projectNumbers);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!customerId,
    staleTime: 30_000,
  });

  const { data: collections = [], isLoading: collectionsLoading } = useQuery({
    queryKey: ["collections", "by_customer", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("*")
        .eq("customer_id", customerId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!customerId,
    staleTime: 30_000,
  });

  // Expenses (evouchers) scoped to this customer's projects
  const { data: expenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ["evouchers", "by_customer_expense", customerId],
    queryFn: async () => {
      const { data: projData } = await supabase
        .from("projects")
        .select("project_number")
        .eq("customer_id", customerId);
      const projectNumbers = (projData ?? []).map(p => p.project_number).filter(Boolean);
      if (projectNumbers.length === 0) return [];
      const { data, error } = await supabase
        .from("evouchers")
        .select("*")
        .in("project_number", projectNumbers)
        .eq("transaction_type", "expense");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!customerId,
    staleTime: 30_000,
  });

  // ── Financial calculations ─────────────────────────────────────────────

  const totalBilled     = billings.reduce((s, b) => s + (Number(b.total_amount ?? b.amount) || 0), 0);
  const totalCollected  = collections.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const outstanding     = totalBilled - totalCollected;
  const collectionRate  = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

  const chartData = [
    { name: "Billed",      amount: totalBilled,    fill: "var(--theme-action-primary-bg)" },
    { name: "Collected",   amount: totalCollected,  fill: "var(--theme-status-success-fg)" },
    { name: "Outstanding", amount: Math.max(outstanding, 0), fill: "var(--theme-status-warning-fg)" },
  ];

  // ── Filtered lists ─────────────────────────────────────────────────────

  const filteredProjects = useMemo(() => {
    const q = projectSearch.toLowerCase();
    if (!q) return projects;
    return projects.filter(p =>
      (p.project_name || "").toLowerCase().includes(q) ||
      (p.quotation_name || "").toLowerCase().includes(q) ||
      (p.project_number || "").toLowerCase().includes(q)
    );
  }, [projects, projectSearch]);

  const filteredBillings = useMemo(() => {
    const q = billingSearch.toLowerCase();
    if (!q) return billings;
    return billings.filter(b =>
      (b.invoice_number || b.evoucher_number || "").toLowerCase().includes(q) ||
      (b.description || "").toLowerCase().includes(q)
    );
  }, [billings, billingSearch]);

  const filteredCollections = useMemo(() => {
    const q = collectionSearch.toLowerCase();
    if (!q) return collections;
    return collections.filter(c =>
      (c.reference_number || "").toLowerCase().includes(q) ||
      (c.payment_method || "").toLowerCase().includes(q)
    );
  }, [collections, collectionSearch]);

  // ── View rendering ─────────────────────────────────────────────────────

  const logoColor = getCompanyLogoColor(customer.name || customer.company_name || "");
  const statusStyle = getStatusStyle(customer.status);
  const displayName = customer.name || customer.company_name || "—";

  const collectionRateColor =
    collectionRate >= 80 ? "var(--theme-status-success-fg)"  :
    collectionRate >= 50 ? "var(--theme-status-warning-fg)"  :
    "var(--theme-status-danger-fg)";

  return (
    <div className="h-full flex flex-col bg-[var(--theme-bg-surface)] overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="border-b border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] px-12 py-6 flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-[13px] font-medium mb-5 transition-colors hover:opacity-70"
          style={{ color: "var(--theme-action-primary-bg)" }}
          aria-label="Back to Customers list"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Back to Customers
        </button>

        <div className="flex items-start justify-between">
          <div className="flex items-start gap-5">
            {/* Monogram */}
            <div
              className="rounded-xl flex-shrink-0 flex items-center justify-center text-[22px] font-bold"
              style={{
                width: 72, height: 72,
                backgroundColor: `${logoColor}18`,
                color: logoColor,
                border: `1.5px solid ${logoColor}28`,
              }}
              aria-hidden="true"
            >
              {getCompanyInitials(displayName)}
            </div>

            {/* Info */}
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <h1 className="text-[22px] font-semibold text-[var(--theme-text-primary)] tracking-tight">
                  {displayName}
                </h1>
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-medium"
                  style={{ backgroundColor: statusStyle.bg, color: statusStyle.fg }}
                >
                  {customer.status}
                </span>
              </div>

              <div className="flex items-start gap-10">
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-text-muted)] mb-1">
                    <Briefcase size={12} aria-hidden="true" /> Industry
                  </div>
                  <div className="text-[13px] text-[var(--theme-text-primary)]">{customer.industry || "—"}</div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-text-muted)] mb-1">
                    <MapPin size={12} aria-hidden="true" /> Registered Address
                  </div>
                  <div className="text-[13px] text-[var(--theme-text-primary)] max-w-sm truncate">
                    {customer.registered_address || "—"}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-text-muted)] mb-1">
                    <Building2 size={12} aria-hidden="true" /> Lead Source
                  </div>
                  <div className="text-[13px] text-[var(--theme-text-primary)]">{customer.lead_source || "—"}</div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-text-muted)] mb-1">
                    <Users size={12} aria-hidden="true" /> Contacts
                  </div>
                  <div className="text-[13px] text-[var(--theme-text-primary)]">
                    {contactCount !== undefined ? contactCount : "—"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button
            className="p-2 rounded-lg transition-colors text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-page)] focus:outline-none focus:bg-[var(--theme-bg-page)]"
            aria-label="Edit customer"
            title="Edit customer (coming soon)"
          >
            <Edit size={17} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ── Tab nav ─────────────────────────────────────────────────────── */}
      <div className="px-12 border-b border-[var(--theme-border-default)] bg-[var(--theme-bg-surface)] flex-shrink-0">
        <div className="flex items-center gap-1 py-3" role="tablist">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(id)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all focus:outline-none"
                style={{
                  backgroundColor: active ? "var(--theme-status-success-bg)" : "transparent",
                  color:           active ? "var(--theme-action-primary-bg)" : "var(--neuron-ink-muted)",
                  border:          active ? "1px solid var(--theme-action-primary-bg)" : "1px solid transparent",
                  fontWeight:      active ? 600 : 500,
                }}
              >
                <Icon size={15} aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-auto bg-[var(--theme-bg-surface)] px-8 py-6"
        role="tabpanel"
        aria-label={TABS.find(t => t.id === activeTab)?.label}
      >
        <div className="max-w-7xl mx-auto space-y-6">

          {/* ─── OVERVIEW ─────────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <>
              {/* Flat financial summary — no card per column, just a divided row */}
              <div
                className="grid grid-cols-4 divide-x rounded-xl overflow-hidden"
                style={{ border: "1.5px solid var(--neuron-ui-border)" }}
              >
                {[
                  {
                    label: "Total Billed",
                    value: formatCurrency(totalBilled),
                    color: "var(--neuron-ink-primary)",
                  },
                  {
                    label: "Collected",
                    value: formatCurrency(totalCollected),
                    color: "var(--theme-status-success-fg)",
                  },
                  {
                    label: "Outstanding",
                    value: formatCurrency(Math.max(outstanding, 0)),
                    color: outstanding > 0 ? "var(--theme-status-warning-fg)" : "var(--theme-status-success-fg)",
                  },
                  {
                    label: "Collection Rate",
                    value: `${collectionRate.toFixed(1)}%`,
                    color: collectionRateColor,
                  },
                ].map(({ label, value, color }) => (
                  <div key={label} className="px-6 py-5 bg-[var(--theme-bg-surface)]">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--neuron-ink-muted)] mb-2">
                      {label}
                    </div>
                    <div className="text-[20px] font-bold tabular-nums" style={{ color }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Chart + Recent Transactions */}
              <div className="grid grid-cols-3 gap-6">
                {/* Financial Chart */}
                <div
                  className="col-span-1 p-6 rounded-xl bg-[var(--theme-bg-surface)] flex flex-col"
                  style={{ border: "1.5px solid var(--neuron-ui-border)", height: 340 }}
                >
                  <h3 className="text-[14px] font-semibold text-[var(--theme-text-primary)] mb-4">Financial Summary</h3>
                  <div className="flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--neuron-ui-divider)" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--neuron-ink-muted)" }} />
                        <YAxis axisLine={false} tickLine={false} tickFormatter={v => `₱${v / 1000}k`} tick={{ fontSize: 11, fill: "var(--neuron-ink-muted)" }} />
                        <Tooltip
                          formatter={(v: number) => formatCurrency(v)}
                          cursor={{ fill: "var(--theme-bg-surface-subtle)" }}
                          contentStyle={{
                            borderRadius: 8,
                            border: "1px solid var(--neuron-ui-border)",
                            boxShadow: "none",
                            fontSize: 12,
                          }}
                        />
                        <Bar dataKey="amount" radius={[5, 5, 0, 0]} barSize={36}>
                          {chartData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Recent Transactions */}
                <div
                  className="col-span-2 rounded-xl bg-[var(--theme-bg-surface)] overflow-hidden flex flex-col"
                  style={{ border: "1.5px solid var(--neuron-ui-border)" }}
                >
                  <div className="px-6 py-4 border-b border-[var(--neuron-ui-divider)] flex justify-between items-center">
                    <h3 className="text-[14px] font-semibold text-[var(--theme-text-primary)]">Recent Transactions</h3>
                    <button
                      className="text-[13px] font-medium transition-colors hover:underline"
                      style={{ color: "var(--theme-action-primary-bg)" }}
                      onClick={() => setActiveTab("billings")}
                    >
                      View all →
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto">
                    {(() => {
                      const rows = [
                        ...billings.map(b => ({
                          id: b.id, type: "Invoice" as const,
                          date: b.invoice_date || b.created_at,
                          ref: b.invoice_number || b.evoucher_number || "—",
                          amount: Number(b.total_amount ?? b.amount) || 0,
                        })),
                        ...collections.map(c => ({
                          id: c.id, type: "Collection" as const,
                          date: c.collection_date || c.created_at,
                          ref: c.reference_number || "—",
                          amount: Number(c.amount) || 0,
                        })),
                      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);

                      if (billingsLoading || collectionsLoading) {
                        return <div className="py-10 text-center text-[13px] text-[var(--neuron-ink-muted)]">Loading…</div>;
                      }
                      if (rows.length === 0) {
                        return (
                          <div className="py-12 flex flex-col items-center gap-2 text-center">
                            <FileText size={24} className="text-[var(--neuron-ink-muted)] opacity-40" />
                            <p className="text-[13px] text-[var(--neuron-ink-muted)]">No transactions yet</p>
                          </div>
                        );
                      }
                      return (
                        <table className="w-full">
                          <thead className="border-b border-[var(--neuron-ui-divider)]">
                            <tr>
                              {["Date", "Type", "Reference", "Amount"].map((h, i) => (
                                <th key={h} className={`px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--neuron-ink-muted)] ${i === 3 ? "text-right" : "text-left"}`}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--neuron-ui-divider)]">
                            {rows.map(item => (
                              <tr key={`${item.type}-${item.id}`} className="hover:bg-[var(--theme-bg-page)] transition-colors">
                                <td className="px-6 py-3 text-[13px] text-[var(--theme-text-primary)]">{formatDate(item.date)}</td>
                                <td className="px-6 py-3">
                                  <span
                                    className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium"
                                    style={
                                      item.type === "Invoice"
                                        ? { backgroundColor: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)" }
                                        : { backgroundColor: "var(--theme-status-success-bg)", color: "var(--theme-status-success-fg)" }
                                    }
                                  >
                                    {item.type}
                                  </span>
                                </td>
                                <td className="px-6 py-3 text-[13px] font-medium text-[var(--theme-text-primary)]">{item.ref}</td>
                                <td className="px-6 py-3 text-[13px] text-right font-medium text-[var(--theme-text-primary)]">
                                  {item.type === "Collection" && <span className="text-[var(--theme-status-success-fg)] mr-0.5">−</span>}
                                  {formatCurrency(item.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ─── PROJECTS ─────────────────────────────────────────────── */}
          {activeTab === "projects" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" aria-hidden="true" />
                  <input
                    type="text"
                    aria-label="Search projects"
                    placeholder="Search projects…"
                    value={projectSearch}
                    onChange={e => setProjectSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-[var(--theme-border-default)] rounded-lg text-[13px] focus:outline-none focus:border-[var(--theme-action-primary-bg)] transition-colors bg-[var(--theme-bg-surface)] text-[var(--neuron-ink-primary)]"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[var(--neuron-ui-border)] bg-[var(--theme-bg-surface)] overflow-hidden">
                <table className="w-full">
                  <thead className="border-b border-[var(--neuron-ui-divider)]">
                    <tr>
                      {["Project", "Route", "Status", "Booking Status"].map(h => (
                        <th key={h} className="text-left px-6 py-4 text-[10px] font-semibold uppercase tracking-wider text-[var(--neuron-ink-muted)]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--neuron-ui-divider)]">
                    {projectsLoading ? (
                      <tr><td colSpan={4} className="px-6 py-12 text-center text-[13px] text-[var(--neuron-ink-muted)]">Loading…</td></tr>
                    ) : filteredProjects.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-14">
                          <div className="flex flex-col items-center gap-2.5 text-center">
                            <Package size={28} className="text-[var(--neuron-ink-muted)] opacity-35" />
                            <p className="text-[13px] font-medium text-[var(--neuron-ink-primary)]">
                              {projectSearch ? "No projects match your search" : "No projects linked to this customer"}
                            </p>
                            {!projectSearch && (
                              <p className="text-[12px] text-[var(--neuron-ink-muted)]">Projects appear here once created in Business Development</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredProjects.map(project => (
                        <tr
                          key={project.id}
                          className="hover:bg-[var(--theme-bg-page)] transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <Package size={18} strokeWidth={1.5} className="text-[var(--theme-action-primary-bg)] flex-shrink-0" aria-hidden="true" />
                              <div>
                                <div className="text-[13px] font-semibold text-[var(--theme-text-primary)]">
                                  {project.project_name || project.quotation_name || "Untitled Project"}
                                </div>
                                <div className="text-[11px] text-[var(--neuron-ink-muted)]">{project.project_number}</div>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-[13px] text-[var(--neuron-ink-muted)]">
                              <span>{project.origin || "—"}</span>
                              <ArrowRight size={13} aria-hidden="true" />
                              <span>{project.destination || "—"}</span>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <span
                              className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium"
                              style={
                                project.status === "Completed"
                                  ? { backgroundColor: "var(--theme-bg-surface-subtle)", color: "var(--theme-text-secondary)" }
                                  : { backgroundColor: "var(--theme-status-success-bg)", color: "var(--theme-status-success-fg)" }
                              }
                            >
                              {project.status || "Active"}
                            </span>
                          </td>

                          <td className="px-6 py-4 text-[13px] text-[var(--neuron-ink-muted)]">—</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── BILLINGS ─────────────────────────────────────────────── */}
          {activeTab === "billings" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" aria-hidden="true" />
                  <input
                    type="text"
                    aria-label="Search billings"
                    placeholder="Search by invoice number or description…"
                    value={billingSearch}
                    onChange={e => setBillingSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-[var(--theme-border-default)] rounded-lg text-[13px] focus:outline-none focus:border-[var(--theme-action-primary-bg)] transition-colors bg-[var(--theme-bg-surface)] text-[var(--neuron-ink-primary)]"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[var(--neuron-ui-border)] bg-[var(--theme-bg-surface)] overflow-hidden">
                <table className="w-full">
                  <thead className="border-b border-[var(--neuron-ui-divider)]">
                    <tr>
                      {["Invoice #", "Date", "Description", "Status", "Amount"].map((h, i) => (
                        <th key={h} className={`px-6 py-4 text-[10px] font-semibold uppercase tracking-wider text-[var(--neuron-ink-muted)] ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--neuron-ui-divider)]">
                    {billingsLoading ? (
                      <tr><td colSpan={5} className="px-6 py-12 text-center text-[13px] text-[var(--neuron-ink-muted)]">Loading…</td></tr>
                    ) : filteredBillings.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-14">
                          <div className="flex flex-col items-center gap-2.5 text-center">
                            <FileText size={28} className="text-[var(--neuron-ink-muted)] opacity-35" />
                            <p className="text-[13px] font-medium text-[var(--neuron-ink-primary)]">
                              {billingSearch ? "No billings match your search" : "No billings found"}
                            </p>
                            {!billingSearch && (
                              <p className="text-[12px] text-[var(--neuron-ink-muted)]">Billing items appear here once raised against this customer's projects</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredBillings.map(inv => {
                        const paid = inv.status === "Paid";
                        return (
                          <tr key={inv.id} className="hover:bg-[var(--theme-bg-page)] transition-colors">
                            <td className="px-6 py-4 text-[13px] font-medium" style={{ color: "var(--theme-action-primary-bg)" }}>
                              {inv.invoice_number || inv.evoucher_number || "—"}
                            </td>
                            <td className="px-6 py-4 text-[13px] text-[var(--neuron-ink-secondary)]">{formatDate(inv.invoice_date || inv.created_at)}</td>
                            <td className="px-6 py-4 text-[13px] text-[var(--neuron-ink-primary)]">{inv.description || "—"}</td>
                            <td className="px-6 py-4">
                              <span
                                className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold"
                                style={
                                  paid
                                    ? { backgroundColor: "var(--theme-status-success-bg)", color: "var(--theme-status-success-fg)" }
                                    : { backgroundColor: "var(--theme-status-warning-bg)", color: "var(--theme-status-warning-fg)" }
                                }
                              >
                                {inv.status || "Pending"}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-[13px] text-right font-medium text-[var(--neuron-ink-primary)]">
                              {formatCurrency(inv.total_amount ?? inv.amount ?? 0)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── COLLECTIONS ──────────────────────────────────────────── */}
          {activeTab === "collections" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]" aria-hidden="true" />
                  <input
                    type="text"
                    aria-label="Search collections"
                    placeholder="Search by reference number or payment method…"
                    value={collectionSearch}
                    onChange={e => setCollectionSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-[var(--theme-border-default)] rounded-lg text-[13px] focus:outline-none focus:border-[var(--theme-action-primary-bg)] transition-colors bg-[var(--theme-bg-surface)] text-[var(--neuron-ink-primary)]"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[var(--neuron-ui-border)] bg-[var(--theme-bg-surface)] overflow-hidden">
                <table className="w-full">
                  <thead className="border-b border-[var(--neuron-ui-divider)]">
                    <tr>
                      {["Reference #", "Payment Date", "Method", "Account", "Amount"].map((h, i) => (
                        <th key={h} className={`px-6 py-4 text-[10px] font-semibold uppercase tracking-wider text-[var(--neuron-ink-muted)] ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--neuron-ui-divider)]">
                    {collectionsLoading ? (
                      <tr><td colSpan={5} className="px-6 py-12 text-center text-[13px] text-[var(--neuron-ink-muted)]">Loading…</td></tr>
                    ) : filteredCollections.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-14">
                          <div className="flex flex-col items-center gap-2.5 text-center">
                            <CreditCard size={28} className="text-[var(--neuron-ink-muted)] opacity-35" />
                            <p className="text-[13px] font-medium text-[var(--neuron-ink-primary)]">
                              {collectionSearch ? "No collections match your search" : "No collections recorded"}
                            </p>
                            {!collectionSearch && (
                              <p className="text-[12px] text-[var(--neuron-ink-muted)]">Collections recorded against this customer's invoices will appear here</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredCollections.map(col => (
                        <tr key={col.id} className="hover:bg-[var(--theme-bg-page)] transition-colors">
                          <td className="px-6 py-4 text-[13px] font-medium" style={{ color: "var(--theme-action-primary-bg)" }}>
                            {col.reference_number || col.evoucher_number || "—"}
                          </td>
                          <td className="px-6 py-4 text-[13px] text-[var(--neuron-ink-secondary)]">{formatDate(col.collection_date || col.created_at)}</td>
                          <td className="px-6 py-4 text-[13px] text-[var(--neuron-ink-primary)]">{col.payment_method || "—"}</td>
                          <td className="px-6 py-4 text-[13px] text-[var(--neuron-ink-primary)]">{col.deposit_account || "—"}</td>
                          <td className="px-6 py-4 text-[13px] text-right font-semibold" style={{ color: "var(--theme-status-success-fg)" }}>
                            {formatCurrency(col.amount || 0)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── EXPENSES ─────────────────────────────────────────────── */}
          {activeTab === "expenses" && (
            <UnifiedExpensesTab
              expenses={expenses.map(exp => ({
                expenseId: exp.id,
                id: exp.id,
                expenseName: exp.evoucher_number || exp.id,
                expenseCategory: exp.category || "General",
                amount: Number(exp.amount || 0),
                currency: exp.currency || "PHP",
                expenseDate: exp.date || exp.created_at,
                vendorName: exp.vendor || exp.payee_name || "—",
                description: exp.description || exp.notes || "",
                status: (exp.status || "posted").toLowerCase(),
                bookingId: exp.booking_id || "—",
                projectNumber: exp.project_number || undefined,
                bookingType: "Customer",
                createdBy: exp.created_by || "System",
                createdAt: exp.created_at,
                lineItems: [],
              })) as Record<string, unknown>[]}
              isLoading={expensesLoading}
              showHeader={false}
              context="customer"
            />
          )}

        </div>
      </div>
    </div>
  );
}
