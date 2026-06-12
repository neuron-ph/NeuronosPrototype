import { describe, it, expect } from "vitest";
import { matchesTrigger } from "./resolveRouting";

describe("matchesTrigger", () => {
  it("matches a single equality trigger, case-insensitively", () => {
    expect(
      matchesTrigger(
        { booking_service_type: "Forwarding" },
        { booking_service_type: "forwarding" },
      ),
    ).toBe(true);
  });

  it("fails when the bag value differs", () => {
    expect(
      matchesTrigger(
        { booking_service_type: "Forwarding" },
        { booking_service_type: "Trucking" },
      ),
    ).toBe(false);
  });

  it("fails when the bag is missing the trigger key", () => {
    expect(matchesTrigger({ booking_service_type: "Forwarding" }, {})).toBe(false);
  });

  it("requires ALL trigger keys to match", () => {
    expect(
      matchesTrigger(
        { booking_service_type: "Forwarding", transaction_type: "expense" },
        { booking_service_type: "Forwarding", transaction_type: "budget_request" },
      ),
    ).toBe(false);
  });

  it("supports array membership", () => {
    expect(
      matchesTrigger(
        { booking_service_type: ["Forwarding", "Brokerage"] },
        { booking_service_type: "Brokerage" },
      ),
    ).toBe(true);
  });

  it("treats an empty trigger as a catch-all", () => {
    expect(matchesTrigger({}, { anything: 1 })).toBe(true);
  });

  it("routes the seeded forwarding rule to Pricing", () => {
    // mirrors the seeded rule in migration 205
    const rule = { booking_service_type: "Forwarding" };
    const forwardingEv = {
      transaction_type: "expense",
      requestor_department: "Operations",
      booking_service_type: "Forwarding",
    };
    const truckingEv = { ...forwardingEv, booking_service_type: "Trucking" };
    expect(matchesTrigger(rule, forwardingEv)).toBe(true);
    expect(matchesTrigger(rule, truckingEv)).toBe(false);
  });
});
