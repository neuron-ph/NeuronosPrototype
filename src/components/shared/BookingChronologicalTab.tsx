import { Fragment, useState } from "react";
import { Trash2, Plus, Pencil } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../hooks/useUser";
import { usePermission } from "../../context/PermissionProvider";
import { CustomDatePicker } from "../common/CustomDatePicker";
import { toast } from "sonner@2.0.3";

interface ChronoEntry {
  id: string;
  booking_id: string;
  user_id: string;
  user_name: string;
  department: string;
  subject: string;
  event_at: string;
  note: string;
  created_at: string;
}

interface BookingChronologicalTabProps {
  bookingId: string;
}

const TH_CLASS =
  "px-4 py-3 text-[11px] font-semibold text-[var(--theme-text-muted)] uppercase tracking-[0.002em] text-left";

const FIELD_CLASS =
  "w-full px-3 py-2.5 rounded-lg border bg-[var(--theme-bg-surface)] text-[13px] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-muted)] focus:border-[var(--theme-action-primary-border)] transition-colors";

// "datetime-local" needs a "YYYY-MM-DDTHH:mm" value in local time.
function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Split / recombine the "YYYY-MM-DDTHH:mm" value into separate date + time parts.
function getDatePart(value: string) {
  return value.split("T")[0] || "";
}

function getTimePart(value: string) {
  return value.split("T")[1]?.slice(0, 5) || "09:00";
}

function combineDateTime(datePart: string, timePart: string) {
  if (!datePart) return "";
  return `${datePart}T${timePart || "09:00"}`;
}

// Convert a stored ISO timestamp to a local "YYYY-MM-DDTHH:mm" value for editing.
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function dayKey(dateString: string): string {
  const d = new Date(dateString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayLabel(dateString: string): string {
  const d = new Date(dateString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(dateString) === dayKey(today.toISOString())) return "Today";
  if (dayKey(dateString) === dayKey(yesterday.toISOString())) return "Yesterday";
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function groupByDay(entries: ChronoEntry[]) {
  const groups: { key: string; label: string; items: ChronoEntry[] }[] = [];
  for (const entry of entries) {
    const key = dayKey(entry.event_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(entry);
    } else {
      groups.push({ key, label: dayLabel(entry.event_at), items: [entry] });
    }
  }
  return groups;
}

// ── Component ────────────────────────────────────────────────────────────────

export function BookingChronologicalTab({ bookingId }: BookingChronologicalTabProps) {
  const { user, session } = useUser();
  const { can } = usePermission();
  const canCreate = can("ops_bookings_chrono_tab", "create");
  const canEdit = can("ops_bookings_chrono_tab", "edit");
  const canDelete = can("ops_bookings_chrono_tab", "delete");

  const currentUserName =
    user?.name ||
    session?.user?.user_metadata?.name ||
    session?.user?.email ||
    "Unknown User";
  const currentUserDepartment = user?.department || "Operations";

  const queryClient = useQueryClient();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [eventAt, setEventAt] = useState(nowLocalInput());
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["booking_chrono_logs", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_chronological_logs")
        .select("*")
        .eq("booking_id", bookingId)
        .order("event_at", { ascending: false });
      if (error) return [] as ChronoEntry[];
      return (data || []) as ChronoEntry[];
    },
    staleTime: 30_000,
  });

  const groups = groupByDay(entries);
  const hasActions = canEdit || canDelete;
  const colCount = 3 + (hasActions ? 1 : 0);

  const openPanel = () => {
    setEditingId(null);
    setSubject("");
    setNote("");
    setEventAt(nowLocalInput());
    setIsPanelOpen(true);
  };

  const openEdit = (entry: ChronoEntry) => {
    setEditingId(entry.id);
    setSubject(entry.subject);
    setNote(entry.note || "");
    setEventAt(isoToLocalInput(entry.event_at));
    setIsPanelOpen(true);
  };

  const closeComposer = () => {
    setIsPanelOpen(false);
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !eventAt) {
      toast.error("Subject and date/time are required");
      return;
    }
    setIsSubmitting(true);
    try {
      const error = editingId
        ? (
            await supabase
              .from("booking_chronological_logs")
              .update({
                subject: subject.trim(),
                event_at: new Date(eventAt).toISOString(),
                note: note.trim(),
              })
              .eq("id", editingId)
          ).error
        : (
            await supabase.from("booking_chronological_logs").insert({
              booking_id: bookingId,
              user_id: session?.user?.id,
              user_name: currentUserName,
              department: currentUserDepartment,
              subject: subject.trim(),
              event_at: new Date(eventAt).toISOString(),
              note: note.trim(),
              created_at: new Date().toISOString(),
            })
          ).error;

      if (!error) {
        closeComposer();
        queryClient.invalidateQueries({ queryKey: ["booking_chrono_logs", bookingId] });
        toast.success(editingId ? "Entry updated" : "Entry logged");
      } else {
        toast.error(error.message || "Failed to save entry");
      }
    } catch (err) {
      console.error("Error saving chronological entry:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save entry");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("booking_chronological_logs")
      .delete()
      .eq("id", id);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ["booking_chrono_logs", bookingId] });
      toast.success("Entry deleted");
    } else {
      toast.error(error.message || "Failed to delete entry");
    }
  };

  const hasEntries = entries.length > 0;

  return (
    <div className="flex flex-col bg-[var(--theme-bg-surface)] p-12 min-h-[600px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[32px] font-semibold text-[var(--theme-text-primary)] mb-1 tracking-tight">
            Chronological Report
          </h1>
          <p className="text-[14px] text-[var(--theme-text-muted)]">
            Log events as they happen on this booking, in chronological order.
          </p>
        </div>
        {canCreate && !isPanelOpen && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openPanel}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[14px] font-medium text-[var(--theme-action-primary-text)] bg-[var(--theme-action-primary-bg)] hover:bg-[var(--theme-action-primary-border)] transition-colors"
            >
              <Plus size={16} />
              Log Entry
            </button>
          </div>
        )}
      </div>

      {/* Inline composer */}
      {isPanelOpen && (
        <div className="mb-6 border border-[var(--theme-border-default)] rounded-[10px] bg-[var(--theme-bg-surface)] p-5">
          <h3 className="text-[14px] font-semibold text-[var(--theme-text-primary)] mb-4">
            {editingId ? "Edit entry" : "New entry"}
          </h3>
          <div className="space-y-1.5">
            <label className="block text-[13px] font-medium text-[var(--theme-text-secondary)]">
              Subject <span className="text-[var(--theme-status-danger-fg)]">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="What happened?"
              autoFocus
              disabled={isSubmitting}
              className={FIELD_CLASS}
              style={{ borderColor: "var(--theme-border-default)" }}
            />
          </div>

          <div className="mt-4 space-y-1.5">
            <label className="block text-[13px] font-medium text-[var(--theme-text-secondary)]">
              When <span className="text-[var(--theme-status-danger-fg)]">*</span>
            </label>
            <div className="grid grid-cols-[1fr_160px] gap-3">
              <CustomDatePicker
                value={getDatePart(eventAt)}
                onChange={(date) => setEventAt(combineDateTime(date, getTimePart(eventAt)))}
                placeholder="Select date"
                minWidth="100%"
                disabled={isSubmitting}
              />
              <input
                type="time"
                value={getTimePart(eventAt)}
                onChange={(e) =>
                  setEventAt(combineDateTime(getDatePart(eventAt) || getDatePart(nowLocalInput()), e.target.value))
                }
                disabled={isSubmitting}
                className="w-full px-3 py-2.5 rounded-lg text-[13px] font-medium focus:!outline-none transition-colors"
                style={{
                  border: "1px solid var(--theme-border-default)",
                  backgroundColor: "var(--theme-bg-surface)",
                  color: "var(--theme-text-primary)",
                }}
              />
            </div>
          </div>

          <div className="mt-4 space-y-1.5">
            <label className="block text-[13px] font-medium text-[var(--theme-text-secondary)]">
              Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add detail (optional)"
              rows={3}
              disabled={isSubmitting}
              className={`${FIELD_CLASS} resize-y leading-relaxed`}
              style={{ borderColor: "var(--theme-border-default)" }}
            />
          </div>

          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={closeComposer}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-md text-[13px] font-medium text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-surface-tint)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!subject.trim() || !eventAt || isSubmitting}
              className="px-4 py-2 rounded-md text-[13px] font-medium text-[var(--theme-action-primary-text)] bg-[var(--theme-action-primary-bg)] hover:bg-[var(--theme-action-primary-border)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting
                ? editingId
                  ? "Saving…"
                  : "Logging…"
                : editingId
                  ? "Save Changes"
                  : "Log Entry"}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border border-[var(--theme-border-default)] rounded-[10px] overflow-hidden bg-[var(--theme-bg-surface)]">
        <table className="w-full border-collapse">
          <thead className="bg-[var(--theme-bg-surface)] border-b border-[var(--theme-border-default)]">
            <tr>
              <th className={TH_CLASS} style={{ width: 132 }}>When</th>
              <th className={TH_CLASS}>Entry</th>
              <th className={TH_CLASS} style={{ width: 200 }}>Logged by</th>
              {hasActions && (
                <th className={`${TH_CLASS} text-center`} style={{ width: 120 }}>Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--theme-border-default)]">
            {/* Empty state */}
            {!isLoading && !hasEntries && (
              <tr>
                <td colSpan={colCount} className="px-6 py-12 text-center text-[13px] text-[var(--theme-text-muted)]">
                  No entries yet
                </td>
              </tr>
            )}

            {/* Logbook rows, grouped by day */}
            {!isLoading &&
              groups.map((group) => (
                <Fragment key={group.key}>
                  <tr className="bg-[var(--theme-bg-page)]">
                    <td
                      colSpan={colCount}
                      className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--theme-text-muted)]"
                    >
                      {group.label}
                    </td>
                  </tr>
                  {group.items.map((entry) => (
                    <tr
                      key={entry.id}
                      className="group hover:bg-[var(--theme-bg-surface-tint)] transition-colors"
                    >
                      <td className="px-4 py-4 align-top text-[12px] tabular-nums whitespace-nowrap text-[var(--theme-text-secondary)]">
                        {formatTime(entry.event_at)}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p className="text-[13px] font-medium leading-snug text-[var(--theme-text-primary)] break-words">
                          {entry.subject}
                        </p>
                        {entry.note && (
                          <p className="mt-1 text-[12px] leading-relaxed text-[var(--theme-text-secondary)] whitespace-pre-wrap break-words">
                            {entry.note}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 align-top text-[11px] text-[var(--theme-text-muted)] truncate">
                        {entry.user_name}
                      </td>
                      {hasActions && (
                        <td className="px-4 py-4 align-top">
                          <div className="flex items-center justify-center gap-2">
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => openEdit(entry)}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-[var(--theme-border-default)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-surface-tint)] hover:border-[var(--theme-action-primary-border)] transition-colors"
                                title="Edit entry"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => handleDelete(entry.id)}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-[var(--theme-border-default)] text-[var(--theme-status-danger-fg)] hover:bg-[var(--theme-status-danger-bg)] hover:border-[var(--theme-status-danger-border)] transition-colors"
                                title="Delete entry"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </Fragment>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
