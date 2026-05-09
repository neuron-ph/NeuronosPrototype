import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  X,
  Check,
  Link2,
  Briefcase,
  Banknote,
  Package,
  ChevronDown,
  User,
  Users,
  Building,
  ShoppingCart,
  FileText,
  Handshake,
  Container,
  Palette,
  Truck,
  Ship,
} from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { useDataScope } from "../../hooks/useDataScope";
import { SidePanel } from "../common/SidePanel";

const PesoIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 11H4" />
    <path d="M20 7H4" />
    <path d="M7 21V4a1 1 0 0 1 1-1h4a1 1 0 0 1 0 12H7" />
  </svg>
);

export interface LinkedEntity {
  entity_type: string;
  entity_id: string;
  entity_label: string;
}

interface EntityDef {
  key: string;
  entityType: string;
  label: string;
  Icon: React.ElementType;
  table: string;
  columns: string;
  getLabel: (row: any) => string;
  getSublabel: (row: any) => string;
  searchColumn: string;
  extraFilters?: Record<string, string>;
}

interface NavSection {
  id: string;
  label: string;
  Icon: React.ElementType;
  ownerDepts: string[];
  entities: EntityDef[];
}

interface RecordBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onLink: (entities: LinkedEntity[]) => void;
  alreadyLinked?: string[];
}

const NAV: NavSection[] = [
  {
    id: "bd",
    label: "Business Development",
    Icon: Briefcase,
    ownerDepts: ["Business Development"],
    entities: [
      { key: "bd-contacts", entityType: "contact", label: "Contacts", Icon: User, table: "contacts", columns: "id, name, title, email", getLabel: (r) => r.name, getSublabel: (r) => r.title || r.email || "", searchColumn: "name" },
      { key: "bd-customers", entityType: "customer", label: "Customers", Icon: Building, table: "customers", columns: "id, name, industry, status", getLabel: (r) => r.name, getSublabel: (r) => r.industry || "", searchColumn: "name" },
      { key: "bd-inquiries", entityType: "quotation", label: "Inquiries", Icon: ShoppingCart, table: "quotations", columns: "id, quotation_name, quote_number, customer_name, status", getLabel: (r) => r.quote_number || r.quotation_name || "—", getSublabel: (r) => r.customer_name || "", searchColumn: "quote_number", extraFilters: { quotation_type: "spot" } },
      { key: "bd-projects", entityType: "project", label: "Projects", Icon: Briefcase, table: "projects", columns: "id, project_number, customer_name, status", getLabel: (r) => r.project_number || "—", getSublabel: (r) => r.customer_name || "", searchColumn: "project_number" },
      { key: "bd-contracts", entityType: "contract", label: "Contracts", Icon: Handshake, table: "quotations", columns: "id, quotation_name, quote_number, customer_name, status", getLabel: (r) => r.quote_number || r.quotation_name || "—", getSublabel: (r) => r.customer_name || "", searchColumn: "quote_number", extraFilters: { quotation_type: "contract" } },
    ],
  },
  {
    id: "pricing",
    label: "Pricing",
    Icon: Banknote,
    ownerDepts: ["Pricing"],
    entities: [
      { key: "pricing-contacts", entityType: "contact", label: "Contacts", Icon: User, table: "contacts", columns: "id, name, title, email", getLabel: (r) => r.name, getSublabel: (r) => r.title || r.email || "", searchColumn: "name" },
      { key: "pricing-customers", entityType: "customer", label: "Customers", Icon: Building, table: "customers", columns: "id, name, industry, status", getLabel: (r) => r.name, getSublabel: (r) => r.industry || "", searchColumn: "name" },
      { key: "pricing-quotations", entityType: "quotation", label: "Quotations", Icon: FileText, table: "quotations", columns: "id, quotation_name, quote_number, customer_name, status", getLabel: (r) => r.quote_number || r.quotation_name || "—", getSublabel: (r) => r.customer_name || "", searchColumn: "quote_number", extraFilters: { quotation_type: "spot" } },
      { key: "pricing-projects", entityType: "project", label: "Projects", Icon: Briefcase, table: "projects", columns: "id, project_number, customer_name, status", getLabel: (r) => r.project_number || "—", getSublabel: (r) => r.customer_name || "", searchColumn: "project_number" },
      { key: "pricing-contracts", entityType: "contract", label: "Contracts", Icon: Handshake, table: "quotations", columns: "id, quotation_name, quote_number, customer_name, status", getLabel: (r) => r.quote_number || r.quotation_name || "—", getSublabel: (r) => r.customer_name || "", searchColumn: "quote_number", extraFilters: { quotation_type: "contract" } },
    ],
  },
  {
    id: "ops",
    label: "Operations",
    Icon: Package,
    ownerDepts: ["Operations"],
    entities: [
      { key: "ops-forwarding", entityType: "booking", label: "Forwarding", Icon: Container, table: "bookings", columns: "id, booking_number, customer_name, status, service_type", getLabel: (r) => r.booking_number || "—", getSublabel: (r) => r.customer_name || "", searchColumn: "booking_number", extraFilters: { service_type: "Forwarding" } },
      { key: "ops-brokerage", entityType: "booking", label: "Brokerage", Icon: Palette, table: "bookings", columns: "id, booking_number, customer_name, status, service_type", getLabel: (r) => r.booking_number || "—", getSublabel: (r) => r.customer_name || "", searchColumn: "booking_number", extraFilters: { service_type: "Brokerage" } },
      { key: "ops-trucking", entityType: "booking", label: "Trucking", Icon: Truck, table: "bookings", columns: "id, booking_number, customer_name, status, service_type", getLabel: (r) => r.booking_number || "—", getSublabel: (r) => r.customer_name || "", searchColumn: "booking_number", extraFilters: { service_type: "Trucking" } },
      { key: "ops-marine-insurance", entityType: "booking", label: "Marine Insurance", Icon: Ship, table: "bookings", columns: "id, booking_number, customer_name, status, service_type", getLabel: (r) => r.booking_number || "—", getSublabel: (r) => r.customer_name || "", searchColumn: "booking_number", extraFilters: { service_type: "Marine Insurance" } },
      { key: "ops-others", entityType: "booking", label: "Others", Icon: FileText, table: "bookings", columns: "id, booking_number, customer_name, status, service_type", getLabel: (r) => r.booking_number || "—", getSublabel: (r) => r.customer_name || "", searchColumn: "booking_number", extraFilters: { service_type: "Others" } },
    ],
  },
  {
    id: "accounting",
    label: "Accounting",
    Icon: PesoIcon,
    ownerDepts: ["Accounting"],
    entities: [
      { key: "acct-projects", entityType: "project", label: "Projects", Icon: Briefcase, table: "projects", columns: "id, project_number, customer_name, status", getLabel: (r) => r.project_number || "—", getSublabel: (r) => r.customer_name || "", searchColumn: "project_number" },
      { key: "acct-contracts", entityType: "contract", label: "Contracts", Icon: Handshake, table: "quotations", columns: "id, quotation_name, quote_number, customer_name, status", getLabel: (r) => r.quote_number || r.quotation_name || "—", getSublabel: (r) => r.customer_name || "", searchColumn: "quote_number", extraFilters: { quotation_type: "contract" } },
      { key: "acct-bookings", entityType: "booking", label: "Bookings", Icon: Package, table: "bookings", columns: "id, booking_number, customer_name, status, service_type", getLabel: (r) => r.booking_number || "—", getSublabel: (r) => [r.customer_name, r.service_type].filter(Boolean).join(" - "), searchColumn: "booking_number" },
      { key: "acct-customers", entityType: "customer", label: "Customers", Icon: Users, table: "customers", columns: "id, name, industry, status", getLabel: (r) => r.name, getSublabel: (r) => r.industry || "", searchColumn: "name" },
    ],
  },
];

const DEPT_DEFAULT: Record<string, string> = {
  "Business Development": "bd",
  "Pricing": "pricing",
  "Operations": "ops",
  "Accounting": "accounting",
  "Executive": "bd",
};

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  active: { color: "var(--theme-status-success-fg)", bg: "var(--theme-status-success-bg)" },
  open: { color: "var(--neuron-semantic-info)", bg: "var(--neuron-semantic-info-bg)" },
  draft: { color: "var(--theme-text-muted)", bg: "var(--theme-bg-surface-subtle)" },
  sent: { color: "var(--theme-status-warning-fg)", bg: "var(--theme-status-warning-bg)" },
  approved: { color: "var(--neuron-status-accent-fg)", bg: "var(--neuron-status-accent-bg)" },
  posted: { color: "var(--theme-action-primary-bg)", bg: "var(--theme-bg-surface-tint)" },
  paid: { color: "var(--theme-status-success-fg)", bg: "var(--theme-status-success-bg)" },
  priced: { color: "var(--theme-action-primary-bg)", bg: "var(--theme-bg-surface-tint)" },
  completed: { color: "var(--theme-status-success-fg)", bg: "var(--theme-status-success-bg)" },
  confirmed: { color: "var(--neuron-semantic-info)", bg: "var(--neuron-semantic-info-bg)" },
  cancelled: { color: "var(--theme-status-danger-fg)", bg: "var(--theme-status-danger-bg)" },
  "in transit": { color: "var(--theme-status-warning-fg)", bg: "var(--theme-status-warning-bg)" },
};

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const colors = STATUS_COLORS[status.toLowerCase()] ?? { color: "var(--theme-text-muted)", bg: "var(--theme-bg-surface-subtle)" };
  return <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4, color: colors.color, backgroundColor: colors.bg, textTransform: "capitalize", flexShrink: 0 }}>{status}</span>;
}

function getVisibleSections(department: string | null | undefined, hasFullScope: boolean) {
  return NAV.filter((section) => hasFullScope || section.ownerDepts.includes(department ?? ""));
}

function getSearchPlaceholder(entity: EntityDef) {
  return `Search ${entity.label.toLowerCase()}…`;
}

function getNoResultsCopy(entity: EntityDef, query: string) {
  if (!query.trim()) return `No ${entity.label.toLowerCase()} found.`;
  return `No ${entity.label.toLowerCase()} match "${query.trim()}". Try a different keyword or reference number.`;
}

export function RecordBrowser({ isOpen, onClose, onLink, alreadyLinked = [] }: RecordBrowserProps) {
  const { effectiveDepartment } = useUser();
  const { scope } = useDataScope();
  const visibleSections = getVisibleSections(effectiveDepartment, scope.type === 'all');
  const initialSection = visibleSections.find((section) => section.id === DEPT_DEFAULT[effectiveDepartment ?? ""]) ?? visibleSections[0] ?? null;

  const [activeSectionId, setActiveSectionId] = useState<string | null>(initialSection?.id ?? null);
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(initialSection?.id ?? null);
  const [activeEntityKey, setActiveEntityKey] = useState<string | null>(initialSection?.entities[0]?.key ?? null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<LinkedEntity[]>([]);

  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const activeSection = visibleSections.find((section) => section.id === activeSectionId) ?? visibleSections[0] ?? null;
  const activeEntity = activeSection?.entities.find((entity) => entity.key === activeEntityKey) ?? activeSection?.entities[0] ?? null;

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 150);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const nextSection = visibleSections.find((section) => section.id === DEPT_DEFAULT[effectiveDepartment ?? ""]) ?? visibleSections[0] ?? null;
    setActiveSectionId(nextSection?.id ?? null);
    setExpandedSectionId(nextSection?.id ?? null);
    setActiveEntityKey(nextSection?.entities[0]?.key ?? null);
    setSearch("");
    setDebouncedSearch("");
    setSelected([]);
  }, [isOpen, effectiveDepartment]);

  useEffect(() => {
    if (!activeSection) {
      setActiveSectionId(null);
      setExpandedSectionId(null);
      setActiveEntityKey(null);
      return;
    }

    if (!activeEntity) {
      setActiveEntityKey(activeSection.entities[0]?.key ?? null);
    }
  }, [activeSection, activeEntity]);

  // Debounce search changes
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), search ? 250 : 0);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const { data: records = [], isFetching: isLoading } = useQuery({
    queryKey: ["entity_attachments", "record_browser", activeEntityKey, debouncedSearch],
    queryFn: async () => {
      if (!activeEntity) return [];
      let query = (supabase.from(activeEntity.table) as any)
        .select(activeEntity.columns)
        .order("created_at", { ascending: false })
        .limit(40);
      if (activeEntity.extraFilters) {
        for (const [key, value] of Object.entries(activeEntity.extraFilters)) {
          query = query.eq(key, value);
        }
      }
      if (debouncedSearch.trim()) {
        query = query.ilike(activeEntity.searchColumn, `%${debouncedSearch.trim()}%`);
      }
      const { data } = await query;
      return data ?? [];
    },
    staleTime: 0,
    enabled: !!activeEntity,
  });

  const switchSection = (sectionId: string) => {
    const section = visibleSections.find((item) => item.id === sectionId);
    if (!section) return;
    setExpandedSectionId(sectionId);
    setActiveSectionId(sectionId);
    setActiveEntityKey(section.entities[0]?.key ?? null);
    setSearch("");
    setDebouncedSearch("");
  };

  const switchEntity = (sectionId: string, entityKey: string) => {
    setExpandedSectionId(sectionId);
    setActiveSectionId(sectionId);
    setActiveEntityKey(entityKey);
    setSearch("");
    setDebouncedSearch("");
  };

  const toggleRecord = (row: any) => {
    if (!activeEntity) return;
    const id = row.id;
    const label = activeEntity.getLabel(row);
    const type = activeEntity.entityType;
    setSelected((prev) => {
      const exists = prev.find((item) => item.entity_id === id);
      if (exists) return prev.filter((item) => item.entity_id !== id);
      return [...prev, { entity_type: type, entity_id: id, entity_label: label }];
    });
  };

  const handleLink = () => {
    if (selected.length === 0) return;
    onLink(selected);
    setSelected([]);
  };

  const isSelected = (id: string) => selected.some((item) => item.entity_id === id);
  const isLinked = (id: string) => alreadyLinked.includes(id);

  const title = (
    <div className="flex items-center gap-2">
      <Link2 size={15} style={{ color: "var(--neuron-brand-green)" }} />
      <span style={{ fontSize: 15, fontWeight: 600, color: "var(--neuron-ink-primary)" }}>Link Record</span>
    </div>
  );

  const footer = (
    <div style={{ padding: "12px 16px", borderTop: "1px solid var(--neuron-ui-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 12, color: "var(--neuron-ink-muted)" }}>
        {selected.length > 0 ? `${selected.length} record${selected.length > 1 ? "s" : ""} selected` : "Select records to link"}
      </span>
      <button
        onClick={handleLink}
        disabled={selected.length === 0}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 16px",
          borderRadius: 8,
          border: "none",
          backgroundColor: selected.length > 0 ? "var(--neuron-brand-green)" : "var(--neuron-ui-border)",
          color: selected.length > 0 ? "#FFFFFF" : "var(--neuron-ink-muted)",
          fontSize: 12,
          fontWeight: 600,
          cursor: selected.length > 0 ? "pointer" : "not-allowed",
          transition: "color 120ms ease, border-color 120ms ease, background-color 120ms ease",
        }}
      >
        <Link2 size={12} />
        Link{selected.length > 1 ? ` ${selected.length}` : ""}
      </button>
    </div>
  );

  if (visibleSections.length === 0 || !activeSection || !activeEntity) {
    return (
      <SidePanel isOpen={isOpen} onClose={onClose} title={title} footer={footer} width="720px">
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <p style={{ fontSize: 13, color: "var(--neuron-ink-muted)", textAlign: "center" }}>No linkable modules are available for your department yet.</p>
        </div>
      </SidePanel>
    );
  }

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title={title} footer={footer} width="720px">
      <div className="ticketing-ui" style={{ display: "flex", height: "100%", overflow: "hidden" }}>
        <div style={{ width: 264, flexShrink: 0, borderRight: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-page)", overflowY: "auto", padding: "18px 16px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--neuron-ink-muted)", letterSpacing: "0.5px", padding: "0 12px 12px" }}>WORK</div>
          <div className="space-y-1">
            {visibleSections.map((section) => {
              const sectionExpanded = expandedSectionId === section.id;
              const sectionActive = activeSectionId === section.id;
              return (
                <div key={section.id} style={{ marginBottom: sectionExpanded ? "8px" : "0" }}>
                  <button
                    onClick={() => switchSection(section.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150"
                    style={{
                      height: "40px",
                      backgroundColor: sectionExpanded ? "var(--neuron-state-selected)" : "transparent",
                      border: sectionActive ? "1.5px solid var(--neuron-ui-active-border)" : "1.5px solid transparent",
                      color: sectionExpanded ? "var(--neuron-brand-green)" : "var(--neuron-ink-secondary)",
                      fontWeight: sectionExpanded ? 600 : 400,
                      justifyContent: "space-between",
                      boxShadow: sectionExpanded ? "var(--elevation-1)" : "none",
                    }}
                    onMouseEnter={(e) => { if (!sectionExpanded) e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)"; }}
                    onMouseLeave={(e) => { if (!sectionExpanded) e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <section.Icon size={20} style={{ color: sectionExpanded ? "var(--neuron-brand-green)" : "var(--neuron-ink-muted)", flexShrink: 0 }} />
                      <span style={{ fontSize: 14, lineHeight: "20px", whiteSpace: "nowrap" }}>{section.label}</span>
                    </div>
                    <ChevronDown size={16} style={{ color: "var(--neuron-ink-muted)", transform: sectionExpanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s", flexShrink: 0 }} />
                  </button>
                  <div style={{ maxHeight: sectionExpanded ? `${section.entities.length * 42}px` : "0px", opacity: sectionExpanded ? 1 : 0, overflow: "hidden", transition: "max-height 0.3s ease-in-out, opacity 0.25s ease-in-out" }}>
                    <div className="space-y-1 mt-1">
                      {section.entities.map((entity) => {
                        const childActive = entity.key === activeEntityKey;
                        return (
                          <button
                            key={entity.key}
                            onClick={() => switchEntity(section.id, entity.key)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150"
                            style={{
                              height: "36px",
                              backgroundColor: childActive ? "var(--neuron-state-selected)" : "transparent",
                              border: childActive ? "1.5px solid var(--neuron-ui-active-border)" : "1.5px solid transparent",
                              color: childActive ? "var(--neuron-brand-green)" : "var(--neuron-ink-secondary)",
                              fontWeight: childActive ? 600 : 400,
                              justifyContent: "flex-start",
                              paddingLeft: "28px",
                              boxShadow: childActive ? "var(--elevation-1)" : "none",
                            }}
                            onMouseEnter={(e) => { if (!childActive) e.currentTarget.style.backgroundColor = "var(--neuron-state-hover)"; }}
                            onMouseLeave={(e) => { if (!childActive) e.currentTarget.style.backgroundColor = "transparent"; }}
                          >
                            <entity.Icon size={18} style={{ color: childActive ? "var(--neuron-brand-green)" : "var(--neuron-ink-muted)", flexShrink: 0 }} />
                            <span style={{ fontSize: 14, lineHeight: "20px", whiteSpace: "nowrap" }}>{entity.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, backgroundColor: "var(--neuron-bg-elevated)" }}>
          <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--neuron-ui-divider)", flexShrink: 0 }}>
            <div style={{ paddingBottom: 8 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--neuron-ink-muted)" }}>
                {activeSection.label}
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 600, color: "var(--neuron-ink-primary)" }}>
                {activeEntity.label}
              </p>
            </div>
            <div
              style={{ display: "flex", alignItems: "center", gap: 8, backgroundColor: "var(--theme-bg-page)", borderRadius: 10, padding: "10px 12px", border: "1px solid var(--neuron-ui-border)", transition: "border-color 150ms ease" }}
              onFocusCapture={(e) => { e.currentTarget.style.borderColor = "var(--neuron-brand-green)"; }}
              onBlurCapture={(e) => { e.currentTarget.style.borderColor = "var(--neuron-ui-border)"; }}
            >
              <Search size={14} style={{ color: "var(--neuron-ink-muted)", flexShrink: 0 }} />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={getSearchPlaceholder(activeEntity)}
                style={{ border: "none", outline: "none", fontSize: 13, color: "var(--neuron-ink-primary)", backgroundColor: "transparent", flex: 1 }}
              />
              {search && (
                <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--neuron-ink-muted)", display: "flex", padding: 0 }}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {isLoading && (
              <div style={{ padding: "12px 16px" }}>
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} style={{ padding: "10px 0", display: "flex", gap: 10, alignItems: "center", borderBottom: "1px solid #F6F8F7" }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: "var(--theme-bg-surface-subtle)", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 12, backgroundColor: "var(--theme-bg-surface-subtle)", borderRadius: 4, marginBottom: 6, width: `${55 + item * 9}%` }} />
                      <div style={{ height: 10, backgroundColor: "var(--theme-bg-page)", borderRadius: 4, width: "42%" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isLoading && records.length === 0 && (
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <p style={{ fontSize: 12, color: "var(--neuron-ink-muted)", lineHeight: 1.5 }}>{getNoResultsCopy(activeEntity, search)}</p>
              </div>
            )}

            {!isLoading && records.map((row) => {
              const id = row.id;
              const label = activeEntity.getLabel(row);
              const sublabel = activeEntity.getSublabel(row);
              const linked = isLinked(id);
              const rowSelected = isSelected(id);

              return (
                <button
                  key={id}
                  onClick={() => !linked && toggleRecord(row)}
                  disabled={linked}
                  className="w-full text-left"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", border: "none", borderBottom: "1px solid var(--theme-bg-page)", backgroundColor: rowSelected ? "var(--theme-bg-surface-tint)" : "transparent", cursor: linked ? "default" : "pointer", width: "100%", textAlign: "left", transition: "background-color 120ms ease" }}
                  onMouseEnter={(e) => { if (!linked && !rowSelected) e.currentTarget.style.backgroundColor = "var(--theme-bg-page)"; }}
                  onMouseLeave={(e) => { if (!linked && !rowSelected) e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      flexShrink: 0,
                      border: `1.5px solid ${linked ? "var(--neuron-ui-muted)" : rowSelected ? "var(--neuron-brand-green)" : "var(--neuron-ui-muted)"}`,
                      backgroundColor: linked ? "var(--neuron-pill-inactive-bg)" : rowSelected ? "var(--neuron-brand-green)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "color 120ms ease, border-color 120ms ease, background-color 120ms ease",
                    }}
                  >
                    {(rowSelected || linked) && <Check size={10} style={{ color: linked ? "var(--theme-text-muted)" : "#FFFFFF" }} strokeWidth={2.5} />}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, margin: 0, color: linked ? "var(--theme-text-muted)" : "var(--neuron-ink-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {label}
                    </p>
                    {sublabel && (
                      <p style={{ fontSize: 11, color: "var(--neuron-ink-muted)", margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {sublabel}
                      </p>
                    )}
                  </div>

                  {linked
                    ? <span style={{ fontSize: 10, color: "var(--neuron-ink-muted)", flexShrink: 0 }}>Linked</span>
                    : <StatusBadge status={row.status} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </SidePanel>
  );
}
