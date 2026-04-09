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
      sender_name: createdByName,
      sender_department: createdByDept,
      body,
      message_type: "user",
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
      body: `Booking ${params.bookingNumber} has been marked Completed. Please create the billing documents for this booking.`,
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
      subject: `Post to GL: Collection ${params.collectionRef}`,
      body: `Collection ${params.collectionRef} of ${formattedAmount} from ${params.customerName} has been recorded. Please post the journal entry (DR Cash / CR Accounts Receivable).`,
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
      subject: `Collect: Invoice ${params.invoiceNumber}`,
      body: `Invoice ${params.invoiceNumber} for ${params.customerName} (${formattedAmount}) has been posted to the GL — AR recognised. Please follow up with the client for collection.`,
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
