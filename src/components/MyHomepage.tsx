import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "../hooks/useUser";
import { supabase } from "../utils/supabase/client";
import {
  fetchMyWork, fetchDeptQueue,
  type TicketItem, type EVoucherItem, type BookingItem, type QuotationItem,
} from "../lib/dashboardFetchers";
import { getRecents, trackRecent, type RecentItem, type RecentType } from "../lib/recents";
import {
  ArrowRight, Plus, Check, X,
  Clock, Inbox,
  User, Building2, FileText, FileQuestion, Truck, MessageSquare, Receipt, FolderOpen,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
// TicketItem, EVoucherItem, BookingItem, QuotationItem imported from dashboardFetchers

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  created_at: string;
  done_at: string | null;
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  if (h >= 17 && h < 21) return "Good evening";
  return "Welcome back";
}

function pesos(n: number): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);
}

function bookingRoute(serviceType: string): string {
  const map: Record<string, string> = {
    Forwarding: "/operations/forwarding",
    Brokerage: "/operations/brokerage",
    Trucking: "/operations/trucking",
    "Marine Insurance": "/operations/marine-insurance",
    Others: "/operations/others",
  };
  return map[serviceType] ?? "/operations";
}

// ─── Recently viewed ──────────────────────────────────────────────────────────
// trackRecent / getRecents / RecentItem imported from ../lib/recents

function recentTypeIcon(type: RecentType) {
  const cls = "w-4 h-4";
  if (type === "contact")   return <User          className={cls} />;
  if (type === "customer")  return <Building2     className={cls} />;
  if (type === "inquiry")   return <FileQuestion  className={cls} />;
  if (type === "quotation") return <FileText      className={cls} />;
  if (type === "booking")   return <Truck         className={cls} />;
  if (type === "ticket")    return <MessageSquare className={cls} />;
  if (type === "evoucher")  return <Receipt       className={cls} />;
  if (type === "project")   return <FolderOpen    className={cls} />;
  return <FileText className={cls} />;
}

const RECENT_TYPE_COLOR: Record<RecentType, string> = {
  booking:   "#0F766E", // teal — Operations
  quotation: "#2563EB", // blue — Pricing
  inquiry:   "#7C3AED", // violet — BD inquiry
  ticket:    "#D97706", // amber — Inbox
  evoucher:  "#EA580C", // orange — Accounting
  project:   "#059669", // emerald — Projects
  contact:   "#0891B2", // cyan — BD contact
  customer:  "#16A34A", // green — BD customer
};

const RECENT_TYPE_LABEL: Record<RecentType, string> = {
  booking:   "Booking",
  quotation: "Quotation",
  inquiry:   "Inquiry",
  ticket:    "Ticket",
  evoucher:  "E-Voucher",
  project:   "Project",
  contact:   "Contact",
  customer:  "Customer",
};

// ─── Atoms ────────────────────────────────────────────────────────────────────

function SectionLabel({
  label,
  count,
  onViewAll,
}: {
  label: string;
  count?: number;
  onViewAll?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-2.5">
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--neuron-ink-muted)" }}
        >
          {label}
        </span>
        {count !== undefined && (
          <span
            className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-semibold rounded-full leading-none"
            style={{
              background: count > 0 ? "var(--neuron-semantic-success-bg)" : "var(--theme-bg-surface-subtle)",
              color: count > 0 ? "var(--neuron-semantic-success)" : "var(--neuron-ink-muted)",
              border: `1px solid ${count > 0 ? "var(--neuron-semantic-success-border)" : "var(--neuron-ui-border)"}`,
            }}
          >
            {count}
          </span>
        )}
      </div>
      {onViewAll && (
        <button
          onClick={onViewAll}
          className="flex items-center gap-0.5 text-[11px] font-medium transition-colors"
          style={{ color: "var(--neuron-brand-green)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--neuron-brand-green-600)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--neuron-brand-green)")}
        >
          All <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function EmptyRow({ message, icon }: { message: string; icon?: React.ReactNode }) {
  return (
    <div className="px-4 py-5 flex flex-col items-center gap-2 text-center">
      {icon && <div style={{ color: "var(--neuron-ui-muted)" }}>{icon}</div>}
      <p className="text-[12px]" style={{ color: "var(--neuron-ink-muted)" }}>{message}</p>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="px-4 py-3 flex items-center gap-3 animate-pulse">
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "var(--neuron-ui-border)" }} />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 rounded w-3/4" style={{ background: "var(--neuron-ui-border)" }} />
        <div className="h-2.5 rounded w-1/2" style={{ background: "var(--theme-bg-surface-tint)" }} />
      </div>
      <div className="h-2.5 rounded w-7" style={{ background: "var(--theme-bg-surface-tint)" }} />
    </div>
  );
}

function StatusDot({ color }: { color: "green" | "amber" | "red" | "blue" | "muted" }) {
  const bg: Record<string, string> = {
    green: "var(--neuron-brand-green)",
    amber: "var(--neuron-semantic-warn)",
    red:   "var(--neuron-semantic-danger)",
    blue:  "var(--neuron-semantic-info)",
    muted: "var(--neuron-ui-muted)",
  };
  return (
    <span
      className="w-2 h-2 rounded-full flex-shrink-0 mt-[3px]"
      style={{ background: bg[color] }}
      aria-hidden
    />
  );
}

function ItemRow({
  dotColor,
  label,
  sub,
  meta,
  onClick,
}: {
  dotColor: "green" | "amber" | "red" | "blue" | "muted";
  label: string;
  sub?: string;
  meta?: string;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="px-4 py-2.5 flex items-start gap-3 cursor-pointer transition-colors"
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--neuron-state-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      <StatusDot color={dotColor} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium leading-snug truncate" style={{ color: "var(--neuron-ink-primary)" }}>
          {label}
        </p>
        {sub && (
          <p className="text-[11.5px] truncate mt-[2px]" style={{ color: "var(--neuron-ink-muted)" }}>{sub}</p>
        )}
      </div>
      {meta && (
        <span className="text-[11px] flex-shrink-0 ml-2 pt-0.5" style={{ color: "var(--neuron-ink-muted)" }}>
          {meta}
        </span>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: "1px solid var(--neuron-ui-divider)" }} />;
}

// ─── Panel shell ──────────────────────────────────────────────────────────────

function Panel({
  children,
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-[var(--neuron-radius-l)] overflow-hidden ${className}`}
      style={{
        background: "var(--neuron-bg-elevated)",
        border: "1px solid var(--neuron-ui-border)",
        boxShadow: "var(--elevation-1)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function PanelHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div
      className="px-4 py-3 flex items-center justify-between"
      style={{ borderBottom: "1px solid var(--neuron-ui-border)" }}
    >
      <h2 className="text-[13px] font-semibold tracking-tight" style={{ color: "var(--neuron-ink-primary)" }}>
        {title}
      </h2>
      {action}
    </div>
  );
}

// ─── Greeting Panel ───────────────────────────────────────────────────────────

const MOTIVATIONAL_MESSAGES = {
  morning: [
    "Let's start the day strong.",
    "Fresh day, fresh chance to move things forward.",
    "Let's get an early win today.",
    "A strong start changes everything.",
    "Let's build momentum.",
  ],
  afternoon: [
    "Let's finish the day stronger than we started.",
    "Still time to make today productive.",
    "Let's get a few more wins in.",
    "The day's not over — let's make it count.",
    "You've got this!",
  ],
  evening: [
    "Let's wrap up the day.",
    "One last solid push for the day.",
    "Let's wrap up with progress.",
    "Finish strong — even small progress counts.",
    "Let's close the day well.",
    "A little more progress before we call it.",
  ],
};

function getMessagePool(): string[] {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return MOTIVATIONAL_MESSAGES.morning;
  if (h >= 12 && h < 18) return MOTIVATIONAL_MESSAGES.afternoon;
  return MOTIVATIONAL_MESSAGES.evening;
}

function GreetingPanel({
  firstName,
  dept,
  role,
  attentionCount,
  loading,
}: {
  firstName: string;
  dept: string;
  role: string;
  attentionCount: number;
  loading: boolean;
}) {
  const [msgIndex] = useState(() => {
    const pool = getMessagePool();
    return Math.floor(Math.random() * pool.length);
  });

  const deptRoleLabel = [dept, role ? role.charAt(0).toUpperCase() + role.slice(1) : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <Panel>
      {/* Teal accent strip */}
      <div className="h-1 w-full" style={{ background: "var(--neuron-brand-green)" }} />
      <div className="px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] mb-1" style={{ color: "var(--neuron-ink-muted)" }}>
              {getMessagePool()[msgIndex]}
            </p>
            <h1 className="text-[26px] font-semibold tracking-tight leading-tight" style={{ color: "var(--neuron-ink-primary)" }}>
              {getGreeting()}, {firstName}.
            </h1>
          </div>
          {deptRoleLabel && (
            <span
              className="text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap mt-1 flex-shrink-0"
              style={{
                background: "var(--neuron-brand-green-100)",
                color: "var(--neuron-brand-green)",
                border: "1px solid var(--theme-border-strong)",
              }}
            >
              {deptRoleLabel}
            </span>
          )}
        </div>

        <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--neuron-ui-divider)" }}>
          {loading ? (
            <div className="h-4 rounded w-48 animate-pulse" style={{ background: "var(--neuron-ui-border)" }} />
          ) : attentionCount > 0 ? (
            <p className="text-[13px]" style={{ color: "var(--neuron-ink-muted)" }}>
              You have{" "}
              <span className="font-semibold" style={{ color: "var(--neuron-brand-green)" }}>
                {attentionCount} item{attentionCount !== 1 ? "s" : ""}
              </span>{" "}
              waiting for your attention.
            </p>
          ) : (
            <p className="text-[13px]" style={{ color: "var(--neuron-ink-muted)" }}>
              You're all caught up — great work.
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}

// ─── Todo Panel ───────────────────────────────────────────────────────────────

function TodoPanel({ userId }: { userId: string }) {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("todos")
      .select("id, text, done, created_at, done_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setTodos((data ?? []) as TodoItem[]);
        setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    if (showInput) inputRef.current?.focus();
  }, [showInput]);

  async function addTodo() {
    const text = inputValue.trim();
    if (!text || adding) return;
    setAdding(true);
    const optimistic: TodoItem = {
      id: `tmp-${Date.now()}`,
      text,
      done: false,
      created_at: new Date().toISOString(),
      done_at: null,
    };
    setTodos((prev) => [optimistic, ...prev]);
    setInputValue("");
    setShowInput(false);
    const { data } = await supabase
      .from("todos")
      .insert({ user_id: userId, text })
      .select("id, text, done, created_at, done_at")
      .single();
    if (data) {
      setTodos((prev) => prev.map((t) => (t.id === optimistic.id ? (data as TodoItem) : t)));
    }
    setAdding(false);
  }

  async function toggleTodo(id: string, done: boolean) {
    setTodos((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, done: !done, done_at: !done ? new Date().toISOString() : null } : t
      )
    );
    await supabase
      .from("todos")
      .update({ done: !done, done_at: !done ? new Date().toISOString() : null })
      .eq("id", id);
  }

  async function deleteTodo(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await supabase.from("todos").delete().eq("id", id);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") addTodo();
    if (e.key === "Escape") { setShowInput(false); setInputValue(""); }
  }

  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  return (
    <Panel className="flex flex-col h-full" style={{ minHeight: 0 }}>
      <PanelHeader
        title="My Tasks"
        action={
          <button
            onClick={() => setShowInput((v) => !v)}
            className="w-6 h-6 rounded-md flex items-center justify-center transition-colors"
            style={{ color: "var(--neuron-brand-green)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--neuron-brand-green-100)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            title="Add task"
          >
            <Plus className="w-4 h-4" />
          </button>
        }
      />

      {/* Add input */}
      {showInput && (
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--neuron-ui-divider)" }}>
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Add a task and press Enter…"
            className="w-full text-[13px] bg-transparent outline-none"
            style={{ color: "var(--neuron-ink-primary)" }}
          />
          <p className="text-[10.5px] mt-1" style={{ color: "var(--neuron-ink-muted)" }}>
            Enter to save · Esc to cancel
          </p>
        </div>
      )}

      <div className="overflow-y-auto flex-1" style={{ minHeight: 0 }}>
        {loading ? (
          <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
        ) : open.length === 0 && done.length === 0 ? (
          <EmptyRow
            message="No tasks yet. Hit + to add your first one."
            icon={<Clock className="w-5 h-5" />}
          />
        ) : (
          <>
            {open.map((todo) => (
              <TodoRow
                key={todo.id}
                todo={todo}
                onToggle={toggleTodo}
                onDelete={deleteTodo}
              />
            ))}

            {done.length > 0 && (
              <>
                {open.length > 0 && <Divider />}
                <div className="px-4 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--neuron-ui-muted)" }}>
                    Completed · {done.length}
                  </span>
                </div>
                {done.map((todo) => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    onToggle={toggleTodo}
                    onDelete={deleteTodo}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

function TodoRow({
  todo,
  onToggle,
  onDelete,
}: {
  todo: TodoItem;
  onToggle: (id: string, done: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="px-4 py-2.5 flex items-start gap-3 group transition-colors"
      style={{ background: hovered ? "var(--neuron-state-hover)" : "" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(todo.id, todo.done)}
        className="w-4 h-4 mt-[1px] rounded flex-shrink-0 border flex items-center justify-center transition-all"
        style={{
          background: todo.done ? "var(--neuron-brand-green)" : "transparent",
          borderColor: todo.done ? "var(--neuron-brand-green)" : "var(--neuron-ui-muted)",
        }}
      >
        {todo.done && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
      </button>

      <p
        className="flex-1 text-[13px] leading-snug min-w-0"
        style={{
          color: todo.done ? "var(--neuron-ink-muted)" : "var(--neuron-ink-primary)",
          textDecoration: todo.done ? "line-through" : "none",
          opacity: todo.done ? 0.6 : 1,
        }}
      >
        {todo.text}
      </p>

      {hovered && (
        <button
          onClick={() => onDelete(todo.id)}
          className="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded transition-colors"
          style={{ color: "var(--neuron-ink-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--neuron-semantic-danger)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--neuron-ink-muted)")}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ─── Dept Quick Counts ────────────────────────────────────────────────────────

function DeptQuickCounts({
  dept,
  openInquiries,
  awaitingClient,
  pricingRequests,
  pricingInProgress,
  activeBookings,
  acctTickets,
  pendingEVs,
  execCounts,
  loading,
  onNavigate,
}: {
  dept: string;
  openInquiries: number;
  awaitingClient: number;
  pricingRequests: number;
  pricingInProgress: number;
  activeBookings: number;
  acctTickets: number;
  pendingEVs: number;
  execCounts: { openInquiries: number; inProgressQuotations: number; activeBookings: number; openTickets: number; pendingEVs: number };
  loading: boolean;
  onNavigate: (path: string) => void;
}) {
  type StatEntry = { label: string; value: number; path: string; highlight?: boolean };
  let stats: StatEntry[] = [];

  if (dept === "Business Development") {
    stats = [
      { label: "Open Inquiries",  value: openInquiries, path: "/bd/inquiries",  highlight: openInquiries > 0 },
      { label: "Awaiting Client", value: awaitingClient, path: "/bd/inquiries" },
    ];
  } else if (dept === "Pricing") {
    stats = [
      { label: "New Requests",  value: pricingRequests,   path: "/pricing/quotations", highlight: pricingRequests > 0 },
      { label: "In Progress",   value: pricingInProgress, path: "/pricing/quotations" },
    ];
  } else if (dept === "Operations") {
    stats = [
      { label: "Active Bookings", value: activeBookings, path: "/operations", highlight: activeBookings > 0 },
    ];
  } else if (dept === "Accounting") {
    stats = [
      { label: "Pending Tickets",    value: acctTickets, path: "/inbox",                highlight: acctTickets > 0 },
      { label: "Pending E-Vouchers", value: pendingEVs,  path: "/accounting/evouchers", highlight: pendingEVs > 0 },
    ];
  } else if (dept === "Executive") {
    stats = [
      { label: "Open Inquiries",       value: execCounts.openInquiries,        path: "/bd/inquiries" },
      { label: "Quotations in Progress", value: execCounts.inProgressQuotations, path: "/pricing/quotations" },
      { label: "Active Bookings",      value: execCounts.activeBookings,       path: "/operations" },
      { label: "Open Tickets",         value: execCounts.openTickets,          path: "/inbox", highlight: execCounts.openTickets > 0 },
      { label: "Pending E-Vouchers",   value: execCounts.pendingEVs,           path: "/accounting/evouchers", highlight: execCounts.pendingEVs > 0 },
    ];
  }

  return (
    <Panel>
      <PanelHeader title="Department" />
      {loading ? (
        <div className="p-4 space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse flex items-center justify-between py-2">
              <div className="h-3 rounded w-28" style={{ background: "var(--neuron-ui-border)" }} />
              <div className="h-6 rounded w-8"  style={{ background: "var(--neuron-ui-border)" }} />
            </div>
          ))}
        </div>
      ) : stats.length === 0 ? (
        <EmptyRow message="No stats configured." />
      ) : (
        <div className="p-2">
          {stats.map((s) => (
            <button
              key={s.label}
              onClick={() => onNavigate(s.path)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-left"
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--neuron-state-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <span className="text-[12.5px]" style={{ color: "var(--neuron-ink-muted)" }}>
                {s.label}
              </span>
              <span
                className="text-[22px] font-semibold tabular-nums leading-none"
                style={{ color: s.highlight && s.value > 0 ? "var(--neuron-brand-green)" : "var(--neuron-ink-primary)" }}
              >
                {s.value}
              </span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ─── Jump Back In ─────────────────────────────────────────────────────────────

function JumpBackIn({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [recents, setRecents] = useState<RecentItem[]>([]);
  useEffect(() => { setRecents(getRecents()); }, []);

  return (
    <Panel>
      <PanelHeader title="Continue Work" />
      {recents.length === 0 ? (
        <EmptyRow
          message="Items you open will appear here."
          icon={<Clock className="w-5 h-5" />}
        />
      ) : (
        <div className="py-1">
          {recents.map((r, i) => (
            <div
              key={i}
              onClick={() => onNavigate(r.path)}
              className="px-5 py-2 flex items-center gap-3 cursor-pointer transition-colors"
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--neuron-state-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              {/* Icon */}
              <span className="flex-shrink-0" style={{ color: RECENT_TYPE_COLOR[r.type] }}>
                {recentTypeIcon(r.type)}
              </span>

              {/* Name + type */}
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-medium truncate leading-tight" style={{ color: "var(--neuron-ink-primary)" }}>
                  {r.label}
                </p>
                <p className="text-[11px] leading-tight mt-0.5" style={{ color: "var(--neuron-ink-muted)" }}>
                  {RECENT_TYPE_LABEL[r.type]}
                </p>
              </div>

              {/* Right meta */}
              <div className="flex-shrink-0 text-right">
                <p className="text-[11px] leading-tight" style={{ color: "var(--neuron-ink-muted)" }}>
                  {r.sub.split(" · ")[0]}
                </p>
                <p className="text-[10.5px] leading-tight mt-0.5 tabular-nums" style={{ color: "var(--neuron-ui-muted)" }}>
                  {timeAgo(r.time)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ─── My Work Panel ────────────────────────────────────────────────────────────

function MyWorkPanel({
  tickets,
  approvals,
  loading,
  onTicket,
  onEVoucher,
  onViewInbox,
  onViewEVouchers,
}: {
  tickets: TicketItem[];
  approvals: EVoucherItem[];
  loading: boolean;
  onTicket: (id: string) => void;
  onEVoucher: () => void;
  onViewInbox: () => void;
  onViewEVouchers: () => void;
}) {
  function ticketDotColor(type: string, priority: string): "red" | "amber" | "green" {
    if (priority === "urgent") return "red";
    if (type === "approval")   return "amber";
    return "green";
  }

  return (
    <Panel>
      <PanelHeader title="My Work" />
      <div style={{ minHeight: "160px" }}>
        {/* Inbox */}
        <SectionLabel label="Inbox" count={tickets.length} onViewAll={onViewInbox} />
        {loading ? (
          <><SkeletonRow /><SkeletonRow /></>
        ) : tickets.length === 0 ? (
          <EmptyRow message="Inbox is clear." icon={<Inbox className="w-5 h-5" />} />
        ) : (
          tickets.map((t) => (
            <ItemRow
              key={t.id}
              dotColor={ticketDotColor(t.type, t.priority)}
              label={t.subject}
              sub={`${t.type} · ${t.linked_record_type.replace(/_/g, " ")}`}
              meta={timeAgo(t.created_at)}
              onClick={() => onTicket(t.id)}
            />
          ))
        )}
      </div>
    </Panel>
  );
}

// ─── Dept Queue Panel ─────────────────────────────────────────────────────────

function DeptQueuePanel({
  dept,
  openInquiries,
  awaitingClient,
  pricingRequests,
  pricingInProgress,
  activeBookings,
  acctTickets,
  pendingEVs,
  execCounts,
  loading,
  onNavigate,
  onTicket,
  onBooking,
}: {
  dept: string;
  openInquiries: QuotationItem[];
  awaitingClient: QuotationItem[];
  pricingRequests: QuotationItem[];
  pricingInProgress: QuotationItem[];
  activeBookings: BookingItem[];
  acctTickets: TicketItem[];
  pendingEVs: EVoucherItem[];
  execCounts: { openInquiries: number; inProgressQuotations: number; activeBookings: number; openTickets: number; pendingEVs: number };
  loading: boolean;
  onNavigate: (path: string) => void;
  onTicket: (id: string) => void;
  onBooking: (b: BookingItem) => void;
}) {
  // Build tabs per department
  type TabKey = string;
  type Tab = { key: TabKey; label: string; count: number };
  let tabs: Tab[] = [];

  if (dept === "Business Development") {
    tabs = [
      { key: "inquiries", label: "Open Inquiries",  count: openInquiries.length },
      { key: "awaiting",  label: "Awaiting Client", count: awaitingClient.length },
    ];
  } else if (dept === "Pricing") {
    tabs = [
      { key: "requests",   label: "Requests from BD", count: pricingRequests.length },
      { key: "inprogress", label: "In Progress",       count: pricingInProgress.length },
    ];
  } else if (dept === "Operations") {
    tabs = [{ key: "bookings", label: "Active Bookings", count: activeBookings.length }];
  } else if (dept === "Accounting") {
    tabs = [
      { key: "tickets",   label: "Pending Tickets",          count: acctTickets.length },
      { key: "evouchers", label: "E-Vouchers for Disbursement", count: pendingEVs.length },
    ];
  } else if (dept === "Executive") {
    tabs = [{ key: "overview", label: "Company Overview", count: 0 }];
  }

  const [activeTab, setActiveTab] = useState<TabKey>(tabs[0]?.key ?? "");

  // Reset active tab when dept changes
  useEffect(() => {
    setActiveTab(tabs[0]?.key ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dept]);

  function bookingDotColor(status: string): "blue" | "green" | "muted" {
    if (status === "In Progress") return "blue";
    if (status === "Confirmed")   return "green";
    return "muted";
  }

  const queueLabel =
    dept === "Executive" ? "Company Overview" : `${dept || "Dept"} Queue`;

  if (!["Business Development", "Pricing", "Operations", "Accounting", "Executive"].includes(dept)) {
    return null;
  }

  return (
    <Panel>
      <div
        className="flex items-center justify-between px-4"
        style={{ borderBottom: "1px solid var(--neuron-ui-border)" }}
      >
        <h2 className="text-[13px] font-semibold tracking-tight py-3" style={{ color: "var(--neuron-ink-primary)" }}>
          {queueLabel}
        </h2>
        {tabs.length > 1 && (
          <div className="flex items-center gap-0">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex items-center gap-1.5 px-3 py-3 text-[12px] font-medium transition-colors border-b-2"
                style={{
                  color: activeTab === tab.key ? "var(--neuron-brand-green)" : "var(--neuron-ink-muted)",
                  borderBottomColor: activeTab === tab.key ? "var(--neuron-brand-green)" : "transparent",
                  marginBottom: "-1px",
                }}
              >
                {tab.label}
                <span
                  className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-semibold rounded-full leading-none"
                  style={{
                    background: activeTab === tab.key
                      ? "var(--neuron-brand-green-100)"
                      : "var(--theme-bg-surface-subtle)",
                    color: activeTab === tab.key
                      ? "var(--neuron-brand-green)"
                      : "var(--neuron-ink-muted)",
                  }}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div>
          <SkeletonRow /><SkeletonRow /><SkeletonRow />
        </div>
      ) : (
        <div>
          {/* BD */}
          {dept === "Business Development" && activeTab === "inquiries" && (
            openInquiries.length === 0
              ? <EmptyRow message="No open inquiries." />
              : openInquiries.map((q) => (
                  <ItemRow
                    key={q.id}
                    dotColor="green"
                    label={q.quotation_number ?? q.id.slice(0, 8)}
                    sub={`${q.customer_name} · ${q.status}`}
                    meta={timeAgo(q.created_at)}
                    onClick={() => {
                      trackRecent({ label: q.quotation_number ?? q.id.slice(0, 8), sub: q.customer_name, path: "/bd/inquiries", type: "quotation", time: new Date().toISOString() });
                      onNavigate("/bd/inquiries");
                    }}
                  />
                ))
          )}
          {dept === "Business Development" && activeTab === "awaiting" && (
            awaitingClient.length === 0
              ? <EmptyRow message="No quotations awaiting client response." />
              : awaitingClient.map((q) => (
                  <ItemRow
                    key={q.id}
                    dotColor="amber"
                    label={q.quotation_number ?? q.id.slice(0, 8)}
                    sub={q.customer_name}
                    meta={timeAgo(q.updated_at ?? q.created_at)}
                    onClick={() => {
                      trackRecent({ label: q.quotation_number ?? q.id.slice(0, 8), sub: q.customer_name, path: "/bd/inquiries", type: "quotation", time: new Date().toISOString() });
                      onNavigate("/bd/inquiries");
                    }}
                  />
                ))
          )}

          {/* Pricing */}
          {dept === "Pricing" && activeTab === "requests" && (
            pricingRequests.length === 0
              ? <EmptyRow message="No new requests from BD." />
              : pricingRequests.map((q) => (
                  <ItemRow
                    key={q.id}
                    dotColor="green"
                    label={q.quotation_number ?? q.id.slice(0, 8)}
                    sub={`${q.customer_name} · ${q.status}`}
                    meta={timeAgo(q.created_at)}
                    onClick={() => {
                      trackRecent({ label: q.quotation_number ?? q.id.slice(0, 8), sub: q.customer_name, path: "/pricing/quotations", type: "quotation", time: new Date().toISOString() });
                      onNavigate("/pricing/quotations");
                    }}
                  />
                ))
          )}
          {dept === "Pricing" && activeTab === "inprogress" && (
            pricingInProgress.length === 0
              ? <EmptyRow message="No quotations in progress." />
              : pricingInProgress.map((q) => (
                  <ItemRow
                    key={q.id}
                    dotColor="blue"
                    label={q.quotation_number ?? q.id.slice(0, 8)}
                    sub={`${q.customer_name} · ${q.status}`}
                    meta={timeAgo(q.updated_at ?? q.created_at)}
                    onClick={() => {
                      trackRecent({ label: q.quotation_number ?? q.id.slice(0, 8), sub: q.customer_name, path: "/pricing/quotations", type: "quotation", time: new Date().toISOString() });
                      onNavigate("/pricing/quotations");
                    }}
                  />
                ))
          )}

          {/* Operations */}
          {dept === "Operations" && (
            activeBookings.length === 0
              ? <EmptyRow message="No active bookings assigned to you." />
              : activeBookings.map((b) => (
                  <ItemRow
                    key={b.id}
                    dotColor={bookingDotColor(b.status)}
                    label={b.booking_number}
                    sub={`${b.customer_name} · ${b.service_type} · ${b.status}`}
                    meta={timeAgo(b.created_at)}
                    onClick={() => {
                      trackRecent({ label: b.booking_number, sub: `${b.customer_name} · ${b.service_type}`, path: bookingRoute(b.service_type), type: "booking", time: new Date().toISOString() });
                      onBooking(b);
                    }}
                  />
                ))
          )}

          {/* Accounting */}
          {dept === "Accounting" && activeTab === "tickets" && (
            acctTickets.length === 0
              ? <EmptyRow message="No pending billing tickets." />
              : acctTickets.map((t) => (
                  <ItemRow
                    key={t.id}
                    dotColor={t.priority === "urgent" ? "red" : "green"}
                    label={t.subject}
                    sub={t.linked_record_type.replace(/_/g, " ")}
                    meta={timeAgo(t.created_at)}
                    onClick={() => {
                      trackRecent({ label: t.subject, sub: t.linked_record_type.replace(/_/g, " "), path: "/inbox", type: "ticket", time: new Date().toISOString() });
                      onTicket(t.id);
                    }}
                  />
                ))
          )}
          {dept === "Accounting" && activeTab === "evouchers" && (
            pendingEVs.length === 0
              ? <EmptyRow message="No e-vouchers pending accounting review." />
              : pendingEVs.map((ev) => (
                  <ItemRow
                    key={ev.id}
                    dotColor="amber"
                    label={`${ev.evoucher_number}${ev.description ? ` — ${ev.description}` : ""}`}
                    sub={`${pesos(ev.amount)} · ${ev.created_by_name}`}
                    meta={timeAgo(ev.created_at)}
                    onClick={() => {
                      trackRecent({ label: ev.evoucher_number, sub: ev.created_by_name, path: "/accounting/evouchers", type: "evoucher", time: new Date().toISOString() });
                      onNavigate("/accounting/evouchers");
                    }}
                  />
                ))
          )}

          {/* Executive */}
          {dept === "Executive" && (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { label: "Open Inquiries",        value: execCounts.openInquiries,        path: "/bd/inquiries",             highlight: false },
                { label: "Quotations In Progress", value: execCounts.inProgressQuotations, path: "/pricing/quotations",       highlight: false },
                { label: "Active Bookings",        value: execCounts.activeBookings,       path: "/operations",               highlight: false },
                { label: "Open Tickets",           value: execCounts.openTickets,          path: "/inbox",                    highlight: execCounts.openTickets > 0 },
                { label: "Pending E-Vouchers",     value: execCounts.pendingEVs,           path: "/accounting/evouchers",     highlight: execCounts.pendingEVs > 0 },
              ].map((s) => (
                <button
                  key={s.label}
                  onClick={() => onNavigate(s.path)}
                  className="text-left p-4 rounded-[var(--neuron-radius-m)] transition-all"
                  style={{ border: "1px solid var(--neuron-ui-border)", background: "var(--theme-bg-surface-subtle)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--neuron-brand-green)";
                    (e.currentTarget as HTMLElement).style.background = "var(--neuron-brand-green-100)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--neuron-ui-border)";
                    (e.currentTarget as HTMLElement).style.background = "var(--theme-bg-surface-subtle)";
                  }}
                >
                  <p
                    className="text-[28px] font-semibold tabular-nums leading-none"
                    style={{ color: s.highlight && s.value > 0 ? "var(--neuron-brand-green)" : "var(--neuron-ink-primary)" }}
                  >
                    {s.value}
                  </p>
                  <p className="text-[11.5px] mt-1.5 leading-tight" style={{ color: "var(--neuron-ink-muted)" }}>
                    {s.label}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface MyHomepageProps {
  currentUser?: { name?: string; email?: string; department?: string; role?: string } | null;
}

export function MyHomepage({ currentUser }: MyHomepageProps) {
  const navigate = useNavigate();
  const { user, effectiveDepartment, effectiveRole } = useUser();

  const dept   = effectiveDepartment || currentUser?.department || "";
  const role   = (effectiveRole || currentUser?.role || "").toLowerCase();
  const userId = user?.id ?? "";
  const firstName = (currentUser?.name || (user as any)?.name || "there").split(" ")[0];

  // ── Motivational message ─────────────────────────────────────────────────
  const [msgIndex] = useState(() => {
    const pool = getMessagePool();
    return Math.floor(Math.random() * pool.length);
  });

  // ── My Work (cached 2 min via TanStack Query) ─────────────────────────────
  const { data: myWorkData, isLoading: loadingMyWork } = useQuery({
    queryKey: ["myWork", dept, role],
    queryFn: () => fetchMyWork(dept, role),
    enabled: !!dept,
    staleTime: 2 * 60 * 1000,
  });

  const myTickets   = myWorkData?.tickets   ?? [];
  const myApprovals = myWorkData?.approvals ?? [];

  // ── Dept queue (cached 2 min via TanStack Query) ──────────────────────────
  const { data: deptQueueData, isLoading: loadingDept } = useQuery({
    queryKey: ["deptQueue", dept, userId],
    queryFn: () => fetchDeptQueue(dept, userId),
    enabled: !!dept,
    staleTime: 2 * 60 * 1000,
  });

  const openInquiries     = deptQueueData?.openInquiries     ?? [];
  const awaitingClient    = deptQueueData?.awaitingClient    ?? [];
  const pricingRequests   = deptQueueData?.pricingRequests   ?? [];
  const pricingInProgress = deptQueueData?.pricingInProgress ?? [];
  const activeBookings    = deptQueueData?.activeBookings    ?? [];
  const acctTickets       = deptQueueData?.acctTickets       ?? [];
  const pendingEVs        = deptQueueData?.pendingEVs        ?? [];
  const execCounts        = deptQueueData?.execCounts        ?? {
    openInquiries: 0, inProgressQuotations: 0, activeBookings: 0, openTickets: 0, pendingEVs: 0,
  };

  // ── Derived attention count ───────────────────────────────────────────────
  const attentionCount = myTickets.length + myApprovals.length;

  // ── Nav helpers — RouteTracker handles all recent recording automatically ──
  const goTo       = (path: string) => navigate(path);
  const goTicket   = (id: string) => navigate(`/inbox?ticketId=${id}`);
  const goEVoucher = () => navigate("/accounting/evouchers");
  const goBooking  = (b: BookingItem) => navigate(bookingRoute(b.service_type));

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--theme-bg-surface)" }}>

      {/* ── Header ── */}
      <div className="px-12 pt-8 pb-0">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 style={{ fontSize: "32px", fontWeight: 600, color: "var(--theme-text-primary)", marginBottom: "4px", letterSpacing: "-1.2px" }}>
              {getGreeting()}, {firstName}.
            </h1>
            <p style={{ fontSize: "14px", color: "var(--theme-text-muted)" }}>
              {getMessagePool()[msgIndex]}
            </p>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 relative overflow-hidden">
        {/* Scroll fade top */}
        <div
          className="absolute top-0 left-0 right-0 z-10 pointer-events-none"
          style={{ height: "40px", background: "linear-gradient(to bottom, var(--theme-bg-surface), transparent)" }}
        />
        {/* Scroll fade bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
          style={{ height: "40px", background: "linear-gradient(to top, var(--theme-bg-surface), transparent)" }}
        />
        <div className="h-full overflow-auto scrollbar-hide px-12 pt-6 pb-12">
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: "2fr 1fr",
            gridTemplateRows: "auto auto auto",
          }}
        >
          {/* Row 1, Col 1 — My Work */}
          <div style={{ gridColumn: "1", gridRow: "1" }}>
            <MyWorkPanel
              tickets={myTickets}
              approvals={myApprovals}
              loading={loadingMyWork}
              onTicket={goTicket}
              onEVoucher={goEVoucher}
              onViewInbox={() => navigate("/inbox")}
              onViewEVouchers={() => navigate("/accounting/evouchers")}
            />
          </div>

          {/* Col 2, Rows 1-2 — My Tasks (tall card) */}
          <div
            className="flex flex-col h-full min-h-0"
            style={{ gridColumn: "2", gridRow: "1 / 3" }}
          >
            {userId && <TodoPanel userId={userId} />}
          </div>

          {/* Row 2, Col 1 — Continue Work */}
          <div style={{ gridColumn: "1", gridRow: "2" }}>
            <JumpBackIn onNavigate={goTo} />
          </div>

          {/* Row 3, full width — Dept Queue */}
          {["Business Development", "Pricing", "Operations", "Accounting", "Executive"].includes(dept) && (
            <div style={{ gridColumn: "1 / 3", gridRow: "3" }}>
              <DeptQueuePanel
                dept={dept}
                openInquiries={openInquiries}
                awaitingClient={awaitingClient}
                pricingRequests={pricingRequests}
                pricingInProgress={pricingInProgress}
                activeBookings={activeBookings}
                acctTickets={acctTickets}
                pendingEVs={pendingEVs}
                execCounts={execCounts}
                loading={loadingDept}
                onNavigate={goTo}
                onTicket={goTicket}
                onBooking={goBooking}
              />
            </div>
          )}
        </div>
        </div>
      </div>

    </div>
  );
}
