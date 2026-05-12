import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import ReactMarkdown from "react-markdown";
import DOMPurify from "dompurify";
import { supabase } from "../../utils/supabase/client";
import { toast } from "sonner@2.0.3";
import {
  Plus, ArrowLeft, Send, Loader2, X, Megaphone,
  Sparkles, TrendingUp, Wrench, Star, RotateCcw, Trash2,
  Bold, Italic, Code, List, ListOrdered,
  Heading1, Heading2, Heading3, Minus, Quote,
} from "lucide-react";
import type { Editor } from "@tiptap/react";

// ─── Types ────────────────────────────────────────────────────────────────────

type MemoType = "announcement" | "feature" | "improvement" | "fix";

interface Memo {
  id: string;
  title: string;
  body: string;
  memo_type: MemoType;
  module: string | null;
  is_featured: boolean;
  created_at: string;
  created_by_name?: string;
}

export interface MemoPanelProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  canWrite: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<MemoType, { label: string; icon: React.ElementType; bg: string; text: string }> = {
  announcement: { label: "Announcement", icon: Megaphone,   bg: "var(--neuron-status-accent-bg)",   text: "var(--neuron-status-accent-fg)" },
  feature:      { label: "New Feature",  icon: Sparkles,    bg: "var(--neuron-dept-bd-bg)",          text: "var(--neuron-dept-bd-text)" },
  improvement:  { label: "Improvement",  icon: TrendingUp,  bg: "var(--neuron-semantic-info-bg)",    text: "var(--neuron-semantic-info)" },
  fix:          { label: "Fix",          icon: Wrench,      bg: "var(--neuron-semantic-warn-bg)",    text: "var(--neuron-semantic-warn)" },
};

const MODULES = [
  "General", "Business Development", "Pricing",
  "Operations", "Accounting", "HR", "Admin",
];

const TYPE_OPTIONS: MemoType[] = ["announcement", "feature", "improvement", "fix"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
}

function getTimeGroup(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (diff < 7)  return "THIS WEEK";
  if (diff < 14) return "LAST WEEK";
  return new Date(iso).toLocaleDateString("en-PH", { month: "long", year: "numeric" }).toUpperCase();
}

// ─── MemoBody — renders both HTML (Tiptap) and legacy plain/markdown bodies ──

function MemoBody({ body, className }: { body: string; className?: string }) {
  const isHtml = body.trimStart().startsWith("<");
  return isHtml ? (
    <div
      className={`memo-body ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(body, { USE_PROFILES: { html: true } }) }}
    />
  ) : (
    <div className={`memo-body ${className ?? ""}`}>
      <ReactMarkdown>{body}</ReactMarkdown>
    </div>
  );
}

// ─── TypeBadge ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: MemoType }) {
  const cfg = TYPE_CONFIG[type];
  const Icon = cfg.icon;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "3px 8px", borderRadius: "20px",
      backgroundColor: cfg.bg, color: cfg.text,
      fontSize: "11px", fontWeight: 500,
    }}>
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

// ─── ReleaseCard ──────────────────────────────────────────────────────────────

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  return confirming ? (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <span style={{ fontSize: "11px", color: "var(--theme-status-danger-fg)", fontWeight: 500 }}>Delete?</span>
      <button onClick={onDelete}
        style={{ fontSize: "11px", fontWeight: 600, color: "var(--theme-status-danger-fg)", background: "var(--theme-status-danger-bg)", border: "1px solid var(--theme-status-danger-border)", borderRadius: "4px", padding: "2px 8px", cursor: "pointer" }}>
        Yes
      </button>
      <button onClick={() => setConfirming(false)}
        style={{ fontSize: "11px", color: "var(--neuron-ink-muted)", background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}>
        Cancel
      </button>
    </div>
  ) : (
    <button onClick={() => setConfirming(true)}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "5px", background: "none", border: "none", cursor: "pointer", color: "var(--neuron-ink-muted)", opacity: 0, transition: "opacity 0.1s" }}
      className="delete-btn"
    >
      <Trash2 size={13} />
    </button>
  );
}

function ReleaseCard({ memo, featured = false, onDelete }: { memo: Memo; featured?: boolean; onDelete?: () => void }) {
  return (
    <div
      className="memo-card-row"
      style={{
        padding: "18px 20px",
        borderRadius: "8px",
        backgroundColor: featured
          ? "color-mix(in oklch, var(--neuron-brand-green) 5%, var(--neuron-bg-elevated))"
          : "var(--neuron-bg-elevated)",
        border: "1px solid",
        borderColor: featured
          ? "color-mix(in oklch, var(--neuron-brand-green) 20%, var(--neuron-ui-border))"
          : "var(--neuron-ui-border)",
      }}
    >
      {memo.module && (
        <div style={{ fontSize: "11px", color: "var(--neuron-ink-muted)", marginBottom: "4px", fontWeight: 500 }}>
          {memo.module}
        </div>
      )}
      <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--neuron-ink-primary)", lineHeight: "22px", marginBottom: "8px" }}>
        {featured && (
          <Star size={12} style={{ display: "inline", marginRight: "6px", color: "var(--neuron-brand-green)", verticalAlign: "middle", marginBottom: "2px" }} />
        )}
        {memo.title}
      </div>
      {memo.body && (
        <MemoBody body={memo.body} className="memo-body--card" />
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <TypeBadge type={memo.memo_type} />
          <span style={{ fontSize: "11px", color: "var(--neuron-ink-muted)" }}>
            {formatDate(memo.created_at)}
            {memo.created_by_name && ` · ${memo.created_by_name}`}
          </span>
        </div>
        {onDelete && <DeleteButton onDelete={onDelete} />}
      </div>
    </div>
  );
}

// ─── FilterSidebar ────────────────────────────────────────────────────────────

interface FilterState {
  type: MemoType | "all";
  module: string | "all";
}

function FilterSidebar({
  filters, onChange, availableModules, hasActive,
}: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  availableModules: string[];
  hasActive: boolean;
}) {
  const RadioItem = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "4px 0", background: "none", border: "none",
        cursor: "pointer", textAlign: "left", width: "100%",
      }}
    >
      <span style={{
        width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
        border: active ? "4px solid var(--neuron-brand-green)" : "1.5px solid var(--neuron-ui-border)",
        backgroundColor: active ? "var(--neuron-brand-green-100, color-mix(in oklch, var(--neuron-brand-green) 10%, transparent))" : "transparent",
        transition: "border 0.12s ease",
      }} />
      <span style={{ fontSize: "13px", color: active ? "var(--neuron-ink-primary)" : "var(--neuron-ink-secondary)", fontWeight: active ? 500 : 400 }}>
        {label}
      </span>
    </button>
  );

  return (
    <div style={{ width: 200, flexShrink: 0, paddingRight: 24, paddingTop: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--neuron-ink-primary)" }}>Filters</span>
        {hasActive && (
          <button
            onClick={() => onChange({ type: "all", module: "all" })}
            style={{ display: "flex", alignItems: "center", gap: "3px", background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: "var(--neuron-brand-green)", fontWeight: 500, padding: 0 }}
          >
            <RotateCcw size={11} /> Reset
          </button>
        )}
      </div>
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--neuron-ink-muted)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "8px" }}>
          Release type
        </div>
        <RadioItem label="All releases" active={filters.type === "all"} onClick={() => onChange({ ...filters, type: "all" })} />
        {TYPE_OPTIONS.map(t => (
          <RadioItem key={t} label={TYPE_CONFIG[t].label} active={filters.type === t} onClick={() => onChange({ ...filters, type: t })} />
        ))}
      </div>
      {availableModules.length > 1 && (
        <div>
          <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--neuron-ink-muted)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "8px" }}>
            Module
          </div>
          <RadioItem label="All modules" active={filters.module === "all"} onClick={() => onChange({ ...filters, module: "all" })} />
          {availableModules.map(m => (
            <RadioItem key={m} label={m} active={filters.module === m} onClick={() => onChange({ ...filters, module: m })} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── RichToolbar ──────────────────────────────────────────────────────────────

type ToolbarGroup = Array<{
  title: string;
  icon: React.ElementType;
  action: (e: Editor) => void;
  isActive?: (e: Editor) => boolean;
}>;

const TOOLBAR_GROUPS: ToolbarGroup[] = [
  [
    { title: "Heading 1", icon: Heading1, action: e => e.chain().focus().toggleHeading({ level: 1 }).run(), isActive: e => e.isActive("heading", { level: 1 }) },
    { title: "Heading 2", icon: Heading2, action: e => e.chain().focus().toggleHeading({ level: 2 }).run(), isActive: e => e.isActive("heading", { level: 2 }) },
    { title: "Heading 3", icon: Heading3, action: e => e.chain().focus().toggleHeading({ level: 3 }).run(), isActive: e => e.isActive("heading", { level: 3 }) },
  ],
  [
    { title: "Bold",       icon: Bold,   action: e => e.chain().focus().toggleBold().run(),        isActive: e => e.isActive("bold") },
    { title: "Italic",     icon: Italic, action: e => e.chain().focus().toggleItalic().run(),      isActive: e => e.isActive("italic") },
    { title: "Code",       icon: Code,   action: e => e.chain().focus().toggleCode().run(),        isActive: e => e.isActive("code") },
    { title: "Blockquote", icon: Quote,  action: e => e.chain().focus().toggleBlockquote().run(), isActive: e => e.isActive("blockquote") },
  ],
  [
    { title: "Bullet list",   icon: List,         action: e => e.chain().focus().toggleBulletList().run(),  isActive: e => e.isActive("bulletList") },
    { title: "Numbered list", icon: ListOrdered,  action: e => e.chain().focus().toggleOrderedList().run(), isActive: e => e.isActive("orderedList") },
  ],
  [
    { title: "Separator", icon: Minus, action: e => e.chain().focus().setHorizontalRule().run() },
  ],
];

function RichToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "2px", padding: "5px 8px",
      borderBottom: "1px solid var(--neuron-ui-border)",
      background: "var(--neuron-bg-page)", flexShrink: 0,
    }}>
      {TOOLBAR_GROUPS.map((group, gi) => (
        <div key={gi} style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          {gi > 0 && (
            <div style={{ width: 1, height: 16, background: "var(--neuron-ui-border)", margin: "0 4px", flexShrink: 0 }} />
          )}
          {group.map(({ title, icon: Icon, action, isActive }) => {
            const active = isActive?.(editor) ?? false;
            return (
              <button
                key={title}
                title={title}
                type="button"
                onMouseDown={e => { e.preventDefault(); action(editor); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 28, height: 28, borderRadius: "5px", border: "none",
                  cursor: "pointer", flexShrink: 0,
                  background: active ? "color-mix(in oklch, var(--neuron-brand-green) 12%, transparent)" : "none",
                  color: active ? "var(--neuron-brand-green)" : "var(--neuron-ink-muted)",
                }}
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = "var(--neuron-state-hover)";
                    (e.currentTarget as HTMLElement).style.color = "var(--neuron-ink-primary)";
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = "none";
                    (e.currentTarget as HTMLElement).style.color = "var(--neuron-ink-muted)";
                  }
                }}
              >
                <Icon size={14} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── ComposeView ──────────────────────────────────────────────────────────────

interface Draft {
  title: string;
  body: string;
  memo_type: MemoType;
  module: string;
  is_featured: boolean;
}

const EMPTY_DRAFT: Draft = { title: "", body: "", memo_type: "announcement", module: "General", is_featured: false };

const INPUT_STYLE: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: "6px",
  border: "1px solid var(--neuron-ui-border)", fontSize: "13px",
  color: "var(--neuron-ink-primary)", background: "var(--neuron-bg-elevated)",
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: "11px", fontWeight: 600, color: "var(--neuron-ink-muted)",
  display: "block", marginBottom: "6px", letterSpacing: "0.05em", textTransform: "uppercase",
};

function ComposeView({
  draft, onChange, onPreview, onCancel,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onPreview: () => void;
  onCancel: () => void;
}) {
  // Refs keep onUpdate from closing over stale draft/onChange
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
      Placeholder.configure({ placeholder: "Describe what changed and why it matters to your team…" }),
    ],
    content: draft.body || "",
    onUpdate: ({ editor }) => {
      const html = editor.isEmpty ? "" : editor.getHTML();
      onChangeRef.current({ ...draftRef.current, body: html });
    },
  });

  const canPreview = !!(draft.title.trim() || (editor && !editor.isEmpty));

  return (
    <motion.div
      key="compose"
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
      style={{ width: "100%", display: "flex", flexDirection: "column", gap: "18px", flex: 1, minHeight: 0 }}
    >
      {/* Title */}
      <div>
        <label style={LABEL_STYLE}>Title</label>
        <input value={draft.title} onChange={e => onChange({ ...draft, title: e.target.value })}
          placeholder="e.g. Improved permissions and mobile fixes" style={INPUT_STYLE} autoFocus />
      </div>

      {/* Type + Module row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div>
          <label style={LABEL_STYLE}>Release type</label>
          <select value={draft.memo_type} onChange={e => onChange({ ...draft, memo_type: e.target.value as MemoType })}
            style={{ ...INPUT_STYLE, cursor: "pointer" }}>
            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>)}
          </select>
        </div>
        <div>
          <label style={LABEL_STYLE}>Module</label>
          <select value={draft.module} onChange={e => onChange({ ...draft, module: e.target.value })}
            style={{ ...INPUT_STYLE, cursor: "pointer" }}>
            {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Body — rich text editor */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <label style={LABEL_STYLE}>Body</label>
        <div style={{
          display: "flex", flexDirection: "column", flex: 1, minHeight: 0,
          border: "1px solid var(--neuron-ui-border)", borderRadius: "6px",
          overflow: "hidden", background: "var(--neuron-bg-elevated)",
        }}>
          <RichToolbar editor={editor} />
          <div className="memo-editor" style={{ flex: 1, overflowY: "auto", cursor: "text" }}
            onClick={() => editor?.chain().focus().run()}>
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {/* Featured toggle */}
      <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
        <button
          type="button"
          onClick={() => onChange({ ...draft, is_featured: !draft.is_featured })}
          style={{
            width: 36, height: 20, borderRadius: 10, border: "none",
            backgroundColor: draft.is_featured ? "var(--neuron-brand-green)" : "var(--neuron-ui-border)",
            position: "relative", cursor: "pointer", transition: "background 0.15s ease", flexShrink: 0,
          }}
        >
          <span style={{
            position: "absolute", top: 2, left: draft.is_featured ? 18 : 2,
            width: 16, height: 16, borderRadius: "50%", backgroundColor: "#fff",
            transition: "left 0.15s ease",
          }} />
        </button>
        <span style={{ fontSize: "13px", color: "var(--neuron-ink-primary)" }}>Pin as featured</span>
        {draft.is_featured && <Star size={13} style={{ color: "var(--neuron-brand-green)" }} />}
      </label>

      {/* Actions */}
      <div style={{ display: "flex", gap: "10px", paddingTop: "4px" }}>
        <button onClick={onCancel}
          style={{ flex: 1, padding: "9px", borderRadius: "6px", border: "1px solid var(--neuron-ui-border)", background: "transparent", color: "var(--neuron-ink-secondary)", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}>
          Cancel
        </button>
        <button onClick={onPreview} disabled={!canPreview}
          style={{ flex: 2, padding: "9px", borderRadius: "6px", border: "none", fontSize: "13px", fontWeight: 500, cursor: canPreview ? "pointer" : "not-allowed",
            backgroundColor: canPreview ? "var(--neuron-brand-green)" : "var(--neuron-ui-border)",
            color: canPreview ? "#fff" : "var(--neuron-ink-muted)" }}>
          Preview
        </button>
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MemoPanel({ isOpen, onClose, userId, canWrite }: MemoPanelProps) {
  const [memos, setMemos]       = useState<Memo[]>([]);
  const [loading, setLoading]   = useState(false);
  const [view, setView]         = useState<"list" | "compose" | "preview">("list");
  const [draft, setDraft]       = useState<Draft>(EMPTY_DRAFT);
  const [publishing, setPublishing] = useState(false);
  const [filters, setFilters]   = useState<FilterState>({ type: "all", module: "all" });

  const fetchMemos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("memos")
      .select("id, title, body, memo_type, module, is_featured, created_at, users!created_by(name)")
      .eq("is_published", true)
      .order("created_at", { ascending: false });
    setMemos(
      (data ?? []).map((m: any) => ({
        id: m.id, title: m.title, body: m.body,
        memo_type: m.memo_type as MemoType,
        module: m.module ?? null,
        is_featured: m.is_featured,
        created_at: m.created_at,
        created_by_name: m.users?.name ?? undefined,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen) { fetchMemos(); setView("list"); setDraft(EMPTY_DRAFT); }
  }, [isOpen, fetchMemos]);

  const handleDelete = async (id: string) => {
    setMemos(prev => prev.filter(m => m.id !== id));
    const { error } = await supabase.from("memos").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); fetchMemos(); }
  };

  const handlePublish = async () => {
    if (!draft.title.trim()) { toast.error("Title is required"); return; }
    setPublishing(true);
    const { error } = await supabase.from("memos").insert({
      title: draft.title.trim(), body: draft.body,
      memo_type: draft.memo_type,
      module: draft.module || null,
      is_featured: draft.is_featured,
      is_published: true, created_by: userId,
    });
    setPublishing(false);
    if (error) { toast.error("Failed to publish"); return; }
    toast.success("Release note published");
    setDraft(EMPTY_DRAFT); setView("list"); fetchMemos();
  };

  const availableModules = useMemo(() =>
    [...new Set(memos.map(m => m.module).filter(Boolean))] as string[],
    [memos]
  );

  const filtered = useMemo(() => memos.filter(m => {
    if (filters.type !== "all" && m.memo_type !== filters.type) return false;
    if (filters.module !== "all" && m.module !== filters.module) return false;
    return true;
  }), [memos, filters]);

  const featured  = filtered.filter(m => m.is_featured);
  const releases  = filtered.filter(m => !m.is_featured);

  const grouped = useMemo(() => {
    const groups: { label: string; items: Memo[] }[] = [];
    const seen = new Map<string, Memo[]>();
    for (const m of releases) {
      const label = getTimeGroup(m.created_at);
      if (!seen.has(label)) { seen.set(label, []); groups.push({ label, items: seen.get(label)! }); }
      seen.get(label)!.push(m);
    }
    return groups;
  }, [releases]);

  const hasActiveFilters = filters.type !== "all" || filters.module !== "all";

  if (!isOpen) return null;

  const isComposing = view === "compose" || view === "preview";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
      style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--theme-bg-surface)" }}
    >
      {/* ── Page header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 32px 16px", borderBottom: "1px solid var(--neuron-ui-border)",
        flexShrink: 0, background: "var(--neuron-bg-elevated)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {isComposing && (
            <button onClick={() => setView(view === "preview" ? "compose" : "list")}
              style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--neuron-ink-muted)", fontSize: "13px", padding: "4px 0" }}>
              <ArrowLeft size={15} /> Back
            </button>
          )}
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 600, color: "var(--neuron-ink-primary)", letterSpacing: "-0.02em", margin: 0, lineHeight: 1 }}>
              {isComposing ? (view === "preview" ? "Preview" : "New Release Note") : "Release Notes"}
            </h1>
            {!isComposing && (
              <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--neuron-ink-muted)" }}>
                Check back regularly for new releases and important announcements.
              </p>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {canWrite && !isComposing && (
            <button onClick={() => setView("compose")}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "7px", backgroundColor: "var(--neuron-brand-green)", color: "#fff", fontSize: "13px", fontWeight: 500, border: "none", cursor: "pointer" }}>
              <Plus size={14} /> New Release
            </button>
          )}
          {isComposing && view === "preview" && (
            <button onClick={handlePublish} disabled={publishing}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 16px", borderRadius: "7px", backgroundColor: "var(--neuron-brand-green)", color: "#fff", fontSize: "13px", fontWeight: 500, border: "none", cursor: publishing ? "not-allowed" : "pointer", opacity: publishing ? 0.7 : 1 }}>
              {publishing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {publishing ? "Publishing…" : "Publish"}
            </button>
          )}
          <button onClick={() => { setView("list"); onClose(); }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: "7px", background: "none", border: "none", cursor: "pointer", color: "var(--neuron-ink-muted)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--neuron-state-hover)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; }}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── Body — always two-column ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Filter sidebar */}
        <div style={{
          width: 220, flexShrink: 0, overflowY: "auto",
          borderRight: "1px solid var(--neuron-ui-border)",
          padding: "24px 20px 24px 32px",
        }}>
          <FilterSidebar
            filters={filters}
            onChange={setFilters}
            availableModules={availableModules}
            hasActive={hasActiveFilters}
          />
        </div>

        {/* Right content area */}
        <div style={{ flex: 1, overflowY: view === "compose" ? "hidden" : "auto", padding: "24px 32px", display: "flex", flexDirection: "column" }}>
          <AnimatePresence mode="wait">

            {/* Compose */}
            {view === "compose" && (
              <motion.div key="compose" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }} style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                <ComposeView draft={draft} onChange={setDraft} onPreview={() => setView("preview")} onCancel={() => setView("list")} />
              </motion.div>
            )}

            {/* Preview */}
            {view === "preview" && (
              <motion.div key="preview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}>
                <p style={{ fontSize: "12px", color: "var(--neuron-ink-muted)", marginBottom: "16px" }}>
                  This is how it will appear to all users.
                </p>
                <ReleaseCard memo={{ id: "preview", title: draft.title || "Untitled", body: draft.body, memo_type: draft.memo_type, module: draft.module || null, is_featured: draft.is_featured, created_at: new Date().toISOString() }} featured={draft.is_featured} />
                <button onClick={() => setView("compose")}
                  style={{ marginTop: "16px", padding: "8px 16px", borderRadius: "6px", border: "1px solid var(--neuron-ui-border)", background: "transparent", color: "var(--neuron-ink-primary)", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}>
                  Edit
                </button>
              </motion.div>
            )}

            {/* List */}
            {view === "list" && (
              <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}>
                {loading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
                    <Loader2 size={22} className="animate-spin" style={{ color: "var(--neuron-ink-muted)" }} />
                  </div>
                ) : filtered.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "80px 0", color: "var(--neuron-ink-muted)", fontSize: "14px" }}>
                    {hasActiveFilters
                      ? "No releases match the current filters."
                      : canWrite
                      ? <>No releases yet.<br />Click <strong>New Release</strong> to publish the first one.</>
                      : "No releases posted yet."}
                  </div>
                ) : (
                  <div>
                    {featured.length > 0 && (
                      <section style={{ marginBottom: "32px" }}>
                        <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--neuron-ink-primary)", marginBottom: "12px" }}>Featured</h2>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          {featured.map(m => <ReleaseCard key={m.id} memo={m} featured onDelete={canWrite ? () => handleDelete(m.id) : undefined} />)}
                        </div>
                      </section>
                    )}
                    {releases.length > 0 && (
                      <section>
                        <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--neuron-ink-primary)", marginBottom: "16px" }}>All Releases</h2>
                        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                          {grouped.map(({ label, items }) => (
                            <div key={label}>
                              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--neuron-ink-muted)", letterSpacing: "0.07em", marginBottom: "10px" }}>{label}</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "1px", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--neuron-ui-border)" }}>
                                {items.map((m, i) => (
                                  <div key={m.id} className="memo-list-row" style={{ backgroundColor: "var(--neuron-bg-elevated)", padding: "16px 20px", borderBottom: i < items.length - 1 ? "1px solid var(--neuron-ui-border)" : "none" }}>
                                    {m.module && <div style={{ fontSize: "11px", color: "var(--neuron-ink-muted)", marginBottom: "3px", fontWeight: 500 }}>{m.module}</div>}
                                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--neuron-ink-primary)", lineHeight: "20px", marginBottom: "6px" }}>{m.title}</div>
                                    {m.body && <MemoBody body={m.body} className="memo-body--list" />}
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <TypeBadge type={m.memo_type} />
                                        <span style={{ fontSize: "11px", color: "var(--neuron-ink-muted)" }}>{formatDate(m.created_at)}{m.created_by_name && ` · ${m.created_by_name}`}</span>
                                      </div>
                                      {canWrite && <DeleteButton onDelete={() => handleDelete(m.id)} />}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
