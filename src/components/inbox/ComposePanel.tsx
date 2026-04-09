import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Link2, Paperclip, FileText, Send, Save } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { logCreation } from "../../utils/activityLog";
import { toast } from "sonner@2.0.3";
import { RecordBrowser } from "./RecordBrowser";
import type { LinkedEntity } from "./RecordBrowser";
import { TICKET_PRIORITY_TONES, TICKET_TYPE_TONES, ticketToggleStyle } from "./ticketingTheme";
import { RecipientField, avatarColor, initials, DEPARTMENTS } from "./RecipientField";
import type { RecipientChip, UserOption } from "./RecipientField";

type MessageType = "fyi" | "request" | "approval";
type MessagePriority = "normal" | "urgent";

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

const TYPE_OPTIONS: { key: MessageType; label: string }[] = [
  { key: "fyi", label: "FYI" },
  { key: "request", label: "Request" },
  { key: "approval", label: "Approval" },
];

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
      { ticket_id: ticket.id, participant_type: "user", participant_user_id: user.id, participant_dept: null, role: "sender", added_by: user.id },
    ];
    recipients.forEach((r) => participantRows.push({
      ticket_id: ticket.id, participant_type: r.type,
      participant_user_id: r.type === "user" ? r.userId : null,
      participant_dept: r.type === "department" ? r.department : null,
      role: "to",
      added_by: user.id,
    }));
    ccRecipients.forEach((r) => participantRows.push({
      ticket_id: ticket.id, participant_type: r.type,
      participant_user_id: r.type === "user" ? r.userId : null,
      participant_dept: r.type === "department" ? r.department : null,
      role: "cc",
      added_by: user.id,
    }));
    const { error: pErr } = await supabase.from("ticket_participants").insert(participantRows);
    if (pErr) { toast.error("Failed to add recipients"); await supabase.from("tickets").delete().eq("id", ticket.id); return null; }

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
    try {
      const ticket = await createTicket("open");
      if (ticket) {
        const actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
        logCreation("ticket", ticket.id, ticket.subject ?? ticket.id, actor);
        toast.success("Message sent");
        onSent();
      }
    } catch (err) {
      console.error("Send failed:", err);
      toast.error("Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    try {
      const ticket = await createTicket("draft");
      if (ticket) {
        const actor = { id: user?.id ?? "", name: user?.name ?? "", department: user?.department ?? "" };
        logCreation("ticket", ticket.id, ticket.subject ?? ticket.id, actor);
        toast.success("Draft saved");
        onSent();
      }
    } catch (err) {
      console.error("Save draft failed:", err);
      toast.error("Failed to save draft");
    } finally {
      setIsSavingDraft(false);
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

