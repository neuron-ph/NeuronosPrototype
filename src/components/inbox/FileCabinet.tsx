import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, TrendingUp, Package, ReceiptText, Users, Check, Link2 } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { SidePanel } from "../common/SidePanel";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EntityDef {
  entityType: string;
  label: string;
  table: string;
  columns: string;
  getLabel: (row: any) => string;
  getSublabel: (row: any) => string;
  searchColumn: string;
  extraFilter?: Record<string, string>;
}

interface PendingEntity {
  entity_type: string;
  entity_id: string;
  entity_label: string;
}

interface FileCabinetProps {
  isOpen: boolean;
  onLink: (entities: PendingEntity[]) => void;
  onClose: () => void;
  alreadyLinked: string[]; // entity_ids already attached
}

// ── Drawer config — mirrors sidebar module groupings ──────────────────────────

const DRAWERS = [
  {
    id: "sales",
    label: "Sales",
    Icon: TrendingUp,
    ownerDepts: ["Business Development", "Pricing"],
    entities: [
      {
        entityType: "quotation",
        label: "Quotations",
        table: "quotations",
        columns: "id, quotation_number, customer_name, status",
        getLabel: (r: any) => r.quotation_number || r.id?.slice(0, 8),
        getSublabel: (r: any) => r.customer_name || "",
        searchColumn: "quotation_number",
        extraFilter: { quotation_type: "spot" },
      },
      {
        entityType: "contract",
        label: "Contracts",
        table: "quotations",
        columns: "id, quotation_number, customer_name, status",
        getLabel: (r: any) => r.quotation_number || r.id?.slice(0, 8),
        getSublabel: (r: any) => r.customer_name || "",
        searchColumn: "quotation_number",
        extraFilter: { quotation_type: "contract" },
      },
    ] as EntityDef[],
  },
  {
    id: "operations",
    label: "Operations",
    Icon: Package,
    ownerDepts: ["Operations"],
    entities: [
      {
        entityType: "booking",
        label: "Bookings",
        table: "bookings",
        columns: "id, booking_number, customer_name, status, service_type",
        getLabel: (r: any) => r.booking_number || r.id?.slice(0, 8),
        getSublabel: (r: any) => [r.customer_name, r.service_type].filter(Boolean).join(" · "),
        searchColumn: "booking_number",
      },
      {
        entityType: "project",
        label: "Projects",
        table: "projects",
        columns: "id, project_number, customer_name, status",
        getLabel: (r: any) => r.project_number || r.id?.slice(0, 8),
        getSublabel: (r: any) => r.customer_name || "",
        searchColumn: "project_number",
      },
    ] as EntityDef[],
  },
  {
    id: "finance",
    label: "Finance",
    Icon: ReceiptText,
    ownerDepts: ["Accounting"],
    entities: [
      {
        entityType: "invoice",
        label: "Invoices",
        table: "invoices",
        columns: "id, invoice_number, customer_name, status",
        getLabel: (r: any) => r.invoice_number || r.id?.slice(0, 8),
        getSublabel: (r: any) => r.customer_name || "",
        searchColumn: "invoice_number",
      },
      {
        entityType: "collection",
        label: "Collections",
        table: "collections",
        columns: "id, collection_number, customer_name, status",
        getLabel: (r: any) => r.collection_number || r.id?.slice(0, 8),
        getSublabel: (r: any) => r.customer_name || "",
        searchColumn: "collection_number",
      },
      {
        entityType: "expense",
        label: "Expenses",
        table: "evouchers",
        columns: "id, evoucher_number, customer_name, status",
        getLabel: (r: any) => r.evoucher_number || r.id?.slice(0, 8),
        getSublabel: (r: any) => r.customer_name || "",
        searchColumn: "evoucher_number",
      },
    ] as EntityDef[],
  },
  {
    id: "people",
    label: "People",
    Icon: Users,
    ownerDepts: [] as string[], // everyone can browse
    entities: [
      {
        entityType: "customer",
        label: "Customers",
        table: "customers",
        columns: "id, name, industry, status",
        getLabel: (r: any) => r.name || r.id?.slice(0, 8),
        getSublabel: (r: any) => r.industry || "",
        searchColumn: "name",
      },
      {
        entityType: "contact",
        label: "Contacts",
        table: "contacts",
        columns: "id, name, title, email",
        getLabel: (r: any) => r.name || r.id?.slice(0, 8),
        getSublabel: (r: any) => r.title || r.email || "",
        searchColumn: "name",
      },
    ] as EntityDef[],
  },
];

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const colorMap: Record<string, { color: string; bg: string }> = {
    active:    { color: "var(--theme-status-success-fg)", bg: "var(--theme-status-success-bg)" },
    open:      { color: "var(--neuron-semantic-info)", bg: "var(--neuron-semantic-info-bg)" },
    draft:     { color: "var(--theme-text-muted)", bg: "var(--theme-bg-surface-subtle)" },
    sent:      { color: "var(--theme-status-warning-fg)", bg: "var(--theme-status-warning-bg)" },
    approved:  { color: "var(--neuron-status-accent-fg)", bg: "var(--neuron-status-accent-bg)" },
    posted:    { color: "var(--theme-action-primary-bg)", bg: "var(--theme-bg-surface-tint)" },
    paid:      { color: "var(--theme-status-success-fg)", bg: "var(--theme-status-success-bg)" },
    cancelled: { color: "var(--theme-status-danger-fg)", bg: "var(--theme-status-danger-bg)" },
  };
  const s = status.toLowerCase();
  const c = colorMap[s] ?? { color: "var(--theme-text-muted)", bg: "var(--theme-bg-surface-subtle)" };
  return (
    <span style={{ fontSize: 10, fontWeight: 600, color: c.color, backgroundColor: c.bg, padding: "1px 6px", borderRadius: 4, textTransform: "capitalize", flexShrink: 0 }}>
      {status}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FileCabinet({ isOpen, onLink, onClose, alreadyLinked }: FileCabinetProps) {
  const { effectiveDepartment, effectiveRole } = useUser();
  const [activeDrawerId, setActiveDrawerId] = useState(DRAWERS[0].id);
  const [activeEntityType, setActiveEntityType] = useState(DRAWERS[0].entities[0].entityType);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<PendingEntity[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const activeDrawer = DRAWERS.find((d) => d.id === activeDrawerId)!;
  const activeEntity = activeDrawer.entities.find((e) => e.entityType === activeEntityType)
    ?? activeDrawer.entities[0];

  // Is the user an owner of this drawer (can browse, not just search)?
  const isOwned =
    effectiveDepartment === "Executive" ||
    activeDrawer.ownerDepts.length === 0 ||
    activeDrawer.ownerDepts.includes(effectiveDepartment ?? "");

  // Debounce the search for the query key
  useEffect(() => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setDebouncedSearch(search), search ? 250 : 0);
    return () => clearTimeout(searchTimeout.current);
  }, [search]);

  // Focus search on open
  useEffect(() => { searchRef.current?.focus(); }, []);

  const { data: records = [], isFetching: isLoading } = useQuery({
    queryKey: ["entity_attachments", "file_cabinet", activeEntityType, debouncedSearch, isOwned],
    queryFn: async () => {
      if (!isOwned && !debouncedSearch.trim()) return [];
      let query = (supabase.from(activeEntity.table) as any)
        .select(activeEntity.columns)
        .order("created_at", { ascending: false })
        .limit(40);
      if (activeEntity.extraFilter) {
        for (const [k, v] of Object.entries(activeEntity.extraFilter)) {
          query = query.eq(k, v);
        }
      }
      if (debouncedSearch.trim()) {
        query = query.ilike(activeEntity.searchColumn, `%${debouncedSearch.trim()}%`);
      }
      const { data } = await query;
      return data ?? [];
    },
    staleTime: 0,
    enabled: isOwned || debouncedSearch.trim().length > 0,
  });

  // When drawer changes, reset entity to first in drawer
  const switchDrawer = (drawerId: string) => {
    const drawer = DRAWERS.find((d) => d.id === drawerId)!;
    setActiveDrawerId(drawerId);
    setActiveEntityType(drawer.entities[0].entityType);
    setSearch("");
    setDebouncedSearch("");
  };

  const toggleRecord = (row: any) => {
    const label = activeEntity.getLabel(row);
    const id = row.id;
    const type = activeEntity.entityType;
    setSelected((prev) => {
      const exists = prev.find((s) => s.entity_id === id);
      if (exists) return prev.filter((s) => s.entity_id !== id);
      return [...prev, { entity_type: type, entity_id: id, entity_label: label }];
    });
  };

  const handleLink = () => {
    if (selected.length === 0) return;
    onLink(selected);
    setSelected([]);
  };

  const isSelected = (id: string) => selected.some((s) => s.entity_id === id);
  const isLinked = (id: string) => alreadyLinked.includes(id);

  const title = (
    <div className="flex items-center gap-2">
      <Link2 size={15} style={{ color: "var(--theme-action-primary-bg)" }} />
      <span style={{ fontSize: 15, fontWeight: 600, color: "var(--theme-text-primary)" }}>Link Record</span>
    </div>
  );

  const footer = (
    <div style={{ padding: "12px 16px", borderTop: "1px solid var(--theme-border-default)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 12, color: "var(--theme-text-muted)" }}>
        {selected.length > 0 ? `${selected.length} selected` : "Select records to link"}
      </span>
      <button
        onClick={handleLink}
        disabled={selected.length === 0}
        className="flex items-center gap-1.5"
        style={{
          padding: "6px 14px", borderRadius: 6, border: "none",
          backgroundColor: selected.length > 0 ? "var(--theme-action-primary-bg)" : "var(--theme-border-default)",
          color: selected.length > 0 ? "#FFFFFF" : "var(--theme-text-muted)",
          fontSize: 12, fontWeight: 600,
          cursor: selected.length > 0 ? "pointer" : "not-allowed",
          transition: "color 120ms ease, border-color 120ms ease, background-color 120ms ease",
        }}
      >
        <Link2 size={12} />
        Link{selected.length > 0 ? ` ${selected.length}` : ""}
      </button>
    </div>
  );

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title={title} footer={footer} size="sm">
      {/* Body — drawer nav + content */}
      <div className="flex h-full overflow-hidden">
        {/* ── Drawer nav (left) ── */}
        <div style={{ width: 120, borderRight: "1px solid var(--theme-border-default)", flexShrink: 0, overflowY: "auto", paddingTop: 8, paddingBottom: 8 }}>
          {DRAWERS.map((drawer) => {
            const isActive = drawer.id === activeDrawerId;
            return (
              <button
                key={drawer.id}
                onClick={() => switchDrawer(drawer.id)}
                className="w-full flex items-center gap-2"
                style={{
                  padding: "9px 14px",
                  border: "none",
                  backgroundColor: isActive ? "var(--theme-bg-surface-tint)" : "transparent",
                  color: isActive ? "var(--theme-action-primary-bg)" : "var(--theme-text-muted)",
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  cursor: "pointer",
                  transition: "color 120ms ease, border-color 120ms ease, background-color 120ms ease",
                  borderRight: isActive ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "var(--theme-bg-page)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <drawer.Icon size={14} style={{ flexShrink: 0 }} />
                {drawer.label}
              </button>
            );
          })}
        </div>

        {/* ── Content (right) ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Entity sub-tabs */}
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--theme-border-subtle)", display: "flex", gap: 4, flexShrink: 0 }}>
            {activeDrawer.entities.map((ent) => {
              const isActive = ent.entityType === activeEntityType;
              return (
                <button
                  key={ent.entityType}
                  onClick={() => { setActiveEntityType(ent.entityType); setSearch(""); setDebouncedSearch(""); }}
                  style={{
                    padding: "3px 10px",
                    borderRadius: 6,
                    border: "none",
                    backgroundColor: isActive ? "var(--theme-text-primary)" : "transparent",
                    color: isActive ? "#FFFFFF" : "var(--theme-text-muted)",
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    cursor: "pointer",
                    transition: "color 120ms ease, border-color 120ms ease, background-color 120ms ease",
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  {ent.label}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--theme-border-subtle)", flexShrink: 0 }}>
            <div className="flex items-center gap-2" style={{ backgroundColor: "var(--theme-bg-page)", borderRadius: 7, padding: "6px 10px", border: "1px solid var(--theme-border-default)" }}>
              <Search size={13} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isOwned ? `Search ${activeEntity.label.toLowerCase()}…` : `Search by reference number…`}
                style={{ border: "none", outline: "none", fontSize: 12, color: "var(--theme-text-primary)", backgroundColor: "transparent", flex: 1 }}
              />
              {search && (
                <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--theme-text-muted)", display: "flex", padding: 0 }}>
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Records list */}
          <div className="flex-1 overflow-y-auto">
            {/* Search-only hint for non-owners */}
            {!isOwned && !search && (
              <div style={{ padding: "32px 16px", textAlign: "center" }}>
                <Search size={24} style={{ color: "var(--theme-border-default)", margin: "0 auto 8px" }} />
                <p style={{ fontSize: 12, color: "var(--theme-text-muted)", lineHeight: 1.5 }}>
                  Enter a reference number or name to search {activeEntity.label.toLowerCase()}.
                </p>
              </div>
            )}

            {/* Loading */}
            {isLoading && (
              <div style={{ padding: "20px 12px" }}>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--neuron-pill-inactive-bg)" }}>
                    <div style={{ height: 12, backgroundColor: "var(--theme-bg-surface-subtle)", borderRadius: 4, marginBottom: 5, width: `${60 + i * 8}%` }} />
                    <div style={{ height: 10, backgroundColor: "var(--theme-bg-page)", borderRadius: 4, width: "40%" }} />
                  </div>
                ))}
              </div>
            )}

            {/* Empty */}
            {!isLoading && (isOwned || search) && records.length === 0 && (
              <div style={{ padding: "32px 16px", textAlign: "center" }}>
                <p style={{ fontSize: 12, color: "var(--theme-text-muted)" }}>No {activeEntity.label.toLowerCase()} found.</p>
              </div>
            )}

            {/* Records */}
            {!isLoading && records.map((row) => {
              const id = row.id;
              const label = activeEntity.getLabel(row);
              const sublabel = activeEntity.getSublabel(row);
              const linked = isLinked(id);
              const sel = isSelected(id);

              return (
                <button
                  key={id}
                  onClick={() => !linked && toggleRecord(row)}
                  disabled={linked}
                  className="w-full flex items-center gap-3 text-left"
                  style={{
                    padding: "9px 12px",
                    border: "none",
                    borderBottom: "1px solid var(--neuron-pill-inactive-bg)",
                    backgroundColor: sel ? "var(--theme-bg-surface-tint)" : "transparent",
                    cursor: linked ? "default" : "pointer",
                    transition: "background-color 80ms ease",
                  }}
                  onMouseEnter={(e) => { if (!linked && !sel) e.currentTarget.style.backgroundColor = "var(--theme-bg-page)"; }}
                  onMouseLeave={(e) => { if (!sel) e.currentTarget.style.backgroundColor = "transparent"; else e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)"; }}
                >
                  {/* Checkbox */}
                  <div style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                    border: `1.5px solid ${linked ? "var(--neuron-ui-muted)" : sel ? "var(--theme-action-primary-bg)" : "var(--neuron-ui-muted)"}`,
                    backgroundColor: linked ? "var(--neuron-pill-inactive-bg)" : sel ? "var(--theme-action-primary-bg)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "color 120ms ease, border-color 120ms ease, background-color 120ms ease",
                  }}>
                    {(sel || linked) && <Check size={10} style={{ color: linked ? "var(--theme-text-muted)" : "#FFFFFF" }} strokeWidth={2.5} />}
                  </div>

                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: linked ? "var(--theme-text-muted)" : "var(--theme-text-primary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {label}
                    </p>
                    {sublabel && (
                      <p style={{ fontSize: 11, color: "var(--theme-text-muted)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {sublabel}
                      </p>
                    )}
                  </div>

                  {/* Status or linked indicator */}
                  {linked
                    ? <span style={{ fontSize: 10, color: "var(--theme-text-muted)", flexShrink: 0 }}>Linked</span>
                    : row.status && <StatusBadge status={row.status} />
                  }
                </button>
              );
            })}
          </div>

        </div>
      </div>
    </SidePanel>
  );
}
