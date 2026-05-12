import React, { useState } from "react";
import DOMPurify from "dompurify";
import { RotateCcw, Download, FileText, FileSpreadsheet, FileImage, File } from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { toast } from "sonner@2.0.3";
import type { ThreadMessage, ThreadAttachment } from "../../hooks/useThread";
import { EntityContextCard } from "./EntityContextCard";
import { NeuronModal } from "../ui/NeuronModal";

// ── Time helpers ─────────────────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  const abs = new Date(dateStr).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return `${abs} (just now)`;
  if (diffMins < 60) return `${abs} (${diffMins}m ago)`;
  if (diffHours < 24) return `${abs} (${diffHours}h ago)`;
  return abs;
}

// ── Avatar helpers ───────────────────────────────────────────────────────────

function getInitials(name?: string) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

// ── File type icon ───────────────────────────────────────────────────────────

/** Returns CSS-variable-based background + icon color for a given file. */
function fileIconTone(mimeType: string | null, fileName: string | null) {
  const ext = (fileName?.split(".").pop() ?? "").toLowerCase();
  const mime = mimeType ?? "";

  if (mime.includes("pdf") || ext === "pdf")
    return { bg: "var(--theme-status-danger-bg)", fg: "var(--theme-status-danger-fg)" };
  if (mime.includes("word") || ext === "doc" || ext === "docx")
    return { bg: "var(--neuron-semantic-info-bg)", fg: "var(--neuron-semantic-info)" };
  if (mime.includes("excel") || mime.includes("spreadsheet") || ext === "xls" || ext === "xlsx")
    return { bg: "var(--theme-status-success-bg)", fg: "var(--theme-status-success-fg)" };
  if (mime.includes("image") || ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp")
    return { bg: "var(--theme-status-warning-bg)", fg: "var(--theme-status-warning-fg)" };
  return { bg: "var(--theme-bg-surface-tint)", fg: "var(--theme-text-muted)" };
}

/** Returns the appropriate lucide icon for a given file type. */
function fileTypeIcon(mimeType: string | null, fileName: string | null, fg: string) {
  const ext = (fileName?.split(".").pop() ?? "").toLowerCase();
  const mime = mimeType ?? "";
  const style = { color: fg, flexShrink: 0 as const };
  if (mime.includes("pdf") || ext === "pdf") return <FileText size={16} style={style} />;
  if (mime.includes("word") || ext === "doc" || ext === "docx") return <FileText size={16} style={style} />;
  if (mime.includes("excel") || mime.includes("spreadsheet") || ext === "xls" || ext === "xlsx") return <FileSpreadsheet size={16} style={style} />;
  if (mime.includes("image") || ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp") return <FileImage size={16} style={style} />;
  return <File size={16} style={style} />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Body renderer — handles HTML (WYSIWYG) and legacy markdown ───────────────

function isHtmlBody(text: string): boolean {
  return /<[a-zA-Z][^>]*>/.test(text);
}

function sanitizeForDisplay(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

function renderBody(text: string): React.ReactNode {
  // Legacy markdown markers: **bold**, *italic*, ~~strikethrough~~, __underline__
  const regex = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|~~[^~\n]+~~|__[^_\n]+__)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const m = match[0];
    if (m.startsWith("**")) {
      nodes.push(<strong key={key++}>{m.slice(2, -2)}</strong>);
    } else if (m.startsWith("~~")) {
      nodes.push(<del key={key++}>{m.slice(2, -2)}</del>);
    } else if (m.startsWith("__")) {
      nodes.push(<u key={key++}>{m.slice(2, -2)}</u>);
    } else {
      nodes.push(<em key={key++}>{m.slice(1, -1)}</em>);
    }
    lastIndex = match.index + m.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length === 1 && typeof nodes[0] === "string" ? nodes[0] : <>{nodes}</>;
}

// ── Component ────────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: ThreadMessage;
  onRetract: () => void;
  /** "first" — renders body + attachments only, no header wrapper, for the initial message block */
  variant?: "default" | "first";
}

export function MessageBubble({ message, onRetract, variant = "default" }: MessageBubbleProps) {
  const { user } = useUser();
  const [isRetracting, setIsRetracting] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [retractOpen, setRetractOpen] = useState(false);
  const isOwn = message.sender_id === user?.id;

  const handleRetract = () => setRetractOpen(true);

  const handleRetractConfirm = async () => {
    setIsRetracting(true);
    const { error } = await supabase
      .from("ticket_messages")
      .update({ is_retracted: true, retracted_at: new Date().toISOString(), retracted_by: user?.id })
      .eq("id", message.id);
    setIsRetracting(false);
    if (error) { toast.error("Failed to retract message"); }
    else { toast.success("Message retracted"); onRetract(); }
  };

  const openFile = async (filePath: string, fileName: string) => {
    const { data } = await supabase.storage.from("ticket-files").createSignedUrl(filePath, 3600);
    if (data?.signedUrl) {
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = fileName;
      a.click();
    } else {
      toast.error("Could not generate download link");
    }
  };

  const handleDownloadAll = async (files: ThreadAttachment[]) => {
    for (const att of files) {
      if (att.file_path && att.file_name) await openFile(att.file_path, att.file_name);
    }
  };

  // ── Retracted placeholder ────────────────────────────────────────────────

  if (message.is_retracted) {
    return (
      <div style={{ padding: "8px 28px", display: "flex", alignItems: "center", gap: 0 }}>
        <div style={{ flex: 1, height: 1, backgroundColor: "var(--theme-border-subtle)" }} />
        <p style={{ fontSize: 11, color: "var(--theme-text-muted)", fontStyle: "italic", padding: "0 14px", whiteSpace: "nowrap" }}>
          {message.sender_name} retracted a message ·{" "}
          {formatTime(message.retracted_at || message.created_at)}
        </p>
        <div style={{ flex: 1, height: 1, backgroundColor: "var(--theme-border-subtle)" }} />
      </div>
    );
  }

  const fileAttachments = (message.attachments || []).filter((a) => a.attachment_type === "file");
  const entityAttachments = (message.attachments || []).filter((a) => a.attachment_type === "entity");

  // ── First-message variant: body + attachments only, no header ────────────

  if (variant === "first") {
    return (
      <>
        {message.body && (
          isHtmlBody(message.body) ? (
            <div
              style={{
                fontSize: 14,
                color: "var(--theme-text-secondary)",
                lineHeight: 1.7,
                wordBreak: "break-word",
                margin: 0,
                marginBottom: (fileAttachments.length > 0 || entityAttachments.length > 0) ? 20 : 0,
              }}
              dangerouslySetInnerHTML={{ __html: sanitizeForDisplay(message.body) }}
            />
          ) : (
            <p
              style={{
                fontSize: 14,
                color: "var(--theme-text-secondary)",
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                margin: 0,
                marginBottom: (fileAttachments.length > 0 || entityAttachments.length > 0) ? 20 : 0,
              }}
            >
              {renderBody(message.body)}
            </p>
          )
        )}

        {fileAttachments.length > 0 && (
          <div style={{ marginBottom: entityAttachments.length > 0 ? 10 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--theme-text-muted)", letterSpacing: "0.3px" }}>
                {fileAttachments.length} {fileAttachments.length === 1 ? "Attachment" : "Attachments"}
              </span>
              {fileAttachments.length > 1 && (
                <button
                  onClick={() => handleDownloadAll(fileAttachments)}
                  style={{ fontSize: 11, fontWeight: 600, color: "var(--theme-action-primary-bg)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                >
                  Download All
                </button>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {fileAttachments.map((att) => {
                const tone = fileIconTone(att.file_mime_type, att.file_name);
                return (
                  <button
                    key={att.id}
                    onClick={() => att.file_path && att.file_name && openFile(att.file_path, att.file_name)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--theme-border-default)", backgroundColor: "var(--theme-bg-page)", cursor: "pointer", minWidth: 170, maxWidth: 240, textAlign: "left" }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--theme-text-muted)"; e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--theme-border-default)"; e.currentTarget.style.backgroundColor = "var(--theme-bg-page)"; }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 6, backgroundColor: tone.bg, border: `1px solid ${tone.fg}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {fileTypeIcon(att.file_mime_type, att.file_name, tone.fg)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 12, fontWeight: 500, color: "var(--theme-text-primary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {att.file_name || "File"}
                      </p>
                      {att.file_size && (
                        <p style={{ fontSize: 10, color: "var(--theme-text-muted)", margin: 0 }}>
                          {formatFileSize(att.file_size)}
                        </p>
                      )}
                    </div>
                    <Download size={13} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {entityAttachments.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {entityAttachments.map((att) => (
              <EntityContextCard
                key={att.id}
                entity_type={att.entity_type || ""}
                entity_id={att.entity_id || ""}
                entity_label={att.entity_label || att.entity_id || ""}
              />
            ))}
          </div>
        )}
      </>
    );
  }

  // ── Full message card ────────────────────────────────────────────────────

  return (
    <div
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      style={{
        padding: "20px 28px",
        borderBottom: "1px solid var(--theme-border-subtle)",
        backgroundColor: "var(--theme-bg-surface)",
        transition: "background-color 120ms ease",
      }}
    >
      {/* ── Header row ────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
        }}
      >
        {/* Left: avatar + sender info */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              backgroundColor: message.sender_avatar_url
                ? "transparent"
                : isOwn ? "var(--neuron-brand-green)" : "var(--theme-bg-surface-tint)",
              border: `1.5px solid ${isOwn ? "var(--theme-action-primary-border)" : "var(--theme-border-default)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: isOwn ? "#FFFFFF" : "var(--theme-text-secondary)",
              flexShrink: 0,
              letterSpacing: "0.3px",
              overflow: "hidden",
            }}
          >
            {message.sender_avatar_url ? (
              <img
                src={message.sender_avatar_url}
                alt={message.sender_name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              getInitials(message.sender_name)
            )}
          </div>

          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--theme-text-primary)", margin: 0, lineHeight: 1.3 }}>
              {message.sender_name || "Unknown"}
            </p>
            {message.sender_department && (
              <p style={{ fontSize: 11, color: "var(--theme-text-muted)", margin: 0, marginTop: 1, lineHeight: 1.3 }}>
                {message.sender_department}
              </p>
            )}
          </div>
        </div>

        {/* Right: timestamp + retract on hover */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {isOwn && showActions && !isRetracting && (
            <button
              onClick={handleRetract}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 5,
                border: "1px solid var(--theme-border-default)",
                backgroundColor: "var(--theme-bg-page)",
                color: "var(--theme-text-muted)",
                cursor: "pointer",
                transition: "color 120ms ease, border-color 120ms ease, background-color 120ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--theme-status-danger-fg)";
                e.currentTarget.style.borderColor = "var(--theme-status-danger-border)";
                e.currentTarget.style.backgroundColor = "var(--theme-status-danger-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--theme-text-muted)";
                e.currentTarget.style.borderColor = "var(--theme-border-default)";
                e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
              }}
              title="Retract this message"
            >
              <RotateCcw size={10} />
              Retract
            </button>
          )}
          <span style={{ fontSize: 11, color: "var(--theme-text-muted)", whiteSpace: "nowrap" }}>
            {formatTime(message.created_at)}
          </span>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────── */}
      {message.body && (
        <div style={{ paddingLeft: 46 }}>
          {isHtmlBody(message.body) ? (
            <div
              style={{
                fontSize: 13,
                color: "var(--theme-text-secondary)",
                lineHeight: 1.7,
                wordBreak: "break-word",
              }}
              dangerouslySetInnerHTML={{ __html: sanitizeForDisplay(message.body) }}
            />
          ) : (
            <p
              style={{
                fontSize: 13,
                color: "var(--theme-text-secondary)",
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                margin: 0,
              }}
            >
              {renderBody(message.body)}
            </p>
          )}
        </div>
      )}

      {/* ── File attachments ────────────────────────────────────── */}
      {fileAttachments.length > 0 && (
        <div style={{ paddingLeft: 46, marginTop: 14 }}>
          {/* Section header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--theme-text-muted)",
                letterSpacing: "0.3px",
              }}
            >
              {fileAttachments.length}{" "}
              {fileAttachments.length === 1 ? "Attachment" : "Attachments"}
            </span>
            {fileAttachments.length > 1 && (
              <button
                onClick={() => handleDownloadAll(fileAttachments)}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--theme-action-primary-bg)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  transition: "opacity 120ms ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              >
                Download All
              </button>
            )}
          </div>

          {/* File cards */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {fileAttachments.map((att) => {
              const tone = fileIconTone(att.file_mime_type, att.file_name);
              return (
                <button
                  key={att.id}
                  onClick={() =>
                    att.file_path && att.file_name && openFile(att.file_path, att.file_name)
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--theme-border-default)",
                    backgroundColor: "var(--theme-bg-page)",
                    cursor: "pointer",
                    transition: "color 120ms ease, border-color 120ms ease, background-color 120ms ease",
                    minWidth: 170,
                    maxWidth: 240,
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--theme-text-muted)";
                    e.currentTarget.style.backgroundColor = "var(--theme-bg-surface-subtle)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--theme-border-default)";
                    e.currentTarget.style.backgroundColor = "var(--theme-bg-page)";
                  }}
                >
                  {/* Colored file type icon badge */}
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 6,
                      backgroundColor: tone.bg,
                      border: `1px solid ${tone.fg}22`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {fileTypeIcon(att.file_mime_type, att.file_name, tone.fg)}
                  </div>

                  {/* File name + size */}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--theme-text-primary)",
                        margin: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        lineHeight: 1.4,
                      }}
                    >
                      {att.file_name || "File"}
                    </p>
                    {att.file_size && (
                      <p
                        style={{
                          fontSize: 10,
                          color: "var(--theme-text-muted)",
                          margin: 0,
                          lineHeight: 1.4,
                        }}
                      >
                        {formatFileSize(att.file_size)}
                      </p>
                    )}
                  </div>

                  <Download size={13} style={{ color: "var(--theme-text-muted)", flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Linked entity attachments ────────────────────────────── */}
      {entityAttachments.length > 0 && (
        <div
          style={{
            paddingLeft: 46,
            marginTop: fileAttachments.length > 0 ? 8 : 14,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {entityAttachments.map((att) => (
            <EntityContextCard
              key={att.id}
              entity_type={att.entity_type || ""}
              entity_id={att.entity_id || ""}
              entity_label={att.entity_label || att.entity_id || ""}
            />
          ))}
        </div>
      )}
      <NeuronModal
        isOpen={retractOpen}
        onClose={() => setRetractOpen(false)}
        title="Retract this message?"
        description="This will leave an audit placeholder visible to all participants and cannot be undone."
        confirmLabel="Retract Message"
        onConfirm={handleRetractConfirm}
        isLoading={isRetracting}
        variant="warning"
      />
    </div>
  );
}
