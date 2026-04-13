import { supabase } from "./supabase/client";
import { logCreation, type ActivityActor } from "./activityLog";

export type WorkflowRecordType =
  | "quotation"
  | "booking"
  | "project"
  | "invoice"
  | "collection"
  | "expense"
  | "budget_request";

export interface WorkflowTicketParams {
  subject: string;
  body: string;
  type: "fyi" | "request" | "approval";
  priority?: "normal" | "urgent";
  recipientDept?: string;       // department recipient (use when targeting a whole dept)
  recipientUserId?: string;     // individual user recipient (use for assignment notifications)
  linkedRecordType: WorkflowRecordType;
  linkedRecordId: string;
  linkedRecordLabel?: string;
  resolutionAction?: string;
  createdBy: string;
  createdByName: string;
  createdByDept: string;
  autoCreated?: boolean;
  actor?: ActivityActor;
}

/**
 * Creates a workflow-linked ticket routed to a department queue.
 * Returns the new ticket ID, or null on failure.
 */
export async function createWorkflowTicket(
  params: WorkflowTicketParams
): Promise<string | null> {
  const {
    subject,
    body,
    type,
    priority = "normal",
    recipientDept,
    recipientUserId,
    linkedRecordType,
    linkedRecordId,
    resolutionAction,
    createdBy,
    createdByName,
    createdByDept,
    autoCreated = false,
    actor,
  } = params;

  // 1. Create the ticket
  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .insert({
      subject,
      type,
      priority,
      status: "open",
      created_by: createdBy,
      linked_record_type: linkedRecordType,
      linked_record_id: linkedRecordId,
      resolution_action: resolutionAction ?? null,
      auto_created: autoCreated,
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (ticketError || !ticket) {
    console.error("createWorkflowTicket: failed to create ticket", ticketError);
    return null;
  }

  const ticketId = ticket.id;
  if (actor) {
    logCreation("ticket", ticketId, subject ?? ticketId, actor);
  }

  // 2. Add sender as participant
  await supabase.from("ticket_participants").insert({
    ticket_id: ticketId,
    participant_type: "user",
    participant_user_id: createdBy,
    participant_dept: null,
    role: "sender",
    added_by: createdBy,
  });

  // 3. Add recipient as participant (individual user or whole department)
  if (recipientUserId) {
    await supabase.from("ticket_participants").insert({
      ticket_id: ticketId,
      participant_type: "user",
      participant_user_id: recipientUserId,
      participant_dept: null,
      role: "to",
      added_by: createdBy,
    });
  } else if (recipientDept) {
    await supabase.from("ticket_participants").insert({
      ticket_id: ticketId,
      participant_type: "department",
      participant_user_id: null,
      participant_dept: recipientDept,
      role: "to",
      added_by: createdBy,
    });
  }

  // 4. Insert opening message
  const { data: message } = await supabase
    .from("ticket_messages")
    .insert({
      ticket_id: ticketId,
      sender_id: createdBy,
      body,
      is_system: false,
      is_retracted: false,
    })
    .select("id")
    .single();

  // 5. Attach the linked record as an entity attachment on the opening message
  if (message?.id) {
    await supabase.from("ticket_attachments").insert({
      ticket_id: ticketId,
      message_id: message.id,
      attachment_type: "entity",
      entity_type: params.linkedRecordType,
      entity_id: params.linkedRecordId,
      entity_label: params.linkedRecordLabel ?? params.linkedRecordId,
      uploaded_by: createdBy,
    });
  }

  return ticketId;
}

/**
 * Executes the resolution action when a workflow ticket is marked Done.
 * Maps action strings to database updates on the linked record.
 */
export async function executeResolutionAction(
  action: string,
  _linkedRecordType: string,
  linkedRecordId: string
): Promise<void> {
  switch (action) {
    case "set_quotation_priced":
      await supabase
        .from("quotations")
        .update({ status: "Priced" })
        .eq("id", linkedRecordId);
      break;

    case "set_quotation_pricing_in_progress":
      await supabase
        .from("quotations")
        .update({ status: "Pricing in Progress" })
        .eq("id", linkedRecordId);
      break;

    case "set_booking_billed":
      await supabase
        .from("bookings")
        .update({ billing_status: "billed" })
        .eq("id", linkedRecordId);
      break;

    case "mark_invoice_gl_posted":
      // Resolution handled inside InvoiceGLPostingSheet — ticket closes after GL post
      break;

    case "mark_collection_gl_posted":
      // Resolution handled inside CollectionGLPostingSheet — ticket closes after GL post
      break;

    default:
      console.warn("executeResolutionAction: unknown action", action);
  }
}

/**
 * Auto-fires a billing ticket to Accounting when a booking is marked Completed.
 * Safe to call unconditionally — skips silently if a ticket already exists.
 * Does not throw; ticket creation failure is non-blocking.
 */
export async function fireBillingTicketOnCompletion(params: {
  bookingId: string;
  bookingNumber: string;
  userId: string;
  userName: string;
  userDept: string;
}): Promise<void> {
  try {
    const existing = await getOpenWorkflowTicket("booking", params.bookingId);
    if (existing) return;

    await createWorkflowTicket({
      subject: `Create Billing: ${params.bookingNumber}`,
      body: `Booking ${params.bookingNumber} is now complete. Please create the billing documents.`,
      type: "request",
      priority: "normal",
      recipientDept: "Accounting",
      linkedRecordType: "booking",
      linkedRecordId: params.bookingId,
      resolutionAction: "set_booking_billed",
      createdBy: params.userId,
      createdByName: params.userName,
      createdByDept: params.userDept,
      autoCreated: true,
    });
  } catch (err) {
    console.error("fireBillingTicketOnCompletion: silent failure", err);
  }
}

/**
 * Auto-fires a GL posting ticket to Accounting when a collection is recorded.
 * Safe to call unconditionally — skips silently if a ticket already exists.
 */
export async function fireGLPostingTicketOnCollection(params: {
  collectionId: string;
  collectionRef: string;
  customerName: string;
  amount: number;
  userId: string;
  userName: string;
  userDept: string;
}): Promise<void> {
  try {
    const existing = await getOpenWorkflowTicket("collection", params.collectionId);
    if (existing) return;

    const formattedAmount = new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(params.amount);

    await createWorkflowTicket({
      subject: `Post to GL: ${params.collectionRef}`,
      body: `Collection of ${formattedAmount} from ${params.customerName} has been recorded. Please post the journal entry.`,
      type: "request",
      priority: "normal",
      recipientDept: "Accounting",
      linkedRecordType: "collection",
      linkedRecordId: params.collectionId,
      resolutionAction: "mark_collection_gl_posted",
      createdBy: params.userId,
      createdByName: params.userName,
      createdByDept: params.userDept,
      autoCreated: true,
    });
  } catch (err) {
    console.error("fireGLPostingTicketOnCollection: silent failure", err);
  }
}

/**
 * Auto-fires a collections follow-up ticket to Accounting when an invoice is GL-posted.
 * AR has been recognised — someone needs to follow up for collection.
 * Safe to call unconditionally — skips silently if a ticket already exists.
 */
export async function fireInvoiceARTicket(params: {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  totalAmount: number;
  userId: string;
  userName: string;
  userDept: string;
}): Promise<void> {
  try {
    const existing = await getOpenWorkflowTicket("invoice", params.invoiceId);
    if (existing) return;

    const formattedAmount = new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(params.totalAmount);

    await createWorkflowTicket({
      subject: `Follow Up: Invoice ${params.invoiceNumber}`,
      body: `Invoice ${params.invoiceNumber} for ${params.customerName} (${formattedAmount}) has been posted. Please follow up with the client for collection.`,
      type: "request",
      priority: "normal",
      recipientDept: "Accounting",
      linkedRecordType: "invoice",
      linkedRecordId: params.invoiceId,
      createdBy: params.userId,
      createdByName: params.userName,
      createdByDept: params.userDept,
      autoCreated: true,
    });
  } catch (err) {
    console.error("fireInvoiceARTicket: silent failure", err);
  }
}

/**
 * Auto-fires tickets when a BD user converts a quotation into a project.
 * Pricing managers get a "request" (they take ownership); BD managers get an "fyi" (visibility).
 * The converting user is excluded from the BD manager list to avoid self-notification.
 * Non-blocking — failures are logged silently.
 */
export async function fireProjectCreationTickets(params: {
  projectId: string;
  projectNumber: string;
  quotationNumber: string;
  customerName: string;
  userId: string;
  userName: string;
  userDept: string;
}): Promise<void> {
  try {
    const [{ data: pricingManagers }, { data: bdManagers }] = await Promise.all([
      supabase
        .from("users")
        .select("id, name")
        .eq("department", "Pricing")
        .eq("role", "manager")
        .eq("is_active", true),
      supabase
        .from("users")
        .select("id, name")
        .eq("department", "Business Development")
        .eq("role", "manager")
        .eq("is_active", true),
    ]);

    const pricingRecipients = (pricingManagers ?? []).map((u) => ({
      id: u.id as string,
      name: u.name as string,
      ticketType: "request" as const,
      body: `BD has converted Quotation ${params.quotationNumber} into Project ${params.projectNumber} for ${params.customerName}. Please take ownership and proceed with project execution.`,
    }));

    const bdRecipients = (bdManagers ?? [])
      .filter((u) => u.id !== params.userId)
      .map((u) => ({
        id: u.id as string,
        name: u.name as string,
        ticketType: "fyi" as const,
        body: `Quotation ${params.quotationNumber} for ${params.customerName} has been converted to Project ${params.projectNumber}.`,
      }));

    await Promise.all(
      [...pricingRecipients, ...bdRecipients].map((recipient) =>
        createWorkflowTicket({
          subject: `New Project: ${params.projectNumber} — ${params.customerName}`,
          body: recipient.body,
          type: recipient.ticketType,
          priority: "normal",
          recipientUserId: recipient.id,
          linkedRecordType: "project",
          linkedRecordId: params.projectId,
          linkedRecordLabel: params.projectNumber,
          createdBy: params.userId,
          createdByName: params.userName,
          createdByDept: params.userDept,
          autoCreated: true,
        })
      )
    );
  } catch (err) {
    console.error("fireProjectCreationTickets: silent failure", err);
  }
}

/**
 * Auto-fires assignment notification tickets to every team member assigned to a booking.
 * Sends an FYI ticket to the manager, supervisor (if set), and handler (if set).
 * Non-blocking — failures are logged silently.
 */
export async function fireBookingAssignmentTickets(params: {
  bookingId: string;
  bookingNumber: string;
  serviceType: string;
  customerName: string;
  createdBy: string;
  createdByName: string;
  createdByDept: string;
  manager: { id: string; name: string };
  supervisor?: { id: string; name: string } | null;
  handler?: { id: string; name: string } | null;
}): Promise<void> {
  try {
    const recipients: Array<{ id: string; name: string }> = [params.manager];
    if (params.supervisor?.id) recipients.push(params.supervisor as { id: string; name: string });
    if (params.handler?.id) recipients.push(params.handler as { id: string; name: string });

    const bookingRef = params.bookingNumber ? ` (${params.bookingNumber})` : "";

    await Promise.all(
      recipients.map((recipient) =>
        createWorkflowTicket({
          subject: `New ${params.serviceType} Booking — ${params.customerName}`,
          body: `You've been assigned to the ${params.serviceType} booking for ${params.customerName}${bookingRef}. Open the booking below to review the details and begin coordination.`,
          type: "fyi",
          priority: "normal",
          recipientUserId: recipient.id,
          linkedRecordType: "booking",
          linkedRecordId: params.bookingId,
          linkedRecordLabel: params.bookingNumber ?? `${params.serviceType} Booking`,
          createdBy: params.createdBy,
          createdByName: params.createdByName,
          createdByDept: params.createdByDept,
          autoCreated: true,
        })
      )
    );
  } catch (err) {
    console.error("fireBookingAssignmentTickets: silent failure", err);
  }
}

/**
 * Checks if an open workflow ticket already exists for a given record.
 * Prevents duplicate tickets from being created.
 */
export async function getOpenWorkflowTicket(
  linkedRecordType: string,
  linkedRecordId: string
): Promise<{ id: string; status: string } | null> {
  const { data } = await supabase
    .from("tickets")
    .select("id, status")
    .eq("linked_record_type", linkedRecordType)
    .eq("linked_record_id", linkedRecordId)
    .not("status", "in", '("done","archived","returned")')
    .maybeSingle();

  return data ?? null;
}
