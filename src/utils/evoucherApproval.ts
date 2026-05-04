import type { EVoucher } from "../types/evoucher";
import { supabase } from "./supabase/client";
import { recordNotificationEvent } from "./notifications";

type InlineApprovalResult = {
  billingError?: string;
};

type BillableEVInput = Partial<EVoucher> & {
  isBillable?: boolean;
  bookingId?: string;
  details?: { is_billable?: boolean | string } | null;
};

type EVoucherSubmitActor = {
  department?: string | null;
};

const isTrue = (value: unknown) => value === true || value === "true";

const isBillableEV = (ev: BillableEVInput) =>
  isTrue(ev.details?.is_billable) || isTrue(ev.is_billable) || isTrue(ev.isBillable);

const getBookingId = (ev: BillableEVInput) =>
  ev.booking_id ?? ev.bookingId ?? null;

export function determineSubmittedEVoucherStatus(
  context: string,
  actor?: EVoucherSubmitActor,
) {
  const actorDepartment = actor?.department?.trim().toLowerCase();

  if (context === "accounting" || actorDepartment === "executive") {
    return "pending_accounting";
  }

  return "pending_manager";
}

export async function ensureBillableExpenseBillingItem(
  ev: BillableEVInput,
): Promise<InlineApprovalResult> {
  if (!ev.id || !isBillableEV(ev) || !getBookingId(ev)) return {};

  const { data, error } = await supabase.rpc("ensure_billable_expense_billing_item", {
    p_evoucher_id: ev.id,
  });

  if (error) {
    console.error("Failed to ensure billable expense billing item", error);
    return { billingError: error.message };
  }

  if (data?.created === false && data.reason !== "already_exists") {
    return { billingError: `Billing item was not created: ${data.reason || "unknown reason"}` };
  }

  return {};
}

export async function approveEVInline(
  ev: EVoucher,
  isExecutive: boolean,
  userId: string | undefined,
  userName: string | undefined,
  department: string,
): Promise<InlineApprovalResult> {
  const nextStatus = isExecutive ? "pending_accounting" : "pending_ceo";
  const action = isExecutive
    ? "Approved by CEO / Executive"
    : "Approved by Team Leader / Manager";

  const { error } = await supabase
    .from("evouchers")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", ev.id);

  if (error) throw error;

  await supabase.from("evoucher_history").insert({
    id: `EH-${Date.now()}`,
    evoucher_id: ev.id,
    action,
    status: nextStatus,
    user_id: userId ?? null,
    user_name: userName ?? null,
    user_role: department,
    remarks: null,
    metadata: { previous_status: ev.status, new_status: nextStatus },
    created_at: new Date().toISOString(),
  });

  // Notify the EV creator that their voucher has advanced. If the EV moved to
  // pending_accounting, also notify accounting users so they can review.
  const summaryBase = {
    label: `E-Voucher ${ev.evoucher_number ?? ev.id} ${nextStatus === 'pending_accounting' ? 'pending accounting review' : 'advanced'}`,
    reference: ev.evoucher_number ?? undefined,
    from_status: ev.status,
    to_status: nextStatus,
    amount: ev.amount,
    currency: ev.currency,
  };

  void recordNotificationEvent({
    actorUserId: userId ?? null,
    module: 'accounting',
    subSection: 'evouchers',
    entityType: 'evoucher',
    entityId: ev.id,
    kind: 'status_changed',
    summary: summaryBase,
    recipientIds: [ev.created_by ?? null],
  });

  if (nextStatus === 'pending_accounting') {
    const { data: accountants } = await supabase
      .from('users')
      .select('id')
      .eq('department', 'Accounting')
      .eq('is_active', true);
    if (accountants && accountants.length > 0) {
      void recordNotificationEvent({
        actorUserId: userId ?? null,
        module: 'accounting',
        subSection: 'evouchers',
        entityType: 'evoucher',
        entityId: ev.id,
        kind: 'submitted',
        summary: { ...summaryBase, label: `E-Voucher ${ev.evoucher_number ?? ev.id} pending accounting review` },
        recipientIds: accountants.map((a) => a.id),
      });
    }
  }

  if (!isExecutive) return {};

  return ensureBillableExpenseBillingItem(ev);
}
