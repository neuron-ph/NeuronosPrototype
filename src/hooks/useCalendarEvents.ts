import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { queryKeys } from "../lib/queryKeys";
import { useUser } from "./useUser";
import { usePermission } from "../context/PermissionProvider";
import type {
  CalendarEvent,
  CalendarEventRow,
  CalendarEventFormData,
  CalendarEventParticipantRow,
} from "../types/calendar";
import { expandRRule } from "../components/calendar/utils/rruleUtils";

// ─── Fetch personal / team / department events ──────────────────────────────

export function useCalendarEvents(rangeStart: Date, rangeEnd: Date) {
  const startISO = rangeStart.toISOString();
  const endISO = rangeEnd.toISOString();
  // NEU-019 WG-07 (D2): edit/drag require the calendar:edit knob AND ownership —
  // previously isReadOnly was hardcoded false, letting any user edit anyone's event.
  const { user } = useUser();
  const { can } = usePermission();
  const canEditOwn = can("calendar", "edit");
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: [...queryKeys.calendar.events(startISO, endISO), userId, canEditOwn],
    queryFn: async (): Promise<CalendarEvent[]> => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .or(
          `and(start_at.lte.${endISO},end_at.gte.${startISO}),rrule.neq.null`
        )
        .order("start_at", { ascending: true });

      if (error) throw error;

      const rows = (data ?? []) as CalendarEventRow[];
      return expandCalendarRows(rows, rangeStart, rangeEnd, { userId, canEditOwn });
    },
    staleTime: 30_000,
  });
}

/** Convert DB rows into CalendarEvent[], expanding recurrence. */
function expandCalendarRows(
  rows: CalendarEventRow[],
  rangeStart: Date,
  rangeEnd: Date,
  perms: { userId: string | null; canEditOwn: boolean }
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const row of rows) {
    const editable = perms.canEditOwn && !!perms.userId && row.created_by === perms.userId;
    const base: Omit<CalendarEvent, "start" | "end"> = {
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      isAllDay: row.is_all_day,
      source: row.event_type,
      department: row.department ?? undefined,
      colorKey: row.color_override ?? row.department ?? "personal",
      isDraggable: row.event_type === "personal" && editable,
      isReadOnly: !editable,
      rrule: row.rrule ?? undefined,
      metadata: { location: row.location, created_by: row.created_by },
    };

    if (row.rrule) {
      const occurrences = expandRRule(
        row.rrule,
        new Date(row.start_at),
        new Date(row.end_at),
        rangeStart,
        rangeEnd
      );
      for (const occ of occurrences) {
        events.push({ ...base, start: occ.start, end: occ.end });
      }
    } else {
      events.push({
        ...base,
        start: new Date(row.start_at),
        end: new Date(row.end_at),
      });
    }
  }

  return events;
}

// ─── Create event ───────────────────────────────────────────────────────────

export function useCreateCalendarEvent() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { can } = usePermission();

  return useMutation({
    mutationFn: async (form: CalendarEventFormData) => {
      if (!can("calendar", "create")) throw new Error("You don't have permission to create calendar events.");
      const startAt = combineDateAndTime(form.startDate, form.startTime, form.isAllDay);
      const endAt = combineDateAndTime(form.endDate, form.endTime, form.isAllDay);

      const { data, error } = await supabase
        .from("calendar_events")
        .insert({
          title: form.title,
          description: form.description || null,
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          is_all_day: form.isAllDay,
          event_type: form.eventType,
          department: form.eventType !== "personal" ? form.department : null,
          rrule: form.rrule || null,
          location: form.location || null,
          color_override: form.colorOverride || null,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Add participants for team events
      if (
        form.participantIds.length > 0 &&
        form.eventType !== "personal" &&
        data
      ) {
        const participants = form.participantIds.map((uid) => ({
          event_id: data.id,
          user_id: uid,
        }));
        await supabase
          .from("calendar_event_participants")
          .insert(participants);
      }

      // Add reminder if set
      if (form.reminderMinutes !== null && data) {
        await supabase.from("calendar_event_reminders").insert({
          event_id: data.id,
          remind_before: `${form.reminderMinutes} minutes`,
        });
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
    },
  });
}

// ─── Update event ───────────────────────────────────────────────────────────

export function useUpdateCalendarEvent() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { can } = usePermission();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<CalendarEventFormData>;
    }) => {
      // WG-07: knob + ownership — the .eq("created_by") filter makes the
      // ownership rule part of the write itself, not just the UI.
      if (!can("calendar", "edit") || !user?.id) throw new Error("You don't have permission to edit this event.");
      const payload: Record<string, unknown> = {};
      if (updates.title !== undefined) payload.title = updates.title;
      if (updates.description !== undefined)
        payload.description = updates.description || null;
      if (updates.location !== undefined)
        payload.location = updates.location || null;
      if (updates.rrule !== undefined) payload.rrule = updates.rrule || null;
      if (updates.colorOverride !== undefined)
        payload.color_override = updates.colorOverride || null;
      if (updates.isAllDay !== undefined) payload.is_all_day = updates.isAllDay;
      if (updates.eventType !== undefined) payload.event_type = updates.eventType;
      if (updates.department !== undefined) payload.department = updates.department;

      if (updates.startDate && updates.startTime !== undefined) {
        payload.start_at = combineDateAndTime(
          updates.startDate,
          updates.startTime!,
          updates.isAllDay ?? false
        ).toISOString();
      }
      if (updates.endDate && updates.endTime !== undefined) {
        payload.end_at = combineDateAndTime(
          updates.endDate,
          updates.endTime!,
          updates.isAllDay ?? false
        ).toISOString();
      }

      const { error } = await supabase
        .from("calendar_events")
        .update(payload)
        .eq("id", id)
        .eq("created_by", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
    },
  });
}

// ─── Delete event ───────────────────────────────────────────────────────────

export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { can } = usePermission();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!can("calendar", "delete") || !user?.id) throw new Error("You don't have permission to delete this event.");
      const { error } = await supabase
        .from("calendar_events")
        .delete()
        .eq("id", id)
        .eq("created_by", user.id); // WG-07: own events only
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
    },
  });
}

// ─── Reschedule (drag & drop) ───────────────────────────────────────────────

export function useRescheduleEvent() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { can } = usePermission();

  return useMutation({
    mutationFn: async ({
      id,
      newStart,
      newEnd,
    }: {
      id: string;
      newStart: Date;
      newEnd: Date;
    }) => {
      if (!can("calendar", "edit") || !user?.id) throw new Error("You don't have permission to move this event.");
      const { error } = await supabase
        .from("calendar_events")
        .update({
          start_at: newStart.toISOString(),
          end_at: newEnd.toISOString(),
        })
        .eq("id", id)
        .eq("created_by", user.id); // WG-07: own events only
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all() });
    },
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function combineDateAndTime(
  date: Date,
  time: string,
  isAllDay: boolean
): Date {
  const d = new Date(date);
  if (isAllDay) {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const [h, m] = time.split(":").map(Number);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}
