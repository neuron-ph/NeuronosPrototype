import { useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { useUser } from "../../hooks/useUser";
import { useCalendarView } from "../../hooks/useCalendarView";
import { useCalendarEvents, useRescheduleEvent } from "../../hooks/useCalendarEvents";
import { useCalendarAutoEvents } from "../../hooks/useCalendarAutoEvents";
import { mergeCalendarEvents } from "./utils/eventMerger";
import { CalendarToolbar } from "./CalendarToolbar";
import { CalendarGrid } from "./CalendarGrid";
import { CalendarRightSidebar } from "./components/CalendarRightSidebar";
import { EventSheet } from "./components/EventSheet";
import type { CalendarEvent, UpcomingDeadline, TeamMemberAvailability } from "../../types/calendar";
import { supabase } from "../../utils/supabase/client";
import { useQuery } from "@tanstack/react-query";

import { isPast, addDays } from "date-fns";

export function CalendarModule() {
  const { user } = useUser();
  const navigate = useNavigate();
  const reschedule = useRescheduleEvent();

  const {
    currentView,
    setCurrentView,
    currentDate,
    dateRange,
    toolbarTitle,
    navigate: navDate,
    goToDate,
    isEventSheetOpen,
    selectedEvent,
    slotPreFill,
    openNewEvent,
    openEditEvent,
    closeEventSheet,
    visibleTeamMemberIds,
    toggleTeamMember,
  } = useCalendarView();

  // Fetch events
  const { data: personalEvents = [] } = useCalendarEvents(
    dateRange.start,
    dateRange.end
  );
  const { data: autoEvents = [] } = useCalendarAutoEvents(
    dateRange.start,
    dateRange.end
  );

  // Merge all events
  const allEvents = useMemo(
    () => mergeCalendarEvents(personalEvents, autoEvents),
    [personalEvents, autoEvents]
  );

  // Heartbeat: update last_seen_at every 60s
  useEffect(() => {
    if (!user?.id) return;
    const update = () =>
      supabase
        .from("users")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", user.id);
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [user?.id]);

  // Team members for sidebar — resolved via team_memberships (canonical)
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["calendar", "team", user?.id],
    queryFn: async (): Promise<TeamMemberAvailability[]> => {
      if (!user?.id) return [];
      const { data: myMembership } = await supabase
        .from("team_memberships")
        .select("team_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!myMembership?.team_id) return [];

      const { data: members } = await supabase
        .from("team_memberships")
        .select("users!inner(id, name, avatar_url, department, last_seen_at, status)")
        .eq("team_id", myMembership.team_id)
        .eq("is_active", true)
        .neq("user_id", user.id);

      return ((members ?? []) as unknown as Array<{ users: { id: string; name: string; avatar_url: string | null; department: string; last_seen_at: string | null; status: string | null } }>)
        .map((m) => ({
          id:               m.users.id,
          name:             m.users.name,
          avatarUrl:        m.users.avatar_url,
          department:       m.users.department,
          isOnline:         !!m.users.last_seen_at && new Date(m.users.last_seen_at).getTime() > Date.now() - 5 * 60 * 1000,
          lastSeenAt:       m.users.last_seen_at ? new Date(m.users.last_seen_at) : null,
          isCalendarVisible: visibleTeamMemberIds.has(m.users.id),
        }));
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  // Upcoming deadlines for sidebar (next 14 days)
  const deadlines = useMemo((): UpcomingDeadline[] => {
    const now = new Date();
    const twoWeeks = addDays(now, 14);
    return autoEvents
      .filter((e) => e.start >= now || isPast(e.start))
      .filter((e) => e.start <= twoWeeks)
      .map((e) => ({
        id: e.id,
        label: e.title,
        entityRef: extractRef(e),
        date: e.start,
        deepLink: e.deepLink ?? "",
        source: e.source,
        colorKey: e.colorKey,
        isOverdue: isPast(e.start),
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 10);
  }, [autoEvents]);

  // Event handlers
  const handleSlotClick = useCallback(
    (date: Date, hour?: number) => {
      openNewEvent(date, hour);
    },
    [openNewEvent]
  );

  const handleEventClick = useCallback(
    (event: CalendarEvent) => {
      if (event.isReadOnly && event.deepLink) {
        navigate(event.deepLink);
      } else if (!event.isReadOnly) {
        openEditEvent(event);
      }
    },
    [navigate, openEditEvent]
  );

  const handleEventDrop = useCallback(
    (eventId: string, newStart: Date, newEnd: Date) => {
      reschedule.mutate({ id: eventId, newStart, newEnd });
    },
    [reschedule]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;

      switch (e.key) {
        case "t":
        case "T":
          navDate("today");
          break;
        case "n":
        case "N":
          openNewEvent();
          break;
        case "1":
          setCurrentView("day");
          break;
        case "2":
          setCurrentView("week");
          break;
        case "3":
          setCurrentView("month");
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navDate, openNewEvent, setCurrentView]);

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: "var(--neuron-bg-elevated)" }}
    >
      {/* Page Header */}
      <div
        className="px-6 pt-5 pb-4"
        style={{ backgroundColor: "var(--neuron-bg-elevated)" }}
      >
        <h1
          style={{
            fontSize: "32px",
            fontWeight: 600,
            color: "var(--theme-text-primary)",
            marginBottom: "4px",
            letterSpacing: "-1.2px",
          }}
        >
          Calendar
        </h1>
      </div>

      {/* Toolbar */}
      <CalendarToolbar
        title={toolbarTitle}
        currentView={currentView}
        currentDate={currentDate}
        onViewChange={setCurrentView}
        onNavigate={navDate}
        onDateSelect={goToDate}
        onNewEvent={() => openNewEvent()}
      />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Center: Calendar grid */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <CalendarGrid
            currentView={currentView}
            currentDate={currentDate}
            events={allEvents}
            onSlotClick={handleSlotClick}
            onEventClick={handleEventClick}
            onEventDrop={handleEventDrop}
          />
        </div>

        {/* Right sidebar */}
        <CalendarRightSidebar
          deadlines={deadlines}
          teamMembers={teamMembers}
          onToggleTeamMember={toggleTeamMember}
        />
      </div>

      {/* Event Sheet */}
      <EventSheet
        open={isEventSheetOpen}
        onClose={closeEventSheet}
        editEvent={selectedEvent}
        preFillDate={slotPreFill?.date}
        preFillHour={slotPreFill?.hour}
      />
    </div>
  );
}

/** Extract a reference number from an auto-pulled event title. */
function extractRef(event: CalendarEvent): string {
  const match = event.title.match(
    /(?:BKG|QTN|CTR|INV|TSK)-[\w-]+|[A-Z]+-\d+/
  );
  return match?.[0] ?? event.source;
}
