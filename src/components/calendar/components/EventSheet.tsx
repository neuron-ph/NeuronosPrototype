import { useState, useEffect, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../../ui/sheet";
import { Trash2 } from "lucide-react@0.487.0";
import { toast } from "sonner@2.0.3";
import { useUsers } from "../../../hooks/useUsers";
import { useUser } from "../../../hooks/useUser";
import { usePermission } from "../../../context/PermissionProvider";
import {
  useCreateCalendarEvent,
  useUpdateCalendarEvent,
  useDeleteCalendarEvent,
} from "../../../hooks/useCalendarEvents";
import type {
  CalendarEvent,
  CalendarEventFormData,
  CalendarEventType,
  RecurrenceFormData,
} from "../../../types/calendar";
import { buildRRule, describeRRule } from "../utils/rruleUtils";
import { format } from "../utils/calendarDateUtils";

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  border: "1px solid var(--neuron-ui-border)",
  borderRadius: 8,
  padding: "0 12px",
  fontSize: 13,
  color: "var(--neuron-ink-primary)",
  backgroundColor: "var(--neuron-bg-elevated)",
  outline: "none",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  height: "auto",
  padding: "8px 12px",
  resize: "none",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "auto" as const,
};

interface EventSheetProps {
  open: boolean;
  onClose: () => void;
  editEvent?: CalendarEvent | null;
  preFillDate?: Date | null;
  preFillHour?: number;
}

const EVENT_TYPE_OPTIONS: { value: CalendarEventType; label: string }[] = [
  { value: "personal", label: "Personal" },
  { value: "team", label: "Team" },
  { value: "department", label: "Department" },
];

const RECURRENCE_PRESETS = [
  { value: "", label: "No repeat" },
  { value: "FREQ=DAILY", label: "Daily" },
  { value: "FREQ=WEEKLY", label: "Weekly" },
  { value: "FREQ=MONTHLY", label: "Monthly" },
  { value: "FREQ=YEARLY", label: "Yearly" },
  { value: "custom", label: "Custom..." },
];

const REMINDER_OPTIONS = [
  { value: null, label: "No reminder" },
  { value: 5, label: "5 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
];

export function EventSheet({
  open,
  onClose,
  editEvent,
  preFillDate,
  preFillHour,
}: EventSheetProps) {
  const { user } = useUser();
  const { users: allUsers } = useUsers();
  const { can } = usePermission();
  // WG-07: the sheet only opens in edit mode for own events (isReadOnly flag),
  // so the delete knob is the remaining check here.
  const canDeleteEvents = can("calendar", "delete");
  const createMutation = useCreateCalendarEvent();
  const updateMutation = useUpdateCalendarEvent();
  const deleteMutation = useDeleteCalendarEvent();

  const defaultDate = preFillDate ?? new Date();
  const defaultHour = preFillHour ?? 9;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState<CalendarEventType>("personal");
  const [startDate, setStartDate] = useState(
    format(defaultDate, "yyyy-MM-dd")
  );
  const [startTime, setStartTime] = useState(
    `${String(defaultHour).padStart(2, "0")}:00`
  );
  const [endDate, setEndDate] = useState(format(defaultDate, "yyyy-MM-dd"));
  const [endTime, setEndTime] = useState(
    `${String(defaultHour + 1).padStart(2, "0")}:00`
  );
  const [isAllDay, setIsAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [rrulePreset, setRrulePreset] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [department, setDepartment] = useState<string>(
    user?.department ?? "Business Development"
  );
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(15);

  const isEditing = !!editEvent;

  // Reset form when opening
  useEffect(() => {
    if (!open) return;

    if (editEvent) {
      setTitle(editEvent.title);
      setDescription(editEvent.description ?? "");
      setEventType(editEvent.source as CalendarEventType);
      setStartDate(format(editEvent.start, "yyyy-MM-dd"));
      setStartTime(format(editEvent.start, "HH:mm"));
      setEndDate(format(editEvent.end, "yyyy-MM-dd"));
      setEndTime(format(editEvent.end, "HH:mm"));
      setIsAllDay(editEvent.isAllDay);
      setLocation((editEvent.metadata?.location as string) ?? "");
      setRrulePreset(editEvent.rrule ?? "");
      setDepartment(editEvent.department ?? user?.department ?? "");
    } else {
      setTitle("");
      setDescription("");
      setEventType("personal");
      setStartDate(format(preFillDate ?? new Date(), "yyyy-MM-dd"));
      setStartTime(`${String(preFillHour ?? 9).padStart(2, "0")}:00`);
      setEndDate(format(preFillDate ?? new Date(), "yyyy-MM-dd"));
      setEndTime(
        `${String((preFillHour ?? 9) + 1).padStart(2, "0")}:00`
      );
      setIsAllDay(false);
      setLocation("");
      setRrulePreset("");
      setParticipantIds([]);
      setDepartment(user?.department ?? "Business Development");
      setReminderMinutes(15);
    }
  }, [open, editEvent, preFillDate, preFillHour, user?.department]);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Event title is required");
      return;
    }

    const rrule =
      rrulePreset === "custom" ? "" : rrulePreset;

    const formData: CalendarEventFormData = {
      title: title.trim(),
      description,
      startDate: new Date(startDate),
      startTime,
      endDate: new Date(endDate),
      endTime,
      isAllDay,
      eventType,
      department,
      location,
      rrule,
      participantIds,
      reminderMinutes,
      colorOverride: "",
    };

    try {
      if (isEditing && editEvent) {
        await updateMutation.mutateAsync({ id: editEvent.id, updates: formData });
        toast.success("Event updated");
      } else {
        await createMutation.mutateAsync(formData);
        toast.success("Event created");
      }
      onClose();
    } catch (err) {
      toast.error("Failed to save event");
    }
  };

  const handleDelete = async () => {
    if (!editEvent) return;
    try {
      await deleteMutation.mutateAsync(editEvent.id);
      toast.success("Event deleted");
      onClose();
    } catch {
      toast.error("Failed to delete event");
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] p-0 flex flex-col">
        <SheetHeader className="px-6 py-4" style={{ borderBottom: "1px solid var(--neuron-ui-border)" }}>
          <SheetTitle
            className="text-[16px] font-semibold"
            style={{ color: "var(--neuron-ink-primary)" }}
          >
            {isEditing ? "Edit Event" : "New Event"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Title */}
          <FormField label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              style={inputStyle}
              autoFocus
            />
          </FormField>

          {/* Event Type */}
          <FormField label="Type">
            <div
              className="flex rounded-[var(--neuron-radius-s)] p-0.5"
              style={{
                backgroundColor: "var(--theme-bg-surface-subtle)",
                border: "1px solid var(--neuron-ui-border)",
              }}
            >
              {EVENT_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setEventType(opt.value)}
                  className="flex-1 px-3 py-1 text-[13px] font-medium rounded transition-all duration-150"
                  style={{
                    backgroundColor:
                      eventType === opt.value
                        ? "var(--neuron-bg-elevated)"
                        : "transparent",
                    color:
                      eventType === opt.value
                        ? "var(--neuron-ink-primary)"
                        : "var(--neuron-ink-muted)",
                    boxShadow:
                      eventType === opt.value
                        ? "0 1px 2px rgba(0,0,0,0.05)"
                        : "none",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </FormField>

          {/* All Day Toggle */}
          <div className="flex items-center justify-between">
            <span
              className="text-[13px] font-medium"
              style={{ color: "var(--neuron-ink-primary)" }}
            >
              All day
            </span>
            <button
              type="button"
              onClick={() => setIsAllDay(!isAllDay)}
              className="relative rounded-full transition-colors duration-200"
              style={{
                width: 36,
                height: 20,
                backgroundColor: isAllDay
                  ? "var(--neuron-action-primary)"
                  : "var(--neuron-toggle-inactive-bg)",
              }}
            >
              <div
                className="absolute top-0.5 rounded-full bg-white transition-transform duration-200"
                style={{
                  width: 16,
                  height: 16,
                  transform: isAllDay ? "translateX(18px)" : "translateX(2px)",
                }}
              />
            </button>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Start">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={inputStyle}
              />
              {!isAllDay && (
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="neuron-input mt-1.5"
                />
              )}
            </FormField>
            <FormField label="End">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={inputStyle}
              />
              {!isAllDay && (
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="neuron-input mt-1.5"
                />
              )}
            </FormField>
          </div>

          {/* Recurrence */}
          <FormField label="Repeat">
            <select
              value={rrulePreset}
              onChange={(e) => setRrulePreset(e.target.value)}
              style={inputStyle}
            >
              {RECURRENCE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {rrulePreset && rrulePreset !== "custom" && (
              <p
                className="text-[11px] mt-1"
                style={{ color: "var(--neuron-ink-muted)" }}
              >
                {describeRRule(rrulePreset)}
              </p>
            )}
          </FormField>

          {/* Location */}
          <FormField label="Location">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location"
              style={inputStyle}
            />
          </FormField>

          {/* Description */}
          <FormField label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description"
              rows={3}
              style={textareaStyle}
            />
          </FormField>

          {/* Department (for team / department events) */}
          {eventType !== "personal" && (
            <FormField label="Department">
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                style={inputStyle}
              >
                {[
                  "Business Development",
                  "Pricing",
                  "Operations",
                  "Accounting",
                  "HR",
                  "Executive",
                ].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </FormField>
          )}

          {/* Participants (for team events) */}
          {eventType === "team" && (
            <FormField label="Participants">
              <div className="space-y-1 max-h-[160px] overflow-y-auto">
                {allUsers
                  .filter((u: any) => u.id !== user?.id)
                  .map((u: any) => (
                    <label
                      key={u.id}
                      className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors duration-100"
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor =
                          "var(--neuron-state-hover)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = "transparent")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={participantIds.includes(u.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setParticipantIds([...participantIds, u.id]);
                          } else {
                            setParticipantIds(
                              participantIds.filter((id) => id !== u.id)
                            );
                          }
                        }}
                        className="rounded"
                        style={{ accentColor: "var(--neuron-action-primary)" }}
                      />
                      <span
                        className="text-[13px]"
                        style={{ color: "var(--neuron-ink-primary)" }}
                      >
                        {u.name}
                      </span>
                      <span
                        className="text-[11px]"
                        style={{ color: "var(--neuron-ink-muted)" }}
                      >
                        {u.department}
                      </span>
                    </label>
                  ))}
              </div>
            </FormField>
          )}

          {/* Reminder */}
          <FormField label="Reminder">
            <select
              value={reminderMinutes ?? ""}
              onChange={(e) =>
                setReminderMinutes(
                  e.target.value === "" ? null : Number(e.target.value)
                )
              }
              style={inputStyle}
            >
              {REMINDER_OPTIONS.map((r) => (
                <option key={r.value ?? "none"} value={r.value ?? ""}>
                  {r.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-6 py-3"
          style={{ borderTop: "1px solid var(--neuron-ui-border)" }}
        >
          <div>
            {isEditing && canDeleteEvents && (
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-[var(--neuron-radius-s)] transition-colors duration-150"
                style={{ color: "var(--neuron-semantic-danger)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "var(--neuron-semantic-danger-bg)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <Trash2 size={14} />
                Delete
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-[13px] font-medium rounded-[var(--neuron-radius-s)] transition-colors duration-150"
              style={{
                border: "1px solid var(--neuron-ui-border)",
                color: "var(--neuron-ink-primary)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor =
                  "var(--neuron-state-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 text-[13px] font-medium rounded-[var(--neuron-radius-s)] transition-colors duration-150"
              style={{
                backgroundColor: "var(--neuron-action-primary)",
                color: "var(--neuron-action-primary-text)",
                opacity: isSaving ? 0.6 : 1,
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor =
                  "var(--neuron-action-primary-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor =
                  "var(--neuron-action-primary)")
              }
            >
              {isSaving
                ? "Saving..."
                : isEditing
                  ? "Update Event"
                  : "Save Event"}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── FormField helper ────────────────────────────────────────────────────────

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-[12px] font-medium mb-1"
        style={{ color: "var(--neuron-ink-muted)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
