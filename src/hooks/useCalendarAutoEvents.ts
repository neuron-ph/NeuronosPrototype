import { useQuery } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { queryKeys } from "../lib/queryKeys";
import type { CalendarEvent } from "../types/calendar";

/**
 * Auto-pulls business entity dates (booking ETD/ETA, quotation validity,
 * contract expiry, task deadlines, invoice dates, CRM activities) and
 * normalizes them into CalendarEvent[] for the calendar grid.
 *
 * These events are read-only — single source of truth stays in the
 * original tables.
 */
export function useCalendarAutoEvents(rangeStart: Date, rangeEnd: Date) {
  const startISO = rangeStart.toISOString();
  const endISO = rangeEnd.toISOString();

  return useQuery({
    queryKey: queryKeys.calendar.autoEvents(startISO, endISO),
    queryFn: async (): Promise<CalendarEvent[]> => {
      const [bookings, quotations, tasks, invoices, crmActivities] =
        await Promise.all([
          fetchBookingEvents(startISO, endISO),
          fetchQuotationEvents(startISO, endISO),
          fetchTaskEvents(startISO, endISO),
          fetchInvoiceEvents(startISO, endISO),
          fetchCrmActivityEvents(startISO, endISO),
        ]);

      return [
        ...bookings,
        ...quotations,
        ...tasks,
        ...invoices,
        ...crmActivities,
      ].sort((a, b) => a.start.getTime() - b.start.getTime());
    },
    staleTime: 60_000,
  });
}

// ─── Bookings: ETD / ETA from JSONB details ─────────────────────────────────

async function fetchBookingEvents(
  startISO: string,
  endISO: string
): Promise<CalendarEvent[]> {
  // `department` is not a column on bookings — selecting it made PostgREST
  // reject the whole request with 42703, so this fetcher returned nothing and
  // no booking ETD/ETA ever reached the calendar, for any user. It went
  // unnoticed because the error was discarded along with the row set.
  const { data, error } = await supabase
    .from("bookings")
    .select("id, booking_number, customer_name, service_type, details, status")
    .not("details", "is", null);

  if (error) {
    // The sibling fetchers below still swallow their errors the same way.
    console.error("[calendar] booking events query failed", error);
    return [];
  }
  if (!data) return [];

  const events: CalendarEvent[] = [];
  for (const row of data) {
    const details =
      typeof row.details === "string" ? JSON.parse(row.details) : row.details;

    if (details?.etd) {
      const etdDate = new Date(details.etd);
      if (etdDate >= new Date(startISO) && etdDate <= new Date(endISO)) {
        events.push(
          makeAutoEvent({
            id: `bkg-etd-${row.id}`,
            title: `ETD: ${row.booking_number ?? "Booking"}`,
            date: etdDate,
            source: "booking",
            department: "Operations",
            // /operations/:bookingId resolves the service line and redirects.
            // Was `/operations/bookings?booking=<number>`, which matched
            // :bookingId with the literal "bookings" and rendered Not Found.
            deepLink: `/operations/${row.id}`,
            metadata: {
              customer: row.customer_name,
              service: row.service_type,
              status: row.status,
            },
          })
        );
      }
    }

    if (details?.eta) {
      const etaDate = new Date(details.eta);
      if (etaDate >= new Date(startISO) && etaDate <= new Date(endISO)) {
        events.push(
          makeAutoEvent({
            id: `bkg-eta-${row.id}`,
            title: `ETA: ${row.booking_number ?? "Booking"}`,
            date: etaDate,
            source: "booking",
            department: "Operations",
            // /operations/:bookingId resolves the service line and redirects.
            // Was `/operations/bookings?booking=<number>`, which matched
            // :bookingId with the literal "bookings" and rendered Not Found.
            deepLink: `/operations/${row.id}`,
            metadata: {
              customer: row.customer_name,
              service: row.service_type,
              status: row.status,
            },
          })
        );
      }
    }
  }

  return events;
}

// ─── Quotations: validity_date + contract expiry ────────────────────────────

async function fetchQuotationEvents(
  startISO: string,
  endISO: string
): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];

  // Spot quotation validity
  const { data: spots } = await supabase
    .from("quotations")
    .select(
      "id, quotation_number, customer_name, validity_date, status, quotation_type"
    )
    .eq("quotation_type", "standard")
    .not("validity_date", "is", null)
    .gte("validity_date", startISO)
    .lte("validity_date", endISO);

  for (const row of spots ?? []) {
    events.push(
      makeAutoEvent({
        id: `qtn-exp-${row.id}`,
        title: `Quote Expires: ${row.quotation_number ?? "Quotation"}`,
        date: new Date(row.validity_date),
        source: "quotation",
        department: "Pricing",
        deepLink: `/pricing/quotations?quotation=${row.quotation_number}`,
        metadata: { customer: row.customer_name, status: row.status },
      })
    );
  }

  // Contract expiry
  const { data: contracts } = await supabase
    .from("quotations")
    .select(
      "id, quotation_number, customer_name, contract_end_date, contract_status, quotation_type"
    )
    .eq("quotation_type", "contract")
    .not("contract_end_date", "is", null)
    .gte("contract_end_date", startISO)
    .lte("contract_end_date", endISO);

  for (const row of contracts ?? []) {
    events.push(
      makeAutoEvent({
        id: `ctr-exp-${row.id}`,
        title: `Contract Ends: ${row.quotation_number ?? "Contract"}`,
        date: new Date(row.contract_end_date),
        source: "quotation",
        department: "Pricing",
        deepLink: `/bd/contracts?contract=${row.quotation_number}`,
        metadata: {
          customer: row.customer_name,
          status: row.contract_status,
        },
      })
    );
  }

  return events;
}

// ─── Tasks: due_date ────────────────────────────────────────────────────────

async function fetchTaskEvents(
  startISO: string,
  endISO: string
): Promise<CalendarEvent[]> {
  const { data } = await supabase
    .from("tasks")
    .select("id, title, due_date, status, priority, owner_id")
    .not("due_date", "is", null)
    .gte("due_date", startISO)
    .lte("due_date", endISO);

  return (data ?? []).map((row) =>
    makeAutoEvent({
      id: `task-${row.id}`,
      title: `Task: ${row.title}`,
      date: new Date(row.due_date),
      source: "task",
      department: "Business Development",
      deepLink: `/bd/tasks`,
      metadata: { status: row.status, priority: row.priority },
    })
  );
}

// ─── Invoices: invoice_date ─────────────────────────────────────────────────

async function fetchInvoiceEvents(
  startISO: string,
  endISO: string
): Promise<CalendarEvent[]> {
  const { data } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, customer_name, invoice_date, status, total_amount"
    )
    .not("invoice_date", "is", null)
    .gte("invoice_date", startISO)
    .lte("invoice_date", endISO);

  return (data ?? []).map((row) =>
    makeAutoEvent({
      id: `inv-${row.id}`,
      title: `Invoice: ${row.invoice_number ?? "Invoice"}`,
      date: new Date(row.invoice_date),
      source: "invoice",
      department: "Accounting",
      deepLink: `/accounting/billings`,
      metadata: {
        customer: row.customer_name,
        status: row.status,
        amount: row.total_amount,
      },
    })
  );
}

// ─── CRM Activities: date ───────────────────────────────────────────────────

async function fetchCrmActivityEvents(
  startISO: string,
  endISO: string
): Promise<CalendarEvent[]> {
  const { data } = await supabase
    .from("crm_activities")
    .select("id, type, description, date, customer_id, user_id")
    .not("date", "is", null)
    .gte("date", startISO)
    .lte("date", endISO);

  return (data ?? []).map((row) =>
    makeAutoEvent({
      id: `crm-${row.id}`,
      title: `${row.type}: ${row.description?.slice(0, 50) ?? "Activity"}`,
      date: new Date(row.date),
      source: "crm_activity",
      department: "crm",
      deepLink: `/bd/activities`,
      metadata: { type: row.type },
    })
  );
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function makeAutoEvent(params: {
  id: string;
  title: string;
  date: Date;
  source: CalendarEvent["source"];
  department: string;
  deepLink: string;
  metadata?: Record<string, unknown>;
}): CalendarEvent {
  // Auto-pulled events are treated as all-day deadline markers
  const dayEnd = new Date(params.date);
  dayEnd.setHours(23, 59, 59, 999);

  return {
    id: params.id,
    title: params.title,
    start: params.date,
    end: dayEnd,
    isAllDay: true,
    source: params.source,
    department: params.department,
    colorKey: params.department,
    deepLink: params.deepLink,
    isDraggable: false,
    isReadOnly: true,
    metadata: params.metadata,
  };
}
