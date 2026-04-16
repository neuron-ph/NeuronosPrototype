import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence, useAnimation } from "motion/react";
import { useUser } from "../hooks/useUser";
import { supabase } from "../utils/supabase/client";
import {
  fetchMyWork, fetchDeptQueue,
  type TicketItem, type EVoucherItem, type BookingItem, type QuotationItem,
} from "../lib/dashboardFetchers";
import { getRecents, trackRecent, type RecentItem, type RecentType } from "../lib/recents";
import {
  ArrowRight, Plus, Check, X,
  Clock, Inbox, ListChecks,
  User, Building2, FileText, FileQuestion, Truck, MessageSquare, Receipt, FolderOpen,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  created_at: string;
  done_at: string | null;
}

// ─── Motion ───────────────────────────────────────────────────────────────────

const EASE_OUT_QUINT: [number, number, number, number] = [0.22, 1, 0.36, 1];

const panelVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.28, ease: EASE_OUT_QUINT },
  }),
};

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
  ],
  evening: [
    "Let's wrap up the day.",
    "One last solid push for the day.",
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

// ─── Count-up hook ────────────────────────────────────────────────────────────

function useCountUp(target: number, durationMs = 480, delayMs = 0) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === 0) { setVal(0); return; }
    let raf: number;
    const startAt = Date.now() + delayMs;
    const tick = () => {
      const elapsed = Date.now() - startAt;
      if (elapsed < 0) { raf = requestAnimationFrame(tick); return; }
      const t = Math.min(elapsed / durationMs, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(ease * target));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setVal(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, delayMs]);
  return val;
}

// ─── Dept colors ──────────────────────────────────────────────────────────────

function getDeptColors(dept: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    "Business Development": { bg: "var(--neuron-dept-bd-bg)",        text: "var(--neuron-dept-bd-text)" },
    "Pricing":              { bg: "var(--neuron-dept-pricing-bg)",    text: "var(--neuron-dept-pricing-text)" },
    "Operations":           { bg: "var(--neuron-dept-ops-bg)",        text: "var(--neuron-dept-ops-text)" },
    "Accounting":           { bg: "var(--neuron-dept-accounting-bg)", text: "var(--neuron-dept-accounting-text)" },
    "HR":                   { bg: "var(--neuron-dept-hr-bg)",         text: "var(--neuron-dept-hr-text)" },
    "Executive":            { bg: "var(--neuron-dept-executive-bg)",  text: "var(--neuron-dept-executive-text)" },
  };
  return map[dept] ?? { bg: "var(--neuron-dept-default-bg)", text: "var(--neuron-dept-default-text)" };
}

// ─── Recent type registry ─────────────────────────────────────────────────────

const RECENT_TYPE_COLOR: Record<RecentType, string> = {
  booking:   "var(--neuron-brand-green)",
  quotation: "var(--neuron-semantic-info)",
  inquiry:   "var(--neuron-status-accent-fg)",
  ticket:    "var(--neuron-semantic-warn)",
  evoucher:  "var(--neuron-dept-accounting-text)",
  project:   "var(--neuron-semantic-success)",
  contact:   "#0891B2",
  customer:  "#16A34A",
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
            aria-label={`${count} ${label.toLowerCase()} items`}
            style={{
              background: count > 0 ? "var(--neuron-semantic-success-bg)" : "var(--neuron-bg-page)",
              color:      count > 0 ? "var(--neuron-semantic-success)"    : "var(--neuron-ink-muted)",
              border:     `1px solid ${count > 0 ? "var(--neuron-semantic-success-border)" : "var(--neuron-ui-border)"}`,
            }}
          >
            {count}
          </span>
        )}
      </div>
      {onViewAll && (
        <button
          onClick={onViewAll}
          className="flex items-center gap-0.5 text-[11px] font-medium transition-opacity hover:opacity-60"
          style={{ color: "var(--neuron-brand-green)" }}
        >
          All <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function EmptyRow({
  message,
  icon,
  cta,
  onCta,
}: {
  message: string;
  icon?: React.ReactNode;
  cta?: string;
  onCta?: () => void;
}) {
  return (
    <div className="px-4 py-6 flex flex-col items-center gap-2.5 text-center">
      {icon && (
        <div className="opacity-40" style={{ color: "var(--neuron-ui-muted)" }}>
          {icon}
        </div>
      )}
      <p className="text-[12px]" style={{ color: "var(--neuron-ink-muted)" }}>{message}</p>
      {cta && onCta && (
        <button
          onClick={onCta}
          className="flex items-center gap-1 text-[11.5px] font-medium transition-opacity hover:opacity-70"
          style={{ color: "var(--neuron-brand-green)" }}
        >
          {cta} <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="px-4 py-2.5 flex items-center gap-3 animate-pulse">
      <div className="w-4 h-4 rounded-[3px] flex-shrink-0" style={{ background: "var(--neuron-ui-border)" }} />
      <div className="h-3 rounded flex-1" style={{ background: "var(--neuron-ui-border)", maxWidth: "70%" }} />
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
  urgent = false,
}: {
  dotColor: "green" | "amber" | "red" | "blue" | "muted";
  label: string;
  sub?: string;
  meta?: string;
  onClick: () => void;
  urgent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-4 py-3 sm:py-2.5 flex items-start gap-3 text-left transition-colors hover:bg-[var(--neuron-state-hover)] focus-visible:outline-none focus-visible:bg-[var(--neuron-state-selected)]"
      style={urgent ? { background: "var(--neuron-semantic-danger-bg)" } : undefined}
    >
      <StatusDot color={dotColor} />
      <div className="flex-1 min-w-0">
        <p
          className="text-[13px] font-medium leading-snug truncate"
          style={{ color: "var(--neuron-ink-primary)" }}
        >
          {label}
        </p>
        {sub && (
          <p className="text-[11.5px] truncate mt-[2px]" style={{ color: "var(--neuron-ink-muted)" }}>
            {sub}
          </p>
        )}
      </div>
      {meta && (
        <span
          className="text-[11px] flex-shrink-0 ml-2 pt-0.5"
          style={{ color: urgent ? "var(--neuron-semantic-danger)" : "var(--neuron-ink-muted)" }}
        >
          {meta}
        </span>
      )}
    </button>
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
        background:  "var(--neuron-bg-elevated)",
        border:      "1px solid var(--neuron-ui-border)",
        boxShadow:   "var(--elevation-1)",
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
      <h2
        className="text-[13px] font-semibold tracking-tight"
        style={{ color: "var(--neuron-ink-primary)" }}
      >
        {title}
      </h2>
      {action}
    </div>
  );
}

// ─── Todo Panel ───────────────────────────────────────────────────────────────

function TodoPanel({ userId }: { userId: string }) {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [submitted, setSubmitted] = useState(false);
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
    // Task appears in list first, then input flashes confirmation and collapses
    setTodos((prev) => [optimistic, ...prev]);
    setInputValue("");
    setSubmitted(true);
    await new Promise<void>((r) => setTimeout(r, 180));
    setSubmitted(false);
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
            type="button"
            onClick={() => setShowInput((v) => !v)}
            className="w-6 h-6 rounded-md flex items-center justify-center transition-all duration-200 hover:bg-[var(--neuron-brand-green-100)]"
            style={{
              color: "var(--neuron-brand-green)",
              transform: showInput ? "rotate(45deg)" : "rotate(0deg)",
            }}
            title={showInput ? "Cancel" : "Add task"}
          >
            <Plus className="w-4 h-4" />
          </button>
        }
      />

      <AnimatePresence>
        {showInput && (
          <motion.div
            key="task-input"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div
              className="compose-panel px-4 py-2.5"
              style={{ borderBottom: "1px solid var(--neuron-ui-divider)" }}
            >
              <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="What needs doing?"
                className="w-full text-[13px] bg-transparent outline-none leading-snug"
                style={{
                  color: "var(--neuron-ink-primary)",
                  background: submitted ? "var(--neuron-brand-green-100)" : "transparent",
                  transition: "background 0.15s ease",
                  border: "none",
                  boxShadow: "none",
                }}
              />
              <div className="flex items-center justify-between mt-2.5">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={addTodo}
                    className="h-6 px-2.5 rounded text-[11.5px] font-medium transition-colors"
                    style={{
                      background: "var(--neuron-brand-green)",
                      color: "var(--neuron-action-primary-text)",
                    }}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowInput(false); setInputValue(""); }}
                    className="h-6 px-2.5 rounded text-[11.5px] transition-colors hover:bg-[var(--neuron-state-hover)]"
                    style={{ color: "var(--neuron-ink-muted)" }}
                  >
                    Cancel
                  </button>
                </div>
                <span className="text-[10.5px]" style={{ color: "var(--neuron-ui-muted)" }}>
                  ↵ to save
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="overflow-y-auto flex-1" style={{ minHeight: 0 }}>
        {loading ? (
          <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
        ) : open.length === 0 && done.length === 0 ? (
          <EmptyRow
            message="No tasks yet."
            icon={<ListChecks className="w-5 h-5" />}
            cta="Add a task"
            onCta={() => setShowInput(true)}
          />
        ) : (
          <>
            <AnimatePresence initial={false}>
              {open.map((todo) => (
                <TodoRow key={todo.id} todo={todo} onToggle={toggleTodo} onDelete={deleteTodo} />
              ))}
            </AnimatePresence>
            {done.length > 0 && (
              <>
                {open.length > 0 && <Divider />}
                <div className="px-4 py-2">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-[0.07em]"
                    style={{ color: "var(--neuron-ui-muted)" }}
                  >
                    Completed · {done.length}
                  </span>
                </div>
                <AnimatePresence initial={false}>
                  {done.map((todo) => (
                    <TodoRow key={todo.id} todo={todo} onToggle={toggleTodo} onDelete={deleteTodo} />
                  ))}
                </AnimatePresence>
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
  const [completing, setCompleting] = useState(false);
  const checkboxControls = useAnimation();

  async function handleToggle() {
    const becomingDone = !todo.done;
    if (becomingDone) {
      // Tactile press → overshoot pop → settle
      await checkboxControls.start({ scale: 0.82, transition: { duration: 0.07 } });
      setCompleting(true);
      onToggle(todo.id, todo.done);
      await checkboxControls.start({ scale: 1.18, transition: { duration: 0.12, ease: [0.22, 1, 0.36, 1] } });
      await checkboxControls.start({ scale: 1,    transition: { duration: 0.1,  ease: [0.22, 1, 0.36, 1] } });
      setTimeout(() => setCompleting(false), 350);
    } else {
      await checkboxControls.start({ scale: 0.85, transition: { duration: 0.08 } });
      onToggle(todo.id, todo.done);
      checkboxControls.start({ scale: 1, transition: { duration: 0.12, ease: [0.22, 1, 0.36, 1] } });
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="px-4 py-2.5 flex items-start gap-3 transition-colors duration-200"
      style={{
        background: completing
          ? "var(--neuron-semantic-success-bg)"
          : hovered ? "var(--neuron-state-hover)" : "",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.button
        type="button"
        animate={checkboxControls}
        whileTap={{ scale: 0.82 }}
        onClick={handleToggle}
        className="w-4 h-4 mt-[1px] rounded-[3px] flex-shrink-0 border flex items-center justify-center"
        style={{
          background:  todo.done ? "var(--neuron-brand-green)" : "transparent",
          borderColor: todo.done ? "var(--neuron-brand-green)" : "var(--neuron-ui-muted)",
          transition:  "background 0.15s ease, border-color 0.15s ease",
        }}
        aria-label={todo.done ? "Mark incomplete" : "Mark complete"}
      >
        {todo.done && (
          <motion.div
            initial={{ scale: 0, rotate: -15 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
          </motion.div>
        )}
      </motion.button>

      <p
        className="flex-1 text-[13px] leading-snug min-w-0 transition-colors duration-200"
        style={{
          color:          todo.done ? "var(--neuron-ink-muted)" : "var(--neuron-ink-primary)",
          textDecoration: todo.done ? "line-through" : "none",
        }}
      >
        {todo.text}
      </p>

      <button
        type="button"
        onClick={() => onDelete(todo.id)}
        className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded transition-all duration-150 hover:text-[var(--neuron-semantic-danger)] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:pointer-events-none"
        style={{
          color: "var(--neuron-ink-muted)",
          opacity: hovered ? 1 : undefined,
          pointerEvents: hovered ? "auto" : undefined,
        }}
        aria-label="Delete task"
        tabIndex={hovered ? 0 : -1}
      >
        <X className="w-3 h-3" />
      </button>
    </motion.div>
  );
}

// ─── Jump Back In ─────────────────────────────────────────────────────────────

function JumpBackIn({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const { user } = useUser();
  useEffect(() => { if (user?.id) setRecents(getRecents(user.id)); }, [user?.id]);

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
            <button
              key={i}
              type="button"
              onClick={() => onNavigate(r.path)}
              className="w-full px-5 py-3 sm:py-2.5 flex items-center gap-3 text-left transition-colors hover:bg-[var(--neuron-state-hover)] focus-visible:outline-none focus-visible:bg-[var(--neuron-state-selected)]"
            >
              <span className="flex-shrink-0" style={{ color: RECENT_TYPE_COLOR[r.type] }}>
                {recentTypeIcon(r.type)}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-[12.5px] font-medium truncate leading-tight"
                  style={{ color: "var(--neuron-ink-primary)" }}
                >
                  {r.label}
                </p>
                <p className="text-[11px] leading-tight mt-0.5" style={{ color: "var(--neuron-ink-muted)" }}>
                  {RECENT_TYPE_LABEL[r.type]}
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-[11px] leading-tight" style={{ color: "var(--neuron-ink-muted)" }}>
                  {r.sub.split(" · ")[0]}
                </p>
                <p
                  className="text-[10.5px] leading-tight mt-0.5 tabular-nums"
                  style={{ color: "var(--neuron-ui-muted)" }}
                >
                  {timeAgo(r.time)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ─── My Work Panel ────────────────────────────────────────────────────────────

function MyWorkPanel({
  tickets,
  approvals: _approvals,
  loading,
  onTicket,
  onEVoucher: _onEVoucher,
  onViewInbox,
  onViewEVouchers: _onViewEVouchers,
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
        <SectionLabel label="Inbox" count={tickets.length} onViewAll={onViewInbox} />
        {loading ? (
          <><SkeletonRow /><SkeletonRow /></>
        ) : tickets.length === 0 ? (
          <EmptyRow
            message="Inbox is clear — no items waiting."
            icon={<Inbox className="w-5 h-5" />}
            cta="Go to inbox"
            onCta={onViewInbox}
          />
        ) : (
          tickets.map((t) => (
            <ItemRow
              key={t.id}
              dotColor={ticketDotColor(t.type, t.priority)}
              urgent={t.priority === "urgent"}
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
      { key: "tickets",   label: "Pending Tickets",             count: acctTickets.length },
      { key: "evouchers", label: "E-Vouchers for Disbursement", count: pendingEVs.length },
    ];
  } else if (dept === "Executive") {
    tabs = [{ key: "overview", label: "Company Overview", count: 0 }];
  }

  const [activeTab, setActiveTab] = useState<TabKey>(tabs[0]?.key ?? "");
  const { user } = useUser();

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

  // ── Dept-specific empty state CTAs ────────────────────────────────────────
  function getEmptyState(key: TabKey): { message: string; cta?: string; path?: string } {
    switch (key) {
      case "inquiries":   return { message: "No open inquiries right now.",            cta: "View all inquiries",     path: "/bd/inquiries" };
      case "awaiting":    return { message: "No quotations waiting on client response.", cta: "View inquiries",        path: "/bd/inquiries" };
      case "requests":    return { message: "No new requests from BD.",                 cta: "View all quotations",   path: "/pricing/quotations" };
      case "inprogress":  return { message: "No quotations currently in progress.",     cta: "View all quotations",   path: "/pricing/quotations" };
      case "bookings":    return { message: "No active bookings assigned to you.",      cta: "View all bookings",     path: "/operations" };
      case "tickets":     return { message: "No pending billing tickets.",              cta: "View inbox",            path: "/inbox" };
      case "evouchers":   return { message: "No e-vouchers pending disbursement.",      cta: "View e-vouchers",       path: "/accounting/evouchers" };
      default:            return { message: "Nothing here right now." };
    }
  }

  return (
    <Panel>
      <div
        className="flex items-center justify-between min-w-0 overflow-x-auto scrollbar-hide"
        style={{ borderBottom: "1px solid var(--neuron-ui-border)" }}
      >
        <h2
          className="text-[13px] font-semibold tracking-tight py-3 px-4 flex-shrink-0"
          style={{ color: "var(--neuron-ink-primary)" }}
        >
          {queueLabel}
        </h2>
        {tabs.length > 1 && (
          <div className="flex items-center gap-0 flex-shrink-0 pr-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className="flex items-center gap-1.5 px-3 py-3 text-[12px] font-medium transition-colors border-b-2 focus-visible:outline-none whitespace-nowrap"
                style={{
                  color:            activeTab === tab.key ? "var(--neuron-brand-green)" : "var(--neuron-ink-muted)",
                  borderBottomColor: activeTab === tab.key ? "var(--neuron-brand-green)" : "transparent",
                  marginBottom:     "-1px",
                }}
              >
                {tab.label}
                <span
                  className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-semibold rounded-full leading-none"
                  style={{
                    background: activeTab === tab.key ? "var(--neuron-brand-green-100)" : "var(--neuron-bg-page)",
                    color:      activeTab === tab.key ? "var(--neuron-brand-green)"     : "var(--neuron-ink-muted)",
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
        <div><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
      ) : (
        <div>
          {/* BD */}
          {dept === "Business Development" && activeTab === "inquiries" && (
            openInquiries.length === 0
              ? (() => { const e = getEmptyState("inquiries"); return <EmptyRow message={e.message} cta={e.cta} onCta={e.path ? () => onNavigate(e.path!) : undefined} />; })()
              : openInquiries.map((q) => (
                  <ItemRow
                    key={q.id}
                    dotColor="green"
                    label={q.quotation_number ?? q.id.slice(0, 8)}
                    sub={`${q.customer_name} · ${q.status}`}
                    meta={timeAgo(q.created_at)}
                    onClick={() => {
                      if (user?.id) trackRecent({ label: q.quotation_number ?? q.id.slice(0, 8), sub: q.customer_name, path: "/bd/inquiries", type: "quotation", time: new Date().toISOString() }, user.id);
                      onNavigate("/bd/inquiries");
                    }}
                  />
                ))
          )}
          {dept === "Business Development" && activeTab === "awaiting" && (
            awaitingClient.length === 0
              ? (() => { const e = getEmptyState("awaiting"); return <EmptyRow message={e.message} cta={e.cta} onCta={e.path ? () => onNavigate(e.path!) : undefined} />; })()
              : awaitingClient.map((q) => (
                  <ItemRow
                    key={q.id}
                    dotColor="amber"
                    label={q.quotation_number ?? q.id.slice(0, 8)}
                    sub={q.customer_name}
                    meta={timeAgo(q.updated_at ?? q.created_at)}
                    onClick={() => {
                      if (user?.id) trackRecent({ label: q.quotation_number ?? q.id.slice(0, 8), sub: q.customer_name, path: "/bd/inquiries", type: "quotation", time: new Date().toISOString() }, user.id);
                      onNavigate("/bd/inquiries");
                    }}
                  />
                ))
          )}

          {/* Pricing */}
          {dept === "Pricing" && activeTab === "requests" && (
            pricingRequests.length === 0
              ? (() => { const e = getEmptyState("requests"); return <EmptyRow message={e.message} cta={e.cta} onCta={e.path ? () => onNavigate(e.path!) : undefined} />; })()
              : pricingRequests.map((q) => (
                  <ItemRow
                    key={q.id}
                    dotColor="green"
                    label={q.quotation_number ?? q.id.slice(0, 8)}
                    sub={`${q.customer_name} · ${q.status}`}
                    meta={timeAgo(q.created_at)}
                    onClick={() => {
                      if (user?.id) trackRecent({ label: q.quotation_number ?? q.id.slice(0, 8), sub: q.customer_name, path: "/pricing/quotations", type: "quotation", time: new Date().toISOString() }, user.id);
                      onNavigate("/pricing/quotations");
                    }}
                  />
                ))
          )}
          {dept === "Pricing" && activeTab === "inprogress" && (
            pricingInProgress.length === 0
              ? (() => { const e = getEmptyState("inprogress"); return <EmptyRow message={e.message} cta={e.cta} onCta={e.path ? () => onNavigate(e.path!) : undefined} />; })()
              : pricingInProgress.map((q) => (
                  <ItemRow
                    key={q.id}
                    dotColor="blue"
                    label={q.quotation_number ?? q.id.slice(0, 8)}
                    sub={`${q.customer_name} · ${q.status}`}
                    meta={timeAgo(q.updated_at ?? q.created_at)}
                    onClick={() => {
                      if (user?.id) trackRecent({ label: q.quotation_number ?? q.id.slice(0, 8), sub: q.customer_name, path: "/pricing/quotations", type: "quotation", time: new Date().toISOString() }, user.id);
                      onNavigate("/pricing/quotations");
                    }}
                  />
                ))
          )}

          {/* Operations */}
          {dept === "Operations" && (
            activeBookings.length === 0
              ? (() => { const e = getEmptyState("bookings"); return <EmptyRow message={e.message} cta={e.cta} onCta={e.path ? () => onNavigate(e.path!) : undefined} />; })()
              : activeBookings.map((b) => (
                  <ItemRow
                    key={b.id}
                    dotColor={bookingDotColor(b.status)}
                    label={b.booking_number}
                    sub={`${b.customer_name} · ${b.service_type} · ${b.status}`}
                    meta={timeAgo(b.created_at)}
                    onClick={() => {
                      if (user?.id) trackRecent({ label: b.booking_number, sub: `${b.customer_name} · ${b.service_type}`, path: bookingRoute(b.service_type), type: "booking", time: new Date().toISOString() }, user.id);
                      onBooking(b);
                    }}
                  />
                ))
          )}

          {/* Accounting */}
          {dept === "Accounting" && activeTab === "tickets" && (
            acctTickets.length === 0
              ? (() => { const e = getEmptyState("tickets"); return <EmptyRow message={e.message} cta={e.cta} onCta={e.path ? () => onNavigate(e.path!) : undefined} />; })()
              : acctTickets.map((t) => (
                  <ItemRow
                    key={t.id}
                    dotColor={t.priority === "urgent" ? "red" : "green"}
                    urgent={t.priority === "urgent"}
                    label={t.subject}
                    sub={t.linked_record_type.replace(/_/g, " ")}
                    meta={timeAgo(t.created_at)}
                    onClick={() => {
                      if (user?.id) trackRecent({ label: t.subject, sub: t.linked_record_type.replace(/_/g, " "), path: "/inbox", type: "ticket", time: new Date().toISOString() }, user.id);
                      onTicket(t.id);
                    }}
                  />
                ))
          )}
          {dept === "Accounting" && activeTab === "evouchers" && (
            pendingEVs.length === 0
              ? (() => { const e = getEmptyState("evouchers"); return <EmptyRow message={e.message} cta={e.cta} onCta={e.path ? () => onNavigate(e.path!) : undefined} />; })()
              : pendingEVs.map((ev) => (
                  <ItemRow
                    key={ev.id}
                    dotColor="amber"
                    label={`${ev.evoucher_number}${ev.description ? ` — ${ev.description}` : ""}`}
                    sub={`${pesos(ev.amount)} · ${ev.created_by_name}`}
                    meta={timeAgo(ev.created_at)}
                    onClick={() => {
                      if (user?.id) trackRecent({ label: ev.evoucher_number, sub: ev.created_by_name, path: "/accounting/evouchers", type: "evoucher", time: new Date().toISOString() }, user.id);
                      onNavigate("/accounting/evouchers");
                    }}
                  />
                ))
          )}

          {/* Executive */}
          {dept === "Executive" && (
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { label: "Open Inquiries",          value: execCounts.openInquiries,        path: "/bd/inquiries",            highlight: false },
                { label: "Quotations In Progress",  value: execCounts.inProgressQuotations, path: "/pricing/quotations",      highlight: false },
                { label: "Active Bookings",         value: execCounts.activeBookings,       path: "/operations",              highlight: false },
                { label: "Open Tickets",            value: execCounts.openTickets,          path: "/inbox",                   highlight: execCounts.openTickets > 0 },
                { label: "Pending E-Vouchers",      value: execCounts.pendingEVs,           path: "/accounting/evouchers",    highlight: execCounts.pendingEVs > 0 },
              ].map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => onNavigate(s.path)}
                  className="text-left p-4 rounded-[var(--neuron-radius-m)] transition-all hover:border-[var(--neuron-brand-green)] hover:bg-[var(--neuron-brand-green-100)] focus-visible:outline-none focus-visible:bg-[var(--neuron-state-selected)]"
                  style={{
                    border:     "1px solid var(--neuron-ui-border)",
                    background: "var(--neuron-bg-page)",
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

  const dept      = effectiveDepartment || currentUser?.department || "";
  const role      = (effectiveRole || currentUser?.role || "").toLowerCase();
  const userId    = user?.id ?? "";
  const firstName = (currentUser?.name || (user as any)?.name || "there").split(" ")[0];

  const [msgIndex] = useState(() => {
    const pool = getMessagePool();
    return Math.floor(Math.random() * pool.length);
  });

  const deptColors   = getDeptColors(dept);
  const deptRoleLabel = [dept, role ? role.charAt(0).toUpperCase() + role.slice(1) : ""]
    .filter(Boolean)
    .join(" · ");

  // ── Data ────────────────────────────────────────────────────────────────────
  const { data: myWorkData, isLoading: loadingMyWork } = useQuery({
    queryKey: ["myWork", dept, role],
    queryFn:  () => fetchMyWork(dept, role),
    enabled:  !!dept,
    staleTime: 2 * 60 * 1000,
  });

  const myTickets   = myWorkData?.tickets   ?? [];
  const myApprovals = myWorkData?.approvals ?? [];

  const { data: deptQueueData, isLoading: loadingDept } = useQuery({
    queryKey: ["deptQueue", dept, userId],
    queryFn:  () => fetchDeptQueue(dept, userId),
    enabled:  !!dept,
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

  const attentionCount = myTickets.length + myApprovals.length;
  const urgentCount    = myTickets.filter((t) => t.priority === "urgent").length;
  const displayCount   = useCountUp(attentionCount, 480, 200);

  // ── Nav ─────────────────────────────────────────────────────────────────────
  const goTo       = (path: string) => navigate(path);
  const goTicket   = (id: string)   => navigate(`/inbox?ticketId=${id}`);
  const goEVoucher = ()              => navigate("/accounting/evouchers");
  const goBooking  = (b: BookingItem) => navigate(bookingRoute(b.service_type));

  const hasDeptQueue = ["Business Development", "Pricing", "Operations", "Accounting", "Executive"].includes(dept);

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--theme-bg-surface)" }}>

      {/* ── Mission briefing header ── */}
      <motion.div
        className="px-5 sm:px-7 lg:px-10 pt-5 sm:pt-6 lg:pt-8 pb-4 sm:pb-5 lg:pb-6 flex-shrink-0"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT_QUINT }}
      >
        <div className="flex items-start justify-between gap-4 sm:gap-6 lg:gap-8">

          {/* Identity block */}
          <div>
            <p className="text-[13px] mb-1.5" style={{ color: "var(--neuron-ink-muted)" }}>
              {getMessagePool()[msgIndex]}
            </p>
            <h1
              className="text-[26px] sm:text-[30px] lg:text-[34px] font-semibold tracking-tight leading-tight"
              style={{ color: "var(--neuron-ink-primary)", letterSpacing: "-0.03em" }}
            >
              {getGreeting()}, {firstName}.
            </h1>
            {deptRoleLabel && (
              <span
                className="mt-2.5 inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-full"
                style={{
                  background: deptColors.bg,
                  color:      deptColors.text,
                }}
              >
                {deptRoleLabel}
              </span>
            )}
          </div>

          {/* Attention count — commanding, appears when data loads */}
          {!loadingMyWork && attentionCount > 0 && (
            <motion.button
              type="button"
              onClick={() => navigate("/inbox")}
              className="flex-shrink-0 text-right group"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.16, duration: 0.28, ease: EASE_OUT_QUINT }}
              aria-label={`${attentionCount} items need attention — go to inbox`}
            >
              <p
                className="text-[38px] sm:text-[46px] lg:text-[52px] font-semibold tabular-nums leading-none transition-opacity group-hover:opacity-70"
                style={{
                  color:          urgentCount > 0 ? "var(--neuron-semantic-danger)" : "var(--neuron-brand-green)",
                  letterSpacing:  "-0.04em",
                }}
              >
                {displayCount}
              </p>
              <p
                className="text-[12px] mt-1 flex items-center gap-1 justify-end"
                style={{ color: "var(--neuron-ink-muted)" }}
              >
                item{attentionCount !== 1 ? "s" : ""} waiting
                <ArrowRight
                  className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
                  style={{ color: "var(--neuron-brand-green)" }}
                />
              </p>
            </motion.button>
          )}
        </div>

        {/* Header rule */}
        <div className="mt-4 sm:mt-5 lg:mt-6" style={{ borderBottom: "1px solid var(--neuron-ui-divider)" }} />
      </motion.div>

      {/* ── Content ── */}
      <div className="flex-1 relative overflow-hidden">
        {/* Scroll fade top */}
        <div
          className="absolute top-0 left-0 right-0 z-10 pointer-events-none"
          style={{ height: "32px", background: "linear-gradient(to bottom, var(--theme-bg-surface), transparent)" }}
        />
        {/* Scroll fade bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
          style={{ height: "40px", background: "linear-gradient(to top, var(--theme-bg-surface), transparent)" }}
        />

        <div className="h-full overflow-auto scrollbar-hide px-5 sm:px-7 lg:px-10 pt-4 pb-12">

          {/* Responsive grid: single column → 2-column at md */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-[2fr_1fr]">

            {/* My Work — col 1, row 1 */}
            <motion.div
              custom={0}
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              className="md:col-start-1 md:row-start-1"
            >
              <MyWorkPanel
                tickets={myTickets}
                approvals={myApprovals}
                loading={loadingMyWork}
                onTicket={goTicket}
                onEVoucher={goEVoucher}
                onViewInbox={() => navigate("/inbox")}
                onViewEVouchers={() => navigate("/accounting/evouchers")}
              />
            </motion.div>

            {/* My Tasks — col 2, rows 1–2 (tall) */}
            <motion.div
              custom={1}
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              className="flex flex-col min-h-0 md:col-start-2 md:row-start-1 md:row-span-2"
              style={{ height: "100%" }}
            >
              {userId && <TodoPanel userId={userId} />}
            </motion.div>

            {/* Continue Work — col 1, row 2 */}
            <motion.div
              custom={2}
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              className="md:col-start-1 md:row-start-2"
            >
              <JumpBackIn onNavigate={goTo} />
            </motion.div>

            {/* Dept Queue — full width, row 3 */}
            {hasDeptQueue && (
              <motion.div
                custom={3}
                variants={panelVariants}
                initial="hidden"
                animate="visible"
                className="col-span-full md:row-start-3"
              >
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
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
