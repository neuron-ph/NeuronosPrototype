import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Link2, Paperclip, FileText, Send, Save, Building2 } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { logCreation } from "../../utils/activityLog";
import { toast } from "sonner@2.0.3";
import { RecordBrowser } from "./RecordBrowser";
import type { LinkedEntity } from "./RecordBrowser";
import { TICKET_AVATAR_TONES, TICKET_PRIORITY_TONES, TICKET_TYPE_TONES, ticketBadgeStyle, ticketToggleStyle } from "./ticketingTheme";

type MessageType = "fyi" | "request" | "approval";
type MessagePriority = "normal" | "urgent";

interface RecipientChip {
  id: string;
  label: string;
  type: "user" | "department";
  userId?: string;
  department?: string;
}

interface UserOption {
  id: string;
  name: string;
  department: string;
}

interface PendingAttachment {
  type: "file" | "entity";
  file?: File;
  entity_type?: string;
  entity_id?: string;
  entity_label?: string;
}

interface ComposePanelProps {
  onClose: () => void;
  onSent: () => void;
  initialEntity?: { entity_type: string; entity_id: string; entity_label: string };
  initialSubject?: string;
  initialRecipientDept?: string;
}

const DEPARTMENTS = [
  "Business Development", "Pricing", "Operations",
  "Accounting", "HR", "Executive",
];

const TYPE_OPTIONS: { key: MessageType; label: string }[] = [
  { key: "fyi", label: "FYI" },
  { key: "request", label: "Request" },
  { key: "approval", label: "Approval" },
];

function avatarColor(name: string) {
  return TICKET_AVATAR_TONES[name.charCodeAt(0) % TICKET_AVATAR_TONES.length];
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

// ── Main component ───────────────────────────────────────────────────────────

export function ComposePanel({ onClose, onSent, initialEntity, initialSubject, initialRecipientDept }: ComposePanelProps) {
  const { user } = useUser();
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [body, setBody] = useState("");
  const [type, setType] = useState<MessageType>("request");
  const [priority, setPriority] = useState<MessagePriority>("normal");
  const [recipients, setRecipients] = useState<RecipientChip[]>(
    initialRecipientDept
      ? [{ id: `dept-${initialRecipientDept}`, label: initialRecipientDept, type: "department", department: initialRecipientDept }]
      : []
  );
  const [ccRecipients, setCcRecipients] = useState<RecipientChip[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>(
    initialEntity
      ? [{ type: "entity", entity_type: initialEntity.entity_type, entity_id: initialEntity.entity_id, entity_label: initialEntity.entity_label }]
      : []
  );
  const [showCabinet, setShowCabinet] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  // Pre-load all users once on mount, filter current user client-side
  const { data: allUsers = [] } = useQuery({
    queryKey: ["ticket_participants", "all_users"],
    queryFn: async () => {
      const { data } = await supabase
        .from("users")
        .select("id, name, department")
        .order("name");
      return ((data || []) as UserOption[]).filter((u) => u.id !== user?.id);
    },
    staleTime: 0,
  });

  useEffect(() => {
    subjectRef.current?.focus();
  }, []);

  const addRecipient = useCallback((chip: RecipientChip, field: "to" | "cc") => {
    if (field === "to") {
      setRecipients((prev) => prev.find((r) => r.id === chip.id) ? prev : [...prev, chip]);
    } else {
      setCcRecipients((prev) => prev.find((r) => r.id === chip.id) ? prev : [...prev, chip]);
    }
  }, []);

  const removeRecipient = useCallback((id: string, field: "to" | "cc") => {
    if (field === "to") setRecipients((prev) => prev.filter((r) => r.id !== id));
    else setCcRecipients((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const MAX = 25 * 1024 * 1024;
    for (const file of files) {
      if (file.size > MAX) { toast.error(`${file.name} exceeds 25MB`); continue; }
      setAttachments((prev) => [...prev, { type: "file", file }]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCabinetLink = (entities: LinkedEntity[]) => {
    setAttachments((prev) => {
      const next = [...prev];
      for (const entity of entities) {
        if (!next.some((a) => a.type === "entity" && a.entity_id === entity.entity_id)) {
          next.push({ type: "entity", ...entity });
        }
      }
      return next;
    });
    setShowCabinet(false);
  };

  const createTicket = async (status: "open" | "draft") => {
    if (!user) return null;
    if (!subject.trim()) { toast.error("Subject is required"); return null; }
    if (status === "open" && recipients.length === 0) { toast.error("At least one recipient is required"); return null; }
    if (status === "open" && !body.trim()) { toast.error("Message body is required"); return null; }

    const { data: ticket, error: tErr } = await supabase
      .from("tickets")
      .insert({ subject: subject.trim(), type, priority, status, created_by: user.id })
      .select()
      .single();
    if (tErr || !ticket) { toast.error("Failed to create thread"); return null; }

    const participantRows: any[] = [
      { ticket_id: ticket.id, participant_type: "user", participant_user_id: user.id, participant_dept: null, role: "sender" },
    ];
    recipients.forEach((r) => participantRows.push({
      ticket_id: ticket.id, participant_type: r.type,
      participant_user_id: r.type === "user" ? r.userId : null,
      participant_dept: r.type === "department" ? r.department : null,
      role: "to",
    }));
    ccRecipients.forEach((r) => participantRows.push({
      ticket_id: ticket.id, participant_type: r.type,
      participant_user_id: r.type === "user" ? r.userId : null,
      participant_dept: r.type === "department" ? r.department : null,
      role: "cc",
    }));
    await supabase.from("ticket_participants").insert(participantRows);

    if (body.trim()) {
      const { data: msg } = await supabase
        .from("ticket_messages")
        .insert({ ticket_id: ticket.id, sender_id: user.id, body: body.trim() })
        .select()
        .single();
      if (msg) {
        for (const att of attachments) {
          if (att.type === "file" && att.file) {
            const path = `tickets/${ticket.id}/${msg.id}/${att.file.name}`;
            const { error: upErr } = await supabase.storage.from("ticket-files").upload(path, att.file);
            if (!upErr) {
              await supabase.from("ticket_attachments").insert({
                ticket_id: ticket.id, message_id: msg.id, attachment_type: "file",
                file_path: path, file_name: att.file.name, file_size: att.file.size,
                file_mime_type: att.file.type, uploaded_by: user.id,
              });
            }
          } else if (att.type === "entity") {
            await supabase.from("ticket_attachments").insert({
              ticket_id: ticket.id, message_id: msg.id, attachment_type: "entity",
              entity_type: att.entity_type, entity_id: att.entity_id,
              entity_label: att.entity_label, uploaded_by: user.id,
            });
          }
        }
      }
    }
    return ticket;
  };

  const handleSend = async () => {
    setIsSending(true);
    const ticket = await createTicket("open");
    setIsSending(false);
    if (ticket) {
      const actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
      logCreation("ticket", ticket.id, ticket.subject ?? ticket.id, actor);
      toast.success("Message sent");
      onSent();
    }
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    const ticket = await createTicket("draft");
    setIsSavingDraft(false);
    if (ticket) {
      const actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
      logCreation("ticket", ticket.id, ticket.subject ?? ticket.id, actor);
      toast.success("Draft saved");
      onSent();
    }
  };

  const allChipIds = [...recipients, ...ccRecipients].map((r) => r.id);
  const canSend = subject.trim() && recipients.length > 0 && body.trim() && !isSending;
  const canDraft = subject.trim() && !isSavingDraft;

  const linkedEntityIds = attachments.filter((a) => a.type === "entity" && a.entity_id).map((a) => a.entity_id!);

  return (
    <>
      <div className="ticketing-ui flex flex-col h-full" style={{ backgroundColor: "var(--theme-bg-surface)" }}>
        {/* Header */}
        <div style={{ padding: "16px 28px", borderBottom: "1px solid var(--theme-border-default)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--theme-text-primary)" }}>New Message</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveDraft}
              disabled={!canDraft}
              className="flex items-center gap-1.5 transition-colors duration-150"
              style={{
                padding: "6px 12px", borderRadius: 6, border: "1px solid var(--theme-border-default)",
                backgroundColor: "transparent", fontSize: 12, fontWeight: 500,
                color: canDraft ? "var(--theme-text-muted)" : "var(--neuron-ui-muted)", cursor: canDraft ? "pointer" : "not-allowed",
              }}
              onMouseEnter={(e) => { if (canDraft) e.currentTarget.style.backgroundColor = "var(--theme-bg-page)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <Save size={13} />
              {isSavingDraft ? "Saving…" : "Save Draft"}
            </button>
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="flex items-center gap-1.5 transition-all duration-150"
              style={{
                padding: "6px 14px", borderRadius: 6, border: "none",
                backgroundColor: canSend ? "var(--theme-action-primary-bg)" : "var(--neuron-ui-muted)",
                color: "#FFFFFF", fontSize: 12, fontWeight: 600,
                cursor: canSend ? "pointer" : "not-allowed",
              }}
            >
              <Send size={13} />
              {isSending ? "Sending…" : "Send"}
            </button>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--theme-text-muted)", display: "flex", padding: 4, marginLeft: 4 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--theme-text-secondary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-text-muted)"; }}
              title="Discard"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto" style={{ padding: "0 28px" }}>
          {/* Subject */}
          <div style={{ padding: "16px 0", borderBottom: "1px solid var(--theme-border-subtle)" }}>
            <input
              ref={subjectRef}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject *"
              style={{
                width: "100%", border: "none", outline: "none",
                fontSize: 18, fontWeight: 600, color: "var(--theme-text-primary)",
                backgroundColor: "transparent", letterSpacing: "-0.3px",
              }}
            />
          </div>

          {/* To */}
          <RecipientField
            label="To"
            chips={recipients}
            allUsers={allUsers}
            excludeIds={allChipIds}
            onAdd={(chip) => addRecipient(chip, "to")}
            onRemove={(id) => removeRecipient(id, "to")}
            action={
              !showCc ? (
                <button
                  onClick={() => setShowCc(true)}
                  style={{ fontSize: 11, color: "var(--theme-text-muted)", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--theme-action-primary-bg)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-text-muted)"; }}
                >
                  + CC
                </button>
              ) : undefined
            }
          />

          {/* CC */}
          {showCc && (
            <RecipientField
              label="CC"
              chips={ccRecipients}
              allUsers={allUsers}
              excludeIds={allChipIds}
              onAdd={(chip) => addRecipient(chip, "cc")}
              onRemove={(id) => removeRecipient(id, "cc")}
            />
          )}

          {/* Type */}
          <div style={{ padding: "14px 0", borderBottom: "1px solid var(--theme-border-subtle)" }}>
            <div className="flex items-center gap-3">
              <span style={{ fontSize: 12, color: "var(--theme-text-muted)", fontWeight: 500, width: 32, flexShrink: 0 }}>Type</span>
              <div className="flex gap-2">
                {TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setType(opt.key)}
                    style={ticketToggleStyle(type === opt.key, TICKET_TYPE_TONES[opt.key])}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Priority */}
          <div style={{ padding: "14px 0", borderBottom: "1px solid var(--theme-border-subtle)" }}>
            <div className="flex items-center gap-3">
              <span style={{ fontSize: 12, color: "var(--theme-text-muted)", fontWeight: 500, width: 32, flexShrink: 0 }}>Priority</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPriority("normal")}
                  style={ticketToggleStyle(priority === "normal", TICKET_PRIORITY_TONES.normal)}
                >
                  Normal
                </button>
                <button
                  onClick={() => setPriority("urgent")}
                  style={ticketToggleStyle(priority === "urgent", TICKET_PRIORITY_TONES.urgent)}
                >
                  Urgent
                </button>
              </div>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: "16px 0", minHeight: 240 }}>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message…"
              style={{
                width: "100%", resize: "none", border: "none", outline: "none",
                fontSize: 13, color: "var(--theme-text-primary)", lineHeight: 1.7,
                fontFamily: "inherit", backgroundColor: "transparent", minHeight: 200,
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (canSend) handleSend();
                }
              }}
            />
          </div>

          {/* Pending attachments */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pb-6">
              {attachments.map((att, idx) => (
                <span key={idx} className="flex items-center gap-1.5"
                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--neuron-ui-border)", backgroundColor: "var(--theme-bg-page)", fontSize: 12, color: "var(--neuron-ink-secondary)" }}>
                  {att.type === "entity"
                    ? <><Link2 size={11} style={{ color: "var(--neuron-brand-green)" }} />{att.entity_label}</>
                    : <><FileText size={11} style={{ color: "var(--theme-text-muted)" }} />{att.file?.name}</>}
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--theme-text-muted)", padding: 0, display: "flex" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--neuron-accent-terracotta)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-text-muted)"; }}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div style={{ padding: "10px 28px", borderTop: "1px solid var(--theme-border-default)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setShowCabinet((v) => !v)}
            className="flex items-center gap-1.5 transition-colors duration-150"
            style={{
              padding: "5px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer",
              border: showCabinet ? "1px solid var(--neuron-ui-active-border)" : "1px solid var(--neuron-ui-border)",
              backgroundColor: showCabinet ? "var(--neuron-state-selected)" : "transparent",
              color: showCabinet ? "var(--neuron-brand-green)" : "var(--neuron-ink-secondary)",
            }}
            onMouseEnter={(e) => { if (!showCabinet) { e.currentTarget.style.backgroundColor = "var(--theme-bg-page)"; e.currentTarget.style.color = "var(--theme-text-primary)"; } }}
            onMouseLeave={(e) => { if (!showCabinet) { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--theme-text-muted)"; } }}
          >
            <Link2 size={13} /> Link record
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 transition-colors duration-150"
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--theme-border-default)", backgroundColor: "transparent", fontSize: 12, color: "var(--theme-text-muted)", cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--theme-bg-page)"; e.currentTarget.style.color = "var(--theme-text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--theme-text-muted)"; }}
          >
            <Paperclip size={13} /> Attach file
          </button>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp" style={{ display: "none" }} onChange={handleFileSelect} />
          <span style={{ fontSize: 11, color: "var(--theme-text-muted)", marginLeft: 4 }}>Ctrl/Cmd+Enter to send</span>
        </div>
      </div>

      <RecordBrowser
        isOpen={showCabinet}
        onLink={handleCabinetLink}
        onClose={() => setShowCabinet(false)}
        alreadyLinked={linkedEntityIds}
      />
    </>
  );
}

// ── Recipient field ──────────────────────────────────────────────────────────

interface RecipientFieldProps {
  label: string;
  chips: RecipientChip[];
  allUsers: UserOption[];
  excludeIds: string[];
  onAdd: (chip: RecipientChip) => void;
  onRemove: (id: string) => void;
  action?: React.ReactNode;
}

function buildOptions(allUsers: UserOption[], query: string, excludeIds: string[]): { people: RecipientChip[]; depts: RecipientChip[] } {
  const q = query.trim().toLowerCase();

  const people = allUsers
    .filter((u) => !excludeIds.includes(u.id) && (!q || u.name.toLowerCase().includes(q) || (u.department || "").toLowerCase().includes(q)))
    .slice(0, 8)
    .map((u) => ({ id: u.id, label: u.name, type: "user" as const, userId: u.id, department: u.department }));

  const depts = DEPARTMENTS
    .filter((d) => !excludeIds.includes(`dept-${d}`) && (!q || d.toLowerCase().includes(q)))
    .map((d) => ({ id: `dept-${d}`, label: d, type: "department" as const, department: d }));

  return { people, depts };
}

function RecipientField({ label, chips, allUsers, excludeIds, onAdd, onRemove, action }: RecipientFieldProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { people, depts } = buildOptions(allUsers, query, excludeIds);
  const flatOptions = [...people, ...depts];

  const select = (chip: RecipientChip) => {
    onAdd(chip);
    setQuery("");
    setHighlightedIdx(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx((i) => Math.min(i + 1, flatOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flatOptions[highlightedIdx]) select(flatOptions[highlightedIdx]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    } else if (e.key === "Backspace" && query === "" && chips.length > 0) {
      onRemove(chips[chips.length - 1].id);
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    const el = dropdownRef.current?.querySelector(`[data-idx="${highlightedIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIdx]);

  // Reset highlight when results change
  useEffect(() => { setHighlightedIdx(0); }, [query, excludeIds.length]);

  const showDropdown = isOpen && (people.length > 0 || depts.length > 0);

  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${isOpen ? "var(--theme-status-success-border)" : "var(--theme-border-default)"}`, position: "relative", transition: "border-color 150ms ease" }}>
      <div className="flex items-start gap-3 flex-wrap">
        <span style={{ fontSize: 12, color: "var(--theme-text-muted)", fontWeight: 500, marginTop: 5, width: 32, flexShrink: 0 }}>{label}</span>
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {chips.map((chip) => {
            const col = chip.type === "user" ? avatarColor(chip.label) : { bg: "#EEF4F1", text: "#2E5147", border: "#D7E5E0" };
            return (
              <span key={chip.id} className="flex items-center gap-1.5"
                style={{ padding: "3px 8px 3px 4px", borderRadius: 6, border: `1px solid ${col.border}`, backgroundColor: col.bg, fontSize: 12, color: col.text, fontWeight: 500 }}>
                {chip.type === "user" ? (
                  <span style={{ width: 18, height: 18, borderRadius: "50%", backgroundColor: "var(--theme-bg-surface)", color: col.text, fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid ${col.border}` }}>
                    {initials(chip.label)}
                  </span>
                ) : (
                  <Building2 size={11} style={{ color: col.text, flexShrink: 0 }} />
                )}
                {chip.type === "department" ? `${chip.department} dept` : chip.label}
                <button onClick={() => onRemove(chip.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--theme-text-muted)", padding: 0, display: "flex" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--neuron-accent-terracotta)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-text-muted)"; }}
                >
                  <X size={11} />
                </button>
              </span>
            );
          })}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setTimeout(() => setIsOpen(false), 150)}
            onKeyDown={handleKeyDown}
            placeholder={chips.length === 0 ? "Search people or departments…" : ""}
            style={{ border: "none", outline: "none", fontSize: 13, color: "var(--theme-text-primary)", minWidth: 160, flex: 1, backgroundColor: "transparent" }}
          />
          {action}
        </div>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100,
            backgroundColor: "var(--theme-bg-surface)", border: "1px solid var(--theme-border-default)", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)", maxHeight: 280, overflowY: "auto",
          }}
        >
          {/* People group */}
          {people.length > 0 && (
            <>
              <div style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 700, color: "var(--theme-text-muted)", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                People
              </div>
              {people.map((r, i) => {
                const col = avatarColor(r.label);
                const isHighlighted = flatOptions[highlightedIdx]?.id === r.id;
                return (
                  <button
                    key={r.id}
                    data-idx={i}
                    onMouseDown={() => select(r)}
                    onMouseEnter={() => setHighlightedIdx(i)}
                    className="w-full flex items-center gap-3 text-left"
                    style={{
                      padding: "8px 12px", border: "none",
                      backgroundColor: isHighlighted ? "var(--theme-bg-surface-tint)" : "transparent",
                      cursor: "pointer", transition: "background-color 80ms ease",
                    }}
                  >
                    <span style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: col.bg, color: col.text, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {initials(r.label)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--theme-text-primary)", margin: 0 }}>{r.label}</p>
                      {r.department && <p style={{ fontSize: 11, color: "var(--theme-text-muted)", margin: 0 }}>{r.department}</p>}
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {/* Departments group */}
          {depts.length > 0 && (
            <>
              <div style={{ padding: `${people.length > 0 ? "8px" : "8px"} 12px 4px`, fontSize: 10, fontWeight: 700, color: "var(--theme-text-muted)", letterSpacing: "0.5px", textTransform: "uppercase", borderTop: people.length > 0 ? "1px solid var(--theme-border-subtle)" : "none" }}>
                Departments
              </div>
              {depts.map((r, i) => {
                const flatIdx = people.length + i;
                const isHighlighted = flatOptions[highlightedIdx]?.id === r.id;
                return (
                  <button
                    key={r.id}
                    data-idx={flatIdx}
                    onMouseDown={() => select(r)}
                    onMouseEnter={() => setHighlightedIdx(flatIdx)}
                    className="w-full flex items-center gap-3 text-left"
                    style={{
                      padding: "8px 12px", border: "none",
                      backgroundColor: isHighlighted ? "var(--theme-bg-surface-tint)" : "transparent",
                      cursor: "pointer", transition: "background-color 80ms ease",
                    }}
                  >
                    <span style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: "var(--theme-bg-surface-tint)", border: "1px solid var(--theme-status-success-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Building2 size={13} style={{ color: "var(--theme-action-primary-bg)" }} />
                    </span>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--theme-text-primary)", margin: 0 }}>{r.label}</p>
                      <p style={{ fontSize: 11, color: "var(--theme-text-muted)", margin: 0 }}>All managers</p>
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
