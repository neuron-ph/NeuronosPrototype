import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send, Paperclip, Link2, X, FileText } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { toast } from "sonner@2.0.3";
import { RecordBrowser } from "./RecordBrowser";
import type { LinkedEntity } from "./RecordBrowser";
import { RecipientField } from "./RecipientField";
import type { RecipientChip, UserOption } from "./RecipientField";

// ── Types ────────────────────────────────────────────────────────────────────

interface PendingAttachment {
  type: "file" | "entity";
  file?: File;
  entity_type?: string;
  entity_id?: string;
  entity_label?: string;
}

interface ComposeBoxProps {
  ticketId: string;
  toChips?: RecipientChip[];
  onSent: () => void;
  onClose?: () => void;
}

// ── Sanitize HTML before storage ─────────────────────────────────────────────

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/\s+on\w+="[^"]*"/gi, "")
    .replace(/\s+on\w+='[^']*'/gi, "")
    .replace(/href\s*=\s*"javascript:[^"]*"/gi, "");
}

// ── Component ────────────────────────────────────────────────────────────────

export function ComposeBox({ ticketId, toChips = [], onSent, onClose }: ComposeBoxProps) {
  const { user } = useUser();
  const [isSending, setIsSending] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [showEntityPicker, setShowEntityPicker] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [toRecipients, setToRecipients] = useState<RecipientChip[]>(toChips);
  const [ccRecipients, setCcRecipients] = useState<RecipientChip[]>([]);
  const [fmt, setFmt] = useState({ bold: false, italic: false, underline: false, strikeThrough: false });

  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-load all users for the Cc picker — include user?.id in key so it refetches once auth loads
  const { data: allUsers = [] } = useQuery<UserOption[]>({
    queryKey: ["compose_box_users", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("users").select("id, name, department").order("name");
      return ((data || []) as UserOption[]).filter((u) => u.id !== user?.id);
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const excludedCcIds = [...toRecipients.map((c) => c.id), ...ccRecipients.map((c) => c.id)];

  // ── Formatting ─────────────────────────────────────────────────────────────

  const updateFmt = () => {
    setFmt({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      strikeThrough: document.queryCommandState("strikeThrough"),
    });
  };

  const applyFormat = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false);
    updateFmt();
    setHasContent((editorRef.current?.innerText.trim().length ?? 0) > 0);
  };

  const handleEditorInput = () => {
    setHasContent((editorRef.current?.innerText.trim().length ?? 0) > 0);
    updateFmt();
  };

  // Strip external rich-text on paste; keep plain text only
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Attachments ────────────────────────────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const MAX = 25 * 1024 * 1024;
    const ALLOWED = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    for (const file of files) {
      if (file.size > MAX) { toast.error(`${file.name} exceeds 25MB limit`); continue; }
      if (!ALLOWED.includes(file.type)) { toast.error(`${file.name} is not a supported file type`); continue; }
      setAttachments((prev) => [...prev, { type: "file", file }]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleEntitySelect = (entities: LinkedEntity[]) => {
    setAttachments((prev) => {
      const next = [...prev];
      for (const entity of entities) {
        const already = next.some((a) => a.type === "entity" && a.entity_id === entity.entity_id);
        if (!already) next.push({ type: "entity", ...entity });
      }
      return next;
    });
    setShowEntityPicker(false);
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Send ───────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    const bodyHtml = sanitizeHtml(editorRef.current?.innerHTML ?? "");
    const bodyText = editorRef.current?.innerText.trim() ?? "";
    if (!bodyText || !user) return;

    setIsSending(true);
    try {
      const { data: msg, error: msgErr } = await supabase
        .from("ticket_messages")
        .insert({ ticket_id: ticketId, sender_id: user.id, body: bodyHtml })
        .select()
        .single();

      if (msgErr || !msg) { toast.error("Failed to send message"); setIsSending(false); return; }

      for (const att of attachments) {
        if (att.type === "file" && att.file) {
          const path = `tickets/${ticketId}/${msg.id}/${att.file.name}`;
          const { error: uploadErr } = await supabase.storage
            .from("ticket-files")
            .upload(path, att.file, { upsert: false });
          if (uploadErr) { toast.error(`Failed to upload ${att.file.name}`); continue; }
          await supabase.from("ticket_attachments").insert({
            ticket_id: ticketId, message_id: msg.id, attachment_type: "file",
            file_path: path, file_name: att.file.name, file_size: att.file.size,
            file_mime_type: att.file.type, uploaded_by: user.id,
          });
        } else if (att.type === "entity") {
          await supabase.from("ticket_attachments").insert({
            ticket_id: ticketId, message_id: msg.id, attachment_type: "entity",
            entity_type: att.entity_type, entity_id: att.entity_id,
            entity_label: att.entity_label, uploaded_by: user.id,
          });
        }
      }

      // Add any Cc'd participants to the thread
      if (ccRecipients.length > 0) {
        const ccRows = ccRecipients.map((cc) => ({
          ticket_id: ticketId,
          participant_type: cc.type,
          participant_user_id: cc.type === "user" ? cc.userId : null,
          participant_dept: cc.type === "department" ? cc.department : null,
          role: "cc",
          added_by: user.id,
        }));
        await supabase.from("ticket_participants").insert(ccRows);
      }

      await supabase
        .from("tickets")
        .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", ticketId);

      if (editorRef.current) editorRef.current.innerHTML = "";
      setHasContent(false);
      setAttachments([]);
      setCcRecipients([]);
      setShowCc(false);
      setFmt({ bold: false, italic: false, underline: false, strikeThrough: false });
      onSent();
    } catch (err) {
      console.error(err);
      toast.error("Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const canSend = hasContent && !isSending;

  return (
    <>
      <div
        style={{
          borderTop: "1px solid var(--theme-border-default)",
          backgroundColor: "var(--theme-bg-surface)",
          flexShrink: 0,
        }}
      >
        {/* ── Compose header ───────────────────────────────────── */}
        {onClose && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 28px 0" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--theme-text-secondary)" }}>Reply</span>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--theme-text-muted)", display: "flex", padding: 2 }}
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── Recipient area ────────────────────────────────────── */}
        <div style={{ padding: "0 28px" }}>
          {/* To row — editable */}
          <RecipientField
            label="To"
            chips={toRecipients}
            allUsers={allUsers}
            excludeIds={excludedCcIds}
            onAdd={(chip) => setToRecipients((prev) => prev.find((r) => r.id === chip.id) ? prev : [...prev, chip])}
            onRemove={(id) => setToRecipients((prev) => prev.filter((r) => r.id !== id))}
            action={
              !showCc ? (
                <button
                  onClick={() => setShowCc(true)}
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: "var(--theme-text-muted)",
                    padding: "2px 6px",
                    borderRadius: 4,
                    border: "1px solid var(--theme-border-default)",
                    backgroundColor: "var(--theme-bg-page)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--theme-text-secondary)"; e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-tint)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-text-muted)"; e.currentTarget.style.backgroundColor = "var(--theme-bg-page)"; }}
                >
                  Cc
                </button>
              ) : undefined
            }
          />

          {/* Cc row */}
          {showCc && (
            <RecipientField
              label="Cc"
              chips={ccRecipients}
              allUsers={allUsers}
              excludeIds={excludedCcIds}
              onAdd={(chip) => setCcRecipients((prev) => prev.find((r) => r.id === chip.id) ? prev : [...prev, chip])}
              onRemove={(id) => setCcRecipients((prev) => prev.filter((r) => r.id !== id))}
            />
          )}
        </div>

        {/* ── Pending attachments ───────────────────────────────── */}
        {attachments.length > 0 && (
          <div style={{ padding: "8px 28px 0", display: "flex", flexWrap: "wrap", gap: 6 }}>
            {attachments.map((att, idx) => (
              <span
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--theme-border-default)",
                  backgroundColor: "var(--theme-bg-page)",
                  fontSize: 12,
                  color: "var(--theme-text-secondary)",
                }}
              >
                {att.type === "entity" ? (
                  <>
                    <Link2 size={11} style={{ color: "var(--neuron-brand-green)" }} />
                    <span style={{ color: "var(--theme-text-muted)", fontSize: 10 }}>{att.entity_type}</span>
                    {att.entity_label}
                  </>
                ) : (
                  <>
                    <FileText size={11} style={{ color: "var(--theme-text-muted)" }} />
                    {att.file?.name}
                  </>
                )}
                <button
                  onClick={() => removeAttachment(idx)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--theme-text-muted)", padding: 0, display: "flex" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--neuron-accent-terracotta)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-text-muted)"; }}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* ── WYSIWYG editor ────────────────────────────────────── */}
        <div style={{ padding: "10px 28px 0", position: "relative" }}>
          {!hasContent && (
            <div
              style={{
                position: "absolute",
                top: 10,
                left: 28,
                pointerEvents: "none",
                fontSize: 13,
                color: "var(--theme-text-muted)",
                lineHeight: 1.65,
                userSelect: "none",
              }}
            >
              Write a reply…
            </div>
          )}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleEditorInput}
            onKeyUp={updateFmt}
            onMouseUp={updateFmt}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            style={{
              outline: "none",
              fontSize: 13,
              color: "var(--theme-text-primary)",
              lineHeight: 1.65,
              minHeight: 72,
              maxHeight: 200,
              overflowY: "auto",
              wordBreak: "break-word",
            }}
          />
        </div>

        {/* ── Formatting toolbar ───────────────────────────────── */}
        <div style={{ padding: "4px 28px 0", display: "flex", alignItems: "center", gap: 1 }}>
          {(
            [
              { label: "B", command: "bold",          btnStyle: { fontWeight: 700 } as React.CSSProperties,                title: "Bold" },
              { label: "I", command: "italic",        btnStyle: { fontStyle: "italic" } as React.CSSProperties,            title: "Italic" },
              { label: "U", command: "underline",     btnStyle: { textDecoration: "underline" } as React.CSSProperties,    title: "Underline" },
              { label: "S", command: "strikeThrough", btnStyle: { textDecoration: "line-through" } as React.CSSProperties, title: "Strikethrough" },
            ] as const
          ).map(({ label, command, btnStyle, title }) => {
            const isActive = fmt[command as keyof typeof fmt];
            return (
              <button
                key={label}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyFormat(command);
                }}
                title={title}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 26,
                  height: 26,
                  borderRadius: 5,
                  border: isActive ? "1px solid var(--theme-border-default)" : "none",
                  backgroundColor: isActive ? "var(--theme-bg-page)" : "transparent",
                  fontSize: 12,
                  color: isActive ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
                  cursor: "pointer",
                  ...btnStyle,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                    e.currentTarget.style.color = "var(--theme-text-secondary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--theme-text-muted)";
                  }
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: "var(--theme-border-subtle)", margin: "4px 28px 0" }} />

        {/* ── Bottom toolbar ────────────────────────────────────── */}
        <div
          style={{
            padding: "8px 28px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          {/* Left: attachment tools with labels */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <LabeledToolbarButton
              onClick={() => fileInputRef.current?.click()}
              icon={<Paperclip size={13} />}
              label="Attachment"
              title="Attach a file"
            />
            <LabeledToolbarButton
              onClick={() => setShowEntityPicker(true)}
              icon={<Link2 size={13} />}
              label="Link Entities"
              title="Link a system record"
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
              style={{ display: "none" }}
              onChange={handleFileSelect}
            />
          </div>

          {/* Right: send button only — no keyboard hint */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 16px",
              borderRadius: 7,
              border: "none",
              backgroundColor: canSend ? "var(--neuron-brand-green)" : "var(--neuron-ui-muted)",
              color: "#FFFFFF",
              fontSize: 13,
              fontWeight: 600,
              cursor: canSend ? "pointer" : "not-allowed",
              transition: "opacity 150ms ease, background-color 150ms ease",
              opacity: canSend ? 1 : 0.45,
            }}
            onMouseEnter={(e) => { if (canSend) e.currentTarget.style.opacity = "0.88"; }}
            onMouseLeave={(e) => { if (canSend) e.currentTarget.style.opacity = "1"; }}
          >
            <Send size={13} />
            {isSending ? "Sending…" : "Send now"}
          </button>
        </div>
      </div>

      <RecordBrowser
        isOpen={showEntityPicker}
        onLink={handleEntitySelect}
        onClose={() => setShowEntityPicker(false)}
        alreadyLinked={attachments.filter((a) => a.type === "entity" && a.entity_id).map((a) => a.entity_id!)}
      />
    </>
  );
}

// ── Labeled toolbar button ────────────────────────────────────────────────────

function LabeledToolbarButton({
  onClick,
  icon,
  label,
  title,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 9px",
        borderRadius: 6,
        border: "1px solid var(--theme-border-default)",
        backgroundColor: "transparent",
        color: "var(--theme-text-muted)",
        fontSize: 12,
        cursor: "pointer",
        transition: "color 120ms ease, border-color 120ms ease, background-color 120ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
        e.currentTarget.style.color = "var(--theme-text-secondary)";
        e.currentTarget.style.borderColor = "var(--theme-text-muted)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.color = "var(--theme-text-muted)";
        e.currentTarget.style.borderColor = "var(--theme-border-default)";
      }}
    >
      {icon}
      {label}
    </button>
  );
}
