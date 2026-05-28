import { describe, expect, it } from "vitest";
import { getAvailableBookingStatuses } from "./StatusSelector";

describe("getAvailableBookingStatuses", () => {
  it("allows a cancelled brokerage booking to move back to a valid brokerage status", () => {
    expect(getAvailableBookingStatuses("Cancelled", "Brokerage")).toEqual([
      "Draft",
      "Waiting for Arrival",
      "Ongoing",
      "Delivered",
      "Billed",
      "Paid",
      "Audited",
    ]);
  });

  it("allows a completed forwarding booking to move back to a valid forwarding status", () => {
    expect(getAvailableBookingStatuses("Completed", "Forwarding")).toEqual([
      "Draft",
      "Ongoing",
      "In Transit",
      "Delivered",
      "Billed",
      "Paid",
      "Cancelled",
    ]);
  });
});
