import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveEVInline,
  determineSubmittedEVoucherStatus,
  ensureBillableExpenseBillingItem,
} from "./evoucherApproval";
import { supabase } from "./supabase/client";

vi.mock("./supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

const mockedSupabase = vi.mocked(supabase);

describe("approveEVInline", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedSupabase.from.mockImplementation((table: string) => {
      if (table === "evouchers") {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        } as any;
      }

      if (table === "evoucher_history") {
        return {
          insert: vi.fn(async () => ({ error: null })),
        } as any;
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    mockedSupabase.rpc.mockResolvedValue({ data: { created: true }, error: null } as any);
  });

  it("ensures a billable booking expense becomes a billing item after executive approval", async () => {
    await approveEVInline(
      {
        id: "ev-1",
        voucher_number: "EV-1",
        status: "pending_ceo",
        is_billable: true,
        booking_id: "BRK-2026-0002",
      } as any,
      true,
      "exec-1",
      "CEO",
      "Executive",
    );

    expect(mockedSupabase.rpc).toHaveBeenCalledWith("ensure_billable_expense_billing_item", {
      p_evoucher_id: "ev-1",
    });
  });

  it("does not call the billing RPC for manager approval", async () => {
    await approveEVInline(
      {
        id: "ev-1",
        voucher_number: "EV-1",
        status: "pending_manager",
        is_billable: true,
        booking_id: "BRK-2026-0002",
      } as any,
      false,
      "mgr-1",
      "Manager",
      "Operations",
    );

    expect(mockedSupabase.rpc).not.toHaveBeenCalled();
  });

  it("uses the details billable flag when the top-level field is false or absent", async () => {
    await ensureBillableExpenseBillingItem({
      id: "ev-1",
      is_billable: false,
      booking_id: "BRK-2026-0002",
      details: { is_billable: true },
    } as any);

    expect(mockedSupabase.rpc).toHaveBeenCalledWith("ensure_billable_expense_billing_item", {
      p_evoucher_id: "ev-1",
    });
  });

  it("reports RPC no-op reasons instead of treating them as success", async () => {
    mockedSupabase.rpc.mockResolvedValueOnce({
      data: { created: false, reason: "not_billable" },
      error: null,
    } as any);

    const result = await ensureBillableExpenseBillingItem({
      id: "ev-1",
      is_billable: true,
      booking_id: "BRK-2026-0002",
    } as any);

    expect(result.billingError).toContain("not_billable");
  });
});

describe("determineSubmittedEVoucherStatus", () => {
  it("sends Executive-created vouchers directly to Accounting for disbursement", () => {
    expect(
      determineSubmittedEVoucherStatus("personal", {
        department: "Executive",
      }),
    ).toBe("pending_accounting");
  });

  it("keeps non-Accounting, non-Executive vouchers in manager approval", () => {
    expect(
      determineSubmittedEVoucherStatus("operations", {
        department: "Operations",
      }),
    ).toBe("pending_manager");
  });

  it("keeps Accounting-created vouchers in the disbursement queue", () => {
    expect(determineSubmittedEVoucherStatus("accounting")).toBe("pending_accounting");
  });
});
