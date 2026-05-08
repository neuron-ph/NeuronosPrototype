import { useState, useRef } from "react";
import { Search, Plus, Building2, MoreHorizontal, Users as UsersIcon, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "../ui/toast-utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import { supabase } from "../../utils/supabase/client";
import type { Customer, Industry, CustomerStatus } from "../../types/bd";
import { CustomDropdown } from "../bd/CustomDropdown";
import { AddCustomerPanel } from "../bd/AddCustomerPanel";
import { CustomerLedgerDetail } from "./CustomerLedgerDetail";
import { useCustomerProfileOptions } from "../../hooks/useCustomerProfileOptions";

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

const getStatusColor = (status: CustomerStatus): { bg: string; fg: string } => {
  switch (status) {
    case "Active":   return { bg: "var(--theme-status-success-bg)",  fg: "var(--theme-status-success-fg)" };
    case "Prospect": return { bg: "var(--theme-status-warning-bg)",  fg: "var(--theme-status-warning-fg)" };
    case "Inactive": return { bg: "var(--theme-bg-surface-subtle)",  fg: "var(--theme-text-secondary)" };
    default:         return { bg: "var(--theme-bg-surface-subtle)",  fg: "var(--theme-text-secondary)" };
  }
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
};

// ────────────────────────────────────────────────────────────────────────────

export function AccountingCustomers() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"list" | "detail">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [industryFilter, setIndustryFilter] = useState<Industry | "All">("All");
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | "All">("All");
  const [ownerFilter, setOwnerFilter] = useState<string>("All");
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Main table data: server-filtered ──────────────────────────────────
  const { data: customers = [], isLoading } = useQuery({
    queryKey: [...queryKeys.customers.list(), { searchQuery, industryFilter, statusFilter, ownerFilter }],
    queryFn: async () => {
      let query = supabase.from("customers").select("*");
      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,company_name.ilike.%${searchQuery}%`);
      }
      if (industryFilter !== "All") query = query.eq("industry", industryFilter);
      if (statusFilter !== "All")   query = query.eq("status", statusFilter);
      if (ownerFilter !== "All")    query = query.eq("owner_id", ownerFilter);
      query = query.order("created_at", { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
  const { industries } = useCustomerProfileOptions({
    industryValuesFromRecords: customers.map(customer => customer.industry),
  });

  const { data: allContacts = [] } = useQuery({
    queryKey: queryKeys.contacts.list(),
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("id, customer_id");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const { data: activities = [] } = useQuery({
    queryKey: queryKeys.crmActivities.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_activities")
        .select("id, customer_id, date")
        .order("date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users", "bd"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, name")
        .eq("department", "Business Development");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  // ── Per-row helpers ────────────────────────────────────────────────────
  const getContactCount = (customerId: string) =>
    allContacts.filter(c => c.customer_id === customerId).length;

  const getLastActivityDate = (customerId: string) => {
    const sorted = activities
      .filter(a => a.customer_id === customerId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sorted[0]?.date ?? null;
  };

  const getOwnerName = (ownerId: string) =>
    users.find(u => u.id === ownerId)?.name ?? "—";

  // ── Mutations ──────────────────────────────────────────────────────────
  const handleDeleteCustomer = async (customerId: string) => {
    const { error } = await supabase.from("customers").delete().eq("id", customerId);
    if (error) {
      toast.error(`Failed to delete: ${error.message}`);
      return;
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.customers.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all() });
    setOpenDropdownId(null);
    setConfirmDeleteId(null);
    toast.success("Customer deleted");
  };

  const handleSaveCustomer = async (customerData: Partial<Customer>) => {
    const { error } = await supabase.from("customers").insert(customerData);
    if (error) {
      toast.error(`Failed to create: ${error.message}`);
      return;
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.customers.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all() });
    setIsAddCustomerOpen(false);
    toast.success("Customer added");
  };

  // ── Detail view ────────────────────────────────────────────────────────
  if (view === "detail" && selectedCustomer) {
    return (
      <CustomerLedgerDetail
        customer={selectedCustomer}
        contactCount={getContactCount(selectedCustomer.id)}
        onClose={() => { setSelectedCustomer(null); setView("list"); }}
      />
    );
  }

  // ── List view ──────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-[var(--theme-bg-surface)]">
      <div className="px-12 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[32px] font-semibold text-[var(--theme-text-primary)] tracking-tight">
              Customers
            </h1>
            <p className="text-sm text-[var(--theme-text-muted)] mt-0.5">
              Manage customer companies and prospects
            </p>
          </div>
          <button
            onClick={() => setIsAddCustomerOpen(true)}
            className="h-10 px-5 rounded-lg bg-[var(--theme-action-primary-bg)] text-white text-[13px] font-semibold flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity border-none"
          >
            <Plus size={16} />
            Add Customer
          </button>
        </div>

        {/* Filters & Search */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--neuron-ink-muted)]" />
            <input
              type="text"
              aria-label="Search customers"
              placeholder="Search customers…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none text-[13px] border-[1.5px] border-[var(--neuron-ui-border)] bg-[var(--theme-bg-surface)] text-[var(--neuron-ink-primary)] focus:border-[var(--theme-action-primary-bg)] transition-colors"
            />
          </div>

          <div style={{ minWidth: 150 }}>
            <CustomDropdown
              value={industryFilter}
              onChange={(v) => setIndustryFilter(v as Industry | "All")}
              options={[
                { value: "All",                label: "All Industries" },
                ...industries.map(industry => ({ value: industry, label: industry })),
              ]}
            />
          </div>

          <div style={{ minWidth: 140 }}>
            <CustomDropdown
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as CustomerStatus | "All")}
              options={[
                { value: "All",      label: "All Statuses" },
                { value: "Prospect", label: "Prospect" },
                { value: "Active",   label: "Active" },
                { value: "Inactive", label: "Inactive" },
              ]}
            />
          </div>

          <div style={{ minWidth: 140 }}>
            <CustomDropdown
              value={ownerFilter}
              onChange={(v) => setOwnerFilter(v)}
              options={[
                { value: "All", label: "All Owners" },
                ...users.map(u => ({ value: u.id, label: u.name })),
              ]}
            />
          </div>
        </div>

        {/* Table — overflow-visible so row action dropdowns aren't clipped */}
        <div
          className="border-[1.5px] border-[var(--neuron-ui-border)] rounded-2xl bg-[var(--theme-bg-surface)]"
          style={{ overflow: "visible" }}
        >
          {/* Header */}
          <div className="grid grid-cols-[40px_minmax(200px,1fr)_minmax(120px,140px)_110px_80px_130px_40px] gap-3 px-6 py-3 border-b border-[var(--neuron-ui-divider)] bg-[var(--neuron-bg-page)] rounded-t-2xl overflow-hidden sticky top-0 z-10">
            <div />
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--neuron-ink-muted)]">Company</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--neuron-ink-muted)]">Industry</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--neuron-ink-muted)]">Status</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--neuron-ink-muted)]">Contacts</div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--neuron-ink-muted)]">Last Activity</div>
            <div />
          </div>

          {/* Body */}
          <div className="divide-y divide-[var(--neuron-ui-divider)]">
            {isLoading ? (
              <div className="py-16 text-center text-[13px] text-[var(--neuron-ink-muted)]">
                Loading customers…
              </div>
            ) : customers.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3 text-center">
                <Building2 size={32} className="text-[var(--neuron-ink-muted)] opacity-40" />
                <div>
                  <p className="text-[14px] font-medium text-[var(--neuron-ink-primary)]">
                    {searchQuery || industryFilter !== "All" || statusFilter !== "All" || ownerFilter !== "All"
                      ? "No customers match your filters"
                      : "No customers yet"}
                  </p>
                  <p className="text-[13px] text-[var(--neuron-ink-muted)] mt-0.5">
                    {searchQuery || industryFilter !== "All" || statusFilter !== "All" || ownerFilter !== "All"
                      ? "Try adjusting your search or filter criteria"
                      : "Add your first customer to get started"}
                  </p>
                </div>
                {!searchQuery && industryFilter === "All" && statusFilter === "All" && ownerFilter === "All" && (
                  <button
                    onClick={() => setIsAddCustomerOpen(true)}
                    className="mt-1 h-9 px-4 rounded-lg bg-[var(--theme-action-primary-bg)] text-white text-[13px] font-medium flex items-center gap-2 border-none cursor-pointer hover:opacity-90 transition-opacity"
                  >
                    <Plus size={14} /> Add Customer
                  </button>
                )}
              </div>
            ) : (
              customers.map((customer, idx) => {
                const name      = customer.name || customer.company_name || "";
                const initials  = getCompanyInitials(name);
                const logoColor = getCompanyLogoColor(name);
                const status    = getStatusColor(customer.status);
                const contacts  = getContactCount(customer.id);
                const lastAct   = getLastActivityDate(customer.id);
                const isLast    = idx === customers.length - 1;
                const isOpen    = openDropdownId === customer.id;
                const isConfirming = confirmDeleteId === customer.id;

                return (
                  <div
                    key={customer.id}
                    role="row"
                    tabIndex={0}
                    className={`grid grid-cols-[40px_minmax(200px,1fr)_minmax(120px,140px)_110px_80px_130px_40px] gap-3 px-6 py-4 items-center hover:bg-[var(--theme-bg-surface-subtle)] transition-colors cursor-pointer group focus:outline-none focus:bg-[var(--theme-bg-surface-subtle)] ${isLast ? "rounded-b-2xl" : ""}`}
                    onClick={() => { setSelectedCustomer(customer); setView("detail"); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedCustomer(customer); setView("detail"); }}}
                  >
                    {/* Monogram */}
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{
                        backgroundColor: `${logoColor}18`,
                        color: logoColor,
                        border: `1px solid ${logoColor}28`,
                      }}
                      aria-hidden="true"
                    >
                      {initials}
                    </div>

                    {/* Company */}
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-[var(--neuron-ink-primary)] truncate">{name}</div>
                      <div className="text-[11px] text-[var(--neuron-ink-muted)] truncate">{getOwnerName(customer.owner_id)}</div>
                    </div>

                    {/* Industry */}
                    <div className="text-[13px] text-[var(--neuron-ink-secondary)] truncate">{customer.industry || "—"}</div>

                    {/* Status */}
                    <div>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium"
                        style={{ backgroundColor: status.bg, color: status.fg }}
                      >
                        {customer.status}
                      </span>
                    </div>

                    {/* Contacts */}
                    <div className="flex items-center gap-1.5 text-[13px] text-[var(--neuron-ink-secondary)]">
                      <UsersIcon size={14} className="text-[var(--neuron-ink-muted)]" aria-hidden="true" />
                      {contacts}
                    </div>

                    {/* Last Activity */}
                    <div className="text-[12px] text-[var(--neuron-ink-muted)] truncate">
                      {lastAct ? formatDate(lastAct) : "No activity"}
                    </div>

                    {/* Row actions */}
                    <div
                      className="relative flex justify-end"
                      ref={isOpen ? dropdownRef : undefined}
                    >
                      <button
                        aria-label="Customer actions"
                        aria-haspopup="menu"
                        aria-expanded={isOpen}
                        className="p-1 rounded-md text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] hover:bg-[var(--neuron-ui-border)] opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdownId(isOpen ? null : customer.id);
                          setConfirmDeleteId(null);
                        }}
                      >
                        <MoreHorizontal size={16} />
                      </button>

                      {isOpen && (
                        <div
                          className="absolute right-0 top-full mt-1 w-52 bg-[var(--theme-bg-surface)] rounded-xl border border-[var(--neuron-ui-border)] py-1.5 z-30"
                          style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.10)" }}
                          onClick={(e) => e.stopPropagation()}
                          role="menu"
                        >
                          {isConfirming ? (
                            <div className="px-4 py-3">
                              <div className="flex items-start gap-2 mb-3">
                                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: "var(--theme-status-danger-fg)" }} />
                                <p className="text-[12px] text-[var(--neuron-ink-primary)] leading-snug">
                                  Delete <span className="font-semibold">{name}</span>? This cannot be undone.
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  className="flex-1 h-7 rounded-md text-[12px] font-medium border border-[var(--neuron-ui-border)] text-[var(--neuron-ink-secondary)] bg-transparent cursor-pointer hover:bg-[var(--theme-bg-page)] transition-colors"
                                  onClick={() => { setConfirmDeleteId(null); setOpenDropdownId(null); }}
                                >
                                  Cancel
                                </button>
                                <button
                                  className="flex-1 h-7 rounded-md text-[12px] font-semibold text-white cursor-pointer border-none transition-opacity hover:opacity-90"
                                  style={{ backgroundColor: "var(--theme-status-danger-fg)" }}
                                  onClick={() => handleDeleteCustomer(customer.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              role="menuitem"
                              className="w-full px-4 py-2 text-left text-[13px] flex items-center gap-2 transition-colors cursor-pointer"
                              style={{ color: "var(--theme-status-danger-fg)" }}
                              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--theme-status-danger-bg)")}
                              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                              onClick={() => setConfirmDeleteId(customer.id)}
                            >
                              <Trash2 size={14} />
                              Delete Customer
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <AddCustomerPanel
        isOpen={isAddCustomerOpen}
        onClose={() => setIsAddCustomerOpen(false)}
        onSave={handleSaveCustomer}
      />
    </div>
  );
}
