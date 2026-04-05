import { useState, useEffect, useRef, useCallback } from "react";
import { Activity, Download, ArrowRight, Circle, Search, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useUser } from "../hooks/useUser";
import { supabase } from "../utils/supabase/client";
import { useNavigate } from "react-router";
import { CustomDropdown } from "./bd/CustomDropdown";
import { NeuronRefreshButton } from "./shared/NeuronRefreshButton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActivityEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  action_type: string;
  user_id: string;
  user_name: string;
  user_department: string;
  old_value: string | null;
  new_value: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ─── Lookup tables ─────────────────────────────────────────────────────────────

const ENTITY_DOT: Record<string, string> = {
  booking:        "#6366F1",
  quotation:      "#3B82F6",
  contract:       "#7C3AED",
  project:        "#0F766E",
  evoucher:       "#E87A3D",
  invoice:        "#16A34A",
  collection:     "#059669",
  billing:        "#65A30D",
  expense:        "#DC2626",
  contact:        "#DB2777",
  customer:       "#E11D48",
  task:           "#CA8A04",
  ticket:         "#D97706",
  user:           "#475569",
  team:           "#6B7280",
  journal_entry:  "#0891B2",
  budget_request: "#9333EA",
};

const ENTITY_LABEL: Record<string, string> = {
  booking:        "Booking",
  quotation:      "Quotation",
  contract:       "Contract",
  project:        "Project",
  evoucher:       "E-Voucher",
  invoice:        "Invoice",
  collection:     "Collection",
  billing:        "Billing",
  expense:        "Expense",
  contact:        "Contact",
  customer:       "Customer",
  task:           "Task",
  ticket:         "Ticket",
  user:           "User",
  team:           "Team",
  journal_entry:  "Journal",
  budget_request: "Budget Req.",
};

const ACTION_COLOR: Record<string, string> = {
  created:       "#16A34A",
  updated:       "#2563EB",
  deleted:       "#DC2626",
  status_change: "#D97706",
  approved:      "#059669",
  rejected:      "#DC2626",
  posted:        "#0F766E",
  cancelled:     "#6B7280",
  converted:     "#7C3AED",
  assigned:      "#6366F1",
  login:         "#475569",
  logout:        "#475569",
  deactivated:   "#DC2626",
};

const ACTION_LABEL: Record<string, string> = {
  created:       "Created",
  updated:       "Updated",
  deleted:       "Deleted",
  status_change: "Status changed",
  approved:      "Approved",
  rejected:      "Rejected",
  posted:        "Posted to GL",
  cancelled:     "Cancelled",
  converted:     "Converted",
  assigned:      "Assigned",
  login:         "Logged in",
  logout:        "Logged out",
  deactivated:   "Deactivated",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d === 1) return "Yesterday";
  return `${d}d ago`;
}

function fullTimestamp(ts: string): string {
  return new Date(ts).toLocaleString([], {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function navPath(entityType: string): string {
  switch (entityType) {
    case "booking":       return "/operations";
    case "quotation":
    case "contract":      return "/pricing/quotations";
    case "project":       return "/bd/projects";
    case "evoucher":
    case "invoice":
    case "collection":
    case "billing":
    case "expense":
    case "journal_entry": return "/accounting/evouchers";
    case "ticket":        return "/inbox";
    case "contact":       return "/bd/contacts";
    case "customer":      return "/bd/customers";
    case "task":          return "/bd/tasks";
    case "user":
    case "team":          return "/admin/users";
    default:              return "/";
  }
}

// ─── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div
      className="grid items-center px-4 py-3 border-b"
      style={{ gridTemplateColumns: "24px 120px 168px 204px 160px 1fr", borderColor: "var(--neuron-ui-border)" }}
    >
      <div />
      {[80, 120, 150, 200, 100].map((w, i) => (
        <div
          key={i}
          style={{
            height: 12, width: w, borderRadius: 4,
            backgroundColor: "var(--theme-bg-surface-subtle)",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      ))}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ActivityLogPage() {
  const { effectiveRole, effectiveDepartment } = useUser();
  const navigate = useNavigate();

  const isExecutive = effectiveDepartment === "Executive";
  const isManager   = effectiveRole === "manager" || effectiveRole === "director";
  const hasAccess   = isExecutive || isManager;

  // ── Filters ────────────────────────────────────────────────────────────────
  const [entityFilter, setEntityFilter]   = useState("all");
  const [actionFilter, setActionFilter]   = useState("all");
  const [deptFilter,   setDeptFilter]     = useState(isExecutive ? "all" : (effectiveDepartment ?? "all"));
  const [userFilter,   setUserFilter]     = useState("all");
  const [dateFrom,     setDateFrom]       = useState(() => new Date().toISOString().split("T")[0]);
  const [dateTo,       setDateTo]         = useState(() => new Date().toISOString().split("T")[0]);
  const [search,       setSearch]         = useState("");
  const [usersInDept,  setUsersInDept]    = useState<Array<{ id: string; name: string }>>([]);

  // ── Expansion ──────────────────────────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Data ───────────────────────────────────────────────────────────────────
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [total,      setTotal]      = useState(0);
  const [isLoading,  setIsLoading]  = useState(true);
  const [pendingNew, setPendingNew] = useState(0);
  const [isLive,     setIsLive]     = useState(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Users dropdown by dept ──────────────────────────────────────────────────
  useEffect(() => {
    const dept = !isExecutive ? effectiveDepartment : deptFilter !== "all" ? deptFilter : null;
    if (!dept) { setUsersInDept([]); return; }
    supabase
      .from("users")
      .select("id, name")
      .eq("department", dept)
      .then(({ data }) => setUsersInDept(data ?? []));
  }, [deptFilter, isExecutive, effectiveDepartment]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const loadActivities = useCallback(async () => {
    setIsLoading(true);
    try {
      let q = supabase
        .from("activity_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(100);

      if (entityFilter !== "all")                q = q.eq("entity_type", entityFilter);
      if (actionFilter !== "all")                q = q.eq("action_type", actionFilter);
      if (!isExecutive)                          q = q.eq("user_department", effectiveDepartment ?? "");
      else if (deptFilter !== "all")             q = q.eq("user_department", deptFilter);
      if (userFilter !== "all")                  q = q.eq("user_id", userFilter);
      if (dateFrom)                              q = q.gte("created_at", dateFrom);
      if (dateTo)                                q = q.lte("created_at", dateTo + "T23:59:59");

      const { data, count } = await q;
      if (data) {
        setActivities(data);
        setTotal(count ?? data.length);
        setPendingNew(0);
      }
    } finally {
      setIsLoading(false);
    }
  }, [entityFilter, actionFilter, deptFilter, userFilter, dateFrom, dateTo, isExecutive, effectiveDepartment]);

  // ── Realtime + initial load ─────────────────────────────────────────────────
  useEffect(() => {
    if (!hasAccess) return;

    loadActivities();

    const ch = supabase
      .channel("activity_log_monitor")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log" }, () => {
        setPendingNew(n => n + 1);
      })
      .subscribe(status => setIsLive(status === "SUBSCRIBED"));

    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess]);

  useEffect(() => {
    if (hasAccess) loadActivities();
  }, [entityFilter, actionFilter, deptFilter, userFilter, dateFrom, dateTo, loadActivities, hasAccess]);

  // ── CSV export ─────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = displayed.map(a => [
      new Date(a.created_at).toLocaleString(),
      a.user_name, a.user_department,
      ENTITY_LABEL[a.entity_type] ?? a.entity_type,
      a.entity_name,
      ACTION_LABEL[a.action_type] ?? a.action_type,
      a.old_value ?? "", a.new_value ?? "",
    ]);
    const csv = [
      ["Timestamp","User","Dept","Entity Type","Entity","Action","Old Value","New Value"],
      ...rows,
    ].map(r => r.map(c => `"${c}"`).join(",")).join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a   = document.createElement("a");
    a.href = url;
    a.download = `activity-monitor-${dateFrom}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Filtered list ──────────────────────────────────────────────────────────
  const displayed = search
    ? activities.filter(a =>
        [a.entity_name, a.user_name, a.action_type, a.user_department, a.entity_type]
          .some(v => v?.toLowerCase().includes(search.toLowerCase()))
      )
    : activities;

  // ── Access guard ───────────────────────────────────────────────────────────
  if (!hasAccess) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: "var(--theme-bg-page)" }}>
        <div style={{ maxWidth: 360, textAlign: "center" }}>
          <Activity size={36} style={{ color: "var(--neuron-ui-border)", margin: "0 auto 12px" }} />
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: 6 }}>
            Access restricted
          </h2>
          <p style={{ fontSize: 13, color: "var(--theme-text-muted)", lineHeight: 1.6 }}>
            The Activity Monitor is available to managers and executives only.
          </p>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: "var(--theme-bg-page)" }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-12 pt-8 pb-6 bg-[var(--theme-bg-surface)] border-b border-[var(--neuron-ui-border)]">
        <div className="flex items-start justify-between">
          <div>
            <h1 style={{
              fontSize: 32, fontWeight: 600,
              color: "var(--theme-text-primary)",
              letterSpacing: "-1.2px",
              marginBottom: 4,
            }}>
              Activity Monitor
            </h1>
            <p style={{ fontSize: 14, color: "var(--theme-text-muted)" }}>
              {isExecutive
                ? "Real-time system-wide audit trail across all departments."
                : `Real-time audit trail for ${effectiveDepartment}.`}
            </p>
          </div>

          {/* Live indicator + actions */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Circle
                size={7}
                fill={isLive ? "#16A34A" : "#D1D5DB"}
                stroke="none"
                style={{ flexShrink: 0 }}
              />
              <span style={{ fontSize: 12, color: isLive ? "#16A34A" : "var(--theme-text-muted)", fontWeight: 500 }}>
                {isLive ? "Live" : "Connecting"}
              </span>
            </div>

            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors"
              style={{
                border: "1px solid var(--neuron-ui-border)",
                backgroundColor: "var(--theme-bg-surface)",
                color: "var(--theme-text-muted)",
                fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--theme-text-primary)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--theme-text-muted)")}
            >
              <Download size={13} />
              Export
            </button>

            <NeuronRefreshButton
              onRefresh={loadActivities}
              label="Refresh activity log"
            />
          </div>
        </div>
      </div>

      {/* ── Filter strip ────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-12 py-2.5 border-b bg-[var(--theme-bg-surface)]"
        style={{ borderColor: "var(--neuron-ui-border)", flexWrap: "wrap" }}
      >
        {/* Entity filter */}
        <div style={{ minWidth: 148 }}>
          <CustomDropdown
            label=""
            value={entityFilter}
            onChange={setEntityFilter}
            options={[
              { value: "all",            label: "All entity types" },
              { value: "booking",        label: "Booking" },
              { value: "quotation",      label: "Quotation" },
              { value: "contract",       label: "Contract" },
              { value: "project",        label: "Project" },
              { value: "evoucher",       label: "E-Voucher" },
              { value: "invoice",        label: "Invoice" },
              { value: "collection",     label: "Collection" },
              { value: "billing",        label: "Billing" },
              { value: "expense",        label: "Expense" },
              { value: "journal_entry",  label: "Journal Entry" },
              { value: "contact",        label: "Contact" },
              { value: "customer",       label: "Customer" },
              { value: "task",           label: "Task" },
              { value: "ticket",         label: "Ticket" },
              { value: "budget_request", label: "Budget Request" },
              { value: "user",           label: "User" },
              { value: "team",           label: "Team" },
            ]}
          />
        </div>

        {/* Action filter */}
        <div style={{ minWidth: 140 }}>
          <CustomDropdown
            label=""
            value={actionFilter}
            onChange={setActionFilter}
            options={[
              { value: "all",           label: "All actions" },
              { value: "created",       label: "Created" },
              { value: "updated",       label: "Updated" },
              { value: "deleted",       label: "Deleted" },
              { value: "status_change", label: "Status changed" },
              { value: "approved",      label: "Approved" },
              { value: "rejected",      label: "Rejected" },
              { value: "posted",        label: "Posted to GL" },
              { value: "cancelled",     label: "Cancelled" },
              { value: "converted",     label: "Converted" },
              { value: "assigned",      label: "Assigned" },
              { value: "login",         label: "Login" },
              { value: "logout",        label: "Logout" },
            ]}
          />
        </div>

        {/* Department (executive only) */}
        {isExecutive && (
          <div style={{ minWidth: 148 }}>
            <CustomDropdown
              label=""
              value={deptFilter}
              onChange={v => { setDeptFilter(v); setUserFilter("all"); }}
              options={[
                { value: "all",                 label: "All departments" },
                { value: "Executive",            label: "Executive" },
                { value: "Business Development", label: "Business Dev." },
                { value: "Pricing",              label: "Pricing" },
                { value: "Operations",           label: "Operations" },
                { value: "Accounting",           label: "Accounting" },
                { value: "HR",                   label: "HR" },
              ]}
            />
          </div>
        )}

        {/* User filter (when dept is selected) */}
        {usersInDept.length > 0 && (
          <div style={{ minWidth: 140 }}>
            <CustomDropdown
              label=""
              value={userFilter}
              onChange={setUserFilter}
              options={[
                { value: "all", label: "All users" },
                ...usersInDept.map(u => ({ value: u.id, label: u.name })),
              ]}
            />
          </div>
        )}

        {/* Divider */}
        <div style={{ width: 1, height: 20, backgroundColor: "var(--neuron-ui-border)", margin: "0 4px" }} />

        {/* Date range */}
        <input
          type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{
            padding: "5px 8px", borderRadius: 7, fontSize: 13,
            border: "1px solid var(--neuron-ui-border)",
            color: "var(--theme-text-primary)", backgroundColor: "transparent", cursor: "pointer",
          }}
        />
        <span style={{ fontSize: 12, color: "var(--theme-text-muted)" }}>–</span>
        <input
          type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{
            padding: "5px 8px", borderRadius: 7, fontSize: 13,
            border: "1px solid var(--neuron-ui-border)",
            color: "var(--theme-text-primary)", backgroundColor: "transparent", cursor: "pointer",
          }}
        />

        {/* Divider */}
        <div style={{ width: 1, height: 20, backgroundColor: "var(--neuron-ui-border)", margin: "0 4px" }} />

        {/* Search */}
        <div className="flex items-center gap-2 flex-1" style={{
          border: "1px solid var(--neuron-ui-border)",
          borderRadius: 7, padding: "5px 10px",
          backgroundColor: "transparent", minWidth: 180,
        }}>
          <Search size={13} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search entity, user, action…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              border: "none", outline: "none", fontSize: 13,
              color: "var(--theme-text-primary)", backgroundColor: "transparent", width: "100%",
            }}
          />
        </div>
      </div>

      {/* ── New events banner ─────────────────────────────────────────────────── */}
      {pendingNew > 0 && (
        <button
          onClick={loadActivities}
          style={{
            width: "100%", padding: "8px 48px",
            backgroundColor: "var(--theme-bg-surface-tint)",
            color: "var(--theme-action-primary-bg)",
            fontSize: 13, fontWeight: 500, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 8,
            border: "none", borderBottom: "1px solid var(--neuron-ui-border)",
          }}
        >
          <Circle size={6} fill="var(--theme-action-primary-bg)" stroke="none" />
          {pendingNew} new {pendingNew === 1 ? "event" : "events"} — click to load
        </button>
      )}

      {/* ── Table container ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-12 py-6" style={{ backgroundColor: "var(--theme-bg-surface)" }}>
        <div style={{
          border: "1px solid var(--neuron-ui-border)",
          borderRadius: 10,
          backgroundColor: "var(--theme-bg-surface)",
          overflow: "hidden",
        }}>

          {/* Column headers */}
          <div
            className="grid items-center px-4 py-2.5 border-b"
            style={{
              gridTemplateColumns: "24px 120px 168px 204px 160px 1fr",
              borderColor: "var(--neuron-ui-border)",
              backgroundColor: "var(--theme-bg-page)",
            }}
          >
            {/* Chevron placeholder */}
            <div />
            {["Time", "User", "Entity", "Action", "Change"].map(col => (
              <span
                key={col}
                style={{
                  fontSize: 11, fontWeight: 600,
                  color: "var(--theme-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                }}
              >
                {col}
              </span>
            ))}
          </div>

          {/* Skeleton loading */}
          {isLoading && Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)}

          {/* Empty state */}
          {!isLoading && displayed.length === 0 && (
            <div style={{ padding: "72px 48px", textAlign: "center" }}>
              <Activity size={32} style={{ color: "var(--neuron-ui-border)", margin: "0 auto 10px" }} />
              <p style={{ fontSize: 14, fontWeight: 500, color: "var(--theme-text-primary)", marginBottom: 4 }}>
                No events found
              </p>
              <p style={{ fontSize: 13, color: "var(--theme-text-muted)" }}>
                {search ? "Clear the search or adjust your filters." : "No activity has been logged for this period yet."}
              </p>
            </div>
          )}

          {/* Rows */}
          {!isLoading && displayed.map((entry, idx) => {
            const dotColor    = ENTITY_DOT[entry.entity_type]   ?? "#9CA3AF";
            const entityLabel = ENTITY_LABEL[entry.entity_type] ?? entry.entity_type;
            const actionLabel = ACTION_LABEL[entry.action_type] ?? entry.action_type.replace(/_/g, " ");
            const actionColor = ACTION_COLOR[entry.action_type] ?? "var(--theme-text-muted)";
            const isLast      = idx === displayed.length - 1;
            const userInitials = initials(entry.user_name);
            const metaDesc    = entry.metadata && typeof entry.metadata.description === "string"
              ? entry.metadata.description
              : null;
            const isExpanded  = expandedId === entry.id;

            // Extra metadata keys (exclude 'description')
            const extraMeta = entry.metadata
              ? Object.entries(entry.metadata).filter(([k]) => k !== "description")
              : [];

            return (
              <div key={entry.id}>
                {/* Row */}
                <div
                  className="grid items-center px-4 py-2.5 transition-colors cursor-pointer"
                  style={{
                    gridTemplateColumns: "24px 120px 168px 204px 160px 1fr",
                    borderBottom: isLast && !isExpanded ? "none" : `1px solid var(--neuron-ui-border)`,
                    backgroundColor: isExpanded ? "var(--theme-bg-page)" : "var(--theme-bg-surface)",
                    borderLeft: isExpanded ? "2px solid var(--theme-action-primary-bg)" : "2px solid transparent",
                  }}
                  onClick={() => setExpandedId(prev => prev === entry.id ? null : entry.id)}
                  onMouseEnter={e => {
                    if (!isExpanded) e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                  }}
                  onMouseLeave={e => {
                    if (!isExpanded) e.currentTarget.style.backgroundColor = "var(--theme-bg-surface)";
                  }}
                >
                  {/* Chevron */}
                  <div className="flex items-center justify-center">
                    <motion.div
                      animate={{ rotate: isExpanded ? 90 : 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <ChevronRight size={14} style={{ color: "var(--theme-text-muted)" }} />
                    </motion.div>
                  </div>

                  {/* Time */}
                  <div className="flex flex-col gap-0.5">
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--theme-text-primary)" }}>
                      {relativeTime(entry.created_at)}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
                      {new Date(entry.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  {/* User */}
                  <div className="flex items-center gap-2">
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%",
                      backgroundColor: "var(--theme-bg-surface-tint)",
                      border: "1px solid var(--neuron-ui-border)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 700, color: "var(--theme-action-primary-bg)",
                      flexShrink: 0, letterSpacing: "0.02em",
                    }}>
                      {userInitials}
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span style={{
                        fontSize: 13, fontWeight: 500, color: "var(--theme-text-primary)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {entry.user_name}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
                        {entry.user_department}
                      </span>
                    </div>
                  </div>

                  {/* Entity */}
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Circle size={7} fill={dotColor} stroke="none" style={{ flexShrink: 0 }} />
                      <span style={{
                        fontSize: 12, fontWeight: 600,
                        color: "var(--theme-text-muted)",
                        textTransform: "uppercase", letterSpacing: "0.05em",
                      }}>
                        {entityLabel}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 12, color: "var(--theme-text-muted)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      paddingLeft: 14,
                    }}>
                      {entry.entity_name || entry.entity_id}
                    </span>
                  </div>

                  {/* Action */}
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span style={{ fontSize: 13, fontWeight: 500, color: actionColor }}>
                      {actionLabel}
                    </span>
                    {metaDesc && (
                      <span style={{
                        fontSize: 11, color: "var(--theme-text-muted)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {metaDesc}
                      </span>
                    )}
                  </div>

                  {/* Change: old → new */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    {entry.old_value && (
                      <>
                        <span style={{
                          fontSize: 11, padding: "1px 6px", borderRadius: 4,
                          backgroundColor: "#FEF2F2", color: "#B91C1C",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          maxWidth: 70, flexShrink: 0,
                        }}>
                          {entry.old_value}
                        </span>
                        <ArrowRight size={10} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} />
                      </>
                    )}
                    {entry.new_value && (
                      <span style={{
                        fontSize: 11, padding: "1px 6px", borderRadius: 4,
                        backgroundColor: "#F0FDF4", color: "#15803D",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        maxWidth: 70, flexShrink: 0,
                      }}>
                        {entry.new_value}
                      </span>
                    )}
                  </div>
                </div>

                {/* Inline expanded detail panel */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      key={`detail-${entry.id}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: "easeInOut" }}
                      style={{
                        overflow: "hidden",
                        borderBottom: isLast ? "none" : `1px solid var(--neuron-ui-border)`,
                        borderLeft: "2px solid var(--theme-action-primary-bg)",
                      }}
                    >
                      <div style={{ padding: "16px 20px 16px 28px", backgroundColor: "var(--theme-bg-page)" }}>

                        {/* Top divider line */}
                        <div style={{ borderTop: "1px solid var(--neuron-ui-border)", marginBottom: 14 }} />

                        {/* Metadata grid — 4 columns */}
                        <div className="grid grid-cols-4 gap-6" style={{ marginBottom: 14 }}>

                          {/* Timestamp */}
                          <div className="flex flex-col gap-1">
                            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              Timestamp
                            </span>
                            <span style={{ fontSize: 12, color: "var(--theme-text-primary)", fontWeight: 500 }}>
                              {fullTimestamp(entry.created_at)}
                            </span>
                          </div>

                          {/* Actor */}
                          <div className="flex flex-col gap-1">
                            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              Actor
                            </span>
                            <div className="flex items-center gap-1.5">
                              <div style={{
                                width: 20, height: 20, borderRadius: "50%",
                                backgroundColor: "var(--theme-bg-surface-tint)",
                                border: "1px solid var(--neuron-ui-border)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 8, fontWeight: 700, color: "var(--theme-action-primary-bg)",
                                flexShrink: 0,
                              }}>
                                {userInitials}
                              </div>
                              <div className="flex flex-col">
                                <span style={{ fontSize: 12, color: "var(--theme-text-primary)", fontWeight: 500, lineHeight: 1.3 }}>
                                  {entry.user_name}
                                </span>
                                <span style={{ fontSize: 11, color: "var(--theme-text-muted)", lineHeight: 1.3 }}>
                                  {entry.user_department}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Entity */}
                          <div className="flex flex-col gap-1">
                            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              Entity
                            </span>
                            <div className="flex items-center gap-1.5">
                              <Circle size={7} fill={dotColor} stroke="none" style={{ flexShrink: 0 }} />
                              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                {entityLabel}
                              </span>
                            </div>
                            <span style={{ fontSize: 12, color: "var(--theme-text-primary)", fontWeight: 500, paddingLeft: 14 }}>
                              {entry.entity_name || entry.entity_id}
                            </span>
                          </div>

                          {/* Action */}
                          <div className="flex flex-col gap-1">
                            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              Action
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: actionColor }}>
                              {actionLabel}
                            </span>
                            {metaDesc && (
                              <span style={{ fontSize: 12, color: "var(--theme-text-muted)" }}>
                                {metaDesc}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Change diff — full width, no truncation */}
                        {(entry.old_value || entry.new_value) && (
                          <div className="flex items-center gap-2" style={{ marginBottom: extraMeta.length > 0 ? 12 : 14 }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", minWidth: 60 }}>
                              Change
                            </span>
                            <div className="flex items-center gap-2 flex-wrap">
                              {entry.old_value && (
                                <>
                                  <span style={{
                                    fontSize: 12, padding: "2px 8px", borderRadius: 4,
                                    backgroundColor: "#FEF2F2", color: "#B91C1C", fontWeight: 500,
                                  }}>
                                    {entry.old_value}
                                  </span>
                                  <ArrowRight size={12} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} />
                                </>
                              )}
                              {entry.new_value && (
                                <span style={{
                                  fontSize: 12, padding: "2px 8px", borderRadius: 4,
                                  backgroundColor: "#F0FDF4", color: "#15803D", fontWeight: 500,
                                }}>
                                  {entry.new_value}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Extra metadata key/value pairs */}
                        {extraMeta.length > 0 && (
                          <div className="flex items-start gap-2" style={{ marginBottom: 14 }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", minWidth: 60, paddingTop: 1 }}>
                              Meta
                            </span>
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                              {extraMeta.map(([k, v]) => (
                                <span key={k} style={{ fontSize: 11, color: "var(--theme-text-muted)", fontFamily: "monospace" }}>
                                  <span style={{ color: "var(--theme-text-primary)", fontWeight: 600 }}>{k}</span>: {String(v)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Footer: view entity link */}
                        <div className="flex justify-end">
                          <button
                            onClick={e => { e.stopPropagation(); navigate(navPath(entry.entity_type)); }}
                            style={{
                              fontSize: 12, fontWeight: 500, color: "var(--theme-action-primary-bg)",
                              background: "none", border: "none", cursor: "pointer",
                              padding: 0, display: "flex", alignItems: "center", gap: 3,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                            onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                          >
                            View {entityLabel}
                            <ChevronRight size={12} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          {/* Footer count */}
          {!isLoading && displayed.length > 0 && (
            <div className="px-4 py-4" style={{ borderTop: "1px solid var(--neuron-ui-border)" }}>
              <span style={{ fontSize: 12, color: "var(--theme-text-muted)" }}>
                Showing {displayed.length.toLocaleString()} of {total.toLocaleString()} events
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
